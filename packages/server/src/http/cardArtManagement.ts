// Bounded management of known game art. Existing art is archived, never erased.
import { randomUUID } from 'node:crypto'
import { constants, closeSync, openSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const MAX_CARD_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_CARD_ART_HISTORY_FILES = 1_000
export const MAX_CARD_ART_HISTORY_BYTES = 100 * 1024 * 1024
const EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg'] as const
export type CardArtExtension = typeof EXTENSIONS[number]
export class CardArtError extends Error { constructor(readonly code: string, readonly status: number) { super(code) } }

export function parseCardId(value: string): number | null {
  return /^([1-9][0-9]?|100)$/.test(value) ? Number(value) : null
}
export function decodeCardImage(base64: unknown, mimeType: unknown): { bytes: Buffer; extension: CardArtExtension } {
  if (typeof base64 !== 'string' || base64.length === 0) throw new CardArtError('MISSING_IMAGE', 400)
  if (base64.length > Math.ceil(MAX_CARD_IMAGE_BYTES / 3) * 4) throw new CardArtError('IMAGE_TOO_LARGE', 413)
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new CardArtError('INVALID_BASE64', 400)
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.toString('base64') !== base64) throw new CardArtError('INVALID_BASE64', 400)
  if (bytes.length > MAX_CARD_IMAGE_BYTES) throw new CardArtError('IMAGE_TOO_LARGE', 413)
  const extension: CardArtExtension = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'jpg' : mimeType === 'image/webp' || mimeType === undefined || mimeType === '' ? 'webp' : (() => { throw new CardArtError('INVALID_MIME_TYPE', 400) })()
  const valid = bytes.length >= 12 && (extension === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : extension === 'webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
  if (!valid) throw new CardArtError('INVALID_IMAGE', 400)
  return { bytes, extension }
}

function checkedDirectory(path: string, create: boolean): void {
  if (!existsSync(path)) {
    // existsSync follows symlinks; lstat catches a dangling link too.
    try { if (lstatSync(path).isSymbolicLink()) throw new CardArtError('STORAGE_UNSAFE', 409) }
    catch (error) { if (error instanceof CardArtError) throw error }
    if (!create) return
    mkdirSync(path)
  }
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== resolve(path)) throw new CardArtError('STORAGE_UNSAFE', 409)
}
function locations(dataDir: string, create: boolean): { images: string; history: string } {
  checkedDirectory(resolve(dataDir), false)
  if (!existsSync(dataDir)) throw new CardArtError('STORAGE_UNSAFE', 409)
  const images = join(resolve(dataDir), 'card-images')
  checkedDirectory(images, create)
  const assets = join(resolve(dataDir), 'assets'); checkedDirectory(assets, create)
  const historyRoot = join(assets, 'history'); checkedDirectory(historyRoot, create)
  const history = join(historyRoot, 'card-images'); checkedDirectory(history, create)
  return { images, history }
}
function currentFiles(images: string, id: number): string[] {
  if (!existsSync(images)) return []
  return EXTENSIONS.flatMap(extension => {
    const path = join(images, `${id}.${extension}`)
    let stat
    try { stat = lstatSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_CARD_IMAGE_BYTES) throw new CardArtError('STORAGE_UNSAFE', 409)
    return [path]
  })
}
function ensureArchiveCapacity(history: string, files: readonly string[]): void {
  if (files.length === 0) return
  const existing = existsSync(history) ? readdirSync(history) : []
  if (existing.length + files.length > MAX_CARD_ART_HISTORY_FILES) throw new CardArtError('HISTORY_FULL', 409)
  let bytes = 0
  for (const name of existing) {
    if (!/^([1-9][0-9]?|100)-[0-9a-f-]{36}\.(webp|png|jpg|jpeg)$/.test(name)) throw new CardArtError('STORAGE_UNSAFE', 409)
    const stat = lstatSync(join(history, name))
    if (!stat.isFile() || stat.isSymbolicLink()) throw new CardArtError('STORAGE_UNSAFE', 409)
    bytes += stat.size
  }
  for (const path of files) bytes += lstatSync(path).size
  if (bytes > MAX_CARD_ART_HISTORY_BYTES) throw new CardArtError('HISTORY_FULL', 409)
}
function archive(files: readonly string[], history: string, id: number): Array<{ source: string; archived: string }> {
  const moved: Array<{ source: string; archived: string }> = []
  try {
    for (const source of files) {
      const extension = source.slice(source.lastIndexOf('.') + 1)
      const archived = join(history, `${id}-${randomUUID()}.${extension}`)
      renameSync(source, archived)
      moved.push({ source, archived })
    }
    return moved
  } catch (error) {
    restore(moved)
    throw error
  }
}
function restore(moved: readonly { source: string; archived: string }[]): void {
  for (const file of [...moved].reverse()) renameSync(file.archived, file.source)
}
/** Caller reauthorizes immediately before entering this synchronous commit. */
export function replaceCardArt(dataDir: string, id: number, bytes: Buffer, extension: CardArtExtension): string {
  if (parseCardId(String(id)) === null || !EXTENSIONS.includes(extension) || bytes.length > MAX_CARD_IMAGE_BYTES) throw new CardArtError('INVALID_IMAGE', 400)
  const checked = locations(dataDir, false), files = currentFiles(checked.images, id)
  ensureArchiveCapacity(checked.history, files)
  const { images, history } = locations(dataDir, true)
  const staged = join(images, `.upload-${randomUUID()}`)
  // No followed symlink, truncated existing file or client-selected path.
  try {
    const descriptor = openSync(staged, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600)
    try { writeFileSync(descriptor, bytes) } finally { closeSync(descriptor) }
    const moved = archive(files, history, id)
    try { renameSync(staged, join(images, `${id}.${extension}`)) }
    catch (error) { restore(moved); throw error }
  } finally {
    // Only this request's newly-created unpublished staging file is removed.
    // Archived/current historical art is never deleted.
    if (existsSync(staged)) unlinkSync(staged)
  }
  return `/card-images/${id}.${extension}`
}
/** DELETE removes the public mapping by archiving every prior extension. */
export function archiveCardArt(dataDir: string, id: number): boolean {
  if (parseCardId(String(id)) === null) throw new CardArtError('INVALID_ID', 400)
  const checked = locations(dataDir, false), files = currentFiles(checked.images, id)
  if (!files.length) return false
  ensureArchiveCapacity(checked.history, files)
  const { history } = locations(dataDir, true)
  archive(files, history, id)
  return true
}
