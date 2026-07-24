import { describe, it, expect } from 'vitest'
import { parseQuery, matchesSearch } from '../src/utils/search.js'
import { GAMES } from '../src/data/schedule.js'

const count = (q) => {
  const p = parseQuery(q)
  return GAMES.filter((g) => matchesSearch(g, p)).length
}

// A game whose abbreviations aren't in TEAM_BY_ABBR — exercises the unknown-team and
// missing-field fallbacks without depending on the committed snapshot.
const bogus = { home: 'ZZZ', away: 'YYY' }

describe('parseQuery', () => {
  it('treats bare text as free text', () => {
    expect(parseQuery('Storm')).toEqual({ free: 'Storm', tokens: [] })
  })

  it('returns an empty query for empty input', () => {
    expect(parseQuery('')).toEqual({ free: '', tokens: [] })
    expect(parseQuery()).toEqual({ free: '', tokens: [] })
  })

  it('parses a single scoped token', () => {
    expect(parseQuery('team: Storm')).toEqual({
      free: '',
      tokens: [{ field: 'team', value: 'Storm' }],
    })
  })

  it('parses multiple tokens, with or without a space after the colon', () => {
    expect(parseQuery('team:SEA city:Seattle')).toEqual({
      free: '',
      tokens: [
        { field: 'team', value: 'SEA' },
        { field: 'city', value: 'Seattle' },
      ],
    })
  })

  it('maps venue aliases (arena / stadium) to venue', () => {
    expect(parseQuery('venue: Climate').tokens[0].field).toBe('venue')
    expect(parseQuery('arena: Climate').tokens[0].field).toBe('venue')
    expect(parseQuery('stadium: Climate').tokens[0].field).toBe('venue')
  })

  it('maps broadcast aliases (tv / network / watch) to broadcast', () => {
    expect(parseQuery('broadcast: ION').tokens[0].field).toBe('broadcast')
    expect(parseQuery('tv: ION').tokens[0].field).toBe('broadcast')
    expect(parseQuery('network: ION').tokens[0].field).toBe('broadcast')
    expect(parseQuery('watch: ION').tokens[0].field).toBe('broadcast')
  })

  it('keeps leading bare text as free text alongside tokens', () => {
    expect(parseQuery('Storm team: SEA')).toEqual({
      free: 'Storm',
      tokens: [{ field: 'team', value: 'SEA' }],
    })
  })

  it('treats an unknown field as free text', () => {
    expect(parseQuery('coach: Someone')).toEqual({ free: 'Someone', tokens: [] })
  })

  it('drops a scoped field with no value', () => {
    expect(parseQuery('team:')).toEqual({ free: '', tokens: [] })
  })
})

describe('matchesSearch', () => {
  it('matches a team by nickname, city, abbreviation, and full name', () => {
    expect(count('team: Storm')).toBeGreaterThan(0)
    expect(count('team: Storm')).toBe(count('team: Seattle'))
    expect(count('team: Storm')).toBe(count('team: SEA'))
    expect(count('team: Storm')).toBe(count('team: Seattle Storm'))
  })

  it('matches either side of the game', () => {
    // Every Storm game, home or away, counts.
    const storm = GAMES.filter((g) => g.home === 'SEA' || g.away === 'SEA').length
    expect(count('team: Storm')).toBe(storm)
  })

  it('scopes by city', () => {
    const seattle = GAMES.filter((g) => g.city === 'Seattle').length
    expect(count('city: Seattle')).toBe(seattle)
    expect(seattle).toBeGreaterThan(0)
  })

  it('scopes by venue (and its aliases)', () => {
    const arena = GAMES.filter((g) => /climate pledge/i.test(g.venue)).length
    expect(count('venue: Climate Pledge')).toBe(arena)
    expect(count('arena: Climate Pledge')).toBe(arena)
    expect(arena).toBeGreaterThan(0)
  })

  it('scopes by broadcast (and its aliases)', () => {
    const ion = GAMES.filter((g) => (g.broadcast || []).some((b) => /ion/i.test(b))).length
    expect(count('broadcast: ION')).toBe(ion)
    expect(count('tv: ION')).toBe(ion)
    expect(count('network: ION')).toBe(ion)
    expect(ion).toBeGreaterThan(0)
  })

  it('matches broadcast in unscoped free text', () => {
    // A network name with no scope still hits via the broad substring match.
    expect(count('ION')).toBeGreaterThan(0)
  })

  it('handles a game with no broadcast list', () => {
    const noTv = { home: 'ZZZ', away: 'YYY' }
    expect(matchesSearch(noTv, parseQuery('broadcast: ION'))).toBe(false)
    expect(matchesSearch(noTv, parseQuery('tv: anything'))).toBe(false)
  })

  it('combines tokens (AND semantics)', () => {
    // A Storm game played in Seattle is a subset of all Storm games.
    expect(count('team: Storm city: Seattle')).toBeLessThanOrEqual(count('team: Storm'))
    expect(count('team: Storm city: Seattle')).toBeGreaterThan(0)
  })

  it('does a broad substring match on unscoped free text', () => {
    // Free text hits team names, city, and venue alike.
    expect(count('Seattle')).toBeGreaterThan(0)
    expect(count('climate pledge')).toBeGreaterThan(0)
  })

  it('returns everything for an empty query', () => {
    expect(count('')).toBe(GAMES.length)
  })

  it('returns nothing when nothing matches', () => {
    expect(count('team: Nonexistent')).toBe(0)
    expect(count('zzzznope')).toBe(0)
  })

  it('handles games with unknown teams and missing fields', () => {
    // Unknown abbr falls back to the raw string; missing city/venue don't throw.
    expect(matchesSearch(bogus, parseQuery('team: zzz'))).toBe(true)
    expect(matchesSearch(bogus, parseQuery('zzz'))).toBe(true)
    expect(matchesSearch(bogus, parseQuery('city: nowhere'))).toBe(false)
    expect(matchesSearch(bogus, parseQuery('venue: nowhere'))).toBe(false)
  })

  it('handles a game with empty team abbreviations', () => {
    // An empty abbr resolves to no team and an empty search string, matching nothing
    // specific but never throwing.
    const blank = { home: '', away: '', city: '', venue: '' }
    expect(matchesSearch(blank, parseQuery('team: anything'))).toBe(false)
    expect(matchesSearch(blank, parseQuery(''))).toBe(true)
  })
})
