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
import { displayChildName } from '../data/npcChildNamePool.js'

const RECENT_FEED_LIMIT = 20

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

export type NpcStatsDeath = Readonly<{
  tick: number
  npcId: string
  tileId: string
  householdId: string
  narration: string
}>

export type NpcStatsMatured = Readonly<{
  tick: number
  npcId: string
  householdId: string
  homeTileId: string
  nameZh: string
  nameEn: string
}>

export type NpcStatsResponse = Readonly<{
  totalNpcs: number
  byOrigin: Readonly<{ manual: number; born: number }>
  births: Readonly<{ totalEventCount: number; recent: readonly NpcStatsBirth[] }>
  households: Readonly<{ totalEventCount: number; recent: readonly NpcStatsHousehold[] }>
  matured: Readonly<{ totalEventCount: number; recent: readonly NpcStatsMatured[] }>
  deaths: Readonly<{ totalEventCount: number; recent: readonly NpcStatsDeath[] }>
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

  // Admin npc-stats counts the full roster (living + deceased) for byOrigin reporting.
  const npcs = runtime.getNpcsIncludingDeceased()
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

  const maturedTotalEventCount = eventStore.countEventsByKind('NPC_MATURED')
  const maturedRows =
    generatedAtTick > 0
      ? eventStore.readEventsByTickWindow({
          eventTypes: ['NPC_MATURED'],
          sinceTick: 0,
          untilTick: generatedAtTick,
          limit: RECENT_FEED_LIMIT,
        }).events
      : []
  const recentMatured = [...maturedRows]
    .reverse()
    .map(toMaturedRow)
    .filter((row): row is NpcStatsMatured => row !== null)

  const deathsTotalEventCount = eventStore.countEventsByKind('NPC_DECEASED')
  const deathRows =
    generatedAtTick > 0
      ? eventStore.readEventsByTickWindow({
          eventTypes: ['NPC_DECEASED'],
          sinceTick: 0,
          untilTick: generatedAtTick,
          limit: RECENT_FEED_LIMIT,
        }).events
      : []
  const recentDeaths = [...deathRows]
    .reverse()
    .map(toDeathRow)
    .filter((row): row is NpcStatsDeath => row !== null)

  return {
    totalNpcs,
    byOrigin: { manual, born },
    births: { totalEventCount: birthsTotalEventCount, recent: recentBirths },
    households: { totalEventCount: householdsTotalEventCount, recent: recentHouseholds },
    matured: { totalEventCount: maturedTotalEventCount, recent: recentMatured },
    deaths: { totalEventCount: deathsTotalEventCount, recent: recentDeaths },
    generatedAtTick,
  }
}

function toMaturedRow(event: EventLike): NpcStatsMatured | null {
  const tick = event.tick ?? 0
  const outer = event.payload as { data?: unknown } | null | undefined
  if (!outer || typeof outer !== 'object') return null
  const payload = (outer.data ?? outer) as
    | {
        npcId?: unknown
        householdId?: unknown
        homeTileId?: unknown
        nameZh?: unknown
        nameEn?: unknown
      }
    | null
    | undefined
  if (!payload || typeof payload !== 'object') return null
  const npcId = typeof payload.npcId === 'string' ? payload.npcId : null
  if (!npcId) return null
  const householdId = typeof payload.householdId === 'string' ? payload.householdId : ''
  const homeTileId = typeof payload.homeTileId === 'string' ? payload.homeTileId : ''
  const rawNameZh = typeof payload.nameZh === 'string' ? payload.nameZh : ''
  const rawNameEn = typeof payload.nameEn === 'string' ? payload.nameEn : ''
  const { nameZh, nameEn } = displayChildName({ childId: npcId, householdId, nameZh: rawNameZh, nameEn: rawNameEn })
  return { tick, npcId, householdId, homeTileId, nameZh, nameEn }
}

type EventLike = Readonly<{
  tick?: number
  payload: unknown
}>

function toBirthRow(event: EventLike): NpcStatsBirth | null {
  const tick = event.tick ?? 0
  const outer = event.payload as { data?: unknown } | null | undefined
  if (!outer || typeof outer !== 'object') return null
  const payload = (outer.data ?? outer) as
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
  const rawNameZh = typeof payload.nameZh === 'string' ? payload.nameZh : ''
  const rawNameEn = typeof payload.nameEn === 'string' ? payload.nameEn : ''
  const { nameZh, nameEn } = displayChildName({ childId, householdId, nameZh: rawNameZh, nameEn: rawNameEn })
  const motivation =
    payload.motivation && typeof payload.motivation === 'object' && typeof payload.motivation.explanation === 'string'
      ? payload.motivation.explanation
      : null
  return { tick, childId, householdId, nameZh, nameEn, motivation }
}

function toHouseholdRow(event: EventLike): NpcStatsHousehold | null {
  const tick = event.tick ?? 0
  const outer = event.payload as { data?: unknown } | null | undefined
  if (!outer || typeof outer !== 'object') return null
  const payload = (outer.data ?? outer) as
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

function toDeathRow(event: EventLike): NpcStatsDeath | null {
  const tick = event.tick ?? 0
  const outer = event.payload as { data?: unknown } | null | undefined
  if (!outer || typeof outer !== 'object') return null
  const payload = (outer.data ?? outer) as
    | { npcId?: unknown; tileId?: unknown; householdId?: unknown; narration?: unknown }
    | null
    | undefined
  if (!payload || typeof payload !== 'object') return null
  const npcId = typeof payload.npcId === 'string' ? payload.npcId : null
  if (!npcId) return null
  const tileId = typeof payload.tileId === 'string' ? payload.tileId : ''
  const householdId = typeof payload.householdId === 'string' ? payload.householdId : ''
  const narration = typeof payload.narration === 'string' ? payload.narration : ''
  return { tick, npcId, tileId, householdId, narration }
}
