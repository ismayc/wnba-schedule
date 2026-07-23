import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TeamPanel from '../src/components/TeamPanel.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

const TZ = 'America/New_York'

// A finished round-robin among 14 teams: the stronger (earlier) side always wins, so
// MIN clinches and WSH is eliminated.
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
  Element.prototype.scrollIntoView = vi.fn()
})

const open = (abbr, games, props = {}) =>
  render(
    <FollowProvider>
      <TeamPanel abbr={abbr} games={games} tz={TZ} onClose={() => {}} {...props} />
    </FollowProvider>
  )

describe('TeamPanel — clinch, elimination, live, and backdrop paths', () => {
  it('shows the clinched badge and a live "Next up" game', () => {
    const games = [
      ...roundRobin(),
      // An unplayed, in-progress game so "Next up" has a live entry.
      { id: 'min-live', seasonType: 'regular', tip: '2026-09-01T00:00:00.000Z', home: 'MIN', away: 'SEA', live: true },
    ]
    open('MIN', games)
    expect(screen.getByText(/clinched/)).toBeInTheDocument()
    expect(screen.getByText('Next up')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows the eliminated badge', () => {
    open('WSH', roundRobin())
    expect(screen.getByText(/eliminated/)).toBeInTheDocument()
  })

  it('closes on a backdrop mousedown but not on an inner one', () => {
    const onClose = vi.fn()
    const { container } = open('MIN', roundRobin(), { onClose })

    // Mousedown inside the dialog must not close it.
    fireEvent.mouseDown(container.querySelector('.modal'))
    expect(onClose).not.toHaveBeenCalled()

    // Mousedown on the backdrop itself closes it.
    fireEvent.mouseDown(container.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })
})
