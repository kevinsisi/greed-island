import type { SqliteEventStore } from './eventStore.js'
import { reduceEventLog } from './reducer.js'
import type { KernelRuleEngine } from './ruleEngine.js'
import type { Command, Event, EventDraft, RuleResult } from './types.js'

export type ProcessCommandOptions = Readonly<{
  auditRejections?: boolean
  rulesetVersion?: string
}>

export type ProcessCommandResult = Readonly<{
  ruleResult: RuleResult
  committedEvents: readonly Event[]
}>

export type EventDraftBatch = Readonly<{
  sortKey: string
  events: readonly EventDraft[]
}>

export function processCommand(
  command: Command,
  ruleEngine: KernelRuleEngine,
  eventStore: SqliteEventStore,
  options: ProcessCommandOptions = {}
): ProcessCommandResult {
  const worldState = reduceEventLog(eventStore.readEvents())
  const ruleResult = ruleEngine.evaluate(command, {
    worldState,
    ...(options.rulesetVersion === undefined ? {} : { rulesetVersion: options.rulesetVersion })
  })

  if (!ruleResult.accepted) {
    if (options.auditRejections ?? true) {
      eventStore.recordRejectedCommand(command, ruleResult.rejection)
    }
    return { ruleResult, committedEvents: [] }
  }

  return {
    ruleResult,
    committedEvents: commitEventBatch(eventStore, ruleResult.events)
  }
}

export function commitEventBatch(eventStore: SqliteEventStore, drafts: readonly EventDraft[]): Event[] {
  return eventStore.appendEvents(drafts)
}

export function commitEventBatchesInDeterministicOrder(
  eventStore: SqliteEventStore,
  batches: readonly EventDraftBatch[]
): Event[] {
  assertUniqueBatchSortKeys(batches)
  const orderedDrafts = [...batches]
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .flatMap((batch) => [...batch.events])
  return commitEventBatch(eventStore, orderedDrafts)
}

function assertUniqueBatchSortKeys(batches: readonly EventDraftBatch[]): void {
  const seen = new Set<string>()
  for (const batch of batches) {
    if (seen.has(batch.sortKey)) {
      throw new Error(`Duplicate deterministic event batch sort key: ${batch.sortKey}`)
    }
    seen.add(batch.sortKey)
  }
}
