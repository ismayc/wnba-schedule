import { describe, it, expect } from 'vitest'
import { scenarioClinched, MAX_COUPLED_GAMES } from '../src/utils/raceScenarios.js'
import { seedings, seedRanges, scheduledGames, playoffRace, PLAYOFF_SPOTS } from '../src/utils/standings.js'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'SEA',
  score: [90, 80],
  ...over,
})

// The coupling the independent bounds cannot see: MIN is 2-0 (beat both chasers);
// GS and LV are 2-1 with ONE remaining game — against each other. Each could pass
// MIN's floor of 2 by winning out, but not both: the loser of the rematch stays at 2,
// tied with MIN, and MIN owns both head-to-heads.
const COUPLED = [
  game({ id: 'a1', home: 'MIN', away: 'GS', score: [90, 80] }),
  game({ id: 'a2', home: 'MIN', away: 'LV', score: [90, 80] }),
  game({ id: 'a3', home: 'GS', away: 'SEA', score: [90, 80] }),
  game({ id: 'a4', home: 'GS', away: 'POR', score: [90, 80] }),
  game({ id: 'a5', home: 'LV', away: 'PHX', score: [90, 80] }),
  game({ id: 'a6', home: 'LV', away: 'TOR', score: [90, 80] }),
  game({ id: 'a7', home: 'GS', away: 'LV', score: null, tip: '2026-05-20T00:00:00.000Z' }),
]

describe('scenarioClinched', () => {
  const rows = seedings(COUPLED)
  const totals = scheduledGames(COUPLED)

  it('sees a clinch the independent bounds miss when chasers still play each other', () => {
    // Bounds: both chasers' ceilings (3) strictly clear MIN's floor (2) → worst 3.
    const ranges = seedRanges(rows, totals, COUPLED)
    expect(ranges.MIN.worstRank).toBe(3)
    // Enumeration: the rematch loser stays level with MIN, and MIN's banked
    // head-to-head settles that tie — at most ONE rival can finish ahead.
    expect(scenarioClinched('MIN', rows, totals, COUPLED, 2)).toBe(true)
  })

  it('still reports catchable when one rival ahead is enough', () => {
    expect(scenarioClinched('MIN', rows, totals, COUPLED, 1)).toBe(false)
  })

  it('declines (null) when the coupled schedule exceeds the budget', () => {
    expect(scenarioClinched('MIN', rows, totals, COUPLED, 2, { maxCoupled: 0 })).toBeNull()
    expect(MAX_COUPLED_GAMES).toBeGreaterThan(0)
  })

  it('treats a live score as provisional — no clinch off a game still in progress', () => {
    // MIN leads GS in a LIVE head-to-head. Banking that provisional score would
    // put MIN out of reach for the top spot; the game must stay open, and open it
    // hands GS the win — GS draws level and owns the head-to-head, so no clinch.
    const g = [
      game({ id: 'b1', home: 'MIN', away: 'SEA', score: [90, 80] }),
      game({ id: 'b2', home: 'MIN', away: 'POR', score: [90, 80] }),
      game({ id: 'b3', home: 'GS', away: 'PHX', score: [90, 80] }),
      game({ id: 'b4', home: 'MIN', away: 'GS', score: [60, 50], live: true, tip: '2026-05-20T00:00:00.000Z' }),
    ]
    const liveRows = seedings(g)
    const liveTotals = scheduledGames(g)
    expect(scenarioClinched('MIN', liveRows, liveTotals, g, 1)).toBe(false)
  })

  it('resolves a three-way floor tie using the enumerated games themselves', () => {
    // GS and LV still play a home-and-home. If they SPLIT it, both land on MIN's
    // floor of 2 — and both enumerated results are part of the tied group's
    // head-to-head. MIN went 2-0 against the pair (once at home, once on the
    // road — the ledger must credit an away winner, not just the home side), so
    // step 1 ranks MIN above both in the split scenarios; a sweep sends exactly
    // one rival ahead. Every outcome leaves at most one rival above MIN → top-2
    // is safe.
    const g = [
      game({ id: 't1', home: 'MIN', away: 'GS', score: [90, 80] }),
      game({ id: 't2', home: 'LV', away: 'MIN', score: [80, 90] }),
      game({ id: 't3', home: 'LV', away: 'PHX', score: [90, 80] }),
      game({ id: 't5', home: 'GS', away: 'SEA', score: [90, 80] }),
      game({ id: 't6', home: 'LV', away: 'GS', score: null, tip: '2026-05-22T00:00:00.000Z' }),
      game({ id: 't7', home: 'GS', away: 'LV', score: null, tip: '2026-05-24T00:00:00.000Z' }),
    ]
    const r = seedings(g)
    expect(scenarioClinched('MIN', r, scheduledGames(g), g, 2)).toBe(true)
  })

  it('charges an unresolvable floor tie against the team (no head-to-head played)', () => {
    // CHI is 2-0 over ATL only; NY can reach exactly 2 wins but never met CHI, so
    // step 1 cannot rank the tie and NY counts as ahead — top-1 is not safe.
    const g = [
      game({ id: 'n1', home: 'CHI', away: 'ATL', score: [90, 80] }),
      game({ id: 'n2', home: 'CHI', away: 'ATL', score: [85, 80] }),
      game({ id: 'n3', home: 'NY', away: 'WSH', score: [90, 80] }),
      game({ id: 'n4', home: 'NY', away: 'WSH', score: null, tip: '2026-05-21T00:00:00.000Z' }),
    ]
    const r = seedings(g)
    expect(scenarioClinched('CHI', r, scheduledGames(g), g, 1)).toBe(false)
  })

  it('short-circuits when enough rivals are already past the floor', () => {
    // GS (2-1) is past CON's floor of 1 for good — no enumeration needed for cut 1.
    const g = [
      game({ id: 's1', home: 'CON', away: 'SEA', score: [90, 80] }),
      game({ id: 's2', home: 'CON', away: 'SEA', score: [80, 90], tip: '2026-05-11T00:00:00.000Z' }),
      game({ id: 's3', home: 'GS', away: 'POR', score: [90, 80] }),
      game({ id: 's4', home: 'GS', away: 'POR', score: [90, 80], id: 's4b' }),
    ]
    const r = seedings(g)
    expect(scenarioClinched('CON', r, scheduledGames(g), g, 1)).toBe(false)
  })
})

