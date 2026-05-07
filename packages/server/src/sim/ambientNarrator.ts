// AmbientNarrator — 用 Gemini 把「此地此景」的氛圍描述生成出來。
//
// 規則（priority 4）：
//   1. AI 只負責生成 zh 描述；不寫狀態、不修改 trust / mood / events。
//   2. 每個 area 每 30 tick 才更新一次（成本 + 連線）；快取在記憶體中。
//   3. 沒有 active Gemini key 時，回 fallback 靜態描述。
//   4. 失敗（網路 / 解析）→ 也回 fallback，不 throw 給呼叫端。

import type { SettingsStore } from '../http/settings.js'
import type { ActiveWorldEvent } from '../events/types.js'
import { generateWithKeyPool, GeminiUnavailableError } from '../npcs/geminiClient.js'
import { TILE_NAME_BY_ID } from './mapGraph.js'
import type { AreaState } from './areaStateEngine.js'
import { FACTION_LABEL_ZH } from './areaStateEngine.js'

export const AMBIENT_REFRESH_TICKS = 30
/**
 * 主動 refresh 觸發距離：getOrSchedule 在過去 RECENT_VISITOR_WINDOW_TICKS
 * tick 內被呼叫的 tile，視為「玩家還在看」，會被 tickRefresh 主動推下一輪。
 * 12 tick ≈ 1 分鐘 (5s tick)，比前端 polling 間隔 (12s) 寬一些避免 race。
 */
const RECENT_VISITOR_WINDOW_TICKS = 12

export type AmbientContext = Readonly<{
  tileId: string
  weather: string
  season: string
  presentNpcNames: readonly string[]
  /** v0.15.3：此區可被命名的建築物中文名清單（從 BuildingRuntime 拉）。
   *  prompt 嚴格限制 AI 只能引用這些名字，不可虛構建築 / 神社 / 商店。 */
  presentBuildingNames: readonly string[]
  recentNarrations: readonly string[]
  areaState: AreaState | null
  worldEvents: readonly ActiveWorldEvent[]
}>

export type AmbientResult = Readonly<{
  tileId: string
  text: string
  source: 'ai' | 'fallback'
  generatedAtTick: number
  generatedAt: string
  aiError: string | null
}>

const FALLBACK_BY_TILE: Readonly<Record<string, string>> = {
  t_forest: '潮見丘的綠樹掩映住宅階梯，從丘頂能看見整片潮鳴市。',
  t_mountain: '煙嵐山的深綠林永遠纏著薄霧，獵人腳下的鹿徑潮濕又清晰。',
  t_temple: '霓港區的藍色帷幕大樓夜裡照得海面像高解析星圖。',
  t_central: '夜潮區的紅色霓虹從巷子一路漫到主幹道，路口攤車冒著熱氣。',
  t_dimai: '地脈層的紫色光從石縫間透出，水滴聲像時鐘。',
  t_desert: '潮聲區的灰公寓鏽斑斑點點，舊收音機還在唸去年的潮汐表。',
  t_ruin: '鏽灣區的斷裂起重機間，乾燥的鐵鏽味隨海風吹進每一條巷子。',
  t_dock: '浪花區的木棧道上，退潮的礁石像被磨亮的銀器一樣閃。'
}

const REGEX_FENCE = /```(?:[a-z]+)?\s*([\s\S]*?)```/i

export class AmbientNarrator {
  private readonly cache: Map<string, AmbientResult> = new Map()
  private readonly inflight: Map<string, Promise<AmbientResult>> = new Map()
  /** v0.15.1：每個 tile 上次被 getOrSchedule 呼叫的 tick；用來判斷「還有玩家在看」。 */
  private readonly lastRequestedTickByTile: Map<string, number> = new Map()

  constructor(private readonly settings: SettingsStore) {}

