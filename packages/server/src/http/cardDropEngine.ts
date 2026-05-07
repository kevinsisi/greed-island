// 紋卡 drop 生成引擎。掛在 SimulationRuntime tick 上：
//   1. 每 tick 先 expire 過期的 drops (available 與 held)
//   2. 對每個 tile 用一個低機率擲骰，決定要不要 spawn
//   3. spawn 時依 rank 機率（高 rank 越稀有）挑一張卡，再用 spawnDrop
//      檢查存世上限
//
// v0.15.0 重設計：
//   * 全面降低基準 spawn 機率 — 高階卡（S/A/B）絕對不會隨機掉，
//     只有 acquisitionMethod === 'random_drop' 的卡才進池子。
//     依世界觀，這些大多是 D 階低稀有卡 + 少量 C 階。
//   * 期望節奏（單 tile）：
//       D 卡 ≈ 每 20 tick 一張
//       C 卡 ≈ 每 50 tick 一張（受限 random_drop 池）
//       B/A/S 階 ≈ 從不隨機（必須走任務 / 戰鬥 / 好感度）
//   * 大潮日（rare window 開）spawn chance × 1.8、雨天 × 1.3
//   * 潮獵會控區（faction control 高的 tile）秘聞系卡掉率 +30%
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

/** 基準 per-tile per-tick spawn 機率 — 比 v0.14 (1.2%) 低 5×。 */
const BASE_SPAWN_CHANCE = 0.0024

// 各等級 drop 抽取權重。S/A/B 設 0：高階卡絕對不靠隨機。
// 只有 acquisitionMethod === 'random_drop' 的卡會進池子，這層是 fallback
// 配重，避免實際池子被某 rank 完全佔光時退化。
const RANK_WEIGHT_BASELINE: Readonly<Record<CardRank, number>> = {
  S: 0,
  A: 0,
  B: 0,
  C: 3,
  D: 12,
}

const SPAWN_X_MIN = 60
const SPAWN_X_MAX = 540
const SPAWN_Y_MIN = 60
const SPAWN_Y_MAX = 340

const WEATHER_RAINY: ReadonlySet<string> = new Set(['霧雨', '驟雨'])
const WEATHER_SPAWN_BOOST = 1.3
const RARE_WINDOW_SPAWN_BOOST = 1.8

const TILE_TYPE_MODIFIERS: Readonly<
  Record<
    string,
    {
      spawnChanceMul: number
      // category-specific boosts; default 1.0 for any unmentioned category
      categoryBoosts?: Readonly<Record<string, number>>
    }
  >
> = {
  // 鏽灣區：技藝系（鐵匠）+ 秘聞系
  t_ruin: {
    spawnChanceMul: 1.1,
    categoryBoosts: { 技藝系: 1.4, 秘聞系: 1.3 },
  },
  // 潮聲區：地景系 + 食飲系（漁港）
  t_desert: {
    spawnChanceMul: 0.9,
    categoryBoosts: { 地景系: 1.4, 食飲系: 1.3 },
  },
  // 霓港區：經濟區，潮器系 / 食飲系偏多
  t_temple: {
    spawnChanceMul: 1.2,
    categoryBoosts: { 潮器系: 1.3, 食飲系: 1.3 },
  },
  // 地脈層：深淵系 / 潮術系
  t_dimai: {
    spawnChanceMul: 1.0,
    categoryBoosts: { 深淵系: 1.5, 潮術系: 1.4 },
  },
  // 浪花區：生靈系
  t_dock: {
    spawnChanceMul: 1.0,
    categoryBoosts: { 生靈系: 1.4 },
  },
}

export class CardDropEngine {
  /** 池子裡只有 acquisitionMethod === 'random_drop' 的卡。 */
  private readonly randomEligible: CardCatalogEntry[]
  private readonly entriesByRank: Map<CardRank, CardCatalogEntry[]>

  constructor(
    private readonly store: CardWorldStore,
    private readonly pipeline: CardActionPipeline,
    private readonly catalog: CardCatalog,
    private readonly tileIds: readonly string[],
    private readonly runtime: SimulationRuntime
  ) {
    this.randomEligible = catalog.entries.filter(
      (e) => e.acquisitionMethod === 'random_drop'
    )
    this.entriesByRank = new Map()
    for (const e of this.randomEligible) {
      const list = this.entriesByRank.get(e.rank) ?? []
      list.push(e)
      this.entriesByRank.set(e.rank, list)
    }
  }

  /** 由 SimulationRuntime tick 呼叫。currentTick 已經是新值。 */
  onTick(currentTick: number): void {
    // 1. 過期：走 pipeline → 產 CARD_DROP_EXPIRE event + 改 state
    this.pipeline.expireOverdueDrops(currentTick)

    if (this.randomEligible.length === 0) return

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
      const entry = this.pickRandomEntry({ rainBoost: isRainy, tileMod })
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
    if (this.randomEligible.length === 0) return
    for (const tileId of this.tileIds) {
      if (Math.random() < 0.25) {
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
    tileMod: { categoryBoosts?: Readonly<Record<string, number>> } | null
  }): CardCatalogEntry | null {
    // Step A: pick rank by weights
    const weights: Record<CardRank, number> = { ...RANK_WEIGHT_BASELINE }
    let total = 0
    for (const r of Object.keys(weights) as CardRank[]) {
      const list = this.entriesByRank.get(r)
      if (!list || list.length === 0) {
        weights[r] = 0
        continue
      }
      total += weights[r]
    }
    if (total === 0) return null
    let roll = Math.random() * total
    let chosenRank: CardRank | null = null
    for (const r of Object.keys(weights) as CardRank[]) {
      const w = weights[r]
      if (w === 0) continue
      if (roll < w) {
        chosenRank = r
        break
      }
      roll -= w
    }
    if (!chosenRank) return null
    const list = this.entriesByRank.get(chosenRank) ?? []

    // Step B: within rank, weight by category boost
    const categoryWeights = list.map((entry) => {
      let w = 1
      if (opts.tileMod?.categoryBoosts) {
        w *= opts.tileMod.categoryBoosts[entry.category] ?? 1
      }
      return w
    })
    const sumW = categoryWeights.reduce((a, b) => a + b, 0)
    if (sumW <= 0) return list[Math.floor(Math.random() * list.length)] ?? null
    let r = Math.random() * sumW
    for (let i = 0; i < list.length; i += 1) {
      r -= categoryWeights[i] ?? 0
      if (r < 0) return list[i] ?? null
    }
    return list[list.length - 1] ?? null
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

// `store` is referenced via the pipeline → keep it as a parameter so older
// call sites that pass it stay compatible; not used directly.
void ({} as CardWorldStore)
