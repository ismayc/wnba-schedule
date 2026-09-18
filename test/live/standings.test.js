import { describe, it, expect } from 'vitest'
import { GAMES } from '../../src/data/schedule.js'
import { TEAMS } from '../../src/data/teams.js'
import {
  seedings,
  playoffRace,
  countsForStandings,
  conferenceStandings,
  CONFERENCE_BY_ABBR,
  PLAYOFF_SPOTS,
} from '../../src/utils/standings.js'

// LIVE suite (npm run test:data): the tables the site derives from the refreshed scores.
// Invariants only; see test/live/players.test.js for why. The season-specific versions of
// these checks (the top seed is a West team, the leader has a winning record) stay in
// test/standings.test.js, where they run against the frozen board and cannot go stale.

describe('standings derived from the refreshed schedule', () => {
  const seeded = seedings(GAMES)

  it('seeds every team exactly once, 1 through N', () => {
    expect(seeded).toHaveLength(TEAMS.length)
    expect(seeded.map((r) => r.seed)).toEqual(TEAMS.map((_, i) => i + 1))
    expect(new Set(seeded.map((r) => r.abbr)).size).toBe(TEAMS.length)
  })

  it('gives every team a record that independently recounts the committed games', () => {
    // A different code path than computeStandings: catches a miscounted or
    // home/away-swapped record without naming a number the refresh moves.
    for (const row of seeded) {
      let w = 0
      let l = 0
      for (const g of GAMES) {
        if (!countsForStandings(g) || (g.home !== row.abbr && g.away !== row.abbr)) continue
        const won = g.home === row.abbr ? g.score[0] > g.score[1] : g.score[1] > g.score[0]
        won ? w++ : l++
      }
      expect({ abbr: row.abbr, w: row.w, l: row.l }).toEqual({ abbr: row.abbr, w, l })
    }
  })

  it('orders by win percentage before tiebreakers', () => {
    for (let i = 1; i < seeded.length; i++) {
      expect(seeded[i - 1].pct).toBeGreaterThanOrEqual(seeded[i].pct)
    }
  })

  it('never lets a team play more games than it is scheduled for', () => {
    for (const row of playoffRace(GAMES)) expect(row.remaining, row.abbr).toBeGreaterThanOrEqual(0)
  })

  it('marks exactly the playoff spots as in the field', () => {
    expect(seeded.filter((r) => r.inPlayoffs)).toHaveLength(PLAYOFF_SPOTS)
  })

  it('assigns every team to a conference', () => {
    const conf = conferenceStandings(GAMES)
    expect(conf.E.length + conf.W.length).toBe(TEAMS.length)
    expect(TEAMS.every((t) => CONFERENCE_BY_ABBR[t.abbr])).toBe(true)
  })

  it('never commits a tied or half-scored final', () => {
    // Basketball has no draws, and the snapshot holds a score only for a completed game.
    for (const g of GAMES) {
      if (!g.score) continue
      expect(g.score, g.id).toHaveLength(2)
      expect(g.score.every(Number.isFinite), g.id).toBe(true)
      if (g.seasonType !== 'allstar') expect(g.score[0], g.id).not.toBe(g.score[1])
    }
  })
})
