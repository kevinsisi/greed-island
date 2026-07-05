# property-api-bridge Specification

## Purpose

後端 API 代理層，封裝既有房仲系統 API，提供前端唯讀案件查詢。

## ADDED Requirements

### Requirement: GET /api/properties SHALL return property listings

The endpoint SHALL proxy to the existing agent system API, normalise the response, and return a unified JSON array of property listings. Each listing SHALL include: id, title, price, address, lat/lng, layout (rooms/hall/bath), size (ping), building type, floor, age, photo URLs, agent name, agent contact.

#### Scenario: Returns normalised listings
- **WHEN** a GET request is sent to `/api/properties` with optional query parameters
- **THEN** the response SHALL be a JSON object with `listings` array
- **AND** each listing SHALL contain the required fields

### Requirement: GET /api/properties SHALL support filter query parameters

The endpoint SHALL accept query parameters: `region` (county id), `district` (district id), `priceMin`, `priceMax`, `rooms` (min rooms), `type` (building type), `sizeMin`, `sizeMax`, `ageMax`, `page`, `limit`.

#### Scenario: Filters are passed to upstream API
- **WHEN** a GET request includes filter query parameters
- **THEN** the bridge SHALL forward the filters to the existing agent API
- **AND** return only matching results

### Requirement: API bridge SHALL handle upstream errors gracefully

If the upstream agent API is unreachable or returns an error, the bridge SHALL return HTTP 503 with a descriptive error message instead of crashing.

#### Scenario: Upstream API down
- **WHEN** the upstream agent API returns an error or times out
- **THEN** the bridge SHALL return HTTP 503 with `{"error": "UPSTREAM_UNAVAILABLE", "message": "..."}`
