import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import type { SimulationRuntime, CombatResolvedInfo } from '../sim/runtime.js'
import { AuthService } from '../identity/authService.js'
import { loadCardCatalog } from '../cards/loader.js'
import { seedCookieTestAccount } from './cookieTestFixtures.js'
import { createCanonicalAccountView } from './canonicalAccountView.js'
import { CardActionPipeline } from './cardCommands.js'
import { CardWorldStore } from './cardWorldStore.js'
import { attachOwnedCardWorld } from './ownedCardWorldHooks.js'
import { computeCombatLootCardId, combatLootPosition } from './combatLoot.js'

const databases: Database.Database[] = [], cleanups: Array<() => void> = []
afterEach(() => { for (const close of cleanups.splice(0)) close(); for (const db of databases.splice(0)) if (db.open) db.close() })
function setup() {
  const db = new Database(':memory:'); databases.push(db); seedCookieTestAccount(db, 1)
  const auth = new AuthService(db, { allowedOrigins: ['http://127.0.0.1:4178'], secureCookies: false })
  const accounts = createCanonicalAccountView(db, auth.accounts), catalog = loadCardCatalog(), store = new CardWorldStore(db, catalog), pipeline = new CardActionPipeline(db, store)
  const tickListeners = new Set<(tick: number) => void>(), combatListeners = new Set<(info: CombatResolvedInfo) => void>()
  const runtime = {
    getCardCatalog: () => catalog, getMap: () => ({ tiles: [{ id: 't_dock' }] }), getCurrentWeather: () => '晴',
    isRareWindowOpen: () => false, getAreaState: () => ({ resources: { safety: 20 } }),
    subscribeTick: (listener: (tick: number) => void) => { tickListeners.add(listener); return () => { tickListeners.delete(listener) } },
    subscribeCombatResolved: (listener: (info: CombatResolvedInfo) => void) => { combatListeners.add(listener); return () => { combatListeners.delete(listener) } },
  } as unknown as SimulationRuntime
  const attach = () => { const close = attachOwnedCardWorld({ db, runtime, accounts, store, pipeline }); cleanups.push(close); return close }
  const spawn = () => pipeline.spawnDrop({ type: 'CARD_DROP_SPAWN', actorId: 'system', tick: 0, cardId: 1, tileId: 't_dock', x: 300, y: 220, reason: 'seed' }).drop!
  const combat = (changes: Partial<CombatResolvedInfo> = {}): CombatResolvedInfo => ({ combatId: 'synthetic-defeat', outcome: 'npc_victory',
    playerAccountId: 1, npcId: 'npc-test', tileId: 't_dock', enemyType: 'npc', durationRounds: 10, tick: 1, ...changes })
  return { db, runtime, catalog, store, pipeline, tickListeners, combatListeners, attach, spawn, combat }
}

