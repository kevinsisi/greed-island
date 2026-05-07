// 紋卡 drop 生成引擎。掛在 SimulationRuntime tick 上：
//   1. 每 tick 先 expire 過期的 drops (available 與 held)
//   2. 對每個 tile 用一個低機率擲骰，決定要不要 spawn
//   3. spawn 時依 rank 機率（低 rank 越常出現）挑一張卡，再用 spawnDrop
//      檢查存世上限
//
// 整體節奏：5 秒一 tick × 8 tile × 1.2% per-tile chance ≈ 平均每 tick
// 約 0.1 個 drop（遊戲節奏，不是太密）。實際密度會被 weather + area
// type 修正：
//   * 雨天 (霧雨/驟雨)：+30% 整體 spawn chance；高階卡稍偏向出現
//   * 鏽灣區 (t_ruin)：高稀有偏多 (+40% S/SS rank pool weight)
//   * 潮聲區 (t_desert)：低階偏多 (-30% spawn chance、低階加成)
//   * 大潮日 (rare window 開啟)：+50% spawn chance
//
// 所有 spawn / expire 都走 CardActionPipeline → 經 rule engine 驗證後寫
// card_action_log，符合 ARCHITECTURE.md §1.1 Command → Event 管線。

import type { CardWorldStore } from './cardWorldStore.js'
import type { CardActionPipeline } from './cardCommands.js'
import type {
  CardCatalog,
  CardCatalogEntry,
  CardRank,
} from '../cards/types.js'
import type { SimulationRuntime } from '../sim/runtime.js'

const BASE_SPAWN_CHANCE = 0.012

