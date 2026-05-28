// GM card-art management router.
// Endpoints:
//   GET    /admin/cards/images          list all card image states (gm+)
//   PUT    /admin/cards/:id/image       upload image (base64 JSON body) (gm+)
//   DELETE /admin/cards/:id/image       delete image (gm+)

import { Router, type Request, type Response } from 'express'
import { mkdirSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { requireRole, type AuthConfig } from './auth.js'
import type { AccountStore } from './accounts.js'

const SUPPORTED_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

export type AdminCardsRouterInput = Readonly<{
  dataDir: string
  accounts: AccountStore
  authConfig: AuthConfig
}>

function cardImagesDir(dataDir: string): string {
  return resolve(dataDir, 'card-images')
}

function findImageFile(dir: string, id: number): string | null {
  for (const ext of SUPPORTED_EXTENSIONS) {
    const p = resolve(dir, `${id}.${ext}`)
    if (existsSync(p)) return p
  }
  return null
}

function imageUrlForId(id: number, dir: string): string | null {
  for (const ext of SUPPORTED_EXTENSIONS) {
    if (existsSync(resolve(dir, `${id}.${ext}`))) return `/card-images/${id}.${ext}`
  }
  return null
}

export function createAdminCardsRouter(input: AdminCardsRouterInput): Router {
  const router = Router()
  const requireGm = requireRole(input.authConfig, input.accounts, 'gm')
  const imagesDir = cardImagesDir(input.dataDir)

  router.get('/admin/cards/images', requireGm, (_req: Request, res: Response) => {
    mkdirSync(imagesDir, { recursive: true })
    const images: Record<number, string> = {}
    try {
      const files = readdirSync(imagesDir)
      for (const f of files) {
        const match = f.match(/^(\d+)\.(webp|png|jpg|jpeg)$/)
        if (match?.[1]) images[parseInt(match[1], 10)] = `/card-images/${f}`
      }
    } catch {
      // dir empty or not yet created — return empty map
    }
    res.json({ images })
  })

  router.put('/admin/cards/:id/image', requireGm, (req: Request, res: Response) => {
    const id = parseInt(req.params.id ?? '', 10)
    if (!Number.isInteger(id) || id < 1 || id > 100) {
      res.status(400).json({ error: 'INVALID_ID', message: 'card id must be 1–100' })
      return
    }

    const body = req.body as { imageBase64?: unknown; mimeType?: unknown }
    if (typeof body.imageBase64 !== 'string' || !body.imageBase64) {
      res.status(400).json({ error: 'MISSING_IMAGE', message: 'imageBase64 required' })
      return
    }

    let ext = 'webp'
    const mime = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : ''
    if (mime.includes('png')) ext = 'png'
    else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg'

    let imageBuffer: Buffer
    try {
      imageBuffer = Buffer.from(body.imageBase64, 'base64')
    } catch {
      res.status(400).json({ error: 'INVALID_BASE64' })
      return
    }

    if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'IMAGE_TOO_LARGE', message: 'max 5 MB' })
      return
    }

    mkdirSync(imagesDir, { recursive: true })

    // Remove any existing image for this card regardless of extension
    for (const oldExt of SUPPORTED_EXTENSIONS) {
      const old = resolve(imagesDir, `${id}.${oldExt}`)
      if (existsSync(old)) unlinkSync(old)
    }

    const filePath = resolve(imagesDir, `${id}.${ext}`)
    writeFileSync(filePath, imageBuffer)

    res.json({ ok: true, imageUrl: `/card-images/${id}.${ext}` })
  })

  router.delete('/admin/cards/:id/image', requireGm, (req: Request, res: Response) => {
    const id = parseInt(req.params.id ?? '', 10)
    if (!Number.isInteger(id) || id < 1 || id > 100) {
      res.status(400).json({ error: 'INVALID_ID' })
      return
    }

    const existing = findImageFile(imagesDir, id)
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND' })
      return
    }

    unlinkSync(existing)
    res.json({ ok: true })
  })

  return router
}

// Standalone helper used by world.ts to merge imageUrls without needing the router
export function getCardImageUrl(dataDir: string, id: number): string | null {
  return imageUrlForId(id, cardImagesDir(dataDir))
}
