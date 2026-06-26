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
      const payload = (await response.json()) as { npcId?: string; worldEventId?: string }

      expect(response.status).toBe(200)
      expect(payload.npcId).toBe('npc-a')
      expect(payload.worldEventId).toBe('evt-local-shout')
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
  })
}
