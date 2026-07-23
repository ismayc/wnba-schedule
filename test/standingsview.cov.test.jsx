import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StandingsView from '../src/components/StandingsView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

// A finished round-robin among 14 of the 15 teams: the stronger (earlier) team always
// wins, so the table has clear clinchers at the top and eliminated sides at the
// bottom. TOR sits out entirely, giving one team a zero streak.
const ORDER = ['MIN', 'LV', 'LA', 'GS', 'PHX', 'SEA', 'DAL', 'POR', 'ATL', 'NY', 'IND', 'CHI', 'CON', 'WSH']

function roundRobin() {
  const games = []
  for (let i = 0; i < ORDER.length; i++) {
    for (let j = i + 1; j < ORDER.length; j++) {
      games.push({
        id: `rr-${i}-${j}`,
        seasonType: 'regular',
        tip: `2026-05-${String(i + 1).padStart(2, '0')}T0${j % 8}:00:00.000Z`,
        home: ORDER[i],
        away: ORDER[j],
        score: [90, 70],
      })
    }
  }
  return games
}

beforeEach(() => {
  localStorage.clear()
})

describe('StandingsView — clinch, elimination, and streak edge cases', () => {
  const games = roundRobin()

  const renderFollowingMin = () => {
    localStorage.setItem('wnba:followed', JSON.stringify(['MIN']))
    return render(
      <FollowProvider>
        <StandingsView games={games} />
      </FollowProvider>
    )
  }

  it('badges clinched and eliminated teams', () => {
    renderFollowingMin()
    expect(screen.getAllByTitle('Clinched a playoff spot').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('Eliminated from playoff contention').length).toBeGreaterThan(0)
  })

  it('flags the followed row and the eliminated rows', () => {
    const { container } = renderFollowingMin()
    expect(container.querySelector('.row-followed')).toBeTruthy()
    expect(container.querySelector('.row-elim')).toBeTruthy()
  })

  it('renders a blank streak for a team that has not played', () => {
    const { container } = renderFollowingMin()
    // 14 teams played (a W/L streak pill), the 15th (TOR) sat out — its streak cell is
    // the blank dash, not a pill.
    expect(container.querySelectorAll('.streak')).toHaveLength(14)
  })

  it('toggles a team from the standings star', async () => {
    const { container } = render(
      <FollowProvider>
        <StandingsView games={games} />
      </FollowProvider>
    )
    const [star] = screen.getAllByRole('button', { name: /^Follow / })
    await userEvent.click(star)
    // The row it belongs to now reads as followed.
    expect(container.querySelector('.row-followed')).toBeTruthy()
  })

  it('switches to conference tables and back to league', async () => {
    render(<StandingsView games={games} />)
    await userEvent.click(screen.getByRole('button', { name: 'Conference' }))
    expect(screen.getByText('Eastern Conference')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'League' }))
    expect(screen.getByText('Playoff seeding')).toBeInTheDocument()
  })
})
