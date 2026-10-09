## ADDED Requirements

### Requirement: World mutations use the authenticated canonical principal

The system MUST derive the world actor from one live canonical session. World command payloads MUST NOT select an account, position, geometry, movement step, currency, or reward. Mutations MUST include the expected-account assertion and be re-authorized when queued work is committed.

#### Scenario: A client forges actor or coordinates
- **GIVEN** a valid canonical session
- **WHEN** a world command includes a different actor or client-authored position
- **THEN** the request MUST be rejected without appending an EventLog fact

#### Scenario: The shared cookie changes before a queued command commits
- **GIVEN** a command was queued for one account
- **WHEN** the session resolves to another account at commit time
- **THEN** the command MUST be rejected and neither account's position may change

### Requirement: Accepted player positions are durable canonical events

The system MUST compile entry, movement, and region transitions through the typed living-world rule engine and persist each accepted position in the existing append-only EventLog. Position projection MUST be rebuilt from persisted events after restart. Repeating the same account-scoped command ID and content MUST return the original acknowledgement without creating another fact; reusing that ID with different content MUST be rejected.

#### Scenario: A move is accepted
- **GIVEN** a player has entered an available region
- **WHEN** the server accepts a movement intent
- **THEN** the EventLog MUST contain the resulting server-computed position and movement step

#### Scenario: A committed position survives restart
- **GIVEN** accepted position events exist in the canonical EventLog
- **WHEN** the player-world service is reconstructed
- **THEN** each player MUST resume from the latest persisted position

### Requirement: Movement and crossing obey server-owned map geometry

The system MUST enforce world bounds, obstacle clearance, movement rate limits, available graph edges, and server-defined portals. Locked regions and regions without authored collision geometry MUST fail closed.

#### Scenario: A player approaches a wall
- **GIVEN** a valid position beside a blocking obstacle
- **WHEN** the player submits a move into the obstacle
- **THEN** the server MUST preserve collision clearance and MUST NOT trust a client position

#### Scenario: A player crosses a locked or unsupported frontier
- **GIVEN** the destination is locked, not adjacent, or lacks supported geometry
- **WHEN** the player requests a transition
- **THEN** the transition MUST be rejected without changing the player's region

### Requirement: Online admission and transport resources are bounded

The system MUST admit at most 50 distinct online accounts at once. Multiple tabs for the same account MUST count as one account. The HTTP transport MUST bound streams per account and globally, pending commands, snapshot frame size, and slow-client buffering.

#### Scenario: The fifty-first account requests admission
- **GIVEN** 50 distinct accounts are online
- **WHEN** another distinct account requests admission
- **THEN** admission MUST be rejected while an additional tab for an admitted account may remain connected

#### Scenario: A stream stops draining
- **GIVEN** a world stream has one snapshot pending
- **WHEN** the client exceeds the bounded drain interval
- **THEN** the stream MUST close without accumulating an unbounded queue

### Requirement: Public chat is one world-wide server-authoritative channel

The system MUST store public chat as a typed canonical EventLog fact. The server MUST derive the sender account, current region, and public display name. It MUST enforce message bounds and the chat cooldown, return only the newest 100 public messages in snapshots, and exclude private NPC dialogue.

#### Scenario: Two players in different regions exchange a message
- **GIVEN** two admitted accounts are in different available regions
- **WHEN** one account posts a valid world message
- **THEN** the other account MUST see the same public message with the server-derived sender and region

#### Scenario: A client attempts to inject private or forged chat data
- **GIVEN** an authenticated player submits a chat intent
- **WHEN** the payload includes another account, region, display name, or private NPC dialogue
- **THEN** the server MUST reject forged fields and MUST NOT include private NPC dialogue in public chat

#### Scenario: A message retry follows a lost acknowledgement
- **GIVEN** a chat event was committed but its acknowledgement was lost
- **WHEN** the same account retries the same command ID and text
- **THEN** the original acknowledgement MUST be returned and no duplicate public message may appear