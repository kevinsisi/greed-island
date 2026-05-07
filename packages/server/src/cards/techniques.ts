// 術式卡（technique cards）catalog. v0.15.0 引入。
//
// 與定序卡（sequence cards, 100 張）不同：
//   * 術式卡只能在「天際百貨」（霓港區）以潮幣購買，不會隨機掉落、不
//     會由戰鬥/任務獎勵掉出。
//   * 術式卡有實際的遊戲效果類別（戰鬥 / 探索 / 社交），效果描述要寫
//     清楚、有具體 mechanic（雖然實作 hook 仍 Phase C 才實際 wire 進
//     戰鬥引擎，當前 release 是「卡的實體 + 商店 + 持有清單」管道）。
//
// 與 catalog.json 一樣，這份資料是 deterministic constant — 不能在
// runtime 被 AI 或玩家修改。商店價格、上限、效果都寫死在這裡。

import type Database from 'better-sqlite3'

export type TechniqueCardCategory = 'combat' | 'explore' | 'social'

export type TechniqueCard = Readonly<{
  /** 卡 id 從 1001 起，避免跟定序卡 id (1..100) 撞號。 */
  id: number
  nameZh: string
  nameEn: string
  category: TechniqueCardCategory
  /** 商店售價（潮幣 / gold）。 */
  priceGold: number
  /** 玩家最多可同時持有的份數。 */
  maxOwnedPerPlayer: number
  description: string
  /** 具體效果（戰鬥/探索/社交 mechanic 描述）。 */
  effectDescription: string
}>

/**
 * 15 張術式卡。命名跟世界觀對齊（潮術系 + 紋鏽 + 織絲 + 退潮岩 + 燈塔），
 * 不抄獵人原作的具名術，但風格一致。每張都有具體 mechanic 給 Phase C
 * 戰鬥/探索系統 wire 進來。
 */
