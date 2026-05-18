// Slice 6.2 — Sub-tick latency benchmark.
// p99 latency for evaluateCombatSubTick() must stay under combatTickMs/2 = 50 ms.
// This is a release gate: test fails if p99 exceeds 50 ms.

import { describe, expect, it } from 'vitest'
import { evaluateCombatSubTick } from './ruleEngine.js'
import type { CombatSubTickInput, CombatPendingCardPlayCommand } from './ruleEngine.js'
import { COMBAT_INITIAL_HP } from './commands.js'

const PLAYER_ID = 'player_bench'
const NPC_ID = 'npc_bench'
const COMBAT_ID = 'combat_bench'
const P99_BUDGET_MS = 50
const SAMPLE_COUNT = 1000

function makeBaseInput(combatTick: number, pendingCommands: readonly CombatPendingCardPlayCommand[] = []): CombatSubTickInput {
  return {
    combatId: COMBAT_ID,
    combatTick,
    playerActorId: PLAYER_ID,
    npcActorId: NPC_ID,
    actors: [
      { actorId: PLAYER_ID, hp: 80, maxHp: COMBAT_INITIAL_HP },
      { actorId: NPC_ID, hp: 60, maxHp: COMBAT_INITIAL_HP },
    ],
    statuses: [
      { targetActorId: NPC_ID, statusId: 'burn', remainingTicks: 10, potency: 2, sourceActorId: PLAYER_ID },
    ],
    targetLocks: [],
    pendingCommands,
  }
}

function makeCardPlay(actorId: string, combatTick: number, idx: number): CombatPendingCardPlayCommand {
  return {
    commandType: 'COMBAT_CARD_PLAY',
    commandId: `cmd_bench_${actorId}_${combatTick}_${idx}`,
    actorId,
    payload: {
      combatId: COMBAT_ID,
      combatTick,
      cardClass: 'FIRE_LASH',
      targetActorId: actorId === PLAYER_ID ? NPC_ID : PLAYER_ID,
    },
  }
}

describe('CombatSubTick evaluator latency benchmark', () => {
  it(`p99 of ${SAMPLE_COUNT} evaluateCombatSubTick() calls stays under ${P99_BUDGET_MS} ms`, () => {
    const latencies: number[] = []

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const combatTick = i + 1
      const pending: CombatPendingCardPlayCommand[] = [
        makeCardPlay(PLAYER_ID, combatTick, 0),
        makeCardPlay(NPC_ID, combatTick, 1),
      ]
      const input = makeBaseInput(combatTick, pending)

      const start = performance.now()
      evaluateCombatSubTick(input)
      const elapsed = performance.now() - start

      latencies.push(elapsed)
    }

    latencies.sort((a, b) => a - b)
    const p50 = latencies[Math.floor(SAMPLE_COUNT * 0.50)]!
    const p95 = latencies[Math.floor(SAMPLE_COUNT * 0.95)]!
    const p99 = latencies[Math.floor(SAMPLE_COUNT * 0.99)]!

    console.log(`[bench] evaluateCombatSubTick — p50=${p50.toFixed(3)} ms, p95=${p95.toFixed(3)} ms, p99=${p99.toFixed(3)} ms`)

    expect(p99, `p99 latency ${p99.toFixed(3)} ms exceeds ${P99_BUDGET_MS} ms budget`).toBeLessThan(P99_BUDGET_MS)
  })
})
