import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StandingsView from '../src/components/StandingsView.jsx'
import ScheduleView from '../src/components/ScheduleView.jsx'
import StatsView from '../src/components/StatsView.jsx'
import GameCard from '../src/components/GameCard.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'
import { dayKey, todayKey } from '../src/utils/time.js'

const TZ = 'America/New_York'

beforeEach(() => {
  // jsdom has no layout, so scrollIntoView is absent.
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
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

  it('labels games on the viewer’s chosen services and skips ones that are not', () => {
    // Viewer has YouTube TV and Peacock.
    localStorage.setItem('wnba:services', JSON.stringify(['youtubetv', 'peacock']))
    const withServices = (game) => (
      <ServicesProvider>
        <GameCard game={game} tz={TZ} />
      </ServicesProvider>
    )

    // NBC + Peacock simulcast is watchable both ways — labels in catalog order.
    const { container, rerender } = render(withServices({ ...base, broadcast: ['NBC', 'Peacock'] }))
    const watch = container.querySelector('.watch')
    expect(watch).toHaveAccessibleName('Watch on Peacock, YouTube TV')
    expect([...watch.querySelectorAll('.watch-chip')].map((c) => c.textContent)).toEqual([
      'Peacock',
      'YouTube TV',
    ])
    // "Peacock" shows only as the badge, not repeated as a raw network; NBC (the bundle's
    // underlying network) still shows in the meta line.
    expect(container.querySelector('.game-meta').textContent).toContain('NBC')
    expect(screen.getAllByText('Peacock')).toHaveLength(1)

    // A game only on services the viewer lacks carries no badge.
    rerender(withServices({ ...base, broadcast: ['WNBA League Pass'] }))
    expect(container.querySelector('.watch')).toBeNull()
  })

  it('shows no service badge until the viewer picks services', () => {
    // No provider / empty selection → the raw broadcast still renders, but no badge.
    const { container } = render(<GameCard game={{ ...base, broadcast: ['NBC', 'Peacock'] }} tz={TZ} />)
    expect(container.querySelector('.watch')).toBeNull()
  })

  it('renders the All-Star game as a distinct event card, no franchise sides', () => {
    const allStar = {
      id: 'as1',
      tip: '2026-07-26T00:30:00.000Z',
      seasonType: 'allstar',
      home: 'COOP',
      away: 'SPO',
      homeName: 'Team Coop',
      awayName: 'Team Spoon',
      venue: 'United Center',
      city: 'Chicago',
      broadcast: ['ABC', 'Disney+'],
      note: 'AT&T WNBA All-Star Game',
    }
    const { container } = render(<GameCard game={allStar} tz={TZ} />)
    expect(container.querySelector('.game.allstar')).toBeInTheDocument()
    expect(screen.getByText('Team Spoon')).toBeInTheDocument()
    expect(screen.getByText('Team Coop')).toBeInTheDocument()
    expect(screen.getByText(/All-Star Game/)).toBeInTheDocument()
    // The drafted sides aren't franchises — no logo'd .side, no follow star.
    expect(container.querySelector('.side')).toBeNull()
  })
})

