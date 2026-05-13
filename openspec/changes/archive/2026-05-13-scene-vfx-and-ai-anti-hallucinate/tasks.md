# Tasks — 場景動態化 + AI 反幻覺 + 編年史多樣化 + 角色 lock home tile（v0.15.1–v0.15.3）

## v0.15.1 — 場景動態化（已完成）

- [x] `AmbientNarrator.tickRefresh(currentTick, getContext)` 主動推 30-tick 過期的 tile 進下一輪 refresh
- [x] `lastRequestedTickByTile` map 追蹤「最近 12 tick 內被 polled 的 tile」
- [x] `runtime.buildAmbientContext(tileId)` 共用 helper
- [x] `AreaScene.applyWeather(weather)` + `weatherLayer` (depth=200) — 5 種天氣 VFX
- [x] `AreaScene.attachEnvAnimation` 依 emoji 類型套 idle tween
- [x] `normaliseWeather` enum 轉換 + plumb 到 AreaPhaserGame / AreaScene

## v0.15.2 — 地圖純畫面 + NPC idle 呼吸 + polling 縮短（已完成）

- [x] AreaPage 重組：「← 返回」+ 區域 pill 從 absolute overlay → 移到地圖**上方** block flow
- [x] `AreaSceneCallbacks.onNearbyBuildingChange` callback fire 時 React 在地圖**下方** render「進入 X →」HTML 按鈕
- [x] `AreaScene.attachNpcIdleAnimation`（scaleY 0.93→1.06 yoyo, 1.2s 週期 + hash phase delay）
- [x] `WorldStateContext.POLL_FALLBACK_MS` 8s → 3s
- [x] 移除 `area.scene` tab 的「AI / 靜態」debug badge

## v0.15.3 — AI 反幻覺 + 編年史多樣化 + 角色 lock home tile（已完成）

- [x] Ambient system prompt 加 ⚠️ 嚴禁虛構區塊（禁虛構具名 NPC + 建築結構名）
- [x] User prompt 列「在場 NPC」清單時加引用約束句
- [x] `AmbientContext.presentBuildingNames` 欄位 + 空清單反向約束句
- [x] WorldEvent narration prompt 同步加禁構約束
- [x] `isRoleLockedToHomeTile(profile)` 檢查（archetype + role.zh + role.en）
- [x] `deriveSchedule` lock 路徑（壓回 defaultLocation）
- [x] `composeInteractionNarration` 句型池擴充到 50+ 句
- [x] seed 加 `tick + weather` → 同對 NPC 不同 tick 拿到不同句子
- [x] 雨天 / 微風 / 晴 / 陰 各自加情境句

## 部署

- [x] 版號 0.15.3（root + server + web + version.ts 同步）
- [x] vitest 12 file / 100 tests 全綠
- [x] full build 通過
- [x] commit / push / merge to main / push origin main
- [x] `docker compose up -d --build` 部署到 100.83.112.20:7100
- [x] /healthz 確認 version 0.15.3
- [x] 收斂 worktree 分支 + 遠端分支
