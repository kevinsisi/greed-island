// v0.96.0 — NPC MindSheet API tests.
// Covers GET /npc/:id/intent and GET /npc/:id/beliefs for the two new
// MindSheet data endpoints. Tests: living NPC 200, unknown NPC 404,
// deceased NPC 410.

import Database from 'better-sqlite3'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createNpcRouter } from './npc.js'
import { AccountStore } from './accounts.js'
import { PlayerStateStore } from './playerState.js'
import { SettingsStore } from './settings.js'
import type { AuthConfig } from './auth.js'
import type { NpcProfile } from '../npcs/types.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { IntentEntry } from '../sim/intentPlanner.js'
import type { BeliefRow } from '../projections/beliefProjection.js'

const ALIVE_PROFILE: NpcProfile = {
  id: 'npc.mira.1',
  name: { zh: '米拉', en: 'Mira' },
  role: { zh: '漁人', en: 'fisher' },
  defaultLocation: 't_dock',
  routine: [],
  triggers: [],
  memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
  personality: { trustBase: 50, patience: 0.8 },
}

const SAMPLE_INTENTS: IntentEntry[] = [
  { kind: 'economic', urgency: 65, targetTile: 't_dock', reason: 'goods_scarcity=fish scarce conf=80' },
  { kind: 'survival', urgency: 45, targetTile: 't_central', reason: 'tile t_dock tile_safety=dangerous conf=50' },
]

const SAMPLE_BELIEFS: BeliefRow[] = [
  {
    npcId: 'npc.mira.1',
    subject: 'goods_scarcity',
    qualifier: 'fish',
    value: 'scarce',
    confidence: 80,
    observedAtTick: 100,
    decayRatePerDay: 4,
    emotionalTag: 'worry',
  },
  {
    npcId: 'npc.mira.1',
    subject: 'tile_safety',
    qualifier: 't_dock',
    value: 'dangerous',
    confidence: 50,
    observedAtTick: 95,
    decayRatePerDay: 3,
    emotionalTag: 'fear',
  },
]

function buildRuntime(opts: { deceased?: boolean } = {}): SimulationRuntime {
  return {
    findProfile: (npcId: string) => (npcId === ALIVE_PROFILE.id ? ALIVE_PROFILE : null),
    getCurrentTick: () => 200,
    getNpcMortalityProjection: () => ({ isDeceased: () => opts.deceased === true }),
    getNpcIntentStack: (npcId: string) => (npcId === ALIVE_PROFILE.id ? SAMPLE_INTENTS : []),
    getNpcLearningWeights: () => ({ economic: 1.2 }),
    getNpcBeliefs: (npcId: string) => (npcId === ALIVE_PROFILE.id ? SAMPLE_BELIEFS : []),
  } as unknown as SimulationRuntime
}

async function setupApp(opts: { deceased?: boolean } = {}) {
  const db = new Database(':memory:')
  const accounts = new AccountStore(db, 4)
  const store = new PlayerStateStore(db)
  const settings = new SettingsStore(db)
  const account = await accounts.createAccount('player@example.test', 'password1')
  const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
  const runtime = buildRuntime(opts)
  const app = express()
  app.use(express.json())
  app.use(createNpcRouter({ runtime, store, settings, accounts, authConfig }))
  const server = await listen(app)
  const token = jwt.sign(
    { sub: account.id, email: account.email, role: account.role },
    authConfig.jwtSecret,
  )
  return { db, server, token }
}

describe('GET /npc/:id/intent (MindSheet)', () => {
  it('returns 200 with intents and lessons for a living NPC', async () => {
    const { db, server, token } = await setupApp()
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${ALIVE_PROFILE.id}/intent`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        intents: Array<{ kind: string; label: string; urgencyLabel: string; reasonZh: string }>
        lessons: Array<{ kind: string; text: string }>
      }
      expect(body.intents).toHaveLength(2)
      expect(body.intents[0]!.kind).toBe('economic')
      expect(body.intents[0]!.label).toBe('尋找物資')
      expect(body.intents[0]!.urgencyLabel).toBe('迫切')
      expect(body.intents[0]!.reasonZh).toContain('魚類')
      expect(body.intents[1]!.kind).toBe('survival')
      expect(body.intents[1]!.urgencyLabel).toBe('迫切')
      expect(body.lessons).toHaveLength(1)
      expect(body.lessons[0]!.kind).toBe('economic')
      expect(body.lessons[0]!.text).toContain('物資')
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns 404 for an unknown NPC', async () => {
    const { db, server, token } = await setupApp()
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/npc.nobody/intent`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('NPC_NOT_FOUND')
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns 410 for a deceased NPC', async () => {
    const { db, server, token } = await setupApp({ deceased: true })
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${ALIVE_PROFILE.id}/intent`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(410)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('NPC_DECEASED')
    } finally {
      await close(server)
      db.close()
    }
  })
})

describe('GET /npc/:id/beliefs (MindSheet)', () => {
  it('returns 200 with top beliefs (confidence label + kind) for a living NPC', async () => {
    const { db, server, token } = await setupApp()
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${ALIVE_PROFILE.id}/beliefs`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        beliefs: Array<{ label: string; confidenceLabel: string; kind: string }>
      }
      expect(body.beliefs.length).toBeGreaterThan(0)
      // sorted by confidence desc: goods_scarcity (80) first
      expect(body.beliefs[0]!.kind).toBe('goods_scarcity')
      expect(body.beliefs[0]!.confidenceLabel).toBe('她確信')
      expect(body.beliefs[0]!.label).toContain('魚類')
      expect(body.beliefs[1]!.kind).toBe('tile_safety')
      expect(body.beliefs[1]!.confidenceLabel).toBe('她相信')
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns 200 with empty beliefs array when NPC has no beliefs', async () => {
    const { db, server, token } = await setupApp()
    try {
      const addr = server.address() as AddressInfo
      // use a known NPC id that returns empty beliefs in the mock
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${ALIVE_PROFILE.id}/beliefs`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(200)
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns 404 for an unknown NPC', async () => {
    const { db, server, token } = await setupApp()
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/npc.nobody/beliefs`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(404)
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns 410 for a deceased NPC', async () => {
    const { db, server, token } = await setupApp({ deceased: true })
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${ALIVE_PROFILE.id}/beliefs`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(410)
    } finally {
      await close(server)
      db.close()
    }
  })
})

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}
