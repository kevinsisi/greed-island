// Read-only public game art. No directory creation, upload, external URL or arbitrary file serving.
import { lstatSync, realpathSync, openSync, readSync, closeSync, fstatSync, constants } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { Router } from 'express'
const TYPES: Readonly<Record<string, string>> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
const MAX_ART_BYTES = 5 * 1024 * 1024
function inside(base: string, target: string): boolean { const path = relative(base, target); return path !== '..' && !path.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(path) }
export function findCardArt(dataDir: string, id: number, onlyExtension?: string, includeBytes = false): { imageUrl: string; contentType: string; bytes?: Buffer } | null {
  if (!Number.isSafeInteger(id) || id < 1 || id > 100 || (onlyExtension !== undefined && !(onlyExtension in TYPES))) return null
  try {
    if (!lstatSync(dataDir).isDirectory() || lstatSync(dataDir).isSymbolicLink()) return null
    if (!lstatSync(join(dataDir, 'card-images')).isDirectory() || lstatSync(join(dataDir, 'card-images')).isSymbolicLink()) return null
    const base = realpathSync(dataDir), directory = realpathSync(join(base, 'card-images'))
    if (!inside(base, directory)) return null
    for (const extension of onlyExtension ? [onlyExtension] : ['webp','png','jpg','jpeg']) {
      const candidate = join(directory, `${id}.${extension}`)
      let fd: number | undefined
      try {
        const stat = lstatSync(candidate)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 12 || stat.size > MAX_ART_BYTES) continue
        const path = realpathSync(candidate); if (!inside(directory, path)) continue
        fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        const opened = fstatSync(fd)
        if (!opened.isFile() || opened.size < 12 || opened.size > MAX_ART_BYTES) continue
        const head = Buffer.alloc(12); readSync(fd, head, 0, 12, 0)
        const matches = extension === 'png' ? head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : extension === 'webp' ? head.toString('ascii',0,4) === 'RIFF' && head.toString('ascii',8,12) === 'WEBP'
          : head[0] === 255 && head[1] === 216 && head[2] === 255
        if (matches) {
          // Read the verified descriptor, never reopen a path at send time.
          // A concurrent replacement cannot make sendFile serve a private file.
          const bytes = includeBytes ? Buffer.alloc(opened.size) : undefined
          if (bytes && readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) continue
          return { imageUrl: `/card-images/${id}.${extension}`, contentType: TYPES[extension]!, ...(bytes ? { bytes } : {}) }
        }
      } catch { /* Missing/invalid art remains unavailable, never a guessed file. */ }
      finally { if (fd !== undefined) closeSync(fd) }
    }
  } catch { /* No approved existing art directory. */ }
  return null
}
export function createCardArtRouter(dataDir: string): Router {
  const router = Router()
  router.get('/card-images/:name', (req, res) => {
    const match = /^([1-9][0-9]?|100)\.(webp|png|jpg|jpeg)$/.exec(req.params.name ?? '')
    const file = match ? findCardArt(dataDir, Number(match[1]), match[2], true) : null
    if (!file) { res.status(404).json({ error: 'NOT_FOUND' }); return }
    res.setHeader('Content-Type', file.contentType); res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('Content-Disposition', `inline; filename="${req.params.name}"`); res.setHeader('Cache-Control','public, max-age=60')
    res.send(file.bytes)
  })
  return router
}
