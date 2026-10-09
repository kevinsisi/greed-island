import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { en } from '../i18n/en'
import { zh } from '../i18n/zh'
import { registrationError } from '../multiplayer3d/protocol'

/** Source-contract regression; mounted browser validation remains a separate gate. */
function newPasswordInputAttributes() {
  const source = ts.createSourceFile('ProfilePage.tsx',
    readFileSync(new URL('./ProfilePage.tsx', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const inputs: Map<string, string | number | boolean>[] = []
  function visit(node: ts.Node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === 'input') {
      const attributes = new Map<string, string | number | boolean>()
      for (const property of node.attributes.properties) {
        if (!ts.isJsxAttribute(property)) continue
        const value = property.initializer
        if (!value) attributes.set(property.name.getText(source), true)
        else if (ts.isStringLiteral(value)) attributes.set(property.name.getText(source), value.text)
        else if (ts.isJsxExpression(value) && value.expression && ts.isNumericLiteral(value.expression)) {
          attributes.set(property.name.getText(source), Number(value.expression.text))
        }
      }
      if (attributes.get('autoComplete') === 'new-password') inputs.push(attributes)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return inputs
}

describe('profile canonical password policy', () => {
  it('declares both new-password inputs with the canonical 12–200 HTML bounds', () => {
    const inputs = newPasswordInputAttributes()
    expect(inputs).toHaveLength(2)
    for (const input of inputs) {
      expect(input.get('required')).toBe(true)
      expect(input.get('minLength')).toBe(12)
      expect(input.get('maxLength')).toBe(200)
    }
  })

  it('matches registration boundaries and explains both limits in each locale', () => {
    for (const length of [11, 201]) {
      expect(registrationError('valid_user', 'a'.repeat(length), 'a'.repeat(length))).not.toBeNull()
    }
    for (const length of [12, 200]) {
      expect(registrationError('valid_user', 'a'.repeat(length), 'a'.repeat(length))).toBeNull()
    }
    expect(en['profile.password.tooShort']).toBe('Password must be 12–200 characters.')
    expect(zh['profile.password.tooShort']).toBe('密碼須為 12–200 個字元。')
  })
})
