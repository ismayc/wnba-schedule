import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildSeries, buildBracket } from '../src/utils/bracket.js'
import {
  computeStandings,
  compareTeams,
  magicNumber,
  playoffRace,
  conferenceStandings,
} from '../src/utils/standings.js'
import { seasonTotals, playersByTeam } from '../src/utils/stats.js'
import {
  detectTimezone,
  timezoneOptions,
  formatZoneAbbr,
  dayLabel,
  countdown,
  TIMEZONES,
} from '../src/utils/time.js'
import { buildIcs } from '../src/utils/ics.js'
import { writeState } from '../src/utils/urlState.js'
import { broadcastNotBadged } from '../src/utils/watch.js'

// ── bracket.js remaining branches ─────────────────────────────────────────
describe('buildSeries fallbacks', () => {
  const pg = (over) => ({ seasonType: 'playoffs', ...over })

  it('defaults an unknown round to a best-of-3 (lines 27, 64)', () => {
    const [s] = buildSeries([
      pg({ round: 'X', home: 'MIN', away: 'SEA', game: 1, tip: '2026-09-01T00:00:00Z', score: [90, 80] }),
      pg({ round: 'X', home: 'SEA', away: 'MIN', game: 2, tip: '2026-09-02T00:00:00Z', score: [70, 85] }),
    ])
    expect(s.bestOf).toBe(3)
    expect(s.need).toBe(2)
    expect(s.winner).toBe('MIN') // 2-0
  })

  it('orders games by tip when game numbers are absent, and hosts from game[0] (lines 46, 58)', () => {
    const [s] = buildSeries([
      pg({ round: 'R1', home: 'MIN', away: 'SEA', tip: '2026-09-02T00:00:00Z', score: [90, 80] }),
      pg({ round: 'R1', home: 'SEA', away: 'MIN', tip: '2026-09-01T00:00:00Z', score: [70, 85] }),
    ])
    // Both games lack a `game` number → sorted purely by tip, ascending.
    expect(s.games.map((g) => g.tip)).toEqual(['2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'])
    // With no game-1 marker, the host is taken from the first (earliest) game's home team.
    expect(s.order[0]).toBe(s.games[0].home)
    expect(s.order[0]).toBe('SEA')
  })
})

describe('buildBracket without seeding or semifinals', () => {
  // A playoff-only feed (no regular season → no seeding) whose games carry no tips:
  // position must be recovered from the first-round series themselves.
  const round1 = (home, away) => [
    { seasonType: 'playoffs', round: 'R1', home, away, game: 1, score: [90, 80] },
    { seasonType: 'playoffs', round: 'R1', home: away, away: home, game: 2, score: [70, 85] },
  ]
  const games = [
    ...round1('MIN', 'GS'),
    ...round1('PHX', 'NY'),
    ...round1('LV', 'SEA'),
    ...round1('IND', 'ATL'),
  ]

  it('recovers four first-round slots from the series alone (lines 126, 138, 143)', () => {
    const b = buildBracket(games)
    expect(b.projected).toBe(false)
    expect(b.rounds.R1).toHaveLength(4)
    // The game-1 home team swept each series 2-0 (winning game 2 on the road too).
    expect(b.rounds.R1.map((s) => s.winner).sort()).toEqual(['IND', 'LV', 'MIN', 'PHX'])
    // No semifinals played yet, so there is no champion.
    expect(b.champion).toBeNull()
  })
})

