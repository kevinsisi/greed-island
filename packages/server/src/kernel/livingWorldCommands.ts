// Living-world domain command catalog. Every actor in the simulation
// (NPC engine, area-state engine, building runtime, world-event engine,
// weather/season cycle, player) expresses intent as a typed Command in
// this file. The Rule Engine is the only path that turns these
// Commands into typed Events that land in `event_log`.
//
// One file per command would explode the surface area; we keep them
// together because the catalog is closed and short, and the validation
// shape is similar across commands.

import { hashCanonicalJson, toCanonicalJson } from './canonicalJson.js'
import {
  DEFAULT_RULESET_VERSION,
  KERNEL_EVENT_VERSION,
  type Command,
  type EventDraft,
  type RuleRejection,
  type RuleResult
} from './types.js'
import type { Animal } from '../ecosystem/species.js'
import { SKILL_IDS } from '../config/world.js'
import {
  validateCombatPayload,
  type CombatCardCancelPayload,
  type CombatCardPlayPayload,
  type CombatDamagePayload,
  type CombatDefeatPayload,
  type CombatFleeAttemptPayload,
  type CombatHealPayload,
  type CombatPhaseShiftPayload,
  type CombatStatusApplyPayload,
  type CombatStatusEndPayload,
  type CombatStatusTickPayload,
  type CombatTargetLockPayload,
} from '../combat/commands.js'

export const LIVING_WORLD_ACTOR_TYPES = ['player', 'npc', 'system'] as const
export type LivingWorldActorType = (typeof LIVING_WORLD_ACTOR_TYPES)[number]

export const LIVING_WORLD_COMMAND_TYPES = [
  'NPC_MOVE',
  'NPC_ACTIVITY_CHANGE',
  'NPC_STATE_RECORDED',
  'AREA_STATE_RECORDED',
  'BIO_NODE_SEEDED',
  'BIO_NODE_REGREW',
  'BIO_NODE_HARVESTED',
  'NPC_LIFE_GOAL_SET',
  'NPC_HOUSEHOLD_FORMED',
  'NPC_CHILD_BORN',
  'NPC_MATURED',
  'NPC_INHERITANCE_GRANTED',
  'NPC_AGENT_DECISION',
  'NPC_FREEFORM_ACTION_PROPOSED',
  'NPC_RELATIONSHIP_DIMENSION_ADJUSTED',
  'NPC_PRODUCTIVE_ACTION',
  'CONSTRUCTION_INITIATE',
  'CONSTRUCTION_PROJECT_PROGRESS',
  'BUILDING_CONSTRUCTED',
  'BUILDING_DAMAGED',
  'BUILDING_REPAIRED',
  'BUILDING_ABANDONED',
  'MAP_TILE_UNLOCKED',
  'NPC_INTERACT',
  'AREA_PRESSURE',
  'WEATHER_CHANGE',
  'SEASON_CHANGE',
  'WORLD_EVENT_SPAWN',
  'WORLD_EVENT_END',
  'BUILDING_ENTER',
  'BUILDING_LEAVE',
  'RARE_WINDOW_OPEN',
  'RARE_WINDOW_CLOSE',
  'WORLD_TICK',
  'PLAYER_INTERVENE',
  'PLAYER_ENERGY_SET',
  'NPC_DIALOG_HOLD',
  // v0.15.0 — Combat Phase B (single-shot judgement)
  'COMBAT_INITIATE',
  'COMBAT_PLAYER_ACTION',
  'COMBAT_RESOLVE',
  // Combat Phase C Slice 2.4 — register the sub-tick command catalog.
  // Rule-engine execution remains disabled until Slice 2.5 wires these
  // commands into the 5-phase combat pipeline.
  'COMBAT_CARD_PLAY',
  'COMBAT_CARD_CANCEL',
  'COMBAT_DAMAGE',
  'COMBAT_HEAL',
  'COMBAT_STATUS_APPLY',
  'COMBAT_STATUS_TICK',
  'COMBAT_STATUS_END',
  'COMBAT_TARGET_LOCK',
  'COMBAT_PHASE_SHIFT',
  'COMBAT_FLEE_ATTEMPT',
  'COMBAT_DEFEAT',
  // Phase 1 §33.4 — Settlement domain (Layer 3 Civilization Runtime)
  'SETTLEMENT_FORMED',
  // settlement-runtime-v2 Slice 1 — authoritative settlement state events.
  'SETTLEMENT_POPULATION_UPDATED',
  'SETTLEMENT_STORAGE_UPDATED',
  'SETTLEMENT_PRESSURE_UPDATED',
  'SETTLEMENT_STABILITY_CHANGED',
  'SETTLEMENT_DECLINED',
  'SETTLEMENT_RECOVERED',
  'SETTLEMENT_EVACUATION_STARTED',
  // Phase E0.2 — Ecosystem Runtime (Layer 2.5)
  'ANIMAL_SPAWNED',
  // Phase E0.3 — Simple hunting
  'ANIMAL_HUNT_STARTED',
  'ANIMAL_HUNT_RESOLVED',
  'ANIMAL_KILLED',
  // Phase E1.1 — Ecosystem predation
  'ANIMAL_STARVED',
  // Phase E1.2 — Ecosystem reproduction + capacity
  'ANIMAL_REPRODUCED',
  // Phase E1.3 — Ecosystem migration
  'MIGRATION_WAVE_STARTED',
  'ANIMAL_MIGRATED',
  'CARCASS_CREATED',
  'MEAT_HARVESTED',
  'HIDE_COLLECTED',
  'BONE_COLLECTED',
  // Phase E0.4 — Fishery density
  'FISHERY_HARVESTED',
  'FISHERY_COLLAPSED',
  // Phase 2 §35.1 — Goods primitives
  'GOODS_EXTRACTED',
  'GOODS_STORED',
  'GOODS_PROCESSED',
  'GOODS_CONSUMED',
  'GOODS_DESTROYED',
  // Phase 2 §35.2 — Goods logistics
  'TRADE_ROUTE_OPENED',
  'TRADE_ROUTE_CLOSED',
  'GOODS_TRANSPORT_STARTED',
  'GOODS_TRANSPORT_ARRIVED',
  'GOODS_TRANSPORT_LOST',
  // Phase 2 §35.4 — Market formation
  'MARKET_PRICE_DISCOVERED',
  // Phase 3 Slice 1 — NPC rumor propagation
  'NPC_RUMOR_HEARD',
  'NPC_RUMOR_SPREAD',
  // Phase 3 §37.2 — NPC skill learning & mentorship
  'NPC_OBSERVED_SKILL',
  'NPC_MENTORSHIP_STARTED',
  'NPC_MENTORSHIP_COMPLETED',
  // Phase 3 §37.3 — NPC culture & emergent festivals
  'CULTURAL_FESTIVAL_FORMED',
  'CULTURAL_RITUAL_PERFORMED',
  'CULTURAL_NORM_ESTABLISHED',
  // Phase 3 §37.4 — Household shared economy
  'HOUSEHOLD_GOLD_CONTRIBUTED',
  'HOUSEHOLD_GOLD_SPENT',
  'HOUSEHOLD_INHERITANCE_ASSIGNED',
  // Sprint 2B — Animal aggression (hungry predator attacks NPC, retaliation, flee)
  'ANIMAL_TARGETED_NPC',
  'ANIMAL_ATTACKED_NPC',
  'ANIMAL_FLED',
  'ANIMAL_RETALIATED',
  // Sprint 2C — NPC defense coordination
  'NPC_DEFENSE_PARTY_FORMED',
  // Phase E2 — Ecosystem pressure, collapse, and recovery
  'SPECIES_EXTINCTION_WARNING',
  'SPECIES_EXTINCT',
  'SPECIES_RECOVERED',
  'FISHERY_RECOVERED',
  'ECOSYSTEM_PRESSURE_RAISED',
  'ECOSYSTEM_PRESSURE_RECOVERED',
  'FOREST_DEPLETED',
  'FOREST_RECOVERED',
  'BIOME_RECOVERED',
  'SPECIES_POPULATION_SHIFTED',
  'POLLUTION_INCREASED',
  'POLLUTION_RECOVERED',
  'FACTION_ECOLOGY_CONFLICT_STARTED',
  // Phase E3 — Domestication
  'ANIMAL_DOMESTICATED',
  'LIVESTOCK_BRED',
  'LIVESTOCK_SLAUGHTERED',
  'MOUNT_ASSIGNED',
  // Phase E4 — Mythic Ecology
  'LEGENDARY_WORLD_EVENT_SPAWNED',
  'LEGENDARY_WORLD_EVENT_RESOLVED',
  'LEGENDARY_HUNT_STARTED',
  'LEGENDARY_HUNT_CONCLUDED',
  'FOREST_CLEARCUT_ORDERED',
  'FISHING_QUOTA_ENFORCED',
  'INDUSTRIAL_SITE_SABOTAGED',
  'RITUAL_ECOSYSTEM_MANIPULATION',
  // Phase 6 — Player Civilization
  'PLAYER_PICKED_UP_GOODS',
  'PLAYER_TRADED_GOODS',
  'PLAYER_HUNTED_ANIMAL',
  'PLAYER_FISHED',
  'PLAYER_DOMESTICATED_ANIMAL',
  'PLAYER_PROTECTED_REGION',
  'PLAYER_HIRED_NPC',
  'PLAYER_DISMISSED_NPC',
  'PLAYER_SPONSORED_CONSTRUCTION',
  'PLAYER_FOUNDED_SETTLEMENT',
  'PLAYER_CLAIMED_TERRITORY',
  'PLAYER_JOINED_FACTION',
  'PLAYER_LEFT_FACTION',
  'PLAYER_LED_FACTION',
  'PLAYER_PLAYED_CARD',

  // NPC Mortality & Lineage (v0.32.0)
  'NPC_DECEASED',
  'NPC_HEIR_ASSIGNED',
  // Faction Conflict Consequences (v0.33.0)
  'FACTION_TILE_SEIZED',
  'FACTION_NPC_LOYALTY_SHIFTED',
  'FACTION_DOMINANCE_SHIFTED',
  'TERRITORY_CLAIM_CHANGED',
  // NPC Intention Layer (v0.51.0)
  'NPC_INTENT_RESOLVED',
  // NPC Household Migration (v0.74.0)
  'NPC_HOUSEHOLD_MIGRATED',
  // Road Network (v0.75.0)
  'ROAD_CONSTRUCTED',
  'ROAD_DESTROYED',
  // Cards as World Rule Operators (v0.76.0)
  'CARD_RULE_OPERATOR_ACTIVATED',
  'CARD_RULE_OPERATOR_EXPIRED',
  // Phase 5 Persistent Combat Consequences (v0.77.0)
  'NPC_INCAPACITATED_LONG',
  'COMBAT_WITNESS_RECORDED',
  // NPC-to-NPC local market trade (v0.78.0)
  'NPC_GOODS_TRADED',
  // Walls / defenses (v0.80.0)
  'WALL_BUILT',
  'WALL_DEMOLISHED',
  // Household Joint Decisions (v0.81.0)
  'NPC_HOUSEHOLD_JOINT_DECISION',
  // Player Goods Carry (v0.82.0)
  'PLAYER_DEPOSIT_GOODS',
  // Building Upgrade & Capture (v0.83.0)
  'BUILDING_UPGRADED',
  'BUILDING_CAPTURED',
  // Dynamic Tile Generation (v0.84.0)
  'TILE_GENERATED',
] as const
export type LivingWorldCommandType = (typeof LIVING_WORLD_COMMAND_TYPES)[number]

const LIVING_WORLD_COMMAND_TYPE_SET = new Set<string>(LIVING_WORLD_COMMAND_TYPES)
export function isLivingWorldCommandType(value: string): value is LivingWorldCommandType {
  return LIVING_WORLD_COMMAND_TYPE_SET.has(value)
}

export type NpcMoveCmd = Readonly<{
  npcId: string
  from: string
  to: string
  activity: string
  reachedDest: boolean
  motivation?: EventMotivation
  narration: string | null
}>

export type NpcActivityChangeCmd = Readonly<{
  npcId: string
  tile: string
  from: string
  to: string
  motivation?: EventMotivation
  narration: string | null
}>

export type NpcStateRecordedCmd = Readonly<{
  npcId: string
  state: Readonly<Record<string, unknown>>
  narration: string | null
}>

export type AreaStateRecordedCmd = Readonly<{
  tileId: string
  state: Readonly<Record<string, unknown>>
  narration: string | null
}>

export type BioNodeSeededCmd = Readonly<{
  tileId: string
  speciesId: string
  density: number
  capacity: number
  seededAtTick: number
  narration?: string | null
}>

export type BioNodeRegrewCmd = Readonly<{
  tileId: string
  speciesId: string
  densityBefore: number
  densityAfter: number
  capacity: number
  tick: number
  narration?: string | null
}>

export type BioNodeHarvestedCmd = Readonly<{
  tileId: string
  speciesId: string
  densityConsumed: number
  densityAfter: number
  harvesterId: string
  harvestGoodsId: string
  goodsQuantity: number
  tick: number
  narration?: string | null
}>

export type NpcLifeGoalSetCmd = Readonly<{
  npcId: string
  tile: string
  needs: Readonly<Record<'food' | 'rest' | 'money' | 'housing' | 'safety', number>>
  goal: Readonly<{ kind: string; pressure: number; narration: string }>
  motivation?: EventMotivation
  narration: string
}>

export type NpcHouseholdFormedCmd = Readonly<{
  householdId: string
  partnerNpcIds: readonly [string, string]
  homeTileId: string
  motivation?: EventMotivation
  narration: string
}>

export type NpcChildBornCmd = Readonly<{
  householdId: string
  childId: string
  nameZh: string
  nameEn: string
  motivation?: EventMotivation
  narration: string
}>

export type NpcMaturedCmd = Readonly<{
  npcId: string
  maturedAtTick: number
  bornAtTick: number
  householdId: string
  parentNpcIds: readonly string[]
  homeTileId: string
  nameZh: string
  nameEn: string
  motivation?: EventMotivation
  narration: string
}>

