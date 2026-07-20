import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Lineups fetches the ESPN summary when a game opens; it has its own suite
// (lineups.test.jsx), so stub it out here to keep these tests off the network.
vi.mock('../src/components/Lineups.jsx', () => ({ default: () => null }))
import GameDetail from '../src/components/GameDetail.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'
const played = GAMES.find((g) => g.score && g.venue && g.broadcast)
const upcoming = GAMES.find((g) => !g.score && !g.postponed)

const open = (game, props = {}) =>
  render(<GameDetail game={game} games={GAMES} tz={TZ} onClose={() => {}} {...props} />)

describe('GameDetail', () => {
  it('renders nothing without a game', () => {
    const { container } = render(<GameDetail game={null} games={GAMES} tz={TZ} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the final score and venue for a played game', () => {
    const { container } = open(played)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Scoped to the headline — the season-series list below uses the same format.
    expect(container.querySelector('.md-score').textContent).toBe(
      `${played.score[1]} – ${played.score[0]}`
    )
    expect(screen.getByText(new RegExp(played.venue))).toBeInTheDocument()
  })

  it('shows tip time instead of a score for an upcoming game', () => {
    open(upcoming)
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.queryByText('Final')).not.toBeInTheDocument()
  })

  it('hides the score in spoiler-free mode', () => {
    const { container } = open(played, { hideScores: true })
    expect(container.querySelector('.md-score')).toBeNull()
    // …including in the season-series list, which would otherwise leak results.
    for (const el of container.querySelectorAll('.drill-score')) {
      expect(el.textContent).toBe('—')
    }
  })

  it('marks the stronger side in the tale of the tape', () => {
    const { container } = open(played)
    expect(container.querySelectorAll('.tale-val.better').length).toBeGreaterThan(0)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    open(played, { onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when the backdrop is clicked but not the panel', async () => {
    const onClose = vi.fn()
    const { container } = open(played, { onClose })
    await userEvent.click(container.querySelector('.modal'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus into the dialog when it opens', () => {
    const { container } = open(played)
    expect(container.querySelector('.modal').contains(document.activeElement)).toBe(true)
  })

  it('jumps to a team’s schedule', async () => {
    const onPickTeam = vi.fn()
    const onClose = vi.fn()
    open(played, { onPickTeam, onClose })
    const [btn] = screen.getAllByRole('button', { name: /schedule$/ })
    await userEvent.click(btn)
    expect(onPickTeam).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('lists the season series when the teams have met', () => {
    // Find a matchup that has been played more than once.
    const counts = {}
    for (const g of GAMES) {
      if (!g.score) continue
      const k = [g.home, g.away].sort().join('|')
      counts[k] = (counts[k] || 0) + 1
    }
    const repeated = Object.entries(counts).find(([, n]) => n > 1)?.[0]
    const [a, b] = repeated.split('|')
    const game = GAMES.find(
      (g) => g.score && [g.home, g.away].includes(a) && [g.home, g.away].includes(b)
    )
    open(game)
    expect(screen.getByText(/Season series/)).toBeInTheDocument()
  })
})
