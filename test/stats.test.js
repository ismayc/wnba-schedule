import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/schedule.js'
import { PLAYERS } from '../src/data/leaders.js'
import {
  seasonTotals,
  teamScoring,
  leaderboard,
  playersByTeam,
  teamLabel,
} from '../src/utils/stats.js'

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
      players: [...players, { id: '5', name: 'E', threePct: 50, avgThreeMade: 1, gamesPlayed: 44 }],
      limit: 10,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('E')
  })

  // The WNBA qualifies a 3P% leader on threes MADE — 20 of them — not on attempts.
  it('drops percentage leaders who lack the made shots to qualify', () => {
    const rows = leaderboard('threePct', {
      players: [
        { id: '1', name: 'Sharpshooter', threePct: 40, avgThreeMade: 1.5, gamesPlayed: 44 }, // 66 made
        { id: '2', name: 'Fluke Guard', threePct: 100, avgThreeMade: 0.1, gamesPlayed: 44 }, // 4 made
        { id: '3', name: 'Small Sample', threePct: 55, avgThreeMade: 1, gamesPlayed: 10 }, // 10 made
        { id: '4', name: 'No Volume Data', threePct: 99 }, // no made/games fields at all
        { id: '5', name: 'Made No Games', threePct: 60, avgThreeMade: 5 }, // no games field
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Sharpshooter'])
  })

  it('qualifies a field goal percentage leader on 85 made', () => {
    const rows = leaderboard('fgPct', {
      players: [
        { id: '1', name: 'Post Scorer', fgPct: 58, avgFgMade: 6, gamesPlayed: 44 }, // 264 made
        { id: '2', name: 'Perfect Cameo', fgPct: 100, avgFgMade: 1, gamesPlayed: 44 }, // 44 made
        { id: '3', name: 'Just Short', fgPct: 70, avgFgMade: 4, gamesPlayed: 21 }, // 84 made
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Post Scorer'])
  })

  // The WNBA's per-game rule takes EITHER leg — 20 games or the season total — which is
  // what keeps a high-production short season (Kelsey Plum's 16 games) rankable while a
  // three-game cameo is not.
  it('qualifies a per-game leader on games OR the season total', () => {
    const rows = leaderboard('avgPoints', {
      players: [
        { id: '1', name: 'Ever Present', avgPoints: 15, gamesPlayed: 44 },
        { id: '2', name: 'Short But Heavy', avgPoints: 25, gamesPlayed: 17 }, // 425 pts, clears 400
        { id: '3', name: 'Short And Light', avgPoints: 22, gamesPlayed: 16 }, // 352 pts, under both legs
        { id: '4', name: 'Cameo', avgPoints: 40, gamesPlayed: 3 },
        { id: '5', name: 'No Games Field', avgPoints: 99 }, // an average with nothing behind it
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Short But Heavy', 'Ever Present'])
  })

  // Mid-season both legs scale, so a June board ranks who has been available.
  it('scales both legs of the rule to the season so far', () => {
    const rows = leaderboard('avgRebounds', {
      players: [
        // Busiest player has 22 of 44, so the floor is half: 10 games or 100 rebounds.
        { id: '1', name: 'Regular', avgRebounds: 8, gamesPlayed: 22 },
        { id: '2', name: 'Ten Games', avgRebounds: 9, gamesPlayed: 10 },
        { id: '3', name: 'Nine Games', avgRebounds: 12, gamesPlayed: 9 }, // 108 reb clears the total leg
        { id: '4', name: 'Four Games', avgRebounds: 11, gamesPlayed: 4 }, // 44 reb, neither leg
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Nine Games', 'Ten Games', 'Regular'])
  })

  it('never scales the floor past a full season', () => {
    const rows = leaderboard('avgPoints', {
      players: [
        { id: '1', name: 'Played 45', avgPoints: 8, gamesPlayed: 45 },
        { id: '2', name: 'Played 20', avgPoints: 20, gamesPlayed: 20 },
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Played 20', 'Played 45'])
  })

  it('lists only players who recorded a counting stat, not everyone on zero', () => {
    const rows = leaderboard('tripleDouble', {
      players: [
        { id: '1', name: 'Triple Threat', tripleDouble: 5 },
        { id: '2', name: 'One Timer', tripleDouble: 1 },
        { id: '3', name: 'Never', tripleDouble: 0 },
        { id: '4', name: 'Also Never', tripleDouble: 0 },
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Triple Threat', 'One Timer'])
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

describe('teamLabel', () => {
  it('names the club and the games played with it', () => {
    expect(teamLabel({ abbr: 'LA', gp: 12 })).toBe('LA · 12 games')
  })

  it('omits the count when the split could not be resolved', () => {
    expect(teamLabel({ abbr: 'LA', gp: null })).toBe('LA')
  })
})