  getOrSchedule(ctx: AmbientContext, currentTick: number): AmbientResult {
    this.lastRequestedTickByTile.set(ctx.tileId, currentTick)
    const cached = this.cache.get(ctx.tileId)
    if (cached && currentTick - cached.generatedAtTick < AMBIENT_REFRESH_TICKS) {
      return cached
    }
    if (!this.inflight.has(ctx.tileId)) {
      void this.refresh(ctx, currentTick).catch(() => {
        // refresh 內已 fallback；防 unhandled rejection
      })
    }
    return cached ?? this.fallbackOf(ctx, currentTick)
  }

  /**
   * v0.15.1：runtime tick listener 主動觸發。對「最近被 getOrSchedule 過」
   * 的 tile（過去 RECENT_VISITOR_WINDOW_TICKS 內），如果 cached 已過期就主動
   * 跑下一輪 refresh。這樣下次 player polling 拉到的就是新的 AI 文字，
   * 而不是「30 tick 後才看到下一段、實際變化要 60 tick 才會出現」。
   */
  tickRefresh(
    currentTick: number,
    getContext: (tileId: string) => AmbientContext | null
  ): void {
    if (this.settings.listActiveKeys().length === 0) return
    for (const [tileId, lastRequestedTick] of this.lastRequestedTickByTile) {
      if (currentTick - lastRequestedTick > RECENT_VISITOR_WINDOW_TICKS) continue
      const cached = this.cache.get(tileId)
      // refresh 條件：(a) 沒 cache，或 (b) cache 已超過 30 tick
      if (cached && currentTick - cached.generatedAtTick < AMBIENT_REFRESH_TICKS) continue
      if (this.inflight.has(tileId)) continue
      const ctx = getContext(tileId)
      if (!ctx) continue
      void this.refresh(ctx, currentTick).catch(() => {})
    }
  }

  async refresh(ctx: AmbientContext, currentTick: number): Promise<AmbientResult> {
    const key = ctx.tileId
    const inflight = this.inflight.get(key)
    if (inflight) return inflight
    const promise = this.runRefresh(ctx, currentTick).finally(() => {
      this.inflight.delete(key)
    })
    this.inflight.set(key, promise)
    return promise
  }

  async narrateWorldEvent(
    event: ActiveWorldEvent
  ): Promise<{ text: string; source: 'ai' | 'fallback'; aiError: string | null }> {
    const fallback = event.text.zh
    if (this.settings.listActiveKeys().length === 0) {
      return { text: fallback, source: 'fallback', aiError: 'no-key' }
    }
    try {
      const raw = await generateWithKeyPool(this.settings, {
        systemPrompt: [
          '你是《貪婪之島 / Tideway》世界的氛圍敘事員。世界觀：潮鳴市是被脈網覆蓋的港都。',
          '你只負責把一段世界事件的模板敘述改寫成更有故事感、更口語、不重複模板字的繁體中文。',
          '規則：',
          '- 1~2 句，總長度不超過 80 字。',
          '- ⚠️ 嚴禁虛構：不要新增模板沒提到的事實。**不可以**捏造任何具名人物（包括「祭司」「商人」「守衛」這類聽似合理的角色名），也不可以捏造時間 / 派系勝負 / 建築物 / 具體結構名。',
          '- 模板沒提到的人 → 只能用無名稱群眾詞（行人 / 攤主 / 巡邏的人）。',
          '- 不要使用引號包整句、不要 emoji、不要 markdown。',
          '- 直接輸出敘事文字，不要前綴 / 標籤。'
        ].join('\n'),
        userPrompt: `事件類型：${event.type}\n模板敘事：「${fallback}」`,
        temperature: 0.85,
        maxOutputTokens: 200
      })
      const trimmed = sanitizeOutput(raw)
      if (!trimmed) return { text: fallback, source: 'fallback', aiError: 'empty' }
      console.log(`[ambient] worldEvent ${event.id} AI ok`)
      return { text: trimmed, source: 'ai', aiError: null }
    } catch (err) {
      const aiError =
        err instanceof GeminiUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'unknown'
      console.error(`[ambient] worldEvent AI failed (${event.id}):`, aiError)
      return { text: fallback, source: 'fallback', aiError }
    }
  }

