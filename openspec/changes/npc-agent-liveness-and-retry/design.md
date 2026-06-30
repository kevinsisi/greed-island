## Context

`NpcAgentRunner.tick(currentTick)`（`npcAgentRunner.ts:86`）目前：對每個活著的 NPC 算 `hashId % NPC_AGENT_DECISION_INTERVAL_TICKS` 相位，`currentTick % interval === phase` 時非阻塞 `deliberate()`。`deliberate` 呼叫 `generateWithProviders`（已含跨 provider/key-pool failover），parse freeform 提案 → `resolveFreeformAgentProposal`（Rule Engine 驗證）→ `submitDecision`。失敗（throw 或 parse=null）只累加 diagnostics、不重試。

約束：
- **架構鐵則**：AI 只能在 server 預選選項 / freeform 提案上選擇，最終由 `resolveFreeformAgentProposal` + Rule Engine 決定是否成行。本change不碰這條。
- **單執行緒 / 非阻塞**：`deliberate` 已是 fire-and-forget，不在 tick 同步路徑。重試的 sleep 也必須非阻塞。
- **成本**：每次 deliberate = 一次（可能多 provider 嘗試的）AI 呼叫。固定 budget 下成本上限必須可預期、且不隨 NPC 數量線性爆增。
- **決定性 replay**：排程與重試屬「runtime 何時出題」層，AI 決策本身仍走 `NPC_AGENT_DECISION` command；EventLog replay 不依賴排程細節。

## Goals / Non-Goals

**Goals:**
- 玩家觀察期間，NPC 的 AI 介入頻率明顯高於「每小時一次」。
- 單次 AI 決策對暫時性失敗有韌性（retry+backoff），不再一失敗就整輪丟失。
- 全域 AI 呼叫上限可預期、與 NPC 數量脫鉤、可由 settings 調節。

**Non-Goals:**
- 不改「AI read-only、不下未驗證 Command」的架構鐵則。
- 不引入玩家位置/互動作為排程權重（需新 runtime 依賴，留待後續；本change先用 staleness 公平輪轉）。
- 不改 `generateWithProviders` 內部的 provider/key 輪替邏輯（那層已有 failover）。

## Decisions

### D1：以 `lastDeliberatedTick` staleness 取代固定 hash 相位
- 新增 `lastDeliberatedTick: Map<npcId, tick>`。eligible = `currentTick - last ≥ interval`（從未思考 = 最 eligible）且非 in-flight。每 tick 對 eligible 依 staleness 降序（tie-break `hashId` 保決定性）取前 `MAX_DELIBERATIONS_PER_TICK` 個。
- 在**出題當下**寫入 `lastDeliberatedTick`（非等成功），確保失敗/重試中的 NPC 不會同 tick 被重選、也不會卡住輪轉。
- **理由**：staleness 輪轉保證公平且「最久沒被看顧的人先被處理」；固定相位無法回應實際間隔。alternative「保留 hash 相位」無法配合可調間隔與全域上限。

### D2：全域每 tick 硬上限 `NPC_AGENT_MAX_DELIBERATIONS_PER_TICK`（預設 1）
- 成本上限 = cap 次/ tick，與 NPC 數量無關。超出 cap 的 eligible NPC 自然在後續 tick 輪到（它們仍 eligible）。
- **理由**：把「成本」收斂成單一可預期上限；population 成長不會線性爆增 AI 帳單。alternative「只調間隔、不設上限」會讓 NPC 越多成本越高，違反成本可控。

### D3：間隔 720 → `TICKS_PER_MINUTE * 10`（120），liveness 由間隔放寬、成本由 D2 封頂
- 間隔只決定「多久後再次 eligible」；真正的成本天花板是 D2。兩者分離後可安全調低間隔。
- **理由**：小族群時每 NPC ~10 分思考一次（vs 60 分）；大族群時 D2 上限接手，個別 NPC 由 staleness 公平輪轉。

### D4：暫時性失敗指數退避重試
- `deliberate` 內把「呼叫 + parse」包成單次 attempt；attempt 失敗（throw 或 parse=null）→ `await sleep(base * 2^n)` 後重試，至多 `NPC_AGENT_MAX_RETRIES` 次；全敗才記 error/parse_failed（保留既有 diagnostics 欄位語意）。
- `sleep` 非阻塞（setTimeout promise）；`inFlight` 全程持有，避免重試期間同 NPC 被重入或重複出題。
- 退避基數 `NPC_AGENT_RETRY_BASE_DELAY_MS`（預設 500ms）可由 settings 覆寫（測試設 0 → 即時 resolve，免假時鐘）。
- **理由**：integration-robustness —— 暫時性 AI/外部失敗應退避重試、耗盡才表面化。parse=null 視為暫時性（model 偶發非結構化輸出，重試常可恢復）。

### D5：所有旋鈕可由 settings 覆寫，缺值用常數
- `npc_agent_interval_ticks` / `npc_agent_max_per_tick` / `npc_agent_max_retries` / `npc_agent_retry_base_ms`：解析為正整數，非法/缺值 → 常數預設。
- **理由**：讓部署方在不改碼下調 liveness↔成本；沿用既有 `npc_agent_enabled` 與 settings 慣例。

## Risks / Trade-offs

- **[已配置 key 部署 AI 成本上升（預設約數倍於今日穩態）]** → 全域硬上限 D2 封頂、且 `npc_agent_max_per_tick` / `npc_agent_interval_ticks` 可下修；無 provider 部署零影響；成本僅發生在已主動配置 key 者。實作完成後向使用者明示預設成本envelope與旋鈕。
- **[重試放大失敗時的呼叫量]** → 重試僅在失敗時發生、有上限次數與退避；穩態（成功）零額外呼叫。
- **[退避 sleep 期間 inFlight 佔用]** → 該 NPC 該輪不被重選即預期行為；退避基數小（500ms），總重試時間有界。
- **[staleness 掃描成本]** → 每 tick 對 NPC 清單一次線性掃描 + 取前 cap，數十量級可忽略。

## Migration Plan

- 純行為調整 + 新常數/旋鈕；無 schema/event 變動、無資料遷移。
- 部署即生效；rollback = revert，無殘留狀態（lastDeliberatedTick 為記憶體）。
- 驗證：新單元測試 + 全套 server vitest + `npm run build`。

## Open Questions

- 預設 `NPC_AGENT_MAX_DELIBERATIONS_PER_TICK = 1` 與間隔 120 的成本envelope是否符合使用者額度預期？（提供 settings 旋鈕；實作後請使用者確認預設或下修。）
