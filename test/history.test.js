import { describe, it, expect } from 'vitest'
import { HISTORY, HISTORY_BY_YEAR, HISTORY_YEARS } from '../src/data/history.js'
import { seasonBracket, runResult, finalsSummary } from '../src/utils/history.js'
import { TEAM_BY_ABBR } from '../src/data/teams.js'
import { LEADER_CATEGORIES } from '../src/utils/stats.js'

// Checked against the real record, not against the feed the data came from — a test that
// only restates ESPN would pass on garbage.
const FINALS = {
  2025: ['LV', 'PHX', [4, 0], 7],
  2024: ['NY', 'MIN', [3, 2], 5],
  2023: ['LV', 'NY', [3, 1], 5],
  2022: ['LV', 'CON', [3, 1], 5],
}

describe('the committed history file', () => {
  it('covers every season in the all-series playoff format, newest first', () => {
    expect(HISTORY_YEARS).toEqual([2025, 2024, 2023, 2022])
  })

  it('tables only the teams that actually existed that season', () => {
    // Golden State joined in 2025; Portland and Toronto in 2026. seedings() works off
    // TODAY's franchises, so an unfiltered table would carry phantom 0-0 rows.
    expect(HISTORY_BY_YEAR[2025].standings).toHaveLength(13)
    for (const year of [2024, 2023, 2022]) {
      expect(HISTORY_BY_YEAR[year].standings).toHaveLength(12)
      expect(HISTORY_BY_YEAR[year].standings.map((r) => r.abbr)).not.toContain('GS')
    }
    for (const s of HISTORY) {
      for (const r of s.standings) {
        expect(r.w + r.l).toBeGreaterThan(0)
        expect(TEAM_BY_ABBR[r.abbr]).toBeTruthy()
      }
      // Eight teams make the playoffs, whatever the league size.
      expect(s.standings.filter((r) => r.inPlayoffs)).toHaveLength(8)
      expect(s.standings.map((r) => r.seed)).toEqual(s.standings.map((_, i) => i + 1))
    }
  })

  it('commits no regular-season games — that is what keeps it small', () => {
    for (const s of HISTORY) {
      expect(s.games.every((g) => g.seasonType === 'playoffs')).toBe(true)
      expect(s.games.length).toBeGreaterThanOrEqual(15) // 4 + 2 + 1 series, min lengths
    }
  })
})

// The reason this archive can't share one SERIES_LENGTH with the live app.
describe('per-season series lengths', () => {
  it('records the Finals growing from best-of-5 to best-of-7 in 2025', () => {
    expect(HISTORY_BY_YEAR[2025].lengths).toEqual({ R1: 3, SF: 5, Final: 7 })
    for (const year of [2024, 2023, 2022]) {
      expect(HISTORY_BY_YEAR[year].lengths).toEqual({ R1: 3, SF: 5, Final: 5 })
    }
  })

  it('draws each bracket against its OWN lengths, not this season’s', () => {
    // 2023's Finals ended 3-1. Against 2025's best-of-7 that would read as unfinished —
    // the whole reason lengths travel with the season.
    const s = HISTORY_BY_YEAR[2023]
    const final = seasonBracket(s).rounds.Final[0]
    expect(final.bestOf).toBe(5)
    expect(final.need).toBe(3)
    expect(final.complete).toBe(true)
    expect(final.winner).toBe('LV')

    // And 2025's sweep needed four wins, which only a best-of-7 asks for.
    const final25 = seasonBracket(HISTORY_BY_YEAR[2025]).rounds.Final[0]
    expect(final25.bestOf).toBe(7)
    expect(final25.need).toBe(4)
    expect(final25.wins[final25.winner]).toBe(4)
  })

  it('has lengths consistent with the games each series actually took', () => {
    for (const s of HISTORY) {
      const b = seasonBracket(s)
      for (const [round, slots] of Object.entries(b.rounds)) {
        for (const slot of slots.filter((x) => !x.projected)) {
          expect(slot.bestOf).toBe(s.lengths[round])
          // A completed series can't have run longer than its format allows.
          expect(slot.games.length).toBeLessThanOrEqual(s.lengths[round])
          expect(slot.wins[slot.winner]).toBe(Math.ceil(s.lengths[round] / 2))
        }
      }
    }
  })
})

