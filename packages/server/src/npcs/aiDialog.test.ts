import { describe, expect, it } from 'vitest'
import {
  buildRumorsBlock,
  buildKnownPersonBlock,
  buildRelationshipBlock,
  buildHouseholdBlock,
  buildAntiHallucinationBlock,
  buildEcologyBlock,
  buildRecentEventsBlock,
  buildSkillBlock,
  buildReflectionBlock,
  buildMemoryBlock,
  parseReply,
} from './aiDialog.js'

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

describe('buildRumorsBlock', () => {
  it('returns empty array when rumors is undefined', () => {
    expect(buildRumorsBlock(undefined)).toEqual([])
  })

  it('returns empty array when rumors is empty', () => {
    expect(buildRumorsBlock([])).toEqual([])
  })

  it('includes rumor content when rumors are present', () => {
    const rumors = [
      { topic: 'predator_death', subjectId: 'fog_wolf', tileId: 't_forest', accuracy: 90 },
    ]
    const lines = buildRumorsBlock(rumors)
    expect(lines.length).toBeGreaterThan(0)
    const joined = lines.join('\n')
    expect(joined).toContain('fog_wolf')
    expect(joined).toContain('90%')
  })

  it('caps at 3 rumors even when more are provided', () => {
    const rumors = [
      { topic: 'predator_death', subjectId: 's1', tileId: 't1', accuracy: 100 },
      { topic: 'predator_death', subjectId: 's2', tileId: 't2', accuracy: 90 },
      { topic: 'predator_death', subjectId: 's3', tileId: 't3', accuracy: 80 },
      { topic: 'construction_complete', subjectId: 'b1', tileId: 't4', accuracy: 70 },
      { topic: 'construction_complete', subjectId: 'b2', tileId: 't5', accuracy: 60 },
    ]
    const lines = buildRumorsBlock(rumors)
    const joined = lines.join('\n')
    expect(joined).toContain('s1')
    expect(joined).toContain('s2')
    expect(joined).toContain('s3')
    expect(joined).not.toContain('b1')
    expect(joined).not.toContain('b2')
  })
})

describe('buildKnownPersonBlock', () => {
  it('returns empty array when names is undefined', () => {
    expect(buildKnownPersonBlock(undefined)).toEqual([])
  })

  it('returns empty array when names is empty', () => {
    expect(buildKnownPersonBlock([])).toEqual([])
  })

  it('includes name content when names are present', () => {
    const lines = buildKnownPersonBlock(['沈若雲', '老王'])
    expect(lines.length).toBeGreaterThan(0)
    const joined = lines.join('\n')
    expect(joined).toContain('沈若雲')
    expect(joined).toContain('老王')
  })
})

describe('buildRelationshipBlock', () => {
  it('returns empty array when rows is undefined', () => {
    expect(buildRelationshipBlock(undefined)).toEqual([])
  })

  it('returns empty array when rows is empty', () => {
    expect(buildRelationshipBlock([])).toEqual([])
  })

  it('includes friend name in output', () => {
    const lines = buildRelationshipBlock([
      { nameZh: '沈若雲', trust: 80, type: 'friend', interactionCount: 12 },
    ])
    const joined = lines.join('\n')
    expect(joined).toContain('沈若雲')
    expect(joined).toContain('友好')
    expect(joined).toContain('80')
  })

  it('includes rival name in output', () => {
    const lines = buildRelationshipBlock([
      { nameZh: '烏鴉王', trust: 20, type: 'rival', interactionCount: 5 },
    ])
    const joined = lines.join('\n')
    expect(joined).toContain('烏鴉王')
    expect(joined).toContain('對立')
    expect(joined).toContain('20')
  })

  it('separates friends, rivals, and neutrals into distinct lines', () => {
    const lines = buildRelationshipBlock([
      { nameZh: '老王', trust: 80, type: 'friend', interactionCount: 8 },
      { nameZh: '小張', trust: 50, type: 'neutral', interactionCount: 3 },
      { nameZh: '刀疤李', trust: 15, type: 'rival', interactionCount: 2 },
    ])
    const joined = lines.join('\n')
    expect(joined).toContain('友好')
    expect(joined).toContain('對立')
    expect(joined).toContain('普通')
    expect(joined).toContain('老王')
    expect(joined).toContain('刀疤李')
    expect(joined).toContain('小張')
  })
})

