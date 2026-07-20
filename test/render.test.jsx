import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StandingsView from '../src/components/StandingsView.jsx'
import ScheduleView from '../src/components/ScheduleView.jsx'
import GameCard from '../src/components/GameCard.jsx'
import { GAMES } from '../src/data/schedule.js'

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
})

describe('ScheduleView', () => {
  it('groups games under day headings', () => {
    render(<ScheduleView games={GAMES.slice(0, 12)} tz={TZ} />)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/game/).length).toBeGreaterThan(0)
  })

  it('shows an empty state when filters match nothing', () => {
    render(<ScheduleView games={[]} tz={TZ} />)
    expect(screen.getByText(/No games match/i)).toBeInTheDocument()
  })
})
