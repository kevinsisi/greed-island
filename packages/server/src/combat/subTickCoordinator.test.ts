import { describe, expect, it, vi } from 'vitest'
import type { Event, EventDraft } from '../kernel/types.js'
import {
  CombatSubTickCoordinator,
  toQueuedCombatCardPlayCommand,
} from './subTickCoordinator.js'

function initiateEvent(options: { npcHp?: number } = {}): Pick<Event, 'eventType' | 'payload'> {
  return {
    eventType: 'COMBAT_INITIATE',
    payload: {
      actorType: 'player',
      data: {
        combatId: 'combat_live',
        playerAccountId: 'actor_a',
        npcId: 'npc_target',
        playerCombatHp: 100,
        npcCombatHp: options.npcHp ?? 100,
        narration: 'start',
      },
      narration: 'start',
    },
  }
}

function queuedFireLash(combatTick = 1) {
  return toQueuedCombatCardPlayCommand({
    commandId: `cmd_fire_${combatTick}`,
    actorId: 'actor_a',
    tick: 12,
    submittedAt: 1000,
    payload: {
      combatId: 'combat_live',
      combatTick,
      cardClass: 'FIRE_LASH',
      targetActorId: 'npc_target',
    },
  })
}

function cardPlayEvent(combatTick = 1): Pick<Event, 'eventType' | 'payload' | 'actorId' | 'commandId' | 'tick' | 'occurredAt'> {
  return {
    eventType: 'COMBAT_CARD_PLAY',
    actorId: 'actor_a',
    commandId: `cmd_fire_${combatTick}`,
    tick: 12,
    occurredAt: 1000,
    payload: {
      actorType: 'player',
      data: {
        combatId: 'combat_live',
        combatTick,
        cardClass: 'FIRE_LASH',
        targetActorId: 'npc_target',
      },
      narration: null,
    },
  }
}

function resolveEvent(): Pick<Event, 'eventType' | 'payload'> {
  return {
    eventType: 'COMBAT_RESOLVE',
    payload: { combatId: 'combat_live', combatTick: 3, outcome: 'npc_defeated' },
  }
}

function defeatEvent(): Pick<Event, 'eventType' | 'payload'> {
  return {
    eventType: 'COMBAT_DEFEAT',
    payload: { combatId: 'combat_live', combatTick: 3, actorId: 'npc_target', finalHp: 0 },
  }
}

function commitDrafts(drafts: readonly EventDraft[]): readonly Event[] {
  return drafts.map((draft, index) => ({ ...draft, sequence: index + 1 }))
}