describe('buildHouseholdBlock', () => {
  it('returns empty array when members is undefined', () => {
    expect(buildHouseholdBlock(undefined)).toEqual([])
  })

  it('returns empty array when members is empty', () => {
    expect(buildHouseholdBlock([])).toEqual([])
  })

  it('includes member name and role in output', () => {
    const lines = buildHouseholdBlock([
      { nameZh: '王大嫂', role: '漁民妻子' },
      { nameZh: '小虎', role: '學徒' },
    ])
    const joined = lines.join('\n')
    expect(joined).toContain('王大嫂')
    expect(joined).toContain('漁民妻子')
    expect(joined).toContain('小虎')
    expect(joined).toContain('學徒')
  })

  it('includes family context instruction in output', () => {
    const lines = buildHouseholdBlock([{ nameZh: '老李', role: '商人' }])
    const joined = lines.join('\n')
    expect(joined).toContain('家人')
  })
})

describe('buildAntiHallucinationBlock', () => {
  it('includes known person names in output', () => {
    const lines = buildAntiHallucinationBlock(['沈若雲'], ['fog_wolf'])
    const joined = lines.join('\n')
    expect(joined).toContain('沈若雲')
  })

  it('includes species names when provided', () => {
    const lines = buildAntiHallucinationBlock([], ['fog_wolf', 'forest_deer'])
    const joined = lines.join('\n')
    expect(joined).toContain('fog_wolf')
    expect(joined).toContain('forest_deer')
  })

  it('omits species names when species list is empty', () => {
    const lines = buildAntiHallucinationBlock(['沈若雲'], [])
    const joined = lines.join('\n')
    expect(joined).not.toContain('fog_wolf')
    expect(joined).toContain('禁止提及任何具體生物種名')
  })
})

describe('buildEcologyBlock', () => {
  it('returns empty array when both ecology and fishery are undefined', () => {
    expect(buildEcologyBlock(undefined, undefined)).toEqual([])
  })

  it('returns empty array when ecology is empty and fishery is null', () => {
    expect(buildEcologyBlock([], null)).toEqual([])
  })

  it('includes animal count lines when ecology data is present', () => {
    const lines = buildEcologyBlock([{ speciesId: 'fog_wolf', count: 3 }], null)
    const joined = lines.join('\n')
    expect(joined).toContain('fog_wolf')
    expect(joined).toContain('3')
  })

  it('includes fishery density in output', () => {
    const lines = buildEcologyBlock([], { density: 'scarce', collapsed: false })
    const joined = lines.join('\n')
    expect(joined).toContain('scarce')
  })

  it('shows collapsed label when fishery is collapsed', () => {
    const lines = buildEcologyBlock([], { density: 'depleted', collapsed: true })
    const joined = lines.join('\n')
    expect(joined).toContain('崩潰')
  })

  it('sorts animal rows by count desc with speciesId lex tiebreak', () => {
    const lines = buildEcologyBlock(
      [
        { speciesId: 'marsh_heron', count: 1 },
        { speciesId: 'forest_deer', count: 4 },
        { speciesId: 'fog_wolf', count: 4 },
      ],
      null,
    )
    const animalLines = lines.filter((l) => l.startsWith('  · '))
    expect(animalLines).toHaveLength(3)
    // count desc puts the two 4s before the 1; lex tiebreak puts
    // 'fog_wolf' < 'forest_deer' < 'marsh_heron'.
    expect(animalLines[0]).toContain('fog_wolf')
    expect(animalLines[1]).toContain('forest_deer')
    expect(animalLines[2]).toContain('marsh_heron')
  })

  it('includes plant rows sorted by saturation desc', () => {
    const lines = buildEcologyBlock(undefined, null, undefined, [
      { speciesId: 'oak', nameZh: '橡樹', saturationPct: 45 },
      { speciesId: 'pine', nameZh: '松木', saturationPct: 85 },
    ])
    const joined = lines.join('\n')
    expect(joined).toContain('橡樹')
    expect(joined).toContain('松木')
    expect(joined).toContain('稀疏')   // 45% → 稀疏
    expect(joined).toContain('繁盛')   // 85% → 繁盛
    const plantLines = lines.filter((l) => l.includes('植物'))
    // pine (85%) should appear before oak (45%)
    expect(plantLines[0]).toContain('松木')
    expect(plantLines[1]).toContain('橡樹')
  })

  it('returns empty when only plants array is empty', () => {
    expect(buildEcologyBlock(undefined, null, undefined, [])).toEqual([])
  })
})

