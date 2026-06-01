import type { Event } from '../kernel/types.js'
import type { NpcProfile } from '../npcs/types.js'
import type { NpcMortalityProjection } from './npcMortality.js'

export type NpcHeirRecord = Readonly<{
  householdId: string
  deceasedNpcId: string
  heirNpcId: string
  assignedAtTick: number
}>

const NPC_HEIR_ASSIGNED = 'NPC_HEIR_ASSIGNED'
const NPC_MATURED = 'NPC_MATURED'

export class NpcLineageProjection {
  private readonly seedProfiles: readonly NpcProfile[]
  private householdMap = new Map<string, string>()
  private membersByHousehold = new Map<string, string[]>()
  private heirRecords = new Map<string, NpcHeirRecord[]>()

  constructor(profiles: readonly NpcProfile[]) {
    this.seedProfiles = profiles
    this.resetMembersFromProfiles()
  }

  project(event: Event): void {
    if (event.eventType === NPC_MATURED) {
      const raw = event.payload as Record<string, unknown> | null
      if (!raw) return
      const p = (typeof raw['data'] === 'object' && raw['data'] !== null ? raw['data'] : raw) as Record<string, unknown>
      if (typeof p['npcId'] !== 'string' || typeof p['householdId'] !== 'string') return
      this.addMemberToHousehold(p['npcId'], p['householdId'])
      return
    }
    if (event.eventType !== NPC_HEIR_ASSIGNED) return
    const raw = event.payload as Record<string, unknown> | null
    if (!raw) return
    // LivingWorldEventPayload wraps command fields under `data`; fallback to
    // flat layout used in some tests.
    const p = (typeof raw['data'] === 'object' && raw['data'] !== null ? raw['data'] : raw) as Record<string, unknown>
    if (
      typeof p['householdId'] !== 'string' ||
      typeof p['deceasedNpcId'] !== 'string' ||
      typeof p['heirNpcId'] !== 'string' ||
      typeof p['assignedAtTick'] !== 'number'
    ) return
    const record: NpcHeirRecord = {
      householdId: p['householdId'],
      deceasedNpcId: p['deceasedNpcId'],
      heirNpcId: p['heirNpcId'],
      assignedAtTick: p['assignedAtTick'],
    }
    const existing = this.heirRecords.get(p['householdId']) ?? []
    existing.push(record)
    this.heirRecords.set(p['householdId'], existing)
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.resetMembersFromProfiles()
    this.heirRecords = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  householdId(npcId: string): string {
    return this.householdMap.get(npcId) ?? npcId
  }

  membersOf(hId: string): readonly string[] {
    return this.membersByHousehold.get(hId) ?? []
  }

  heirHistory(hId: string): readonly NpcHeirRecord[] {
    return this.heirRecords.get(hId) ?? []
  }

  /** Returns living household members sorted by bornAtTick ascending (oldest first). */
  livingMembersOf(hId: string, mortality: NpcMortalityProjection): readonly string[] {
    return this.membersOf(hId).filter((id) => !mortality.isDeceased(id))
  }

  private resetMembersFromProfiles(): void {
    this.householdMap = new Map()
    this.membersByHousehold = new Map()
    for (const profile of this.seedProfiles) {
      const hId = typeof profile.personality['householdId'] === 'string'
        ? profile.personality['householdId']
        : profile.id
      this.addMemberToHousehold(profile.id, hId)
    }
  }

  private addMemberToHousehold(npcId: string, householdId: string): void {
    this.householdMap.set(npcId, householdId)
    const members = this.membersByHousehold.get(householdId) ?? []
    if (!members.includes(npcId)) {
      members.push(npcId)
      this.membersByHousehold.set(householdId, members)
    }
  }
}
