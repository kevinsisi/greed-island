## ADDED Requirements

### Requirement: Animals SHALL render as behaving pixel actors

For each species row of the tile's `AreaEcologyView` with ≤5 individuals, AreaScene MUST spawn one `AnimalActor` per animal id: a species-tinted two-frame pixel sprite (archetype quadruped/bird/fish/crab/serpent) with a name label, hunt-on-tap, and a display-layer behavior loop — wander steps with facing flips, grazing bob while idle, fleeing away from the player within 72px for non-predators, and slow stalking toward the player for predator species. Movement MUST respect scene walkability (no open water/blocked/building cells) and canvas bounds. Actors MUST be destroyed on overlay redraw and scene shutdown.

#### Scenario: Prey flees an approaching player

- **GIVEN** a forest_deer actor and the player moving within 72px
- **WHEN** the actor's behavior poll fires
- **THEN** the deer MUST move away from the player faster than its wander speed

#### Scenario: Predator stalks

- **GIVEN** a fog_wolf actor with the player between 56px and 200px away
- **WHEN** the behavior poll fires
- **THEN** the wolf MUST take a small step toward the player and stop closing inside 56px

### Requirement: The scene SHALL host ambient life

AreaScene MUST run an ambient life layer: birds flying across the upper canvas every few seconds (two-frame flap), two wandering butterflies, and falling leaves on forest-feel tiles — all procedural textures, disposed on scene shutdown.

#### Scenario: Ambient life is cleaned up

- **GIVEN** an active area scene with ambient life running
- **WHEN** the scene shuts down
- **THEN** all ambient timers and sprites MUST be destroyed