describe('buildRecentEventsBlock', () => {
  it('returns empty array when events is undefined', () => {
    expect(buildRecentEventsBlock(undefined)).toEqual([])
  })

  it('returns empty array when events is empty', () => {
    expect(buildRecentEventsBlock([])).toEqual([])
  })

  it('includes event lines when events are provided', () => {
    const lines = buildRecentEventsBlock(['[tick 100] ANIMAL_STARVED', '[tick 101] NPC_INTERACT'])
    const joined = lines.join('\n')
    expect(joined).toContain('ANIMAL_STARVED')
    expect(joined).toContain('NPC_INTERACT')
  })
})

describe('grounded context — combined blocks', () => {
  it('anti-hallucination block contains both names and species constraint', () => {
    const block = buildAntiHallucinationBlock(['沈若雲', '老王'], ['fog_wolf']).join('\n')
    expect(block).toContain('反幻覺')
    expect(block).toContain('沈若雲')
    expect(block).toContain('老王')
    expect(block).toContain('fog_wolf')
  })

  it('ecology block correctly combines animal rows and fishery', () => {
    const block = buildEcologyBlock(
      [{ speciesId: 'fog_wolf', count: 3 }, { speciesId: 'forest_deer', count: 7 }],
      { density: 'moderate', collapsed: false },
    ).join('\n')
    expect(block).toContain('fog_wolf')
    expect(block).toContain('3')
    expect(block).toContain('forest_deer')
    expect(block).toContain('7')
    expect(block).toContain('moderate')
  })
})

describe('buildSkillBlock', () => {
  it('returns empty array for undefined', () => {
    expect(buildSkillBlock(undefined)).toEqual([])
  })

  it('returns empty array for empty array', () => {
    expect(buildSkillBlock([])).toEqual([])
  })

  it('returns non-empty lines for valid skill list with level', () => {
    const lines = buildSkillBlock([{ skillId: 'fishing', level: 2 }]).join('\n')
    expect(lines).toContain('捕魚')
    expect(lines).toContain('2')
  })

  it('includes all provided skills', () => {
    const lines = buildSkillBlock([
      { skillId: 'hunting', level: 1 },
      { skillId: 'construction', level: 3 },
    ]).join('\n')
    expect(lines).toContain('狩獵')
    expect(lines).toContain('1')
    expect(lines).toContain('建造')
    expect(lines).toContain('3')
  })
})

describe('buildReflectionBlock', () => {
  it('returns empty array for undefined', () => {
    expect(buildReflectionBlock(undefined)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(buildReflectionBlock('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(buildReflectionBlock('   ')).toEqual([])
  })

  it('includes the formatted reflection content in output', () => {
    const content = '### 你的近期行動記憶（意圖成敗形成的印象）\n  · 【生存】嘗試逃離危險地區 → 成功（你對自身判斷更有信心）'
    const joined = buildReflectionBlock(content).join('\n')
    expect(joined).toContain('你的近期行動記憶')
    expect(joined).toContain('嘗試逃離危險地區')
  })

  it('includes the usage rules block', () => {
    const content = '### 你的近期行動記憶\n  · 【生存】test'
    const joined = buildReflectionBlock(content).join('\n')
    expect(joined).toContain('⚠️ 記憶使用規則')
    expect(joined).toContain('禁止虛構記憶以外的事件')
    expect(joined).toContain('不要逐字列出記憶清單')
  })
})

describe('buildMemoryBlock', () => {
  it('returns [] when ctx is undefined', () => {
    expect(buildMemoryBlock(undefined)).toEqual([])
  })

  it('returns [] when ctx is empty string', () => {
    expect(buildMemoryBlock('')).toEqual([])
  })

  it('returns header line + ctx when ctx is present', () => {
    const ctx = '- [importance:9] 目睹派系奪權，感到恐懼'
    const result = buildMemoryBlock(ctx)
    expect(result.length).toBeGreaterThan(0)
    expect(result.join('\n')).toContain('個人記憶')
    expect(result.join('\n')).toContain(ctx)
  })
})
