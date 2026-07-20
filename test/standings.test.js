import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/schedule.js'
import {
  computeStandings,
  seedings,
  playoffRace,
  headToHead,
  gamesBehind,
  countsForStandings,
  conferenceStandings,
  CONFERENCE_BY_ABBR,
  PLAYOFF_SPOTS,
} from '../src/utils/standings.js'
import { TEAMS } from '../src/data/teams.js'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'SEA',
  score: [90, 80],
  ...over,
})

describe('countsForStandings', () => {
  it('counts a completed regular-season game', () => {
    expect(countsForStandings(game())).toBe(true)
  })

  it('excludes the Commissioner’s Cup Championship', () => {
    expect(countsForStandings(game({ seasonType: 'cup' }))).toBe(false)
  })

  it('excludes postponed shells and unplayed games', () => {
    expect(countsForStandings(game({ postponed: true }))).toBe(false)
    expect(countsForStandings(game({ score: undefined }))).toBe(false)
  })
})

describe('computeStandings', () => {
  it('splits home and road records by side', () => {
    const t = computeStandings([game(), game({ home: 'SEA', away: 'MIN', score: [70, 95] })])
    expect(t.MIN).toMatchObject({ w: 2, l: 0, home: { w: 1, l: 0 }, road: { w: 1, l: 0 } })
    expect(t.SEA).toMatchObject({ w: 0, l: 2, home: { w: 0, l: 1 }, road: { w: 0, l: 1 } })
  })

  it('tracks streak sign and magnitude', () => {
    const t = computeStandings([
      game({ tip: '2026-05-01T00:00:00.000Z', score: [80, 90] }), // MIN loss
      game({ tip: '2026-05-02T00:00:00.000Z', score: [95, 80] }), // MIN win
      game({ tip: '2026-05-03T00:00:00.000Z', score: [99, 80] }), // MIN win
    ])
    expect(t.MIN.streak).toBe(2)
    expect(t.SEA.streak).toBe(-2)
  })

  it('counts conference games only against same-conference opponents', () => {
    const t = computeStandings([
      game({ home: 'NY', away: 'ATL' }), // both East
      game({ home: 'NY', away: 'MIN' }), // cross-conference
    ])
    expect(t.NY.conf).toEqual({ w: 1, l: 0 })
  })
})

describe('league-wide seeding', () => {
  // Built so one conference sweeps the top of the table. Under conference-based
  // seeding an East team would be forced into the top seeds; under WNBA rules the
  // order is purely by record.
  it('lets a single conference hold every top seed', () => {
    const west = ['MIN', 'GS', 'LV', 'DAL', 'LA']
    const east = ['ATL', 'NY', 'IND', 'WSH', 'CHI']
    const games = []
    // Every West team beats every East team once.
    for (const w of west) {
      for (const e of east) {
        games.push(game({ id: `${w}-${e}`, home: w, away: e, score: [90, 70] }))
      }
    }
    const seeded = seedings(games)
    const top5 = seeded.slice(0, 5).map((r) => r.abbr)
    expect(top5.every((a) => west.includes(a))).toBe(true)
    expect(seeded.find((r) => r.abbr === 'ATL').seed).toBeGreaterThan(5)
  })
})

describe('headToHead', () => {
  it('returns null when two teams have not met', () => {
    expect(headToHead([game()], 'NY', 'ATL')).toBeNull()
  })

  it('tallies the season series', () => {
    const h2h = headToHead(
      [game(), game({ home: 'SEA', away: 'MIN', score: [99, 80] })],
      'MIN',
      'SEA'
    )
    expect(h2h).toMatchObject({ aw: 1, bw: 1 })
  })
})

describe('gamesBehind', () => {
  it('is zero for the leader and half a game per split result', () => {
    const leader = { w: 20, l: 6 }
    expect(gamesBehind(leader, { w: 20, l: 6 })).toBe(0)
    expect(gamesBehind(leader, { w: 19, l: 7 })).toBe(1)
    expect(gamesBehind(leader, { w: 19, l: 6 })).toBe(0.5)
  })
})

// The real 2026 data is the strongest possible fixture: these numbers are
// independently verifiable against ESPN's published standings.
describe('the committed 2026 season', () => {
  const seeded = seedings(GAMES)

  it('has all 15 teams, seeded 1..15', () => {
    expect(seeded).toHaveLength(15)
    expect(seeded.map((r) => r.seed)).toEqual([...Array(15)].map((_, i) => i + 1))
  })

  it('seeds the conference leader on record, not on leading its conference', () => {
    // ATL tops the East but sits behind several West teams overall — seeding is
    // league-wide.
    const eastLeader = seeded.find((r) => CONFERENCE_BY_ABBR[r.abbr] === 'E')
    expect(eastLeader.seed).toBeGreaterThan(1)
    expect(seeded[0].abbr).toBe('MIN')
  })

  it('matches ESPN: Minnesota leads at 20-6', () => {
    expect(seeded[0]).toMatchObject({ abbr: 'MIN', w: 20, l: 6, gb: 0 })
  })

  it('orders strictly by win percentage before tiebreakers', () => {
    for (let i = 1; i < seeded.length; i++) {
      expect(seeded[i - 1].pct).toBeGreaterThanOrEqual(seeded[i].pct)
    }
  })

  it('never lets a team play more games than it is scheduled for', () => {
    for (const row of playoffRace(GAMES)) {
      expect(row.remaining).toBeGreaterThanOrEqual(0)
    }
  })

  it('marks exactly the top 8 as in the playoff field', () => {
    expect(seeded.filter((r) => r.inPlayoffs)).toHaveLength(PLAYOFF_SPOTS)
  })

  it('assigns every team to a conference', () => {
    const conf = conferenceStandings(GAMES)
    expect(conf.E.length + conf.W.length).toBe(TEAMS.length)
    expect(TEAMS.every((t) => CONFERENCE_BY_ABBR[t.abbr])).toBe(true)
  })
})
