#!/usr/bin/env node
// Operator-invoked functional checks only. Automatic deployment never runs this.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const LIVE_ORIGIN = 'https://greed.sisihome.org'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const key = point => `${point.x.toFixed(6)},${point.z.toFixed(6)}`
const distance = (one, two) => Math.hypot(one.x - two.x, one.z - two.z)
export function readFunctionalOptions(args, env) {
  const allowed = new Set(['--expected-sha', '--local-fixture', '--base-url', '--approved-existing-accounts', '--approved-register-synthetic-accounts', '--approved-public-chat'])
  const values = {}, flags = new Set()
  for (let index = 0; index < args.length; index++) {
    const name = args[index]
    if (!allowed.has(name) || flags.has(name) || name in values) throw new Error('Unknown or duplicate functional-test option')
    if (name === '--expected-sha' || name === '--base-url') {
      const value = args[++index]; if (!value || value.startsWith('--')) throw new Error('Missing functional-test option value'); values[name] = value
    } else flags.add(name)
  }
  const expectedSha = values['--expected-sha']
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '')) throw new Error('An exact lowercase deployed commit SHA is required')
  const register = flags.has('--approved-register-synthetic-accounts')
  if (register === flags.has('--approved-existing-accounts')) throw new Error('Choose exactly one explicitly approved synthetic-account mode')
  if (!flags.has('--approved-public-chat')) throw new Error('Public test chat requires explicit operator approval before authentication')
  const origin = new URL(values['--base-url'] ?? LIVE_ORIGIN)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
  if (origin.href !== origin.origin + '/' || origin.username || origin.password || (origin.origin !== LIVE_ORIGIN && !(flags.has('--local-fixture') && loopback && origin.protocol === 'http:'))) throw new Error('Unapproved functional-test destination')
  const accounts = ['ONE', 'TWO'].map(suffix => {
    const identifier = env[`GREED_L390_TEST_USER_${suffix}`], password = env[`GREED_L390_TEST_PASSWORD_${suffix}`]
    if (typeof identifier !== 'string' || !identifier || typeof password !== 'string' || password.length > 200 || password.length < (register ? 12 : 1)) throw new Error('Two operator-supplied synthetic credentials are required; values are never logged')
    if (register && !/^l390-smoke-[a-z0-9-]{4,21}$/.test(identifier)) throw new Error('Registration is restricted to explicitly supplied l390-smoke usernames')
    const rawId = env[`GREED_L390_TEST_ACCOUNT_ID_${suffix}`]
    const expectedId = !register && /^[1-9][0-9]*$/.test(rawId ?? '') ? Number(rawId) : null
    if (!register && !Number.isSafeInteger(expectedId)) throw new Error('Existing mode requires both owner-selected synthetic numeric account IDs')
    return { identifier, password, expectedId }
  })
  if (accounts[0].identifier === accounts[1].identifier || (!register && accounts[0].expectedId === accounts[1].expectedId)) throw new Error('Synthetic peers must be distinct accounts')
  return { base: origin.origin, origin: origin.origin, expectedSha, register, accounts }
}

