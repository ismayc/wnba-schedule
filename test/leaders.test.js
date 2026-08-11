import { describe, it, expect } from 'vitest'
import {
  parseLeaders,
  parseAthleteSeason,
  parseSeasonTeams,
  resolveSeasonTeams,
} from '../scripts/leaders.mjs'

// ESPN's published column order (data.categories[].names) for each category.
const CANONICAL = {
  general: ['gamesPlayed', 'avgMinutes', 'doubleDouble', 'tripleDouble', 'PER', 'avgRebounds'],
  offensive: [
    'points', 'avgPoints', 'avgFieldGoalsMade', 'avgFieldGoalsAttempted', 'fieldGoalPct',
    'avgThreePointFieldGoalsMade', 'avgThreePointFieldGoalsAttempted', 'threePointFieldGoalPct',
    'avgFreeThrowsMade', 'avgFreeThrowsAttempted', 'freeThrowPct', 'avgAssists', 'avgTurnovers',
  ],
  defensive: ['avgSteals', 'avgBlocks'],
}

// Build a byathlete response for a given per-category column order. Each player's stats
// are a flat { espnName: value } map, and every category's `values` array is laid out to
// match that category's `names` order — exactly as the real feed self-describes.
const makeFeed = (order, players) => ({
  categories: Object.entries(order).map(([name, names]) => ({ name, names })),
  athletes: players.map((p) => ({
    athlete: {
      id: p.id,
      displayName: p.name,
      shortName: p.short ?? p.name,
      teamShortName: p.team,
      teams: p.team ? [{ abbreviation: p.team }] : [],
      position: { abbreviation: p.pos ?? 'G' },
    },
    categories: Object.entries(order).map(([name, names]) => ({
      name,
      values: names.map((n) => (n in p.stats ? p.stats[n] : null)),
    })),
  })),
})

const wilson = {
  id: '1',
  name: "A'ja Wilson",
  short: 'A. Wilson',
  team: 'LV',
  pos: 'F',
  stats: {
    gamesPlayed: 22, avgMinutes: 31.68, PER: 30, avgRebounds: 9.772,
    points: 562, avgPoints: 25.545, fieldGoalPct: 51.538,
    avgAssists: 2.863, avgTurnovers: 2.545, avgSteals: 1.545, avgBlocks: 1.954,
  },
}

describe('parseLeaders', () => {
  it('maps every value by the feed’s published column name', () => {
    const [p] = parseLeaders(makeFeed(CANONICAL, [wilson]))
    expect(p).toMatchObject({
      id: '1',
      short: 'A. Wilson',
      // Season membership, not the current club — resolved from the splits by the caller.
      teams: ['LV'],
      current: 'LV',
      pos: 'F',
      gamesPlayed: 22,
      points: 562, // a whole season total
      // Rates keep four decimals so the boards can sort a pair that DISPLAYS the same.
      avgPoints: 25.545,
      avgRebounds: 9.772,
      avgAssists: 2.863,
      fgPct: 51.538,
      per: 30,
      avgSteals: 1.545,
      avgBlocks: 1.954,
    })
  })

  it('stays correct when the feed REORDERS its columns (the latent bug)', () => {
    // Reverse the offensive columns; values follow. A positional map would now read
    // avgPoints from the wrong column — resolving by name keeps it right.
    const reordered = { ...CANONICAL, offensive: [...CANONICAL.offensive].reverse() }
    const [p] = parseLeaders(makeFeed(reordered, [wilson]))
    expect(p.avgPoints).toBe(25.545)
    expect(p.points).toBe(562)
    expect(p.fgPct).toBe(51.538)
    expect(p.avgAssists).toBe(2.863)
    // Sanity: avgTurnovers (which sat where avgPoints does positionally) is its own value.
    expect(p.avgTurnovers).toBe(2.545)
  })

  it('yields null for a renamed/removed stat rather than a value from the wrong column', () => {
    // ESPN renames avgPoints; the old column name is gone.
    const renamed = {
      ...CANONICAL,
      offensive: CANONICAL.offensive.map((n) => (n === 'avgPoints' ? 'pointsPerGame' : n)),
    }
    const [p] = parseLeaders(makeFeed(renamed, [wilson]))
    expect(p.avgPoints).toBeNull()
    expect(p.points).toBe(562) // untouched
  })

  it('drops players with no games, and sorts by avgPoints desc', () => {
    const out = parseLeaders(
      makeFeed(CANONICAL, [
        { id: 'low', name: 'Low', team: 'A', stats: { gamesPlayed: 10, avgPoints: 10 } },
        { id: 'high', name: 'High', team: 'B', stats: { gamesPlayed: 10, avgPoints: 30 } },
        { id: 'nogames', name: 'NoGames', team: 'C', stats: { gamesPlayed: 0, avgPoints: 99 } },
      ])
    )
    expect(out.map((p) => p.id)).toEqual(['high', 'low'])
  })
})

