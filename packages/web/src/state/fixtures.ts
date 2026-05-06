import type {
  CardCatalogEntry,
  DashboardSummary,
  EventSummary,
  NpcSummary,
  WorldMap,
  WorldSnapshot,
} from './types'

// Placeholder data so the frontend renders before the HTTP/SSE server
// exists. Every value here is illustrative; the server will replace
// these with EventLog-derived projections.

const NPC_NAMES: Array<{ id: string; name: string; role: string; location: string }> = [
  { id: 'npc_anton', name: '安東·風行者', role: '商人', location: '碼頭區' },
  { id: 'npc_lyra', name: '萊拉·夜歌', role: '尋寶獵人', location: '北方森林' },
  { id: 'npc_orin', name: '奧林·冷鋼', role: '傭兵團長', location: '中央城' },
  { id: 'npc_sela', name: '瑟拉·靜湖', role: '神職', location: '湖心神殿' },
  { id: 'npc_kade', name: '凱德·斷指', role: '走私販', location: '南方廢墟' },
  { id: 'npc_mira', name: '米拉·星圖', role: '占卜師', location: '中央城' },
  { id: 'npc_borr', name: '波爾·磐石', role: '礦場領班', location: '東方山脈' },
  { id: 'npc_yuna', name: '優娜·薄霧', role: '吟遊詩人', location: '碼頭區' },
]

export const fixtureNpcs: NpcSummary[] = NPC_NAMES.map((entry, index) => ({
  ...entry,
  relationshipScore: 50 - index * 4 + (index % 3) * 6,
  lastActedTick: 4128 - index * 7,
  internalState: {
    mood: ['謹慎', '警戒', '雀躍', '冷漠', '渴望'][index % 5],
    pendingDesire: ['完成交易', '尋找線索', '招募同伴', '清查存貨', '前往神殿'][index % 5],
    knownPlayerActions: 12 - index,
  },
}))

const cardSeeds: Array<{ rank: CardCatalogEntry['rank']; name: string; story: string }> = [
  { rank: 'S', name: '貪婪之島本身', story: '據說整座島就是一張卡——擁有它的人成為下一任主宰。' },
  { rank: 'S', name: '時之沙漏', story: '能讓世界倒退一個刻度，但同時被遺忘的人也會回來。' },
  { rank: 'A', name: '夜行者之靴', story: '穿上後腳步聲消失，但你的影子會自行走動。' },
  { rank: 'A', name: '迴聲笛', story: '吹奏時所有 NPC 都會停下手邊的工作回頭看你。' },
  { rank: 'A', name: '骰之神諭', story: '擲一次決定一場交易的成敗，骰子記得你的每一次選擇。' },
  { rank: 'B', name: '鏽蝕地圖殘片', story: '湊齊七片就能看見島嶼的真實形狀。' },
  { rank: 'B', name: '北極星之鑰', story: '只在每月的特定刻度開啟一次中央城地下道。' },
  { rank: 'B', name: '商人的契紙', story: '簽下的交易必定履行，違約者的物品會自行回到原主手裡。' },
  { rank: 'C', name: '湖心神殿的鈴', story: '搖響可以讓瑟拉聽見你，但她不一定回應。' },
  { rank: 'C', name: '走私者的暗語', story: '在對的人面前說出，可解鎖南方廢墟的隱藏交易。' },
]

export const fixtureCards: CardCatalogEntry[] = Array.from({ length: 100 }, (_, index) => {
  const seed = cardSeeds[index % cardSeeds.length]!
  const idNumber = index + 1
  const owned = index < 17
  const base: CardCatalogEntry = {
    id: idNumber,
    rank: seed.rank,
    name: index < cardSeeds.length ? seed.name : `${seed.name} · 變體 ${idNumber}`,
    description: `第 ${String(idNumber).padStart(3, '0')} 號卡片，等級 ${seed.rank}。`,
    story: seed.story,
    owned,
  }
  return owned ? { ...base, discoveredAtTick: 4000 + index * 6 } : base
})

