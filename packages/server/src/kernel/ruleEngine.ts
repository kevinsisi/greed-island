import { hashCanonicalJson, toCanonicalJson } from './canonicalJson.js'
import {
  DEFAULT_RULESET_VERSION,
  KERNEL_EVENT_VERSION,
  type Command,
  type EventDraft,
  type FactSetPayload,
  type RuleRejection,
  type RuleResult,
  type WorldState
} from './types.js'

export const COMMAND_SET_FACT = 'SET_FACT'
export const EVENT_FACT_SET = 'FACT_SET'

export type RuleEngineContext = Readonly<{
  worldState: WorldState
  rulesetVersion?: string
}>

export class KernelRuleEngine {
  evaluate(command: Command, context: RuleEngineContext): RuleResult {
    if (command.commandType !== COMMAND_SET_FACT) {
      return reject(command, 'UNKNOWN_COMMAND', `Unknown command type: ${command.commandType}`)
    }

    const payload = parseFactSetPayload(command.payload)
    if (!payload.ok) {
      return reject(command, 'INVALID_PAYLOAD', payload.reason)
    }

    const rulesetVersion = context.rulesetVersion ?? DEFAULT_RULESET_VERSION
    return {
      accepted: true,
      events: [createFactSetEvent(command, payload.value, rulesetVersion)]
    }
  }
}

export function createFactSetEvent(
  command: Command,
  payload: FactSetPayload,
  rulesetVersion = DEFAULT_RULESET_VERSION
): EventDraft<FactSetPayload> {
  const seed = {
    eventType: EVENT_FACT_SET,
    occurredAt: command.submittedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    payload,
    rulesetVersion,
    version: KERNEL_EVENT_VERSION
  }
  const deterministicKey = hashCanonicalJson(seed)

  return {
    ...seed,
    eventId: `event_${deterministicKey.slice(0, 32)}`,
    deterministicKey
  }
}

function parseFactSetPayload(payload: unknown): { ok: true; value: FactSetPayload } | { ok: false; reason: string } {
  if (!isRecord(payload)) {
    return { ok: false, reason: 'Payload must be an object.' }
  }

  const key = payload.key
  if (typeof key !== 'string' || key.length === 0) {
    return { ok: false, reason: 'Payload key must be a non-empty string.' }
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'value')) {
    return { ok: false, reason: 'Payload must include a value field.' }
  }

  try {
    toCanonicalJson(payload.value)
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Payload value is not canonical JSON.'
    }
  }

  return { ok: true, value: { key, value: payload.value } }
}

function reject(command: Command, code: string, reason: string, details?: unknown): RuleResult {
  const rejection: RuleRejection = {
    commandId: command.commandId,
    commandType: command.commandType,
    actorId: command.actorId,
    code,
    reason,
    ...(details === undefined ? {} : { details })
  }
  return { accepted: false, rejection }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