describe('rebuilding an archived season', () => {
  it('reproduces the real champion, runner-up and Finals margin', () => {
    for (const [year, [champ, runnerUp, wins, bestOf]] of Object.entries(FINALS)) {
      const s = HISTORY_BY_YEAR[year]
      const finals = finalsSummary(s)
      expect(finals.winner).toBe(champ)
      expect(finals.loser).toBe(runnerUp)
      expect(finals.wins).toEqual(wins)
      expect(finals.bestOf).toBe(bestOf)
      // The committed summary and the recomputed bracket must agree.
      expect(s.champion).toBe(champ)
      expect(s.runnerUp).toBe(runnerUp)
    }
  })

  it('fills all seven bracket slots from the committed playoff games', () => {
    for (const s of HISTORY) {
      const b = seasonBracket(s)
      expect(b.rounds.R1).toHaveLength(4)
      expect(b.rounds.SF).toHaveLength(2)
      expect(b.rounds.Final).toHaveLength(1)
      expect(b.projected).toBe(false)
      for (const slot of [...b.rounds.R1, ...b.rounds.SF, ...b.rounds.Final]) {
        expect(slot.complete).toBe(true)
      }
    }
  })
})

describe('a season without a finished Finals', () => {
  // Not a shape the committed file holds, but finalsSummary has to survive one: the
  // fetch script runs the same code on a season in progress to decide whether to commit
  // it at all.
  const partial = { ...HISTORY_BY_YEAR[2023], games: [] }

  it('reports no Finals result rather than inventing one', () => {
    const finals = finalsSummary(partial)
    expect(finals.winner).toBeNull()
    expect(finals.wins).toBeNull()
  })
})

describe('how far a team went', () => {
  const b2023 = seasonBracket(HISTORY_BY_YEAR[2023])

  it('labels each exit round, and the title', () => {
    expect(runResult(b2023, 'LV')).toBe('Won the title')
    expect(runResult(b2023, 'NY')).toBe('Lost the Finals')
    expect(runResult(b2023, 'CON')).toBe('Lost the semifinals')
    expect(runResult(b2023, 'CHI')).toBe('Lost in the first round')
  })

  it('returns null for a team that missed the playoffs', () => {
    expect(runResult(b2023, 'IND')).toBeNull() // 13-27 in 2023
    expect(runResult(b2023, null)).toBeNull()
  })
})

describe('the leader boards', () => {
  it('covers every category the live Stats view offers', () => {
    for (const s of HISTORY) {
      for (const cat of LEADER_CATEGORIES) {
        expect(s.leaders[cat.key].length).toBeGreaterThan(0)
        // Per-game averages always fill a board of ten (ties can push it past).
        if (cat.key.startsWith('avg') || cat.key.endsWith('Pct')) {
          expect(s.leaders[cat.key].length).toBeGreaterThanOrEqual(10)
        }
      }
    }
  })

  it('leaves the counting boards short when few players recorded one', () => {
    // A triple-double is rare in the WNBA — between three and seven players a season have
    // one — and leaderboard() drops everyone on zero rather than padding the board out.
    for (const s of HISTORY) {
      const td = s.leaders.tripleDouble
      expect(td.length).toBeLessThan(10)
      expect(td.length).toBeGreaterThan(0)
      for (const row of td) expect(row.value).toBeGreaterThan(0)
    }
  })

  it('joins every board row to a stat line in that season’s player table', () => {
    for (const s of HISTORY) {
      for (const board of Object.values(s.leaders)) {
        for (const row of board) {
          const p = s.players[row.id]
          expect(p).toBeTruthy()
          expect(TEAM_BY_ABBR[p.team]).toBeTruthy()
          expect(typeof row.value).toBe('number')
        }
      }
    }
  })
})

describe('the season totals', () => {
  it('matches the games each season actually played', () => {
    for (const s of HISTORY) {
      const t = s.totals
      const teamGames = s.standings.reduce((n, r) => n + r.w + r.l, 0)
      expect(t.played).toBe(teamGames / 2)
      expect(t.combinedPpg).toBeCloseTo(t.points / t.played, 1)
      expect(t.closest).toHaveLength(5)
      expect(t.highest).toHaveLength(5)
    }
  })

  it('grew with the schedule — 36 games a team in 2022, 44 by 2025', () => {
    expect(HISTORY_BY_YEAR[2022].standings[0].w + HISTORY_BY_YEAR[2022].standings[0].l).toBe(36)
    expect(HISTORY_BY_YEAR[2025].standings[0].w + HISTORY_BY_YEAR[2025].standings[0].l).toBe(44)
  })

  it('keeps only those ten regular-season games, each with an id to open', () => {
    for (const s of HISTORY) {
      for (const g of [...s.totals.closest, ...s.totals.highest]) {
        expect(g.id).toMatch(/^\d+$/)
        expect(s.games.some((x) => x.id === g.id)).toBe(false)
      }
      const margin = (g) => Math.abs(g.score[0] - g.score[1])
      expect(Math.max(...s.totals.closest.map(margin))).toBeLessThanOrEqual(3)
    }
  })
})