// ── The per-athlete season payload ───────────────────────────────────────────
// ESPN's byathlete feed answered with 128 of 207 rostered players in 2026 (no Ionescu,
// Plum or Collier) and omitted Angel Reese — the rebounding leader — from 2025, so anyone
// it skips is rebuilt from /athletes/{id}/stats. Its column order is NOT the byathlete
// order, and not the NBA's either, so every value is read by the payload's own labels.
const ATHLETE = {
  categories: [
    {
      name: 'averages',
      labels: ['GP', 'GS', 'MIN', 'PTS', 'OR', 'DR', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'PF'],
      statistics: [
        {
          teamId: '5',
          season: { year: 2026 },
          stats: ['12', '12', '30.0', '23.9', '1.0', '3.0', '4.0', '5.0', '1.0', '0.5', '2.0', '8.0-17.0', '47.1', '2.6-6.8', '38.3', '5.3-6.0', '88.3', '2.0'],
        },
        {
          teamId: '9',
          season: { year: 2026 },
          stats: ['4', '4', '28.0', '17.3', '1.0', '3.0', '4.0', '4.0', '1.0', '0.5', '2.0', '6.0-14.0', '42.9', '2.0-5.0', '40.0', '3.3-4.0', '82.5', '2.0'],
        },
        {
          displayName: '2026 Totals',
          teamSlug: '2026 Totals',
          season: { year: 2026 },
          stats: ['16', '16', '29.5', '22.3', '1.0', '3.0', '4.0', '4.8', '1.0', '0.5', '2.0', '7.5-16.3', '46.2', '2.4-6.3', '38.6', '4.8-5.5', '86.9', '2.0'],
        },
      ],
    },
    {
      name: 'totals',
      labels: ['PTS', 'OR', 'DR', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'PF'],
      statistics: [
        {
          displayName: '2026 Totals',
          season: { year: 2026 },
          stats: ['356', '16', '48', '64', '77', '16', '8', '32', '120-260', '46.2', '38-98', '38.8', '78-90', '86.7', '32'],
        },
      ],
    },
    {
      name: 'miscellaneous',
      labels: ['DD2', 'TD3'],
      statistics: [{ displayName: '2026 Totals', season: { year: 2026 }, stats: ['1', '0'] }],
    },
  ],
}

const META = { id: '9', name: 'Kelsey Plum', short: 'K. Plum', pos: 'G', current: 'PHX' }

describe('parseAthleteSeason', () => {
  it('computes averages from integer totals rather than a rounded display value', () => {
    const p = parseAthleteSeason(ATHLETE, 2026, META)
    expect(p.gamesPlayed).toBe(16)
    expect(p.points).toBe(356)
    // 356 / 16 = 22.25 exactly — the payload's own "22.3" would have thrown the sort.
    expect(p.avgPoints).toBe(22.25)
    expect(p.avgAssists).toBe(4.8125)
    expect(p.avgRebounds).toBe(4)
    // "120-260" is a made-attempted pair in one column.
    expect(p.avgFgMade).toBe(7.5)
    expect(p.avgFgAtt).toBe(16.25)
    expect(p.fgPct).toBe(46.1538)
    expect(p.avgThreeMade).toBe(2.375)
    expect(p.threePct).toBe(38.7755)
    // Counts come from the miscellaneous block; PER is the one stat this payload lacks.
    expect(p.doubleDouble).toBe(1)
    expect(p.tripleDouble).toBe(0)
    expect(p.per).toBeNull()
  })

  it('returns null for a rostered player who never appeared', () => {
    const empty = { categories: [{ name: 'averages', labels: ['GP'], statistics: [] }] }
    expect(parseAthleteSeason(empty, 2026, META)).toBeNull()
  })

  it('reads the per-team splits in order, skipping the combined row', () => {
    const abbrById = new Map([['5', 'LA'], ['9', 'PHX']])
    // The combined row carries no teamId; counting it would double the games.
    expect(parseSeasonTeams(ATHLETE, 2026, abbrById)).toEqual([
      { abbr: 'LA', gp: 12 },
      { abbr: 'PHX', gp: 4 },
    ])
  })

  it('ignores splits from another season', () => {
    expect(parseSeasonTeams(ATHLETE, 2025, new Map([['5', 'LA']]))).toEqual([])
  })
})

describe('resolveSeasonTeams', () => {
  it('badges the club she played the most games for', () => {
    const p = resolveSeasonTeams({ teams: ['PHX', 'LA'], current: 'PHX', gamesPlayed: 16 }, [
      { abbr: 'LA', gp: 12 },
      { abbr: 'PHX', gp: 4 },
    ])
    expect(p.team).toBe('LA')
    expect(p.teams).toEqual([{ abbr: 'LA', gp: 12 }, { abbr: 'PHX', gp: 4 }])
    expect(p.current).toBeUndefined()
  })

  it('gives a one-club season all of her games without needing a split', () => {
    const p = resolveSeasonTeams({ teams: ['LV'], current: 'LV', gamesPlayed: 30 }, undefined)
    expect(p.teams).toEqual([{ abbr: 'LV', gp: 30 }])
    expect(p.team).toBe('LV')
  })

  it('keeps the raw membership, games unknown, when the split could not be resolved', () => {
    const p = resolveSeasonTeams({ teams: ['LA', 'PHX'], current: 'PHX', gamesPlayed: 16 }, undefined)
    expect(p.teams).toEqual([{ abbr: 'LA', gp: null }, { abbr: 'PHX', gp: null }])
    // Nothing to compare on, so the first listed club stands.
    expect(p.team).toBe('LA')
  })

  it('falls back to the current club when the feed lists no membership at all', () => {
    const p = resolveSeasonTeams({ teams: [], current: 'SEA', gamesPlayed: 5 }, undefined)
    expect(p.teams).toEqual([{ abbr: 'SEA', gp: 5 }])
    expect(p.team).toBe('SEA')
  })
})