describe('StatsView leaders', () => {
  it('forces one decimal on per-game averages so the column stays aligned', () => {
    const { container } = render(<StatsView games={GAMES} tz={TZ} />)
    // Default category is Points (PPG): every value reads like "21.0", never bare "21".
    const vals = [...container.querySelectorAll('.lead-value')].map((n) => n.textContent)
    expect(vals.length).toBeGreaterThan(0)
    for (const v of vals) expect(v).toMatch(/^\d+\.\d$/)
  })

  it('opens the player pop-out with the full stat row when a name is clicked', async () => {
    const onPickPlayer = vi.fn()
    const { container } = render(<StatsView games={GAMES} tz={TZ} onPickPlayer={onPickPlayer} />)
    await userEvent.click(container.querySelector('.lead-player'))
    expect(onPickPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.any(String), avgPoints: expect.any(Number) })
    )
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
  describe('recent window and full season', () => {
    // Synthetic games placed RELATIVE to the real "today" (not the committed schedule),
    // so the window math is deterministic whatever day the suite runs — no wall-clock
    // flake, and no dependence on where the committed season sits.
    const today = todayKey(TZ)
    const shift = (key, delta) => {
      const [y, m, d] = key.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
    }
    const g = (id, date, home, away, score) => ({
      id,
      tip: `${date}T16:00:00.000Z`, // noon ET — safely the same calendar day in TZ
      seasonType: 'regular',
      home,
      away,
      ...(score ? { score } : {}),
    })
    const dOld = shift(today, -14) // older than a week -> hidden by default
    const dRecent = shift(today, -3) // within the last week -> shown by default
    const dFuture = shift(today, 5)
    const games = [
      g('old', dOld, 'MIN', 'NY', [80, 70]),
      g('recent', dRecent, 'LV', 'SEA', [88, 84]),
      g('today', today, 'CHI', 'ATL', [70, 66]),
      g('future', dFuture, 'PHX', 'LA'),
    ]
    const keysOf = (c) =>
      [...c.querySelectorAll('.day')].map((d) => d.querySelector('.day-head span').textContent)

    it('defaults to the last week of results plus upcoming, hiding older days', () => {
      const { container } = render(<ScheduleView games={games} tz={TZ} />)
      // recent (−3), today, future (+5) show; the 14-days-ago game does not.
      expect(container.querySelectorAll('.day')).toHaveLength(3)
      expect(keysOf(container)).toContain('Today')
      // The recent view is a plain list — no month machinery.
      expect(container.querySelector('.month-jump')).toBeFalsy()
    })

    it('lands scrolled on the most recent past day (so yesterday is right there)', () => {
      const spy = Element.prototype.scrollIntoView
      render(<ScheduleView games={games} tz={TZ} />)
      expect(spy).toHaveBeenCalled()
    })

    it('anchors on today when nothing is in the past', () => {
      const spy = Element.prototype.scrollIntoView
      render(
        <ScheduleView games={[g('today', today, 'CHI', 'ATL', [70, 66]), g('future', dFuture, 'PHX', 'LA')]} tz={TZ} />
      )
      expect(spy).toHaveBeenCalled()
    })

    it('does not scroll when no rendered day matches the anchor', () => {
      const spy = Element.prototype.scrollIntoView
      // Only a future day: anchor falls back to today, which has no rendered day.
      render(<ScheduleView games={[g('future', dFuture, 'PHX', 'LA')]} tz={TZ} />)
      expect(spy).not.toHaveBeenCalled()
    })

    it('shows an empty state when no games match', () => {
      const { container } = render(<ScheduleView games={[]} tz={TZ} />)
      expect(container.querySelector('.empty')).toBeTruthy()
    })
  })

  describe('full season — collapsible months + jump bar', () => {
    const today = todayKey(TZ)
    const [Y, M, D] = today.split('-').map(Number)
    // Days pinned to specific months relative to the current one, so month grouping is
    // deterministic. inMonth(0, …) stays in the current month; ±1/±2 land in siblings.
    const inMonth = (offset, day = 15) =>
      new Date(Date.UTC(Y, M - 1 + offset, day)).toISOString().slice(0, 10)
    const g = (id, date, home, away, score) => ({
      id,
      tip: `${date}T16:00:00.000Z`,
      seasonType: 'regular',
      home,
      away,
      ...(score ? { score } : {}),
    })
    const otherDay = D === 25 ? 5 : 25 // a second current-month day, guaranteed ≠ today
    const games = [
      g('m2', inMonth(-2), 'MIN', 'NY', [80, 70]),
      g('m1', inMonth(-1), 'LV', 'SEA', [88, 84]),
      g('today', today, 'CHI', 'ATL', [70, 66]),
      g('cur2', inMonth(0, otherDay), 'PHX', 'LA', [90, 88]),
      g('n1', inMonth(1), 'DAL', 'IND'),
    ]
    const view = () => render(<ScheduleView games={games} tz={TZ} showPast />)

    it('renders a jump chip per month and opens only the current month', () => {
      const { container } = view()
      // Four distinct months -> four chips and four sections.
      expect(container.querySelectorAll('.month-jump .month-chip')).toHaveLength(4)
      expect(container.querySelectorAll('.month')).toHaveLength(4)
      // Only the current month is open, so only its two days render.
      expect(container.querySelectorAll('.month-days')).toHaveLength(1)
      expect(container.querySelectorAll('.day')).toHaveLength(2)
      // The current month's chip is flagged, and its header count is pluralized.
      expect(container.querySelector('.month-chip.is-current')).toBeTruthy()
      expect(container.querySelector('.month-head.open .month-count').textContent).toBe('2 games')
    })

    it('expands a collapsed month on click, then collapses the current one', () => {
      const { container } = view()
      const collapsed = [...container.querySelectorAll('.month-head')].find(
        (h) => !h.classList.contains('open')
      )
      fireEvent.click(collapsed)
      expect(container.querySelectorAll('.month-days')).toHaveLength(2)
      expect(collapsed.querySelector('.month-count').textContent).toBe('1 game') // singular
      // Collapsing the current month hides its days again.
      fireEvent.click(container.querySelector('.month-head.open'))
      expect(container.querySelectorAll('.month-days')).toHaveLength(1)
    })

    it('jumping to a month expands it and scrolls it into view', () => {
      const spy = Element.prototype.scrollIntoView
      const { container } = view()
      const openedBefore = container.querySelectorAll('.month-days').length
      const calledBefore = spy.mock.calls.length
      // The first chip is the earliest month, which starts collapsed.
      fireEvent.click(container.querySelector('.month-jump .month-chip'))
      expect(container.querySelectorAll('.month-days').length).toBeGreaterThan(openedBefore)
      expect(spy.mock.calls.length).toBeGreaterThan(calledBefore)
    })
  })
})