  private async runRefresh(ctx: AmbientContext, currentTick: number): Promise<AmbientResult> {
    if (this.settings.listActiveKeys().length === 0) {
      const result = this.fallbackOf(ctx, currentTick)
      this.cache.set(ctx.tileId, result)
      return result
    }
    try {
      console.log(`[ambient] generating for ${ctx.tileId} (tick ${currentTick})`)
      const raw = await generateWithKeyPool(this.settings, {
        systemPrompt: buildSystemPrompt(),
        userPrompt: buildUserPrompt(ctx),
        temperature: 0.9,
        maxOutputTokens: 200
      })
      const trimmed = sanitizeOutput(raw)
      if (!trimmed) {
        const result = this.fallbackOf(ctx, currentTick)
        this.cache.set(ctx.tileId, result)
        return result
      }
      const result: AmbientResult = {
        tileId: ctx.tileId,
        text: trimmed,
        source: 'ai',
        generatedAtTick: currentTick,
        generatedAt: new Date().toISOString(),
        aiError: null
      }
      console.log(`[ambient] ${ctx.tileId} AI ok: ${trimmed.slice(0, 60)}`)
      this.cache.set(ctx.tileId, result)
      return result
    } catch (err) {
      const aiError =
        err instanceof GeminiUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'unknown'
      console.error(`[ambient] ${ctx.tileId} AI failed:`, aiError)
      const result: AmbientResult = {
        ...this.fallbackOf(ctx, currentTick),
        aiError
      }
      this.cache.set(ctx.tileId, result)
      return result
    }
  }

  private fallbackOf(ctx: AmbientContext, currentTick: number): AmbientResult {
    const tileName = TILE_NAME_BY_ID[ctx.tileId] ?? ctx.tileId
    const base = FALLBACK_BY_TILE[ctx.tileId] ?? `${tileName}今日的風帶著潮味。`
    const flavour = composeFallbackFlavour(ctx)
    return {
      tileId: ctx.tileId,
      text: `${base}${flavour ? ' ' + flavour : ''}`,
      source: 'fallback',
      generatedAtTick: currentTick,
      generatedAt: new Date().toISOString(),
      aiError: null
    }
  }
}

function composeFallbackFlavour(ctx: AmbientContext): string {
  const parts: string[] = []
  if (ctx.weather && ctx.weather !== '晴') parts.push(`天氣轉為${ctx.weather}`)
  if (ctx.areaState?.dominantFaction) {
    parts.push(`${FACTION_LABEL_ZH[ctx.areaState.dominantFaction]}的影響力此刻最盛`)
  }
  if (ctx.presentNpcNames.length > 0) {
    parts.push(`${ctx.presentNpcNames.slice(0, 2).join('、')}就在附近`)
  }
  return parts.length > 0 ? `（${parts.join('；')}。）` : ''
}

