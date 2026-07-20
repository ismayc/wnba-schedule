import { describe, it, expect } from 'vitest'
import { PLAYOFFS_2025 } from './fixtures/playoffs-2025.js'
import { GAMES } from '../src/data/schedule.js'
import { buildSeries, buildBracket, layout, R1_PAIRS } from '../src/utils/bracket.js'

// The 2025 postseason is a finished, independently verifiable tournament: Las Vegas
// beat Phoenix 4-0 in the Finals. If the bracket engine reproduces it exactly, it will
// handle 2026 when the field is set.
describe('the 2025 postseason', () => {
  const series = buildSeries(PLAYOFFS_2025)

  it('groups 24 games into 7 series', () => {
    expect(PLAYOFFS_2025).toHaveLength(24)
    expect(series).toHaveLength(7)
    expect(series.filter((s) => s.round === 'R1')).toHaveLength(4)
    expect(series.filter((s) => s.round === 'SF')).toHaveLength(2)
    expect(series.filter((s) => s.round === 'Final')).toHaveLength(1)
  })

  it('applies the right series length per round', () => {
    const bo = Object.fromEntries(series.map((s) => [s.round, s.bestOf]))
    expect(bo).toEqual({ R1: 3, SF: 5, Final: 7 })
  })

  it('resolves every series to the team that actually won it', () => {
    const winners = Object.fromEntries(series.map((s) => [s.teams.join('/'), s.winner]))
    expect(winners).toMatchObject({
      'GS/MIN': 'MIN', // 2-0
      'ATL/IND': 'IND', // 2-1
      'NY/PHX': 'PHX', // 2-1
      'LV/SEA': 'LV', // 2-1
      'IND/LV': 'LV', // 3-2
      'MIN/PHX': 'PHX', // 3-1
      'LV/PHX': 'LV', // 4-0
    })
  })

  it('counts a series that went the distance', () => {
    const sf = series.find((s) => s.round === 'SF' && s.teams.includes('IND'))
    expect(sf.games).toHaveLength(5)
    expect(sf.wins).toEqual({ LV: 3, IND: 2 })
  })

  it('groups a series correctly even though home/away alternates', () => {
    const s = series.find((s) => s.round === 'Final')
    const hosts = new Set(s.games.map((g) => g.home))
    expect(hosts.size).toBe(2) // both teams hosted
    expect(s.wins).toEqual({ LV: 4, PHX: 0 })
  })

  it('names Las Vegas champion', () => {
    const b = buildBracket(PLAYOFFS_2025)
    expect(b.champion).toBe('LV')
    expect(b.projected).toBe(false)
  })

  it('pairs the semifinals by fixed bracket, not by re-seeding', () => {
    // 1/8 winner (MIN) meets 4/5 winner (PHX); 2/7 winner (LV) meets 3/6 winner (IND).
    const sfPairs = series
      .filter((s) => s.round === 'SF')
      .map((s) => s.teams.join('/'))
      .sort()
    expect(sfPairs).toEqual(['IND/LV', 'MIN/PHX'])
  })

  it('identifies the higher seed as the game-1 host', () => {
    const r1 = series.find((s) => s.round === 'R1' && s.teams.includes('GS'))
    expect(r1.order[0]).toBe('MIN')
  })
})

describe('an in-progress series', () => {
  const partial = PLAYOFFS_2025.filter((g) => g.round === 'Final' && g.game <= 2)

  it('has no winner before the clinching game', () => {
    const [s] = buildSeries(partial)
    expect(s.wins).toEqual({ LV: 2, PHX: 0 })
    expect(s.winner).toBeNull()
    expect(s.complete).toBe(false)
  })

  it('ignores games with no score yet', () => {
    const withUnplayed = [
      ...partial,
      { ...partial[0], id: 'x', game: 3, score: undefined },
    ]
    const [s] = buildSeries(withUnplayed)
    expect(s.wins.LV).toBe(2)
    expect(s.games).toHaveLength(3)
  })
})

describe('projection before the postseason exists', () => {
  const b = buildBracket(GAMES)

  it('marks the bracket projected when no playoff games have been played', () => {
    expect(b.projected).toBe(true)
    expect(b.champion).toBeNull()
  })

  it('fills the first round from the current top 8 seeds', () => {
    expect(b.seeded).toHaveLength(8)
    const seedPairs = b.rounds.R1.map((s) => s.seeds)
    expect(seedPairs).toEqual(R1_PAIRS)
    // Every first-round slot has two real teams.
    for (const s of b.rounds.R1) expect(s.teams).toHaveLength(2)
  })

  it('leaves later rounds empty but labelled', () => {
    expect(b.rounds.SF[0].teams).toHaveLength(0)
    expect(b.rounds.SF[0].feeders).toEqual(['Winner 1/8', 'Winner 4/5'])
    expect(b.rounds.Final[0].teams).toHaveLength(0)
  })

  it('pairs the top seed against the eighth', () => {
    const top = b.rounds.R1[0]
    expect(top.seeds).toEqual([1, 8])
    expect(top.teams[0]).toBe(b.seeded[0].abbr)
  })
})

describe('radial layout', () => {
  const geo = layout()

  it('places eight seeds evenly around the ring', () => {
    expect(geo.leaves).toHaveLength(8)
    const angles = geo.leaves.map((l) => l.angle).sort((a, b) => a - b)
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(45, 5)
    }
  })

  it('puts each match at the midpoint of its two children', () => {
    expect(geo.r1.map((m) => Math.round(m.angle))).toEqual([90, 0, 270, 180])
  })

  it('puts the two semifinals opposite each other so the finalists face off', () => {
    const [a, b] = geo.sf.map((s) => s.angle)
    expect(Math.abs(((a - b + 360) % 360) - 180)).toBeLessThan(0.001)
  })

  it('advances each round inward', () => {
    expect(geo.leaves[0].r).toBeGreaterThan(geo.r1[0].r)
    expect(geo.r1[0].r).toBeGreaterThan(geo.sf[0].r)
  })
})
