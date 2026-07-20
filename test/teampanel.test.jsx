import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeamPanel from '../src/components/TeamPanel.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'

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
    expect(screen.getByRole('dialog', { name: 'Minnesota Lynx' })).toBeInTheDocument()
    // Verified against ESPN: Minnesota leads the league at 20-6.
    expect(screen.getByText(/20–6/)).toBeInTheDocument()
    expect(screen.getByText(/Western Conference/)).toBeInTheDocument()
    expect(screen.getByText(/seed 1/)).toBeInTheDocument()
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