describe('CombatSubTickCoordinator', () => {
  it('commits one sub-tick batch and fans out only after commit', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.projectEvent(initiateEvent())
    coordinator.projectEvent(cardPlayEvent())
    const order: string[] = []
    let committedTypes: string[] = []

    const events = coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 1,
      tick: 12,
      occurredAt: 2000,
      commit: (drafts) => {
        order.push('commit')
        committedTypes = drafts.map((draft) => draft.eventType)
        return commitDrafts(drafts)
      },
      afterCommit: (committed) => {
        order.push('afterCommit')
        expect(committed.map((event) => event.eventType)).toEqual(committedTypes)
      },
    })

    expect(order).toEqual(['commit', 'afterCommit'])
    expect(committedTypes).toEqual([
      'COMBAT_CARD_PLAY_ACCEPTED',
      'COMBAT_DAMAGE',
      'COMBAT_STATUS_APPLY',
    ])
    expect(events.map((event) => event.eventType)).toEqual(committedTypes)
    expect(coordinator.pendingCount('combat_live')).toBe(0)
  })

  it('keeps pending commands and skips fanout when the commit fails', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.projectEvent(initiateEvent())
    coordinator.projectEvent(cardPlayEvent())
    const afterCommit = vi.fn()

    expect(() => coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 1,
      tick: 12,
      occurredAt: 2000,
      commit: () => {
        throw new Error('commit failed')
      },
      afterCommit,
    })).toThrow('commit failed')

    expect(afterCommit).not.toHaveBeenCalled()
    expect(coordinator.pendingCount('combat_live')).toBe(1)

    const retried = coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 1,
      tick: 12,
      occurredAt: 2001,
      commit: commitDrafts,
      afterCommit,
    })

    expect(retried.map((event) => event.eventType)).toEqual([
      'COMBAT_CARD_PLAY_ACCEPTED',
      'COMBAT_DAMAGE',
      'COMBAT_STATUS_APPLY',
    ])
    expect(afterCommit).toHaveBeenCalledTimes(1)
    expect(coordinator.pendingCount('combat_live')).toBe(0)
  })

  it('projects committed sub-tick state so later runtime ticks process statuses', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.projectEvent(initiateEvent())
    coordinator.projectEvent(cardPlayEvent(1))

    coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 1,
      tick: 12,
      occurredAt: 2000,
      commit: commitDrafts,
    })

    const tickEvents = coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 2,
      tick: 12,
      occurredAt: 2100,
      commit: commitDrafts,
    })

    expect(tickEvents.map((event) => event.eventType)).toEqual(['COMBAT_STATUS_TICK'])
    expect(tickEvents[0]?.payload).toMatchObject({
      combatId: 'combat_live',
      combatTick: 2,
      targetActorId: 'npc_target',
      statusId: 'burn',
      remainingTicksAfter: 29,
    })
  })

  it('does not call commit when a combat has no due commands or active statuses', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.projectEvent(initiateEvent())
    const commit = vi.fn(commitDrafts)

    const events = coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 1,
      tick: 12,
      occurredAt: 2000,
      commit,
    })

    expect(events).toEqual([])
    expect(commit).not.toHaveBeenCalled()
  })

  it('does not mutate projection state on ticks that commit no events', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.projectEvent(initiateEvent())
    coordinator.projectEvent({
      eventType: 'COMBAT_TARGET_LOCK',
      payload: {
        combatId: 'combat_live',
        combatTick: 1,
        sourceActorId: 'npc_target',
        targetActorId: 'actor_a',
        durationTicks: 1,
        cardClass: 'NO_ESCAPE',
      },
    })

    const emptyCommit = vi.fn(commitDrafts)
    expect(coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 2,
      tick: 12,
      occurredAt: 2000,
      commit: emptyCommit,
    })).toEqual([])
    expect(emptyCommit).not.toHaveBeenCalled()

    coordinator.enqueueCardPlay(queuedFireLash(3))
    const nextEvents = coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 3,
      tick: 12,
      occurredAt: 2100,
      commit: commitDrafts,
    })

    expect(nextEvents.map((event) => event.eventType)).toEqual(['COMBAT_CARD_PLAY_REJECTED'])
    expect((nextEvents[0]?.payload as { reason?: unknown }).reason).toBe('target_locked')
  })

  it('rebuilds pending card plays from EventLog and removes resolved command ids', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.rebuildFromEvents([initiateEvent(), cardPlayEvent(1)])

    expect(coordinator.pendingCount('combat_live')).toBe(1)

    coordinator.projectEvent({
      eventType: 'COMBAT_CARD_PLAY_ACCEPTED',
      commandId: 'cmd_fire_1',
      payload: { combatId: 'combat_live', combatTick: 1 },
    })

    expect(coordinator.pendingCount('combat_live')).toBe(0)
  })

  it('does not treat unresolved card play command events as completed resume ticks', () => {
    const coordinator = new CombatSubTickCoordinator()
    const events = [initiateEvent(), cardPlayEvent(10)]

    expect(coordinator.resumeTickForCombat('combat_live', events)).toBe(0)

    coordinator.rebuildFromEvents(events)
    const committed = coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 10,
      tick: 12,
      occurredAt: 2000,
      commit: commitDrafts,
    })

    expect(committed.map((event) => event.eventType)).toEqual([
      'COMBAT_CARD_PLAY_ACCEPTED',
      'COMBAT_DAMAGE',
      'COMBAT_STATUS_APPLY',
    ])
    expect(coordinator.pendingCount('combat_live')).toBe(0)
  })

  it('rejects stale pending card plays instead of leaving them queued forever', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.projectEvent(initiateEvent())
    coordinator.projectEvent(cardPlayEvent(1))

    const committed = coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 2,
      tick: 12,
      occurredAt: 2000,
      commit: commitDrafts,
    })

    expect(committed.map((event) => event.eventType)).toEqual(['COMBAT_CARD_PLAY_REJECTED'])
    expect(committed[0]?.payload).toMatchObject({
      combatId: 'combat_live',
      combatTick: 2,
      requestedCombatTick: 1,
      reason: 'stale_combat_tick',
    })
    expect(coordinator.pendingCount('combat_live')).toBe(0)
  })

  it('does not queue card plays committed after combat resolution', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.rebuildFromEvents([initiateEvent(), resolveEvent(), cardPlayEvent(4)])

    expect(coordinator.pendingCount('combat_live')).toBe(0)
    expect(coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 4,
      tick: 12,
      occurredAt: 2000,
      commit: commitDrafts,
    })).toEqual([])
  })

  it('clears future queued card plays when the live sub-tick resolves combat', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.projectEvent(initiateEvent({ npcHp: 10 }))
    coordinator.projectEvent(cardPlayEvent(1))
    coordinator.projectEvent(cardPlayEvent(9))

    const committed = coordinator.processTick({
      combatId: 'combat_live',
      combatTick: 1,
      tick: 12,
      occurredAt: 2000,
      commit: commitDrafts,
    })

    expect(committed.map((event) => event.eventType)).toContain('COMBAT_RESOLVE')
    expect(coordinator.pendingCount('combat_live')).toBe(0)
  })

  it('clears queued card plays when projecting standalone defeat events', () => {
    const coordinator = new CombatSubTickCoordinator()
    coordinator.projectEvent(initiateEvent())
    coordinator.projectEvent(cardPlayEvent(9))

    expect(coordinator.pendingCount('combat_live')).toBe(1)

    coordinator.projectEvent(defeatEvent())

    expect(coordinator.pendingCount('combat_live')).toBe(0)
  })

  it('derives resume tick from the highest committed combatTick', () => {
    const coordinator = new CombatSubTickCoordinator()
    const events = [
      initiateEvent(),
      cardPlayEvent(10),
      { eventType: 'COMBAT_STATUS_TICK', payload: { combatId: 'combat_live', combatTick: 3 } },
      { eventType: 'COMBAT_DAMAGE', payload: { combatId: 'combat_live', combatTick: 5 } },
      { eventType: 'COMBAT_DAMAGE', payload: { combatId: 'other_combat', combatTick: 9 } },
    ]

    expect(coordinator.resumeTickForCombat('combat_live', events)).toBe(5)
  })
})
