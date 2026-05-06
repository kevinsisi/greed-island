// Copy non-TypeScript data assets (JSON catalogs, NPC profiles) from
// src/ to dist/ after `tsc` runs. tsc does not copy non-source files,
// and the runtime loaders resolve these paths relative to the
// compiled module location.

import { promises as fs } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = resolve(HERE, '..', 'src')
const DIST_ROOT = resolve(HERE, '..', 'dist')

async function copyMatching(srcDir, distDir, matcher) {
  let entries
  try {
    entries = await fs.readdir(srcDir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return
    throw err
  }
  for (const entry of entries) {
    const srcPath = resolve(srcDir, entry.name)
    const distPath = resolve(distDir, entry.name)
    if (entry.isDirectory()) {
      await copyMatching(srcPath, distPath, matcher)
    } else if (matcher(entry.name)) {
      await fs.mkdir(dirname(distPath), { recursive: true })
      await fs.copyFile(srcPath, distPath)
    }
  }
}

async function main() {
  await copyMatching(SRC_ROOT, DIST_ROOT, (name) => name.endsWith('.json'))
  console.log('copied data assets to dist/')
}

main().catch((err) => {
  console.error('copy-data-assets failed:', err)
  process.exit(1)
})
