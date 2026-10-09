import { createHash } from 'node:crypto'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import type { Command, EventDraft } from '../kernel/types.js'

export const LEGACY_ARCHIVE_EVENT_TYPE = 'LEGACY_WORLD_PRIVATE_ARCHIVE_V1'
export const LEGACY_ARCHIVE_ACTOR = 'system.staged-legacy-import'
export const LEGACY_ARCHIVE_RULESET = 'legacy-world-private-archive@1'
export type LegacyArchiveCommand = Command<Readonly<{ namespace: string; sourceDigest: string; planDigest: string; kind: 'source-event-batch' | 'exact-progress'; batchIndex: number; data: unknown }>>
/** Pure command→event compiler. No gameplay conversions, source credentials, or role grants. */
export function evaluateLegacyArchiveCommand(command: LegacyArchiveCommand): EventDraft {
  const payload = command.payload
  if (command.commandType !== 'PRESERVE_LEGACY_WORLD_PRIVATE' || command.actorId !== LEGACY_ARCHIVE_ACTOR
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(payload.namespace) || !/^[a-f0-9]{64}$/.test(payload.sourceDigest)
    || !/^[a-f0-9]{64}$/.test(payload.planDigest) || !Number.isSafeInteger(payload.batchIndex) || payload.batchIndex < 0
    || !['source-event-batch','exact-progress'].includes(payload.kind)) throw new Error('Invalid reviewed private archive intent.')
  const deterministicKey = createHash('sha256').update(toCanonicalJson({ eventType: LEGACY_ARCHIVE_EVENT_TYPE, actorId: command.actorId,
    payload, version: 1, rulesetVersion: LEGACY_ARCHIVE_RULESET })).digest('hex')
  return { eventId: `legacy_archive_${deterministicKey}`, eventType: LEGACY_ARCHIVE_EVENT_TYPE, actorId: command.actorId,
    commandId: command.commandId, occurredAt: command.submittedAt, payload, version: 1, rulesetVersion: LEGACY_ARCHIVE_RULESET, deterministicKey }
}
