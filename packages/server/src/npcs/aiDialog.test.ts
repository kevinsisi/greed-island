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

  it('falls back to ask when intent is missing or invalid (v0.12 tolerance)', () => {
    // Per ARCHITECTURE §9 the AI's intent is advisory: when the model
    // omits it or returns garbage we still want a reply line, not the
    // whole static fallback library kicking in.
    const bogus = JSON.stringify({ zh: 'a', en: 'b', intent: 'bogus', trustDelta: 0 })
    const out = parseReply(bogus)
    expect(out).not.toBeNull()
    expect(out!.intent).toBe('ask')
    expect(out!.zh).toBe('a')
  })

  it('uses zh as fallback for missing/truncated en (v0.12 tolerance)', () => {
    // Reproduces the production failure: Gemini wrote a full zh string
    // then ran out of tokens mid-en. Old parser threw the whole reply
    // away; new parser keeps zh and mirrors it into en.
    const raw = '{"zh":"完整中文回覆","en":"Sorry I cut off mid-'
    const out = parseReply(raw)
    expect(out).not.toBeNull()
    expect(out!.zh).toBe('完整中文回覆')
    expect(out!.en.length).toBeGreaterThan(0)
  })

  it('rejects only when zh itself is missing or junk', () => {
    // Without a zh string we genuinely have nothing to show the player.
    expect(parseReply('not json at all')).toBeNull()
    expect(parseReply('{"en":"only english"}')).toBeNull()
  })

  it('parses a fenced reply whose closing ``` was truncated', () => {
    // Reproduces the production failure: Gemini opens ```json + complete
    // object but maxOutputTokens cuts off before the closing fence.
    const raw =
      '```json\n' +
      JSON.stringify({ zh: '喔？交易啊。', en: 'Trade, huh?', intent: 'trade', trustDelta: 0 })
    const out = parseReply(raw)
    expect(out).not.toBeNull()
    expect(out!.intent).toBe('trade')
  })

  it('repairs JSON truncated mid-string by closing the open string and braces', () => {
    // String value is cut off — repair should append `"` then `}`.
    const raw = '{"zh":"完整中文","en":"Hello there","intent":"ask","trustDelta":1'
    const out = parseReply(raw)
    expect(out).not.toBeNull()
    expect(out!.intent).toBe('ask')
    expect(out!.trustDelta).toBe(1)
  })
})