describe('single-runtime owned card effects', () => {
  it('never boot seeds, registers exactly one existing tick/combat hook and cleans up idempotently', () => {
    const f = setup(), close = f.attach()
    expect(f.db.prepare('SELECT * FROM world_card_drops').all()).toHaveLength(0)
    expect(f.pipeline.recentEvents()).toHaveLength(0)
    expect(f.tickListeners.size).toBe(1); expect(f.combatListeners.size).toBe(1)
    expect(() => f.attach()).toThrow('already attached')
    close(); close(); expect(f.tickListeners.size).toBe(0); expect(f.combatListeners.size).toBe(0)
    const reopened = f.attach(); expect(f.tickListeners.size).toBe(1); reopened()
  })
  it('expires drops through existing ticks once and keeps retry receipts across hook reopen', () => {
    const f = setup(), drop = f.spawn(), close = f.attach()
    for (const listener of f.tickListeners) listener(12)
    expect(f.store.getDrop(drop.id)?.state).toBe('expired')
    const before = f.pipeline.recentEvents()
    for (const listener of f.tickListeners) listener(12)
    expect(f.pipeline.recentEvents()).toEqual(before)
    close(); f.attach(); for (const listener of f.tickListeners) listener(12)
    expect(f.pipeline.recentEvents()).toEqual(before)
    expect(f.db.prepare("SELECT * FROM owned_card_system_receipts WHERE effect_key='tick:12'").all()).toHaveLength(1)
  })
  it('rolls a failed expiry effect and its receipt back so the exact existing tick can retry', () => {
    const f = setup(), drop = f.spawn(); f.attach()
    f.db.exec(`CREATE TRIGGER fail_expiry BEFORE INSERT ON card_action_log
      WHEN NEW.event_type='CARD_DROP_EXPIRE' BEGIN SELECT RAISE(ABORT,'synthetic expiry failure'); END`)
    expect(() => { for (const listener of f.tickListeners) listener(12) }).toThrow()
    expect(f.store.getDrop(drop.id)?.state).toBe('available')
    expect(f.db.prepare('SELECT * FROM owned_card_system_receipts').all()).toHaveLength(0)
    f.db.exec('DROP TRIGGER fail_expiry'); for (const listener of f.tickListeners) listener(12)
    expect(f.store.getDrop(drop.id)?.state).toBe('expired')
  })
  it('releases one held card on authoritative defeat once and cannot revive elapsed held cards', () => {
    const f = setup(), drop = f.spawn()
    f.pipeline.pickup({ type: 'CARD_PICKUP', actorId: 1, tick: 0, dropId: drop.id }); f.attach()
    for (const listener of f.combatListeners) listener(f.combat())
    for (const listener of f.combatListeners) listener(f.combat())
    expect(f.store.getDrop(drop.id)).toMatchObject({ state: 'available', holder_account_id: null, expires_at_tick: 13 })
    expect(f.pipeline.recentEvents().filter(event => event.eventType === 'CARD_RELEASE')).toHaveLength(1)
    f.pipeline.pickup({ type: 'CARD_PICKUP', actorId: 1, tick: 1, dropId: drop.id })
    for (const listener of f.combatListeners) listener(f.combat({ combatId: 'elapsed-defeat', tick: 13 }))
    expect(f.store.getDrop(drop.id)?.state).toBe('held')
    expect(f.pipeline.recentEvents().filter(event => event.eventType === 'CARD_RELEASE')).toHaveLength(1)
  })
  it('preserves deterministic victory pool/chance/caps and projects new subcell loot into the existing canvas', () => {
    const f = setup(); f.attach()
    let combatId = '', cardId: number | null = null
    for (let i = 0; i < 10000 && cardId === null; i++) {
      combatId = 'synthetic-victory-' + i
      cardId = computeCombatLootCardId({ combatId, durationRounds: 10, rareWindowOpen: false, areaSafety: 20, catalog: f.catalog })
    }
    expect(cardId).not.toBeNull()
    const position = combatLootPosition(combatId), info = f.combat({ combatId, outcome: 'player_victory' })
    for (const listener of f.combatListeners) listener(info)
    for (const listener of f.combatListeners) listener(info)
    const drops = f.store.listActiveDropsInTile('t_dock')
    expect(drops).toHaveLength(1)
    expect(drops[0]).toMatchObject({ card_id: cardId, x: (position.x + 0.5) * 40, y: (position.y + 0.5) * 40 })
    expect(f.pipeline.recentEvents()).toHaveLength(1)
  })
  it('ignores unavailable canonical accounts while leaving their saved cards untouched', () => {
    const f = setup(), drop = f.spawn(); f.pipeline.pickup({ type: 'CARD_PICKUP', actorId: 1, tick: 0, dropId: drop.id }); f.attach()
    f.db.prepare("UPDATE accounts SET status='disabled' WHERE id=1").run()
    for (const listener of f.combatListeners) listener(f.combat())
    expect(f.store.getDrop(drop.id)?.state).toBe('held')
  })
})
