## ADDED Requirements

### Requirement: Frontend is a read-only observation client in v1 except for account self-service
The frontend SHALL be implemented as a read-only observation client for world state. The only write operations permitted in v1 are account-related self-service actions (register, log in, log out, change password, manage own profile) and GM/Admin tooling actions described in `accounts-and-permissions`. Player gameplay commands (move, trade, fight) MUST NOT be exposed in v1 and are deferred to a follow-up change.

#### Scenario: No gameplay write API is exposed
- **WHEN** the frontend communicates with the server in v1 for world data
- **THEN** every world-data request MUST use a read-only HTTP method or an SSE subscription, and the frontend bundle MUST NOT contain a player gameplay command-submission UI

### Requirement: Frontend stack matches HomeProject standard
The frontend SHALL be built with React + TypeScript + Vite + Tailwind CSS. It MUST NOT introduce a different framework or styling system in v1.

#### Scenario: Stack is verifiable
- **WHEN** the project is inspected
- **THEN** `packages/web/package.json` MUST declare React, TypeScript, Vite, and Tailwind CSS as dependencies, and `vite.config.ts` MUST be present

### Requirement: Frontend renders the canonical observation views
The frontend SHALL render at least these views: world dashboard, world map, NPC roster, event feed, and card collection.

#### Scenario: All canonical views are reachable
- **WHEN** a user navigates the frontend in a browser
- **THEN** the user MUST be able to reach world dashboard, world map, NPC roster, event feed, and card collection views from the app shell

### Requirement: Event feed is updated by Server-Sent Events
The frontend SHALL subscribe to `/api/events/stream` via Server-Sent Events and update the event feed live as new events are committed by the kernel.

#### Scenario: Live tick updates appear without page reload
- **WHEN** the kernel commits new events while the frontend is open
- **THEN** the event feed MUST render those events without requiring a manual page refresh

### Requirement: UI is bilingual (Traditional Chinese + English) with a toggle
The frontend SHALL ship with both Traditional Chinese (繁體中文) and English copy and a visible language toggle in the app shell. The default locale on first load MUST be Traditional Chinese; the user's choice MUST persist in `localStorage` and survive reload. All user-visible strings MUST go through a single i18n layer; hard-coded copy in components is forbidden.

#### Scenario: Default locale is Traditional Chinese
- **WHEN** a user opens the site for the first time with no stored language preference
- **THEN** the UI MUST render in Traditional Chinese

#### Scenario: Language toggle persists across reloads
- **WHEN** a user switches the language to English and reloads the page
- **THEN** the UI MUST render in English without requiring the toggle to be touched again

#### Scenario: No hard-coded UI copy in components
- **WHEN** the frontend codebase is inspected for UI strings
- **THEN** every user-visible string MUST be resolved through the i18n layer; component files MUST NOT contain literal Traditional Chinese or English UI copy outside that layer

### Requirement: UI is mobile-friendly with usable touch targets
The frontend SHALL be usable on mobile viewports. Touch targets MUST be at least 44 px in the smallest dimension on mobile layouts.

#### Scenario: Mobile layout is functional
- **WHEN** the frontend is loaded on a viewport of 375 × 667 pixels
- **THEN** primary navigation, event feed, and card grid MUST be usable without horizontal scrolling

### Requirement: Mobile is fully functional, not a feature-cut subset
The frontend SHALL be implemented as a single responsive React + Tailwind codebase where mobile and desktop expose the **same set of features**. The mobile presentation MAY simplify information density, collapse secondary panels behind drawers or sheets, and prefer single-column layouts, but it MUST NOT remove features that are present on desktop.

#### Scenario: Every desktop feature is reachable on mobile
- **WHEN** a feature is accessible on the desktop surface
- **THEN** the same feature MUST be accessible on the mobile surface, even if the entry point or layout differs

#### Scenario: Codebase is shared
- **WHEN** the project is inspected
- **THEN** mobile and desktop MUST be served from the same React + Vite + Tailwind codebase, not from two separate frontend bundles

### Requirement: Mobile and desktop surfaces optimize for different intents
The frontend SHALL provide a mobile default landing surface optimized for short check-in sessions and a desktop default landing surface optimized for long immersive sessions. The differentiation is in *default surfacing and information density*, not in *available features*.

The mobile default surface MUST prioritize: world status at a glance, a "since you last visited" feed, a touch-friendly event feed scrolled like a social-media timeline, one-tap entry to common interactions, and deep links from outbound notifications.

The desktop default surface MUST prioritize: a full pan-and-zoom world map, multi-pane dashboards with side-by-side context, deep multi-turn NPC dialogue surfaces (when introduced), and dense lore / world-history reading views.

#### Scenario: Default landing is intent-appropriate
- **WHEN** a user opens the site on a typical mobile device
- **THEN** the default landing experience MUST be the quick-check surface, not a downscaled desktop dashboard

#### Scenario: Desktop default is the deep-immersion surface
- **WHEN** a user opens the site on a desktop browser
- **THEN** the default landing experience MUST be the deep-immersion surface, not the mobile quick-check feed

#### Scenario: User can override device-tier default
- **WHEN** a user explicitly chooses the alternative surface (e.g. a desktop user requests the lite view, or a tablet user requests the deep view)
- **THEN** the frontend MUST honor that choice and persist the preference for the session

### Requirement: Frontend surfaces "since you last visited"
The frontend SHALL compute and render a "since you last visited" view that summarizes events committed since the user's last recorded visit tick. This view MUST be reachable from both the mobile and desktop surfaces.

#### Scenario: Returning user sees what they missed
- **WHEN** a user opens the frontend after one or more ticks have committed since their previous session
- **THEN** the frontend MUST display the events committed in the interval, ordered most-recent-first, with relative time and tick number labels

### Requirement: Visual tone avoids generic AI aesthetics
The frontend SHALL adopt a distinct visual tone with one accent color, intentional typography, and no purple-to-blue gradient as the primary theme.

#### Scenario: Default theme is intentional
- **WHEN** the frontend is reviewed against `frontend-design`
- **THEN** the theme MUST commit to a single accent color and MUST NOT use the generic purple-blue gradient + rounded-card aesthetic as its identity
