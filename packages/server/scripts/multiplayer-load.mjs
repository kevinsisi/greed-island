#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULTS = { base: 'http://127.0.0.1:4179', origin: 'http://127.0.0.1:4178', clients: 50, duration: 300, moveHz: 2, chatEvery: 10 }
const args = parseArgs(process.argv.slice(2))
const base = args.base.replace(/\/$/, '')
const startedAt = Date.now()
const counts = { successful: 0, failed: 0, commandLatenciesMs: [], sseChatLatenciesMs: [], sseEvents: 0, disconnects: 0 }
const chatSentAt = new Map()
const active = new Set()
const samples = []
let stopping = false

function parseArgs(argv) {
  const parsed = { ...DEFAULTS, serverPid: null }
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i]
    if (!['--base', '--origin', '--clients', '--duration', '--move-hz', '--chat-every', '--server-pid'].includes(name)) {
      throw new Error(`Unknown argument: ${name}`)
    }
    const value = argv[++i]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
    if (name === '--base') parsed.base = value
    else if (name === '--origin') parsed.origin = value
    else if (name === '--server-pid') parsed.serverPid = positiveInteger(value, name)
    else if (name === '--clients') parsed.clients = positiveInteger(value, name)
    else if (name === '--duration') parsed.duration = positiveInteger(value, name)
    else if (name === '--move-hz') parsed.moveHz = positiveNumber(value, name)
    else if (name === '--chat-every') parsed.chatEvery = positiveNumber(value, name)
  }
  if (parsed.clients < 2 || parsed.clients > 1000) throw new Error('--clients must be between 2 and 1000')
  const url = new URL(parsed.base)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('--base must use http or https')
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('--base must be an origin without a path, query, or fragment')
  const originUrl = new URL(parsed.origin)
  if ((originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') || originUrl.origin !== parsed.origin) {
    throw new Error('--origin must be an http(s) origin without a path, query, or fragment')
  }
  return parsed
}

