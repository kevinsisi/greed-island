## Why

NPC「看起來沒有智慧」的根因之一在 `NpcAgentRunner`：

1. **每個 NPC 每模擬小時才 AI 思考一次**（`NPC_AGENT_DECISION_INTERVAL_TICKS = TICKS_PER_HOUR = 720` ticks ≈ 60 分鐘牆鐘）。其餘 ~99% 的 tick 完全由確定性 planner 驅動，玩家幾乎觀察不到 AI 介入。
2. **AI 呼叫失敗即靜默放棄、不重試**（`npcAgentRunner.ts` deliberate 的 catch 只記 errorCount）。`thinkingBudget:0`、JSON mode、20ms~數秒超時下 parse/timeout 失敗很常見 → AI 形同沒跑，NPC 退回純規則。
3. 排程是 `npcId hash % interval` 的**固定相位**，與「這個 NPC 此刻多久沒思考、玩家是否在看」無關，AI 預算無法集中到值得的 NPC 上。

固定 budget 下「全部 NPC 都聰明」與「少數 NPC 常常聰明」必須二選一。本change在**不抬高全域成本上限**前提下，把同一份 AI 預算重新分配（最久沒思考者優先輪轉），並讓單次 AI 呼叫**可靠**地完成。

## What Changes

- **可靠性（retry with backoff）**：`deliberate` 對**暫時性**失敗（provider 拋錯、回傳 non-conforming JSON）以指數退避重試 `NPC_AGENT_MAX_RETRIES` 次；重試耗盡才記 error/parse_failed（維持既有 diagnostics 行為）。穩態額外成本趨近 0（僅失敗時才重試）。非阻塞、不佔 tick 路徑、`inFlight` 全程持有避免併發重入。
- **以「最久沒思考」排程 + 全域每 tick 硬上限**：以 `lastDeliberatedTick` 取代固定 hash 相位。每 tick 在「距上次思考 ≥ 間隔且非 in-flight」的 NPC 中，依 staleness（最久沒思考者先，tie-break hash）取前 `NPC_AGENT_MAX_DELIBERATIONS_PER_TICK` 個出題。全域成本上限與 NPC 數量**脫鉤**（population-independent ceiling）。
- **間隔調降，liveness 提升但成本受硬上限封頂**：`NPC_AGENT_DECISION_INTERVAL_TICKS` 由 720（60 分）降為 `TICKS_PER_MINUTE * 10`（120 ticks ≈ 10 分）；全域硬上限 `NPC_AGENT_MAX_DELIBERATIONS_PER_TICK` 預設 1（= 最多每 tick 1 次 AI 呼叫）。
- **可由 settings 覆寫**（不需改碼即可調 liveness↔成本）：`npc_agent_interval_ticks`、`npc_agent_max_per_tick`、`npc_agent_retry_base_ms`、`npc_agent_max_retries`；缺值時用上述常數預設。沿用既有 `npc_agent_enabled=false` 全關閘門與「無 provider → 不啟用」。

## Capabilities

### New Capabilities
- `npc-agent-liveness`: NPC AI agent 的排程節奏（staleness 優先輪轉 + 全域每 tick 硬上限）與單次決策可靠性（暫時性失敗指數退避重試），含 settings 覆寫與成本上限不依賴 NPC 數量的保證。

### Modified Capabilities
- _None._

## Impact

- **Code**: `packages/server/src/config/world.ts`（調 `NPC_AGENT_DECISION_INTERVAL_TICKS`；新增 `NPC_AGENT_MAX_DELIBERATIONS_PER_TICK` / `NPC_AGENT_MAX_RETRIES` / `NPC_AGENT_RETRY_BASE_DELAY_MS`）、`packages/server/src/npcs/npcAgentRunner.ts`（lastDeliberatedTick 排程、全域上限、retry 退避、settings 覆寫）。
- **Tests**: `npcAgentRunner` 新測試 —— staleness 排序、全域上限封頂、min-interval 不連選、retry 成功路徑、retry 耗盡記 error。
- **架構鐵則**: 不變 —— AI 仍只在 server 預選的合法選項/freeform 提案上選擇並走 Rule Engine（`resolveFreeformAgentProposal`），不直接改 state、不下未經驗證的 Command。
- **成本**: 全域上限 = `NPC_AGENT_MAX_DELIBERATIONS_PER_TICK` 次/ tick（預設 1 → 上限 ~12 次/分，實際依到期數），與 NPC 數量脫鉤；可由 settings 下修。無 provider 時零呼叫。
- **Replay**: 排程/重試只影響「何時、是否成功送出」AI 決策；決策本身仍走既有 `NPC_AGENT_DECISION` command 路徑。無事件 shape 變動。
