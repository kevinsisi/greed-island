// Social router — friends, messages, alliances, presence.
//
// All routes require auth (req.auth populated by requireAuth middleware).
// Mutations publish events on the SocialBus so the per-user SSE
// stream (/api/social/stream) can push real-time hints to peers.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import { requireAuth, type AuthConfig } from './auth.js'
import type { CanonicalAccountView, CanonicalAccountSummary } from './canonicalAccountView.js'
export { createSocialSseRouter } from './socialStream.js'
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
} from './socialStore.js'
import type { SocialBus } from './socialBus.js'

type PublicAccountSummary = Readonly<{
  id: number
  displayName: string
}>

export function createSocialRouter(input: {
  runtime: SimulationRuntime
  social: SocialStore
  accounts: CanonicalAccountView
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
    const limit = clampInt(req.query.limit, 1, 200, 50)
    const rows = input.social.listMessagesBetween(me, peer, limit)
    // Disabling a peer prevents new targeting, not access to the caller's
    // preserved inbox. No disabled login/contact alias is exposed.
    if (!peerAccount && rows.length === 0) return sendError(res, new SocialError('USER_NOT_FOUND', 'User not found.'))
    res.json({
      peer: peerAccount ? accountToSummary(peerAccount) : { id: peer, displayName: 'Unavailable account' },
      messages: rows.map(messageRowToDto),
    })
  })

  // Reading messages is side-effect free; marking only this actor's inbox is
  // an explicit Origin/context-guarded mutation.
  router.post('/social/messages/:userId/read', handleSocial, (req: Request, res: Response) => {
    const peer = parseUserId(req.params.userId)
    if (peer === null) return sendError(res, new SocialError('INVALID_USER', 'Invalid user id.'))
    if (!input.accounts.findById(peer) && input.social.listMessagesBetween(req.auth!.sub, peer, 1).length === 0) return sendError(res, new SocialError('USER_NOT_FOUND', 'User not found.'))
    res.json({ marked: input.social.markMessagesRead(req.auth!.sub, peer) })
  })

  router.get('/social/conversations', handleSocial, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const rows = input.social.listConversations(me)
    res.json({
      conversations: rows.map((c) => {
        const peer = input.accounts.findById(c.peerId)
        return {
          peer: peer ? accountToSummary(peer) : { id: c.peerId, displayName: 'Unavailable account' },
          lastMessage: messageRowToDto(c.lastMessage),
          unread: c.unread,
        }
      }),
    })
  })

  // -- Presence ---------------------------------------------------------

  router.post('/social/presence', handleSocial, (req: Request, res: Response) => {
    // Compatibility heartbeat only. Never persist body/localStorage position
    // or admit an account; the world service alone owns both truths.
    const actor = input.runtime.getAdmittedPlayerWorldActors().find(value => value.accountId === req.auth!.sub)
    const pose = actor ? input.runtime.getPlayerWorldGridPose(actor.accountId) : null
    if (!actor || !pose) { res.status(409).json({ error: 'WORLD_PRESENCE_REQUIRED' }); return }
    res.json({ location: {
      userId: actor.accountId, tileId: actor.tileId,
      x: pose.subCol, y: pose.subRow, z: pose.subZ,
      lastSeenTick: input.runtime.getCurrentTick(),
    } })
  })

  router.get('/social/nearby', handleSocial, (req: Request, res: Response) => {
    const actors = input.runtime.getAdmittedPlayerWorldActors()
    const me = actors.find(value => value.accountId === req.auth!.sub)
    if (!me) { res.status(409).json({ error: 'WORLD_PRESENCE_REQUIRED' }); return }
    // A requested tile is a view assertion, never a way to enumerate a remote
    // location or replace the caller's authoritative region.
    if (req.query.tileId !== undefined && req.query.tileId !== me.tileId) {
      res.status(409).json({ error: 'PLAYER_LOCATION_CHANGED' }); return
    }
    const players = actors.filter(actor => actor.accountId !== me.accountId && actor.tileId === me.tileId).flatMap(actor => {
      const account = input.accounts.findById(actor.accountId)
      const pose = input.runtime.getPlayerWorldGridPose(actor.accountId)
      return account && pose ? [{ ...accountToSummary(account), tileId: actor.tileId,
        lastSeenTick: input.runtime.getCurrentTick(), x: pose.subCol, y: pose.subRow, z: pose.subZ }] : []
    })
    res.json({ tileId: me.tileId, players })
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

// ---------------------------------------------------------------------- helpers

function parseUserId(raw: unknown): number | null {
  return parsePositiveInt(raw)
}

function parsePositiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN
  if (!Number.isSafeInteger(n) || n <= 0) return null
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

function accountToSummary(account: CanonicalAccountSummary): PublicAccountSummary {
  // An account's contact/login aliases are not peer presence or social data.
  return { id: account.id, displayName: account.displayName }
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
  accounts: CanonicalAccountView,
  perspectiveUserId?: number
): FriendDto {
  const requester = accounts.findById(row.requester_id)
  const addressee = accounts.findById(row.addressee_id)
  const requesterSummary = requester
    ? accountToSummary(requester)
    : { id: row.requester_id, displayName: 'Unavailable account' }
  const addresseeSummary = addressee
    ? accountToSummary(addressee)
    : { id: row.addressee_id, displayName: 'Unavailable account' }
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
  accounts: CanonicalAccountView
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
          : { id: m.user_id, displayName: 'Unavailable account' }),
        joinedAt: new Date(m.joined_at).toISOString(),
        isLeader: m.user_id === alliance.leader_id,
      }
    }),
    maxMembers: ALLIANCE_MAX_MEMBERS,
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
