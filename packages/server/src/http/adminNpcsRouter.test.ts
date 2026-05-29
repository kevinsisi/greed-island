import Database from 'better-sqlite3'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'

import { AccountStore, type AccountRole } from './accounts.js'
import type { AuthConfig } from './auth.js'
import { createAdminNpcsRouter, buildNpcStats } from './adminNpcsRouter.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import type { SimulationRuntime } from '../sim/runtime.js'

const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }

function fakeRuntime(input: {
  manualIds: readonly string[]
  npcIds: readonly string[]
  tick: number
}): SimulationRuntime {
  return {
    getNpcs: () => input.npcIds.map((id) => ({ id } as unknown)) as never,
    // v0.87.3: admin npc-stats switched to getNpcsIncludingDeceased so the
    // origin counts include deceased entries. Tests model an all-living roster.
    getNpcsIncludingDeceased: () => input.npcIds.map((id) => ({ id } as unknown)) as never,
    getManualNpcIds: () => input.manualIds,
    getSnapshot: () => ({ tick: input.tick } as never),
  } as unknown as SimulationRuntime
}

function seedBirthEvent(eventStore: SqliteEventStore, tick: number, childId: string): void {
  eventStore.appendEvents([
    {
      eventId: `evt_birth_${tick}_${childId}`,
      eventType: 'NPC_CHILD_BORN',
      occurredAt: 0,
      actorId: 'system',
      payload: {
        householdId: `hh_${childId}`,
        childId,
        nameZh: childId,
        nameEn: childId,
        narration: '',
        motivation: { explanation: `born at tick ${tick}` },
      },
      deterministicKey: `evt_birth_${tick}_${childId}`,
      version: 1,
      tick,
    },
  ])
}

function seedHouseholdEvent(
  eventStore: SqliteEventStore,
  tick: number,
  householdId: string,
  partners: readonly [string, string]
): void {
  eventStore.appendEvents([
    {
      eventId: `evt_hh_${tick}_${householdId}`,
      eventType: 'NPC_HOUSEHOLD_FORMED',
      occurredAt: 0,
      actorId: 'system',
      payload: {
        householdId,
        partnerNpcIds: partners,
        homeTileId: 't_central',
        narration: '',
        motivation: { explanation: `formed at tick ${tick}` },
      },
      deterministicKey: `evt_hh_${tick}_${householdId}`,
      version: 1,
      tick,
    },
  ])
}