// Matured-child inheritance (v0.88.0) — 成年那一刻從父母 civic 紀錄
// 確定性換算出的起步 seed。不是轉移：父母 civic 狀態不變。
export type NpcInheritanceGrantedCmd = Readonly<{
  npcId: string
  parentNpcIds: readonly string[]
  householdId: string
  gold: number
  skillXp: Readonly<{ construction: number; knowledge: number; commerce: number; civic: number }>
  grantedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type NpcRelationshipDimensionAdjustedCmd = Readonly<{
  from: string
  to: string
  dimension: 'trust' | 'fear' | 'respect' | 'attraction' | 'loyalty' | 'resentment' | 'dependency' | 'familiarity'
  delta: number
  reason: string
  tick: number
  motivation?: EventMotivation
  narration: string
}>

// NPC AI agent decision（v0.89.0）— AI 以「意圖分類」身分替 NPC 在 server
// 算好的合法選項中做選擇。urgency 由 server 的 intent stack 決定（不信 AI
// 數字）；AI 只貢獻 choice / reason / utterance。憲法依據：ARCHITECTURE.md
// §9 AI read-only + 意圖分類例外。
export type NpcAgentDecisionCmd = Readonly<{
  npcId: string
  tile: string
  chosenIntent: 'follow_schedule' | IntentKind
  targetTile: string | null
  /** server 端從被選 intent stack entry 取得；follow_schedule 為 0。 */
  urgency: number
  /** AI 的一句決策理由（read-only 自述，僅供觀測/敘事）。 */
  reason: string
  /** NPC 自言自語（可上公開 ticker）。 */
  utterance: string | null
  decidedAtTick: number
  motivation?: EventMotivation
  narration: string | null
}>

export type NpcFreeformActionKind =
  | 'travel'
  | 'work'
  | 'rest'
  | 'socialize'
  | 'buy_card'
  | 'challenge_combat'
  | 'spread_rumor'
  | 'custom_social_scene'

export type NpcFreeformActionProposedCmd = Readonly<{
  npcId: string
  tile: string
  proposal: Readonly<{
    action: string
    target: Readonly<{ tileId: string | null; npcId: string | null; cardId: string | null }>
    reason: string
    risk: string
    expectedOutcome: string
    utterance: string | null
  }>
  resolved: Readonly<{
    kind: NpcFreeformActionKind
    targetTile: string | null
    targetNpcId: string | null
    cardId: string | null
    summary: string
  }>
  accepted: boolean
  rejectionReason: string | null
  decidedAtTick: number
  motivation?: EventMotivation
  narration: string | null
}>

export type NpcProductiveActionCmd = Readonly<{
  npcId: string
  tile: string
  activity: string
  domain: 'build' | 'learn' | 'trade' | 'service'
  metric: 'infrastructure' | 'knowledge' | 'economy' | 'safety' | 'supply'
  delta: number
  motivation?: EventMotivation
  narration: string
}>

export type HouseholdGoldContributedCmd = Readonly<{
  householdId: string
  npcId: string
  amount: number
  sourceEventType: string
  sourceId: string
  tileId: string
  contributedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type HouseholdGoldSpentCmd = Readonly<{
  householdId: string
  npcId: string
  amount: number
  purpose: string
  sourceId: string
  tileId: string
  spentAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type HouseholdInheritanceAssignedCmd = Readonly<{
  householdId: string
  deceasedNpcId: string
  heirId: string
  amount: number
  assignedAtTick: number
  /**
   * v0.88.0 — 死者名下實際移轉給繼承人的 goods 清單。
   * GoodsInventoryProjection 依此把 npc:<deceased> 庫存搬到 npc:<heir>。
   */
  goods?: readonly Readonly<{ goodsId: string; quantity: number; tileId: string }>[]
  motivation?: EventMotivation
  narration: string
}>

// NPC Mortality & Lineage (v0.32.0)
export type NpcDeceasedCmd = Readonly<{
  npcId: string
  tileId: string
  householdId: string
  deceasedAtTick: number
  narration: string
}>

export type NpcHeirAssignedCmd = Readonly<{
  householdId: string
  deceasedNpcId: string
  heirNpcId: string
  assignedAtTick: number
  narration: string
}>

// Faction Conflict Consequences (v0.33.0)
export type FactionTileSeizedCmd = Readonly<{
  tileId: string
  factionId: string
  previousFactionId: string | null
  seizedAtTick: number
  narration: string
}>

export type FactionNpcLoyaltyShiftedCmd = Readonly<{
  npcId: string
  tileId: string
  fromFaction: string
  toFaction: string
  shiftedAtTick: number
  narration: string
}>

export type FactionDominanceShiftedCmd = Readonly<{
  losingFactionId: string
  dominantFactionId: string | null
  lostTileCount: number
  tick: number
  narration: string
}>

export type TerritoryClaimChangedCmd = Readonly<{
  fromFactionId: string
  toFactionId: string | null
  tileCount: number
  tick: number
  narration: string
}>

// NPC Intention Layer (v0.51.0)
export type IntentKind = 'survival' | 'economic' | 'social' | 'ecosystem'

export type NpcIntentResolvedCmd = Readonly<{
  npcId: string
  intentType: IntentKind
  targetTile: string
  outcome: 'success' | 'failure'
  urgencyAtDispatch: number
  resolvedAtTick: number
}>

export type NpcHouseholdMigratedCmd = Readonly<{
  npcId: string
  fromTileId: string
  toTileId: string
  reason: string
  narration: string
}>

export type RoadConstructedCmd = Readonly<{
  roadId: string
  fromTileId: string
  toTileId: string
  roadType: 'road' | 'bridge'
  constructedAtTick: number
  narration: string
}>

export type RoadDestroyedCmd = Readonly<{
  roadId: string
  fromTileId: string
  toTileId: string
  destroyedAtTick: number
  narration: string
}>

// Walls / defenses (v0.80.0)
export type WallBuiltCmd = Readonly<{
  wallId: string
  tileIdA: string
  tileIdB: string
  factionIdA: string
  factionIdB: string
  builtAtTick: number
  narration: string
}>

export type WallDemolishedCmd = Readonly<{
  wallId: string
  tileIdA: string
  tileIdB: string
  demolishedAtTick: number
  narration: string
}>

// Household Joint Decisions (v0.81.0)
export type NpcHouseholdJointDecisionCmd = Readonly<{
  householdId: string
  memberNpcIds: readonly string[]
  tileId: string
  decisionKind: 'invest_in_settlement' | 'pool_resources'
  goldCommitted: number
  decidedAtTick: number
  narration: string
}>

// Cards as World Rule Operators (v0.76.0)
export type CardRuleOperatorActivatedCmd = Readonly<{
  activationId: string
  cardId: string
  playerId: string
  scope: string
  scopeId: string
  effectKind: string
  effectValue: number
  activatedAtTick: number
  expiresAtTick: number
  narration: string
}>

export type CardRuleOperatorExpiredCmd = Readonly<{
  activationId: string
  cardId: string
  playerId: string
  expiredAtTick: number
  narration: string
}>

export type NpcIncapacitatedLongCmd = Readonly<{
  npcId: string
  tileId: string
  incapacitatedAtTick: number
  recoverAtTick: number
  narration: string
}>

export type CombatWitnessRecordedCmd = Readonly<{
  witnessNpcId: string
  combatId: string
  defeatedNpcId: string
  tileId: string
  witnessedAtTick: number
  narration: string
}>

export type NpcGoodsTradedCmd = Readonly<{
  sellerNpcId: string
  buyerNpcId: string
  goodsId: string
  quantity: number
  tileId: string
  tradedAtTick: number
  narration: string
}>

// Sprint 2B — Animal aggression
export type AnimalDamage = Readonly<{ mood: number; health: number }>

export type AnimalTargetedNpcCmd = Readonly<{
  attackId: string
  animalId: string
  speciesId: string
  npcId: string
  tileId: string
  targetedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalAttackedNpcCmd = Readonly<{
  attackId: string
  animalId: string
  speciesId: string
  npcId: string
  tileId: string
  damage: AnimalDamage
  attackedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalFledCmd = Readonly<{
  fleeRouteId: string
  animalId: string
  speciesId: string
  fromTileId: string
  toTileId: string
  reason: 'attacked' | 'injured'
  fledAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalRetaliatedCmd = Readonly<{
  retaliationId: string
  animalId: string
  speciesId: string
  npcId: string
  tileId: string
  damage: AnimalDamage
  retaliatedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

// Sprint 2C — NPC defense coordination
export type NpcDefensePartyFormedCmd = Readonly<{
  partyId: string
  targetAnimalId: string
  targetSpeciesId: string
  tileId: string
  victimNpcId: string
  memberNpcIds: readonly string[]
  reactionToAttackId: string
  formedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type EventMotivation = Readonly<{
  explanation: string
  projectPurpose?: string
}>

export type ConstructionMotivation = Readonly<{
  projectPurpose: string
  primaryPressure: 'food' | 'rest' | 'money' | 'housing' | 'safety' | 'infrastructure'
  pressureScore: number
  sourceGoalKind: string
  sourceNpcId: string
  sourceTileId: string
  explanation: string
}>

export type ConstructionInitiateCmd = Readonly<{
  npcId: string
  tileId: string
  buildingId: string
  duration: number
  goldCost?: number
  householdGoldCost?: number
  motivation?: ConstructionMotivation
  narration: string
}>

export type ConstructionProjectProgressCmd = Readonly<{
  projectId: string
  kind: 'settlement'
  targetTileId: string
  buildingId: string
  npcId: string
  delta: number
  progressAfter: number
  targetProgress: number
  motivation?: ConstructionMotivation
  narration: string
}>

export type BuildingConstructedCmd = Readonly<{
  projectId: string
  buildingId: string
  tileId: string
  motivation?: ConstructionMotivation
  narration: string
}>

export type BuildingDamagedCmd = Readonly<{
  buildingId: string
  tileId: string
  health: number
  cause: 'combat' | 'neglect'
}>

export type BuildingRepairedCmd = Readonly<{
  buildingId: string
  tileId: string
  health: number
  repairedByNpcId: string
}>

export type BuildingAbandonedCmd = Readonly<{
  buildingId: string
  tileId: string
  lastActivityTick: number
}>

export type BuildingUpgradedCmd = Readonly<{
  buildingId: string
  tileId: string
  fromLevel: number
  toLevel: number
  upgradedAtTick: number
  narration: string
}>

export type BuildingCapturedCmd = Readonly<{
  buildingId: string
  tileId: string
  capturingFactionId: string
  previousFactionId: string | null
  capturedAtTick: number
  narration: string
}>

export type MapTileUnlockedCmd = Readonly<{
  projectId: string
  tileId: string
  adjacentTo: readonly string[]
  motivation?: ConstructionMotivation
  narration: string
}>

export type TileGeneratedCmd = Readonly<{
  tileId: string
  biome: string
  name: string
  x: number
  y: number
  adjacentTileIds: readonly string[]
  generatedAtTick: number
  narration: string
}>

export type NpcInteractCmd = Readonly<{
  tile: string
  participants: readonly [string, string]
  positions?: Readonly<Record<string, { subCol: number; subRow: number; subZ: number }>>
  mode: 'chat' | 'argue'
  motivation?: EventMotivation
  narration: string
}>

export type AreaPressureCmd = Readonly<{
  tileId: string
  kind: string
  detail: Record<string, string | number>
  motivation?: EventMotivation
  narration: string
}>

export type WeatherChangeCmd = Readonly<{
  from: string
  to: string
  motivation?: EventMotivation
  narration: string
}>

export type SeasonChangeCmd = Readonly<{
  from: string
  to: string
  motivation?: EventMotivation
  narration: string
}>

export type WorldEventSpawnCmd = Readonly<{
  worldEventId: string
  templateId: string
  type: string
  scope: string
  endsAtTick: number
  motivation?: EventMotivation
  narration: string
  data: Record<string, unknown>
}>

export type WorldEventEndCmd = Readonly<{
  worldEventId: string
  templateId: string
  type: string
  scope: string
  motivation?: EventMotivation
}>

export type BuildingEnterCmd = Readonly<{
  npcId: string
  buildingId: string
  tileId: string
  motivation?: EventMotivation
  narration: string
}>

export type BuildingLeaveCmd = Readonly<{
  npcId: string
  buildingId: string
  tileId: string
  motivation?: EventMotivation
  narration: string
}>

export type RareWindowOpenCmd = Readonly<{
  windowId: string
  closesAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type RareWindowCloseCmd = Readonly<{
  windowId: string
  motivation?: EventMotivation
  narration: string
}>

export type WorldTickCmd = Readonly<{
  tick: number
}>

/**
 * v0.14.0：玩家介入兩位 NPC 的衝突。actor 為 'player'，actorId = accountId
 * 字串形式（保持 Command.actorId 為 string 一致性）。intentClass 由前端傳給
 * 後端 OR 後端用 AI 從 message 判斷後再放進命令裡 — Rule Engine 拿到的是
 * 已分類過的命令。AI 不直接寫 EventLog，符合 ARCHITECTURE §9。
 */
export type PlayerIntervenecmd = Readonly<{
  playerAccountId: string
  npcA: string
  npcB: string
  tile: string
  /**
   * intentClass：mediate=和事佬 / provoke=煽風點火 / watch=旁觀 /
   * threaten=威脅。後端在 AI 失敗時 fallback 到 'watch'。
   */
  intentClass: 'mediate' | 'provoke' | 'watch' | 'threaten'
  /** 玩家自由輸入的原文（可空字串：純按鈕介入） */
  message: string
  /** 一行敘事，給 catch-up summary / SSE listener 用 */
  narration: string
}>

export type PlayerEnergySetCmd = Readonly<{
  playerAccountId: string
  energy: number
  reason: 'combat_defeat'
  sourceCombatId?: string
  narration: string
}>

export type NpcDialogHoldCmd = Readonly<{
  playerAccountId: string
  npcId: string
  tile: string
  holdTicks: number
  narration: string | null
}>

/** v0.15.0 Combat Phase B — 全部 combat 動作都走 LivingWorld pipeline */
export type CombatInitiateCmd = Readonly<{
  combatId: string
  playerAccountId: string
  npcId?: string
  enemyType?: 'npc' | 'animal'
  animalId?: string
  speciesId?: string
  tile: string
  playerCombatHp: number
  npcCombatHp: number
  reason: 'player_challenge' | 'npc_aggression'
  narration: string
}>

export type CombatPlayerActionCmd = Readonly<{
  combatId: string
  playerAccountId: string
  npcId: string
  combatRound: number
  action: 'attack' | 'defend' | 'flee'
  /** Phase B 預留紋卡欄位；rule engine 看到時寫 COMBAT_CARD_IGNORED warning */
  cardId?: number
  /** Phase B projection snapshot emitted by the combat rule engine. */
  playerHpAfter: number
  npcHpAfter: number
  events: readonly Readonly<{
    eventType: string
    payload: Readonly<Record<string, unknown>>
  }>[]
  narration: string
}>

export type CombatResolveCmd = Readonly<{
  combatId: string
  playerAccountId: string
  npcId: string
  outcome: 'player_victory' | 'npc_victory' | 'fled'
  durationRounds: number
  finalPlayerHp: number
  finalNpcHp: number
  playerEnergyToZero: boolean
  npcIncapacitatedTicks: number
  narration: string
}>

// Phase 1 §33.4 — Settlement domain (Layer 3 Civilization Runtime).
// Settlements emerge from sustained NPC co-presence; this is the
// founding event. Population / decline / takeover / goods / logistics
// are deferred to follow-up slices per WORLD_CAPABILITIES.md §28.1.
export type SettlementFormedCmd = Readonly<{
  settlementId: string
  tileId: string
  formedAtTick: number
  founderNpcIds: readonly string[]
  motivation?: EventMotivation
  narration: string
}>

export type SettlementPressure = Readonly<{
  food: number
  safety: number
  economy: number
  logistics: number
}>

export type SettlementStatus = 'stable' | 'strained' | 'declining' | 'recovering'

export type SettlementStorageItem = Readonly<{
  goodsId: string
  quantity: number
}>

export type SettlementPopulationUpdatedCmd = Readonly<{
  settlementId: string
  tileId: string
  populationNpcIds: readonly string[]
  updatedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type SettlementStorageUpdatedCmd = Readonly<{
  settlementId: string
  tileId: string
  storage: readonly SettlementStorageItem[]
  updatedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type SettlementPressureUpdatedCmd = Readonly<{
  settlementId: string
  tileId: string
  pressure: SettlementPressure
  updatedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type SettlementStabilityChangedCmd = Readonly<{
  settlementId: string
  tileId: string
  stability: number
  status: SettlementStatus
  changedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type SettlementDeclinedCmd = Readonly<{
  settlementId: string
  tileId: string
  stability: number
  declinedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type SettlementRecoveredCmd = Readonly<{
  settlementId: string
  tileId: string
  stability: number
  status: 'stable' | 'recovering'
  recoveredAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type SettlementEvacuationStartedCmd = Readonly<{
  settlementId: string
  tileId: string
  fleeingNpcIds: readonly string[]
  targetTileId: string
  evacuatedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalSpawnedCmd = Readonly<{
  animal: Animal
  spawnedAtTick: number
  motivation?: EventMotivation
  narration: string | null
}>

export type AnimalHuntStartedCmd = Readonly<{
  huntId: string
  npcId: string
  tileId: string
  targetSpeciesId: string
  targetAnimalId: string
  startedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalHuntResolvedCmd = Readonly<{
  huntId: string
  npcId: string
  tileId: string
  targetSpeciesId: string
  targetAnimalId: string
  outcome: 'success' | 'failed'
  resolvedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalKilledCmd = Readonly<{
  huntId: string
  animalId: string
  speciesId: string
  tileId: string
  killedByNpcId: string
  killedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalStarvedCmd = Readonly<{
  starvationId: string
  predatorAnimalId: string
  predatorSpeciesId: string
  tileId: string
  starvationStage: 'hungry' | 'scarce_prey'
  starvedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalReproducedCmd = Readonly<{
  animal: Animal
  parentAnimalIds: readonly [string, string]
  reproducedAtTick: number
  motivation?: EventMotivation
  narration: string | null
}>

export type MigrationWaveStartedCmd = Readonly<{
  waveId: string
  speciesId: string
  fromTileId: string
  toTileId: string
  startedAtTick: number
  migrationType: 'pressure' | 'seasonal'
}>

export type AnimalMigratedCmd = Readonly<{
  animalId: string
  speciesId: string
  fromTileId: string
  toTileId: string
  migratedAtTick: number
  migrationType: 'pressure' | 'seasonal'
  waveId: string
}>

export type CarcassCreatedCmd = Readonly<{
  huntId: string
  carcassId: string
  animalId: string
  speciesId: string
  tileId: string
  edibleYield: number
  byproducts: readonly string[]
  createdAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type MeatHarvestedCmd = Readonly<{
  huntId: string
  carcassId: string
  animalId: string
  speciesId: string
  tileId: string
  npcId: string
  quantity: number
  goldValue: number
  harvestedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type HideCollectedCmd = Readonly<{
  huntId: string
  carcassId: string
  speciesId: string
  tileId: string
  npcId: string
  byproductId: string
  tick: number
  narration: string | null
}>

export type BoneCollectedCmd = Readonly<{
  huntId: string
  carcassId: string
  speciesId: string
  tileId: string
  npcId: string
  byproductId: string
  tick: number
  narration: string | null
}>

export type FisheryHarvestedCmd = Readonly<{
  tileId: string
  npcId: string
  delta: number
  densityBefore: number
  densityAfter: number
  harvestedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type FisheryCollapsedCmd = Readonly<{
  tileId: string
  density: number
  collapsedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type FisheryRecoveredCmd = Readonly<{
  tileId: string
  density: number
  tick: number
  narration: string | null
}>

export type SpeciesExtinctionWarningCmd = Readonly<{
  speciesId: string
  tileId: string
  population: number
  threshold: number
  tick: number
  narration: string | null
}>

export type SpeciesExtinctCmd = Readonly<{
  speciesId: string
  lastSeenTick: number
  affectedTileIds: readonly string[]
  narration: string | null
}>

export type SpeciesRecoveredCmd = Readonly<{
  speciesId: string
  tileId: string
  population: number
  tick: number
  narration: string | null
}>

export type EcosystemPressureRaisedCmd = Readonly<{
  tileId: string
  pressureLevel: number
  tick: number
  narration: string | null
}>

export type EcosystemPressureRecoveredCmd = Readonly<{
  tileId: string
  tick: number
  narration: string | null
}>

export type ForestDepletedCmd = Readonly<{
  tileId: string
  pressureLevel: number
  depletedAtTick: number
  narration: string
}>

export type ForestRecoveredCmd = Readonly<{
  tileId: string
  tick: number
}>

export type BiomeRecoveredCmd = Readonly<{
  tileId: string
  biome: string
  tick: number
  narration: string
}>

export type SpeciesPopulationShiftedCmd = Readonly<{
  speciesId: string
  previousTotal: number
  currentTotal: number
  changePercent: number
  tick: number
  narration: string | null
}>

export type PollutionIncreasedCmd = Readonly<{
  tileId: string
  pollutionLevel: number
  tick: number
  narration: string
}>

export type PollutionRecoveredCmd = Readonly<{
  tileId: string
  tick: number
  narration: string | null
}>

// Phase E3 — Domestication
export type AnimalDomesticatedCmd = Readonly<{
  animalId: string
  settlementId: string
  speciesId: string
  tick: number
  narration: string | null
}>

export type LivestockBredCmd = Readonly<{
  settlementId: string
  speciesId: string
  newAnimalId: string
  tick: number
  narration: string | null
}>

export type LivestockSlaughteredCmd = Readonly<{
  animalId: string
  settlementId: string
  speciesId: string
  goods: readonly Readonly<{ goodsId: string; amount: number }>[]
  tick: number
  narration: string | null
}>

export type MountAssignedCmd = Readonly<{
  animalId: string
  npcId: string
  settlementId: string
  tick: number
  narration: string | null
}>

export const GOODS_HOLDER_TYPES = ['npc', 'building', 'settlement', 'player'] as const
export type GoodsHolderType = (typeof GOODS_HOLDER_TYPES)[number]

export type GoodsExtractedCmd = Readonly<{
  goodsId: string
  quantity: number
  sourceEventType: 'MEAT_HARVESTED' | 'FISHERY_HARVESTED' | string
  sourceId: string
  sourceTileId: string
  extractedByNpcId: string
  extractedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type GoodsStoredCmd = Readonly<{
  goodsId: string
  quantity: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  storedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type GoodsProcessedCmd = Readonly<{
  recipeId?: string
  inputGoodsId: string
  inputQuantity: number
  outputGoodsId: string
  outputQuantity: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  processedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type GoodsConsumedCmd = Readonly<{
  goodsId: string
  quantity: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  consumerNpcId?: string
  consumedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type GoodsDestroyedCmd = Readonly<{
  goodsId: string
  quantity: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  reason: string
  destroyedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type TradeRouteOpenedCmd = Readonly<{
  routeId: string
  fromTileId: string
  toTileId: string
  goodsId: string
  openedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type TradeRouteClosedCmd = Readonly<{
  routeId: string
  closedAtTick: number
  reason: string
  motivation?: EventMotivation
  narration: string
}>

export type GoodsTransportStartedCmd = Readonly<{
  transportId: string
  routeId: string
  goodsId: string
  quantity: number
  carrierNpcId: string
  fromHolderType: GoodsHolderType
  fromHolderId: string
  fromTileId: string
  toHolderType: GoodsHolderType
  toHolderId: string
  toTileId: string
  startedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type GoodsTransportArrivedCmd = Readonly<{
  transportId: string
  routeId: string
  goodsId: string
  quantity: number
  carrierNpcId: string
  toHolderType: GoodsHolderType
  toHolderId: string
  toTileId: string
  arrivedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type GoodsTransportLostCmd = Readonly<{
  transportId: string
  routeId: string
  goodsId: string
  quantity: number
  carrierNpcId: string
  fromTileId: string
  toTileId: string
  reason: string
  lostAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type MarketPriceDiscoveredCmd = Readonly<{
  marketId: string
  settlementId: string
  goodsId: string
  supplyQuantity: number
  demandQuantity: number
  priceGold: number
  discoveredAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type RumorTopic = 'predator_death' | 'construction_complete'

export type NpcRumorHeardCmd = Readonly<{
  npcId: string
  rumorId: string
  topic: RumorTopic
  subjectId: string
  tileId: string
  originTick: number
  accuracy: number
}>

export type NpcRumorSpreadCmd = Readonly<{
  fromNpcId: string
  toNpcId: string
  rumorId: string
  topic: RumorTopic
  subjectId: string
  tileId: string
  originTick: number
  accuracy: number
}>

// Phase 3 §37.2 — NPC skill learning & mentorship
export type NpcObservedSkillCmd = Readonly<{
  npcId: string
  skillId: string
  sourceEventType: string
  tick: number
  xpDelta?: number
}>

export type NpcMentorshipStartedCmd = Readonly<{
  mentorNpcId: string
  menteeNpcId: string
  skillId: string
  tick: number
}>

export type NpcMentorshipCompletedCmd = Readonly<{
  mentorNpcId: string
  menteeNpcId: string
  skillId: string
  finalLevel: number
  tick: number
}>

// Phase 3 §37.3 — NPC culture & emergent festivals
export type CulturalFestivalFormedCmd = Readonly<{
  windowId: string
  tileId: string
  occurrenceCount: number
  formedAtTick: number
  narration: string
}>

export type CulturalRitualPerformedCmd = Readonly<{
  npcId: string
  buildingId: string
  tileId: string
  factionLean: string
  performedAtTick: number
  narration: string
}>

export type CulturalNormEstablishedCmd = Readonly<{
  tileId: string
  skillId: string
  npcCount: number
  formedAtTick: number
  narration: string
}>

// Phase E4 — Mythic Ecology
export type LegendaryWorldEventSpawnedCmd = Readonly<{
  eventKind: string
  tileId: string
  linkedAnimalId: string
  speciesId: string
  severity: number
  tick: number
  narration: string | null
}>

export type LegendaryWorldEventResolvedCmd = Readonly<{
  linkedAnimalId: string
  tileId: string
  speciesId: string
  resolutionTick: number
  narration: string | null
}>

export type LegendaryHuntStartedCmd = Readonly<{
  worldEventId: string
  linkedAnimalId: string
  tileId: string
  hunterNpcIds: readonly string[]
  startedAtTick: number
  narration: string | null
}>

export type LegendaryHuntConcludedCmd = Readonly<{
  worldEventId: string
  linkedAnimalId: string
  tileId: string
  concludedAtTick: number
  outcome: 'killed' | 'migrated' | 'starved'
  narration: string | null
}>

export type ForestClearcutOrderedCmd = Readonly<{
  factionId: string
  tileId: string
  pressureLevel: number
  tick: number
  narration: string | null
}>

export type FishingQuotaEnforcedCmd = Readonly<{
  factionId: string
  tileId: string
  fisheryDensity: number
  tick: number
  narration: string | null
}>

export type IndustrialSiteSabotagedCmd = Readonly<{
  factionId: string
  tileId: string
  livestockCount: number
  tick: number
  narration: string | null
}>

export type FactionEcologyConflictStartedCmd = Readonly<{
  conflictId: string
  tileId: string
  resourceType: 'fishery' | 'forest'
  contestingFactionId: string
  currentFactionId: string | null
  tick: number
  narration: string
}>

export type RitualEcosystemManipulationCmd = Readonly<{
  factionId: string
  tick: number
  narration: string | null
}>

// Phase 6 — Player Civilization
export type PlayerPickedUpGoodsCmd = Readonly<{
  playerAccountId: string
  tileId: string
  goodsId: string
  quantity: number
  tick: number
}>

export type PlayerDepositGoodsCmd = Readonly<{
  playerAccountId: string
  tileId: string
  settlementId: string
  goodsId: string
  quantity: number
  tick: number
}>

export type PlayerTradedGoodsCmd = Readonly<{
  playerAccountId: string
  npcId: string
  tileId: string
  offeredGoods: ReadonlyArray<Readonly<{ goodsId: string; quantity: number }>>
  requestedGoods: ReadonlyArray<Readonly<{ goodsId: string; quantity: number }>>
  tick: number
}>

export type PlayerHuntedAnimalCmd = Readonly<{
  playerAccountId: string
  tileId: string
  animalId: string
  speciesId: string
  tick: number
}>

export type PlayerFishedCmd = Readonly<{
  playerAccountId: string
  tileId: string
  quantity: number
  tick: number
}>

export type PlayerDomesticatedAnimalCmd = Readonly<{
  playerAccountId: string
  tileId: string
  animalId: string
  speciesId: string
  tick: number
}>

export type PlayerProtectedRegionCmd = Readonly<{
  playerAccountId: string
  tileId: string
  tick: number
}>

export type PlayerHiredNpcCmd = Readonly<{
  playerAccountId: string
  npcId: string
  tileId: string
  tick: number
}>

export type PlayerDismissedNpcCmd = Readonly<{
  playerAccountId: string
  npcId: string
  tick: number
}>

export type PlayerSponsoredConstructionCmd = Readonly<{
  playerAccountId: string
  tileId: string
  buildingType: string
  tick: number
}>

export type PlayerFoundedSettlementCmd = Readonly<{
  playerAccountId: string
  tileId: string
  settlementName: string
  tick: number
}>

export type PlayerClaimedTerritoryCmd = Readonly<{
  playerAccountId: string
  tileId: string
  tick: number
}>

export type PlayerJoinedFactionCmd = Readonly<{
  playerAccountId: string
  factionId: string
  tick: number
}>

export type PlayerLeftFactionCmd = Readonly<{
  playerAccountId: string
  factionId: string
  tick: number
}>

export type PlayerLedFactionCmd = Readonly<{
  playerAccountId: string
  factionId: string
  tick: number
}>

export type PlayerPlayedCardCmd = Readonly<{
  playerAccountId: string
  cardId: string
  targetTileId: string
  targetNpcId?: string
  tick: number
}>

export type LivingWorldCommandPayload =
  | NpcMoveCmd
  | NpcActivityChangeCmd
  | NpcStateRecordedCmd
  | AreaStateRecordedCmd
  | BioNodeSeededCmd
  | BioNodeRegrewCmd
  | BioNodeHarvestedCmd
  | NpcLifeGoalSetCmd
  | NpcHouseholdFormedCmd
  | NpcChildBornCmd
  | NpcMaturedCmd
  | NpcInheritanceGrantedCmd
  | NpcAgentDecisionCmd
  | NpcFreeformActionProposedCmd
  | NpcRelationshipDimensionAdjustedCmd
  | NpcProductiveActionCmd
  | ConstructionInitiateCmd
  | ConstructionProjectProgressCmd
  | BuildingConstructedCmd
  | BuildingDamagedCmd
  | BuildingRepairedCmd
  | BuildingAbandonedCmd
  | BuildingUpgradedCmd
  | BuildingCapturedCmd
  | MapTileUnlockedCmd
  | TileGeneratedCmd
  | NpcInteractCmd
  | AreaPressureCmd
  | WeatherChangeCmd
  | SeasonChangeCmd
  | WorldEventSpawnCmd
  | WorldEventEndCmd
  | BuildingEnterCmd
  | BuildingLeaveCmd
  | RareWindowOpenCmd
  | RareWindowCloseCmd
  | WorldTickCmd
  | PlayerIntervenecmd
  | PlayerEnergySetCmd
  | NpcDialogHoldCmd
  | CombatInitiateCmd
  | CombatPlayerActionCmd
  | CombatResolveCmd
  | CombatCardPlayPayload
  | CombatCardCancelPayload
  | CombatDamagePayload
  | CombatHealPayload
  | CombatStatusApplyPayload
  | CombatStatusTickPayload
  | CombatStatusEndPayload
  | CombatTargetLockPayload
  | CombatPhaseShiftPayload
  | CombatFleeAttemptPayload
  | CombatDefeatPayload
  | SettlementFormedCmd
  | SettlementPopulationUpdatedCmd
  | SettlementStorageUpdatedCmd
  | SettlementPressureUpdatedCmd
  | SettlementStabilityChangedCmd
  | SettlementDeclinedCmd
  | SettlementRecoveredCmd
  | SettlementEvacuationStartedCmd
  | AnimalSpawnedCmd
  | AnimalHuntStartedCmd
  | AnimalHuntResolvedCmd
  | AnimalKilledCmd
  | AnimalStarvedCmd
  | AnimalReproducedCmd
  | MigrationWaveStartedCmd
  | AnimalMigratedCmd
  | CarcassCreatedCmd
  | MeatHarvestedCmd
  | HideCollectedCmd
  | BoneCollectedCmd
  | FisheryHarvestedCmd
  | FisheryCollapsedCmd
  | FisheryRecoveredCmd
  | SpeciesExtinctionWarningCmd
  | SpeciesExtinctCmd
  | SpeciesRecoveredCmd
  | EcosystemPressureRaisedCmd
  | EcosystemPressureRecoveredCmd
  | ForestDepletedCmd
  | ForestRecoveredCmd
  | BiomeRecoveredCmd
  | SpeciesPopulationShiftedCmd
  | PollutionIncreasedCmd
  | PollutionRecoveredCmd
  | GoodsExtractedCmd
  | GoodsStoredCmd
  | GoodsProcessedCmd
  | GoodsConsumedCmd
  | GoodsDestroyedCmd
  | TradeRouteOpenedCmd
  | TradeRouteClosedCmd
  | GoodsTransportStartedCmd
  | GoodsTransportArrivedCmd
  | GoodsTransportLostCmd
  | MarketPriceDiscoveredCmd
  | NpcRumorHeardCmd
  | NpcRumorSpreadCmd
  | NpcObservedSkillCmd
  | NpcMentorshipStartedCmd
  | NpcMentorshipCompletedCmd
  | CulturalFestivalFormedCmd
  | CulturalRitualPerformedCmd
  | CulturalNormEstablishedCmd
  | HouseholdGoldContributedCmd
  | HouseholdGoldSpentCmd
  | HouseholdInheritanceAssignedCmd
  | AnimalTargetedNpcCmd
  | AnimalAttackedNpcCmd
  | AnimalFledCmd
  | AnimalRetaliatedCmd
  | NpcDefensePartyFormedCmd
  | AnimalDomesticatedCmd
  | LivestockBredCmd
  | LivestockSlaughteredCmd
  | MountAssignedCmd
  | LegendaryWorldEventSpawnedCmd
  | LegendaryWorldEventResolvedCmd
  | LegendaryHuntStartedCmd
  | LegendaryHuntConcludedCmd
  | ForestClearcutOrderedCmd
  | FishingQuotaEnforcedCmd
  | IndustrialSiteSabotagedCmd
  | RitualEcosystemManipulationCmd
  | FactionEcologyConflictStartedCmd
  | PlayerPickedUpGoodsCmd
  | PlayerDepositGoodsCmd
  | PlayerTradedGoodsCmd
  | PlayerHuntedAnimalCmd
  | PlayerFishedCmd
  | PlayerDomesticatedAnimalCmd
  | PlayerProtectedRegionCmd
  | PlayerHiredNpcCmd
  | PlayerDismissedNpcCmd
  | PlayerSponsoredConstructionCmd
  | PlayerFoundedSettlementCmd
  | PlayerClaimedTerritoryCmd
  | PlayerJoinedFactionCmd
  | PlayerLeftFactionCmd
  | PlayerLedFactionCmd
  | PlayerPlayedCardCmd
  | NpcDeceasedCmd
  | NpcHeirAssignedCmd
  | FactionTileSeizedCmd
  | FactionNpcLoyaltyShiftedCmd
  | FactionDominanceShiftedCmd
  | TerritoryClaimChangedCmd
  | NpcIntentResolvedCmd
  | NpcHouseholdMigratedCmd
  | RoadConstructedCmd
  | RoadDestroyedCmd
  | CardRuleOperatorActivatedCmd
  | CardRuleOperatorExpiredCmd
  | NpcIncapacitatedLongCmd
  | CombatWitnessRecordedCmd
  | NpcGoodsTradedCmd
  | WallBuiltCmd
  | WallDemolishedCmd
  | NpcHouseholdJointDecisionCmd

export type LivingWorldCommand = Command<LivingWorldCommandPayload> &
  Readonly<{
    commandType: LivingWorldCommandType
    actorType: LivingWorldActorType
    tick: number
  }>

export type LivingWorldEventPayload = Readonly<{
  actorType: LivingWorldActorType
  data: LivingWorldCommandPayload
  narration: string | null
}>

export type LivingWorldEventDraft = EventDraft<LivingWorldEventPayload> &
  Readonly<{
    eventType: LivingWorldCommandType
    actorType: LivingWorldActorType
  }>

const VALIDATORS: Readonly<
  Record<LivingWorldCommandType, (payload: unknown) => string | null>
> = {
  NPC_MOVE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.from !== 'string' || p.from.length === 0) return 'from required'
    if (typeof p.to !== 'string' || p.to.length === 0) return 'to required'
    if (typeof p.activity !== 'string') return 'activity required'
    if (typeof p.reachedDest !== 'boolean') return 'reachedDest required'
    return null
  },
  NPC_ACTIVITY_CHANGE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (typeof p.from !== 'string') return 'from required'
    if (typeof p.to !== 'string') return 'to required'
    return null
  },
  NPC_STATE_RECORDED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (!isRecord(p.state)) return 'state required'
    const err = validateNpcStateSnapshot(p.state)
    if (err) return err
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  AREA_STATE_RECORDED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isRecord(p.state)) return 'state required'
    if (typeof (p.state as Record<string, unknown>).tileId !== 'string') return 'state.tileId required'
    if (!isRecord((p.state as Record<string, unknown>).factionControl)) return 'state.factionControl required'
    if (!isRecord((p.state as Record<string, unknown>).resources)) return 'state.resources required'
    if (typeof (p.state as Record<string, unknown>).lastUpdatedTick !== 'number') return 'state.lastUpdatedTick required'
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  BIO_NODE_SEEDED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.density !== 'number' || !Number.isFinite(p.density) || p.density < 0) return 'density required (>=0)'
    if (typeof p.capacity !== 'number' || !Number.isFinite(p.capacity) || p.capacity <= 0) return 'capacity required (>0)'
    if (typeof p.seededAtTick !== 'number' || !Number.isInteger(p.seededAtTick) || p.seededAtTick < 0) return 'seededAtTick required'
    return null
  },
  BIO_NODE_REGREW: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.densityBefore !== 'number' || !Number.isFinite(p.densityBefore)) return 'densityBefore required'
    if (typeof p.densityAfter !== 'number' || !Number.isFinite(p.densityAfter)) return 'densityAfter required'
    if (typeof p.capacity !== 'number' || !Number.isFinite(p.capacity) || p.capacity <= 0) return 'capacity required (>0)'
    if (typeof p.tick !== 'number' || !Number.isInteger(p.tick) || p.tick < 0) return 'tick required'
    return null
  },
  BIO_NODE_HARVESTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.densityConsumed !== 'number' || !Number.isFinite(p.densityConsumed) || p.densityConsumed <= 0) return 'densityConsumed required (>0)'
    if (typeof p.densityAfter !== 'number' || !Number.isFinite(p.densityAfter)) return 'densityAfter required'
    if (typeof p.harvesterId !== 'string' || p.harvesterId.length === 0) return 'harvesterId required'
    if (typeof p.harvestGoodsId !== 'string' || p.harvestGoodsId.length === 0) return 'harvestGoodsId required'
    if (typeof p.goodsQuantity !== 'number' || !Number.isFinite(p.goodsQuantity) || p.goodsQuantity <= 0) return 'goodsQuantity required (>0)'
    if (typeof p.tick !== 'number' || !Number.isInteger(p.tick) || p.tick < 0) return 'tick required'
    return null
  },
  NPC_LIFE_GOAL_SET: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (!isRecord(p.needs)) return 'needs required'
    for (const key of ['food', 'rest', 'money', 'housing', 'safety']) {
      const value = p.needs[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${key} need required`
    }
    if (!isRecord(p.goal)) return 'goal required'
    if (typeof p.goal.kind !== 'string' || p.goal.kind.length === 0) return 'goal kind required'
    if (typeof p.goal.pressure !== 'number' || !Number.isFinite(p.goal.pressure)) return 'goal pressure required'
    if (typeof p.goal.narration !== 'string') return 'goal narration required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_HOUSEHOLD_FORMED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (!Array.isArray(p.partnerNpcIds) || p.partnerNpcIds.length !== 2) return 'partnerNpcIds tuple required'
    const [a, b] = p.partnerNpcIds as readonly unknown[]
    if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return 'partner npc ids required'
    if (a === b) return 'partner npc ids must differ'
    if (typeof p.homeTileId !== 'string' || p.homeTileId.length === 0) return 'homeTileId required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_CHILD_BORN: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (typeof p.childId !== 'string' || p.childId.length === 0) return 'childId required'
    if (typeof p.nameZh !== 'string' || p.nameZh.length === 0) return 'nameZh required'
    if (typeof p.nameEn !== 'string' || p.nameEn.length === 0) return 'nameEn required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_MATURED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.maturedAtTick !== 'number' || !Number.isFinite(p.maturedAtTick)) return 'maturedAtTick required'
    if (typeof p.bornAtTick !== 'number' || !Number.isFinite(p.bornAtTick)) return 'bornAtTick required'
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (!Array.isArray(p.parentNpcIds) || p.parentNpcIds.length === 0) return 'parentNpcIds required'
    for (const id of p.parentNpcIds) {
      if (typeof id !== 'string' || id.length === 0) return 'parentNpcIds must be non-empty strings'
    }
    if (typeof p.homeTileId !== 'string' || p.homeTileId.length === 0) return 'homeTileId required'
    if (typeof p.nameZh !== 'string' || p.nameZh.length === 0) return 'nameZh required'
    if (typeof p.nameEn !== 'string' || p.nameEn.length === 0) return 'nameEn required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_INHERITANCE_GRANTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (!Array.isArray(p.parentNpcIds) || p.parentNpcIds.length === 0) return 'parentNpcIds required'
    for (const id of p.parentNpcIds) {
      if (typeof id !== 'string' || id.length === 0) return 'parentNpcIds must be non-empty strings'
    }
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (typeof p.gold !== 'number' || !Number.isInteger(p.gold) || p.gold < 0) return 'gold must be non-negative integer'
    if (!isRecord(p.skillXp)) return 'skillXp required'
    for (const key of ['construction', 'knowledge', 'commerce', 'civic'] as const) {
      const value = p.skillXp[key]
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return `skillXp.${key} must be non-negative integer`
    }
    if (typeof p.grantedAtTick !== 'number' || !Number.isInteger(p.grantedAtTick) || p.grantedAtTick < 0) return 'grantedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  NPC_AGENT_DECISION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    const validIntents = ['follow_schedule', 'survival', 'economic', 'social', 'ecosystem']
    if (typeof p.chosenIntent !== 'string' || !validIntents.includes(p.chosenIntent)) {
      return 'chosenIntent must be follow_schedule or a valid intent kind'
    }
    if (p.targetTile !== null && (typeof p.targetTile !== 'string' || p.targetTile.length === 0)) {
      return 'targetTile must be non-empty string or null'
    }
    if (p.chosenIntent !== 'follow_schedule' && p.targetTile === null) {
      return 'intent choices require a targetTile'
    }
    if (typeof p.urgency !== 'number' || !Number.isFinite(p.urgency) || p.urgency < 0 || p.urgency > 100) {
      return 'urgency must be 0..100'
    }
    if (typeof p.reason !== 'string' || p.reason.length === 0) return 'reason required'
    if (p.utterance !== null && typeof p.utterance !== 'string') return 'utterance must be string or null'
    if (typeof p.decidedAtTick !== 'number' || !Number.isInteger(p.decidedAtTick) || p.decidedAtTick < 0) {
      return 'decidedAtTick must be non-negative integer'
    }
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  NPC_FREEFORM_ACTION_PROPOSED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (!isRecord(p.proposal)) return 'proposal required'
    if (typeof p.proposal.action !== 'string' || p.proposal.action.length === 0) return 'proposal.action required'
    if (!isRecord(p.proposal.target)) return 'proposal.target required'
    for (const key of ['tileId', 'npcId', 'cardId'] as const) {
      const value = p.proposal.target[key]
      if (value !== null && typeof value !== 'string') return `proposal.target.${key} must be string or null`
    }
    if (typeof p.proposal.reason !== 'string' || p.proposal.reason.length === 0) return 'proposal.reason required'
    if (typeof p.proposal.risk !== 'string' || p.proposal.risk.length === 0) return 'proposal.risk required'
    if (typeof p.proposal.expectedOutcome !== 'string' || p.proposal.expectedOutcome.length === 0) return 'proposal.expectedOutcome required'
    if (p.proposal.utterance !== null && typeof p.proposal.utterance !== 'string') return 'proposal.utterance must be string or null'
    if (!isRecord(p.resolved)) return 'resolved required'
    const validKinds = ['travel', 'work', 'rest', 'socialize', 'buy_card', 'challenge_combat', 'spread_rumor', 'custom_social_scene']
    if (typeof p.resolved.kind !== 'string' || !validKinds.includes(p.resolved.kind)) return 'resolved.kind invalid'
    if (p.resolved.targetTile !== null && (typeof p.resolved.targetTile !== 'string' || p.resolved.targetTile.length === 0)) return 'resolved.targetTile must be string or null'
    if (p.resolved.targetNpcId !== null && (typeof p.resolved.targetNpcId !== 'string' || p.resolved.targetNpcId.length === 0)) return 'resolved.targetNpcId must be string or null'
    if (p.resolved.cardId !== null && (typeof p.resolved.cardId !== 'string' || p.resolved.cardId.length === 0)) return 'resolved.cardId must be string or null'
    if (typeof p.resolved.summary !== 'string' || p.resolved.summary.length === 0) return 'resolved.summary required'
    if (typeof p.accepted !== 'boolean') return 'accepted required'
    if (p.accepted && p.rejectionReason !== null) return 'accepted proposals must not have rejectionReason'
    if (!p.accepted && (typeof p.rejectionReason !== 'string' || p.rejectionReason.length === 0)) return 'rejected proposals require rejectionReason'
    if (typeof p.decidedAtTick !== 'number' || !Number.isInteger(p.decidedAtTick) || p.decidedAtTick < 0) return 'decidedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  NPC_RELATIONSHIP_DIMENSION_ADJUSTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.from !== 'string' || p.from.length === 0) return 'from required'
    if (typeof p.to !== 'string' || p.to.length === 0) return 'to required'
    if (p.from === p.to) return 'from and to must differ'
    const validDims = ['trust', 'fear', 'respect', 'attraction', 'loyalty', 'resentment', 'dependency', 'familiarity']
    if (typeof p.dimension !== 'string' || !validDims.includes(p.dimension)) return 'invalid dimension'
    if (typeof p.delta !== 'number' || !Number.isFinite(p.delta)) return 'delta required'
    if (typeof p.reason !== 'string' || p.reason.length === 0) return 'reason required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_PRODUCTIVE_ACTION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (typeof p.activity !== 'string') return 'activity required'
    if (p.domain !== 'build' && p.domain !== 'learn' && p.domain !== 'trade' && p.domain !== 'service') {
      return 'invalid domain'
    }
    if (
      p.metric !== 'infrastructure' &&
      p.metric !== 'knowledge' &&
      p.metric !== 'economy' &&
      p.metric !== 'safety' &&
      p.metric !== 'supply'
    ) {
      return 'invalid metric'
    }
    if (typeof p.delta !== 'number' || !Number.isFinite(p.delta)) return 'delta required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  CONSTRUCTION_INITIATE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.duration !== 'number' || !Number.isFinite(p.duration)) return 'duration required'
    if (!Number.isInteger(p.duration) || p.duration < 1 || p.duration > 1000) {
      return 'duration must be an integer in [1, 1000]'
    }
    if (p.goldCost !== undefined && (typeof p.goldCost !== 'number' || !Number.isFinite(p.goldCost) || p.goldCost < 0)) {
      return 'goldCost must be a non-negative number'
    }
    if (p.householdGoldCost !== undefined && (typeof p.householdGoldCost !== 'number' || !Number.isFinite(p.householdGoldCost) || p.householdGoldCost < 0)) {
      return 'householdGoldCost must be a non-negative number'
    }
    if (p.motivation !== undefined) {
      const err = validateConstructionMotivation(p.motivation)
      if (err) return err
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  CONSTRUCTION_PROJECT_PROGRESS: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.projectId !== 'string' || p.projectId.length === 0) return 'projectId required'
    if (p.kind !== 'settlement') return 'invalid kind'
    if (typeof p.targetTileId !== 'string' || p.targetTileId.length === 0) return 'targetTileId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.delta !== 'number' || !Number.isFinite(p.delta) || p.delta <= 0) return 'delta required'
    if (typeof p.progressAfter !== 'number' || !Number.isFinite(p.progressAfter)) return 'progressAfter required'
    if (typeof p.targetProgress !== 'number' || !Number.isFinite(p.targetProgress)) return 'targetProgress required'
    if (p.motivation !== undefined) {
      const err = validateConstructionMotivation(p.motivation)
      if (err) return err
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  BUILDING_CONSTRUCTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.projectId !== 'string' || p.projectId.length === 0) return 'projectId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (p.motivation !== undefined) {
      const err = validateConstructionMotivation(p.motivation)
      if (err) return err
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  BUILDING_DAMAGED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.buildingId !== 'string' || !p.buildingId) return 'buildingId required'
    if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
    if (typeof p.health !== 'number' || p.health < 0 || p.health > 100) return 'health must be 0–100'
    if (p.cause !== 'combat' && p.cause !== 'neglect') return 'cause must be combat or neglect'
    return null
  },
  BUILDING_REPAIRED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.buildingId !== 'string' || !p.buildingId) return 'buildingId required'
    if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
    if (typeof p.health !== 'number' || p.health < 0 || p.health > 100) return 'health must be 0–100'
    if (typeof p.repairedByNpcId !== 'string' || !p.repairedByNpcId) return 'repairedByNpcId required'
    return null
  },
  BUILDING_ABANDONED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.buildingId !== 'string' || !p.buildingId) return 'buildingId required'
    if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
    if (typeof p.lastActivityTick !== 'number') return 'lastActivityTick required'
    return null
  },
  BUILDING_UPGRADED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.buildingId !== 'string' || !p.buildingId) return 'buildingId required'
    if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
    if (!isNonNegativeInteger(p.fromLevel) || (p.fromLevel as number) < 1) return 'fromLevel must be positive integer'
    if (!isNonNegativeInteger(p.toLevel) || (p.toLevel as number) <= (p.fromLevel as number)) return 'toLevel must be greater than fromLevel'
    if (!isNonNegativeInteger(p.upgradedAtTick)) return 'upgradedAtTick required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  BUILDING_CAPTURED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.buildingId !== 'string' || !p.buildingId) return 'buildingId required'
    if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
    if (typeof p.capturingFactionId !== 'string' || !p.capturingFactionId) return 'capturingFactionId required'
    if (p.previousFactionId !== null && typeof p.previousFactionId !== 'string') return 'previousFactionId must be string or null'
    if (!isNonNegativeInteger(p.capturedAtTick)) return 'capturedAtTick required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  MAP_TILE_UNLOCKED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.projectId !== 'string' || p.projectId.length === 0) return 'projectId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!Array.isArray(p.adjacentTo) || !p.adjacentTo.every((v) => typeof v === 'string')) return 'adjacentTo required'
    if (p.motivation !== undefined) {
      const err = validateConstructionMotivation(p.motivation)
      if (err) return err
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  TILE_GENERATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.biome !== 'string' || p.biome.length === 0) return 'biome required'
    if (typeof p.name !== 'string' || p.name.length === 0) return 'name required'
    if (typeof p.x !== 'number' || !Number.isFinite(p.x)) return 'x required'
    if (typeof p.y !== 'number' || !Number.isFinite(p.y)) return 'y required'
    if (!Array.isArray(p.adjacentTileIds) || !p.adjacentTileIds.every((v) => typeof v === 'string')) return 'adjacentTileIds must be string array'
    if (!isNonNegativeInteger(p.generatedAtTick)) return 'generatedAtTick required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_INTERACT: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (!Array.isArray(p.participants) || p.participants.length !== 2) {
      return 'participants must be a tuple of two npcIds'
    }
    const [a, b] = p.participants as readonly unknown[]
    if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
      return 'participants must be non-empty strings'
    }
    if (a === b) return 'participants must differ'
    if (p.mode !== 'chat' && p.mode !== 'argue') return 'mode must be chat or argue'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  AREA_PRESSURE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.kind !== 'string' || p.kind.length === 0) return 'kind required'
    if (!isRecord(p.detail)) return 'detail must be object'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WEATHER_CHANGE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.from !== 'string' || typeof p.to !== 'string') return 'from/to required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SEASON_CHANGE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.from !== 'string' || typeof p.to !== 'string') return 'from/to required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WORLD_EVENT_SPAWN: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.worldEventId !== 'string' || p.worldEventId.length === 0) return 'worldEventId required'
    if (typeof p.templateId !== 'string') return 'templateId required'
    if (typeof p.type !== 'string') return 'type required'
    if (typeof p.scope !== 'string') return 'scope required'
    if (typeof p.endsAtTick !== 'number' || !Number.isFinite(p.endsAtTick)) return 'endsAtTick required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WORLD_EVENT_END: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.worldEventId !== 'string') return 'worldEventId required'
    if (typeof p.templateId !== 'string') return 'templateId required'
    if (typeof p.type !== 'string') return 'type required'
    if (typeof p.scope !== 'string') return 'scope required'
    return null
  },
  BUILDING_ENTER: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    return null
  },
  BUILDING_LEAVE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    return null
  },
  RARE_WINDOW_OPEN: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.windowId !== 'string' || p.windowId.length === 0) return 'windowId required'
    if (typeof p.closesAtTick !== 'number') return 'closesAtTick required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  RARE_WINDOW_CLOSE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.windowId !== 'string' || p.windowId.length === 0) return 'windowId required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WORLD_TICK: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tick !== 'number' || !Number.isFinite(p.tick)) return 'tick required'
    return null
  },
  COMBAT_INITIATE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.combatId !== 'string' || p.combatId.length === 0) return 'combatId required'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0)
      return 'playerAccountId required'
    if (p.enemyType === 'animal') {
      if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required for animal combat'
      if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required for animal combat'
    } else {
      if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    }
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (typeof p.playerCombatHp !== 'number' || p.playerCombatHp <= 0) return 'playerCombatHp required'
    if (typeof p.npcCombatHp !== 'number' || p.npcCombatHp <= 0) return 'npcCombatHp required'
    if (p.reason !== 'player_challenge' && p.reason !== 'npc_aggression') return 'invalid reason'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  COMBAT_PLAYER_ACTION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.combatId !== 'string' || p.combatId.length === 0) return 'combatId required'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0)
      return 'playerAccountId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.combatRound !== 'number' || p.combatRound < 0) return 'combatRound required'
    if (p.action !== 'attack' && p.action !== 'defend' && p.action !== 'flee') return 'invalid action'
    if (typeof p.cardId !== 'undefined' && typeof p.cardId !== 'number') return 'cardId must be number or unset'
    if (typeof p.cardClass !== 'undefined' && (typeof p.cardClass !== 'string' || p.cardClass.length === 0)) {
      return 'cardClass must be non-empty string or unset'
    }
    if (typeof p.playerHpAfter !== 'number' || !Number.isFinite(p.playerHpAfter)) return 'playerHpAfter required'
    if (typeof p.npcHpAfter !== 'number' || !Number.isFinite(p.npcHpAfter)) return 'npcHpAfter required'
    if (!Array.isArray(p.events)) return 'events required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  COMBAT_RESOLVE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.combatId !== 'string' || p.combatId.length === 0) return 'combatId required'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0)
      return 'playerAccountId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (
      p.outcome !== 'player_victory' &&
      p.outcome !== 'npc_victory' &&
      p.outcome !== 'fled'
    ) return 'invalid outcome'
    if (typeof p.durationRounds !== 'number' || p.durationRounds < 0) return 'durationRounds required'
    if (typeof p.finalPlayerHp !== 'number') return 'finalPlayerHp required'
    if (typeof p.finalNpcHp !== 'number') return 'finalNpcHp required'
    if (typeof p.playerEnergyToZero !== 'boolean') return 'playerEnergyToZero required'
    if (typeof p.npcIncapacitatedTicks !== 'number') return 'npcIncapacitatedTicks required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  COMBAT_CARD_PLAY: (p) => validateCombatPayload('COMBAT_CARD_PLAY', p),
  COMBAT_CARD_CANCEL: (p) => validateCombatPayload('COMBAT_CARD_CANCEL', p),
  COMBAT_DAMAGE: (p) => validateCombatPayload('COMBAT_DAMAGE', p),
  COMBAT_HEAL: (p) => validateCombatPayload('COMBAT_HEAL', p),
  COMBAT_STATUS_APPLY: (p) => validateCombatPayload('COMBAT_STATUS_APPLY', p),
  COMBAT_STATUS_TICK: (p) => validateCombatPayload('COMBAT_STATUS_TICK', p),
  COMBAT_STATUS_END: (p) => validateCombatPayload('COMBAT_STATUS_END', p),
  COMBAT_TARGET_LOCK: (p) => validateCombatPayload('COMBAT_TARGET_LOCK', p),
  COMBAT_PHASE_SHIFT: (p) => validateCombatPayload('COMBAT_PHASE_SHIFT', p),
  COMBAT_FLEE_ATTEMPT: (p) => validateCombatPayload('COMBAT_FLEE_ATTEMPT', p),
  COMBAT_DEFEAT: (p) => validateCombatPayload('COMBAT_DEFEAT', p),
  PLAYER_INTERVENE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) {
      return 'playerAccountId required'
    }
    if (typeof p.npcA !== 'string' || p.npcA.length === 0) return 'npcA required'
    if (typeof p.npcB !== 'string' || p.npcB.length === 0) return 'npcB required'
    if (p.npcA === p.npcB) return 'npcA and npcB must differ'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (
      p.intentClass !== 'mediate' &&
      p.intentClass !== 'provoke' &&
      p.intentClass !== 'watch' &&
      p.intentClass !== 'threaten'
    ) {
      return 'intentClass must be mediate / provoke / watch / threaten'
    }
    if (typeof p.message !== 'string') return 'message required (can be empty string)'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  PLAYER_ENERGY_SET: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) {
      return 'playerAccountId required'
    }
    if (typeof p.energy !== 'number' || !Number.isFinite(p.energy)) return 'energy required'
    if (p.reason !== 'combat_defeat') return 'invalid reason'
    if (typeof p.sourceCombatId !== 'undefined' && typeof p.sourceCombatId !== 'string') {
      return 'sourceCombatId must be string or unset'
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_DIALOG_HOLD: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) {
      return 'playerAccountId required'
    }
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (typeof p.holdTicks !== 'number' || !Number.isFinite(p.holdTicks) || p.holdTicks <= 0) {
      return 'holdTicks must be positive number'
    }
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  SETTLEMENT_FORMED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.settlementId !== 'string' || p.settlementId.length === 0) return 'settlementId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.formedAtTick !== 'number' || !Number.isInteger(p.formedAtTick) || p.formedAtTick < 0) {
      return 'formedAtTick must be non-negative integer'
    }
    if (!Array.isArray(p.founderNpcIds) || p.founderNpcIds.length === 0) return 'founderNpcIds required (non-empty array)'
    for (const id of p.founderNpcIds) {
      if (typeof id !== 'string' || id.length === 0) return 'founderNpcIds entries must be non-empty strings'
    }
    // Determinism: founderNpcIds must be sorted lex ascending.
    for (let i = 1; i < p.founderNpcIds.length; i += 1) {
      if (p.founderNpcIds[i - 1] >= p.founderNpcIds[i]) {
        return 'founderNpcIds must be sorted ascending and unique'
      }
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SETTLEMENT_POPULATION_UPDATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateSettlementCommon(p)
    if (err) return err
    if (!Array.isArray(p.populationNpcIds)) return 'populationNpcIds required'
    const idsErr = validateSortedUniqueStrings(p.populationNpcIds, 'populationNpcIds')
    if (idsErr) return idsErr
    if (!isNonNegativeInteger(p.updatedAtTick)) return 'updatedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SETTLEMENT_STORAGE_UPDATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateSettlementCommon(p)
    if (err) return err
    if (!Array.isArray(p.storage)) return 'storage required'
    const storageErr = validateSettlementStorage(p.storage)
    if (storageErr) return storageErr
    if (!isNonNegativeInteger(p.updatedAtTick)) return 'updatedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SETTLEMENT_PRESSURE_UPDATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateSettlementCommon(p)
    if (err) return err
    const pressureErr = validateSettlementPressure(p.pressure)
    if (pressureErr) return pressureErr
    if (!isNonNegativeInteger(p.updatedAtTick)) return 'updatedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SETTLEMENT_STABILITY_CHANGED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateSettlementCommon(p)
    if (err) return err
    if (!isPressureScore(p.stability)) return 'stability must be integer 0-100'
    if (!isSettlementStatus(p.status)) return 'status invalid'
    if (!isNonNegativeInteger(p.changedAtTick)) return 'changedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SETTLEMENT_DECLINED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateSettlementCommon(p)
    if (err) return err
    if (!isPressureScore(p.stability)) return 'stability must be integer 0-100'
    if (!isNonNegativeInteger(p.declinedAtTick)) return 'declinedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SETTLEMENT_RECOVERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateSettlementCommon(p)
    if (err) return err
    if (!isPressureScore(p.stability)) return 'stability must be integer 0-100'
    if (p.status !== 'stable' && p.status !== 'recovering') return 'status must be stable or recovering'
    if (!isNonNegativeInteger(p.recoveredAtTick)) return 'recoveredAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SETTLEMENT_EVACUATION_STARTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateSettlementCommon(p)
    if (err) return err
    if (!Array.isArray(p.fleeingNpcIds) || !(p.fleeingNpcIds as unknown[]).every((x) => typeof x === 'string')) return 'fleeingNpcIds must be string array'
    if (typeof p.targetTileId !== 'string' || p.targetTileId.length === 0) return 'targetTileId required'
    if (!isNonNegativeInteger(p.evacuatedAtTick)) return 'evacuatedAtTick required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ANIMAL_SPAWNED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (!isRecord(p.animal)) return 'animal required'
    const err = validateAnimal(p.animal)
    if (err) return err
    if (typeof p.spawnedAtTick !== 'number' || !Number.isInteger(p.spawnedAtTick) || p.spawnedAtTick < 0) {
      return 'spawnedAtTick must be non-negative integer'
    }
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  ANIMAL_HUNT_STARTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateHuntCommon(p)
    if (err) return err
    if (typeof p.startedAtTick !== 'number' || !Number.isInteger(p.startedAtTick) || p.startedAtTick < 0) return 'startedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ANIMAL_HUNT_RESOLVED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateHuntCommon(p)
    if (err) return err
    if (p.outcome !== 'success' && p.outcome !== 'failed') return 'outcome invalid'
    if (typeof p.resolvedAtTick !== 'number' || !Number.isInteger(p.resolvedAtTick) || p.resolvedAtTick < 0) return 'resolvedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ANIMAL_KILLED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.huntId !== 'string' || p.huntId.length === 0) return 'huntId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.killedByNpcId !== 'string' || p.killedByNpcId.length === 0) return 'killedByNpcId required'
    if (typeof p.killedAtTick !== 'number' || !Number.isInteger(p.killedAtTick) || p.killedAtTick < 0) return 'killedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ANIMAL_STARVED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.starvationId !== 'string' || p.starvationId.length === 0) return 'starvationId required'
    if (typeof p.predatorAnimalId !== 'string' || p.predatorAnimalId.length === 0) return 'predatorAnimalId required'
    if (typeof p.predatorSpeciesId !== 'string' || p.predatorSpeciesId.length === 0) return 'predatorSpeciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (p.starvationStage !== 'hungry' && p.starvationStage !== 'scarce_prey') return 'starvationStage invalid'
    if (typeof p.starvedAtTick !== 'number' || !Number.isInteger(p.starvedAtTick) || p.starvedAtTick < 0) return 'starvedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ANIMAL_REPRODUCED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (!isRecord(p.animal)) return 'animal required'
    const err = validateAnimal(p.animal)
    if (err) return err
    if (!Array.isArray(p.parentAnimalIds) || p.parentAnimalIds.length !== 2) return 'parentAnimalIds tuple required'
    const [a, b] = p.parentAnimalIds as readonly unknown[]
    if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return 'parent animal ids required'
    if (a === b) return 'parent animal ids must differ'
    if (a > b) return 'parentAnimalIds must be sorted ascending'
    if (typeof p.reproducedAtTick !== 'number' || !Number.isInteger(p.reproducedAtTick) || p.reproducedAtTick < 0) {
      return 'reproducedAtTick must be non-negative integer'
    }
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  MIGRATION_WAVE_STARTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.waveId !== 'string' || p.waveId.length === 0) return 'waveId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return 'fromTileId required'
    if (typeof p.toTileId !== 'string' || p.toTileId.length === 0) return 'toTileId required'
    if (p.fromTileId === p.toTileId) return 'fromTileId and toTileId must differ'
    if (typeof p.startedAtTick !== 'number' || !Number.isInteger(p.startedAtTick) || p.startedAtTick < 0) {
      return 'startedAtTick must be non-negative integer'
    }
    if (p.migrationType !== 'pressure' && p.migrationType !== 'seasonal') return 'migrationType must be pressure or seasonal'
    return null
  },
  ANIMAL_MIGRATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return 'fromTileId required'
    if (typeof p.toTileId !== 'string' || p.toTileId.length === 0) return 'toTileId required'
    if (p.fromTileId === p.toTileId) return 'fromTileId and toTileId must differ'
    if (typeof p.migratedAtTick !== 'number' || !Number.isInteger(p.migratedAtTick) || p.migratedAtTick < 0) {
      return 'migratedAtTick must be non-negative integer'
    }
    if (p.migrationType !== 'pressure' && p.migrationType !== 'seasonal') return 'migrationType must be pressure or seasonal'
    if (typeof p.waveId !== 'string' || p.waveId.length === 0) return 'waveId required'
    return null
  },
  CARCASS_CREATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.huntId !== 'string' || p.huntId.length === 0) return 'huntId required'
    if (typeof p.carcassId !== 'string' || p.carcassId.length === 0) return 'carcassId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.edibleYield !== 'number' || !Number.isFinite(p.edibleYield) || p.edibleYield < 0) return 'edibleYield required'
    if (!Array.isArray(p.byproducts) || !p.byproducts.every((value) => typeof value === 'string')) return 'byproducts required'
    if (typeof p.createdAtTick !== 'number' || !Number.isInteger(p.createdAtTick) || p.createdAtTick < 0) return 'createdAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  MEAT_HARVESTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.huntId !== 'string' || p.huntId.length === 0) return 'huntId required'
    if (typeof p.carcassId !== 'string' || p.carcassId.length === 0) return 'carcassId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.quantity !== 'number' || !Number.isFinite(p.quantity) || p.quantity <= 0) return 'quantity required'
    if (typeof p.goldValue !== 'number' || !Number.isFinite(p.goldValue) || p.goldValue < 0) return 'goldValue required'
    if (typeof p.harvestedAtTick !== 'number' || !Number.isInteger(p.harvestedAtTick) || p.harvestedAtTick < 0) return 'harvestedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  HIDE_COLLECTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.huntId !== 'string' || p.huntId.length === 0) return 'huntId required'
    if (typeof p.carcassId !== 'string' || p.carcassId.length === 0) return 'carcassId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.byproductId !== 'string' || p.byproductId.length === 0) return 'byproductId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  BONE_COLLECTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.huntId !== 'string' || p.huntId.length === 0) return 'huntId required'
    if (typeof p.carcassId !== 'string' || p.carcassId.length === 0) return 'carcassId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.byproductId !== 'string' || p.byproductId.length === 0) return 'byproductId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  FISHERY_HARVESTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.delta !== 'number' || !Number.isFinite(p.delta) || p.delta <= 0) return 'delta required'
    if (typeof p.densityBefore !== 'number' || !Number.isFinite(p.densityBefore)) return 'densityBefore required'
    if (typeof p.densityAfter !== 'number' || !Number.isFinite(p.densityAfter)) return 'densityAfter required'
    if (p.densityAfter > p.densityBefore) return 'densityAfter must not increase'
    if (typeof p.harvestedAtTick !== 'number' || !Number.isInteger(p.harvestedAtTick) || p.harvestedAtTick < 0) return 'harvestedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  FISHERY_COLLAPSED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.density !== 'number' || !Number.isFinite(p.density)) return 'density required'
    if (typeof p.collapsedAtTick !== 'number' || !Number.isInteger(p.collapsedAtTick) || p.collapsedAtTick < 0) return 'collapsedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  GOODS_EXTRACTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (!isPositiveQuantity(p.quantity)) return 'quantity required'
    if (typeof p.sourceEventType !== 'string' || p.sourceEventType.length === 0) return 'sourceEventType required'
    if (typeof p.sourceId !== 'string' || p.sourceId.length === 0) return 'sourceId required'
    if (typeof p.sourceTileId !== 'string' || p.sourceTileId.length === 0) return 'sourceTileId required'
    if (typeof p.extractedByNpcId !== 'string' || p.extractedByNpcId.length === 0) return 'extractedByNpcId required'
    if (!isNonNegativeInteger(p.extractedAtTick)) return 'extractedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  GOODS_STORED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateGoodsHolderPayload(p)
    if (err) return err
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (!isPositiveQuantity(p.quantity)) return 'quantity required'
    if (!isNonNegativeInteger(p.storedAtTick)) return 'storedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  GOODS_PROCESSED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateGoodsHolderPayload(p)
    if (err) return err
    if (p.recipeId !== undefined && (typeof p.recipeId !== 'string' || p.recipeId.length === 0)) return 'recipeId invalid'
    if (typeof p.inputGoodsId !== 'string' || p.inputGoodsId.length === 0) return 'inputGoodsId required'
    if (!isPositiveQuantity(p.inputQuantity)) return 'inputQuantity required'
    if (typeof p.outputGoodsId !== 'string' || p.outputGoodsId.length === 0) return 'outputGoodsId required'
    if (!isPositiveQuantity(p.outputQuantity)) return 'outputQuantity required'
    if (!isNonNegativeInteger(p.processedAtTick)) return 'processedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  GOODS_CONSUMED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateGoodsHolderPayload(p)
    if (err) return err
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (!isPositiveQuantity(p.quantity)) return 'quantity required'
    if (p.consumerNpcId !== undefined && (typeof p.consumerNpcId !== 'string' || p.consumerNpcId.length === 0)) return 'consumerNpcId invalid'
    if (!isNonNegativeInteger(p.consumedAtTick)) return 'consumedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  GOODS_DESTROYED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateGoodsHolderPayload(p)
    if (err) return err
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (!isPositiveQuantity(p.quantity)) return 'quantity required'
    if (typeof p.reason !== 'string' || p.reason.length === 0) return 'reason required'
    if (!isNonNegativeInteger(p.destroyedAtTick)) return 'destroyedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  TRADE_ROUTE_OPENED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.routeId !== 'string' || p.routeId.length === 0) return 'routeId required'
    if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return 'fromTileId required'
    if (typeof p.toTileId !== 'string' || p.toTileId.length === 0) return 'toTileId required'
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (!isNonNegativeInteger(p.openedAtTick)) return 'openedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  TRADE_ROUTE_CLOSED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.routeId !== 'string' || p.routeId.length === 0) return 'routeId required'
    if (!isNonNegativeInteger(p.closedAtTick)) return 'closedAtTick must be non-negative integer'
    if (typeof p.reason !== 'string' || p.reason.length === 0) return 'reason required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  GOODS_TRANSPORT_STARTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateTransportPayload(p, 'started')
    if (err) return err
    if (!isGoodsHolderType(p.fromHolderType)) return 'fromHolderType invalid'
    if (typeof p.fromHolderId !== 'string' || p.fromHolderId.length === 0) return 'fromHolderId required'
    if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return 'fromTileId required'
    if (!isNonNegativeInteger(p.startedAtTick)) return 'startedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  GOODS_TRANSPORT_ARRIVED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateTransportPayload(p, 'arrived')
    if (err) return err
    if (!isNonNegativeInteger(p.arrivedAtTick)) return 'arrivedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  GOODS_TRANSPORT_LOST: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.transportId !== 'string' || p.transportId.length === 0) return 'transportId required'
    if (typeof p.routeId !== 'string' || p.routeId.length === 0) return 'routeId required'
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (!isPositiveQuantity(p.quantity)) return 'quantity required'
    if (typeof p.carrierNpcId !== 'string' || p.carrierNpcId.length === 0) return 'carrierNpcId required'
    if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return 'fromTileId required'
    if (typeof p.toTileId !== 'string' || p.toTileId.length === 0) return 'toTileId required'
    if (typeof p.reason !== 'string' || p.reason.length === 0) return 'reason required'
    if (!isNonNegativeInteger(p.lostAtTick)) return 'lostAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  MARKET_PRICE_DISCOVERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.marketId !== 'string' || p.marketId.length === 0) return 'marketId required'
    if (typeof p.settlementId !== 'string' || p.settlementId.length === 0) return 'settlementId required'
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (!isNonNegativeQuantity(p.supplyQuantity)) return 'supplyQuantity required'
    if (!isPositiveQuantity(p.demandQuantity)) return 'demandQuantity required'
    if (!isPositiveQuantity(p.priceGold)) return 'priceGold required'
    if (!isNonNegativeInteger(p.discoveredAtTick)) return 'discoveredAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_RUMOR_HEARD: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.rumorId !== 'string' || p.rumorId.length === 0) return 'rumorId required'
    if (p.topic !== 'predator_death' && p.topic !== 'construction_complete') return 'topic invalid'
    if (typeof p.subjectId !== 'string' || p.subjectId.length === 0) return 'subjectId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.originTick)) return 'originTick must be non-negative integer'
    if (typeof p.accuracy !== 'number' || !Number.isInteger(p.accuracy) || p.accuracy < 0 || p.accuracy > 100) return 'accuracy must be integer 0-100'
    return null
  },
  NPC_RUMOR_SPREAD: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.fromNpcId !== 'string' || p.fromNpcId.length === 0) return 'fromNpcId required'
    if (typeof p.toNpcId !== 'string' || p.toNpcId.length === 0) return 'toNpcId required'
    if (p.fromNpcId === p.toNpcId) return 'fromNpcId and toNpcId must differ'
    if (typeof p.rumorId !== 'string' || p.rumorId.length === 0) return 'rumorId required'
    if (p.topic !== 'predator_death' && p.topic !== 'construction_complete') return 'topic invalid'
    if (typeof p.subjectId !== 'string' || p.subjectId.length === 0) return 'subjectId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.originTick)) return 'originTick must be non-negative integer'
    if (typeof p.accuracy !== 'number' || !Number.isInteger(p.accuracy) || p.accuracy < 0 || p.accuracy > 100) return 'accuracy must be integer 0-100'
    return null
  },
  NPC_OBSERVED_SKILL: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (!(SKILL_IDS as readonly string[]).includes(p.skillId as string)) return 'skillId must be one of: ' + SKILL_IDS.join(', ')
    if (typeof p.sourceEventType !== 'string' || p.sourceEventType.length === 0) return 'sourceEventType required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    if (p.xpDelta !== undefined && (typeof p.xpDelta !== 'number' || !Number.isInteger(p.xpDelta) || p.xpDelta <= 0)) return 'xpDelta must be positive integer if provided'
    return null
  },
  NPC_MENTORSHIP_STARTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.mentorNpcId !== 'string' || p.mentorNpcId.length === 0) return 'mentorNpcId required'
    if (typeof p.menteeNpcId !== 'string' || p.menteeNpcId.length === 0) return 'menteeNpcId required'
    if (p.mentorNpcId === p.menteeNpcId) return 'mentorNpcId and menteeNpcId must differ'
    if (!(SKILL_IDS as readonly string[]).includes(p.skillId as string)) return 'skillId must be one of: ' + SKILL_IDS.join(', ')
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  NPC_MENTORSHIP_COMPLETED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.mentorNpcId !== 'string' || p.mentorNpcId.length === 0) return 'mentorNpcId required'
    if (typeof p.menteeNpcId !== 'string' || p.menteeNpcId.length === 0) return 'menteeNpcId required'
    if (!(SKILL_IDS as readonly string[]).includes(p.skillId as string)) return 'skillId must be one of: ' + SKILL_IDS.join(', ')
    if (typeof p.finalLevel !== 'number' || !Number.isInteger(p.finalLevel) || p.finalLevel < 1) return 'finalLevel must be positive integer'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  CULTURAL_FESTIVAL_FORMED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.windowId !== 'string' || p.windowId.length === 0) return 'windowId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.occurrenceCount !== 'number' || !Number.isInteger(p.occurrenceCount) || p.occurrenceCount < 1) return 'occurrenceCount must be positive integer'
    if (!isNonNegativeInteger(p.formedAtTick)) return 'formedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  CULTURAL_RITUAL_PERFORMED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.factionLean !== 'string' || p.factionLean.length === 0) return 'factionLean required'
    if (!isNonNegativeInteger(p.performedAtTick)) return 'performedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  CULTURAL_NORM_ESTABLISHED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!(SKILL_IDS as readonly string[]).includes(p.skillId as string)) return 'skillId must be one of: ' + SKILL_IDS.join(', ')
    if (typeof p.npcCount !== 'number' || !Number.isInteger(p.npcCount) || p.npcCount < 1) return 'npcCount must be positive integer'
    if (!isNonNegativeInteger(p.formedAtTick)) return 'formedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  HOUSEHOLD_GOLD_CONTRIBUTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateHouseholdMoneyCommon(p)
    if (err) return err
    if (typeof p.sourceEventType !== 'string' || p.sourceEventType.length === 0) return 'sourceEventType required'
    if (typeof p.contributedAtTick !== 'number' || !Number.isInteger(p.contributedAtTick) || p.contributedAtTick < 0) return 'contributedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  HOUSEHOLD_GOLD_SPENT: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateHouseholdMoneyCommon(p)
    if (err) return err
    if (typeof p.purpose !== 'string' || p.purpose.length === 0) return 'purpose required'
    if (typeof p.spentAtTick !== 'number' || !Number.isInteger(p.spentAtTick) || p.spentAtTick < 0) return 'spentAtTick must be non-negative integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  HOUSEHOLD_INHERITANCE_ASSIGNED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (typeof p.deceasedNpcId !== 'string' || p.deceasedNpcId.length === 0) return 'deceasedNpcId required'
    if (typeof p.heirId !== 'string' || p.heirId.length === 0) return 'heirId required'
    if (!isPositiveQuantity(p.amount)) return 'amount required'
    if (typeof p.assignedAtTick !== 'number' || !Number.isInteger(p.assignedAtTick) || p.assignedAtTick < 0) return 'assignedAtTick must be non-negative integer'
    if (p.goods !== undefined) {
      if (!Array.isArray(p.goods)) return 'goods must be array when present'
      for (const line of p.goods) {
        if (!isRecord(line)) return 'goods line must be object'
        if (typeof line.goodsId !== 'string' || line.goodsId.length === 0) return 'goods line goodsId required'
        if (!isPositiveQuantity(line.quantity)) return 'goods line quantity must be positive'
        if (typeof line.tileId !== 'string' || line.tileId.length === 0) return 'goods line tileId required'
      }
    }
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  ANIMAL_TARGETED_NPC: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.attackId !== 'string' || p.attackId.length === 0) return 'attackId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.targetedAtTick !== 'number' || !Number.isInteger(p.targetedAtTick) || p.targetedAtTick < 0) return 'targetedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  ANIMAL_ATTACKED_NPC: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.attackId !== 'string' || p.attackId.length === 0) return 'attackId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.attackedAtTick !== 'number' || !Number.isInteger(p.attackedAtTick) || p.attackedAtTick < 0) return 'attackedAtTick must be non-negative integer'
    if (!isRecord(p.damage)) return 'damage required'
    if (typeof p.damage.mood !== 'number' || !Number.isInteger(p.damage.mood)) return 'damage.mood must be integer'
    if (typeof p.damage.health !== 'number' || !Number.isInteger(p.damage.health)) return 'damage.health must be integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  ANIMAL_FLED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.fleeRouteId !== 'string' || p.fleeRouteId.length === 0) return 'fleeRouteId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return 'fromTileId required'
    if (typeof p.toTileId !== 'string' || p.toTileId.length === 0) return 'toTileId required'
    if (p.fromTileId === p.toTileId) return 'fromTileId must differ from toTileId'
    if (p.reason !== 'attacked' && p.reason !== 'injured') return 'reason must be attacked or injured'
    if (typeof p.fledAtTick !== 'number' || !Number.isInteger(p.fledAtTick) || p.fledAtTick < 0) return 'fledAtTick must be non-negative integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  ANIMAL_RETALIATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.retaliationId !== 'string' || p.retaliationId.length === 0) return 'retaliationId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.retaliatedAtTick !== 'number' || !Number.isInteger(p.retaliatedAtTick) || p.retaliatedAtTick < 0) return 'retaliatedAtTick must be non-negative integer'
    if (!isRecord(p.damage)) return 'damage required'
    if (typeof p.damage.mood !== 'number' || !Number.isInteger(p.damage.mood)) return 'damage.mood must be integer'
    if (typeof p.damage.health !== 'number' || !Number.isInteger(p.damage.health)) return 'damage.health must be integer'
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  NPC_DEFENSE_PARTY_FORMED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.partyId !== 'string' || p.partyId.length === 0) return 'partyId required'
    if (typeof p.targetAnimalId !== 'string' || p.targetAnimalId.length === 0) return 'targetAnimalId required'
    if (typeof p.targetSpeciesId !== 'string' || p.targetSpeciesId.length === 0) return 'targetSpeciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.victimNpcId !== 'string' || p.victimNpcId.length === 0) return 'victimNpcId required'
    if (typeof p.reactionToAttackId !== 'string' || p.reactionToAttackId.length === 0) return 'reactionToAttackId required'
    if (typeof p.formedAtTick !== 'number' || !Number.isInteger(p.formedAtTick) || p.formedAtTick < 0) return 'formedAtTick must be non-negative integer'
    if (!Array.isArray(p.memberNpcIds) || p.memberNpcIds.length < 2) return 'memberNpcIds requires at least 2 ids'
    for (const id of p.memberNpcIds) {
      if (typeof id !== 'string' || id.length === 0) return 'memberNpcIds must be non-empty strings'
    }
    if (typeof p.narration !== 'string' || p.narration.length === 0) return 'narration required'
    return null
  },
  SPECIES_EXTINCTION_WARNING: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.population !== 'number' || !Number.isInteger(p.population) || p.population < 0) return 'population must be non-negative integer'
    if (typeof p.threshold !== 'number' || !Number.isInteger(p.threshold) || p.threshold <= 0) return 'threshold must be positive integer'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  SPECIES_EXTINCT: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (!isNonNegativeInteger(p.lastSeenTick)) return 'lastSeenTick must be non-negative integer'
    if (!Array.isArray(p.affectedTileIds)) return 'affectedTileIds must be array'
    for (const id of p.affectedTileIds) {
      if (typeof id !== 'string' || id.length === 0) return 'affectedTileIds must be non-empty strings'
    }
    return null
  },
  SPECIES_RECOVERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.population !== 'number' || !Number.isInteger(p.population) || p.population <= 0) return 'population must be positive integer'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  FISHERY_RECOVERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.density !== 'number' || !Number.isFinite(p.density) || p.density <= 0) return 'density must be positive'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  ECOSYSTEM_PRESSURE_RAISED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.pressureLevel !== 'number' || !Number.isInteger(p.pressureLevel) || p.pressureLevel < 0 || p.pressureLevel > 100) return 'pressureLevel must be integer 0–100'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  ECOSYSTEM_PRESSURE_RECOVERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  FOREST_DEPLETED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.pressureLevel !== 'number' || !Number.isInteger(p.pressureLevel) || p.pressureLevel < 0 || p.pressureLevel > 100) return 'pressureLevel must be integer 0–100'
    if (!isNonNegativeInteger(p.depletedAtTick)) return 'depletedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  FOREST_RECOVERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  BIOME_RECOVERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.biome !== 'string' || p.biome.length === 0) return 'biome required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SPECIES_POPULATION_SHIFTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (!isNonNegativeInteger(p.previousTotal)) return 'previousTotal must be non-negative integer'
    if (!isNonNegativeInteger(p.currentTotal)) return 'currentTotal must be non-negative integer'
    if (typeof p.changePercent !== 'number' || !Number.isFinite(p.changePercent)) return 'changePercent must be a finite number'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  POLLUTION_INCREASED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.pollutionLevel !== 'number' || !Number.isInteger(p.pollutionLevel) || p.pollutionLevel < 0 || p.pollutionLevel > 100) return 'pollutionLevel must be integer 0–100'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  POLLUTION_RECOVERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  ANIMAL_DOMESTICATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.settlementId !== 'string' || p.settlementId.length === 0) return 'settlementId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  LIVESTOCK_BRED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.settlementId !== 'string' || p.settlementId.length === 0) return 'settlementId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.newAnimalId !== 'string' || p.newAnimalId.length === 0) return 'newAnimalId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  LIVESTOCK_SLAUGHTERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.settlementId !== 'string' || p.settlementId.length === 0) return 'settlementId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (!Array.isArray(p.goods)) return 'goods must be array'
    for (const g of p.goods) {
      if (!isRecord(g)) return 'goods items must be objects'
      if (typeof g.goodsId !== 'string' || g.goodsId.length === 0) return 'goods[].goodsId required'
      if (typeof g.amount !== 'number' || !Number.isFinite(g.amount) || g.amount <= 0) return 'goods[].amount must be positive number'
    }
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  MOUNT_ASSIGNED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.settlementId !== 'string' || p.settlementId.length === 0) return 'settlementId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  // Phase E4 — Mythic Ecology
  LEGENDARY_WORLD_EVENT_SPAWNED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.eventKind !== 'string' || p.eventKind.length === 0) return 'eventKind required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.linkedAnimalId !== 'string' || p.linkedAnimalId.length === 0) return 'linkedAnimalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.severity !== 'number' || !Number.isFinite(p.severity)) return 'severity required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  LEGENDARY_WORLD_EVENT_RESOLVED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.linkedAnimalId !== 'string' || p.linkedAnimalId.length === 0) return 'linkedAnimalId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (!isNonNegativeInteger(p.resolutionTick)) return 'resolutionTick must be non-negative integer'
    return null
  },
  LEGENDARY_HUNT_STARTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.worldEventId !== 'string' || p.worldEventId.length === 0) return 'worldEventId required'
    if (typeof p.linkedAnimalId !== 'string' || p.linkedAnimalId.length === 0) return 'linkedAnimalId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!Array.isArray(p.hunterNpcIds) || p.hunterNpcIds.length === 0) return 'hunterNpcIds required'
    if (!isNonNegativeInteger(p.startedAtTick)) return 'startedAtTick must be non-negative integer'
    return null
  },
  LEGENDARY_HUNT_CONCLUDED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.worldEventId !== 'string' || p.worldEventId.length === 0) return 'worldEventId required'
    if (typeof p.linkedAnimalId !== 'string' || p.linkedAnimalId.length === 0) return 'linkedAnimalId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.concludedAtTick)) return 'concludedAtTick must be non-negative integer'
    if (p.outcome !== 'killed' && p.outcome !== 'migrated' && p.outcome !== 'starved') return 'invalid outcome'
    return null
  },
  FOREST_CLEARCUT_ORDERED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.factionId !== 'string' || p.factionId.length === 0) return 'factionId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.pressureLevel !== 'number' || !Number.isFinite(p.pressureLevel)) return 'pressureLevel required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  FISHING_QUOTA_ENFORCED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.factionId !== 'string' || p.factionId.length === 0) return 'factionId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.fisheryDensity !== 'number' || !Number.isFinite(p.fisheryDensity)) return 'fisheryDensity required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  INDUSTRIAL_SITE_SABOTAGED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.factionId !== 'string' || p.factionId.length === 0) return 'factionId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.livestockCount !== 'number' || !Number.isFinite(p.livestockCount)) return 'livestockCount required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  RITUAL_ECOSYSTEM_MANIPULATION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.factionId !== 'string' || p.factionId.length === 0) return 'factionId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  FACTION_ECOLOGY_CONFLICT_STARTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.conflictId !== 'string' || p.conflictId.length === 0) return 'conflictId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (p.resourceType !== 'fishery' && p.resourceType !== 'forest') return 'resourceType must be fishery or forest'
    if (typeof p.contestingFactionId !== 'string' || p.contestingFactionId.length === 0) return 'contestingFactionId required'
    if (p.currentFactionId !== null && typeof p.currentFactionId !== 'string') return 'currentFactionId must be string or null'
    if (!isNonNegativeInteger(p.tick)) return 'tick required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  // Phase 6 — Player Civilization
  PLAYER_PICKED_UP_GOODS: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (typeof p.quantity !== 'number' || !Number.isFinite(p.quantity) || p.quantity <= 0) return 'quantity must be positive'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_DEPOSIT_GOODS: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.settlementId !== 'string' || p.settlementId.length === 0) return 'settlementId required'
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (typeof p.quantity !== 'number' || !Number.isFinite(p.quantity) || p.quantity <= 0) return 'quantity must be positive'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_TRADED_GOODS: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!Array.isArray(p.offeredGoods)) return 'offeredGoods must be array'
    if (!Array.isArray(p.requestedGoods)) return 'requestedGoods must be array'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_HUNTED_ANIMAL: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_FISHED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.quantity !== 'number' || !Number.isFinite(p.quantity) || p.quantity <= 0) return 'quantity must be positive'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_DOMESTICATED_ANIMAL: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_PROTECTED_REGION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_HIRED_NPC: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_DISMISSED_NPC: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_SPONSORED_CONSTRUCTION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.buildingType !== 'string' || p.buildingType.length === 0) return 'buildingType required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_FOUNDED_SETTLEMENT: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.settlementName !== 'string' || p.settlementName.length === 0) return 'settlementName required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_CLAIMED_TERRITORY: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_JOINED_FACTION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.factionId !== 'string' || p.factionId.length === 0) return 'factionId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_LEFT_FACTION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.factionId !== 'string' || p.factionId.length === 0) return 'factionId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_LED_FACTION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.factionId !== 'string' || p.factionId.length === 0) return 'factionId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  PLAYER_PLAYED_CARD: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) return 'playerAccountId required'
    if (typeof p.cardId !== 'string' || p.cardId.length === 0) return 'cardId required'
    if (typeof p.targetTileId !== 'string' || p.targetTileId.length === 0) return 'targetTileId required'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    return null
  },
  NPC_DECEASED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (!isNonNegativeInteger(p.deceasedAtTick)) return 'deceasedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_HEIR_ASSIGNED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (typeof p.deceasedNpcId !== 'string' || p.deceasedNpcId.length === 0) return 'deceasedNpcId required'
    if (typeof p.heirNpcId !== 'string' || p.heirNpcId.length === 0) return 'heirNpcId required'
    if (!isNonNegativeInteger(p.assignedAtTick)) return 'assignedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  FACTION_TILE_SEIZED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.factionId !== 'string' || p.factionId.length === 0) return 'factionId required'
    if (p.previousFactionId !== null && typeof p.previousFactionId !== 'string') return 'previousFactionId must be string or null'
    if (!isNonNegativeInteger(p.seizedAtTick)) return 'seizedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  FACTION_NPC_LOYALTY_SHIFTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.fromFaction !== 'string' || p.fromFaction.length === 0) return 'fromFaction required'
    if (typeof p.toFaction !== 'string' || p.toFaction.length === 0) return 'toFaction required'
    if (!isNonNegativeInteger(p.shiftedAtTick)) return 'shiftedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  FACTION_DOMINANCE_SHIFTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.losingFactionId !== 'string' || p.losingFactionId.length === 0) return 'losingFactionId required'
    if (p.dominantFactionId !== null && typeof p.dominantFactionId !== 'string') return 'dominantFactionId must be string or null'
    if (!isNonNegativeInteger(p.lostTileCount)) return 'lostTileCount must be non-negative integer'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  TERRITORY_CLAIM_CHANGED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.fromFactionId !== 'string' || p.fromFactionId.length === 0) return 'fromFactionId required'
    if (p.toFactionId !== null && typeof p.toFactionId !== 'string') return 'toFactionId must be string or null'
    if (!isNonNegativeInteger(p.tileCount)) return 'tileCount must be non-negative integer'
    if (!isNonNegativeInteger(p.tick)) return 'tick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  // NPC Intention Layer (v0.51.0)
  NPC_INTENT_RESOLVED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (!isIntentKind(p.intentType)) return 'intentType must be one of: survival, economic, social, ecosystem'
    if (typeof p.targetTile !== 'string' || p.targetTile.length === 0) return 'targetTile required'
    if (!isIntentOutcome(p.outcome)) return 'outcome must be one of: success, failure'
    if (typeof p.urgencyAtDispatch !== 'number' || p.urgencyAtDispatch < 0) return 'urgencyAtDispatch must be non-negative number'
    if (!isNonNegativeInteger(p.resolvedAtTick)) return 'resolvedAtTick must be non-negative integer'
    return null
  },
  NPC_HOUSEHOLD_MIGRATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return 'fromTileId required'
    if (typeof p.toTileId !== 'string' || p.toTileId.length === 0) return 'toTileId required'
    if (typeof p.reason !== 'string' || p.reason.length === 0) return 'reason required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ROAD_CONSTRUCTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.roadId !== 'string' || p.roadId.length === 0) return 'roadId required'
    if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return 'fromTileId required'
    if (typeof p.toTileId !== 'string' || p.toTileId.length === 0) return 'toTileId required'
    if (p.roadType !== 'road' && p.roadType !== 'bridge') return 'roadType must be road or bridge'
    if (!isNonNegativeInteger(p.constructedAtTick)) return 'constructedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ROAD_DESTROYED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.roadId !== 'string' || p.roadId.length === 0) return 'roadId required'
    if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return 'fromTileId required'
    if (typeof p.toTileId !== 'string' || p.toTileId.length === 0) return 'toTileId required'
    if (!isNonNegativeInteger(p.destroyedAtTick)) return 'destroyedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  CARD_RULE_OPERATOR_ACTIVATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.activationId !== 'string' || p.activationId.length === 0) return 'activationId required'
    if (typeof p.cardId !== 'string' || p.cardId.length === 0) return 'cardId required'
    if (typeof p.playerId !== 'string' || p.playerId.length === 0) return 'playerId required'
    if (typeof p.effectKind !== 'string' || p.effectKind.length === 0) return 'effectKind required'
    if (typeof p.effectValue !== 'number') return 'effectValue must be number'
    if (!isNonNegativeInteger(p.activatedAtTick)) return 'activatedAtTick must be non-negative integer'
    if (!isNonNegativeInteger(p.expiresAtTick)) return 'expiresAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  CARD_RULE_OPERATOR_EXPIRED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.activationId !== 'string' || p.activationId.length === 0) return 'activationId required'
    if (typeof p.cardId !== 'string' || p.cardId.length === 0) return 'cardId required'
    if (typeof p.playerId !== 'string' || p.playerId.length === 0) return 'playerId required'
    if (!isNonNegativeInteger(p.expiredAtTick)) return 'expiredAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_INCAPACITATED_LONG: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.incapacitatedAtTick)) return 'incapacitatedAtTick must be non-negative integer'
    if (!isNonNegativeInteger(p.recoverAtTick)) return 'recoverAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  COMBAT_WITNESS_RECORDED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.witnessNpcId !== 'string' || p.witnessNpcId.length === 0) return 'witnessNpcId required'
    if (typeof p.combatId !== 'string' || p.combatId.length === 0) return 'combatId required'
    if (typeof p.defeatedNpcId !== 'string' || p.defeatedNpcId.length === 0) return 'defeatedNpcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.witnessedAtTick)) return 'witnessedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_GOODS_TRADED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.sellerNpcId !== 'string' || p.sellerNpcId.length === 0) return 'sellerNpcId required'
    if (typeof p.buyerNpcId !== 'string' || p.buyerNpcId.length === 0) return 'buyerNpcId required'
    if (typeof p.goodsId !== 'string' || p.goodsId.length === 0) return 'goodsId required'
    if (!isNonNegativeInteger(p.quantity) || (p.quantity as number) < 1) return 'quantity must be positive integer'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!isNonNegativeInteger(p.tradedAtTick)) return 'tradedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WALL_BUILT: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.wallId !== 'string' || p.wallId.length === 0) return 'wallId required'
    if (typeof p.tileIdA !== 'string' || p.tileIdA.length === 0) return 'tileIdA required'
    if (typeof p.tileIdB !== 'string' || p.tileIdB.length === 0) return 'tileIdB required'
    if (typeof p.factionIdA !== 'string' || p.factionIdA.length === 0) return 'factionIdA required'
    if (typeof p.factionIdB !== 'string' || p.factionIdB.length === 0) return 'factionIdB required'
    if (!isNonNegativeInteger(p.builtAtTick)) return 'builtAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WALL_DEMOLISHED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.wallId !== 'string' || p.wallId.length === 0) return 'wallId required'
    if (typeof p.tileIdA !== 'string' || p.tileIdA.length === 0) return 'tileIdA required'
    if (typeof p.tileIdB !== 'string' || p.tileIdB.length === 0) return 'tileIdB required'
    if (!isNonNegativeInteger(p.demolishedAtTick)) return 'demolishedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_HOUSEHOLD_JOINT_DECISION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (!Array.isArray(p.memberNpcIds) || p.memberNpcIds.length < 2) return 'memberNpcIds must have ≥2 members'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (p.decisionKind !== 'invest_in_settlement' && p.decisionKind !== 'pool_resources') return 'unknown decisionKind'
    if (!isNonNegativeInteger(p.goldCommitted)) return 'goldCommitted must be non-negative integer'
    if (!isNonNegativeInteger(p.decidedAtTick)) return 'decidedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
}

export class LivingWorldRuleEngine {
  evaluate(
    command: LivingWorldCommand,
    options: { rulesetVersion?: string } = {}
  ): RuleResult<LivingWorldEventPayload> {
    if (!isLivingWorldCommandType(command.commandType)) {
      return reject(command, 'UNKNOWN_COMMAND', `Unknown command type: ${command.commandType}`)
    }
    const validate = VALIDATORS[command.commandType]
    const errMsg = validate(command.payload)
    if (errMsg !== null) {
      return reject(command, 'INVALID_PAYLOAD', errMsg)
    }
    if (isRecord(command.payload) && 'motivation' in command.payload) {
      const motivationErr = validateEventMotivation(command.payload.motivation)
      if (motivationErr !== null) return reject(command, 'INVALID_PAYLOAD', motivationErr)
    }
    try {
      toCanonicalJson(command.payload)
    } catch (err) {
      return reject(
        command,
        'INVALID_PAYLOAD',
        err instanceof Error ? err.message : 'payload is not canonical JSON'
      )
    }

    const rulesetVersion = options.rulesetVersion ?? DEFAULT_RULESET_VERSION
    const narration = pickNarration(command.payload)
    const eventPayload: LivingWorldEventPayload = {
      actorType: command.actorType,
      data: command.payload,
      narration
    }
    // Per ARCHITECTURE.md §1.3 — the deterministic key MUST NOT include
    // wall-clock fields. Only `(commandType, actorId, actorType, tick,
    // payload, rulesetVersion, version)` participate. `occurredAt` is
    // pure audit metadata on the resulting Event.
    const seed = {
      eventType: command.commandType,
      actorId: command.actorId,
      actorType: command.actorType,
      tick: command.tick,
      payload: eventPayload,
      rulesetVersion,
      version: KERNEL_EVENT_VERSION
    }
    const deterministicKey = hashCanonicalJson(seed)
    const draft: LivingWorldEventDraft = {
      eventType: command.commandType,
      actorType: command.actorType,
      occurredAt: command.submittedAt,
      actorId: command.actorId,
      commandId: command.commandId,
      tick: command.tick,
      payload: eventPayload,
      rulesetVersion,
      version: KERNEL_EVENT_VERSION,
      eventId: `event_${deterministicKey.slice(0, 32)}`,
      deterministicKey
    }

    return { accepted: true, events: [draft] }
  }
}

export function makeLivingWorldCommand(
  commandType: LivingWorldCommandType,
  actorId: string,
  actorType: LivingWorldActorType,
  tick: number,
  submittedAt: number,
  payload: LivingWorldCommandPayload,
  commandId?: string
): LivingWorldCommand {
  const seed = { commandType, actorId, actorType, tick, payload }
  const id = commandId ?? `cmd_${hashCanonicalJson(seed).slice(0, 32)}`
  return { commandType, actorId, actorType, tick, submittedAt, payload, commandId: id }
}

function pickNarration(payload: LivingWorldCommandPayload): string | null {
  if (
    typeof (payload as { narration?: unknown }).narration === 'string' ||
    (payload as { narration?: unknown }).narration === null
  ) {
    return ((payload as { narration?: string | null }).narration ?? null) as string | null
  }
  return null
}

function reject(
  command: LivingWorldCommand,
  code: string,
  reason: string
): RuleResult<LivingWorldEventPayload> {
  const rejection: RuleRejection = {
    commandId: command.commandId,
    commandType: command.commandType,
    actorId: command.actorId,
    code,
    reason
  }
  return { accepted: false, rejection }
}

function validateConstructionMotivation(value: unknown): string | null {
  if (!isRecord(value)) return 'motivation must be object'
  if (typeof value.projectPurpose !== 'string' || value.projectPurpose.length === 0) return 'motivation projectPurpose required'
  if (
    value.primaryPressure !== 'food' &&
    value.primaryPressure !== 'rest' &&
    value.primaryPressure !== 'money' &&
    value.primaryPressure !== 'housing' &&
    value.primaryPressure !== 'safety' &&
    value.primaryPressure !== 'infrastructure'
  ) return 'motivation primaryPressure invalid'
  if (typeof value.pressureScore !== 'number' || !Number.isFinite(value.pressureScore)) return 'motivation pressureScore required'
  if (typeof value.sourceGoalKind !== 'string' || value.sourceGoalKind.length === 0) return 'motivation sourceGoalKind required'
  if (typeof value.sourceNpcId !== 'string' || value.sourceNpcId.length === 0) return 'motivation sourceNpcId required'
  if (typeof value.sourceTileId !== 'string' || value.sourceTileId.length === 0) return 'motivation sourceTileId required'
  if (typeof value.explanation !== 'string' || value.explanation.length === 0) return 'motivation explanation required'
  return null
}

function validateEventMotivation(value: unknown): string | null {
  if (!isRecord(value)) return 'motivation must be object'
  if (typeof value.explanation !== 'string' || value.explanation.length === 0) return 'motivation explanation required'
  if (value.projectPurpose !== undefined && typeof value.projectPurpose !== 'string') return 'motivation projectPurpose must be string'
  return null
}

function validateNpcStateSnapshot(value: Record<string, unknown>): string | null {
  if (typeof value.tile !== 'string' || value.tile.length === 0) return 'state.tile required'
  if (typeof value.mood !== 'number' || !Number.isFinite(value.mood)) return 'state.mood required'
  if (typeof value.health !== 'number' || !Number.isFinite(value.health)) return 'state.health required'
  if (typeof value.activity !== 'string' || value.activity.length === 0) return 'state.activity required'
  if (typeof value.faction !== 'string' || value.faction.length === 0) return 'state.faction required'
  if (typeof value.targetTile !== 'string' || value.targetTile.length === 0) return 'state.targetTile required'
  if (typeof value.lastActedTick !== 'number' || !Number.isFinite(value.lastActedTick)) return 'state.lastActedTick required'
  if (typeof value.subCol !== 'number' || !Number.isFinite(value.subCol)) return 'state.subCol required'
  if (typeof value.subRow !== 'number' || !Number.isFinite(value.subRow)) return 'state.subRow required'
  if (typeof value.subZ !== 'number' || !Number.isFinite(value.subZ)) return 'state.subZ required'
  if (value.personalityOverride !== undefined && value.personalityOverride !== null) {
    if (!isRecord(value.personalityOverride)) return 'state.personalityOverride must be object or null'
    if (typeof value.personalityOverride.targetTile !== 'string' || value.personalityOverride.targetTile.length === 0) {
      return 'state.personalityOverride.targetTile required'
    }
    if (typeof value.personalityOverride.expiresAtTick !== 'number' || !Number.isFinite(value.personalityOverride.expiresAtTick)) {
      return 'state.personalityOverride.expiresAtTick required'
    }
    if (typeof value.personalityOverride.reason !== 'string') return 'state.personalityOverride.reason required'
  }
  if (value.travelRoute !== undefined && value.travelRoute !== null) {
    if (!isRecord(value.travelRoute)) return 'state.travelRoute must be object or null'
    if (typeof value.travelRoute.fromTile !== 'string' || value.travelRoute.fromTile.length === 0) return 'state.travelRoute.fromTile required'
    if (typeof value.travelRoute.toTile !== 'string' || value.travelRoute.toTile.length === 0) return 'state.travelRoute.toTile required'
    if (typeof value.travelRoute.targetTile !== 'string' || value.travelRoute.targetTile.length === 0) return 'state.travelRoute.targetTile required'
    if (typeof value.travelRoute.startedAtTick !== 'number' || !Number.isFinite(value.travelRoute.startedAtTick)) return 'state.travelRoute.startedAtTick required'
  }
  if (value.agent !== undefined && !isRecord(value.agent)) return 'state.agent must be object when present'
  return null
}

function validateAnimal(value: Record<string, unknown>): string | null {
  if (typeof value.id !== 'string' || value.id.length === 0) return 'animal.id required'
  if (typeof value.speciesId !== 'string' || value.speciesId.length === 0) return 'animal.speciesId required'
  if (typeof value.tileId !== 'string' || value.tileId.length === 0) return 'animal.tileId required'
  if (!isEcosystemRegionId(value.biomeRegion)) return 'animal.biomeRegion invalid'
  if (!isRecord(value.position)) return 'animal.position required'
  if (typeof value.position.subCol !== 'number' || !Number.isInteger(value.position.subCol) || value.position.subCol < 0) {
    return 'animal.position.subCol must be non-negative integer'
  }
  if (typeof value.position.subRow !== 'number' || !Number.isInteger(value.position.subRow) || value.position.subRow < 0) {
    return 'animal.position.subRow must be non-negative integer'
  }
  if (typeof value.position.subZ !== 'number' || !Number.isInteger(value.position.subZ) || value.position.subZ < 0) {
    return 'animal.position.subZ must be non-negative integer'
  }
  if (typeof value.state !== 'string' || value.state.length === 0) return 'animal.state required'
  for (const key of ['hunger', 'health', 'fear', 'aggression', 'reproductionCooldown']) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) return `animal.${key} required`
  }
  if (value.packId !== undefined && value.packId !== null && typeof value.packId !== 'string') return 'animal.packId must be string or null'
  if (value.migrationTarget !== undefined && value.migrationTarget !== null && typeof value.migrationTarget !== 'string') return 'animal.migrationTarget must be string or null'
  if (value.currentTarget !== undefined && value.currentTarget !== null && typeof value.currentTarget !== 'string') return 'animal.currentTarget must be string or null'
  if (typeof value.lifecycleStage !== 'string' || value.lifecycleStage.length === 0) return 'animal.lifecycleStage required'
  if (value.ownerSettlementId !== undefined && value.ownerSettlementId !== null && typeof value.ownerSettlementId !== 'string') return 'animal.ownerSettlementId must be string or null'
  if (value.domesticatedBy !== undefined && value.domesticatedBy !== null && typeof value.domesticatedBy !== 'string') return 'animal.domesticatedBy must be string or null'
  return null
}

function isEcosystemRegionId(value: unknown): boolean {
  return value === 'salt_marsh' || value === 'forest' || value === 'mountain' || value === 'desert' || value === 'ruin'
}

function validateHuntCommon(value: Record<string, unknown>): string | null {
  if (typeof value.huntId !== 'string' || value.huntId.length === 0) return 'huntId required'
  if (typeof value.npcId !== 'string' || value.npcId.length === 0) return 'npcId required'
  if (typeof value.tileId !== 'string' || value.tileId.length === 0) return 'tileId required'
  if (typeof value.targetSpeciesId !== 'string' || value.targetSpeciesId.length === 0) return 'targetSpeciesId required'
  if (typeof value.targetAnimalId !== 'string' || value.targetAnimalId.length === 0) return 'targetAnimalId required'
  return null
}

function validateSettlementCommon(value: Record<string, unknown>): string | null {
  if (typeof value.settlementId !== 'string' || value.settlementId.length === 0) return 'settlementId required'
  if (typeof value.tileId !== 'string' || value.tileId.length === 0) return 'tileId required'
  return null
}

function validateSettlementPressure(value: unknown): string | null {
  if (!isRecord(value)) return 'pressure required'
  for (const key of ['food', 'safety', 'economy', 'logistics']) {
    if (!isPressureScore(value[key])) return `${key} pressure must be integer 0-100`
  }
  return null
}

function validateSettlementStorage(value: readonly unknown[]): string | null {
  let previousGoodsId: string | null = null
  for (const item of value) {
    if (!isRecord(item)) return 'storage entries must be objects'
    if (typeof item.goodsId !== 'string' || item.goodsId.length === 0) return 'storage goodsId required'
    if (!isNonNegativeQuantity(item.quantity)) return 'storage quantity must be non-negative number'
    if (previousGoodsId !== null && previousGoodsId >= item.goodsId) {
      return 'storage goods ids must be sorted ascending and unique'
    }
    previousGoodsId = item.goodsId
  }
  return null
}

function validateSortedUniqueStrings(value: readonly unknown[], fieldName: string): string | null {
  for (let i = 0; i < value.length; i += 1) {
    const current = value[i]
    if (typeof current !== 'string' || current.length === 0) return `${fieldName} entries must be non-empty strings`
    if (i > 0 && (value[i - 1] as string) >= current) {
      return `${fieldName} must be sorted ascending and unique`
    }
  }
  return null
}

function validateGoodsHolderPayload(value: Record<string, unknown>): string | null {
  if (!isGoodsHolderType(value.holderType)) return 'holderType invalid'
  if (typeof value.holderId !== 'string' || value.holderId.length === 0) return 'holderId required'
  if (typeof value.tileId !== 'string' || value.tileId.length === 0) return 'tileId required'
  return null
}

function validateHouseholdMoneyCommon(value: Record<string, unknown>): string | null {
  if (typeof value.householdId !== 'string' || value.householdId.length === 0) return 'householdId required'
  if (typeof value.npcId !== 'string' || value.npcId.length === 0) return 'npcId required'
  if (!isPositiveQuantity(value.amount)) return 'amount required'
  if (typeof value.sourceId !== 'string' || value.sourceId.length === 0) return 'sourceId required'
  if (typeof value.tileId !== 'string' || value.tileId.length === 0) return 'tileId required'
  return null
}

function validateTransportPayload(value: Record<string, unknown>, phase: 'started' | 'arrived'): string | null {
  if (typeof value.transportId !== 'string' || value.transportId.length === 0) return 'transportId required'
  if (typeof value.routeId !== 'string' || value.routeId.length === 0) return 'routeId required'
  if (typeof value.goodsId !== 'string' || value.goodsId.length === 0) return 'goodsId required'
  if (!isPositiveQuantity(value.quantity)) return 'quantity required'
  if (typeof value.carrierNpcId !== 'string' || value.carrierNpcId.length === 0) return 'carrierNpcId required'
  if (!isGoodsHolderType(value.toHolderType)) return 'toHolderType invalid'
  if (typeof value.toHolderId !== 'string' || value.toHolderId.length === 0) return 'toHolderId required'
  if (typeof value.toTileId !== 'string' || value.toTileId.length === 0) return 'toTileId required'
  if (phase === 'arrived') return null
  return null
}

function isGoodsHolderType(value: unknown): value is GoodsHolderType {
  return value === 'npc' || value === 'building' || value === 'settlement'
}

function isPositiveQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPressureScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
}

function isSettlementStatus(value: unknown): value is SettlementStatus {
  return value === 'stable' || value === 'strained' || value === 'declining' || value === 'recovering'
}

function isIntentKind(value: unknown): value is IntentKind {
  return value === 'survival' || value === 'economic' || value === 'social' || value === 'ecosystem'
}

function isIntentOutcome(value: unknown): value is 'success' | 'failure' {
  return value === 'success' || value === 'failure'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
