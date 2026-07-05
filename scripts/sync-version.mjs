#!/usr/bin/env node
/**
 * Reads version from root package.json and writes it to:
 *   - packages/server/src/version.ts  (read by /healthz)
 *   - packages/web/src/version.ts     (rendered in UI shell)
 *   - packages/server/package.json
 *   - packages/web/package.json
 *
 * Run: node scripts/sync-version.mjs
 * Or via npm: npm run version:sync
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { version } = rootPkg

// 1. packages/server/src/version.ts
const serverVersionTsPath = join(root, 'packages/server/src/version.ts')
writeFileSync(serverVersionTsPath, `export const APP_VERSION = '${version}'\n`)

// 2. packages/web/src/version.ts
const webVersionTsPath = join(root, 'packages/web/src/version.ts')
writeFileSync(webVersionTsPath, `export const APP_VERSION = '${version}'\n`)

// 3. packages/server/package.json
const serverPkgPath = join(root, 'packages/server/package.json')
const serverPkg = JSON.parse(readFileSync(serverPkgPath, 'utf8'))
if (serverPkg.version !== version) {
  serverPkg.version = version
  writeFileSync(serverPkgPath, JSON.stringify(serverPkg, null, 2) + '\n')
}

// 4. packages/web/package.json
const webPkgPath = join(root, 'packages/web/package.json')
const webPkg = JSON.parse(readFileSync(webPkgPath, 'utf8'))
if (webPkg.version !== version) {
  webPkg.version = version
  writeFileSync(webPkgPath, JSON.stringify(webPkg, null, 2) + '\n')
}

console.log(`version synced: ${version}`)
