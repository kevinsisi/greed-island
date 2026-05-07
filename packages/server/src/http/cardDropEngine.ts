// 紋卡 drop 生成引擎。掛在 SimulationRuntime tick 上：
//   1. 每 tick 先 expire 過期的 drops (available 與 held)
//   2. 對每個 tile 用一個低機率擲骰，決定要不要 spawn
//   3. spawn 時依 rank 機率（低 rank 越常出現）挑一張卡，再用 spawnDrop 檢查存世上限
//
// 整體節奏：5 秒一 tick × 8 tile × 1.2% per-tile chance ≈ 平均每 tick 約 0.1 個 drop
// （遊戲節奏，不是太密）。實際密度可以靠 SPAWN_CHANCE 微調。

import type { CardWorldStore } from './cardWorldStore.js'
import type { CardCatalog, CardCatalogEntry, CardRank } from '../cards/types.js'
import type { SimulationRuntime } from '../sim/runtime.js'

const SPAWN_CHANCE = 0.012

// 各等級 drop 抽取權重。SS 最稀有，H 最常見。
const RANK_WEIGHT: Readonly<Record<CardRank, number>> = {
  SS: 1,
  S: 2,
  A: 4,
  B: 7,
  C: 10,
  D: 14,
  E: 18,
  F: 22,
  G: 26,
  H: 30,
}

// AreaScene 是 600x400，drop sprite 可以放在 (40, 40) ~ (560, 360)
const SPAWN_X_MIN = 60
const SPAWN_X_MAX = 540
const SPAWN_Y_MIN = 60
const SPAWN_Y_MAX = 340

export class CardDropEngine {
  private readonly entriesByRank: Map<CardRank, CardCatalogEntry[]>

  constructor(
    private readonly store: CardWorldStore,
    private readonly catalog: CardCatalog,
    private readonly tileIds: readonly string[]
  ) {
    this.entriesByRank = new Map()
    for (const e of catalog.entries) {
      const list = this.entriesByRank.get(e.rank) ?? []
      list.push(e)
      this.entriesByRank.set(e.rank, list)
    }
  }

  /** 由 SimulationRuntime tick 呼叫。currentTick 已經是新值。 */
  onTick(currentTick: number): void {
    this.store.expireOverdueDrops(currentTick)
    for (const tileId of this.tileIds) {
      if (Math.random() >= SPAWN_CHANCE) continue
      const entry = this.pickRandomEntry()
      if (!entry) continue
      const x = this.randInt(SPAWN_X_MIN, SPAWN_X_MAX)
      const y = this.randInt(SPAWN_Y_MIN, SPAWN_Y_MAX)
      this.store.spawnDrop({
        cardId: entry.id,
        tileId,
        x,
        y,
        currentTick,
      })
    }
  }

  /** 僅供 server.ts boot-time 主動觸發一次（避免新部署沒卡可撿）。 */
  seedInitialDrops(currentTick: number): void {
    for (const tileId of this.tileIds) {
      if (Math.random() < 0.4) {
        const entry = this.pickRandomEntry()
        if (!entry) continue
        const x = this.randInt(SPAWN_X_MIN, SPAWN_X_MAX)
        const y = this.randInt(SPAWN_Y_MIN, SPAWN_Y_MAX)
        this.store.spawnDrop({ cardId: entry.id, tileId, x, y, currentTick })
      }
    }
  }

  private pickRandomEntry(): CardCatalogEntry | null {
    let total = 0
    for (const rank of Object.keys(RANK_WEIGHT) as CardRank[]) {
      const list = this.entriesByRank.get(rank)
      if (list && list.length > 0) total += RANK_WEIGHT[rank]
    }
    if (total === 0) return null
    let roll = Math.random() * total
    for (const rank of Object.keys(RANK_WEIGHT) as CardRank[]) {
      const list = this.entriesByRank.get(rank)
      if (!list || list.length === 0) continue
      const w = RANK_WEIGHT[rank]
      if (roll < w) {
        return list[Math.floor(Math.random() * list.length)] ?? null
      }
      roll -= w
    }
    return null
  }

  private randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
}

/** 從 runtime.getMap() 抽出 tileIds，方便 boot-time 注入 engine。 */
export function tileIdsFromRuntime(runtime: SimulationRuntime): string[] {
  return runtime.getMap().tiles.map((t) => t.id)
}
