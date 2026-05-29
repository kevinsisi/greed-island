// GM/admin family tree endpoint — returns the household graph with members,
// children, matured status, deceased status. Read-only projection.
//
// Renders the §43 «後代會記得他» picture: who's in which household, who their
// kids are, which kids have matured into runtime NPCs.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { AccountStore } from './accounts.js'
import { requireRole, type AuthConfig } from './auth.js'

export type AdminLineageRouterInput = Readonly<{
  runtime: SimulationRuntime
  accounts: AccountStore
  authConfig: AuthConfig
}>

export type LineageMember = Readonly<{
  npcId: string
  nameZh: string
  deceased: boolean
}>

export type LineageChild = Readonly<{
  childId: string
  nameZh: string
  nameEn: string
  bornAtTick: number
  matured: boolean
  deceased: boolean
}>

export type LineageHousehold = Readonly<{
  householdId: string
  homeTileId: string
  formedAtTick: number
  partners: readonly LineageMember[]
  children: readonly LineageChild[]
}>

export type LineageResponse = Readonly<{
  generatedAtTick: number
  households: readonly LineageHousehold[]
}>

export function createAdminLineageRouter(input: AdminLineageRouterInput): Router {
  const router = Router()
  const requireGmOrAdmin = requireRole(input.authConfig, input.accounts, 'gm', 'admin')

  router.get('/admin/lineage', requireGmOrAdmin, (_req: Request, res: Response) => {
    const runtime = input.runtime
    const generatedAtTick = runtime.getSnapshot().tick
    const lifeExpansion = runtime.getLifeExpansion()
    const bornNpcs = runtime.getBornNpcsProjection()
    const mortality = runtime.getNpcMortalityProjection()
    // Admin lineage MUST display deceased members (§43.1 「後代會記得他」).
    const allNpcs = runtime.getNpcsIncludingDeceased()
    const npcNameById = new Map<string, string>()
    for (const n of allNpcs) npcNameById.set(n.id, n.name.zh)

    const households: LineageHousehold[] = []
    for (const h of Object.values(lifeExpansion.households)) {
      const partners: LineageMember[] = h.partnerNpcIds.map((id) => ({
        npcId: id,
        nameZh: npcNameById.get(id) ?? id,
        deceased: mortality.isDeceased(id),
      }))
      const children: LineageChild[] = []
      for (const cid of h.childIds) {
        const c = lifeExpansion.children[cid]
        if (!c) continue
        children.push({
          childId: c.childId,
          nameZh: c.nameZh,
          nameEn: c.nameEn,
          bornAtTick: c.bornAtTick,
          matured: bornNpcs.isMatured(c.childId),
          deceased: mortality.isDeceased(c.childId),
        })
      }
      households.push({
        householdId: h.householdId,
        homeTileId: h.homeTileId,
        formedAtTick: h.formedAtTick,
        partners,
        children: children.sort((a, b) => a.bornAtTick - b.bornAtTick),
      })
    }
    households.sort((a, b) => a.formedAtTick - b.formedAtTick)

    const response: LineageResponse = { generatedAtTick, households }
    res.json(response)
  })

  return router
}
