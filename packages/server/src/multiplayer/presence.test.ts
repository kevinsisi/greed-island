import { describe, expect, it } from 'vitest'
import { DomainError } from './domain.js'
import { RoomPresence } from './presence.js'

function clockRoom(capacity = 50, options: { reconnectGraceMs?: number; maxConnectionsPerPlayer?: number } = {}) {
  let now = 0
  return { room: new RoomPresence(capacity, { now: () => now, ...options }), at: (value: number) => { now = value } }
}

describe('RoomPresence pure transport admission', () => {
  it('admits 50 distinct identities, counts streams once, and rejects identity 51', () => {
    const { room } = clockRoom()
    for (let index = 0; index < 50; index++) {
      room.open(`player-${index}`)
      room.open(`player-${index}`)
    }
    expect(room.counts()).toEqual({ onlinePlayers: 50, reservedPlayers: 0 })
    expect(room.revision).toBe(50)
    expect(() => room.open('player-50')).toThrowError(expect.objectContaining({ status: 409, code: 'ROOM_FULL' }))
    expect(room.hasConnection('player-50')).toBe(false)
    expect(room.counts()).toEqual({ onlinePlayers: 50, reservedPlayers: 0 })
    expect(room.revision).toBe(50)
  })

  it('rejects a third stream with the agreed DomainError, without changing presence', () => {
    const { room } = clockRoom()
    room.open('player-a')
    room.open('player-a')
    expect(() => room.open('player-a')).toThrow(DomainError)
    expect(() => room.open('player-a')).toThrowError(expect.objectContaining({ status: 409, code: 'TOO_MANY_CONNECTIONS' }))
    expect(room.revision).toBe(1)
    expect(room.counts()).toEqual({ onlinePlayers: 1, reservedPlayers: 0 })
  })

  it('starts grace only after the last stream disconnects and reports no active connection while reserved', () => {
    const { room, at } = clockRoom(1)
    const first = room.open('player-a')
    const second = room.open('player-a')
    at(5_000)
    first()
    expect(room.hasConnection('player-a')).toBe(true)
    expect(room.isReserved('player-a')).toBe(false)
    expect(room.revision).toBe(1)
    at(8_000)
    second()
    expect(room.hasConnection('player-a')).toBe(false)
    expect(room.isReserved('player-a')).toBe(true)
    expect(room.counts()).toEqual({ onlinePlayers: 0, reservedPlayers: 1 })
    expect(room.revision).toBe(2)
    at(17_999)
    expect(room.sweep()).toBe(false)
    expect(() => room.open('player-b')).toThrowError(expect.objectContaining({ code: 'ROOM_FULL' }))
    at(18_000)
    expect(room.sweep()).toBe(true)
    expect(room.isReserved('player-a')).toBe(false)
    expect(room.counts()).toEqual({ onlinePlayers: 0, reservedPlayers: 0 })
  })

  it('keeps 49 online identities plus one reservation at capacity, but reuses its owner slot', () => {
    const { room, at } = clockRoom()
    const returning = room.open('returning')
    for (let index = 0; index < 49; index++) room.open(`other-${index}`)
    returning()
    expect(room.counts()).toEqual({ onlinePlayers: 49, reservedPlayers: 1 })
    expect(() => room.open('newcomer')).toThrowError(expect.objectContaining({ code: 'ROOM_FULL' }))
    at(9_999)
    room.open('returning')
    expect(room.hasConnection('returning')).toBe(true)
    expect(room.isReserved('returning')).toBe(false)
    expect(room.counts()).toEqual({ onlinePlayers: 50, reservedPlayers: 0 })
    at(10_000)
    expect(room.sweep()).toBe(false)
  })

  it('sweeps expired reservations before new admission even between runtime timer ticks', () => {
    const { room, at } = clockRoom(1)
    room.open('player-a')()
    at(10_000)
    room.open('player-b')
    expect(room.isReserved('player-a')).toBe(false)
    expect(room.hasConnection('player-b')).toBe(true)
    expect(room.counts()).toEqual({ onlinePlayers: 1, reservedPlayers: 0 })
  })

  it('releases logout/session-expiry cleanup without reserving the last slot', () => {
    const { room } = clockRoom(1)
    const disconnect = room.open('player-a')
    disconnect(false)
    expect(room.hasConnection('player-a')).toBe(false)
    expect(room.isReserved('player-a')).toBe(false)
    expect(room.counts()).toEqual({ onlinePlayers: 0, reservedPlayers: 0 })
    room.open('player-b')
    expect(room.hasConnection('player-b')).toBe(true)
  })

  it('keeps another active stream after session cleanup, then releases the last explicit cleanup', () => {
    const { room } = clockRoom(1)
    const first = room.open('player-a')
    const second = room.open('player-a')
    first(false)
    expect(room.counts()).toEqual({ onlinePlayers: 1, reservedPlayers: 0 })
    expect(room.revision).toBe(1)
    second(false)
    expect(room.counts()).toEqual({ onlinePlayers: 0, reservedPlayers: 0 })
    expect(room.revision).toBe(2)
  })

  it('makes old disconnect callbacks harmless after a reconnect or replacement slot', () => {
    const { room } = clockRoom(1)
    const old = room.open('player-a')
    old()
    const current = room.open('player-a')
    const revision = room.revision
    old(false)
    old()
    expect(room.hasConnection('player-a')).toBe(true)
    expect(room.revision).toBe(revision)
    current(false)
    room.open('player-a')
    current()
    expect(room.hasConnection('player-a')).toBe(true)
    expect(room.counts()).toEqual({ onlinePlayers: 1, reservedPlayers: 0 })
  })

  it('releases only a reservation and does so idempotently', () => {
    const { room } = clockRoom(1)
    expect(room.releaseReservation('missing')).toBe(false)
    const disconnect = room.open('player-a')
    expect(room.releaseReservation('player-a')).toBe(false)
    expect(room.hasConnection('player-a')).toBe(true)
    disconnect()
    expect(room.releaseReservation('player-a')).toBe(true)
    const revision = room.revision
    expect(room.releaseReservation('player-a')).toBe(false)
    disconnect(false)
    expect(room.revision).toBe(revision)
    expect(room.counts()).toEqual({ onlinePlayers: 0, reservedPlayers: 0 })
  })

  it('sweeps several expired slots together, leaves live slots alone, and reports no-op sweeps', () => {
    const { room, at } = clockRoom(3)
    room.open('a')()
    room.open('b')()
    room.open('live')
    const revision = room.revision
    at(10_000)
    expect(room.sweep()).toBe(true)
    expect(room.revision).toBe(revision + 1)
    expect(room.counts()).toEqual({ onlinePlayers: 1, reservedPlayers: 0 })
    expect(room.sweep()).toBe(false)
    expect(room.revision).toBe(revision + 1)
  })

  it('supports a shorter injected grace and one stream per identity', () => {
    const { room, at } = clockRoom(1, { reconnectGraceMs: 25, maxConnectionsPerPlayer: 1 })
    const disconnect = room.open('a')
    expect(() => room.open('a')).toThrowError(expect.objectContaining({ code: 'TOO_MANY_CONNECTIONS' }))
    disconnect()
    at(25)
    expect(room.sweep()).toBe(true)
  })

  it('does not create a zero-duration reservation', () => {
    const { room } = clockRoom(1, { reconnectGraceMs: 0 })
    room.open('a')()
    expect(room.isReserved('a')).toBe(false)
    expect(room.counts()).toEqual({ onlinePlayers: 0, reservedPlayers: 0 })
    expect(room.sweep()).toBe(false)
  })

  it.each([0, -1, 1.5, NaN, Infinity])('rejects an invalid capacity %s', capacity => {
    expect(() => new RoomPresence(capacity)).toThrow(RangeError)
  })

  it('rejects invalid grace or a stream limit above the hard two-stream bound', () => {
    expect(() => new RoomPresence(50, { reconnectGraceMs: -1 })).toThrow(RangeError)
    expect(() => new RoomPresence(50, { reconnectGraceMs: Infinity })).toThrow(RangeError)
    expect(() => new RoomPresence(50, { maxConnectionsPerPlayer: 3 })).toThrow(RangeError)
    expect(() => new RoomPresence(50, { maxConnectionsPerPlayer: 0 })).toThrow(RangeError)
  })
})
