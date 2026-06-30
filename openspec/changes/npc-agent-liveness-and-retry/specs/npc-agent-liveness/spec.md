## ADDED Requirements

### Requirement: NPC AI agent 排程 SHALL 以 staleness 輪轉並受全域每 tick 硬上限封頂

NpcAgentRunner SHALL 以「距上次思考最久者優先」決定每 tick 由哪些 NPC 進行 AI 自主決策，取代固定 hash 相位排程。每 tick 實際出題的 NPC 數 MUST NOT 超過全域上限 `NPC_AGENT_MAX_DELIBERATIONS_PER_TICK`，且此上限與 NPC 數量無關（population-independent cost ceiling）。被上限擋下的合格 NPC SHALL 於後續 tick 依 staleness 自然輪到，不被永久略過。

一個 NPC 自上次思考起 SHALL 至少間隔 `NPC_AGENT_DECISION_INTERVAL_TICKS` 才再次合格；in-flight 中的 NPC MUST NOT 被同時重複出題。排程在相同輸入下 SHALL 為決定性（staleness 相同時以穩定 tie-break）。

#### Scenario: 全域每 tick 硬上限封頂
- **GIVEN** 上限為 1 且有多個 NPC 同時合格
- **WHEN** 跑一個 tick
- **THEN** 該 tick SHALL 只有 1 個 NPC 進行 AI 決策，其餘合格 NPC 留待後續 tick

#### Scenario: 最久沒思考者優先
- **GIVEN** 數個合格 NPC 的上次思考 tick 不同
- **WHEN** 該 tick 出題數受限
- **THEN** SHALL 優先選距上次思考最久（含從未思考）的 NPC

#### Scenario: 剛思考過的 NPC 不立即重選
- **GIVEN** 某 NPC 剛於本 tick 被出題
- **WHEN** 下一 tick 評估合格性且間隔尚未過
- **THEN** 該 NPC SHALL NOT 再次被選，輪轉讓位給其他 NPC

#### Scenario: 成本上限不隨 NPC 數量增長
- **GIVEN** NPC 數量大幅增加
- **WHEN** 持續 tick
- **THEN** 每 tick AI 決策次數 SHALL 仍不超過 `NPC_AGENT_MAX_DELIBERATIONS_PER_TICK`

### Requirement: NPC AI 單次決策 SHALL 對暫時性失敗指數退避重試

當 AI provider 拋出暫時性錯誤、或回傳無法解析為合法 freeform 提案的內容時，NpcAgentRunner SHALL 以指數退避重試，至多 `NPC_AGENT_MAX_RETRIES` 次；任一次嘗試成功即送出決策。所有重試耗盡後 SHALL 記錄對應的 error / parse_failed 診斷，並退回確定性 planner（不得 throw 給 tick 路徑）。重試 MUST 非阻塞且不得在重試期間對同一 NPC 重複出題。

#### Scenario: 首次失敗、重試成功
- **GIVEN** provider 第一次拋錯、第二次成功
- **WHEN** 該 NPC 進行 AI 決策
- **THEN** 系統 SHALL 在退避後重試並成功送出一次決策（不記為 error）

#### Scenario: 重試耗盡後表面化失敗
- **GIVEN** provider 每次都失敗
- **WHEN** 重試次數耗盡
- **THEN** 系統 SHALL 記錄 error 診斷、不送出決策，且不 throw 給呼叫端

#### Scenario: 無 provider 時不啟用
- **GIVEN** 未配置任何 active AI provider 或 `npc_agent_enabled=false`
- **WHEN** tick 推進
- **THEN** NpcAgentRunner SHALL 不進行任何 AI 呼叫
