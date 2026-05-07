// Player jobs + tide-coin (gold) wallet — Living World v0.10.0.

import type Database from 'better-sqlite3'
import type { PlayerJobRecord, Shift } from './types.js'
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../config/world.js'

type DatabaseConnection = Database.Database

export const SHIFT_WINDOWS: Readonly<Record<Shift, readonly [number, number]>> = {
  morning: [TICKS_PER_HOUR * 6, TICKS_PER_HOUR * 12],
  afternoon: [TICKS_PER_HOUR * 12, TICKS_PER_HOUR * 18],
  night: [TICKS_PER_HOUR * 18, TICKS_PER_HOUR * 24]
}

export const DAILY_SHIFT_COOLDOWN_TICKS = TICKS_PER_DAY - TICKS_PER_HOUR

type WalletRow = Readonly<{
  account_id: number
  gold: number
  energy: number
  updated_at: number
}>

export type WalletRecord = Readonly<{
  accountId: number
  gold: number
  energy: number
  updatedAt: number
}>

type PlayerJobRow = Readonly<{
  account_id: number
  building_id: string
  shift: string
  hired_at_tick: number
  total_earnings: number
  shifts_completed: number
  last_shift_tick: number
}>

export const ENERGY_MAX = 100
export const ENERGY_MIN = 0

export function initializePlayerJobsSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_wallet (
      account_id INTEGER PRIMARY KEY,
      gold INTEGER NOT NULL DEFAULT 0,
      energy INTEGER NOT NULL DEFAULT 100,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_jobs (
      account_id INTEGER NOT NULL,
      building_id TEXT NOT NULL,
      shift TEXT NOT NULL,
      hired_at_tick INTEGER NOT NULL,
      total_earnings INTEGER NOT NULL DEFAULT 0,
      shifts_completed INTEGER NOT NULL DEFAULT 0,
      last_shift_tick INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (account_id, building_id, shift),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_player_jobs_account ON player_jobs(account_id);
    CREATE INDEX IF NOT EXISTS idx_player_jobs_building ON player_jobs(building_id);
  `)
}

export class PlayerJobsStore {
  constructor(private readonly db: DatabaseConnection) {
    initializePlayerJobsSchema(db)
  }

  getWallet(accountId: number): WalletRecord {
    const row = this.db
      .prepare('SELECT * FROM player_wallet WHERE account_id = ?')
      .get(accountId) as WalletRow | undefined
    if (!row) {
      const seedAt = Date.now()
      this.db
        .prepare(
          'INSERT INTO player_wallet (account_id, gold, energy, updated_at) VALUES (?, 0, ?, ?)'
        )
        .run(accountId, ENERGY_MAX, seedAt)
      return { accountId, gold: 0, energy: ENERGY_MAX, updatedAt: seedAt }
    }
    return toWalletRecord(row)
  }

  addGold(accountId: number, delta: number): WalletRecord {
    const current = this.getWallet(accountId)
    const next = Math.max(0, current.gold + Math.floor(delta))
    const updatedAt = Date.now()
    this.db
      .prepare(
        'UPDATE player_wallet SET gold = ?, updated_at = ? WHERE account_id = ?'
      )
      .run(next, updatedAt, accountId)
    return { ...current, gold: next, updatedAt }
  }

  setEnergy(accountId: number, energy: number): WalletRecord {
    const current = this.getWallet(accountId)
    const clamped = Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, Math.floor(energy)))
    const updatedAt = Date.now()
    this.db
      .prepare(
        'UPDATE player_wallet SET energy = ?, updated_at = ? WHERE account_id = ?'
      )
      .run(clamped, updatedAt, accountId)
    return { ...current, energy: clamped, updatedAt }
  }

  addEnergy(accountId: number, delta: number): WalletRecord {
    const current = this.getWallet(accountId)
    const next = Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, current.energy + Math.floor(delta)))
    return this.setEnergy(accountId, next)
  }

  listJobs(accountId: number): PlayerJobRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM player_jobs WHERE account_id = ?')
      .all(accountId) as PlayerJobRow[]
    return rows.map(toJobRecord)
  }

  getJob(accountId: number, buildingId: string, shift: Shift): PlayerJobRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM player_jobs WHERE account_id = ? AND building_id = ? AND shift = ?'
      )
      .get(accountId, buildingId, shift) as PlayerJobRow | undefined
    return row ? toJobRecord(row) : null
  }

  listEmployeesOf(buildingId: string, shift: Shift): PlayerJobRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM player_jobs WHERE building_id = ? AND shift = ?')
      .all(buildingId, shift) as PlayerJobRow[]
    return rows.map(toJobRecord)
  }

  apply(input: {
    accountId: number
    buildingId: string
    shift: Shift
    tick: number
  }): PlayerJobRecord {
    const existing = this.getJob(input.accountId, input.buildingId, input.shift)
    if (existing) return existing
    this.db
      .prepare(
        `INSERT INTO player_jobs (account_id, building_id, shift, hired_at_tick, total_earnings, shifts_completed, last_shift_tick)
         VALUES (?, ?, ?, ?, 0, 0, 0)`
      )
      .run(input.accountId, input.buildingId, input.shift, input.tick)
    return {
      accountId: input.accountId,
      buildingId: input.buildingId,
      shift: input.shift,
      hiredAtTick: input.tick,
      totalEarnings: 0,
      shiftsCompleted: 0,
      lastShiftTick: 0
    }
  }

  quit(accountId: number, buildingId: string, shift: Shift): boolean {
    const result = this.db
      .prepare(
        'DELETE FROM player_jobs WHERE account_id = ? AND building_id = ? AND shift = ?'
      )
      .run(accountId, buildingId, shift)
    return result.changes > 0
  }

  recordShiftCompletion(input: {
    accountId: number
    buildingId: string
    shift: Shift
    tick: number
    wage: number
  }): PlayerJobRecord {
    const existing = this.getJob(input.accountId, input.buildingId, input.shift)
    if (!existing) {
      throw new Error(
        `Player ${input.accountId} not employed at ${input.buildingId}/${input.shift}`
      )
    }
    const totalEarnings = existing.totalEarnings + input.wage
    const shiftsCompleted = existing.shiftsCompleted + 1
    this.db
      .prepare(
        `UPDATE player_jobs SET total_earnings = ?, shifts_completed = ?, last_shift_tick = ?
         WHERE account_id = ? AND building_id = ? AND shift = ?`
      )
      .run(
        totalEarnings,
        shiftsCompleted,
        input.tick,
        input.accountId,
        input.buildingId,
        input.shift
      )
    return {
      ...existing,
      totalEarnings,
      shiftsCompleted,
      lastShiftTick: input.tick
    }
  }
}

function toWalletRecord(row: WalletRow): WalletRecord {
  return {
    accountId: row.account_id,
    gold: row.gold,
    energy: row.energy,
    updatedAt: row.updated_at
  }
}

function toJobRecord(row: PlayerJobRow): PlayerJobRecord {
  return {
    accountId: row.account_id,
    buildingId: row.building_id,
    shift: row.shift as Shift,
    hiredAtTick: row.hired_at_tick,
    totalEarnings: row.total_earnings,
    shiftsCompleted: row.shifts_completed,
    lastShiftTick: row.last_shift_tick
  }
}

export function shiftFor(currentTick: number): Shift | null {
  const tickOfDay = ((currentTick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY
  for (const shift of ['morning', 'afternoon', 'night'] as const) {
    const [from, to] = SHIFT_WINDOWS[shift]
    if (tickOfDay >= from && tickOfDay < to) return shift
  }
  return null
}
