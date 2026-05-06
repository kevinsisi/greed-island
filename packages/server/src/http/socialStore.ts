// Social system store — friends, private messages, alliances, and
// player area presence. All tables live in the same SQLite database
// as accounts/playerState so a single docker volume captures the
// full server state.
//
// Schema notes:
//   friends           — undirected friendship represented by an
//                       outgoing edge (requester_id, addressee_id) plus
//                       a status column. We keep both sides queryable
//                       by indexing each user_id column separately.
//   messages          — append-only private DM log between two users.
//                       Read state is tracked per-message on the
//                       receiver side via `read_at`.
//   alliances         — named guild/coalition (max 5 members).
//   alliance_members  — alliance membership join table.
//   player_locations  — most recent area each player visited so the
//                       map can render same-area players in real time.

import type Database from 'better-sqlite3'

type DatabaseConnection = Database.Database

export const ALLIANCE_MAX_MEMBERS = 5
export const ALLIANCE_NAME_MIN = 2
export const ALLIANCE_NAME_MAX = 24
export const MESSAGE_MIN = 1
export const MESSAGE_MAX = 1000

export type FriendStatus = 'pending' | 'accepted' | 'rejected'

export type FriendRow = Readonly<{
  id: number
  requester_id: number
  addressee_id: number
  status: FriendStatus
  created_at: number
  responded_at: number | null
}>

export type MessageRow = Readonly<{
  id: number
  sender_id: number
  receiver_id: number
  content: string
  created_at: number
  read_at: number | null
}>

export type AllianceRow = Readonly<{
  id: number
  name: string
  leader_id: number
  created_at: number
}>

export type AllianceMemberRow = Readonly<{
  alliance_id: number
  user_id: number
  joined_at: number
}>

export type PlayerLocationRow = Readonly<{
  user_id: number
  tile_id: string
  last_seen_tick: number
  updated_at: number
}>

export class SocialError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'SocialError'
  }
}

