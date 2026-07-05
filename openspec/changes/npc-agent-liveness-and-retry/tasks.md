## 1. 常數與旋鈕（config/world.ts）

- [x] 1.1 `NPC_AGENT_DECISION_INTERVAL_TICKS` 由 `TICKS_PER_HOUR` 改為 `TICKS_PER_MINUTE * 10`，更新註解說明「間隔=再次合格門檻；成本天花板另由每 tick 上限封頂」
- [x] 1.2 新增 `NPC_AGENT_MAX_DELIBERATIONS_PER_TICK`（預設 1）、`NPC_AGENT_MAX_RETRIES`（預設 2）、`NPC_AGENT_RETRY_BASE_DELAY_MS`（預設 500），各帶語意註解

## 2. 排程改造（npcAgentRunner.ts）

- [x] 2.1 新增 `lastDeliberatedTick: Map<string, number>`；移除固定 hash 相位排程
- [x] 2.2 `tick()`：篩 eligible（`currentTick - last ≥ interval` 且非 in-flight）→ 依 staleness 降序、tie-break `hashId` → 取前 `maxPerTick` 個出題；出題當下寫入 `lastDeliberatedTick`
- [x] 2.3 從 settings 讀覆寫值（`npc_agent_interval_ticks` / `npc_agent_max_per_tick`），解析正整數、非法或缺值用常數預設

## 3. 可靠性（retry with backoff）

- [x] 3.1 抽出單次 attempt（generateWithProviders + parseFreeformAgentProposal）；對 throw 或 parse=null 視為暫時性失敗
- [x] 3.2 指數退避重試至多 `maxRetries` 次（非阻塞 sleep；base 可由 `npc_agent_retry_base_ms` 覆寫，測試設 0）；任一次成功即送出
- [x] 3.3 重試耗盡才記 error / parse_failed（維持既有 diagnostics 欄位語意）；不 throw 給 tick；`inFlight` 全程持有

## 4. 測試（npcAgentRunner.test.ts）

- [x] 4.1 全域上限：上限 1、多個合格 → 單 tick 僅 1 次出題
- [x] 4.2 staleness：上次思考較久者優先被選
- [x] 4.3 min-interval：剛出題的 NPC 下一 tick 不被重選
- [x] 4.4 retry 成功：首次 throw、次次成功 → submit 1 次、不記 error
- [x] 4.5 retry 耗盡：每次皆 throw → errorCount=1、無 submit、不 throw
- [x] 4.6 既有測試（deliberate 空 intent 仍出題）維持綠

## 5. 驗證與收尾

- [x] 5.1 `npm --workspace packages/server exec vitest run src/npcs/npcAgentRunner.test.ts` 綠
- [x] 5.2 `npm --workspace packages/server exec vitest run` 全套綠（容忍既知無關 flaky）
- [x] 5.3 `npm run build`（server + web）clean
- [x] 5.4 更新 PROGRESS.md；commit（已做）。向使用者明示成本 envelope + settings 旋鈕；**push 時機待使用者決定**