describe('admin npcs router — buildNpcStats', () => {
  it('reports manual-only origin when no born NPCs exist and empty event log', () => {
    const db = new Database(':memory:')
    try {
      const eventStore = new SqliteEventStore(db)
      const runtime = fakeRuntime({
        manualIds: ['a', 'b', 'c'],
        npcIds: ['a', 'b', 'c'],
        tick: 100,
      })
      const stats = buildNpcStats({ runtime, eventStore })
      expect(stats.totalNpcs).toBe(3)
      expect(stats.byOrigin).toEqual({ manual: 3, born: 0 })
      expect(stats.births.totalEventCount).toBe(0)
      expect(stats.births.recent).toEqual([])
      expect(stats.households.totalEventCount).toBe(0)
      expect(stats.households.recent).toEqual([])
      expect(stats.deaths.totalEventCount).toBe(0)
      expect(stats.deaths.recent).toEqual([])
      expect(stats.matured.totalEventCount).toBe(0)
      expect(stats.matured.recent).toEqual([])
      expect(stats.generatedAtTick).toBe(100)
    } finally {
      db.close()
    }
  })

  it('counts born NPCs as those not in manual id set', () => {
    const db = new Database(':memory:')
    try {
      const eventStore = new SqliteEventStore(db)
      const runtime = fakeRuntime({
        manualIds: ['a', 'b'],
        npcIds: ['a', 'b', 'child_x'],
        tick: 50,
      })
      const stats = buildNpcStats({ runtime, eventStore })
      expect(stats.byOrigin).toEqual({ manual: 2, born: 1 })
    } finally {
      db.close()
    }
  })

  it('returns recent births descending by tick with mapped payload', () => {
    const db = new Database(':memory:')
    try {
      const eventStore = new SqliteEventStore(db)
      seedBirthEvent(eventStore, 10, 'child_a')
      seedBirthEvent(eventStore, 20, 'child_b')
      seedBirthEvent(eventStore, 30, 'child_c')

      const runtime = fakeRuntime({
        manualIds: ['parent'],
        npcIds: ['parent'],
        tick: 100,
      })
      const stats = buildNpcStats({ runtime, eventStore })
      expect(stats.births.totalEventCount).toBe(3)
      expect(stats.births.recent.map((r) => r.tick)).toEqual([30, 20, 10])
      const newest = stats.births.recent[0]
      expect(newest?.childId).toBe('child_c')
      expect(newest?.householdId).toBe('hh_child_c')
      expect(newest?.motivation).toMatch(/born at tick 30/)
    } finally {
      db.close()
    }
  })

  it('returns recent households descending by tick with mapped payload', () => {
    const db = new Database(':memory:')
    try {
      const eventStore = new SqliteEventStore(db)
      seedHouseholdEvent(eventStore, 5, 'hh1', ['alice', 'bob'])
      seedHouseholdEvent(eventStore, 7, 'hh2', ['carol', 'dave'])

      const runtime = fakeRuntime({
        manualIds: ['alice', 'bob', 'carol', 'dave'],
        npcIds: ['alice', 'bob', 'carol', 'dave'],
        tick: 80,
      })
      const stats = buildNpcStats({ runtime, eventStore })
      expect(stats.households.totalEventCount).toBe(2)
      expect(stats.households.recent.map((r) => r.tick)).toEqual([7, 5])
      const newest = stats.households.recent[0]
      expect(newest?.householdId).toBe('hh2')
      expect(newest?.partnerNpcIds).toEqual(['carol', 'dave'])
      expect(newest?.homeTileId).toBe('t_central')
    } finally {
      db.close()
    }
  })

  it('returns empty recent feeds when generatedAtTick is 0', () => {
    const db = new Database(':memory:')
    try {
      const eventStore = new SqliteEventStore(db)
      const runtime = fakeRuntime({ manualIds: [], npcIds: [], tick: 0 })
      const stats = buildNpcStats({ runtime, eventStore })
      expect(stats.births.recent).toEqual([])
      expect(stats.households.recent).toEqual([])
    } finally {
      db.close()
    }
  })
})

describe('admin npcs router — auth gate', () => {
  it('rejects anonymous, rejects player, accepts gm, accepts admin', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const eventStore = new SqliteEventStore(db)
    const runtime = fakeRuntime({ manualIds: ['alpha'], npcIds: ['alpha'], tick: 1 })

    // First account becomes admin automatically (see AccountStore.createAccount).
    // Burn one account so subsequent ones default to 'player', then assign roles explicitly.
    await accounts.createAccount('seed-admin@example.test', 'password123')
    const playerAccount = await accounts.createAccount('player@example.test', 'password123')
    const gmAccount = await accounts.createAccount('gm@example.test', 'password123')
    const adminAccount = await accounts.createAccount('admin@example.test', 'password123')
    accounts.setRole(gmAccount.id, 'gm')
    accounts.setRole(adminAccount.id, 'admin')

    const app = express()
    app.use(express.json())
    app.use(createAdminNpcsRouter({ runtime, eventStore, accounts, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const url = `http://127.0.0.1:${address.port}/admin/npc-stats`

      const anon = await fetch(url)
      expect(anon.status).toBe(401)

      expect(await fetchWithRole(url, accounts, playerAccount.id, 'player')).toBe(403)
      expect(await fetchWithRole(url, accounts, gmAccount.id, 'gm')).toBe(200)
      expect(await fetchWithRole(url, accounts, adminAccount.id, 'admin')).toBe(200)
    } finally {
      await close(server)
      db.close()
    }
  })
})

async function fetchWithRole(
  url: string,
  accounts: AccountStore,
  userId: number,
  role: AccountRole
): Promise<number> {
  const stored = accounts.findById(userId)
  if (!stored) throw new Error('account not found in test setup')
  const token = jwt.sign({ sub: stored.id, email: stored.email, role }, authConfig.jwtSecret)
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  return res.status
}

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
