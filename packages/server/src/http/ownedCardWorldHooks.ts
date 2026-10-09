import type Database from 'better-sqlite3'
import type { SimulationRuntime, CombatResolvedInfo } from '../sim/runtime.js'
import { CardDropEngine, tileIdsFromRuntime } from './cardDropEngine.js'
import type { CardWorldStore } from './cardWorldStore.js'
import type { CardActionPipeline } from './cardCommands.js'
import type { CanonicalAccountView } from './canonicalAccountView.js'
import { computeCombatLootCardId, combatLootPosition, pickDeterministicIndex } from './combatLoot.js'

const attached = new WeakSet<SimulationRuntime>()

/** Restore system card effects on the ONE existing tick source. Never seed on boot/GET. */
export function attachOwnedCardWorld(input: {
  db: Database.Database
  store: CardWorldStore
  pipeline: CardActionPipeline
  runtime: SimulationRuntime
  accounts: CanonicalAccountView
}): () => void {
  if (attached.has(input.runtime)) throw new Error('Owned card world is already attached to this runtime.')
  input.db.exec(`CREATE TABLE IF NOT EXISTS owned_card_system_receipts (
    effect_key TEXT PRIMARY KEY NOT NULL
  )`)
  const catalog = input.runtime.getCardCatalog()
  const engine = new CardDropEngine(input.store, input.pipeline, catalog, tileIdsFromRuntime(input.runtime), input.runtime)
  const once = (key: string, apply: () => void) => input.db.transaction(() => {
    if (input.db.prepare('SELECT 1 FROM owned_card_system_receipts WHERE effect_key=?').get(key)) return
    apply()
    input.db.prepare('INSERT INTO owned_card_system_receipts(effect_key) VALUES (?)').run(key)
  })()
  const onCombat = (info: CombatResolvedInfo) => once('combat:' + info.combatId, () => {
    if (!input.accounts.findById(info.playerAccountId)) return
    if (info.outcome === 'player_victory') {
      const area = input.runtime.getAreaState(info.tileId)
      const cardId = computeCombatLootCardId({ combatId: info.combatId, durationRounds: info.durationRounds,
        rareWindowOpen: input.runtime.isRareWindowOpen(),
        areaSafety: typeof area?.resources?.safety === 'number' ? area.resources.safety : null, catalog })
      if (cardId !== null) {
        const position = combatLootPosition(info.combatId)
        // This helper returns subcells; card drops retain their authored 40px-cell canvas DTO.
        input.pipeline.spawnDrop({ type: 'CARD_DROP_SPAWN', actorId: 'system', tick: info.tick,
          cardId, tileId: info.tileId, x: (position.x + 0.5) * 40, y: (position.y + 0.5) * 40, reason: 'combat_loot' })
      }
    } else if (info.outcome === 'npc_victory') {
      const held = input.store.listHeldByPlayer(info.playerAccountId)
        .filter(drop => drop.store_deadline_tick !== null && drop.store_deadline_tick > info.tick)
      if (held.length) {
        const drop = held[pickDeterministicIndex(info.combatId + ':defeat-drop', held.length)]!
        input.pipeline.release({ type: 'CARD_RELEASE', actorId: info.playerAccountId, tick: info.tick, dropId: drop.id })
      }
    }
  })
  let unsubscribeTick: (() => void) | undefined, unsubscribeCombat: (() => void) | undefined
  try {
    unsubscribeTick = input.runtime.subscribeTick(tick => once('tick:' + tick, () => engine.onTick(tick)))
    unsubscribeCombat = input.runtime.subscribeCombatResolved(onCombat)
    attached.add(input.runtime)
  } catch (error) { unsubscribeTick?.(); unsubscribeCombat?.(); throw error }
  let closed = false
  return () => {
    if (closed) return
    closed = true; unsubscribeTick?.(); unsubscribeCombat?.(); attached.delete(input.runtime)
  }
}
