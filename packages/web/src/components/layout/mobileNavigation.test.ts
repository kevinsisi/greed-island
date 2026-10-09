import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { mobileNavigation } from './mobileNavigation'

const primary = [{ to: '/game', icon: 'hub' }, { to: '/game/codex', icon: 'codex' },
  { to: '/game/timeline', icon: 'timeline' }, { to: '/game/ecology', icon: 'ecology' }]
const overflow = [{ to: '/game/social', icon: 'social' }, { to: '/game/market', icon: 'market' }]
const profile = { to: '/game/profile', icon: 'profile' }

describe('mobile game navigation preservation', () => {
  it('keeps Hub in the primary tabs and Profile in More for a signed-in player', () => {
    const nav = mobileNavigation([...primary, ...overflow, profile], '/game/profile')
    expect(nav.primaryItems).toEqual(primary)
    expect(nav.profileItem).toBe(profile)
    expect(nav.moreItems).toEqual([profile, ...overflow])
    expect(nav.moreActive).toBe(true)
  })

  it('matches exact More routes rather than marking every /game subroute active', () => {
    const items = [...primary, ...overflow, profile]
    for (const path of ['/game', '/game/hub', '/game/codex', '/game/timeline', '/game/ecology', '/game/social-extra']) {
      expect(mobileNavigation(items, path).moreActive).toBe(false)
    }
    for (const path of ['/game/profile', '/game/social', '/game/market']) {
      expect(mobileNavigation(items, path).moreActive).toBe(true)
    }
  })

  it('does not duplicate the /game guest account alias in the four primary tabs', () => {
    const account = { to: '/game', icon: 'account' }
    const nav = mobileNavigation([...primary, ...overflow, account], '/game/codex')
    expect(nav.primaryItems).toHaveLength(4)
    expect(nav.primaryItems).toEqual(primary)
    expect(nav.profileItem).toBe(account)
    expect(nav.moreItems).toEqual([account, ...overflow])
    expect(nav.moreActive).toBe(false)
  })

  it('keeps administrator entries inside More with their exact route', () => {
    const admin = { to: '/game/admin', icon: 'admin' }
    const world = { to: '/game/admin/world', icon: 'gmWorld' }
    const items = [...primary, ...overflow, profile, admin, world]
    expect(mobileNavigation(items, world.to).moreItems).toContain(world)
    expect(mobileNavigation(items, admin.to).moreItems).toContain(admin)
    expect(mobileNavigation(items, world.to).moreActive).toBe(true)
    expect(mobileNavigation(items, '/game/admin/unknown').moreActive).toBe(false)
  })

  it('retains visible admin links to cards, NPCs, lineage and world management', () => {
    const source = ts.createSourceFile('AdminPage.tsx',
      readFileSync(new URL('../../pages/AdminPage.tsx', import.meta.url), 'utf8'),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const links: string[] = []
    function visit(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'Link') {
        for (const property of node.attributes.properties) {
          if (ts.isJsxAttribute(property) && property.name.getText(source) === 'to'
            && property.initializer && ts.isStringLiteral(property.initializer)) links.push(property.initializer.text)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(links).toEqual(['/game/admin/world', '/game/admin/npcs', '/game/admin/lineage', '/game/admin/cards'])
  })
})
