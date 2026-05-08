// Social router — friends, messages, alliances, presence.
//
// All routes require auth (req.auth populated by requireAuth middleware).
// Mutations publish events on the SocialBus so the per-user SSE
// stream (/api/social/stream) can push real-time hints to peers.

import { Router, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import type { SimulationRuntime } from '../sim/runtime.js'
import { requireAuth, type AuthConfig } from './auth.js'
import { AccountStore, isAccountRole, type AccountRole } from './accounts.js'
import {
  ALLIANCE_MAX_MEMBERS,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SocialError,
  SocialStore,
  type AllianceMemberRow,
  type AllianceRow,
  type FriendRow,
  type MessageRow,
  type PlayerLocationRow,
} from './socialStore.js'
import type { SocialBus, SocialEvent } from './socialBus.js'

// Players are considered "online in this area" if their last seen tick
// is within this window of the current simulation tick. With a 5s tick
// rate this is roughly 5 minutes of grace.
const PRESENCE_FRESH_TICKS = 60
const AREA_PRESENCE_MAX_X = 600
const AREA_PRESENCE_MAX_Y = 400
const AREA_PRESENCE_MIN_Z = 0
const AREA_PRESENCE_MAX_Z = 16

type PublicAccountSummary = Readonly<{
  id: number
  email: string
  displayName: string
}>

export function createSocialRouter(input: {
  runtime: SimulationRuntime
  social: SocialStore
  accounts: AccountStore
  bus: SocialBus
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const handleSocial = requireAuth(input.authConfig)

  // -- Friends -----------------------------------------------------------

  router.post('/social/friend-request/:targetUserId', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const target = parseUserId(req.params.targetUserId)
    if (target === null) return sendError(res, new SocialError('INVALID_USER', 'Invalid target user id.'))
    const targetAccount = input.accounts.findById(target)
    if (!targetAccount) return sendError(res, new SocialError('USER_NOT_FOUND', 'User not found.'))
    try {
      const row = input.social.createFriendRequest(me, target)
      input.bus.publish({
        type: 'friend.request',
        to: target,
        from: me,
        requestId: row.id,
        occurredAt: new Date().toISOString(),
      })
      res.status(201).json({ request: friendRowToDto(row, input.accounts) })
    } catch (err) {
      sendError(res, err)
    }
  })

  router.post('/social/friend-accept/:requestId', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const id = parsePositiveInt(req.params.requestId)
    if (id === null) return sendError(res, new SocialError('INVALID_REQUEST', 'Invalid request id.'))
    try {
      const row = input.social.respondToFriendRequest(id, me, true)
      input.bus.publish({
        type: 'friend.accepted',
        to: row.requester_id,
        from: me,
        requestId: row.id,
        occurredAt: new Date().toISOString(),
      })
      res.json({ request: friendRowToDto(row, input.accounts) })
    } catch (err) {
      sendError(res, err)
    }
  })

  router.post('/social/friend-reject/:requestId', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const id = parsePositiveInt(req.params.requestId)
    if (id === null) return sendError(res, new SocialError('INVALID_REQUEST', 'Invalid request id.'))
    try {
      const row = input.social.respondToFriendRequest(id, me, false)
      input.bus.publish({
        type: 'friend.rejected',
        to: row.requester_id,
        from: me,
        requestId: row.id,
        occurredAt: new Date().toISOString(),
      })
      res.json({ request: friendRowToDto(row, input.accounts) })
    } catch (err) {
      sendError(res, err)
    }
  })

  router.get('/social/friends', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const rows = input.social.listFriends(me)
    res.json({ friends: rows.map((r) => friendRowToDto(r, input.accounts, me)) })
  })

  router.get('/social/friend-requests', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    res.json({
      incoming: input.social.listPendingIncoming(me).map((r) => friendRowToDto(r, input.accounts, me)),
      outgoing: input.social.listPendingOutgoing(me).map((r) => friendRowToDto(r, input.accounts, me)),
    })
  })

  router.delete('/social/friends/:friendId', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const friendId = parseUserId(req.params.friendId)
    if (friendId === null) return sendError(res, new SocialError('INVALID_USER', 'Invalid friend id.'))
    const removed = input.social.removeFriend(me, friendId)
    if (!removed) return sendError(res, new SocialError('NOT_FRIENDS', 'You are not friends with this user.'))
    input.bus.publish({
      type: 'friend.removed',
      to: friendId,
      from: me,
      occurredAt: new Date().toISOString(),
    })
    res.json({ removed: true })
  })

  // -- Messages ---------------------------------------------------------

  router.post('/social/message/:targetUserId', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const target = parseUserId(req.params.targetUserId)
    if (target === null) return sendError(res, new SocialError('INVALID_USER', 'Invalid target user id.'))
    const targetAccount = input.accounts.findById(target)
    if (!targetAccount) return sendError(res, new SocialError('USER_NOT_FOUND', 'User not found.'))
    const content = readMessageContent(req.body)
    if (content === null) {
      return sendError(
        res,
        new SocialError('INVALID_CONTENT', `Message must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters.`)
      )
    }
    try {
      const row = input.social.insertMessage(me, target, content)
      input.bus.publish({
        type: 'message.new',
        to: target,
        from: me,
        messageId: row.id,
        preview: row.content.length > 80 ? row.content.slice(0, 77) + '…' : row.content,
        occurredAt: new Date(row.created_at).toISOString(),
      })
      res.status(201).json({ message: messageRowToDto(row) })
    } catch (err) {
      sendError(res, err)
    }
  })

  router.get('/social/messages/:userId', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const peer = parseUserId(req.params.userId)
    if (peer === null) return sendError(res, new SocialError('INVALID_USER', 'Invalid user id.'))
    const peerAccount = input.accounts.findById(peer)
    if (!peerAccount) return sendError(res, new SocialError('USER_NOT_FOUND', 'User not found.'))
    const limit = clampInt(req.query.limit, 1, 200, 50)
    const rows = input.social.listMessagesBetween(me, peer, limit)
    input.social.markMessagesRead(me, peer)
    res.json({
      peer: accountToSummary(peerAccount),
      messages: rows.map(messageRowToDto),
    })
  })

  router.get('/social/conversations', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const rows = input.social.listConversations(me)
    res.json({
      conversations: rows.map((c) => {
        const peer = input.accounts.findById(c.peerId)
        return {
          peer: peer ? accountToSummary(peer) : { id: c.peerId, email: 'unknown', displayName: 'unknown' },
          lastMessage: messageRowToDto(c.lastMessage),
          unread: c.unread,
        }
      }),
    })
  })

  // -- Presence ---------------------------------------------------------

  router.post('/social/presence', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const tileId = readTileId(req.body)
    if (tileId === null) return sendError(res, new SocialError('INVALID_TILE', 'tileId is required.'))
    const position = readAreaPosition(req.body)
    const clientUpdatedAt = readClientUpdatedAt(req.body)
    const tick = input.runtime.getCurrentTick()
    const previous = input.social.getPlayerLocation(me)
    const updated = input.social.upsertPlayerLocation(me, tileId, tick, position, clientUpdatedAt)
    if (updated.applied && (!previous || previous.tile_id !== updated.row.tile_id)) {
      // notify other players in the new tile that someone arrived
      const peers = input.social.listPlayersInTile(updated.row.tile_id, tick - PRESENCE_FRESH_TICKS)
      for (const p of peers) {
        if (p.user_id === me) continue
        input.bus.publish({
          type: 'presence.enter',
          to: p.user_id,
          userId: me,
          tileId: updated.row.tile_id,
          occurredAt: new Date().toISOString(),
        })
      }
      if (previous) {
        const prevPeers = input.social.listPlayersInTile(previous.tile_id, tick - PRESENCE_FRESH_TICKS)
        for (const p of prevPeers) {
          if (p.user_id === me) continue
          input.bus.publish({
            type: 'presence.leave',
            to: p.user_id,
            userId: me,
            tileId: previous.tile_id,
            occurredAt: new Date().toISOString(),
          })
        }
      }
    }
    res.json({ location: presenceToDto(updated.row) })
  })

  router.get('/social/nearby', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const tileId = typeof req.query.tileId === 'string' ? req.query.tileId : null
    const tick = input.runtime.getCurrentTick()
    const myLoc = input.social.getPlayerLocation(me)
    const targetTile = tileId ?? myLoc?.tile_id ?? null
    if (!targetTile) {
      res.json({ tileId: null, players: [] })
      return
    }
    const rows = input.social.listPlayersInTile(targetTile, tick - PRESENCE_FRESH_TICKS)
    const players = rows
      .filter((r) => r.user_id !== me)
      .map((r) => {
        const acc = input.accounts.findById(r.user_id)
        return acc
          ? {
              ...accountToSummary(acc),
              tileId: r.tile_id,
              lastSeenTick: r.last_seen_tick,
              x: r.pos_x,
              y: r.pos_y,
              z: r.pos_z,
            }
          : null
      })
      .filter((p): p is PublicAccountSummary & { tileId: string; lastSeenTick: number; x: number | null; y: number | null; z: number | null } => p !== null)
    res.json({ tileId: targetTile, players })
  })

  // -- Alliance ---------------------------------------------------------

  router.post('/social/alliance/create', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const body = req.body as { name?: unknown }
    if (typeof body?.name !== 'string') {
      return sendError(res, new SocialError('INVALID_NAME', 'Alliance name is required.'))
    }
    try {
      const alliance = input.social.createAlliance(body.name, me)
      const detail = input.social.getAllianceForUser(me)!
      res.status(201).json({ alliance: allianceToDto(alliance, detail.members, input.accounts) })
    } catch (err) {
      sendError(res, err)
    }
  })

  router.post('/social/alliance/invite/:userId', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const target = parseUserId(req.params.userId)
    if (target === null) return sendError(res, new SocialError('INVALID_USER', 'Invalid target user id.'))
    const targetAccount = input.accounts.findById(target)
    if (!targetAccount) return sendError(res, new SocialError('USER_NOT_FOUND', 'User not found.'))
    const detail = input.social.getAllianceForUser(me)
    if (!detail) return sendError(res, new SocialError('NOT_IN_ALLIANCE', 'You are not in an alliance.'))
    if (detail.alliance.leader_id !== me) {
      return sendError(res, new SocialError('NOT_LEADER', 'Only the leader can invite members.'))
    }
    try {
      input.social.addMember(detail.alliance.id, target)
      input.bus.publish({
        type: 'alliance.invited',
        to: target,
        from: me,
        allianceId: detail.alliance.id,
        occurredAt: new Date().toISOString(),
      })
      const refreshed = input.social.getAllianceForUser(me)!
      res
        .status(201)
        .json({ alliance: allianceToDto(refreshed.alliance, refreshed.members, input.accounts) })
    } catch (err) {
      sendError(res, err)
    }
  })

  router.post('/social/alliance/leave', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const detail = input.social.getAllianceForUser(me)
    if (!detail) return sendError(res, new SocialError('NOT_IN_ALLIANCE', 'You are not in an alliance.'))
    try {
      const result = input.social.removeMember(detail.alliance.id, me)
      res.json({
        left: true,
        disbanded: result.disbanded,
        nextLeaderId: result.nextLeaderId,
      })
    } catch (err) {
      sendError(res, err)
    }
  })

  router.get('/social/alliance', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const detail = input.social.getAllianceForUser(me)
    if (!detail) {
      res.json({ alliance: null })
      return
    }
    res.json({ alliance: allianceToDto(detail.alliance, detail.members, input.accounts) })
  })

  return router
}

