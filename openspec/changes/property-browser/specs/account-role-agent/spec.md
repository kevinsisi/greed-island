# account-role-agent Specification

## Purpose

擴充帳號角色系統，新增 `agent` 角色供 B 端房仲使用。

## ADDED Requirements

### Requirement: Account role SHALL support "agent"

The `AccountRole` type SHALL be extended to include `'agent'`. The `ACCOUNT_ROLES` array SHALL include `'agent'`. The `isAccountRole()` function SHALL recognise `'agent'` as valid.

#### Scenario: Agent role is valid
- **WHEN** `isAccountRole('agent')` is called
- **THEN** it SHALL return `true`

### Requirement: Agent role SHALL be assignable via admin

An admin user SHALL be able to set any account's role to `'agent'` using the existing `setRole()` method.

#### Scenario: Admin promotes to agent
- **WHEN** an admin calls `setRole(accountId, 'agent')`
- **THEN** the account's role SHALL change to `'agent'`
- **AND** the updated account record SHALL be returned

### Requirement: Agent role SHALL NOT affect game simulation

The `agent` role SHALL have the same gameplay permissions as `player`. It is a label for identification only, not a new permission tier.

#### Scenario: Agent can play normally
- **WHEN** an account with role `'agent'` accesses game pages
- **THEN** the system SHALL treat them identically to a `'player'` role account
