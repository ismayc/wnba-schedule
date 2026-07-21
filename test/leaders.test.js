import { describe, it, expect } from 'vitest'
import { parseLeaders } from '../scripts/leaders.mjs'

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
      team: 'LV',
      pos: 'F',
      gamesPlayed: 22,
      points: 562, // 0 decimals
      avgPoints: 25.5, // 1 decimal
      avgRebounds: 9.8,
      avgAssists: 2.9,
      fgPct: 51.5,
      per: 30,
      avgSteals: 1.5,
      avgBlocks: 2,
    })
  })

  it('stays correct when the feed REORDERS its columns (the latent bug)', () => {
    // Reverse the offensive columns; values follow. A positional map would now read
    // avgPoints from the wrong column — resolving by name keeps it right.
    const reordered = { ...CANONICAL, offensive: [...CANONICAL.offensive].reverse() }
    const [p] = parseLeaders(makeFeed(reordered, [wilson]))
    expect(p.avgPoints).toBe(25.5)
    expect(p.points).toBe(562)
    expect(p.fgPct).toBe(51.5)
    expect(p.avgAssists).toBe(2.9)
    // Sanity: avgTurnovers (which sat where avgPoints does positionally) is its own value.
    expect(p.avgTurnovers).toBe(2.5)
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

  it('drops players with no team or no games, and sorts by avgPoints desc', () => {
    const out = parseLeaders(
      makeFeed(CANONICAL, [
        { id: 'low', name: 'Low', team: 'A', stats: { gamesPlayed: 10, avgPoints: 10 } },
        { id: 'high', name: 'High', team: 'B', stats: { gamesPlayed: 10, avgPoints: 30 } },
        { id: 'noteam', name: 'NoTeam', team: null, stats: { gamesPlayed: 10, avgPoints: 99 } },
        { id: 'nogames', name: 'NoGames', team: 'C', stats: { gamesPlayed: 0, avgPoints: 99 } },
      ])
    )
    expect(out.map((p) => p.id)).toEqual(['high', 'low'])
  })
})