// ---------------------------------------------------------------------- SSE

const KEEPALIVE_INTERVAL_MS = 25_000

export function createSocialSseRouter(input: {
  bus: SocialBus
  authConfig: AuthConfig
}): Router {
  const router = Router()

  // EventSource cannot set Authorization headers, so this stream also
  // accepts ?access_token=<jwt>. The header form still wins when
  // present (Caddy / proxies may strip query strings).
  router.get('/social/stream', (req: Request, res: Response) => {
    const claims =
      readClaimsFromHeader(req, input.authConfig) ?? readClaimsFromQuery(req, input.authConfig)
    const userId = claims?.sub
    if (typeof userId !== 'number') {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    res.write(`retry: 5000\n\n`)
    res.write(`event: hello\ndata: ${JSON.stringify({ userId })}\n\n`)

    const unsubscribe = input.bus.subscribe(userId, (event: SocialEvent) => {
      res.write(`event: ${event.type}\n`)
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    })

    const keepalive = setInterval(() => {
      res.write(': keepalive\n\n')
    }, KEEPALIVE_INTERVAL_MS)

    const cleanup = () => {
      clearInterval(keepalive)
      unsubscribe()
      try {
        res.end()
      } catch {
        // socket may already be closed
      }
    }

    req.on('close', cleanup)
    req.on('error', cleanup)
  })

  return router
}

// ---------------------------------------------------------------------- helpers

function readClaimsFromHeader(
  req: Request,
  config: AuthConfig
): { sub: number; email: string; role: AccountRole } | null {
  const header = req.header('authorization') ?? req.header('Authorization')
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null
  return verifyJwt(header.slice(7).trim(), config)
}

function readClaimsFromQuery(
  req: Request,
  config: AuthConfig
): { sub: number; email: string; role: AccountRole } | null {
  const raw = req.query.access_token
  const token = typeof raw === 'string' ? raw.trim() : ''
  if (token.length === 0) return null
  return verifyJwt(token, config)
}

function verifyJwt(token: string, config: AuthConfig): { sub: number; email: string; role: AccountRole } | null {
  if (token.length === 0) return null
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      sub?: unknown
      email?: unknown
      role?: unknown
    }
    if (typeof decoded.sub !== 'number' || typeof decoded.email !== 'string') return null
    const role = isAccountRole(decoded.role) ? decoded.role : 'player'
    return { sub: decoded.sub, email: decoded.email, role }
  } catch {
    return null
  }
}

