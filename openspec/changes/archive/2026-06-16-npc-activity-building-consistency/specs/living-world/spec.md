## MODIFIED Requirements

### Requirement: NPC 行程以 tick-of-day 三段式定義
每個 NPC profile SHALL 提供 schedule（或可從既有 routine 推導），至少涵蓋
morning / afternoon / night 三個時段。每個 slot 必須含 `fromTickOfDay`、
`toTickOfDay`、`location`、`activity` 四個欄位（缺 activity 時系統 SHALL
從 label 或 role 推斷）。系統 SHALL 在 tick 中找出當前 slot 並用其
location 作為 target_tile，用 activity 作為目標活動。

每個 slot 可選包含 `buildingId?: string | null`；當提供時，系統 SHALL 在 NPC
抵達目標 tile 後將其 `buildingId` 設為該值。缺失或為 null 時，`buildingId` 維持
原有行為（由相鄰建築規則或 null 決定）。

#### Scenario: 缺 schedule 時退回 routine
- **GIVEN** profile 沒有 schedule 欄位但有 routine
- **WHEN** NpcEngine 初始化
- **THEN** 系統必須以 routine 自動推導三段式 schedule，避免破壞既有資料

#### Scenario: 完全沒有 routine
- **GIVEN** profile 既無 schedule 也無 routine
- **WHEN** NpcEngine 初始化
- **THEN** 系統必須給一個全天 idle 的預設 slot，NPC 留在 defaultLocation

#### Scenario: Schedule slot 含 buildingId 時 NPC 進入建築
- **GIVEN** NPC 的當前 schedule slot 含 `buildingId: 'b_central_library'`，且 NPC 已在 `t_central`
- **WHEN** 系統處理該 tick
- **THEN** NPC 的 runtime `buildingId` 設為 `'b_central_library'`，API 回傳該值
