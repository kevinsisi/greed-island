import Database from 'better-sqlite3'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createNpcRouter, sanitizeNpcReplyForUnknownEntities } from './npc.js'
import { AccountStore } from './accounts.js'
import { PlayerStateStore } from './playerState.js'
import { SettingsStore } from './settings.js'
import type { AuthConfig } from './auth.js'
import type { NpcProfile } from '../npcs/types.js'
import type { SimulationRuntime } from '../sim/runtime.js'

describe('npc router', () => {
  it('keeps deterministic identity replies from being overwritten by fallback dialog', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('gon@example.test', 'hunter123')
    accounts.updateProfile(account.id, { nickname: '小傑' })

    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profile: NpcProfile = {
      id: 'npc-test',
      name: { zh: '米特', en: 'Mito' },
      role: { zh: '鯨魚島居民', en: 'Whale Island resident' },
      defaultLocation: 't_whale',
      routine: [],
      triggers: [],
      memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
      personality: { trustBase: 50, patience: 0.8 },
    }
    const runtime = {
      findProfile: (npcId: string) => (npcId === profile.id ? profile : null),
      getCurrentTick: () => 1,
      // v0.87.3 deceased gate: this mock NPC is alive.
      getNpcMortalityProjection: () => ({ isDeceased: () => false }),
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({ runtime, store, settings, accounts, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/${profile.id}/interact`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: '我是誰？' }),
      })
      const payload = (await response.json()) as { line: { zh: string }; replySource: string }

      expect(response.status).toBe(200)
      expect(payload.replySource).toBe('fallback')
      expect(payload.line.zh).toContain('小傑')
      expect(payload.line.zh).not.toContain('近況')
    } finally {
      await close(server)
      db.close()
    }
  })

  it('commits player dialog as a replayable world event so NPC plans can react', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('dialogue@example.test', 'hunter123')
    accounts.updateProfile(account.id, { nickname: '奇犽' })

    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profile: NpcProfile = {
      id: 'npc-dialogue',
      name: { zh: '雲漪', en: 'Yunyi' },
      role: { zh: '情報販子', en: 'Broker' },
      defaultLocation: 't_central',
      routine: [],
      triggers: [],
      memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
      personality: { trustBase: 50, patience: 0.8 },
    }
    const submitted: unknown[] = []
    const runtime = {
      findProfile: (npcId: string) => (npcId === profile.id ? profile : null),
      getCurrentTick: () => 42,
      getNpcMortalityProjection: () => ({ isDeceased: () => false }),
      getNpcs: () => [{ id: profile.id, location: 't_central' }],
      submitLivingWorldCommand: (command: unknown) => {
        submitted.push(command)
        return { eventId: 'evt-player-dialogue' }
      },
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({ runtime, store, settings, accounts, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/${profile.id}/interact`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ intent: 'greet', message: '你好，雲漪。' }),
      })
      const payload = (await response.json()) as { worldEventId?: string }

      expect(response.status).toBe(200)
      expect(payload.worldEventId).toBe('evt-player-dialogue')
      expect(submitted).toHaveLength(1)
      expect(submitted[0]).toMatchObject({
        commandType: 'PLAYER_NPC_DIALOGUE',
        actorId: String(account.id),
        actorType: 'player',
        tick: 42,
        payload: {
          playerAccountId: String(account.id),
          npcId: profile.id,
          tile: 't_central',
          intent: 'greet',
          playerMessage: '你好，雲漪。',
          trustDelta: 1,
          trustAfter: 51,
        },
      })
    } finally {
      await close(server)
      db.close()
    }
  })

  it('handles local shout server-side by choosing one living NPC responder', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('shout@example.test', 'hunter123')
    accounts.updateProfile(account.id, { nickname: '小喜' })

    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profiles: NpcProfile[] = [
      {
        id: 'npc-a',
        name: { zh: '星沉', en: 'Xingchen' },
        role: { zh: '攤販', en: 'Vendor' },
        defaultLocation: 't_central',
        routine: [],
        triggers: [],
        memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
        personality: { trustBase: 50, patience: 0.8 },
      },
      {
        id: 'npc-b',
        name: { zh: '霧聲', en: 'Wusheng' },
        role: { zh: '情報販子', en: 'Broker' },
        defaultLocation: 't_central',
        routine: [],
        triggers: [],
        memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
        personality: { trustBase: 50, patience: 0.8 },
      },
    ]
    const submitted: unknown[] = []
    const runtime = {
      findProfile: (npcId: string) => profiles.find((p) => p.id === npcId) ?? null,
      getCurrentTick: () => 99,
      getNpcMortalityProjection: () => ({ isDeceased: () => false }),
      getNpcs: () => profiles.map((p) => ({ id: p.id, location: 't_central' })),
      submitLivingWorldCommand: (command: unknown) => {
        submitted.push(command)
        return { eventId: 'evt-local-shout' }
      },
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({ runtime, store, settings, accounts, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/local-shout`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tileId: 't_central', candidateNpcIds: ['npc-a', 'npc-b'], message: '各位好' }),
      })
      const payload = (await response.json()) as { npcId?: string; worldEventId?: string; line?: { zh?: string } }

      expect(response.status).toBe(200)
      expect(payload.npcId).toBe('npc-a')
      expect(payload.worldEventId).toBe('evt-local-shout')
      expect(payload.line?.zh).toContain('星沉')
      expect(payload.line?.zh).toContain('攤販')
      expect(payload.line?.zh).not.toContain('阿鬼')
      expect(payload.line?.zh).not.toContain('不會替全城答話')
      expect(payload.line?.zh).not.toContain('把問題講清楚')
      expect(payload.line?.zh).not.toContain('附近有人聽見了')
      expect(submitted).toHaveLength(1)
      expect(submitted[0]).toMatchObject({
        commandType: 'PLAYER_NPC_DIALOGUE',
        payload: {
          playerAccountId: String(account.id),
          npcId: 'npc-a',
          tile: 't_central',
          intent: 'ask',
          playerMessage: '各位好',
        },
      })
    } finally {
      await close(server)
      db.close()
    }
  })

  it('uses AI for local shout when an AI provider is configured', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('ai-shout@example.test', 'hunter123')
    settings.setSetting('provider_priority', 'opencode')

    const aiApp = express()
    let aiMessageCalls = 0
    aiApp.use(express.json())
    aiApp.post('/session', (_req, res) => res.json({ id: 'test-session' }))
    aiApp.post('/session/:id/message', (_req, res) => {
      aiMessageCalls += 1
      res.json({
        parts: [{
          type: 'text',
          text: JSON.stringify({
            zh: '「我聽到了，先別急。你說大家好，我會用星沉自己的方式回你。」',
            en: 'I heard you. You said hello, and Xingchen answers in his own way.',
            intent: 'greet',
            trustDelta: 0,
          }),
        }],
      })
    })
    aiApp.delete('/session/:id', (_req, res) => res.status(204).end())
    const aiServer = await listen(aiApp)
    const aiAddress = aiServer.address() as AddressInfo
    settings.setSetting('opencode_base_url', `http://127.0.0.1:${aiAddress.port}`)

    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profile: NpcProfile = {
      id: 'npc-ai',
      name: { zh: '星沉', en: 'Xingchen' },
      role: { zh: '攤販', en: 'Vendor' },
      defaultLocation: 't_central',
      routine: [],
      triggers: [],
      memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
      personality: { trustBase: 50, patience: 0.8 },
    }
    const runtime = {
      findProfile: (npcId: string) => (npcId === profile.id ? profile : null),
      getCurrentTick: () => 130,
      getNpcMortalityProjection: () => ({ isDeceased: () => false }),
      getNpcs: () => [{ id: profile.id, location: 't_central' }],
      getNpcsIncludingDeceased: () => [profile],
      submitLivingWorldCommand: () => ({ eventId: 'evt-ai-local-shout' }),
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({ runtime, store, settings, accounts, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/local-shout`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tileId: 't_central', candidateNpcIds: ['npc-ai'], message: '大家好' }),
      })
      const payload = (await response.json()) as { replySource?: string; line?: { zh?: string } }

      expect(response.status).toBe(200)
      expect(payload.replySource).toBe('ai')
      expect(payload.line?.zh).toContain('我聽到了')
      expect(aiMessageCalls).toBe(1)
    } finally {
      await close(server)
      await close(aiServer)
      db.close()
    }
  })

  it('tries the next OpenCode endpoint when the first local shout endpoint times out', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('ai-shout-failover@example.test', 'hunter123')
    settings.setSetting('provider_priority', 'opencode')

    const slowAiApp = express()
    let slowSessionCalls = 0
    let slowMessageCalls = 0
    slowAiApp.use(express.json())
    slowAiApp.post('/session', (_req, res) => {
      slowSessionCalls += 1
      setTimeout(() => res.json({ id: 'slow-session' }), 100)
    })
    slowAiApp.post('/session/:id/message', (_req, res) => {
      slowMessageCalls += 1
      // This must share the same endpoint deadline as create-session, not get another full timeout.
      setTimeout(() => res.json({ parts: [{ type: 'text', text: 'too late' }] }), 300)
    })
    slowAiApp.delete('/session/:id', (_req, res) => res.status(204).end())
    const slowAiServer = await listen(slowAiApp)
    const slowAiAddress = slowAiServer.address() as AddressInfo

    const fastAiApp = express()
    let fastMessageCalls = 0
    fastAiApp.use(express.json())
    fastAiApp.post('/session', (_req, res) => res.json({ id: 'fast-session' }))
    fastAiApp.post('/session/:id/message', (_req, res) => {
      fastMessageCalls += 1
      res.json({
        parts: [{
          type: 'text',
          text: JSON.stringify({
            zh: '「第一個訊號斷了，但星沉還是聽見你了。」',
            en: 'The first signal failed, but Xingchen still heard you.',
            intent: 'greet',
            trustDelta: 0,
          }),
        }],
      })
    })
    fastAiApp.delete('/session/:id', (_req, res) => res.status(204).end())
    const fastAiServer = await listen(fastAiApp)
    const fastAiAddress = fastAiServer.address() as AddressInfo
    settings.setSetting('opencode_servers', [
      `http://127.0.0.1:${slowAiAddress.port}`,
      `http://127.0.0.1:${fastAiAddress.port}`,
    ].join('\n'))

    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profile: NpcProfile = {
      id: 'npc-ai-failover',
      name: { zh: '星沉', en: 'Xingchen' },
      role: { zh: '攤販', en: 'Vendor' },
      defaultLocation: 't_central',
      routine: [],
      triggers: [],
      memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
      personality: { trustBase: 50, patience: 0.8 },
    }
    const runtime = {
      findProfile: (npcId: string) => (npcId === profile.id ? profile : null),
      getCurrentTick: () => 132,
      getNpcMortalityProjection: () => ({ isDeceased: () => false }),
      getNpcs: () => [{ id: profile.id, location: 't_central' }],
      getNpcsIncludingDeceased: () => [profile],
      submitLivingWorldCommand: () => ({ eventId: 'evt-ai-local-shout-failover' }),
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({
      runtime,
      store,
      settings,
      accounts,
      authConfig,
      localShoutAiTimeoutMs: 260,
      openCodeEndpointTimeoutMs: 200,
    }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/local-shout`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tileId: 't_central', candidateNpcIds: ['npc-ai-failover'], message: '大家好' }),
      })
      const payload = (await response.json()) as { replySource?: string; aiError?: string | null; line?: { zh?: string } }

      expect(response.status).toBe(200)
      expect(payload.replySource).toBe('ai')
      expect(payload.aiError).toBeNull()
      expect(payload.line?.zh).toContain('第一個訊號斷了')
      expect(slowSessionCalls).toBe(1)
      expect(slowMessageCalls).toBeLessThanOrEqual(1)
      expect(fastMessageCalls).toBe(1)
    } finally {
      await close(server)
      await close(slowAiServer)
      await close(fastAiServer)
      db.close()
    }
  })

  it('answers rude local shouts immediately without waiting for AI timeout', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('rude-ai-shout@example.test', 'hunter123')
    settings.setSetting('provider_priority', 'opencode')

    const aiApp = express()
    let aiMessageCalls = 0
    aiApp.use(express.json())
    aiApp.post('/session', (_req, res) => res.json({ id: 'slow-session' }))
    aiApp.post('/session/:id/message', (_req, res) => {
      aiMessageCalls += 1
      setTimeout(() => res.json({ parts: [{ type: 'text', text: 'too late' }] }), 200)
    })
    aiApp.delete('/session/:id', (_req, res) => res.status(204).end())
    const aiServer = await listen(aiApp)
    const aiAddress = aiServer.address() as AddressInfo
    settings.setSetting('opencode_base_url', `http://127.0.0.1:${aiAddress.port}`)

    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profile: NpcProfile = {
      id: 'npc-rude-ai',
      name: { zh: '霧川', en: 'Wuchuan' },
      role: { zh: '巡街人', en: 'Patroller' },
      defaultLocation: 't_central',
      routine: [],
      triggers: [],
      memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
      personality: { trustBase: 50, patience: 0.8 },
    }
    const runtime = {
      findProfile: (npcId: string) => (npcId === profile.id ? profile : null),
      getCurrentTick: () => 133,
      getNpcMortalityProjection: () => ({ isDeceased: () => false }),
      getNpcs: () => [{ id: profile.id, location: 't_central' }],
      getNpcsIncludingDeceased: () => [profile],
      submitLivingWorldCommand: () => ({ eventId: 'evt-rude-local-shout' }),
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({
      runtime,
      store,
      settings,
      accounts,
      authConfig,
      localShoutAiTimeoutMs: 150,
      openCodeEndpointTimeoutMs: 100,
    }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const startedAt = Date.now()
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/local-shout`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tileId: 't_central', candidateNpcIds: ['npc-rude-ai'], message: '廢物們' }),
      })
      const elapsedMs = Date.now() - startedAt
      const payload = (await response.json()) as { replySource?: string; line?: { zh?: string }; npcId?: string }

      expect(response.status).toBe(200)
      expect(payload.npcId).toBe('npc-rude-ai')
      expect(payload.replySource).toBe('fallback')
      expect(payload.line?.zh).toContain('霧川')
      expect(payload.line?.zh).toContain('嘴巴放乾淨點')
      expect(aiMessageCalls).toBe(0)
      expect(elapsedMs).toBeLessThan(100)
    } finally {
      await close(server)
      await close(aiServer)
      db.close()
    }
  })

  it('falls back before mobile local shout timeout when AI is slow', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('slow-ai-shout@example.test', 'hunter123')
    settings.setSetting('provider_priority', 'opencode')

    const aiApp = express()
    let aiMessageCalls = 0
    aiApp.use(express.json())
    aiApp.post('/session', (_req, res) => res.json({ id: 'slow-session' }))
    aiApp.post('/session/:id/message', (_req, res) => {
      aiMessageCalls += 1
      // Respond after the endpoint timeout; the router should not let mobile UI time out first.
      setTimeout(() => res.json({ parts: [{ type: 'text', text: 'too late' }] }), 100)
    })
    aiApp.delete('/session/:id', (_req, res) => res.status(204).end())
    const aiServer = await listen(aiApp)
    const aiAddress = aiServer.address() as AddressInfo
    settings.setSetting('opencode_base_url', `http://127.0.0.1:${aiAddress.port}`)

    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profile: NpcProfile = {
      id: 'npc-slow-ai',
      name: { zh: '星沉', en: 'Xingchen' },
      role: { zh: '攤販', en: 'Vendor' },
      defaultLocation: 't_central',
      routine: [],
      triggers: [],
      memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
      personality: { trustBase: 50, patience: 0.8 },
    }
    const runtime = {
      findProfile: (npcId: string) => (npcId === profile.id ? profile : null),
      getCurrentTick: () => 131,
      getNpcMortalityProjection: () => ({ isDeceased: () => false }),
      getNpcs: () => [{ id: profile.id, location: 't_central' }],
      getNpcsIncludingDeceased: () => [profile],
      submitLivingWorldCommand: () => ({ eventId: 'evt-slow-ai-local-shout' }),
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({
      runtime,
      store,
      settings,
      accounts,
      authConfig,
      localShoutAiTimeoutMs: 80,
      openCodeEndpointTimeoutMs: 20,
    }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const startedAt = Date.now()
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/local-shout`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tileId: 't_central', candidateNpcIds: ['npc-slow-ai'], message: '大家好' }),
      })
      const elapsedMs = Date.now() - startedAt
      const payload = (await response.json()) as { replySource?: string; aiError?: string | null; line?: { zh?: string } }

      expect(response.status).toBe(200)
      expect(payload.replySource).toBe('fallback')
      expect(payload.aiError).toMatch(/OpenCode send-message timeout after 20ms/)
      expect(payload.line?.zh).toContain('星沉')
      expect(aiMessageCalls).toBe(1)
      expect(elapsedMs).toBeLessThan(1_000)
    } finally {
      await close(server)
      await close(aiServer)
      db.close()
    }
  })

  it('prefers a local shout responder who did not just answer the player', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('rotate-shout@example.test', 'hunter123')

    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profiles: NpcProfile[] = [
      {
        id: 'npc-a',
        name: { zh: '星沉', en: 'Xingchen' },
        role: { zh: '攤販', en: 'Vendor' },
        defaultLocation: 't_central',
        routine: [],
        triggers: [],
        memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
        personality: { trustBase: 50, patience: 0.8 },
      },
      {
        id: 'npc-b',
        name: { zh: '霧聲', en: 'Wusheng' },
        role: { zh: '情報販子', en: 'Broker' },
        defaultLocation: 't_central',
        routine: [],
        triggers: [],
        memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
        personality: { trustBase: 50, patience: 0.8 },
      },
    ]
    store.upsertRelation({
      accountId: account.id,
      npcId: 'npc-a',
      trust: 50,
      interactionCount: 3,
      lastInteractionTick: 118,
    })
    const submitted: unknown[] = []
    const runtime = {
      findProfile: (npcId: string) => profiles.find((p) => p.id === npcId) ?? null,
      getCurrentTick: () => 120,
      getNpcMortalityProjection: () => ({ isDeceased: () => false }),
      getNpcs: () => profiles.map((p) => ({ id: p.id, location: 't_central' })),
      submitLivingWorldCommand: (command: unknown) => {
        submitted.push(command)
        return { eventId: 'evt-local-shout-rotated' }
      },
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({ runtime, store, settings, accounts, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/local-shout`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tileId: 't_central', candidateNpcIds: ['npc-a', 'npc-b'], message: '還有人聽得到嗎？' }),
      })
      const payload = (await response.json()) as { npcId?: string }

      expect(response.status).toBe(200)
      expect(payload.npcId).toBe('npc-b')
      expect(submitted[0]).toMatchObject({ payload: { npcId: 'npc-b' } })
    } finally {
      await close(server)
      db.close()
    }
  })

  it('posts a deterministic NPC dialog hold when a dialog opens', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('hold@example.test', 'hunter123')
    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profile: NpcProfile = {
      id: 'npc-hold',
      name: { zh: '守門人', en: 'Gatekeeper' },
      role: { zh: '守門人', en: 'Gatekeeper' },
      defaultLocation: 't_central',
      routine: [],
      triggers: [],
      memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
      personality: { trustBase: 50, patience: 0.8 },
    }
    const held: string[] = []
    const runtime = {
      findProfile: (npcId: string) => (npcId === profile.id ? profile : null),
      getCurrentTick: () => 7,
      holdNpcForPlayerDialog: (_playerAccountId: string, npcId: string) => {
        held.push(npcId)
        return { npcId, tick: 7, expiresAtTick: 19 }
      },
      // v0.87.3 deceased gate: this mock NPC is alive.
      getNpcMortalityProjection: () => ({ isDeceased: () => false }),
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({ runtime, store, settings, accounts, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/${profile.id}/dialog-hold`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      const payload = (await response.json()) as { held: boolean; tick: number; expiresAtTick: number }

      expect(response.status).toBe(200)
      expect(held).toEqual([profile.id])
      expect(payload).toEqual({ npcId: profile.id, held: true, tick: 7, expiresAtTick: 19 })
    } finally {
      await close(server)
      db.close()
    }
  })

  it('sanitizes AI replies that invent unknown named entities', () => {
    const line = sanitizeNpcReplyForUnknownEntities({
      playerMessage: '腐叔就是個變態',
      replyZh: '「腐叔？你說的是哪個腐叔？這裡可有幾個『腐叔』呢。」',
      replyEn: 'Which one?',
      knownNpcNames: ['雷子', '米特'],
    })

    expect(line.zh).toContain('不認得這個稱呼')
    expect(line.zh).not.toContain('哪個腐叔')
    expect(line.zh).not.toContain('幾個')
  })

  it('sanitizes direct questions about unknown named entities', () => {
    const line = sanitizeNpcReplyForUnknownEntities({
      playerMessage: '你認識腐叔嗎？',
      replyZh: '「腐叔是住在港邊的人，我認識腐叔。」',
      replyEn: 'I know him.',
      knownNpcNames: ['雷子', '米特'],
    })

    expect(line.zh).toContain('不認得這個稱呼')
    expect(line.zh).not.toContain('住在港邊')
    expect(line.zh).not.toContain('認識腐叔')
  })
})

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server))
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
    server.closeAllConnections?.()
  })
}
