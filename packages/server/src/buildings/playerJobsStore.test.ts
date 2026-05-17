import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { initializeAccountSchema } from '../http/accounts.js'
import type { Event } from '../kernel/types.js'
import { PlayerJobsStore } from './playerJobsStore.js'

describe('PlayerJobsStore EventLog projections', () => {
  it('projects PLAYER_ENERGY_SET idempotently from committed events', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initializeAccountSchema(db)
    db.prepare(
      `INSERT INTO accounts (id, email, password_hash, created_at, role)
       VALUES (1, 'energy@example.test', 'hash', 1, 'player')`
    ).run()
    const store = new PlayerJobsStore(db)
    const energySet = event('PLAYER_ENERGY_SET', {
      playerAccountId: '1',
      energy: 0,
      reason: 'combat_defeat',
      sourceCombatId: 'combat_energy',
      narration: 'defeat',
    })

    store.projectEvent(energySet)
    store.projectEvent(energySet)

    expect(store.getWallet(1)).toMatchObject({ energy: 0, updatedAt: 1234 })

    db.close()
  })

  it('does not replay older energy projection over newer wallet state', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initializeAccountSchema(db)
    db.prepare(
      `INSERT INTO accounts (id, email, password_hash, created_at, role)
       VALUES (1, 'energy@example.test', 'hash', 1, 'player')`
    ).run()
    const store = new PlayerJobsStore(db)
    store.setEnergy(1, 40)
    const newer = store.getWallet(1)
    const oldEnergySet = event('PLAYER_ENERGY_SET', {
      playerAccountId: '1',
      energy: 0,
      reason: 'combat_defeat',
      sourceCombatId: 'combat_energy',
      narration: 'old defeat',
    })

    store.projectEvent(oldEnergySet)

    expect(store.getWallet(1)).toMatchObject({ energy: 40, updatedAt: newer.updatedAt })

    db.close()
  })
})

function event(eventType: string, data: Record<string, unknown>): Event {
  return {
    sequence: 1,
    eventId: `event_${eventType}`,
    eventType,
    occurredAt: 1234,
    actorId: '1',
    commandId: `cmd_${eventType}`,
    tick: 1,
    payload: { actorType: 'player', data, narration: data.narration ?? null },
    rulesetVersion: 'test',
    version: 1,
    deterministicKey: `key_${eventType}`,
  }
}
