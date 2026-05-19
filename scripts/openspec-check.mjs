#!/usr/bin/env node
/**
 * Validates every active OpenSpec change that has a formal delta specs/ directory,
 * using --strict mode. Mirrors the CI openspec job exactly so header/format errors
 * surface locally before pushing.
 *
 * Run: npm run openspec:check
 *
 * Requires the openspec CLI: npm install -g @fission-ai/openspec@1.2.0
 */
import { readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const changesDir = join(root, 'openspec/changes')

let failed = false

for (const name of readdirSync(changesDir)) {
  if (name === 'archive') continue
  const dir = join(changesDir, name)
  if (!statSync(dir).isDirectory()) continue
  if (!existsSync(join(dir, 'specs'))) {
    console.log(`skip: ${name} (no formal delta specs)`)
    continue
  }
  console.log(`\nvalidating: ${name}`)
  const result = spawnSync('openspec', ['validate', name, '--strict'], {
    stdio: 'inherit',
    shell: true,
    cwd: root,
  })
  if (result.status !== 0) {
    console.error(`FAILED: ${name}`)
    failed = true
  } else {
    console.log(`ok: ${name}`)
  }
}

if (failed) {
  console.error('\nopenspec:check failed — fix the errors above before pushing')
  process.exit(1)
} else {
  console.log('\nopenspec:check passed')
}