function parseUserId(raw: unknown): number | null {
  return parsePositiveInt(raw)
}

function parsePositiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function readMessageContent(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const c = (body as { content?: unknown }).content
  if (typeof c !== 'string') return null
  const trimmed = c.trim()
  if (trimmed.length < MESSAGE_MIN || trimmed.length > MESSAGE_MAX) return null
  return trimmed
}

function readTileId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const t = (body as { tileId?: unknown }).tileId
  if (typeof t !== 'string') return null
  const trimmed = t.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return null
  return trimmed
}

function readAreaPosition(body: unknown): { x: number; y: number; z: number } | null {
  if (!body || typeof body !== 'object') return null
  const rawX = (body as { x?: unknown }).x
  const rawY = (body as { y?: unknown }).y
  const rawZ = (body as { z?: unknown }).z
  if (typeof rawX !== 'number' || typeof rawY !== 'number') return null
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null
  const z = typeof rawZ === 'number' && Number.isFinite(rawZ) ? rawZ : 0
  return {
    x: Math.max(0, Math.min(AREA_PRESENCE_MAX_X, Math.round(rawX))),
    y: Math.max(0, Math.min(AREA_PRESENCE_MAX_Y, Math.round(rawY))),
    z: Math.max(AREA_PRESENCE_MIN_Z, Math.min(AREA_PRESENCE_MAX_Z, Math.round(z))),
  }
}

