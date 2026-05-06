## Why

Tideway 的 NPC 對話目前是靜態的：玩家從固定的 4 個 intent 按鈕（greet / ask / trade / leave）裡挑一個，後端從 hard-coded 的 `dialog.ts` 台詞庫照（intent × tier）抽一句回去。這對「會記得你的虛擬世界」這個產品定位是不夠的——玩家無法用自由語言跟 NPC 互動，NPC 也不會根據玩家的真實話語做不同反應。

同時，本機部署需要一個讓管理員批次貼入 Gemini API 金鑰的入口。原本規畫透過 `@kevinsisi/ai-core` 的 KeyPool 統合所有金鑰；但這次先做一個輕量的 in-app 金鑰池，避免一上線就引入跨專案套件的耦合，後續再依 `key-pool-standard` 的規範重構。

## What Changes

- 加入 `api_keys` SQLite 表與 `SettingsStore`，支援從 `GEMINI_API_KEY` / `GEMINI_API_KEYS` 環境變數種子化、以及由管理員透過 HTTP API 動態新增/刪除/重啟用。
- 加入 `npcs/geminiClient.ts`：直接打 Gemini REST `generateContent` endpoint，於金鑰池中以 LRU 順序輪換；HTTP 401/403/429 會自動停用該金鑰，5xx / 連線錯誤切下一把但保留為 active；逾時 15 秒。
- 加入 `npcs/aiDialog.ts`：依 NPC 個性、玩家信任值、過去對話摘要與玩家自由文字，組出 system + user prompt，呼叫金鑰池並解析嚴格 JSON 回覆 `{ zh, en, intent, trustDelta }`。
- 改寫 `POST /api/npc/:npcId/interact`：接受 `{ message?, intent? }`，當金鑰池有可用金鑰時走 AI；任何 AI 失敗都會自動退回原本的靜態台詞庫，世界不會因此停擺。
- 新增 `/api/settings/*` 路由：管理員可列出/批次新增/刪除/重啟用金鑰；管理員資格由 `GREED_ISLAND_ADMIN_EMAILS` 允許名單決定，未設定時退回為「第一位註冊的帳號」。
- 前端新增 `/settings` 頁，提供 textarea 批次貼入金鑰、金鑰池健康度面板、單筆刪除與整批重啟用按鈕。
- 前端 `NpcDialog` 改為自由文字輸入框（含 Enter 送出），保留 4 個快速 intent 按鈕作為輔助；同時呈現 AI / 靜態 fallback 標記。
- 新增 deploy 環境變數 `GEMINI_API_KEY` 與 `GREED_ISLAND_ADMIN_EMAILS`，並更新 `.env.example` / `docker-compose.yml`。

## Capabilities

### New Capabilities

- `ai-npc-dialog`: AI-driven per-player NPC dialog backed by a SQLite-persisted Gemini key pool, with admin self-service key management via `/api/settings/keys` and an automatic fallback to the static dialog library when no keys are configured or all keys fail.

### Modified Capabilities

- `web-observation-frontend`: NPC interaction surface gains a free-text input mode and a `/settings` admin page; quick-intent buttons are kept for one-tap interactions on mobile.
- `accounts-and-permissions`: First-registered account is treated as the implicit admin when `GREED_ISLAND_ADMIN_EMAILS` is empty, so a fresh deployment can manage keys without extra config.

## Impact

- New env vars: `GEMINI_API_KEY` (preferred, comma-separated) — `GEMINI_API_KEYS` is still accepted for backwards compat. `GREED_ISLAND_ADMIN_EMAILS` is optional.
- New SQLite table `api_keys` migrates in via `IF NOT EXISTS` — existing deployments do not need a separate migration step.
- Public NPC behaviour from the simulation runtime (NPC_MOVE, weather, rare windows) is unchanged. Personal dialog stays in `personal_events` and never reaches the public chronicle.
- Defers `@kevinsisi/ai-core` integration; that swap is a follow-up change governed by `key-pool-standard`.
