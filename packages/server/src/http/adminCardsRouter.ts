// Canonical GM card-art management. Large bodies are parsed only AFTER auth.
import { Router, json, type ErrorRequestHandler } from 'express'
import type { HttpAuthorization } from './authorization.js'
import { GM_ROLES, sendFeatureError } from './featureAuthorization.js'
import { findCardArt } from './cardArtFiles.js'
import { CardArtError, MAX_CARD_IMAGE_BYTES, archiveCardArt, decodeCardImage, parseCardId, replaceCardArt } from './cardArtManagement.js'

export type AdminCardsRouterInput = Readonly<{ dataDir: string; authConfig: HttpAuthorization }>
export function createAdminCardsRouter(input: AdminCardsRouterInput): Router {
  const router = Router(), requireGm = input.authConfig.role(...GM_ROLES)
  const imageBody = json({ limit: Math.ceil(MAX_CARD_IMAGE_BYTES / 3) * 4 + 1_024, strict: true })
  router.get('/admin/cards/images', requireGm, (_req, res) => {
    const images: Record<number, string> = {}
    for (let id = 1; id <= 100; id++) {
      const art = findCardArt(input.dataDir, id)
      if (art) images[id] = art.imageUrl
    }
    res.json({ images })
  })
  router.put('/admin/cards/:id/image', requireGm, imageBody, (req, res) => {
    const id = parseCardId(String(req.params.id ?? ''))
    if (id === null) { res.status(400).json({ error: 'INVALID_ID' }); return }
    try {
      const body = (req.body ?? {}) as { imageBase64?: unknown; mimeType?: unknown }
      const image = decodeCardImage(body.imageBase64, body.mimeType)
      input.authConfig.reauthorizeMutation(req, GM_ROLES)
      const imageUrl = replaceCardArt(input.dataDir, id, image.bytes, image.extension)
      res.json({ ok: true, imageUrl })
    } catch (error) {
      if (error instanceof CardArtError) { res.status(error.status).json({ error: error.code }); return }
      sendFeatureError(res, error)
    }
  })
  router.delete('/admin/cards/:id/image', requireGm, (req, res) => {
    const id = parseCardId(String(req.params.id ?? ''))
    if (id === null) { res.status(400).json({ error: 'INVALID_ID' }); return }
    try {
      input.authConfig.reauthorizeMutation(req, GM_ROLES)
      if (!archiveCardArt(input.dataDir, id)) { res.status(404).json({ error: 'NOT_FOUND' }); return }
      res.json({ ok: true })
    } catch (error) {
      if (error instanceof CardArtError) { res.status(error.status).json({ error: error.code }); return }
      sendFeatureError(res, error)
    }
  })
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = (error as { status?: number }).status
    if (status === 400 || status === 413) { res.status(status).json({ error: status === 413 ? 'IMAGE_TOO_LARGE' : 'INVALID_BODY' }); return }
    sendFeatureError(res, error)
  }
  router.use(errorHandler)
  return router
}
/** Read-only legacy catalog helper delegates to the same public allowlist. */
export function getCardImageUrl(dataDir: string, id: number): string | null { return findCardArt(dataDir, id)?.imageUrl ?? null }
