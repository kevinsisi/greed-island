# property-browser-map Specification

## Purpose

C 端使用者在 Greed Island 平台內瀏覽真實台灣地圖上的房產案件。

## ADDED Requirements

### Requirement: Property browser SHALL display a real Taiwan map with OpenStreetMap tiles

The `/properties` page SHALL render a full-screen Leaflet map centered on Taiwan, using OpenStreetMap tile layer. The map SHALL support standard pan/zoom controls.

#### Scenario: Map renders at /properties
- **WHEN** a user navigates to `/properties`
- **THEN** the page SHALL display a Leaflet map centered on Taiwan
- **AND** the map SHALL use OpenStreetMap tiles
- **AND** the map SHALL support pan and zoom

### Requirement: Property markers SHALL appear on the map for each listing

Each property listing from the API SHALL be displayed as a circular marker on the map at its latitude/longitude coordinates. Markers SHALL cluster when zoomed out using leaflet.markercluster.

#### Scenario: Markers appear for all listings
- **WHEN** the API returns a list of property listings with coordinates
- **THEN** a marker SHALL appear on the map for each listing at its coordinates

#### Scenario: Markers cluster at low zoom levels
- **WHEN** the map zoom level is low (e.g., zoom < 12)
- **THEN** nearby markers SHALL cluster into a single cluster icon showing the count

### Requirement: Clicking a marker SHALL open a popup with property summary

The popup SHALL display: photo thumbnail, price, address, layout (rooms/hall/bath), size (ping), price per ping, and a contact button.

#### Scenario: Marker popup shows property details
- **WHEN** a user clicks a property marker
- **THEN** a popup SHALL appear containing the property's photo, price, address, layout, size, and a contact button

### Requirement: Filter modal SHALL support filtering listings

A filter button SHALL open a modal popup with filter fields: region (county/district), price range, layout (1-4+ rooms), building type, size range, age. Applying filters SHALL update the markers on the map.

#### Scenario: Filters update markers
- **WHEN** a user sets filters and confirms
- **THEN** the map SHALL only show markers for listings matching the filter criteria

### Requirement: Navigation bar SHALL include a "房產" entry

The top navigation bar SHALL include a link to `/properties` labeled "房產", allowing users to switch between game pages and the property browser.

#### Scenario: Navigation link exists
- **WHEN** a user views any page on the platform
- **THEN** the navigation bar SHALL display a "房產" link pointing to `/properties`
