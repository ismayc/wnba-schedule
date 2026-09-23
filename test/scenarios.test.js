import { describe, it, expect } from 'vitest'
import {
  OUT,
  MAX_OPEN_GAMES,
  TIEBREAK_STEPS,
  remainingGames,
  favoritePicks,
  rankScenario,
  enumerateScenarios,
  picksFromMask,
  requirements,
  meanSeed,
} from '../src/utils/scenarios.js'
import { computeStandings, rankTable, seedings, PLAYOFF_SPOTS } from '../src/utils/standings.js'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'SEA',
  score: [90, 80],
  ...over,
})

const open = (over) => game({ score: null, tip: '2026-09-20T00:00:00.000Z', ...over })

describe('remainingGames', () => {
  it('keeps unplayed and live regular-season games, in tip then id order', () => {
    const games = [
      game({ id: 'final' }),
      open({ id: 'b', tip: '2026-09-21T00:00:00.000Z' }),
      open({ id: 'z' }),
      open({ id: 'a' }),
      game({ id: 'live', live: true, tip: '2026-09-22T00:00:00.000Z' }),
      open({ id: 'pp', postponed: true }),
      open({ id: 'cx', canceled: true }),
      open({ id: 'po', seasonType: 'playoffs' }),
    ]
    expect(remainingGames(games).map((g) => g.id)).toEqual(['a', 'z', 'b', 'live'])
  })
})

describe('favoritePicks', () => {
  it('picks the better record, and the home side on a tie', () => {
    const games = [game({ home: 'MIN', away: 'SEA' }), game({ home: 'LV', away: 'GS', score: [70, 90] })]
    const table = computeStandings(games)
    const picks = favoritePicks(
      [open({ id: 'x', home: 'SEA', away: 'MIN' }), open({ id: 'y', home: 'LA', away: 'PHX' })],
      table
    )
    expect(picks).toEqual({ x: 'away', y: 'home' })
  })
})

describe('rankScenario', () => {
  it('matches the real seeding when nothing is left to pick', () => {
    const games = [game({ home: 'MIN', away: 'SEA' }), game({ home: 'LV', away: 'GS', score: [99, 70] })]
    const { rows, marginDependent } = rankScenario(games, {})
    expect(rows.map((r) => r.abbr)).toEqual(seedings(games).map((r) => r.abbr))
    // The zero-point-differential pile at the bottom falls to the alphabetical stand-in,
    // which no hypothetical margin decides.
    expect(marginDependent).toBe(false)
  })

  it('books a pick as a one-point win and ignores picks for games not open', () => {
    const games = [open({ id: 'g', home: 'MIN', away: 'SEA' }), game({ id: 'done', home: 'LV', away: 'GS' })]
    const { rows } = rankScenario(games, { g: 'away', done: 'away' })
    const sea = rows.find((r) => r.abbr === 'SEA')
    expect([sea.w, sea.l, sea.diff]).toEqual([1, 0, 1])
    // "done" is final, so the stale pick does not flip LV's real win.
    expect(rows.find((r) => r.abbr === 'LV').w).toBe(1)
  })

  it('flags an order that overall point differential settles with a picked game', () => {
    // MIN and LV both 1-0, never met, same (empty) record vs .500 teams: step 4 decides,
    // and LV's +1 is a hypothetical margin.
    const games = [game({ home: 'MIN', away: 'SEA' }), open({ id: 'g', home: 'LV', away: 'GS' })]
    const out = rankScenario(games, { g: 'home' })
    expect(out.marginDependent).toBe(true)
    expect(out.trace.some((t) => t.step === 4)).toBe(true)
  })

  it('does not flag step 4 when every tied team played only real games', () => {
    const games = [game({ home: 'MIN', away: 'SEA' }), game({ home: 'LV', away: 'GS', score: [85, 80] })]
    const out = rankScenario(games, {})
    expect(out.trace.some((t) => t.step === 4)).toBe(true)
    expect(out.marginDependent).toBe(false)
  })

  it('flags head-to-head point differential only when a picked game is inside the group', () => {
    // MIN and LV split two games, so step 1 and step 2 tie; step 3 is their head-to-head
    // differential, which includes the picked rematch.
    const inside = [game({ home: 'MIN', away: 'LV', score: [90, 80] }), open({ id: 'r', home: 'LV', away: 'MIN' })]
    const a = rankScenario(inside, { r: 'home' })
    expect(a.trace.find((t) => t.teams.includes('MIN')).step).toBe(3)
    expect(a.marginDependent).toBe(true)

    // Same split, both real; each side's picked game is against an outsider. Step 3
    // decides MIN/LV off real margins. (The outsiders' own pile still ends on step 4
    // with picked games, which is flagged, so check the step-3 entry on its own.)
    const outside = [
      game({ home: 'MIN', away: 'LV', score: [90, 80] }),
      game({ home: 'LV', away: 'MIN', score: [85, 80] }),
      open({ id: 'x', home: 'MIN', away: 'SEA' }),
      open({ id: 'y', home: 'LV', away: 'GS' }),
    ]
    const b = rankScenario(outside, { x: 'home', y: 'home' })
    const step3 = b.trace.filter((t) => t.step === 3)
    expect(step3.map((t) => [...t.teams].sort())).toEqual([['LV', 'MIN']])
  })
})

