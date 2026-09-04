import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeamPanel from '../src/components/TeamPanel.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
// This file needs a season IN PROGRESS: "Next up" is the list of a team's UNPLAYED
// games, which the live schedule stops having on September 25, when the last
// regular-season game is done. See test/fixtures/season-2026.js. The live board keeps
// its own gate in schedule.test.js.
import { GAMES_2026 as GAMES } from './fixtures/season-2026.js'
import { seedings } from '../src/utils/standings.js'
import { HISTORY } from '../src/data/history.js'
import { playersByTeam } from '../src/utils/stats.js'

const TZ = 'America/New_York'
const open = (abbr = 'MIN', props = {}) =>
  render(
    <FollowProvider>
      <TeamPanel abbr={abbr} games={GAMES} tz={TZ} onClose={() => {}} {...props} />
    </FollowProvider>
  )

describe('TeamPanel', () => {
  it('renders nothing without a team', () => {
    const { container } = render(<TeamPanel abbr={null} games={GAMES} tz={TZ} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the team, record, conference, and seed', () => {
    open('MIN')
    // Derive the record and seed from the committed data so the nightly refresh doesn't
    // break this on MIN's next game (an en-dash separates W and L).
    const min = seedings(GAMES).find((r) => r.abbr === 'MIN')
    expect(screen.getByRole('dialog', { name: 'Minnesota Lynx' })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${min.w}–${min.l}`))).toBeInTheDocument()
    expect(screen.getByText(/Western Conference/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`seed ${min.seed}`))).toBeInTheDocument()
  })

  it('shows the six headline splits', () => {
    const { container } = open('MIN')
    const labels = [...container.querySelectorAll('.tp-stat-l')].map((n) => n.textContent)
    expect(labels).toEqual(['Scored', 'Allowed', 'Net', 'Home', 'Road', 'Left'])
  })

  it('signs the net rating', () => {
    const { container } = open('MIN')
    const net = container.querySelectorAll('.tp-stat-v')[2].textContent
    expect(net.startsWith('+')).toBe(true)
  })

  it('shows at most ten form chips, each won or lost', () => {
    const { container } = open('MIN')
    const chips = [...container.querySelectorAll('.tp-chip')]
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.length).toBeLessThanOrEqual(10)
    for (const c of chips) expect(['W', 'L']).toContain(c.textContent)
  })

  it('hides form in spoiler-free mode', () => {
    const { container } = open('MIN', { hideScores: true })
    expect(container.querySelectorAll('.tp-chip')).toHaveLength(0)
  })

  it('lists leading scorers in descending order', () => {
    const { container } = open('LV')
    const lines = [...container.querySelectorAll('.tp-p-line')].map((n) =>
      Number(n.textContent.split(' ')[0])
    )
    expect(lines.length).toBeGreaterThan(0)
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i - 1]).toBeGreaterThanOrEqual(lines[i])
    }
  })

  it('lists only unplayed games under Next up', () => {
    open('MIN')
    const list = screen.getByText('Next up').nextElementSibling
    const rows = list.querySelectorAll('li')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(5)
  })

  it('marks each upcoming game as home or away', () => {
    open('MIN')
    const list = screen.getByText('Next up').nextElementSibling
    for (const li of list.querySelectorAll('li')) {
      expect(['vs', 'at']).toContain(within(li).getByText(/^(vs|at)$/).textContent)
    }
  })

  it('toggles following', async () => {
    open('MIN')
    const btn = screen.getByRole('button', { name: /Follow/ })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(btn)
    expect(screen.getByRole('button', { name: /Following/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('routes to the full schedule and closes', async () => {
    const onSchedule = vi.fn()
    const onClose = vi.fn()
    open('MIN', { onSchedule, onClose })
    await userEvent.click(screen.getByRole('button', { name: /Full schedule/ }))
    expect(onSchedule).toHaveBeenCalledWith('MIN')
    expect(onClose).toHaveBeenCalled()
  })

  it('opens a game from the form strip', async () => {
    const onOpenGame = vi.fn()
    const { container } = open('MIN', { onOpenGame })
    await userEvent.click(container.querySelector('.tp-chip'))
    expect(onOpenGame).toHaveBeenCalled()
    expect(onOpenGame.mock.calls[0][0]).toBeTruthy()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    open('MIN', { onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('works for every team in the league', () => {
    for (const abbr of ['ATL', 'CHI', 'CON', 'DAL', 'GS', 'IND', 'LA', 'LV', 'MIN', 'NY', 'PHX', 'POR', 'SEA', 'TOR', 'WSH']) {
      const { unmount } = open(abbr)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      unmount()
    }
  })
})

describe('TeamPanel opened from an archived season', () => {
  // Regression: the panel was rendered once at App level off the live board, so
  // clicking a team in the History view described the CURRENT season — the wrong
  // record, the wrong seed, and a roster of players who were not on that team
  // that year. Given a season it must describe that season instead.
  const archived = HISTORY[0]
  const rows = Array.isArray(archived.standings)
    ? archived.standings
    : Object.values(archived.standings).flat()
  const target = rows[0]

  const openArchived = () =>
    render(
      <FollowProvider>
        <TeamPanel abbr={target.abbr} season={archived} games={GAMES} tz={TZ} onClose={() => {}} />
      </FollowProvider>,
    )

  it('shows that season’s record and seed, not the live one', () => {
    const { container } = openArchived()
    const sub = container.querySelector('.tp-sub')
    expect(sub).toHaveTextContent(`${target.w}–${target.l}`)
    expect(sub).toHaveTextContent(`seed ${target.seed}`)

    // Prove it differs from what the live board would have said.
    const { container: live } = render(
      <FollowProvider>
        <TeamPanel abbr={target.abbr} games={GAMES} tz={TZ} onClose={() => {}} />
      </FollowProvider>,
    )
    expect(live.querySelector('.tp-sub').textContent).not.toBe(sub.textContent)
  })

  it('scores that season’s per-game figures from its committed totals', () => {
    const { container } = openArchived()
    const tiles = [...container.querySelectorAll('.tp-stat')].map((n) => n.textContent).join(' ')
    const gp = target.w + target.l
    expect(tiles).toContain((target.pf / gp).toFixed(1))
    expect(tiles).toContain((target.pa / gp).toFixed(1))
  })

  it('lists that season’s players, not this season’s', () => {
    const { container } = openArchived()
    const names = [...container.querySelectorAll('.tp-p-name')].map((n) => n.firstChild.textContent)
    const archivedNames = Object.values(archived.players)
      .filter((p) => p.team === target.abbr)
      .map((p) => p.name)
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) expect(archivedNames).toContain(n)
    expect(names).not.toEqual(playersByTeam(target.abbr).slice(0, 6).map((p) => p.name))
  })

  it('omits the last-10 form, which the archive does not commit', () => {
    openArchived()
    expect(screen.queryByText('Last 10')).not.toBeInTheDocument()
  })
})