describe('playoffRace × scenario engine', () => {
  it('upgrades the clinch flag when the schedule guarantees the top 8', () => {
    // Six settled contenders sit above MIN's floor forever; GS and LV are the only
    // other teams able to reach it, and they still play each other. Independent
    // bounds count 6 + 2 = 8 possible passers (worst rank 9 → no ✓); the scenario
    // engine proves at most 6 + 1 can actually finish ahead → clinched.
    const contenders = ['ATL', 'NY', 'IND', 'WSH', 'DAL', 'CHI']
    const pool = ['CON', 'TOR', 'SEA', 'POR', 'PHX', 'LA']
    const games = []
    let n = 0
    for (const c of contenders) {
      for (let i = 0; i < 5; i++) {
        games.push(game({ id: `w${n++}`, home: c, away: pool[(n + i) % pool.length] }))
      }
    }
    games.push(game({ id: 'm1', home: 'MIN', away: 'GS', score: [90, 80] }))
    games.push(game({ id: 'm2', home: 'MIN', away: 'LV', score: [90, 80] }))
    games.push(game({ id: 'm3', home: 'GS', away: 'SEA', score: [90, 80] }))
    games.push(game({ id: 'm4', home: 'GS', away: 'POR', score: [90, 80] }))
    games.push(game({ id: 'm5', home: 'LV', away: 'PHX', score: [90, 80] }))
    games.push(game({ id: 'm6', home: 'LV', away: 'TOR', score: [90, 80] }))
    games.push(game({ id: 'm7', home: 'GS', away: 'LV', score: null, tip: '2026-05-25T00:00:00.000Z' }))

    const race = playoffRace(games)
    const min = race.find((r) => r.abbr === 'MIN')
    expect(min.worstRank).toBeGreaterThan(PLAYOFF_SPOTS) // the bounds alone say no…
    expect(min.clinched).toBe(true) // …the schedule says yes
  })
})