describe('enumerateScenarios', () => {
  const games = [
    game({ home: 'MIN', away: 'SEA' }),
    open({ id: 'g1', home: 'MIN', away: 'LV' }),
    open({ id: 'g2', home: 'GS', away: 'LV', tip: '2026-09-21T00:00:00.000Z' }),
  ]

  it('plays out every completion and tallies each seed bucket', () => {
    const r = enumerateScenarios(games)
    expect(r.total).toBe(4)
    expect(r.undecided.map((g) => g.id)).toEqual(['g1', 'g2'])
    for (const team of Object.values(r.teams)) {
      const sum = Object.values(team).reduce((n, c) => n + c.count, 0)
      expect(sum).toBe(4)
    }
    // MIN (1-0) is first exactly when it beats LV; then g2 can go either way.
    expect(r.teams.MIN[1].count).toBe(2)
    expect(r.teams.MIN[1].homeWins).toEqual([2, 1])
    // 15 teams, 8 seeds: the rest pile into OUT.
    expect(r.teams.TOR[OUT].count).toBe(4)
  })

  it('respects picks and narrows the space', () => {
    const r = enumerateScenarios(games, { g1: 'home' })
    expect(r.total).toBe(2)
    expect(r.teams.MIN[1].count).toBe(2)
  })

  it('counts margin-dependent outcomes per bucket', () => {
    const r = enumerateScenarios(games)
    const flagged = Object.values(r.teams).some((t) => Object.values(t).some((c) => c.margin > 0))
    expect(flagged).toBe(true)
  })

  it('refuses to enumerate past the cap', () => {
    const r = enumerateScenarios(games, {}, { max: 1 })
    expect(r.tooMany).toBe(true)
    expect(r.total).toBe(0)
    expect(r.teams).toEqual({})
    expect(MAX_OPEN_GAMES).toBeGreaterThan(10)
  })
})

describe('picksFromMask, requirements, meanSeed', () => {
  const games = [
    game({ home: 'MIN', away: 'SEA' }),
    open({ id: 'g1', home: 'MIN', away: 'LV' }),
    open({ id: 'g2', home: 'GS', away: 'LV', tip: '2026-09-21T00:00:00.000Z' }),
  ]
  const r = enumerateScenarios(games)

  it('turns a mask back into picks', () => {
    expect(picksFromMask(r.undecided, 0b01, { keep: 'home' })).toEqual({ keep: 'home', g1: 'home', g2: 'away' })
    expect(picksFromMask(r.undecided, 0b10)).toEqual({ g1: 'away', g2: 'home' })
  })

  it('lists the results every scenario in a bucket shares', () => {
    // LV finishes first only by winning both games.
    const lv1 = requirements(r.teams.LV[1], r.undecided)
    expect(lv1.map(({ game: g, side }) => [g.id, side])).toEqual([
      ['g1', 'away'],
      ['g2', 'away'],
    ])
    // MIN is first only by beating LV; g2 is free (it goes both ways in those outcomes).
    const min = requirements(r.teams.MIN[1], r.undecided)
    expect(min.map(({ game: g, side }) => [g.id, side])).toEqual([['g1', 'home']])
    expect(requirements(r.teams.TOR[1], r.undecided)).toEqual([])
  })

  it('reproduces a bucket from its example mask', () => {
    const cell = r.teams.LV[1]
    const { rows } = rankScenario(games, picksFromMask(r.undecided, cell.example))
    expect(rows[0].abbr).toBe('LV')
  })

  it('averages the seed bucket', () => {
    expect(meanSeed(r.teams.TOR)).toBe(OUT)
    expect(meanSeed(r.teams.MIN)).toBeLessThan(2)
  })

  it('names every tiebreak step', () => {
    expect(Object.keys(TIEBREAK_STEPS)).toEqual(['1', '2', '3', '4', '5'])
    expect(OUT).toBe(PLAYOFF_SPOTS + 1)
  })
})

describe('rankTable', () => {
  it('orders a table exactly as seedings does, and traces the ties it breaks', () => {
    const games = [game({ home: 'MIN', away: 'SEA' }), game({ home: 'SEA', away: 'MIN', score: [85, 80] })]
    const trace = []
    const rows = rankTable(computeStandings(games), trace)
    expect(rows.map((r) => r.abbr)).toEqual(seedings(games).map((r) => r.abbr))
    expect(trace.map((t) => t.step)).toContain(3)
    expect(trace.map((t) => t.step)).toContain(5)
  })
})
