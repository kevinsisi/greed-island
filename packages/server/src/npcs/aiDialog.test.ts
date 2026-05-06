import { describe, expect, it } from 'vitest'
import { parseReply } from './aiDialog.js'

describe('parseReply', () => {
  it('parses a clean JSON reply', () => {
    const raw = JSON.stringify({
      zh: '「你又來了。」',
      en: '"You are back."',
      intent: 'greet',
      trustDelta: 1,
    })
    const out = parseReply(raw)
    expect(out).not.toBeNull()
    expect(out!.zh).toContain('你又來了')
    expect(out!.en).toContain('You are back')
    expect(out!.intent).toBe('greet')
    expect(out!.trustDelta).toBe(1)
  })

  it('parses a reply wrapped in a json fence', () => {
    const raw = '```json\n' + JSON.stringify({
      zh: 'A', en: 'B', intent: 'ask', trustDelta: 0,
    }) + '\n```'
    const out = parseReply(raw)
    expect(out).not.toBeNull()
    expect(out!.intent).toBe('ask')
  })

  it('parses a reply with surrounding prose', () => {
    const raw = `Sure, here is the reply:\n${JSON.stringify({
      zh: 'X', en: 'Y', intent: 'trade', trustDelta: -2,
    })}\nHope that helps.`
    const out = parseReply(raw)
    expect(out).not.toBeNull()
    expect(out!.trustDelta).toBe(-2)
  })

  it('clamps trustDelta into [-5, 5]', () => {
    const raw = JSON.stringify({ zh: 'a', en: 'b', intent: 'leave', trustDelta: 99 })
    const out = parseReply(raw)
    expect(out).not.toBeNull()
    expect(out!.trustDelta).toBe(5)
  })

  it('rejects invalid intent', () => {
    const raw = JSON.stringify({ zh: 'a', en: 'b', intent: 'bogus', trustDelta: 0 })
    expect(parseReply(raw)).toBeNull()
  })

  it('rejects missing fields', () => {
    expect(parseReply('{"zh":"a"}')).toBeNull()
    expect(parseReply('not json at all')).toBeNull()
  })
})