function readClientUpdatedAt(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null
  const raw = (body as { clientUpdatedAt?: unknown }).clientUpdatedAt
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.max(0, Math.round(raw))
}

function accountToSummary(account: {
  id: number
  email: string
  nickname?: string | null
}): PublicAccountSummary {
  const fallback = account.email.split('@')[0] ?? account.email
  return {
    id: account.id,
    email: account.email,
    displayName: account.nickname ?? fallback,
  }
}

type FriendDto = {
  id: number
  status: FriendRow['status']
  requester: PublicAccountSummary
  addressee: PublicAccountSummary
  createdAt: string
  respondedAt: string | null
  peer?: PublicAccountSummary
}

function friendRowToDto(
  row: FriendRow,
  accounts: AccountStore,
  perspectiveUserId?: number
): FriendDto {
  const requester = accounts.findById(row.requester_id)
  const addressee = accounts.findById(row.addressee_id)
  const requesterSummary = requester
    ? accountToSummary(requester)
    : { id: row.requester_id, email: 'unknown', displayName: 'unknown' }
  const addresseeSummary = addressee
    ? accountToSummary(addressee)
    : { id: row.addressee_id, email: 'unknown', displayName: 'unknown' }
  const dto: FriendDto = {
    id: row.id,
    status: row.status,
    requester: requesterSummary,
    addressee: addresseeSummary,
    createdAt: new Date(row.created_at).toISOString(),
    respondedAt: row.responded_at ? new Date(row.responded_at).toISOString() : null,
  }
  if (perspectiveUserId !== undefined) {
    dto.peer = perspectiveUserId === row.requester_id ? addresseeSummary : requesterSummary
  }
  return dto
}

