import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { assertValidCatalog, type CardCatalog } from './types.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CATALOG_PATH = resolve(HERE, 'catalog.json')

export function loadCardCatalog(path: string = DEFAULT_CATALOG_PATH): CardCatalog {
  const raw = readFileSync(path, 'utf-8')
  const parsed = JSON.parse(raw) as CardCatalog
  assertValidCatalog(parsed)
  return parsed
}