// ── standings.js remaining branches ───────────────────────────────────────
describe('standings edge cases', () => {
  const game = (over) => ({
    id: String(Math.random()),
    seasonType: 'regular',
    tip: '2026-05-10T00:00:00.000Z',
    home: 'MIN',
    away: 'SEA',
    score: [90, 80],
    ...over,
  })

  it('skips a game row for an unrecognized team abbreviation (line 54)', () => {
    // A stray abbr has no table row; that side is skipped while the real opponent counts.
    const t = computeStandings([game({ home: 'ZZZ', away: 'SEA', score: [90, 80] })])
    expect(t.ZZZ).toBeUndefined()
    expect(t.SEA).toMatchObject({ l: 1, road: { w: 0, l: 1 } })
  })

  it('breaks a win%% tie by record versus winning teams (lines 111, 116)', () => {
    // MIN and LV are both 1-1 and never met, so the comparison falls through to the
    // "win% vs teams .500-or-better" tiebreaker — where MIN did better.
    const games = [
      game({ home: 'MIN', away: 'ATL', score: [90, 80] }), // MIN beats ATL
      game({ home: 'ATL', away: 'WSH', score: [90, 80] }), // ATL now 1-1 (a .500 team MIN beat)
      game({ home: 'GS', away: 'MIN', score: [90, 80] }), // MIN loses to GS (also 1-0 here)
      game({ home: 'NY', away: 'LV', score: [90, 80] }), // LV loses to NY
      game({ home: 'LV', away: 'CHI', score: [90, 80] }), // LV beats a losing team CHI
    ]
    const table = computeStandings(games)
    expect(table.MIN.pct).toBe(table.LV.pct) // both 0.500
    // MIN's win over a .500 team ranks it ahead of LV → negative comparator.
    expect(compareTeams(table.MIN, table.LV, games, table)).toBeLessThan(0)
  })

  it('treats an opponent outside the league table as a sub-.500 team (line 111)', () => {
    // Both teams' only win is over a non-league opponent (no table row), so the
    // "vs winning teams" tiebreaker reads that opponent's pct as 0 and the two stay tied.
    const games = [
      game({ home: 'MIN', away: 'ZZZ', score: [90, 80] }),
      game({ home: 'LV', away: 'ZZZ', score: [90, 80] }),
    ]
    const table = computeStandings(games)
    expect(compareTeams(table.MIN, table.LV, games, table)).toBe(0)
  })

  it('computes a magic number and returns null once catching up is impossible (lines 168, 170)', () => {
    // Positive: a chaser with games left and a small deficit.
    expect(magicNumber({ w: 3 }, { abbr: 'X', gp: 5, w: 2 }, { X: 20 })).toBe(15)
    // Null: the chaser has no remaining games recorded and is already far back.
    expect(magicNumber({ w: 10 }, { abbr: 'X', gp: 5, w: 2 }, {})).toBeNull()
  })

  it('handles clinch and elimination with teams that have no scheduled games (lines 180, 182, 184, 190)', () => {
    // Eight teams each beat WSH once; WSH loses out with nothing left → eliminated.
    const winners = ['MIN', 'LV', 'GS', 'DAL', 'LA', 'PHX', 'SEA', 'NY']
    const games = winners.map((w) =>
      game({ id: `${w}-WSH`, home: w, away: 'WSH', score: [90, 80] })
    )
    const race = playoffRace(games)
    const wsh = race.find((r) => r.abbr === 'WSH')
    expect(wsh.eliminated).toBe(true)
    // A winner sits comfortably above the 9th-placed team (which has no schedule) → clinched.
    expect(race.find((r) => r.abbr === 'MIN').clinched).toBe(true)
    // Teams with no games at all report zero remaining rather than NaN.
    const idle = race.find((r) => r.abbr === 'CHI')
    expect(idle.remaining).toBe(0)
    expect(Number.isFinite(idle.gbCut)).toBe(true)
  })

  it('still assigns every seeded team to a conference bucket (line 146)', () => {
    const conf = conferenceStandings([game()])
    expect(conf.E.length + conf.W.length).toBe(15)
  })
})

// ── stats.js remaining branches ───────────────────────────────────────────
describe('stats edge cases', () => {
  it('reports zeroed averages for an empty season (lines 22, 23, 28)', () => {
    const t = seasonTotals([])
    expect(t.ppg).toBe(0)
    expect(t.combinedPpg).toBe(0)
    expect(t.homeWinPct).toBe(0)
  })

  it('sorts a team roster with missing scoring averages last (line 102)', () => {
    // Two players with no average get compared to each other, exercising the ?? 0 on
    // both sides of the comparator.
    const roster = playersByTeam('X', [
      { team: 'X', name: 'Scorer', avgPoints: 10 },
      { team: 'X', name: 'Alice', avgPoints: null },
      { team: 'X', name: 'Bob', avgPoints: null },
      { team: 'Y', name: 'Other', avgPoints: 99 },
    ])
    expect(roster).toHaveLength(3)
    expect(roster[0].name).toBe('Scorer')
    expect(roster.slice(1).map((p) => p.name).sort()).toEqual(['Alice', 'Bob'])
  })
})