function messageRowToDto(row: MessageRow): {
  id: number
  senderId: number
  receiverId: number
  content: string
  createdAt: string
  readAt: string | null
} {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
  }
}

function allianceToDto(
  alliance: AllianceRow,
  members: AllianceMemberRow[],
  accounts: AccountStore
): {
  id: number
  name: string
  leaderId: number
  createdAt: string
  members: Array<PublicAccountSummary & { joinedAt: string; isLeader: boolean }>
  maxMembers: number
} {
  return {
    id: alliance.id,
    name: alliance.name,
    leaderId: alliance.leader_id,
    createdAt: new Date(alliance.created_at).toISOString(),
    members: members.map((m) => {
      const acc = accounts.findById(m.user_id)
      return {
        ...(acc
          ? accountToSummary(acc)
          : { id: m.user_id, email: 'unknown', displayName: 'unknown' }),
        joinedAt: new Date(m.joined_at).toISOString(),
        isLeader: m.user_id === alliance.leader_id,
      }
    }),
    maxMembers: ALLIANCE_MAX_MEMBERS,
  }
}

function presenceToDto(row: PlayerLocationRow): {
  userId: number
  tileId: string
  x: number | null
  y: number | null
  z: number | null
  lastSeenTick: number
  updatedAt: string
} {
  return {
    userId: row.user_id,
    tileId: row.tile_id,
    x: row.pos_x,
    y: row.pos_y,
    z: row.pos_z,
    lastSeenTick: row.last_seen_tick,
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function sendError(res: Response, err: unknown): void {
  if (err instanceof SocialError) {
    const status =
      err.code === 'USER_NOT_FOUND' || err.code === 'REQUEST_NOT_FOUND' || err.code === 'ALLIANCE_NOT_FOUND'
        ? 404
        : err.code === 'FORBIDDEN' || err.code === 'NOT_LEADER'
          ? 403
          : err.code === 'ALREADY_FRIENDS' ||
              err.code === 'REQUEST_PENDING' ||
              err.code === 'NAME_TAKEN' ||
              err.code === 'ALREADY_IN_ALLIANCE' ||
              err.code === 'ALLIANCE_FULL'
            ? 409
            : 400
    res.status(status).json({ error: err.code, message: err.message })
    return
  }
  console.error('[social] unhandled', err)
  res.status(500).json({ error: 'INTERNAL_ERROR' })
}
