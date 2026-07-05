# npc-property-agent Specification

## Purpose

B 端房仲可綁定遊戲內 NPC 作為代理人，NPC 以 AI 對話向 C 端客戶介紹房產案件。

## ADDED Requirements

### Requirement: Agent can bind an NPC as their in-game representative

The `agent_npc_bindings` table SHALL store agentId ↔ npcId associations. An agent SHALL be able to bind to exactly one NPC at a time via `POST /api/agent/bind-npc`. Binding SHALL require the agent to be authenticated with role `agent`.

#### Scenario: Agent binds to an NPC
- **WHEN** an authenticated agent sends `POST /api/agent/bind-npc` with `{ npcId: "central.broker.gui" }`
- **THEN** a record SHALL be created in `agent_npc_bindings` linking the agent's accountId to the npcId
- **AND** the response SHALL confirm the binding

#### Scenario: Agent unbinds from an NPC
- **WHEN** an authenticated agent sends `DELETE /api/agent/unbind-npc`
- **THEN** the binding record SHALL be removed

### Requirement: Bound NPC SHALL have agent listings in AI prompt

When a bound NPC processes a dialog or local-shout request, the AI prompt SHALL include a property context block containing the agent's current listings as structured JSON. The AI SHALL be constrained to only reference listings present in this context block.

#### Scenario: NPC responds with property info
- **WHEN** a player sends a local-shout near a bound NPC asking about properties
- **THEN** the AI response SHALL reference only listings from the injected context block
- **AND** the response SHALL include relevant listing details (price, location, layout)

### Requirement: NPC dialog SHALL support embedding property listing cards

When the NPC AI includes a property reference in its response, the system SHALL produce a property card UI element alongside the dialog text, showing photo thumbnail, price, and a link to the full detail on `/properties`.

#### Scenario: Property card appears in dialog
- **WHEN** the NPC AI responds with a property reference
- **THEN** a property card SHALL be rendered in the dialog UI showing photo, price, and a "查看詳情" link
