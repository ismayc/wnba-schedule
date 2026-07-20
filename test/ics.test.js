import { describe, it, expect } from 'vitest'
import { buildIcs, escapeText, fold, toIcsDate } from '../src/utils/ics.js'
import { GAMES } from '../src/data/schedule.js'

const NOW = '2026-07-20T12:00:00.000Z'
const build = (games) => buildIcs(games, { now: NOW })
const lines = (ics) => ics.split('\r\n')

const played = GAMES.find((g) => g.score && g.venue)
const upcoming = GAMES.find((g) => !g.score && !g.postponed)

describe('escapeText', () => {
  it('escapes the RFC 5545 delimiters', () => {
    expect(escapeText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d')
  })

  it('turns newlines into the literal escape', () => {
    expect(escapeText('a\nb')).toBe('a\\nb')
    expect(escapeText('a\r\nb')).toBe('a\\nb')
  })
})

describe('toIcsDate', () => {
  it('emits a UTC basic-format timestamp', () => {
    expect(toIcsDate('2026-07-19T17:00:00.000Z')).toBe('20260719T170000Z')
  })
})

describe('fold', () => {
  it('leaves short lines alone', () => {
    expect(fold('SUMMARY:short')).toBe('SUMMARY:short')
  })

  it('folds past 75 octets with a leading space on continuations', () => {
    const out = fold('SUMMARY:' + 'x'.repeat(200))
    const parts = out.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true)
    // Reassembling must recover the original.
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe('SUMMARY:' + 'x'.repeat(200))
  })

  it('measures octets, not characters, and never splits a multi-byte char', () => {
    // 'é' is two bytes — a naive 75-character split would corrupt it.
    const out = fold('SUMMARY:' + 'é'.repeat(60))
    for (const part of out.split('\r\n')) {
      expect(part).not.toContain('�')
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    }
    expect(out.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(
      'SUMMARY:' + 'é'.repeat(60)
    )
  })
})

describe('buildIcs', () => {
  it('wraps events in a valid calendar envelope', () => {
    const l = lines(build([played]))
    expect(l[0]).toBe('BEGIN:VCALENDAR')
    expect(l).toContain('VERSION:2.0')
    expect(l.at(-2)).toBe('END:VCALENDAR')
  })

  it('uses CRLF line endings and a trailing break', () => {
    const ics = build([played])
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.includes('\n\n')).toBe(false)
  })

  it('emits one VEVENT per game', () => {
    const ics = build(GAMES.slice(0, 12))
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(12)
    expect(ics.match(/END:VEVENT/g)).toHaveLength(12)
  })

  it('gives each event a stable UID so re-import updates rather than duplicates', () => {
    const first = build([played])
    const second = build([played])
    expect(first).toBe(second)
    expect(first).toContain(`UID:${played.id}@the-wnba-schedule`)
  })

  it('puts the score in the title of a finished game but not an upcoming one', () => {
    expect(build([played])).toMatch(/SUMMARY:.*\(\d+–\d+\)/)
    expect(build([upcoming])).not.toMatch(/SUMMARY:.*\(\d+–\d+\)/)
  })

  it('includes venue and broadcast detail', () => {
    const ics = build([played])
    expect(ics).toContain('LOCATION:')
    if (played.broadcast?.length) expect(ics).toMatch(/DESCRIPTION:.*Watch/)
  })

  it('marks a postponed game cancelled rather than dropping it', () => {
    const off = GAMES.find((g) => g.postponed)
    expect(build([off])).toContain('STATUS:CANCELLED')
    expect(build([played])).not.toContain('STATUS:CANCELLED')
  })

  it('escapes commas in venue names so the field is not split', () => {
    const ics = build([{ ...played, venue: 'Arena, The', city: 'X', broadcast: undefined }])
    expect(ics).toContain('LOCATION:Arena\\, The\\, X')
  })

  it('holds up over the whole season', () => {
    const ics = build(GAMES)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(GAMES.length)
    // Every content line is within the octet limit once folded.
    for (const line of lines(ics)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })
})
