import type { Event } from '../kernel/types.js'

export type PlayerCivilizationRow = Readonly<{
  accountId: string
  wallet: number
  hiredNpcIds: readonly string[]
  factionIds: readonly string[]
  claimedTileIds: readonly string[]
}>

function emptyRow(accountId: string): PlayerCivilizationRow {
  return { accountId, wallet: 0, hiredNpcIds: [], factionIds: [], claimedTileIds: [] }
}

export class PlayerCivilizationProjection {
  private readonly rows = new Map<string, {
    accountId: string
    wallet: number
    hiredNpcIds: string[]
    factionIds: string[]
    claimedTileIds: string[]
  }>()

  private getOrCreate(accountId: string) {
    let row = this.rows.get(accountId)
    if (!row) {
      row = { accountId, wallet: 0, hiredNpcIds: [], factionIds: [], claimedTileIds: [] }
      this.rows.set(accountId, row)
    }
    return row
  }

  project(event: Event): void {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    if (!p) return
    const accountId = typeof p.playerAccountId === 'string' ? p.playerAccountId : null
    if (!accountId) return
    const row = this.getOrCreate(accountId)

    switch (event.eventType) {
      case 'PLAYER_HIRED_NPC': {
        const npcId = typeof p.npcId === 'string' ? p.npcId : null
        if (npcId && !row.hiredNpcIds.includes(npcId)) row.hiredNpcIds.push(npcId)
        break
      }
      case 'PLAYER_DISMISSED_NPC': {
        const npcId = typeof p.npcId === 'string' ? p.npcId : null
        if (npcId) {
          const idx = row.hiredNpcIds.indexOf(npcId)
          if (idx !== -1) row.hiredNpcIds.splice(idx, 1)
        }
        break
      }
      case 'PLAYER_JOINED_FACTION':
      case 'PLAYER_LED_FACTION': {
        const factionId = typeof p.factionId === 'string' ? p.factionId : null
        if (factionId && !row.factionIds.includes(factionId)) row.factionIds.push(factionId)
        break
      }
      case 'PLAYER_LEFT_FACTION': {
        const factionId = typeof p.factionId === 'string' ? p.factionId : null
        if (factionId) {
          const idx = row.factionIds.indexOf(factionId)
          if (idx !== -1) row.factionIds.splice(idx, 1)
        }
        break
      }
      case 'PLAYER_CLAIMED_TERRITORY': {
        const tileId = typeof p.tileId === 'string' ? p.tileId : null
        if (tileId && !row.claimedTileIds.includes(tileId)) row.claimedTileIds.push(tileId)
        break
      }
    }
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows.clear()
    const sorted = [...events].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    for (const ev of sorted) this.project(ev)
  }

  getByAccount(accountId: string): PlayerCivilizationRow {
    const row = this.rows.get(accountId)
    if (!row) return emptyRow(accountId)
    return {
      accountId: row.accountId,
      wallet: row.wallet,
      hiredNpcIds: [...row.hiredNpcIds],
      factionIds: [...row.factionIds],
      claimedTileIds: [...row.claimedTileIds],
    }
  }

  snapshot(accountId: string): PlayerCivilizationRow {
    return this.getByAccount(accountId)
  }
}