/** Client intent planning only: the server still validates/commits every step. */
export function planMoves(start, target, geometry, computeMove, tolerance = geometry.movePerStep / 2) {
  const queue = [{ point: start, parent: -1, intent: null }], seen = new Set([key(start)])
  const directions = [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 }]
  for (let index = 0; index < queue.length && queue.length <= 25000; index++) {
    const node = queue[index]
    if (distance(node.point, target) <= tolerance) {
      const intents = []; for (let cursor = index; queue[cursor].parent >= 0; cursor = queue[cursor].parent) intents.push(queue[cursor].intent)
      return intents.reverse()
    }
    for (const intent of [...directions].sort((one, two) => distance(computeMove(node.point, one.dx, one.dz, geometry), target) - distance(computeMove(node.point, two.dx, two.dz, geometry), target))) {
      const point = computeMove(node.point, intent.dx, intent.dz, geometry), encoded = key(point)
      if (!seen.has(encoded)) { seen.add(encoded); queue.push({ point, parent: index, intent }) }
    }
  }
  throw new Error('No bounded normal-intent path to the reviewed target')
}
export function planRegions(map, from, to) {
  const queue = [[from]], seen = new Set([from])
  const regions = new Set(map.regions.filter(region => region.available && region.geometrySupported).map(region => region.id))
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index], current = path.at(-1)
    if (current === to) return path.slice(1)
    for (const next of map.adjacency[current] ?? []) {
      const availableEdge = map.edges.some(edge => edge.available && ((edge.fromTileId === current && edge.toTileId === next) || (edge.toTileId === current && edge.fromTileId === next)))
      if (regions.has(next) && availableEdge && !seen.has(next)) { seen.add(next); queue.push([...path, next]) }
    }
  }
  throw new Error('No reviewed available region path')
}

