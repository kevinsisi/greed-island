// BuildingRuntime — 把 NPC area-level location 與 building-level
// presence 對齊。每 tick 給定 NPC 狀態，決定每位 NPC 是否「進入」其
// 常駐建築。
//
// 規則（v0.10.0 第一版，刻意保守）：
//   1. 找到該 NPC 的 ownerBuilding（owner_npc_id 對應的建築）。
//   2. 若 NPC 當前位置 = ownerBuilding.tileId、且活動為 work / trade /
//      eat / sleep，則 NPC 視為「在建築內」。
//   3. 沒有 owner building 但 activity = sleep 且該 tile 有住宅，挑一
//      棟住宅（deterministic by hash）作為睡眠地點。
//   4. 其他狀況：NPC 在 area scene 露出（沿用舊 sprite 邏輯）。

import type { NpcRuntimeState, NpcActivity } from '../sim/npcEngine.js'
import type { BuildingOccupant, BuildingRuntimeView } from './types.js'
import { findOwnerBuilding, listAllBuildings, listBuildingsForTile } from './catalog.js'

const INDOOR_ACTIVITIES: ReadonlySet<NpcActivity> = new Set([
  'work',
  'trade',
  'eat',
  'sleep'
])

export class BuildingRuntime {
  private npcInside = new Map<string, string | null>()

  reconcile(
    npcStates: ReadonlyMap<string, NpcRuntimeState>
  ): Array<{ npcId: string; from: string | null; to: string | null }> {
    const events: Array<{ npcId: string; from: string | null; to: string | null }> = []

    for (const [npcId, state] of npcStates) {
      const owner = findOwnerBuilding(npcId)
      let next: string | null = null
      if (owner && state.tile === owner.tileId && INDOOR_ACTIVITIES.has(state.activity)) {
        next = owner.id
      } else if (state.activity === 'sleep') {
        const homes = listBuildingsForTile(state.tile).filter(
          (b) => b.type === 'residential'
        )
        if (homes.length > 0) {
          let h = 5381
          for (const ch of npcId) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
          next = homes[h % homes.length]!.id
        }
      }
      const before = this.npcInside.get(npcId) ?? null
      if (before !== next) {
        events.push({ npcId, from: before, to: next })
        this.npcInside.set(npcId, next)
      }
    }

    return events
  }

  isNpcInside(npcId: string, buildingId: string): boolean {
    return this.npcInside.get(npcId) === buildingId
  }

  occupantsOf(buildingId: string): readonly BuildingOccupant[] {
    const out: BuildingOccupant[] = []
    for (const [npcId, bId] of this.npcInside) {
      if (bId !== buildingId) continue
      const owner = findOwnerBuilding(npcId)
      out.push({
        npcId,
        shift: null,
        isOwner: owner ? owner.id === buildingId : false
      })
    }
    return out
  }

  snapshotForTile(tileId: string): BuildingRuntimeView[] {
    return listBuildingsForTile(tileId).map((def) => ({
      def,
      occupants: this.occupantsOf(def.id)
    }))
  }

  snapshotAll(): BuildingRuntimeView[] {
    return listAllBuildings().map((def) => ({
      def,
      occupants: this.occupantsOf(def.id)
    }))
  }

  npcsOutsideOnTile(npcStates: ReadonlyMap<string, NpcRuntimeState>): Map<string, string[]> {
    const byTile = new Map<string, string[]>()
    for (const [npcId, state] of npcStates) {
      if (this.npcInside.get(npcId)) continue
      const arr = byTile.get(state.tile) ?? []
      arr.push(npcId)
      byTile.set(state.tile, arr)
    }
    return byTile
  }

  toJSON(): Record<string, string | null> {
    const out: Record<string, string | null> = {}
    for (const [k, v] of this.npcInside) out[k] = v
    return out
  }

  hydrate(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v === null) this.npcInside.set(k, null)
      else if (typeof v === 'string') this.npcInside.set(k, v)
    }
  }
}
