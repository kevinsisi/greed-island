#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const USAGE = 'Usage: import-l390-legacy-room.mjs <inspect|plan|apply|verify> --source <directory> --namespace <id> --canonical-db <path> [--dry-run] [--owner-selection none|<json>] [--reviewed-links-file <path>]'

function parseArguments(args) {
  const command = args[0]
  const options = {}
  for (let index = 1; index < args.length; index += 1) {
    const key = args[index]
    if (key === '--dry-run') { options.dryRun = true; continue }
    if (!['--source', '--namespace', '--canonical-db', '--owner-selection', '--reviewed-links-file'].includes(key)) {
      throw new Error('INVALID_ARGUMENT')
    }
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error('ARGUMENT_VALUE_REQUIRED')
    if (Object.hasOwn(options, key)) throw new Error('DUPLICATE_ARGUMENT')
    options[key] = value
    index += 1
  }
  if (!['inspect', 'plan', 'apply', 'verify'].includes(command)) throw new Error('UNKNOWN_COMMAND')
  return { command, options }
}

function parseOwnerSelection(value) {
  if (value === 'none') return undefined
  let selection
  try { selection = JSON.parse(value) } catch { throw new Error('OWNER_SELECTION_JSON_INVALID') }
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) throw new Error('OWNER_SELECTION_JSON_INVALID')
  return selection
}

export async function runL390LegacyImportCli(args = process.argv.slice(2)) {
  const { command, options } = parseArguments(args)
  // These commands are intentionally unavailable in inspect/plan-only task 4a.
  // TODO(task 4b): implement reviewed apply and post-import verify; never infer authorization here.
  if (command === 'apply' || command === 'verify') throw new Error(`${command.toUpperCase()}_NOT_IMPLEMENTED_TASK_4A`)
  if (!options['--source'] || !options['--namespace'] || !options['--canonical-db']) throw new Error('SOURCE_NAMESPACE_AND_CANONICAL_DB_REQUIRED')
  if (command === 'plan' && !options['--owner-selection']) throw new Error('OWNER_SELECTION_ARGUMENT_REQUIRED_USE_NONE_EXPLICITLY')

  const { inspectL390LegacySource, planL390LegacyImport } = await import('../packages/server/dist/migration/l390LegacyReview.js')
  const input = {
    sourceDirectory: resolve(options['--source']),
    namespace: options['--namespace'],
    canonicalDatabasePath: resolve(options['--canonical-db']),
    ...(options['--reviewed-links-file'] ? { reviewedLinks: JSON.parse(readFileSync(resolve(options['--reviewed-links-file']), 'utf8')) } : {}),
    ...(command === 'plan' && options['--owner-selection'] !== 'none'
      ? { ownerSelection: parseOwnerSelection(options['--owner-selection']) }
      : {}),
  }
  const report = command === 'inspect' ? inspectL390LegacySource(input) : planL390LegacyImport(input)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

function safeErrorCode(error) {
  const message = error instanceof Error ? error.message : ''
  return /^[A-Z0-9_:-]{1,100}$/.test(message) ? message : 'INSPECTION_FAILED'
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runL390LegacyImportCli().catch(error => {
    process.stderr.write(`${JSON.stringify({ error: safeErrorCode(error), usage: USAGE })}\n`)
    process.exitCode = 1
  })
}
