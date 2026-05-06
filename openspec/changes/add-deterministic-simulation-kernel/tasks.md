## 1. Project Foundation

- [ ] 1.1 Initialize the project workspace using the HomeProject default stack unless a later approved plan changes it.
- [ ] 1.2 Create the backend package structure for the simulation kernel.
- [ ] 1.3 Add TypeScript build and test commands that can be used as concrete verification gates.
- [ ] 1.4 Add SQLite persistence dependencies using `better-sqlite3`.

## 2. Kernel Contracts

- [ ] 2.1 Define Command contract types with command identity, command type, actor identity, submission metadata, and payload.
- [ ] 2.2 Define RuleResult contract types for accepted events and rejected commands.
- [ ] 2.3 Define Event contract types with immutable fact data, sequence ordering metadata, deterministic key, version, and optional simulation metadata.
- [ ] 2.4 Define WorldState and Reducer interfaces that expose projection-only semantics.
- [ ] 2.5 Define AI snapshot input/output interfaces that prevent AI from returning simulation events.

## 3. Event Store

- [ ] 3.1 Create the SQLite `event_log` schema with sequence-first ordering and immutable event fields.
- [ ] 3.2 Implement append-only event persistence in a transaction.
- [ ] 3.3 Implement ordered EventLog reads by sequence.
- [ ] 3.4 Add safeguards so normal kernel APIs cannot update or delete existing events.
- [ ] 3.5 Add optional rejected-command audit storage that is explicitly excluded from WorldState reduction.

## 4. Deterministic Processing

- [ ] 4.1 Implement canonical event serialization for deterministic key generation.
- [ ] 4.2 Implement the Rule Engine entry point that maps Command to RuleResult without mutating WorldState.
- [ ] 4.3 Implement a minimal deterministic rule handler for kernel pipeline validation without adding full gameplay mechanics.
- [ ] 4.4 Implement the pure Reducer over ordered EventLog input.
- [ ] 4.5 Implement AI snapshot generation from EventLog-derived projection data.

## 5. Replay And Boundary Tests

- [ ] 5.1 Add tests proving accepted commands append events and rejected commands append no events.
- [ ] 5.2 Add tests proving rejected-command audit records do not affect WorldState.
- [ ] 5.3 Add tests proving identical EventLog fixtures produce identical WorldState.
- [ ] 5.4 Add tests proving reducer output does not depend on wall-clock timestamps.
- [ ] 5.5 Add tests proving AI receives deterministic snapshot input and cannot create events.
- [ ] 5.6 Add tests proving event sequence ordering is stable under concurrent command submission at the single-writer boundary.

## 6. Verification And Handoff

- [ ] 6.1 Run the concrete build command for the initialized project.
- [ ] 6.2 Run the concrete test command for the kernel test suite.
- [ ] 6.3 Run OpenSpec status/verification for this change.
- [ ] 6.4 Complete the required HomeProject review and completion workflow before commit.
