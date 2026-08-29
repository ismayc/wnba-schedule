import { describe, it, expect } from 'vitest'
import { deferUnsettledResults } from '../scripts/fetch-schedule.mjs'

// The scoreboard feed lags the schedule feed for a few minutes after a game ends, so a
// refresh landing in that window sees a final score with no quarter breakdown. Holding
// that one result back keeps the rest of the refresh shippable; see the long note in
// scripts/fetch-schedule.mjs. These cover both bounds on that hold-back, because a
// deferral that fires too widely would ship a season quietly missing results.

const NOW = Date.parse('2026-08-29T02:11:00.000Z')
const ago = (h) => new Date(NOW - h * 3600e3).toISOString()

const game = (over = {}) => ({
  id: '401857180',
  tip: ago(2.7),
  seasonType: 'regular',
  home: 'ATL',
  away: 'POR',
  score: [83, 101],
  ...over,
})

const committed = (...games) => new Map(games.map((g) => [g.id, g]))

describe('deferUnsettledResults', () => {
  it('holds back a result whose line score has not landed yet', () => {
    const games = [game()]
    expect(deferUnsettledResults(games, committed(), NOW)).toHaveLength(1)
    expect(games[0].score).toBeUndefined()
    // The game has to read as unplayed, not as a half-filled result.
    expect(games[0].ot).toBeUndefined()
    expect(games[0].stars).toBeUndefined()
    // Everything that is not the result survives — this is the same game, still on.
    expect(games[0]).toMatchObject({ id: '401857180', home: 'ATL', away: 'POR' })
  })

  it('drops the overtime count and leaders along with the score', () => {
    const games = [game({ ot: 1, stars: [{ cat: 'points', v: '30', who: 'A', team: 'POR' }] })]
    deferUnsettledResults(games, committed(), NOW)
    expect(games[0]).not.toHaveProperty('ot')
    expect(games[0]).not.toHaveProperty('stars')
  })

  it('leaves a complete result alone', () => {
    const games = [game({ line: { home: [20, 21, 20, 22], away: [25, 26, 25, 25] } })]
    expect(deferUnsettledResults(games, committed(), NOW)).toHaveLength(0)
    expect(games[0].score).toEqual([83, 101])
  })

  it('leaves an unplayed game alone', () => {
    const games = [game({ score: undefined })]
    expect(deferUnsettledResults(games, committed(), NOW)).toHaveLength(0)
  })

  // The two bounds: a result the snapshot already had, or one too old to still be
  // settling, is a regression rather than a race — it stays put and fails the gate.
  it('keeps a score the committed snapshot already carried', () => {
    const games = [game()]
    expect(deferUnsettledResults(games, committed(game()), NOW)).toHaveLength(0)
    expect(games[0].score).toEqual([83, 101])
  })

  it('keeps a score whose game finished hours ago', () => {
    const games = [game({ tip: ago(9) })]
    expect(deferUnsettledResults(games, committed(), NOW)).toHaveLength(0)
    expect(games[0].score).toEqual([83, 101])
  })

  it('holds back a full simultaneous slate', () => {
    const slate = ['a', 'b', 'c', 'd'].map((id) => game({ id }))
    expect(deferUnsettledResults(slate, committed(), NOW)).toHaveLength(4)
  })

  it('refuses to hold back more than one slate at once', () => {
    const slate = ['a', 'b', 'c', 'd', 'e'].map((id) => game({ id }))
    expect(() => deferUnsettledResults(slate, committed(), NOW)).toThrow(
      /5 games went final with no line score/
    )
    // Nothing is mutated on the way out — the run dies with the results intact.
    expect(slate.every((g) => g.score)).toBe(true)
  })
})