// 各等級 drop 抽取權重（基準）。SS 最稀有，H 最常見。
const RANK_WEIGHT_BASELINE: Readonly<Record<CardRank, number>> = {
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

// 天氣 modifier
const WEATHER_RAINY: ReadonlySet<string> = new Set(['霧雨', '驟雨'])
const WEATHER_SPAWN_BOOST = 1.3 // 雨天 +30%
const RARE_WINDOW_SPAWN_BOOST = 1.5 // 大潮日 +50%

// Tile-type modifier（key = tile id）
const TILE_TYPE_MODIFIERS: Readonly<
  Record<
    string,
    {
      spawnChanceMul: number
      // 高階偏向：把 SS/S/A 權重 × highRankBoost；低階 × lowRankBoost
      highRankBoost: number
      lowRankBoost: number
    }
  >
> = {
  // 鏽灣區：高稀有偏多
  t_ruin: { spawnChanceMul: 1.0, highRankBoost: 1.4, lowRankBoost: 0.85 },
  // 潮聲區：低階偏多
  t_desert: { spawnChanceMul: 0.7, highRankBoost: 0.6, lowRankBoost: 1.2 },
  // 霓港區：經濟區偏中間
  t_temple: { spawnChanceMul: 1.1, highRankBoost: 1.1, lowRankBoost: 1.0 },
  // 地脈層：稀有窗口的中心
  t_dimai: { spawnChanceMul: 1.0, highRankBoost: 1.2, lowRankBoost: 0.95 },
  // 浪花區：海邊熱鬧 → 量多
  t_dock: { spawnChanceMul: 1.2, highRankBoost: 0.95, lowRankBoost: 1.1 },
}
const HIGH_RANKS: ReadonlySet<CardRank> = new Set<CardRank>(['SS', 'S', 'A'])
const LOW_RANKS: ReadonlySet<CardRank> = new Set<CardRank>(['G', 'H'])

export class CardDropEngine {
  private readonly entriesByRank: Map<CardRank, CardCatalogEntry[]>

  constructor(
    private readonly store: CardWorldStore,
    private readonly pipeline: CardActionPipeline,
    private readonly catalog: CardCatalog,
    private readonly tileIds: readonly string[],
    private readonly runtime: SimulationRuntime
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
    // 1. 過期：走 pipeline → 產 CARD_DROP_EXPIRE event + 改 state
    this.pipeline.expireOverdueDrops(currentTick)

    // 2. 嘗試 spawn：每 tile 各擲一次，weather/rare-window 套全域倍率
    const weather = this.runtime.getCurrentWeather()
    const isRainy = WEATHER_RAINY.has(weather)
    const rareOpen = this.runtime.isRareWindowOpen()
    let weatherMul = 1
    if (isRainy) weatherMul *= WEATHER_SPAWN_BOOST
    if (rareOpen) weatherMul *= RARE_WINDOW_SPAWN_BOOST

    for (const tileId of this.tileIds) {
      const tileMod = TILE_TYPE_MODIFIERS[tileId] ?? null
      const tileMul = tileMod?.spawnChanceMul ?? 1
      const chance = BASE_SPAWN_CHANCE * weatherMul * tileMul
      if (Math.random() >= chance) continue
      const entry = this.pickRandomEntry({
        rainBoost: isRainy,
        tileMod,
      })
      if (!entry) continue
      const x = this.randInt(SPAWN_X_MIN, SPAWN_X_MAX)
      const y = this.randInt(SPAWN_Y_MIN, SPAWN_Y_MAX)
      this.pipeline.spawnDrop({
        type: 'CARD_DROP_SPAWN',
        actorId: 'system',
        tick: currentTick,
        cardId: entry.id,
        tileId,
        x,
        y,
        reason: rareOpen ? 'rare_window' : isRainy ? 'weather' : 'baseline',
      })
    }
  }

  /** 僅供 server.ts boot-time 主動觸發一次（避免新部署沒卡可撿）。 */
  seedInitialDrops(currentTick: number): void {
    for (const tileId of this.tileIds) {
      if (Math.random() < 0.4) {
        const tileMod = TILE_TYPE_MODIFIERS[tileId] ?? null
        const entry = this.pickRandomEntry({ rainBoost: false, tileMod })
        if (!entry) continue
        const x = this.randInt(SPAWN_X_MIN, SPAWN_X_MAX)
        const y = this.randInt(SPAWN_Y_MIN, SPAWN_Y_MAX)
        this.pipeline.spawnDrop({
          type: 'CARD_DROP_SPAWN',
          actorId: 'system',
          tick: currentTick,
          cardId: entry.id,
          tileId,
          x,
          y,
          reason: 'seed',
        })
      }
    }
  }

  private pickRandomEntry(opts: {
    rainBoost: boolean
    tileMod: { highRankBoost: number; lowRankBoost: number } | null
  }): CardCatalogEntry | null {
    // 套權重修正：rain 對高階+10%、tile 把 SS/S/A 乘 highRankBoost、
    // G/H 乘 lowRankBoost
    const weights: Record<CardRank, number> = { ...RANK_WEIGHT_BASELINE }
    for (const r of Object.keys(weights) as CardRank[]) {
      let w = weights[r]
      if (opts.rainBoost && HIGH_RANKS.has(r)) w *= 1.1
      if (opts.tileMod) {
        if (HIGH_RANKS.has(r)) w *= opts.tileMod.highRankBoost
        if (LOW_RANKS.has(r)) w *= opts.tileMod.lowRankBoost
      }
      weights[r] = w
    }
    let total = 0
    for (const rank of Object.keys(weights) as CardRank[]) {
      const list = this.entriesByRank.get(rank)
      if (list && list.length > 0) total += weights[rank]
    }
    if (total === 0) return null
    let roll = Math.random() * total
    for (const rank of Object.keys(weights) as CardRank[]) {
      const list = this.entriesByRank.get(rank)
      if (!list || list.length === 0) continue
      const w = weights[rank]
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
  // 排除中性 t_road（玩家走路用，不該掉卡）
  return runtime
    .getMap()
    .tiles.map((t) => t.id)
    .filter((id) => id !== 't_road')
}

// `store` is referenced via the pipeline → keep it as a parameter so
// older call sites that pass it stay compatible; not used directly.
void ({} as CardWorldStore)
