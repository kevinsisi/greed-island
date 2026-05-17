// Combat Phase C — Slice 2.1: card catalog with deterministic priority
// table.
//
// Per `openspec/changes/combat-phase-c-realtime-subtick/design.md` D3,
// card priority is a STRUCTURAL property of the interaction class
// (pre-empt / control / direct effect / defensive setup / passive
// tick), not a per-card datum. Lower number = higher priority (fires
// earlier in the sub-tick).
//
// Slice 2.1 deliverable: frozen const catalog + priority lookup +
// effect shapes that Slice 2.2 (compiler) will turn into
// sub-commands. Slice 2.1 does NOT wire anything into the rule engine
// yet — the catalog is data-only.

/**
 * Priority bands per design D3:
 *
 *   0  pre-empt        PHASE_SHIFT, COUNTERSPELL, INTERRUPT
 *   1  control         NO_ESCAPE, SILENCE, STUN
 *   2  direct effect   FIRE_LASH, TIDE_STRIKE, MEND
 *   3  defensive       SHIELD, HASTE, REGEN
 *   4  passive tick    DOT_TICK, BUFF_TICK
 */
export type CombatCardPriority = 0 | 1 | 2 | 3 | 4

export type CombatCardClass =
  | 'PHASE_SHIFT'
  | 'COUNTERSPELL'
  | 'INTERRUPT'
  | 'NO_ESCAPE'
  | 'SILENCE'
  | 'STUN'
  | 'FIRE_LASH'
  | 'TIDE_STRIKE'
  | 'MEND'
  | 'SHIELD'
  | 'HASTE'
  | 'REGEN'
  | 'DOT_TICK'
  | 'BUFF_TICK'

/**
 * Effect shape — what the card's compiler emits as Slice 2.2
 * sub-commands. Slice 2.1 only defines the type so the catalog can
 * carry effect data alongside priority.
 */
export type CombatCardEffect =
  | Readonly<{ kind: 'damage'; power: number; element?: string }>
  | Readonly<{ kind: 'heal'; power: number }>
  | Readonly<{
      kind: 'status_apply'
      statusId: string
      remainingTicks: number
      potency?: number
    }>
  | Readonly<{ kind: 'target_lock'; durationTicks: number }>
  | Readonly<{ kind: 'phase_shift'; phase: string }>
  | Readonly<{ kind: 'flee_attempt' }>
  | Readonly<{ kind: 'counter'; absorbs: 'damage' | 'status' }>

export type CombatCardDef = Readonly<{
  /** Card class — the priority key. */
  cardClass: CombatCardClass
  /** Priority band from design D3. */
  priority: CombatCardPriority
  /** Cards in band 0 may target a locked target. Others MUST be
   * rejected when the target is locked. */
  bypassesTargetLock: boolean
  /** Sub-effects the rule engine's Slice 2.2 compiler will emit. */
  effects: readonly CombatCardEffect[]
}>

const CATALOG: Readonly<Record<CombatCardClass, CombatCardDef>> = {
  // ─── Band 0 ─ pre-empt ───
  PHASE_SHIFT: {
    cardClass: 'PHASE_SHIFT',
    priority: 0,
    bypassesTargetLock: true,
    effects: [{ kind: 'phase_shift', phase: 'alt' }],
  },
  COUNTERSPELL: {
    cardClass: 'COUNTERSPELL',
    priority: 0,
    bypassesTargetLock: true,
    effects: [{ kind: 'counter', absorbs: 'status' }],
  },
  INTERRUPT: {
    cardClass: 'INTERRUPT',
    priority: 0,
    bypassesTargetLock: true,
    effects: [{ kind: 'counter', absorbs: 'damage' }],
  },

  // ─── Band 1 ─ control ───
  NO_ESCAPE: {
    cardClass: 'NO_ESCAPE',
    priority: 1,
    bypassesTargetLock: false,
    effects: [{ kind: 'target_lock', durationTicks: 10 }],
  },
  SILENCE: {
    cardClass: 'SILENCE',
    priority: 1,
    bypassesTargetLock: false,
    effects: [{ kind: 'status_apply', statusId: 'silenced', remainingTicks: 20 }],
  },
  STUN: {
    cardClass: 'STUN',
    priority: 1,
    bypassesTargetLock: false,
    effects: [{ kind: 'status_apply', statusId: 'stunned', remainingTicks: 10 }],
  },

  // ─── Band 2 ─ direct effect ───
  FIRE_LASH: {
    cardClass: 'FIRE_LASH',
    priority: 2,
    bypassesTargetLock: false,
    effects: [
      { kind: 'damage', power: 18, element: 'fire' },
      { kind: 'status_apply', statusId: 'burn', remainingTicks: 30, potency: 2 },
    ],
  },
  TIDE_STRIKE: {
    cardClass: 'TIDE_STRIKE',
    priority: 2,
    bypassesTargetLock: false,
    effects: [{ kind: 'damage', power: 22, element: 'water' }],
  },
  MEND: {
    cardClass: 'MEND',
    priority: 2,
    bypassesTargetLock: false,
    effects: [{ kind: 'heal', power: 16 }],
  },

  // ─── Band 3 ─ defensive setup ───
  SHIELD: {
    cardClass: 'SHIELD',
    priority: 3,
    bypassesTargetLock: false,
    effects: [{ kind: 'status_apply', statusId: 'shielded', remainingTicks: 30, potency: 12 }],
  },
  HASTE: {
    cardClass: 'HASTE',
    priority: 3,
    bypassesTargetLock: false,
    effects: [{ kind: 'status_apply', statusId: 'hasted', remainingTicks: 50, potency: 1 }],
  },
  REGEN: {
    cardClass: 'REGEN',
    priority: 3,
    bypassesTargetLock: false,
    effects: [{ kind: 'status_apply', statusId: 'regen', remainingTicks: 60, potency: 2 }],
  },

  // ─── Band 4 ─ passive tick ───
  DOT_TICK: {
    cardClass: 'DOT_TICK',
    priority: 4,
    bypassesTargetLock: false,
    effects: [{ kind: 'damage', power: 2 }],
  },
  BUFF_TICK: {
    cardClass: 'BUFF_TICK',
    priority: 4,
    bypassesTargetLock: false,
    effects: [{ kind: 'heal', power: 2 }],
  },
} as const

export const COMBAT_CARD_CATALOG: Readonly<Record<CombatCardClass, CombatCardDef>> = Object.freeze(CATALOG)

export function getCombatCard(cardClass: string): CombatCardDef | null {
  return (COMBAT_CARD_CATALOG as Record<string, CombatCardDef>)[cardClass] ?? null
}

export function priorityForCardClass(cardClass: string): CombatCardPriority | null {
  return getCombatCard(cardClass)?.priority ?? null
}

export function listCombatCardClasses(): readonly CombatCardClass[] {
  return Object.keys(COMBAT_CARD_CATALOG).sort() as CombatCardClass[]
}