// ── time.js remaining branches ────────────────────────────────────────────
describe('time zone detection and formatting edge cases', () => {
  afterEach(() => vi.restoreAllMocks())

  it('detects the platform zone when available (line 8 left)', () => {
    expect(typeof detectTimezone()).toBe('string')
  })

  it('falls back to Eastern when the platform reports no zone (line 8 right)', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: undefined }),
    }))
    expect(detectTimezone()).toBe('America/New_York')
  })

  it('falls back to Eastern when zone detection throws (lines 9-11)', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl')
    })
    expect(detectTimezone()).toBe('America/New_York')
  })

  it('prepends an unknown current zone to the picker options (line 31)', () => {
    expect(timezoneOptions('UTC')).toBe(TIMEZONES) // known → the list as-is
    const opts = timezoneOptions('Pacific/Pago_Pago') // unknown → prepended, underscores cleaned
    expect(opts[0]).toEqual({ id: 'Pacific/Pago_Pago', label: 'Pago Pago' })
    expect(opts).toHaveLength(TIMEZONES.length + 1)
  })

  it('returns an empty abbreviation when no timeZoneName part is present (line 46)', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      formatToParts: () => [{ type: 'literal', value: 'x' }],
    }))
    expect(formatZoneAbbr('2026-01-01T00:00:00Z', 'UTC')).toBe('')
  })

  it('labels adjacent days relatively and distant days in full (lines 69, 70)', () => {
    const now = new Date('2026-07-20T12:00:00Z')
    expect(dayLabel('2026-07-20', 'UTC', now)).toBe('Today')
    expect(dayLabel('2026-07-21', 'UTC', now)).toBe('Tomorrow')
    expect(dayLabel('2026-07-19', 'UTC', now)).toBe('Yesterday')
    expect(dayLabel('2026-08-01', 'UTC', now)).toMatch(/August/)
  })

  it('formats a countdown across days, hours, and minutes (line 100)', () => {
    const now = Date.parse('2026-07-20T00:00:00Z')
    expect(countdown('2026-07-19T00:00:00Z', now)).toBeNull() // already started
    expect(countdown('2026-07-20T00:30:00Z', now)).toBe('30m')
    expect(countdown('2026-07-20T02:30:00Z', now)).toBe('2h 30m')
    expect(countdown('2026-07-22T02:00:00Z', now)).toBe('2d 2h')
  })
})

// ── ics.js remaining branch ───────────────────────────────────────────────
describe('ics playoff description', () => {
  const now = '2026-07-20T12:00:00.000Z'
  const base = { id: 'p1', home: 'MIN', away: 'LV', tip: '2026-09-14T17:00:00.000Z' }

  it('omits the game number for a round with no game set (line 56)', () => {
    const ics = buildIcs([{ ...base, round: 'SF' }], { now })
    expect(ics).toMatch(/Playoffs — SF/)
    expect(ics).not.toMatch(/game \d/)
  })

  it('includes the game number when present', () => {
    const ics = buildIcs([{ ...base, round: 'SF', game: 3 }], { now })
    expect(ics).toMatch(/Playoffs — SF game 3/)
  })
})

// ── urlState.js remaining branch ──────────────────────────────────────────
describe('writeState SSR guard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does nothing when there is no window (line 76)', () => {
    vi.stubGlobal('window', undefined)
    expect(() => writeState({ view: 'stats' }, 'America/New_York')).not.toThrow()
  })
})

// ── watch.js remaining branch ─────────────────────────────────────────────
describe('broadcastNotBadged with no watched list', () => {
  it('treats an absent watched list as empty (line 56)', () => {
    expect(broadcastNotBadged(['ESPN'], undefined)).toEqual(['ESPN'])
    expect(broadcastNotBadged(['ESPN', 'ABC'], null)).toEqual(['ESPN', 'ABC'])
  })
})
