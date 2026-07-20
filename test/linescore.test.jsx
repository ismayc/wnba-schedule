import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
// Lineups fetches on open; stub it so these render tests stay off the network.
vi.mock('../src/components/Lineups.jsx', () => ({ default: () => null }))
import GameDetail from '../src/components/GameDetail.jsx'
import { livePeriod } from '../src/components/GameCard.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'
const withLine = GAMES.find((g) => g.line && !g.ot)
const otGame = GAMES.find((g) => g.line && g.ot)

const open = (game, props = {}) =>
  render(<GameDetail game={game} games={GAMES} tz={TZ} onClose={() => {}} {...props} />)

// Basketball has no enumerable scoring events, so the quarter breakdown is the
// closest thing to a goal timeline. It has to be exactly right or it's worse than
// showing nothing.
describe('line score', () => {
  it('is present for every played game in the committed data', () => {
    const played = GAMES.filter((g) => g.score)
    expect(played.length).toBeGreaterThan(100)
    expect(played.every((g) => g.line)).toBe(true)
  })

  it('always sums to the final score', () => {
    for (const g of GAMES.filter((x) => x.line && x.score)) {
      const sum = (a) => a.reduce((x, y) => x + y, 0)
      expect([sum(g.line.home), sum(g.line.away)]).toEqual(g.score)
    }
  })

  it('renders four quarters plus a total', () => {
    const { container } = open(withLine)
    const heads = [...container.querySelectorAll('.linescore thead th')].map((n) => n.textContent)
    expect(heads).toEqual(['', 'Q1', 'Q2', 'Q3', 'Q4', 'T'])
  })

  it('labels overtime periods beyond the fourth quarter', () => {
    const { container } = open(otGame)
    const heads = [...container.querySelectorAll('.linescore thead th')].map((n) => n.textContent)
    expect(heads.slice(-2)).toEqual(['OT', 'T'])
  })

  it('marks the higher scorer of each quarter', () => {
    const { container } = open(withLine)
    const rows = container.querySelectorAll('.linescore tbody tr')
    // Every quarter has at most one winner, and ties have none.
    for (let q = 0; q < 4; q++) {
      const [a, h] = [rows[0], rows[1]].map((r) => r.querySelectorAll('td')[q])
      const wonCount = [a, h].filter((td) => td.classList.contains('q-won')).length
      expect(wonCount).toBeLessThanOrEqual(1)
    }
  })

  it('is hidden in spoiler-free mode', () => {
    const { container } = open(withLine, { hideScores: true })
    expect(container.querySelector('.linescore')).toBeNull()
    expect(screen.queryByText('By quarter')).not.toBeInTheDocument()
  })

  it('is omitted for a game that has not been played', () => {
    const upcoming = GAMES.find((g) => !g.score && !g.postponed)
    const { container } = open(upcoming)
    expect(container.querySelector('.linescore')).toBeNull()
  })
})

describe('game leaders', () => {
  it('shows points, rebounds, and assists for both teams', () => {
    const { container } = open(withLine)
    const teams = container.querySelectorAll('.gl-team')
    expect(teams).toHaveLength(2)
    for (const t of teams) {
      const cats = [...t.querySelectorAll('.gl-cat')].map((n) => n.textContent)
      expect(cats).toEqual(['PTS', 'REB', 'AST'])
    }
  })

  it('attributes each leader to their own team', () => {
    const game = withLine
    for (const s of game.stars) {
      expect([game.home, game.away]).toContain(s.team)
    }
  })
})

// A basketball score moves every ~35 seconds, so the display must not imply
// precision the 30s poll can't deliver.
describe('livePeriod', () => {
  it('reports the period rather than a running clock', () => {
    expect(livePeriod({ period: 3, statusLabel: 'Q3 4:21' })).toBe('Q3')
  })

  it('handles halftime and end-of-period states', () => {
    expect(livePeriod({ period: 2, statusLabel: 'Halftime' })).toBe('HALF')
    expect(livePeriod({ period: 1, statusLabel: 'End of 1st' })).toBe('END OF 1ST')
  })

  it('labels overtime', () => {
    expect(livePeriod({ period: 5, statusLabel: 'OT 2:00' })).toBe('OT')
    expect(livePeriod({ period: 6, statusLabel: '2OT 1:00' })).toBe('OT2')
  })

  it('falls back to the feed label when the period is unknown', () => {
    expect(livePeriod({ statusLabel: 'Delayed' })).toBe('DELAYED')
    expect(livePeriod({})).toBe('LIVE')
  })
})
