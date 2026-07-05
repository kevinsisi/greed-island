## 1. Backend — API Bridge

- [x] 1.1 Create `/api/properties` route with proxy to existing agent API
- [x] 1.2 Implement response normalisation (unified listing schema)
- [x] 1.3 Support filter query parameters (region, priceMin/Max, rooms, type, sizeMin/Max, ageMax, page, limit)
- [x] 1.4 Handle upstream errors gracefully (HTTP 503 with descriptive message)
- [ ] 1.5 Write integration tests for the API bridge

## 2. Backend — Account Role Extension

- [x] 2.1 Add `'agent'` to `AccountRole` type and `ACCOUNT_ROLES` array
- [x] 2.2 Update `isAccountRole()` and migration logic in `accounts.ts`
- [ ] 2.3 Add initialisation migration for existing `accounts` table

## 3. Frontend — Property Browser Page

- [x] 3.1 Install leaflet, react-leaflet, @types/leaflet
- [x] 3.2 Create `PropertyBrowserPage.tsx` with Leaflet map (Taiwan center, OSM tiles)
- [x] 3.3 Implement property markers with Leaflet markers
- [x] 3.4 Implement marker popup with property summary (photo, price, address, layout, size, contact)
- [x] 3.5 Implement filter modal (region, price, rooms, type, size, age)
- [x] 3.6 Wire filter changes to API bridge and update markers
- [x] 3.7 Register `/properties` route in the SPA router

## 4. Backend — NPC Agent Binding

- [x] 4.1 Create `agent_npc_bindings` table (account_id, npc_id, bound_at)
- [x] 4.2 Create `POST /api/properties/bindings` and `DELETE /api/properties/bindings/:npcId` endpoints
- [x] 4.3 Create `GET /api/properties/bindings` returning bound agent's NPC bindings

## 5. Backend — NPC AI Property Context

- [x] 5.1 Add property listing context block to NPC dialog prompt (for bound NPCs)
- [x] 5.2 Add `PropertyContextRow` type and `buildPropertyBlock()` function to aiDialog.ts
- [x] 5.3 Add AI narration 反幻覺鐵則: AI can only reference injected listings (in buildPropertyBlock)
- [ ] 5.4 Implement actual property data fetch in `getPropertyContext` (MVP returns empty; upstream sync TBD)

## 6. Frontend — Navigation Integration

- [x] 6.1 Add "房產" navigation link to the top nav bar
- [x] 6.2 Ensure nav link highlights when on `/properties`

## 7. Verification

- [x] 7.1 Run `npx tsc --noEmit` (server + web) — passes
- [x] 7.2 Run `npx openspec validate property-browser` — passes
- [ ] 7.3 Run `npm test` and ensure existing tests still pass
- [ ] 7.4 Run `npm run build` and verify full production build
