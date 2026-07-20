import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/schedule.js'
import { PLAYERS } from '../src/data/leaders.js'
import { seasonTotals, teamScoring, leaderboard, playersByTeam } from '../src/utils/stats.js'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'SEA',
  score: [90, 80],
  ...over,
})

describe('seasonTotals', () => {
  it('sums points across both teams', () => {
    const t = seasonTotals([game({ score: [90, 80] }), game({ score: [100, 70] })])
    expect(t.totalPoints).toBe(340)
    expect(t.combinedPpg).toBe(170)
  })

  it('measures home win rate rather than assuming it', () => {
    const t = seasonTotals([
      game({ score: [90, 80] }), // home win
      game({ score: [70, 80] }), // road win
    ])
    expect(t.homeWins).toBe(1)
    expect(t.homeWinPct).toBe(0.5)
  })

  it('classifies one-possession games and blowouts by margin', () => {
    const t = seasonTotals([
      game({ score: [90, 88] }), // margin 2
      game({ score: [90, 87] }), // margin 3 — still one possession
      game({ score: [90, 86] }), // margin 4
      game({ score: [110, 80] }), // margin 30
    ])
    expect(t.nailbiters).toHaveLength(2)
    expect(t.blowouts).toHaveLength(1)
  })

  it('excludes the Cup final from season totals', () => {
    const t = seasonTotals([game(), game({ seasonType: 'cup', score: [200, 200] })])
    expect(t.played).toBe(1)
    expect(t.totalPoints).toBe(170)
  })

  it('counts remaining games from the schedule, not a fixed season length', () => {
    const t = seasonTotals([game(), game({ score: undefined }), game({ score: undefined })])
    expect(t.played).toBe(1)
    expect(t.remaining).toBe(2)
  })
})

describe('teamScoring', () => {
  it('ranks defense by fewest points allowed', () => {
    const rows = teamScoring([
      game({ home: 'MIN', away: 'SEA', score: [90, 70] }),
      game({ home: 'NY', away: 'ATL', score: [100, 99] }),
    ])
    const min = rows.find((r) => r.abbr === 'MIN')
    const ny = rows.find((r) => r.abbr === 'NY')
    // MIN allowed 70, NY allowed 99 — MIN must rank better defensively.
    expect(min.defRank).toBeLessThan(ny.defRank)
  })

  it('sorts by net margin, best first', () => {
    const rows = teamScoring(GAMES)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].netPpg).toBeGreaterThanOrEqual(rows[i].netPpg)
    }
  })

  it('omits teams that have not played', () => {
    const rows = teamScoring([game({ home: 'MIN', away: 'SEA' })])
    expect(rows.map((r) => r.abbr).sort()).toEqual(['MIN', 'SEA'])
  })
})

describe('leaderboard', () => {
  const players = [
    { id: '1', name: 'A', avgPoints: 20 },
    { id: '2', name: 'B', avgPoints: 15 },
    { id: '3', name: 'C', avgPoints: 15 },
    { id: '4', name: 'D', avgPoints: 10 },
  ]

  it('gives tied players a shared rank and skips the consumed slot', () => {
    const rows = leaderboard('avgPoints', { players, limit: 10 })
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4])
  })

  it('keeps everyone tied at the cutoff rather than truncating mid-tie', () => {
    const rows = leaderboard('avgPoints', { players, limit: 2 })
    // Rank 2 is a two-way tie, so a limit of 2 still returns three rows.
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.rank <= 2)).toBe(true)
  })

  it('drops players missing the stat instead of ranking them zero', () => {
    const rows = leaderboard('threePct', {
      players: [...players, { id: '5', name: 'E', threePct: 50 }],
      limit: 10,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('E')
  })
})

describe('the committed player table', () => {
  it('has qualified players with the stats the leaderboards use', () => {
    expect(PLAYERS.length).toBeGreaterThan(50)
    for (const key of ['avgPoints', 'avgRebounds', 'avgAssists']) {
      expect(leaderboard(key, { limit: 5 }).length).toBeGreaterThanOrEqual(5)
    }
  })

  it('assigns every player to a real team', () => {
    const teams = new Set(PLAYERS.map((p) => p.team))
    expect(teams.size).toBe(15)
    expect(playersByTeam('MIN').length).toBeGreaterThan(0)
  })

  it('sorts a team roster by scoring', () => {
    const roster = playersByTeam('LV')
    for (let i = 1; i < roster.length; i++) {
      expect(roster[i - 1].avgPoints).toBeGreaterThanOrEqual(roster[i].avgPoints)
    }
  })
})