export const TECHNIQUE_CARDS: readonly TechniqueCard[] = [
  // ── 戰鬥型（combat） — 7 張 ──
  {
    id: 1001,
    nameZh: '潮燼一閃',
    nameEn: 'Tide-Ember Flash',
    category: 'combat',
    priceGold: 350,
    maxOwnedPerPlayer: 3,
    description: '一道燼火劃過，先發制人。',
    effectDescription:
      '戰鬥施展：本回合先攻；對單體目標造成 12 燼火傷害；cooldown 3 回合。',
  },
  {
    id: 1002,
    nameZh: '退潮步法',
    nameEn: 'Ebb-Tide Footwork',
    category: 'combat',
    priceGold: 280,
    maxOwnedPerPlayer: 3,
    description: '一瞬退一格，敵手撲空。',
    effectDescription:
      '戰鬥施展：本回合避免一次受擊；cooldown 4 回合；不可疊加。',
  },
  {
    id: 1003,
    nameZh: '織絲縛魂',
    nameEn: 'Weaver-Thread Bind',
    category: 'combat',
    priceGold: 420,
    maxOwnedPerPlayer: 2,
    description: '潮絲與燼火合織的束縛術。',
    effectDescription:
      '戰鬥施展：對方被束 2 回合（無法行動，攻擊 -50%）；cooldown 5 回合。',
  },
  {
    id: 1004,
    nameZh: '潮鼓震盪',
    nameEn: 'Tide-Drum Resonance',
    category: 'combat',
    priceGold: 480,
    maxOwnedPerPlayer: 2,
    description: '一聲鼓響，敵方混亂。',
    effectDescription:
      '戰鬥施展：本回合對所有敵人造成 6 傷害 + 「震懾」1 回合（行動 50% 失敗）；cooldown 6 回合。',
  },
  {
    id: 1005,
    nameZh: '退潮岩盾',
    nameEn: 'Ebb-Stone Aegis',
    category: 'combat',
    priceGold: 360,
    maxOwnedPerPlayer: 3,
    description: '退潮岩的硬度，臨時化為一面盾。',
    effectDescription:
      '戰鬥施展：本回合受擊傷害 -10（最低 1）+ 反彈 30% 給來源；cooldown 4 回合。',
  },
  {
    id: 1006,
    nameZh: '潮源回響',
    nameEn: 'Tide-Source Echo',
    category: 'combat',
    priceGold: 600,
    maxOwnedPerPlayer: 1,
    description: '借潮源燈塔的光，把上一招重來一次。',
    effectDescription:
      '戰鬥施展：再次發動上一回合自己使用的卡或攻擊（不消耗它的 cooldown）；本卡 cooldown 8 回合。',
  },
  {
    id: 1007,
    nameZh: '黑潮獸引',
    nameEn: 'Black-Tide Beast Lure',
    category: 'combat',
    priceGold: 720,
    maxOwnedPerPlayer: 1,
    description: '召喚一隻黑潮獸幼體助陣。',
    effectDescription:
      '戰鬥施展：召喚潮獸幼體助戰 3 回合（每回合對隨機敵人 5 傷害）；cooldown 場一次。',
  },

  // ── 探索型（explore） — 5 張 ──
  {
    id: 1008,
    nameZh: '燈塔遠望',
    nameEn: 'Lighthouse Farsight',
    category: 'explore',
    priceGold: 220,
    maxOwnedPerPlayer: 5,
    description: '借燈塔的視野，看遠一點。',
    effectDescription:
      '使用後：1 小時內地圖視野 +2 tile（包含地脈層）；不可疊加。',
  },
  {
    id: 1009,
    nameZh: '霧雨潛行',
    nameEn: 'Mist-Rain Stealth',
    category: 'explore',
    priceGold: 260,
    maxOwnedPerPlayer: 3,
    description: '霧雨日專用的潛行術。',
    effectDescription:
      '使用後：30 分鐘內被 NPC 注意到的機率 -50%（僅霧雨日生效）。',
  },
  {
    id: 1010,
    nameZh: '潮絲指引',
    nameEn: 'Tide-Thread Guide',
    category: 'explore',
    priceGold: 320,
    maxOwnedPerPlayer: 3,
    description: '潮絲會自己指向最近的紋卡 drop。',
    effectDescription:
      '使用後：立即顯示當前 tile 內所有 drops 的精確位置（含未到視野範圍的）；持續 60 秒。',
  },
  {
    id: 1011,
    nameZh: '退潮岩印記',
    nameEn: 'Ebb-Stone Marking',
    category: 'explore',
    priceGold: 400,
    maxOwnedPerPlayer: 2,
    description: '在退潮岩上留下自己的印，下次回到島上能直接傳送。',
    effectDescription:
      '使用後：標記當前 tile，下次登入時可直接傳送回此 tile；標記每帳號限 3 個。',
  },
  {
    id: 1012,
    nameZh: '深淵之眼',
    nameEn: 'Eye of Abyss Charm',
    category: 'explore',
    priceGold: 550,
    maxOwnedPerPlayer: 1,
    description: '用一隻深淵的眼，看穿地脈層的隱藏路徑。',
    effectDescription:
      '使用後：地脈層內顯示所有隱藏入口 + 陷阱 30 分鐘；每日限 1 次。',
  },

  // ── 社交型（social） — 3 張 ──
  {
    id: 1013,
    nameZh: '酒杯之言',
    nameEn: 'Cupside Eloquence',
    category: 'social',
    priceGold: 240,
    maxOwnedPerPlayer: 5,
    description: '一杯酒下肚，話說出來都比較順。',
    effectDescription:
      '使用後：30 分鐘內所有 NPC 對話 trustGain +50%（不影響 trustLoss）。',
  },
  {
    id: 1014,
    nameZh: '織絲緣',
    nameEn: 'Weaver-Thread Affinity',
    category: 'social',
    priceGold: 380,
    maxOwnedPerPlayer: 3,
    description: '織絲師傅的祕傳社交術，能讓初次見面的人多看你一眼。',
    effectDescription:
      '使用後：1 小時內初次互動的 NPC 起始 trust +10。',
  },
  {
    id: 1015,
    nameZh: '盟誓之燭',
    nameEn: 'Bond-Pact Candle',
    category: 'social',
    priceGold: 660,
    maxOwnedPerPlayer: 2,
    description: '燭火為兩位玩家的盟誓作證，效力以「日」計。',
    effectDescription:
      '使用後：與另一玩家可結為「3 日盟」，期間戰鬥可呼叫支援；每張帳號限 1 次同時生效。',
  },
]

