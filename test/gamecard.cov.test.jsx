import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import GameCard from '../src/components/GameCard.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

const TZ = 'America/New_York'

const base = {
  id: '1',
  tip: '2026-07-19T17:00:00.000Z',
  seasonType: 'regular',
  home: 'DAL',
  away: 'LA',
  score: [90, 82],
  venue: 'College Park Center',
  city: 'Arlington',
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

describe('GameCard coverage', () => {
  it('shows a live badge with the current period for a live game', () => {
    const game = { ...base, score: undefined, live: true, period: 3, statusLabel: 'Q3 5:12' }
    const { container } = render(<GameCard game={game} tz={TZ} />)
    const badge = container.querySelector('.live-badge')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toContain('Q3')
    expect(badge.getAttribute('title')).toContain('Q3 5:12')

    // A live game with no status label falls back to a plain "Live" tooltip.
    cleanup()
    const { container: c2 } = render(
      <GameCard game={{ ...base, score: undefined, live: true, period: 2 }} tz={TZ} />
    )
    expect(c2.querySelector('.live-badge').getAttribute('title')).toContain('Live —')
  })

  it('labels a canceled game distinctly from a postponed one', () => {
    render(<GameCard game={{ ...base, score: undefined, canceled: true }} tz={TZ} />)
    expect(screen.getByText('Canceled')).toBeInTheDocument()
  })

  it('shows just the venue when no city is present', () => {
    const { container } = render(<GameCard game={{ ...base, city: undefined }} tz={TZ} />)
    expect(container.querySelector('.game-meta').textContent).toContain('College Park Center')
    expect(container.querySelector('.game-meta').textContent).not.toContain(',')
  })

  it('opens the game on Enter and Space via the keyboard', () => {
    const onOpen = vi.fn()
    const { container } = render(<GameCard game={base} tz={TZ} onOpen={onOpen} />)
    const card = container.querySelector('.game')
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    expect(onOpen).toHaveBeenCalledTimes(2)
    // A non-activating key does nothing.
    fireEvent.keyDown(card, { key: 'a' })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('a keydown on the follow star does not bubble up to open the card', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <FollowProvider>
        <GameCard game={base} tz={TZ} onOpen={onOpen} />
      </FollowProvider>
    )
    const star = container.querySelector('.star')
    fireEvent.keyDown(star, { key: 'Enter' })
    // The star's onKeyDown stops propagation, so the card never opens.
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('reflects the followed state and falls back to the abbr for an unknown team', () => {
    localStorage.setItem('wnba:followed', JSON.stringify(['LA']))
    const { container } = render(
      <FollowProvider>
        <GameCard game={{ ...base, home: 'ZZZ' }} tz={TZ} />
      </FollowProvider>
    )
    // LA is followed → the "Unfollow" control with a filled star.
    expect(screen.getByRole('button', { name: /Unfollow/ })).toBeInTheDocument()
    // ZZZ is not a real franchise → the label uses the raw abbreviation.
    expect(screen.getByRole('button', { name: 'Follow ZZZ' })).toBeInTheDocument()
    const followedSide = container.querySelector('.side.followed')
    expect(followedSide).toBeInTheDocument()
  })

  it('renders a scored All-Star game with the drafted-side score', () => {
    const allStar = {
      id: 'as1',
      tip: '2026-07-26T00:30:00.000Z',
      seasonType: 'allstar',
      home: 'COOP',
      away: 'SPO',
      score: [151, 131],
      venue: 'United Center',
    }
    const { container } = render(<GameCard game={allStar} tz={TZ} />)
    // No franchise names or note → falls back to the abbrs and the generic tag.
    expect(screen.getByText('SPO')).toBeInTheDocument()
    expect(screen.getByText('COOP')).toBeInTheDocument()
    expect(screen.getByText(/All-Star Game/)).toBeInTheDocument()
    // Scored → the away–home score reads on the event card.
    expect(container.querySelector('.allstar-score').textContent.replace(/\s/g, '')).toBe('131–151')
  })
})