export const fixtureWorld: WorldSnapshot = {
  tick: 4128,
  lastSequence: 18742,
  eventCount: 18742,
  npcCount: fixtureNpcs.length,
  facts: {
    weather: '霧雨',
    economy: { gold: 12048, manaIndex: 0.62 },
    season: '雨之月',
  },
  generatedAt: new Date().toISOString(),
}

export const fixtureEvents: EventSummary[] = [
  {
    sequence: 18742,
    tick: 4128,
    eventType: 'CARD_DISCOVERED',
    actorId: 'npc_lyra',
    occurredAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    payload: { cardId: 17, location: '北方森林' },
    narration: '萊拉在斷崖下的一個錫盒裡找到了走私者的暗語，封蠟仍未乾透。',
  },
  {
    sequence: 18741,
    tick: 4127,
    eventType: 'NPC_RELATIONSHIP_DECAYED',
    actorId: 'npc_orin',
    occurredAt: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    payload: { withActor: 'npc_anton', delta: -3 },
    narration: '奧林已經兩個刻度沒有回覆安東的信函，傭兵團長與商人之間的默契正在消磨。',
  },
  {
    sequence: 18740,
    tick: 4127,
    eventType: 'WORLD_RARE_WINDOW_OPENED',
    actorId: 'system',
    occurredAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    payload: { windowId: 'tide_festival', closesAtTick: 4140 },
    narration: '潮汐節的窗口開啟了，碼頭區會在十二個刻度內進入慶典。',
  },
  {
    sequence: 18739,
    tick: 4126,
    eventType: 'NPC_MOVE',
    actorId: 'npc_sela',
    occurredAt: new Date(Date.now() - 1000 * 60 * 33).toISOString(),
    payload: { from: '湖心神殿', to: '中央城' },
    narration: null,
  },
  {
    sequence: 18738,
    tick: 4125,
    eventType: 'CARD_TRANSFERRED',
    actorId: 'npc_kade',
    occurredAt: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    payload: { cardId: 9, from: 'npc_kade', to: 'npc_mira' },
    narration: '凱德把湖心神殿的鈴交給了米拉，據說是為了償還一場占卜的價格。',
  },
  {
    sequence: 18737,
    tick: 4124,
    eventType: 'NPC_TRADE',
    actorId: 'npc_anton',
    occurredAt: new Date(Date.now() - 1000 * 60 * 62).toISOString(),
    payload: { item: '霧月麵粉', amount: 12, with: 'npc_borr' },
    narration: null,
  },
  {
    sequence: 18736,
    tick: 4124,
    eventType: 'WORLD_WEATHER_CHANGED',
    actorId: 'system',
    occurredAt: new Date(Date.now() - 1000 * 60 * 78).toISOString(),
    payload: { from: '陰', to: '霧雨' },
    narration: null,
  },
]

export const fixtureMap: WorldMap = {
  width: 8,
  height: 6,
  tiles: [
    { id: 't_dock', name: '碼頭區', x: 0, y: 4, biome: 'water', npcIds: ['npc_anton', 'npc_yuna'] },
    { id: 't_central', name: '中央城', x: 3, y: 3, biome: 'grass', npcIds: ['npc_orin', 'npc_mira'] },
    { id: 't_temple', name: '湖心神殿', x: 4, y: 1, biome: 'water', npcIds: ['npc_sela'] },
    { id: 't_forest', name: '北方森林', x: 2, y: 0, biome: 'forest', npcIds: ['npc_lyra'] },
    { id: 't_ruin', name: '南方廢墟', x: 5, y: 5, biome: 'ruin', npcIds: ['npc_kade'] },
    { id: 't_mountain', name: '東方山脈', x: 7, y: 2, biome: 'mountain', npcIds: ['npc_borr'] },
    { id: 't_desert', name: '西緣荒地', x: 0, y: 1, biome: 'desert', npcIds: [] },
  ],
}

export const fixtureDashboard: DashboardSummary = {
  world: fixtureWorld,
  cardsOwned: fixtureCards.filter((c) => c.owned).length,
  cardsTotal: fixtureCards.length,
  recentEvents: fixtureEvents.slice(0, 5),
  rareWindowOpen: true,
  ticksSinceLastVisit: 23,
}
