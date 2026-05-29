// v0.87.3 — every player-interaction endpoint refuses to talk to deceased NPCs.
//
// Covers `/interact`, `/dialog-hold`, `/greet`, `/intervene` (both partners).
// `/history` is intentionally exempt: post-mortem memory lookup stays accessible.
//
// Spec: openspec/changes/deceased-npc-leaves-active-world/specs/deceased-npc-isolation/spec.md

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

const PROFILE: NpcProfile = {
  id: 'npc.dead.1',
  name: { zh: '已逝者', en: 'Departed' },
  role: { zh: '舊街坊', en: 'old neighbor' },
  defaultLocation: 't_central',
  routine: [],
  triggers: [],
  memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
  personality: { trustBase: 50, patience: 0.8 },
}

const ALIVE_PROFILE: NpcProfile = {
  ...PROFILE,
  id: 'npc.alive.1',
  name: { zh: '在世者', en: 'Living' },
}

function buildRuntime(deceasedIds: string[]): SimulationRuntime {
  const dead = new Set(deceasedIds)
  return {
    findProfile: (npcId: string) => {
      if (npcId === PROFILE.id) return PROFILE
      if (npcId === ALIVE_PROFILE.id) return ALIVE_PROFILE
      return null
    },
    getCurrentTick: () => 100,
    getNpcMortalityProjection: () => ({
      isDeceased: (npcId: string) => dead.has(npcId),
    }),
    holdNpcForPlayerDialog: () => ({ npcId: PROFILE.id, tick: 100, expiresAtTick: 200 }),
    getNpcs: () => [],
    getNpcBuildingId: () => null,
    submitLivingWorldCommand: () => null,
  } as unknown as SimulationRuntime
}

async function setupApp(deceasedIds: string[]) {
  const db = new Database(':memory:')
  const accounts = new AccountStore(db, 4)
  const store = new PlayerStateStore(db)
  const settings = new SettingsStore(db)
  const account = await accounts.createAccount('mourner@example.test', 'pw123456')
  const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
  const runtime = buildRuntime(deceasedIds)
  const app = express()
  app.use(express.json())
  app.use(createNpcRouter({ runtime, store, settings, accounts, authConfig }))
  const server = await listen(app)
  const token = jwt.sign(
    { sub: account.id, email: account.email, role: account.role },
    authConfig.jwtSecret,
  )
  return { db, server, token, store }
}

describe('npc router — deceased NPC gate (v0.87.3)', () => {
  it('returns 410 NPC_DECEASED on POST /interact for a deceased NPC', async () => {
    const { db, server, token } = await setupApp([PROFILE.id])
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${PROFILE.id}/interact`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: '你還在嗎？' }),
      })
      expect(res.status).toBe(410)
      const body = (await res.json()) as { error: string; message: string }
      expect(body.error).toBe('NPC_DECEASED')
      expect(body.message).toContain('已經不在')
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns 410 on POST /dialog-hold for a deceased NPC', async () => {
    const { db, server, token } = await setupApp([PROFILE.id])
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${PROFILE.id}/dialog-hold`, {
        method: 'POST',
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

  it('returns 410 on GET /greet for a deceased NPC', async () => {
    const { db, server, token } = await setupApp([PROFILE.id])
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${PROFILE.id}/greet`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(410)
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns 410 on POST /intervene when either NPC is deceased', async () => {
    const { db, server, token } = await setupApp([PROFILE.id])
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/intervene`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ npcA: ALIVE_PROFILE.id, npcB: PROFILE.id, mode: 'mediate' }),
      })
      expect(res.status).toBe(410)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('NPC_DECEASED')
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns 410 on POST /intervene when the FIRST NPC is deceased', async () => {
    const { db, server, token } = await setupApp([ALIVE_PROFILE.id])
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/intervene`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ npcA: ALIVE_PROFILE.id, npcB: PROFILE.id, mode: 'mediate' }),
      })
      expect(res.status).toBe(410)
    } finally {
      await close(server)
      db.close()
    }
  })

  it('keeps GET /history accessible for a deceased NPC (read-only memory)', async () => {
    const { db, server, token, store } = await setupApp([PROFILE.id])
    try {
      // seed a historical personal event so /history has something to return
      store.appendPersonalEvent({
        accountId: 1,
        npcId: PROFILE.id,
        intent: 'ask',
        playerMessage: '生前談過的話',
        lineZh: '生前的回應',
        lineEn: 'a line from before',
        tick: 50,
        trustAfter: 55,
      })
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${PROFILE.id}/history`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { events: Array<{ playerMessage: string }> }
      expect(body.events.length).toBeGreaterThan(0)
      expect(body.events[0]!.playerMessage).toBe('生前談過的話')
    } finally {
      await close(server)
      db.close()
    }
  })

  it('still routes successfully for a living NPC after the gate', async () => {
    const { db, server, token } = await setupApp([])
    try {
      const addr = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${addr.port}/npc/${PROFILE.id}/dialog-hold`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { held: boolean }
      expect(body.held).toBe(true)
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
