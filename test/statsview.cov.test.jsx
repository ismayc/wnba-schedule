import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatsView from '../src/components/StatsView.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

// A completed round-robin among all 15 teams, stronger index beating weaker, so every
// team ends with a distinct win total and zero games remaining — which forces some
// teams into "clinched" and others into "eliminated" in the playoff race.
const TEAMS15 = ['ATL', 'CHI', 'CON', 'IND', 'NY', 'TOR', 'WSH', 'DAL', 'GS', 'LA', 'LV', 'MIN', 'PHX', 'POR', 'SEA']
const finishedSeason = () => {
  const games = []
  let n = 0
  for (let i = 0; i < TEAMS15.length; i++) {
    for (let j = i + 1; j < TEAMS15.length; j++) {
      games.push({
        id: `s${n++}`,
        seasonType: 'regular',
        tip: '2026-05-10T00:00:00.000Z',
        home: TEAMS15[i],
        away: TEAMS15[j],
        score: [80, 70],
        line: { home: [20, 20, 20, 20], away: [18, 17, 18, 17] },
      })
    }
  }
  return games
}

// A season barely underway: a handful of results, the rest of the round-robin still to
// play, so nobody has clinched or been eliminated and every row is "In the field" or
// "Chasing". Kept synthetic on purpose — the committed schedule decides its own race as
// the real season runs down, and once every team was clinched or eliminated those two
// arms of the status stopped being exercised (refresh-data run 32955701284).
const undecidedSeason = () => {
  // One result each for seven pairs of teams — spread deliberately, since letting a
  // single team bank all of its games would clinch it a spot on day one.
  const played = new Set(
    Array.from({ length: 7 }, (_, k) => `${TEAMS15[k * 2]}|${TEAMS15[k * 2 + 1]}`)
  )
  return finishedSeason().map((g) =>
    played.has(`${g.home}|${g.away}`)
      ? g
      : { ...g, tip: '2026-09-20T00:00:00.000Z', score: undefined, line: undefined }
  )
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

describe('StatsView coverage', () => {
  it('expands the overtime and one-possession tiles into game lists', async () => {
    const { container } = render(<StatsView games={GAMES} tz={TZ} />)
    const tileButtons = container.querySelectorAll('.tile-btn')
    expect(tileButtons.length).toBe(2)

    // Overtime tile → a drill-down list annotated with OT counts.
    await userEvent.click(tileButtons[0])
    let drill = container.querySelector('.drill')
    expect(drill).toBeInTheDocument()
    expect(container.querySelector('.tile-btn.open')).toBeInTheDocument()
    expect(container.querySelector('.tile-caret').textContent).toBe('▾')
    expect(within(drill).getAllByText(/OT/).length).toBeGreaterThan(0)

    // One-possession tile → margins.
    await userEvent.click(container.querySelectorAll('.tile-btn')[1])
    drill = container.querySelector('.drill')
    expect(within(drill).getAllByText(/^by \d+$/).length).toBeGreaterThan(0)

    // Clicking the open tile again collapses it (toggle back to null).
    await userEvent.click(container.querySelectorAll('.tile-btn')[1])
    expect(container.querySelector('.drill')).toBeNull()
  })

  it('switches the leaders category to a percentage and a count', async () => {
    const { container } = render(<StatsView games={GAMES} tz={TZ} />)

    await userEvent.click(screen.getByRole('button', { name: 'FG%' }))
    expect(screen.getByText(/League leaders — Field goal %/)).toBeInTheDocument()
    // Percentage categories carry a trailing %.
    expect(container.querySelector('.lead-value').textContent).toMatch(/%$/)

    await userEvent.click(screen.getByRole('button', { name: 'DD' }))
    expect(screen.getByText(/League leaders — Double-doubles/)).toBeInTheDocument()
    // Double-double counts are whole numbers — no decimal, no percent.
    expect(container.querySelector('.lead-value').textContent).toMatch(/^\d+$/)
  })

  it('routes team and player picks from every panel', async () => {
    const onPickTeam = vi.fn()
    const onPickPlayer = vi.fn()
    const { container } = render(
      <StatsView games={GAMES} tz={TZ} onPickTeam={onPickTeam} onPickPlayer={onPickPlayer} />
    )

    await userEvent.click(container.querySelector('.lead-team button'))
    expect(onPickTeam).toHaveBeenCalled()

    await userEvent.click(container.querySelector('.lead-player'))
    expect(onPickPlayer).toHaveBeenCalled()

    await userEvent.click(container.querySelector('.margin-team'))
    await userEvent.click(container.querySelector('.race .team-btn'))
    expect(onPickTeam.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('splits an undecided race into the field and the chasers', () => {
    const { container } = render(<StatsView games={undecidedSeason()} tz={TZ} />)
    const race = within(container.querySelector('.race'))
    expect(race.getAllByText('In the field')).toHaveLength(8)
    expect(race.getAllByText('Chasing').length).toBeGreaterThan(0)
    // Nothing is settled this early, so neither decided status shows up.
    expect(race.queryByText('Clinched')).toBeNull()
    expect(race.queryByText('Eliminated')).toBeNull()
  })

  it('marks clinched and eliminated teams once the season is decided', () => {
    const { container } = render(<StatsView games={finishedSeason()} tz={TZ} />)
    const race = within(container.querySelector('.race'))
    expect(race.getAllByText('Clinched').length).toBeGreaterThan(0)
    expect(race.getAllByText('Eliminated').length).toBeGreaterThan(0)
    // Eliminated rows get the dimming class.
    expect(container.querySelector('.race tr.row-elim')).toBeInTheDocument()
  })
})
