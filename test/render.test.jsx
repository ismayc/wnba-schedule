import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StandingsView from '../src/components/StandingsView.jsx'
import ScheduleView from '../src/components/ScheduleView.jsx'
import GameCard from '../src/components/GameCard.jsx'
import { GAMES } from '../src/data/schedule.js'
import { dayKey, todayKey } from '../src/utils/time.js'

const TZ = 'America/New_York'

beforeEach(() => {
  // jsdom has no layout, so scrollIntoView is absent.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('StandingsView', () => {
  it('renders all 15 teams with the leader first', () => {
    render(<StandingsView games={GAMES} />)
    const rows = screen.getAllByRole('row').filter((r) => within(r).queryByRole('button', { name: /Follow/ }))
    expect(rows).toHaveLength(15)
    expect(within(rows[0]).getByText('Lynx')).toBeInTheDocument()
  })

  it('shows the playoff cutline after the 8th seed', () => {
    render(<StandingsView games={GAMES} />)
    expect(screen.getByText(/top 8 make the postseason/i)).toBeInTheDocument()
  })

  it('switches to conference tables', async () => {
    render(<StandingsView games={GAMES} />)
    await userEvent.click(screen.getByRole('button', { name: 'Conference' }))
    expect(screen.getByText('Eastern Conference')).toBeInTheDocument()
    expect(screen.getByText('Western Conference')).toBeInTheDocument()
  })

  it('calls onPick when a team is clicked', async () => {
    const onPick = vi.fn()
    const { container } = render(<StandingsView games={GAMES} onPick={onPick} />)
    // Scoped to the team button — /Lynx/ alone also matches the "Follow Minnesota
    // Lynx" star control in the same row.
    await userEvent.click(container.querySelector('.team-btn'))
    expect(onPick).toHaveBeenCalledWith('MIN')
  })
})

describe('GameCard', () => {
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

  it('marks the winner and shows the final', () => {
    const { container } = render(<GameCard game={base} tz={TZ} />)
    expect(screen.getByText('Final')).toBeInTheDocument()
    expect(container.querySelector('.side.winner .side-nick').textContent).toBe('Wings')
  })

  it('annotates overtime', () => {
    render(<GameCard game={{ ...base, ot: 2 }} tz={TZ} />)
    expect(screen.getByText('Final/2OT')).toBeInTheDocument()
  })

  it('hides scores in spoiler-free mode', () => {
    render(<GameCard game={base} tz={TZ} hideScores />)
    expect(screen.queryByText('90')).not.toBeInTheDocument()
  })

  it('renders tip time in the chosen timezone', () => {
    render(<GameCard game={{ ...base, score: undefined }} tz={TZ} />)
    expect(screen.getByText('1:00 PM')).toBeInTheDocument()
    // Same instant, three hours earlier out west.
    render(<GameCard game={{ ...base, score: undefined }} tz="America/Los_Angeles" />)
    expect(screen.getByText('10:00 AM')).toBeInTheDocument()
  })

  it('flags postponed games', () => {
    render(<GameCard game={{ ...base, score: undefined, postponed: true }} tz={TZ} />)
    expect(screen.getByText('Postponed')).toBeInTheDocument()
  })

  it('labels games on the owner’s services and skips ones that are not', () => {
    const { container, rerender } = render(
      <GameCard game={{ ...base, broadcast: ['NBC', 'Peacock'] }} tz={TZ} />
    )
    const watch = container.querySelector('.watch')
    expect(watch).toHaveAccessibleName('Watch on YouTube TV, Peacock')
    expect([...watch.querySelectorAll('.watch-chip')].map((c) => c.textContent)).toEqual([
      'YouTube TV',
      'Peacock',
    ])

    // League Pass-only games carry no watchable-service badge.
    rerender(<GameCard game={{ ...base, broadcast: ['WNBA League Pass'] }} tz={TZ} />)
    expect(container.querySelector('.watch')).toBeNull()
  })
})

describe('ScheduleView', () => {
  it('groups games under day headings', () => {
    const { container } = render(<ScheduleView games={GAMES} tz={TZ} showPast />)
    expect(container.querySelectorAll('.day').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/game/).length).toBeGreaterThan(0)
  })

  it('shows an empty state when filters match nothing', () => {
    render(<ScheduleView games={[]} tz={TZ} />)
    expect(screen.getByText(/No games match/i)).toBeInTheDocument()
  })

  // Past days are dropped whole rather than by tip-off time, so a game earlier
  // today still counts as today.
  describe('past days', () => {
    const today = todayKey(TZ)
    const keysOf = (c) =>
      [...c.querySelectorAll('.day')].map((d) => d.querySelector('.day-head span').textContent)

    it('hides previous days by default', () => {
      const { container } = render(<ScheduleView games={GAMES} tz={TZ} />)
      const shown = new Set(
        GAMES.filter((g) => dayKey(g.tip, TZ) >= today).map((g) => dayKey(g.tip, TZ))
      )
      expect(container.querySelectorAll('.day')).toHaveLength(shown.size)
    })

    it('reveals them when asked', () => {
      const { container: hidden } = render(<ScheduleView games={GAMES} tz={TZ} />)
      const nHidden = hidden.querySelectorAll('.day').length

      const { container: shown } = render(<ScheduleView games={GAMES} tz={TZ} showPast />)
      const nShown = shown.querySelectorAll('.day').length

      expect(nShown).toBeGreaterThan(nHidden)
      // Every day in the season is accounted for.
      const allKeys = new Set(GAMES.map((g) => dayKey(g.tip, TZ)))
      expect(nShown).toBe(allKeys.size)
    })

    it('keeps today visible in both states', () => {
      for (const showPast of [false, true]) {
        const { container, unmount } = render(
          <ScheduleView games={GAMES} tz={TZ} showPast={showPast} />
        )
        // "Today" is the label the day header uses for the current date.
        expect(keysOf(container)).toContain('Today')
        unmount()
      }
    })

    it('renders only future-or-today days when hiding', () => {
      const { container } = render(<ScheduleView games={GAMES} tz={TZ} />)
      // The first rendered day must not precede today.
      const firstGame = GAMES.filter((g) => dayKey(g.tip, TZ) >= today).sort((a, b) =>
        a.tip.localeCompare(b.tip)
      )[0]
      expect(container.querySelectorAll('.day').length).toBeGreaterThan(0)
      expect(dayKey(firstGame.tip, TZ) >= today).toBe(true)
    })
  })
})