function sanitizeOutput(raw: string): string {
  if (!raw) return ''
  let text = raw.trim()
  const fenced = text.match(REGEX_FENCE)
  if (fenced && fenced[1]) text = fenced[1].trim()
  text = text.replace(/^[「『"'《]/, '').replace(/[」』"'》]$/, '')
  text = text.replace(/^敘事[:：]\s*/, '').replace(/^描述[:：]\s*/, '')
  if (text.length > 160) text = text.slice(0, 160).replace(/[。，；：、]+$/, '') + '。'
  return text
}

function buildSystemPrompt(): string {
  return [
    '你是《貪婪之島 / Tideway》世界裡的氛圍敘事員。',
    '世界觀：潮鳴市是一座被脈網覆蓋的港都，紋卡承載術式與記憶，潮汐節期間會開啟稀有窗口。',
    '玩家剛打開某個區域的頁面 — 你要為他寫「此地此景」的一段氛圍描述。',
    '',
    '⚠️ 嚴禁虛構（最重要）：',
    '- 你只能使用 user prompt 中明確給出的名字。**不可以**創造任何「祭司 / 守衛 / 商人 / 老闆」之類的具名 NPC（即使聽起來合理）。',
    '- 如果 user prompt 列出「在場 NPC」清單 → 你只能引用清單上的名字；其它人物只能用無名稱的群眾詞（例如「行人」「攤主」「巡邏的人」）。',
    '- 如果 user prompt 寫「目前沒有 NPC 在場」→ 整段敘事**完全不可以**提到任何具名人物，也不要說「祭司守在門前」這種隱含具體角色的句子。',
    '- 你只能引用 user prompt 中明確列出的建築物名字；不可以憑空想像「神社拱門」「第一層」「鐘樓」之類沒被列出的具體場所結構。',
    '- 不要捏造劇情事件（不能說「昨夜有兇殺案」「祭司守在第一層的拱門前」除非提示明確）。',
    '',
    '輸出規則：',
    '- 1~2 句，總長度約 50~120 字繁體中文。',
    '- 寫場景的氣味、聲音、光線、群眾感受，不要列數值（不要寫「治安 35」這種詞）。',
    '- 可以暗示派系氣氛（如潮獵會肅殺 / 公會嚴整 / 平民熱鬧）但不直接點名 control 數值。',
    '- 不要 emoji、不要 markdown、不要引號包整句、不要前綴。',
    '- 不要對玩家說話、不要呼喚「你」「您」；以第三人稱描述環境。'
  ].join('\n')
}

function buildUserPrompt(ctx: AmbientContext): string {
  const tileName = TILE_NAME_BY_ID[ctx.tileId] ?? ctx.tileId
  const lines: string[] = []
  lines.push(`區域：${tileName}（${ctx.tileId}）`)
  lines.push(`季節：${ctx.season}`)
  lines.push(`天氣：${ctx.weather}`)

  if (ctx.areaState) {
    const r = ctx.areaState.resources
    lines.push(`資源狀態：糧食 ${Math.round(r.food)}、治安 ${Math.round(r.safety)}、經濟 ${Math.round(r.economy)}`)
    if (ctx.areaState.dominantFaction) {
      lines.push(`目前由「${FACTION_LABEL_ZH[ctx.areaState.dominantFaction]}」掌控`)
    } else {
      lines.push('目前無單一派系掌控')
    }
    if (ctx.areaState.recentEvents.length > 0) {
      const last = ctx.areaState.recentEvents.slice(-3).map((e) => `- ${e.narration}`).join('\n')
      lines.push(`本地最近事件：\n${last}`)
    }
  }

  if (ctx.presentNpcNames.length > 0) {
    lines.push(
      `此刻在場 NPC（你只能引用這些名字，其它人物用「行人 / 攤主 / 巡邏的人」這類無名稱群眾詞）：${ctx.presentNpcNames.slice(0, 8).join('、')}`
    )
  } else {
    lines.push(
      '此刻沒有任何具名 NPC 在場。整段敘事**不可以**提到任何人名，也不要說「祭司守在門前」「老闆探出頭」這種隱含具體角色的句子；要寫「人」就只能用無名稱群眾詞（行人 / 路過的旅客 / 遠處的攤車聲）。'
    )
  }

  if (ctx.presentBuildingNames.length > 0) {
    lines.push(
      `此區可引用的建築物名字（不可以提其它建築，也不可以虛構「拱門」「第一層」「鐘樓」這類具體結構名）：${ctx.presentBuildingNames.slice(0, 8).join('、')}`
    )
  } else {
    lines.push(
      '此區沒有可命名的建築物 — 不要使用任何具體建築名（包括「神社」「會所」「祠堂」等具體名詞），只能用區域類型詞（巷子 / 街口 / 路邊 / 海濱）。'
    )
  }

  if (ctx.worldEvents.length > 0) {
    const e = ctx.worldEvents.slice(0, 2).map((w) => `- ${w.text.zh}`).join('\n')
    lines.push(`正在進行的世界事件：\n${e}`)
  }

  if (ctx.recentNarrations.length > 0) {
    const r = ctx.recentNarrations.slice(0, 2).map((n) => `- ${n}`).join('\n')
    lines.push(`最近的世界敘事：\n${r}`)
  }

  lines.push('請寫此地此景的氛圍描述。')
  return lines.join('\n')
}
