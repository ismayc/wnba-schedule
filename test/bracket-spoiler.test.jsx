import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import RadialBracket from '../src/components/RadialBracket.jsx'
import { PLAYOFFS_2025 } from './fixtures/playoffs-2025.js'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

// Spoiler-free mode ("Hide all winners"): a bracket shows matchups, games, and dates,
// but no result. The 2025 postseason is fully decided (Las Vegas swept Phoenix 4-0 in
// the Finals), so every result path has something to leak.
describe('Bracket in spoiler-free mode', () => {
  it('shows no series win counts and no winner or loser styling', () => {
    const { container } = render(<Bracket games={PLAYOFFS_2025} tz={TZ} hideScores />)
    expect(container.querySelectorAll('.bx-series')).toHaveLength(7)
    expect(container.querySelectorAll('.bx-wins')).toHaveLength(0)
    expect(container.querySelectorAll('.bx-won, .bx-lost, .bx-series.is-done')).toHaveLength(0)
  })

  it('draws every dot hollow and inert, so the dots do not say how long a series ran', () => {
    const { container } = render(<Bracket games={PLAYOFFS_2025} tz={TZ} hideScores />)
    expect(container.querySelectorAll('.dots .dot')).toHaveLength(0)
    expect(container.querySelectorAll('.dot-w, .dot-l')).toHaveLength(0)
    // Every series shows its full best-of row of hollow dots, whatever it ran to.
    for (const row of container.querySelectorAll('.dots')) {
      expect(row.querySelectorAll('.dot-empty').length).toBe(row.children.length)
    }
    expect(container.querySelectorAll('.dot-empty').length).toBeGreaterThan(0)
  })

  it('drops the next-game line, which says a series is still alive', () => {
    // Unplay the last postseason game so its series has a next game to show.
    const last = PLAYOFFS_2025.findLastIndex((g) => g.score && g.game)
    const games = PLAYOFFS_2025.map((g, i) => (i === last ? { ...g, score: null } : g))
    const shown = render(<Bracket games={games} tz={TZ} />).container
    expect(shown.querySelectorAll('.bx-next').length).toBeGreaterThan(0)
    const hidden = render(<Bracket games={games} tz={TZ} hideScores />).container
    expect(hidden.querySelectorAll('.bx-next')).toHaveLength(0)
  })

  it('keeps played dots as handles onto each game when scores are shown', async () => {
    const onOpen = vi.fn()
    const { container } = render(<Bracket games={PLAYOFFS_2025} tz={TZ} onOpen={onOpen} />)
    await userEvent.click(container.querySelector('.dots .dot'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ seasonType: 'playoffs', game: 1 }))
  })

  it('names no champion', () => {
    const { container } = render(<Bracket games={PLAYOFFS_2025} tz={TZ} hideScores />)
    expect(screen.queryByText(/win the title/i)).not.toBeInTheDocument()
    expect(container.querySelector('.banner-champ')).toBeNull()
  })

  it('leaves the semifinal and Finals slots on their feeder labels', () => {
    const { container } = render(<Bracket games={PLAYOFFS_2025} tz={TZ} hideScores />)
    const finals = container.querySelector('.bx-col-final .bx-series')
    expect(finals.querySelectorAll('.bx-team')).toHaveLength(0)
    expect([...finals.querySelectorAll('.bx-feeder')].map((n) => n.textContent)).toEqual([
      'Semifinal winner',
      'Semifinal winner',
    ])
    for (const sf of container.querySelectorAll('.bx-col-mid .bx-series')) {
      expect(sf.querySelectorAll('.bx-team')).toHaveLength(0)
      expect(sf.querySelector('.bx-feeder')).toHaveTextContent(/^Winner /)
    }
    // The first round is the seeding, so its eight teams still show.
    expect(container.querySelectorAll('.bx-series .bx-team')).toHaveLength(8)
  })

  it('still shows the projected bracket and its seeds before the postseason', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} hideScores />)
    expect(screen.getByText(/Projected\./)).toBeInTheDocument()
    const first = container.querySelector('.bx-series')
    expect([...first.querySelectorAll('.bx-seed')].map((n) => n.textContent)).toEqual(['1', '8'])
    expect(first.querySelectorAll('.bx-team')).toHaveLength(2)
  })
})

describe('RadialBracket in spoiler-free mode', () => {
  it('fills no inner ring and crowns no champion', () => {
    const { container } = render(<RadialBracket games={PLAYOFFS_2025} hideScores />)
    expect(container.querySelectorAll('.rb-r1.is-empty')).toHaveLength(4)
    expect(container.querySelectorAll('.rb-sf.is-empty')).toHaveLength(2)
    expect(container.querySelector('.rb-node.is-dim')).toBeNull()
    expect(container.querySelector('.rb-trophy')).toBeTruthy()
    expect(container.querySelector('.rb-champ')).toBeNull()
  })

  it('fills the rings when spoiler-free mode is off', () => {
    const { container } = render(<RadialBracket games={PLAYOFFS_2025} />)
    expect(container.querySelectorAll('.rb-r1.is-empty')).toHaveLength(0)
    expect(container.querySelector('.rb-champ')).toBeTruthy()
  })
})