export async function runFunctional(options, { computeMove }) {
  const actors = [], streams = [], createdIds = [], results = []
  let deadline = Date.now() + 120000
  const request = async (path, actor, body, method = body === undefined ? 'GET' : 'POST') => {
    if (Date.now() > deadline) throw new Error('Functional-test deadline exceeded')
    const headers = { Origin: options.origin, ...(actor ? { Cookie: actor.cookie, 'X-Greed-Account-Id': String(actor.id) } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }
    const response = await fetch(options.base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000), redirect: 'error' })
    const data = await response.json().catch(() => null)
    return { response, data }
  }
  const snapshot = async actor => {
    const { response, data } = await request('/api/world/snapshot', actor)
    assert.equal(response.status, 200, 'Canonical snapshot unavailable'); assert.equal(data.selfId, actor.id)
    const self = data.players.find(player => player.accountId === actor.id); assert.ok(self, 'Canonical self projection missing')
    actor.current = { tileId: self.tileId, x: self.x, z: self.z }
    return data
  }
  const command = async (actor, type, payload) => {
    const { response, data } = await request('/api/world/command', actor, { commandId: 'l390-functional-' + randomUUID(), type, payload })
    assert.equal(response.status, 200, 'Normal world command rejected'); assert.equal(data.accepted, true)
    return snapshot(actor)
  }
  const openStream = async actor => {
    const controller = new AbortController()
    const handshakeTimeout = setTimeout(() => controller.abort(), 15000)
    let response
    try { response = await fetch(options.base + '/api/world/stream?expectedAccountId=' + actor.id, { headers: { Origin: options.origin, Cookie: actor.cookie, 'X-Greed-Account-Id': String(actor.id) }, signal: controller.signal, redirect: 'error' }) } finally { clearTimeout(handshakeTimeout) }
    assert.equal(response.status, 200, 'World SSE admission failed')
    const reader = response.body.getReader(), state = { actor, controller, reader, latest: null, ended: false, error: null, closed: false }
    state.pump = (async () => {
      let buffer = ''; const decoder = new TextDecoder()
      try {
        while (true) {
          const item = await reader.read(); if (item.done) break
          buffer += decoder.decode(item.value, { stream: true })
          if (Buffer.byteLength(buffer, 'utf8') > 256 * 1024) throw new Error('Unbounded SSE frame')
          let separator
          while ((separator = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, separator); buffer = buffer.slice(separator + 2)
            if (frame.includes('event: snapshot')) {
              const line = frame.split('\n').find(value => value.startsWith('data: '))
              const data = JSON.parse(line.slice(6)); assert.equal(data.selfId, actor.id); state.latest = data
            }
          }
        }
      } catch (error) { if (!state.closed) state.error = error }
      finally { state.ended = true }
    })()
    streams.push(state)
    await waitFor(() => state.latest, state)
    actor.stream = state
    return state
  }
  const waitFor = async (predicate, stream, timeout = 10000) => {
    const end = Math.min(deadline, Date.now() + timeout)
    while (!predicate()) {
      if (stream?.error || (stream?.ended && !stream?.closed)) throw new Error('World SSE ended during functional flow')
      if (Date.now() >= end) throw new Error('Functional condition timed out')
      await sleep(25)
    }
  }
  const closeStream = async state => {
    if (!state || state.closed) return
    state.closed = true; state.controller.abort(); await state.pump
  }
  const walk = async (actor, target, tolerance) => {
    let state = await snapshot(actor)
    const initial = actor.current, intents = planMoves(initial, target, state.geometry, computeMove, tolerance === 0 ? state.geometry.movePerStep : tolerance)
    for (const intent of intents) {
      const expected = computeMove(actor.current, intent.dx, intent.dz, state.geometry)
      state = await command(actor, 'move', intent)
      assert.ok(distance(actor.current, expected) < 0.00001, 'Synthetic account moved concurrently or server/client movement differs')
    }
    // Use one bounded fractional normal intent to restore exact original pose.
    if (tolerance === 0 && distance(actor.current, target) > 0.00001) {
      const step = state.geometry.movePerStep
      state = await command(actor, 'move', { dx: (target.x - actor.current.x) / step, dz: (target.z - actor.current.z) / step })
    }
    assert.ok(distance(actor.current, target) <= Math.max(tolerance ?? state.geometry.movePerStep / 2, 0.00001), 'Target not reached through normal movement')
    return state
  }
  const travel = async (actor, tileId) => {
    const state = await snapshot(actor)
    for (const next of planRegions(state.map, actor.current.tileId, tileId)) {
      const current = await snapshot(actor), portal = current.geometry.portals.find(value => value.toTileId === next)
      assert.ok(portal, 'Reciprocal authored portal missing')
      await walk(actor, portal, portal.radius * 0.8)
      await command(actor, 'transition', { toTileId: next }); assert.equal(actor.current.tileId, next)
    }
  }
  let cleanupComplete = true, failure
  try {
    const health = await request('/healthz')
    assert.equal(health.response.status, 200); assert.equal(health.data.mode, 'unified'); assert.equal(health.data.buildSha, options.expectedSha, 'Deployed SHA differs from approved build')
    results.push('exact-deployed-sha')
    assert.equal((await request('/api/world/snapshot')).response.status, 401)
    for (const input of options.accounts) {
      const authPath = options.register ? '/api/auth/register' : '/api/auth/login'
      const body = options.register ? { username: input.identifier, password: input.password } : { identifier: input.identifier, password: input.password }
      const { response, data } = await request(authPath, null, body)
      assert.equal(response.status, options.register ? 201 : 200, 'Synthetic normal authentication failed')
      const id = data.profile.accountId
      const token = /(?:^|,\s*)greed_session=([a-f0-9]{64})(?:;|$)/.exec(response.headers.get('set-cookie') ?? '')?.[1]
      assert.ok(token, 'Canonical cookie was not issued')
      const actor = { id, cookie: 'greed_session=' + token, original: null, current: null }; actors.push(actor)
      if (options.register) createdIds.push(id)
      // Track the newly issued session before validating its binding, so a
      // mistaken credential/ID pair still has its own test session logged out.
      assert.equal(data.profile.role, 'player', 'Only approved ordinary synthetic players may be moved')
      if (!options.register) assert.equal(id, input.expectedId, 'Authenticated account differs from operator-approved synthetic ID')
      const existing = await request('/api/world/snapshot', actor)
      if (existing.response.status === 200) {
        const self = existing.data.players.find(value => value.accountId === id); actor.original = { tileId: self.tileId, x: self.x, z: self.z }
        await snapshot(actor)
      } else {
        assert.equal(existing.response.status, 409); assert.equal(existing.data?.error, 'WORLD_ENTRY_REQUIRED')
        await command(actor, 'enter', {})
      }
      await openStream(actor)
    }
    assert.notEqual(actors[0].id, actors[1].id)
    for (const actor of actors) await travel(actor, 't_dock')
    const [one, two] = actors
    await waitFor(() => one.stream.latest?.players.some(player => player.accountId === two.id && player.online) && two.stream.latest?.players.some(player => player.accountId === one.id && player.online), one.stream)
    results.push('two-cookie-peers-sse')
    const before = { ...one.current }, state = await snapshot(one)
    const intent = [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 }].find(value => distance(computeMove(before, value.dx, value.dz, state.geometry), before) > 0)
    assert.ok(intent, 'No normal test move available'); await command(one, 'move', intent)
    const moved = { ...one.current }
    await waitFor(() => two.stream.latest?.players.some(player => player.accountId === one.id && distance(player, moved) < 0.00001), two.stream)
    results.push('authoritative-move-peer-observed')
    const chat = 'L390 operator-approved smoke ' + randomUUID().slice(0, 8)
    await command(one, 'chat', { text: chat })
    await waitFor(() => two.stream.latest?.messages.some(message => message.accountId === one.id && message.text === chat), two.stream)
    results.push('public-chat-peer-observed')
    await travel(one, 't_central'); assert.equal(one.current.tileId, 't_central')
    await waitFor(() => !two.stream.latest?.players.some(player => player.accountId === one.id), two.stream)
    const crossed = { ...one.current }; await closeStream(one.stream); await openStream(one)
    assert.equal(one.stream.latest.tileId, crossed.tileId)
    assert.ok(one.stream.latest.players.some(player => player.accountId === one.id && distance(player, crossed) < 0.00001))
    assert.ok(Array.isArray(one.stream.latest.npcs), 'Canonical NPC display projection missing')
    results.push('region-crossing-npc-projection-cookie-reconnect')
    await travel(one, 't_dock')
    await waitFor(() => two.stream.latest?.players.some(player => player.accountId === one.id), two.stream)
    results.push('reciprocal-region-return')
    const laterHealth = await request('/healthz')
    assert.equal(laterHealth.data.buildSha, options.expectedSha, 'Deployment changed during functional test')
    assert.ok(laterHealth.data.tick > health.data.tick, 'Canonical world clock did not advance during normal gameplay')
    results.push('autonomous-canonical-world-clock')
  } catch (error) { failure = error }
  finally {
    deadline = Date.now() + 60000
    for (const actor of actors) {
      try {
        if (actor.original) {
          if (!actor.stream || actor.stream.closed || actor.stream.ended) await openStream(actor)
          await travel(actor, actor.original.tileId)
          // Plan to within one step, then restore the exact source pose using a fractional intent.
          await walk(actor, actor.original, 0)
        }
      } catch { cleanupComplete = false }
    }
    for (const stream of streams) await closeStream(stream)
    for (const actor of actors) {
      try { assert.equal((await request('/api/auth/logout', actor, {})).response.status, 200) } catch { cleanupComplete = false }
      actor.cookie = ''
    }
  }
  if (failure || !cleanupComplete) throw new Error(`Functional checks failed; normal-command cleanup ${cleanupComplete ? 'complete' : 'requires operator review'}. ${failure?.message ?? ''}`)
  return { passed: true, buildSha: options.expectedSha, checks: results, restoredExistingPoses: cleanupComplete, createdAccountIds: createdIds, retainedPublicChat: true,
    beaconProgress: 'Separate owner-reviewed beacon/progress contract required; not asserted by this script' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = readFunctionalOptions(process.argv.slice(2), process.env)
    const { computeMove } = await import('./dist/playerWorld/geometry.js')
    console.log(JSON.stringify(await runFunctional(options, { computeMove })))
  } catch (error) {
    // Never log response/profile/body/credential values or an arbitrary server error.
    console.error(error instanceof Error ? error.message : 'Functional test failed'); process.exitCode = 1
  }
}
