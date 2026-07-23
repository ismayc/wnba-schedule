import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeekView from '../src/components/WeekView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { todayKey } from '../src/utils/time.js'

const TZ = 'America/New_York'
const today = todayKey(TZ)
// Mid-afternoon-UTC tips land on the same calendar day in Eastern time, so these
// games appear in the current (default) week.
const at = (h) => `${today}T${String(h).padStart(2, '0')}:00:00.000Z`

beforeEach(() => {
  localStorage.clear()
})

describe('WeekView — All-Star, followed, live, and singular-count paths', () => {
  it('renders the All-Star card both scored (no names) and unscored (named), and opens it', async () => {
    const onOpen = vi.fn()
    const scored = { id: 'as-s', tip: at(18), seasonType: 'allstar', home: 'COOP', away: 'SPO', score: [150, 140] }
    const named = {
      id: 'as-n',
      tip: at(20),
      seasonType: 'allstar',
      home: 'COOP',
      away: 'SPO',
      homeName: 'Team Coop',
      awayName: 'Team Spoon',
    }
    const { container } = render(<WeekView games={[scored, named]} tz={TZ} onOpen={onOpen} />)

    // Named side falls through to the name; unnamed side falls back to the raw abbr.
    expect(screen.getByText('Team Spoon · Team Coop')).toBeInTheDocument()
    expect(screen.getByText('SPO · COOP')).toBeInTheDocument()
    // The finished All-Star game shows its points, away-first.
    expect(screen.getByText('140 – 150')).toBeInTheDocument()

    await userEvent.click(container.querySelector('.wk-allstar'))
    expect(onOpen).toHaveBeenCalled()
  })

  it('marks a followed team’s live game', () => {
    localStorage.setItem('wnba:followed', JSON.stringify(['MIN']))
    const live = { id: 'g-live', tip: at(19), seasonType: 'regular', home: 'MIN', away: 'SEA', live: true }
    const { container } = render(
      <FollowProvider>
        <WeekView games={[live]} tz={TZ} />
      </FollowProvider>
    )
    const card = container.querySelector('.wk-game')
    expect(card.classList.contains('is-mine')).toBe(true)
    expect(card.classList.contains('is-live')).toBe(true)
  })

  it('uses the singular "game" when the week holds exactly one', () => {
    const only = { id: 'g-one', tip: at(18), seasonType: 'regular', home: 'MIN', away: 'SEA' }
    const { container } = render(<WeekView games={[only]} tz={TZ} />)
    const sub = container.querySelector('.sub').textContent
    expect(sub).toMatch(/\b1 game\b/)
    expect(sub).not.toMatch(/1 games/)
  })
})