export function initializeSocialSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      addressee_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      responded_at INTEGER,
      FOREIGN KEY (requester_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (addressee_id) REFERENCES accounts(id) ON DELETE CASCADE,
      CHECK (requester_id <> addressee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id);
    CREATE INDEX IF NOT EXISTS idx_friends_addressee ON friends(addressee_id);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      FOREIGN KEY (sender_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_pair
      ON messages(sender_id, receiver_id, id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver
      ON messages(receiver_id, id);

    CREATE TABLE IF NOT EXISTS alliances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      leader_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (leader_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alliance_members (
      alliance_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL UNIQUE,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (alliance_id, user_id),
      FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_alliance_members_user ON alliance_members(user_id);

    CREATE TABLE IF NOT EXISTS player_locations (
      user_id INTEGER PRIMARY KEY,
      tile_id TEXT NOT NULL,
      last_seen_tick INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_player_locations_tile ON player_locations(tile_id);
  `)
}

export class SocialStore {
  constructor(private readonly db: DatabaseConnection) {
    initializeSocialSchema(db)
  }

  // --- Friends ------------------------------------------------------------

  getEdgeBetween(a: number, b: number): FriendRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM friends
         WHERE (requester_id = ? AND addressee_id = ?)
            OR (requester_id = ? AND addressee_id = ?)
         LIMIT 1`
      )
      .get(a, b, b, a) as FriendRow | undefined
    return row ?? null
  }

  createFriendRequest(requesterId: number, addresseeId: number): FriendRow {
    if (requesterId === addresseeId) {
      throw new SocialError('SELF_REQUEST', 'You cannot send a friend request to yourself.')
    }
    const existing = this.getEdgeBetween(requesterId, addresseeId)
    if (existing) {
      if (existing.status === 'accepted') {
        throw new SocialError('ALREADY_FRIENDS', 'You are already friends.')
      }
      if (existing.status === 'pending') {
        throw new SocialError('REQUEST_PENDING', 'A friend request is already pending.')
      }
      // rejected — overwrite to a new pending request
      const now = Date.now()
      this.db
        .prepare(
          `UPDATE friends SET requester_id=?, addressee_id=?, status='pending',
             created_at=?, responded_at=NULL WHERE id=?`
        )
        .run(requesterId, addresseeId, now, existing.id)
      return {
        id: existing.id,
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'pending',
        created_at: now,
        responded_at: null,
      }
    }
    const now = Date.now()
    const result = this.db
      .prepare(
        `INSERT INTO friends (requester_id, addressee_id, status, created_at)
         VALUES (?, ?, 'pending', ?)`
      )
      .run(requesterId, addresseeId, now)
    return {
      id: Number(result.lastInsertRowid),
      requester_id: requesterId,
      addressee_id: addresseeId,
      status: 'pending',
      created_at: now,
      responded_at: null,
    }
  }

  respondToFriendRequest(
    requestId: number,
    userId: number,
    accept: boolean
  ): FriendRow {
    const row = this.db.prepare('SELECT * FROM friends WHERE id = ?').get(requestId) as FriendRow | undefined
    if (!row) throw new SocialError('REQUEST_NOT_FOUND', 'Friend request not found.')
    if (row.addressee_id !== userId) {
      throw new SocialError('FORBIDDEN', 'Only the addressee can respond to this request.')
    }
    if (row.status !== 'pending') {
      throw new SocialError('NOT_PENDING', 'Request is not pending.')
    }
    const now = Date.now()
    const status: FriendStatus = accept ? 'accepted' : 'rejected'
    this.db
      .prepare('UPDATE friends SET status=?, responded_at=? WHERE id=?')
      .run(status, now, requestId)
    return { ...row, status, responded_at: now }
  }

  removeFriend(userId: number, otherId: number): boolean {
    const row = this.getEdgeBetween(userId, otherId)
    if (!row || row.status !== 'accepted') return false
    this.db.prepare('DELETE FROM friends WHERE id = ?').run(row.id)
    return true
  }

  listFriends(userId: number): FriendRow[] {
    return this.db
      .prepare(
        `SELECT * FROM friends
         WHERE status='accepted'
           AND (requester_id = ? OR addressee_id = ?)
         ORDER BY responded_at DESC, created_at DESC`
      )
      .all(userId, userId) as FriendRow[]
  }

  listPendingIncoming(userId: number): FriendRow[] {
    return this.db
      .prepare(
        `SELECT * FROM friends
         WHERE addressee_id = ? AND status='pending'
         ORDER BY created_at DESC`
      )
      .all(userId) as FriendRow[]
  }

  listPendingOutgoing(userId: number): FriendRow[] {
    return this.db
      .prepare(
        `SELECT * FROM friends
         WHERE requester_id = ? AND status='pending'
         ORDER BY created_at DESC`
      )
      .all(userId) as FriendRow[]
  }

  // --- Messages -----------------------------------------------------------

  insertMessage(senderId: number, receiverId: number, content: string): MessageRow {
    if (senderId === receiverId) {
      throw new SocialError('SELF_MESSAGE', 'You cannot message yourself.')
    }
    const trimmed = content.trim()
    if (trimmed.length < MESSAGE_MIN || trimmed.length > MESSAGE_MAX) {
      throw new SocialError(
        'INVALID_CONTENT',
        `Message must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters.`
      )
    }
    const now = Date.now()
    const result = this.db
      .prepare(
        `INSERT INTO messages (sender_id, receiver_id, content, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(senderId, receiverId, trimmed, now)
    return {
      id: Number(result.lastInsertRowid),
      sender_id: senderId,
      receiver_id: receiverId,
      content: trimmed,
      created_at: now,
      read_at: null,
    }
  }

  listMessagesBetween(a: number, b: number, limit: number): MessageRow[] {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)))
    const rows = this.db
      .prepare(
        `SELECT * FROM messages
         WHERE (sender_id = ? AND receiver_id = ?)
            OR (sender_id = ? AND receiver_id = ?)
         ORDER BY id DESC LIMIT ?`
      )
      .all(a, b, b, a, safeLimit) as MessageRow[]
    return rows.slice().reverse()
  }

  markMessagesRead(receiverId: number, peerId: number): number {
    const now = Date.now()
    const result = this.db
      .prepare(
        `UPDATE messages SET read_at=?
         WHERE receiver_id=? AND sender_id=? AND read_at IS NULL`
      )
      .run(now, receiverId, peerId)
    return Number(result.changes ?? 0)
  }

  listConversations(userId: number): Array<{
    peerId: number
    lastMessage: MessageRow
    unread: number
  }> {
    const rows = this.db
      .prepare(
        `WITH peers AS (
           SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS peer_id,
                  id, sender_id, receiver_id, content, created_at, read_at
           FROM messages
           WHERE sender_id = ? OR receiver_id = ?
         ),
         latest AS (
           SELECT peer_id, MAX(id) AS max_id FROM peers GROUP BY peer_id
         )
         SELECT p.peer_id AS peer_id, p.id AS id, p.sender_id AS sender_id,
                p.receiver_id AS receiver_id, p.content AS content,
                p.created_at AS created_at, p.read_at AS read_at,
                (SELECT COUNT(*) FROM messages m
                 WHERE m.receiver_id = ? AND m.sender_id = p.peer_id
                   AND m.read_at IS NULL) AS unread
         FROM peers p
         JOIN latest l ON l.peer_id = p.peer_id AND l.max_id = p.id
         ORDER BY p.created_at DESC`
      )
      .all(userId, userId, userId, userId) as Array<{
        peer_id: number
        id: number
        sender_id: number
        receiver_id: number
        content: string
        created_at: number
        read_at: number | null
        unread: number
      }>
    return rows.map((r) => ({
      peerId: r.peer_id,
      lastMessage: {
        id: r.id,
        sender_id: r.sender_id,
        receiver_id: r.receiver_id,
        content: r.content,
        created_at: r.created_at,
        read_at: r.read_at,
      },
      unread: Number(r.unread ?? 0),
    }))
  }

  // --- Alliance -----------------------------------------------------------

  getAllianceForUser(userId: number): {
    alliance: AllianceRow
    members: AllianceMemberRow[]
  } | null {
    const member = this.db
      .prepare('SELECT * FROM alliance_members WHERE user_id = ?')
      .get(userId) as AllianceMemberRow | undefined
    if (!member) return null
    const alliance = this.db
      .prepare('SELECT * FROM alliances WHERE id = ?')
      .get(member.alliance_id) as AllianceRow | undefined
    if (!alliance) return null
    const members = this.db
      .prepare('SELECT * FROM alliance_members WHERE alliance_id = ? ORDER BY joined_at ASC')
      .all(alliance.id) as AllianceMemberRow[]
    return { alliance, members }
  }

  createAlliance(name: string, leaderId: number): AllianceRow {
    const trimmed = name.trim()
    if (trimmed.length < ALLIANCE_NAME_MIN || trimmed.length > ALLIANCE_NAME_MAX) {
      throw new SocialError(
        'INVALID_NAME',
        `Alliance name must be ${ALLIANCE_NAME_MIN}-${ALLIANCE_NAME_MAX} characters.`
      )
    }
    const existingForLeader = this.getAllianceForUser(leaderId)
    if (existingForLeader) {
      throw new SocialError('ALREADY_IN_ALLIANCE', 'You already belong to an alliance.')
    }
    const dup = this.db.prepare('SELECT id FROM alliances WHERE name = ?').get(trimmed)
    if (dup) {
      throw new SocialError('NAME_TAKEN', 'Alliance name is already taken.')
    }
    const now = Date.now()
    const tx = this.db.transaction(() => {
      const result = this.db
        .prepare('INSERT INTO alliances (name, leader_id, created_at) VALUES (?, ?, ?)')
        .run(trimmed, leaderId, now)
      const id = Number(result.lastInsertRowid)
      this.db
        .prepare('INSERT INTO alliance_members (alliance_id, user_id, joined_at) VALUES (?, ?, ?)')
        .run(id, leaderId, now)
      return id
    })
    const id = tx()
    return { id, name: trimmed, leader_id: leaderId, created_at: now }
  }

  addMember(allianceId: number, userId: number): AllianceMemberRow {
    const alliance = this.db.prepare('SELECT * FROM alliances WHERE id = ?').get(allianceId) as AllianceRow | undefined
    if (!alliance) throw new SocialError('ALLIANCE_NOT_FOUND', 'Alliance not found.')
    const memberCount = (
      this.db.prepare('SELECT COUNT(*) AS c FROM alliance_members WHERE alliance_id = ?').get(allianceId) as { c: number }
    ).c
    if (memberCount >= ALLIANCE_MAX_MEMBERS) {
      throw new SocialError('ALLIANCE_FULL', `Alliance is full (max ${ALLIANCE_MAX_MEMBERS}).`)
    }
    const existing = this.getAllianceForUser(userId)
    if (existing) throw new SocialError('ALREADY_IN_ALLIANCE', 'User already belongs to an alliance.')
    const now = Date.now()
    this.db
      .prepare('INSERT INTO alliance_members (alliance_id, user_id, joined_at) VALUES (?, ?, ?)')
      .run(allianceId, userId, now)
    return { alliance_id: allianceId, user_id: userId, joined_at: now }
  }

  removeMember(allianceId: number, userId: number): {
    disbanded: boolean
    nextLeaderId: number | null
  } {
    const alliance = this.db.prepare('SELECT * FROM alliances WHERE id = ?').get(allianceId) as AllianceRow | undefined
    if (!alliance) throw new SocialError('ALLIANCE_NOT_FOUND', 'Alliance not found.')
    const member = this.db
      .prepare('SELECT * FROM alliance_members WHERE alliance_id = ? AND user_id = ?')
      .get(allianceId, userId) as AllianceMemberRow | undefined
    if (!member) throw new SocialError('NOT_MEMBER', 'User is not a member of this alliance.')

    this.db.prepare('DELETE FROM alliance_members WHERE alliance_id = ? AND user_id = ?').run(allianceId, userId)
    const remaining = this.db
      .prepare('SELECT * FROM alliance_members WHERE alliance_id = ? ORDER BY joined_at ASC')
      .all(allianceId) as AllianceMemberRow[]

    if (remaining.length === 0) {
      this.db.prepare('DELETE FROM alliances WHERE id = ?').run(allianceId)
      return { disbanded: true, nextLeaderId: null }
    }
    if (alliance.leader_id === userId) {
      const next = remaining[0]!.user_id
      this.db.prepare('UPDATE alliances SET leader_id = ? WHERE id = ?').run(next, allianceId)
      return { disbanded: false, nextLeaderId: next }
    }
    return { disbanded: false, nextLeaderId: alliance.leader_id }
  }

  // --- Presence -----------------------------------------------------------

  upsertPlayerLocation(userId: number, tileId: string, tick: number): PlayerLocationRow {
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO player_locations (user_id, tile_id, last_seen_tick, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           tile_id = excluded.tile_id,
           last_seen_tick = excluded.last_seen_tick,
           updated_at = excluded.updated_at`
      )
      .run(userId, tileId, tick, now)
    return { user_id: userId, tile_id: tileId, last_seen_tick: tick, updated_at: now }
  }

  getPlayerLocation(userId: number): PlayerLocationRow | null {
    const row = this.db
      .prepare('SELECT * FROM player_locations WHERE user_id = ?')
      .get(userId) as PlayerLocationRow | undefined
    return row ?? null
  }

  listPlayersInTile(tileId: string, freshTick: number): PlayerLocationRow[] {
    return this.db
      .prepare(
        `SELECT * FROM player_locations
         WHERE tile_id = ? AND last_seen_tick >= ?
         ORDER BY updated_at DESC`
      )
      .all(tileId, freshTick) as PlayerLocationRow[]
  }
}