export const TECHNIQUE_CARD_TOTAL = 15

if (TECHNIQUE_CARDS.length !== TECHNIQUE_CARD_TOTAL) {
  throw new Error(
    `technique catalog must contain ${TECHNIQUE_CARD_TOTAL}, got ${TECHNIQUE_CARDS.length}`
  )
}

const techniqueIds = new Set<number>()
for (const card of TECHNIQUE_CARDS) {
  if (techniqueIds.has(card.id)) {
    throw new Error(`duplicate technique card id: ${card.id}`)
  }
  techniqueIds.add(card.id)
  if (card.priceGold <= 0 || !Number.isInteger(card.priceGold)) {
    throw new Error(`technique ${card.id} has invalid priceGold`)
  }
}

export function findTechnique(id: number): TechniqueCard | null {
  for (const c of TECHNIQUE_CARDS) if (c.id === id) return c
  return null
}

// ── 玩家持有的術式卡（player_techniques 投影） ─────────────────────

export type TechniqueOwnedRow = Readonly<{
  account_id: number
  card_id: number
  count: number
  last_purchased_at: number
}>

export type TechniqueShopError = Readonly<{
  code:
    | 'CARD_NOT_FOUND'
    | 'NOT_ENOUGH_GOLD'
    | 'OWNED_LIMIT_REACHED'
    | 'NOT_IN_NEON_PORT'
  message: string
}>

export class TechniqueShopErrorObj extends Error {
  constructor(readonly code: TechniqueShopError['code'], message: string) {
    super(message)
    this.name = 'TechniqueShopError'
  }
}

export function initializeTechniqueShopSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_techniques (
      account_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      last_purchased_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (account_id, card_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_techniques_account ON player_techniques(account_id);
  `)
}

export class TechniqueShopStore {
  constructor(private readonly db: Database.Database) {
    initializeTechniqueShopSchema(db)
  }

  listOwned(accountId: number): TechniqueOwnedRow[] {
    return this.db
      .prepare(
        `SELECT * FROM player_techniques WHERE account_id = ? ORDER BY card_id ASC`
      )
      .all(accountId) as TechniqueOwnedRow[]
  }

  countOwned(accountId: number, cardId: number): number {
    const row = this.db
      .prepare(
        `SELECT count FROM player_techniques WHERE account_id = ? AND card_id = ?`
      )
      .get(accountId, cardId) as { count: number } | undefined
    return row?.count ?? 0
  }

  /** 加一份持有；caller 必須先驗 gold + max owned limit. */
  addOwned(accountId: number, cardId: number, now: number): TechniqueOwnedRow {
    const existing = this.db
      .prepare(
        `SELECT * FROM player_techniques WHERE account_id = ? AND card_id = ?`
      )
      .get(accountId, cardId) as TechniqueOwnedRow | undefined
    if (existing) {
      this.db
        .prepare(
          `UPDATE player_techniques SET count = count + 1, last_purchased_at = ?
             WHERE account_id = ? AND card_id = ?`
        )
        .run(now, accountId, cardId)
      return { ...existing, count: existing.count + 1, last_purchased_at: now }
    }
    this.db
      .prepare(
        `INSERT INTO player_techniques (account_id, card_id, count, last_purchased_at)
           VALUES (?, ?, 1, ?)`
      )
      .run(accountId, cardId, now)
    return {
      account_id: accountId,
      card_id: cardId,
      count: 1,
      last_purchased_at: now,
    }
  }
}
