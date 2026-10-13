#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const USAGE = 'Usage: import-l390-legacy-room.mjs <inspect|plan|apply|verify> --source <directory> --namespace <id> (--canonical-db <existing-or-new-path> | --canonical <new-path>) [--dry-run] [--owner-selection none|<json-or-legacyId>] [--owner-selection-index <n>] [--activate-accounts] [--plan-file <path>] [--canonical-volume <name> --legacy-volume <name> ... --receipt-output <path>]'

function parseArguments(args) {
  const command = args[0]
  const options = {}
  for (let index = 1; index < args.length; index += 1) {
    const key = args[index]
    if (key === '--dry-run') { options.dryRun = true; continue }
    if (key === '--activate-accounts') { options.activateAccounts = true; continue }
    if (!['--source', '--namespace', '--canonical-db', '--canonical', '--owner-selection', '--owner-selection-index', '--reviewed-links-file',
      '--plan-file', '--receipt-output', '--canonical-volume', '--legacy-volume'].includes(key)) {
      throw new Error('INVALID_ARGUMENT')
    }
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error('ARGUMENT_VALUE_REQUIRED')
    if (Object.hasOwn(options, key) && key !== '--legacy-volume') throw new Error('DUPLICATE_ARGUMENT')
    if (key === '--legacy-volume') (options[key] ??= []).push(value)
    else options[key] = value
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

function readReviewPlan(path) {
  let plan
  try { plan = JSON.parse(readFileSync(resolve(path), 'utf8')) } catch { throw new Error('REVIEW_PLAN_FILE_INVALID') }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('REVIEW_PLAN_FILE_INVALID')
  return plan
}

function assertOutputIsSeparate(canonicalPath, sourceDirectory, planPath, receiptPath) {
  const source = resolve(sourceDirectory), canonical = resolve(canonicalPath)
  if (canonical === resolve(source, 'accounts.json') || canonical === resolve(source, 'room.sqlite') || canonical.startsWith(source + '/')) {
    throw new Error('CANONICAL_PATH_NOT_SEPARATE')
  }
  if (planPath && canonical === resolve(planPath)) throw new Error('CANONICAL_PATH_CONFLICTS_WITH_PLAN')
  if (receiptPath) {
    const receipt = resolve(receiptPath)
    if ([canonical, ...(planPath ? [resolve(planPath)] : []), resolve(source, 'accounts.json'), resolve(source, 'room.sqlite')].includes(receipt)
      || receipt.startsWith(source + '/')) throw new Error('RECEIPT_PATH_CONFLICT')
  }
}

function writeVerifiedReceipt(path, receipt) {
  const body = `${JSON.stringify(receipt, null, 2)}\n`, output = resolve(path)
  if (existsSync(output)) {
    if (readFileSync(output, 'utf8') !== body) throw new Error('RECEIPT_TARGET_EXISTS')
    return false
  }
  writeFileSync(output, body, { flag: 'wx', mode: 0o600 })
  return true
}

export async function runL390LegacyImportCli(args = process.argv.slice(2)) {
  const { command, options } = parseArguments(args)
  if (!options['--source'] || !options['--namespace']) throw new Error('SOURCE_AND_NAMESPACE_REQUIRED')
  const canonicalPath = options['--canonical'] ?? options['--canonical-db']
  if (!canonicalPath) throw new Error('CANONICAL_PATH_REQUIRED')
  const input = {
    sourceDirectory: resolve(options['--source']),
    namespace: options['--namespace'],
    canonicalDatabasePath: resolve(canonicalPath),
    ...(options['--reviewed-links-file'] ? { reviewedLinks: JSON.parse(readFileSync(resolve(options['--reviewed-links-file']), 'utf8')) } : {}),
    ...(command === 'plan' && options['--owner-selection'] !== 'none'
      ? { ownerSelection: parseOwnerSelection(options['--owner-selection']) }
      : {}),
  }
  let report
  if (command === 'inspect' || command === 'plan') {
    if (command === 'plan' && !options['--owner-selection']) throw new Error('OWNER_SELECTION_ARGUMENT_REQUIRED_USE_NONE_EXPLICITLY')
    const { inspectL390LegacySource, planL390LegacyImport } = await import('../packages/server/dist/migration/l390LegacyReview.js')
    report = command === 'inspect' ? inspectL390LegacySource(input) : planL390LegacyImport(input)
  } else {
    if (!options['--plan-file']) throw new Error('PLAN_FILE_REQUIRED')
    const plan = readReviewPlan(options['--plan-file'])
    const canonicalPathResolved = resolve(canonicalPath)
    assertOutputIsSeparate(canonicalPathResolved, input.sourceDirectory, options['--plan-file'], options['--receipt-output'])
    const { applyL390LegacyImport, verifyL390LegacyImport } = await import('../packages/server/dist/migration/l390LegacyApply.js')
    if (command === 'apply') {
      if (!options.activateAccounts) throw new Error('ACTIVATE_ACCOUNTS_FLAG_REQUIRED')
      const ownerId = options['--owner-selection']
      const rawIndex = options['--owner-selection-index']
      if (!!ownerId === !!rawIndex) throw new Error('EXACTLY_ONE_OWNER_SELECTION_REQUIRED')
      const ownerSelectionIndex = rawIndex === undefined ? undefined : Number(rawIndex)
      if (ownerSelectionIndex !== undefined && (!Number.isSafeInteger(ownerSelectionIndex) || ownerSelectionIndex < 0)) {
        throw new Error('OWNER_SELECTION_INDEX_INVALID')
      }
      report = await applyL390LegacyImport({ sourceDirectory: input.sourceDirectory, namespace: input.namespace,
        canonicalPath: canonicalPathResolved, reviewPlan: plan, activateAccounts: true,
        ...(ownerId !== undefined ? { ownerLegacyId: ownerId } : { ownerSelectionIndex }) })
    } else {
      if (!options['--receipt-output'] || !options['--canonical-volume'] || !options['--legacy-volume']?.length) {
        throw new Error('VERIFY_RECEIPT_AND_VOLUME_ARGUMENTS_REQUIRED')
      }
      report = verifyL390LegacyImport({ sourceDirectory: input.sourceDirectory, namespace: input.namespace,
        canonicalPath: canonicalPathResolved, reviewPlan: plan, canonicalVolume: options['--canonical-volume'], legacyVolumes: options['--legacy-volume'] })
      report = { ...report, receiptWritten: writeVerifiedReceipt(options['--receipt-output'], report.receipt) }
    }
  }
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