function positiveInteger(value, name) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}
function positiveNumber(value, name) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`)
  return parsed
}

function recordRequest(ok) {
  if (ok) counts.successful += 1
  else counts.failed += 1
}

async function request(path, { method = 'GET', cookie, body, signal } = {}) {
  try {
    const response = await fetch(`${base}/mp-api/${path}`, {
      method,
      signal,
      headers: {
        origin: args.origin,
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    recordRequest(response.ok)
    return response
  } catch (error) {
    if (signal?.aborted) return null
    recordRequest(false)
    throw error
  }
}

function newCommand(type, payload = {}) {
  return { commandId: crypto.randomUUID(), type, payload }
}

async function login(clientNo, waitForRateWindow) {
  const username = `traveler-${clientNo}`
  const credentialsPath = process.env.GREED_ISLAND_FIXTURE_CREDENTIALS
  let password
  if (credentialsPath) {
    const { readFile } = await import('node:fs/promises')
    const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
    password = credentials.find(entry => entry.username === username)?.password
  } else {
    throw new Error('Set GREED_ISLAND_FIXTURE_CREDENTIALS to the private credentials.json path printed by the fixture server.')
  }
  if (!password) throw new Error(`No fixture credential found for ${username}`)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request('login', { method: 'POST', body: { username, password } })
    if (response?.status === 200) {
      const cookie = response.headers.get('set-cookie')?.split(';')[0]
      if (!cookie) throw new Error(`Login ${username} succeeded without a session cookie`)
      return cookie
    }
    if (response?.status === 429 && attempt === 0) {
      // The server intentionally caps login attempts per source IP at 20/minute.
      await waitForRateWindow()
      continue
    }
    throw new Error(`Login ${username} failed: HTTP ${response?.status ?? 'network error'}`)
  }
  throw new Error(`Login ${username} failed after the rate-limit wait`)
}

async function openStream(client, cookie) {
  const abort = new AbortController()
  const response = await request('stream', { cookie, signal: abort.signal })
  if (!response?.ok || !response.body) throw new Error(`SSE connection failed: HTTP ${response?.status ?? 'network error'}`)
  return { abort, reader: response.body.getReader(), buffer: '', seen: new Set() }
}

async function readStream(client) {
  const decoder = new TextDecoder()
  while (!stopping) {
    try {
      const result = await client.stream.reader.read()
      if (result.done) {
        if (stopping) return
        throw new Error('SSE stream ended')
      }
      client.stream.buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n')
      let boundary
      while ((boundary = client.stream.buffer.indexOf('\n\n')) >= 0) {
        const frame = client.stream.buffer.slice(0, boundary)
        client.stream.buffer = client.stream.buffer.slice(boundary + 2)
        if (!frame.split('\n').some(line => line.trim() === 'event: snapshot')) continue
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        const snapshot = JSON.parse(data)
        client.snapshot = snapshot
        counts.sseEvents += 1
        for (const message of snapshot.messages ?? []) {
          if (client.stream.seen.has(message.id)) continue
          client.stream.seen.add(message.id)
          const sent = chatSentAt.get(message.text)
          if (sent && sent.sender !== client.number) counts.sseChatLatenciesMs.push(Date.now() - sent.at)
        }
      }
    } catch {
      if (stopping) return
      counts.disconnects += 1
      try {
        client.stream.abort.abort()
        client.stream = await openStream(client, client.cookie)
      } catch {
        recordRequest(false)
        await delay(500)
      }
    }
  }
}

async function postCommand(client, type, payload = {}) {
  const sentAt = Date.now()
  const response = await request('command', {
    method: 'POST', cookie: client.cookie, body: newCommand(type, payload),
  })
  counts.commandLatenciesMs.push(Date.now() - sentAt)
  if (!response?.ok) return null
  return response
}

async function runClient(client, endsAt) {
  const intervalMs = 1000 / args.moveHz
  let nextChatAt = Date.now() + args.chatEvery * 1000
  let beaconContributionAttempted = false
  while (!stopping && Date.now() < endsAt) {
    const loopStarted = Date.now()
    try {
      const state = client.snapshot
      if (state) {
        const self = state.players.find(player => player.id === state.selfId)
        const dx = self ? state.beacon.x - self.x : 0
        const dz = self ? state.beacon.z - self.z : 0
        const distance = Math.hypot(dx, dz)
        await postCommand(client, 'move', distance > state.beacon.radius ? { dx: dx / distance, dz: dz / distance } : { dx: 0, dz: 0 })
        if (!beaconContributionAttempted && distance <= state.beacon.radius && !state.beacon.completed) {
          beaconContributionAttempted = true
          await postCommand(client, 'contribute')
        }
      }
      if (Date.now() >= nextChatAt) {
        const text = `load-${client.number}-${Date.now()}`
        chatSentAt.set(text, { sender: client.number, at: Date.now() })
        await postCommand(client, 'chat', { text })
        nextChatAt = Date.now() + args.chatEvery * 1000
      }
    } catch {
      // Failed requests are already counted by request(); retain the client loop for the remainder of the run.
    }
    await delay(Math.max(0, intervalMs - (Date.now() - loopStarted)))
  }
}

function sampleServer() {
  if (!args.serverPid) return
  try {
    const [cpuRaw, rssRaw] = execFileSync('ps', ['-p', String(args.serverPid), '-o', '%cpu=', '-o', 'rss='], { encoding: 'utf8' }).trim().split(/\s+/)
    const cpuPct = Number(cpuRaw)
    const rssKb = Number(rssRaw)
    if (Number.isFinite(cpuPct) && Number.isFinite(rssKb)) samples.push({ at: Date.now(), cpuPct, rssKb })
  } catch {
    samples.push({ at: Date.now(), unavailable: true })
  }
}

function percentile(values, pct) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(pct * sorted.length) - 1] ?? sorted.at(-1)
}

function summarizeSamples(key) {
  const values = samples.map(sample => sample[key]).filter(Number.isFinite)
  if (!values.length) return { average: null, max: null, sampleCount: 0 }
  return { average: values.reduce((sum, value) => sum + value, 0) / values.length, max: Math.max(...values), sampleCount: values.length }
}

async function main() {
  let lastLoginWindow = Date.now()
  const waitForRateWindow = async () => {
    const remaining = Math.max(0, lastLoginWindow + 60_100 - Date.now())
    if (remaining) await delay(remaining)
    lastLoginWindow = Date.now()
  }

  const clients = []
  for (let start = 1; start <= args.clients; start += 20) {
    if (start > 1) await waitForRateWindow()
    const batch = await Promise.all(Array.from({ length: Math.min(20, args.clients - start + 1) }, async (_, index) => {
      const number = start + index
      const cookie = await login(number, waitForRateWindow)
      const client = { number, cookie, snapshot: null, stream: null }
      client.stream = await openStream(client, cookie)
      return client
    }))
    clients.push(...batch)
    await Promise.all(clients.slice(start - 1).map(async client => { client.snapshot = await readInitialSnapshot(client) }))
  }

  for (const client of clients) active.add(readStream(client))
  sampleServer()
  const sampler = args.serverPid ? setInterval(sampleServer, 5_000) : undefined
  const endsAt = Date.now() + args.duration * 1000
  await Promise.all(clients.map(client => runClient(client, endsAt)))
  stopping = true
  if (sampler) clearInterval(sampler)
  for (const client of clients) {
    client.stream.abort.abort()
    await client.stream.reader.cancel().catch(() => undefined)
  }
  await Promise.allSettled([...active])

  const total = counts.successful + counts.failed
  const result = {
    base,
    clients: args.clients,
    durationSeconds: args.duration,
    moveHzPerClient: args.moveHz,
    chatEverySecondsPerClient: args.chatEvery,
    origin: args.origin,
    requests: {
      successful: counts.successful,
      failed: counts.failed,
      total,
      errorRate: total ? counts.failed / total : 0,
    },
    commandLatencyMs: {
      samples: counts.commandLatenciesMs.length,
      p50: percentile(counts.commandLatenciesMs, 0.50),
      p95: percentile(counts.commandLatenciesMs, 0.95),
      p99: percentile(counts.commandLatenciesMs, 0.99),
      max: counts.commandLatenciesMs.length ? Math.max(...counts.commandLatenciesMs) : null,
    },
    sse: {
      events: counts.sseEvents,
      chatDeliveryLatencyMs: {
        samples: counts.sseChatLatenciesMs.length,
        p50: percentile(counts.sseChatLatenciesMs, 0.50),
        p95: percentile(counts.sseChatLatenciesMs, 0.95),
        p99: percentile(counts.sseChatLatenciesMs, 0.99),
        max: counts.sseChatLatenciesMs.length ? Math.max(...counts.sseChatLatenciesMs) : null,
      },
      midRunDisconnects: counts.disconnects,
    },
    serverProcess: args.serverPid ? {
      pid: args.serverPid,
      cpuPercent: summarizeSamples('cpuPct'),
      rssKiB: summarizeSamples('rssKb'),
      samplesUnavailable: samples.filter(sample => sample.unavailable).length,
    } : null,
    elapsedSeconds: (Date.now() - startedAt) / 1000,
    interpretation: 'This is simulated connection load; it does not represent real-player mobile rendering performance.',
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

async function readInitialSnapshot(client) {
  const decoder = new TextDecoder()
  while (true) {
    const result = await client.stream.reader.read()
    if (result.done) throw new Error(`Initial SSE stream closed for client ${client.number}`)
    client.stream.buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n')
    const end = client.stream.buffer.indexOf('\n\n')
    if (end < 0) continue
    const frame = client.stream.buffer.slice(0, end)
    client.stream.buffer = client.stream.buffer.slice(end + 2)
    if (!frame.split('\n').some(line => line.trim() === 'event: snapshot')) continue
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    const snapshot = JSON.parse(data)
    for (const message of snapshot.messages ?? []) client.stream.seen.add(message.id)
    return snapshot
  }
}

main().catch(error => {
  process.stderr.write(`${error?.stack ?? String(error)}\n`)
  process.exitCode = 1
})
