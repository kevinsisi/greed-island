// GM-or-admin observability over NPC origin (manual vs autonomously-born),
// birth feed, household feed, and an explicit deaths placeholder.
//
// Read-only projection over runtime + EventStore. Submits no commands, appends
// no events, executes off the tick path.
//
// Spec: openspec/changes/gm-npc-dashboard/specs/gm-npc-dashboard/spec.md

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import type { AccountStore } from './accounts.js'
import { requireRole, type AuthConfig } from './auth.js'

const RECENT_FEED_LIMIT = 20
const DEATHS_REASON = 'NPC_DECEASED command not yet implemented'
const DEATHS_PLANNED_AT = 'WORLD_CAPABILITIES.md §35.2 (Phase 5 — Persistent Combat Consequences)'

export type AdminNpcsRouterInput = Readonly<{
  runtime: SimulationRuntime
  eventStore: SqliteEventStore
  accounts: AccountStore
  authConfig: AuthConfig
}>

export type NpcStatsBirth = Readonly<{
  tick: number
  childId: string
  householdId: string
  nameZh: string
  nameEn: string
  motivation: string | null
}>

export type NpcStatsHousehold = Readonly<{
  tick: number
  householdId: string
  partnerNpcIds: readonly string[]
  homeTileId: string
  motivation: string | null
}>

export type NpcStatsResponse = Readonly<{
  totalNpcs: number
  byOrigin: Readonly<{ manual: number; born: number }>
  births: Readonly<{ totalEventCount: number; recent: readonly NpcStatsBirth[] }>
  households: Readonly<{ totalEventCount: number; recent: readonly NpcStatsHousehold[] }>
  deaths: Readonly<{ available: false; reason: string; plannedAt: string }>
  generatedAtTick: number
}>

export function createAdminNpcsRouter(input: AdminNpcsRouterInput): Router {
  const router = Router()
  const requireGmOrAdmin = requireRole(input.authConfig, input.accounts, 'gm', 'admin')

  router.get('/admin/npc-stats', requireGmOrAdmin, (_req: Request, res: Response) => {
    res.json(buildNpcStats(input))
  })

  return router
}

export function buildNpcStats(input: {
  runtime: SimulationRuntime
  eventStore: SqliteEventStore
}): NpcStatsResponse {
  const { runtime, eventStore } = input

  const npcs = runtime.getNpcs()
  const totalNpcs = npcs.length
  const manualNpcIds = new Set<string>(runtime.getManualNpcIds())
  const manual = npcs.reduce((acc, npc) => (manualNpcIds.has(npc.id) ? acc + 1 : acc), 0)
  const born = totalNpcs - manual

  const generatedAtTick = runtime.getSnapshot().tick

  const birthsTotalEventCount = eventStore.countEventsByKind('NPC_CHILD_BORN')
  const householdsTotalEventCount = eventStore.countEventsByKind('NPC_HOUSEHOLD_FORMED')

  const birthRows =
    generatedAtTick > 0
      ? eventStore.readEventsByTickWindow({
          eventTypes: ['NPC_CHILD_BORN'],
          sinceTick: 0,
          untilTick: generatedAtTick,
          limit: RECENT_FEED_LIMIT,
        }).events
      : []
  const recentBirths = [...birthRows]
    .reverse()
    .map(toBirthRow)
    .filter((row): row is NpcStatsBirth => row !== null)

  const householdRows =
    generatedAtTick > 0
      ? eventStore.readEventsByTickWindow({
          eventTypes: ['NPC_HOUSEHOLD_FORMED'],
          sinceTick: 0,
          untilTick: generatedAtTick,
          limit: RECENT_FEED_LIMIT,
        }).events
      : []
  const recentHouseholds = [...householdRows]
    .reverse()
    .map(toHouseholdRow)
    .filter((row): row is NpcStatsHousehold => row !== null)

  return {
    totalNpcs,
    byOrigin: { manual, born },
    births: { totalEventCount: birthsTotalEventCount, recent: recentBirths },
    households: { totalEventCount: householdsTotalEventCount, recent: recentHouseholds },
    deaths: { available: false, reason: DEATHS_REASON, plannedAt: DEATHS_PLANNED_AT },
    generatedAtTick,
  }
}

type EventLike = Readonly<{
  tick?: number
  payload: unknown
}>

function toBirthRow(event: EventLike): NpcStatsBirth | null {
  const tick = event.tick ?? 0
  const payload = event.payload as
    | {
        childId?: unknown
        householdId?: unknown
        nameZh?: unknown
        nameEn?: unknown
        motivation?: { explanation?: unknown }
      }
    | null
    | undefined
  if (!payload || typeof payload !== 'object') return null
  const childId = typeof payload.childId === 'string' ? payload.childId : null
  const householdId = typeof payload.householdId === 'string' ? payload.householdId : null
  if (!childId || !householdId) return null
  const nameZh = typeof payload.nameZh === 'string' ? payload.nameZh : ''
  const nameEn = typeof payload.nameEn === 'string' ? payload.nameEn : ''
  const motivation =
    payload.motivation && typeof payload.motivation === 'object' && typeof payload.motivation.explanation === 'string'
      ? payload.motivation.explanation
      : null
  return { tick, childId, householdId, nameZh, nameEn, motivation }
}

function toHouseholdRow(event: EventLike): NpcStatsHousehold | null {
  const tick = event.tick ?? 0
  const payload = event.payload as
    | {
        householdId?: unknown
        partnerNpcIds?: unknown
        homeTileId?: unknown
        motivation?: { explanation?: unknown }
      }
    | null
    | undefined
  if (!payload || typeof payload !== 'object') return null
  const householdId = typeof payload.householdId === 'string' ? payload.householdId : null
  if (!householdId) return null
  const partnerNpcIds =
    Array.isArray(payload.partnerNpcIds) && payload.partnerNpcIds.every((id) => typeof id === 'string')
      ? (payload.partnerNpcIds as readonly string[])
      : []
  const homeTileId = typeof payload.homeTileId === 'string' ? payload.homeTileId : ''
  const motivation =
    payload.motivation && typeof payload.motivation === 'object' && typeof payload.motivation.explanation === 'string'
      ? payload.motivation.explanation
      : null
  return { tick, householdId, partnerNpcIds, homeTileId, motivation }
}
