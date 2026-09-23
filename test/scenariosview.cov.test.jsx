import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScenariosView from '../src/components/ScenariosView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'SEA',
  score: [90, 80],
  ...over,
})
const open = (id, away, home, over = {}) =>
  game({ id, away, home, score: null, tip: '2026-09-20T23:00:00.000Z', ...over })

// MIN is 1-0. LV plays MIN, then GS: four ways it can go.
const SMALL = [game({ home: 'MIN', away: 'SEA' }), open('g1', 'LV', 'MIN'), open('g2', 'LV', 'GS')]

const mount = (games, props = {}) => {
  localStorage.setItem('wnba:followed', JSON.stringify(['MIN']))
  return render(
    <FollowProvider>
      <ScenariosView games={games} tz="UTC" {...props} />
    </FollowProvider>
  )
}

const cell = (label) => screen.getByRole('button', { name: new RegExp(`^${label}:`) })

beforeEach(() => localStorage.clear())

describe('ScenariosView — picking games', () => {
  it('enumerates the open games and toggles a pick on and off', async () => {
    mount(SMALL)
    expect(screen.getByText(/0 of 2 picked/)).toBeInTheDocument()
    expect(screen.getByText(/4 outcomes/)).toBeInTheDocument()
    expect(cell('MIN the 1 seed')).toHaveTextContent('50%')
    // Eliminated reads as an ✕ (and a dimmed row), never a checkmark.
    expect(cell('TOR out of the playoffs')).toHaveTextContent('✕')
    expect(cell('TOR out of the playoffs').closest('tr')).toHaveClass('row-elim')
    expect(screen.getAllByTitle('Out of the playoffs in every outcome').length).toBeGreaterThan(0)
    expect(cell('TOR the 1 seed')).toBeDisabled()
    expect(cell('MIN the 1 seed').closest('tr')).toHaveClass('row-followed')
    expect(cell('MIN the 1 seed').closest('tr')).not.toHaveClass('row-elim')
    // MIN finishes top 3 in every outcome: clinched.
    expect(within(cell('MIN the 1 seed').closest('tr')).getByTitle('In the playoffs in every outcome')).toHaveTextContent('✓')
    // LV can still miss out, so no badge either way.
    const lvRow = cell('LV the 1 seed').closest('tr')
    expect(within(lvRow).queryByTitle(/every outcome/)).toBeNull()
    // The playoff line sits after the eighth row.
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows[9]).toHaveClass('cutline')
    expect(rows[9]).toHaveTextContent('Playoff line: top 8 make the postseason')
    expect(screen.getByRole('button', { name: 'TOR, eliminated' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LV' })).toBeInTheDocument()

    const minWins = screen.getByRole('button', { name: 'Minnesota Lynx win' })
    await userEvent.click(minWins)
    expect(minWins).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: 'Las Vegas Aces win' })[0]).toHaveClass('lost')
    expect(screen.getByText(/2 outcomes/)).toBeInTheDocument()
    expect(cell('MIN the 1 seed')).toHaveTextContent('✓')

    await userEvent.click(minWins)
    expect(minWins).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/4 outcomes/)).toBeInTheDocument()
  })

  it('fills every game with the favorite, then clears', async () => {
    mount(SMALL)
    const clear = screen.getByRole('button', { name: 'Clear picks' })
    expect(clear).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Favorites win' }))
    expect(screen.getByText(/2 of 2 picked/)).toBeInTheDocument()
    expect(screen.getByText('Seeding with your picks')).toBeInTheDocument()
    await userEvent.click(clear)
    expect(screen.getByText(/0 of 2 picked/)).toBeInTheDocument()
  })

  it('marks a live game and opens the team panel from the grid', async () => {
    const onPick = vi.fn()
    mount([...SMALL, game({ id: 'lv', home: 'LA', away: 'PHX', score: [40, 38], live: true })], { onPick })
    expect(screen.getByText('Live')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'MIN, clinched' }))
    expect(onPick).toHaveBeenCalledWith('MIN')
  })
})

describe('ScenariosView — what a seed takes', () => {
  it('lists exactly the results behind a cell, and picks one on tap', async () => {
    mount(SMALL)
    await userEvent.click(cell('MIN the 1 seed'))
    expect(cell('MIN the 1 seed')).toHaveAttribute('aria-pressed', 'true')
    // It opens as the row right under MIN's, where the tap was, not below the grid.
    const minRow = cell('MIN the 1 seed').closest('tr')
    expect(minRow.nextElementSibling).toHaveClass('sc-detail-row')
    expect(minRow.nextElementSibling).toHaveTextContent('MIN beats LV')
    expect(screen.getByText(/in/, { selector: '.sc-path-lead' })).toHaveTextContent('2 of 4 outcomes, when')
    // One line: MIN beats LV; g2 can go either way.
    const line = screen.getByRole('button', { name: 'Pick MIN over LV' })
    expect(line).toHaveTextContent('MIN beats LV')
    expect(line).toHaveTextContent('2')
    expect(screen.getByText(/Those are the only results that matter/)).toBeInTheDocument()
    expect(screen.getByText('Tiebreakers that decide it:')).toBeInTheDocument()
    expect(screen.getByText(/overall point differential: in 1 of 2/)).toBeInTheDocument()
    await userEvent.click(line)
    expect(screen.getByText(/1 of 2 picked/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Minnesota Lynx win' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lists each separate way to a seed', async () => {
    mount(SMALL)
    // LV is 2nd after (LV beats MIN, GS beats LV) or (MIN beats LV, LV beats GS).
    await userEvent.click(cell('LV the 2 seed'))
    expect(screen.getByText(/in/, { selector: '.sc-path-lead' })).toHaveTextContent('2 of 4 outcomes, when:')
    expect(screen.getByText(/Each line lists the only results that matter/)).toBeInTheDocument()
    const ways = screen.getAllByRole('button', { name: /^Pick / })
    expect(ways.map((b) => b.getAttribute('aria-label')).sort()).toEqual([
      'Pick LV over MIN, GS over LV',
      'Pick MIN over LV, LV over GS',
    ])
    await userEvent.click(ways[0])
    expect(screen.getByText(/2 of 2 picked/)).toBeInTheDocument()
    expect(screen.getByText('Seeding with your picks')).toBeInTheDocument()
  })

  it('reports a locked seed, deselects, and handles a seed that picks rule out', async () => {
    mount(SMALL)
    await userEvent.click(cell('TOR out of the playoffs'))
    expect(screen.getByText('Locked.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pick / })).toBeNull()
    await userEvent.click(cell('TOR out of the playoffs'))
    expect(screen.queryByText('Locked.')).toBeNull()

    await userEvent.click(cell('LV the 1 seed'))
    await userEvent.click(screen.getByRole('button', { name: 'Minnesota Lynx win' }))
    expect(screen.getByText(/can no longer finish as the 1 seed/)).toBeInTheDocument()
  })

  it('shows a seed reachable only on point differential', async () => {
    // MIN beat SEA by 10 for real; LV/GS is open. Whoever wins it ties MIN at 1-0
    // without having met MIN, so step 4 (overall differential) decides: +10 against
    // a picked margin of 1 to 10. Either order is possible.
    mount([game({ home: 'MIN', away: 'SEA' }), open('g', 'GS', 'LV')])
    expect(cell('MIN the 1 seed')).toHaveTextContent(/^\*$/)
    expect(cell('MIN the 1 seed')).toHaveAccessibleName(/0 of 2 outcomes, 2 more depending on margins/)
    await userEvent.click(cell('MIN the 1 seed'))
    expect(screen.getByText(/only on point differential/)).toBeInTheDocument()
    expect(screen.getByText(/That depends on the final margins/)).toHaveTextContent('1 to 10 points')
    expect(screen.getByText(/overall point differential: in 2 of 2/)).toBeInTheDocument()
  })

  it('separates certain outcomes from margin-dependent ones in the same seed', async () => {
    mount([
      game({ id: 'x0', home: 'MIN', away: 'SEA', score: [85, 80] }),
      game({ id: 'x1', home: 'LV', away: 'GS', score: [83, 80] }),
      open('x2', 'SEA', 'GS'),
      open('x3', 'LV', 'MIN', { tip: '2026-09-21T23:00:00.000Z' }),
    ])
    expect(cell('GS the 3 seed')).toHaveAccessibleName(/1 of 4 outcomes, 1 more depending on margins/)
    expect(cell('GS the 3 seed')).toHaveTextContent('25%*')
    await userEvent.click(cell('GS the 3 seed'))
    expect(screen.getByText(/In 1 more outcomes they could/)).toBeInTheDocument()
    // The listed results are the certain outcome; picking them settles GS at 3.
    await userEvent.click(screen.getAllByRole('button', { name: /^Pick / })[0])
    expect(screen.getByText('Seeding with your picks')).toBeInTheDocument()
    expect(screen.queryByText(/could land anywhere in it/)).toBeNull()
  })

  it('shows a share that rounds to 0% as <1%, and every row sums to 100%', () => {
    // LV must win all eight of its games to pass an 8-1 MIN: 1 of 256 outcomes, which
    // the row's largest-remainder rounding leaves at 0.
    const opps = ['GS', 'LA', 'PHX', 'POR', 'SEA', 'DAL', 'TOR', 'ATL']
    const beaten = ['CHI', 'CON', 'WSH', 'ATL', 'NY', 'IND', 'CHI', 'NY']
    mount([
      ...beaten.map((o, i) => game({ id: `m${i}`, home: 'MIN', away: o })),
      game({ id: 'mL', home: 'MIN', away: 'CON', score: [70, 80] }),
      ...opps.map((o, i) => open(`o${i}`, o, 'LV')),
    ])
    expect(cell('LV the 1 seed')).toHaveTextContent('<1%')
    const lv = within(cell('LV the 1 seed').closest('tr'))
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => /^\d+%$/.test(t))
      .reduce((n, t) => n + parseInt(t, 10), 0)
    expect(lv).toBe(100)
  })

  it('sums up combinations past the first six', async () => {
    const opps = ['GS', 'LA', 'PHX', 'POR', 'SEA', 'DAL', 'TOR', 'ATL']
    const beaten = ['CHI', 'CON', 'WSH', 'ATL', 'NY', 'IND', 'CHI', 'NY']
    mount([
      ...beaten.map((o, i) => game({ id: `m${i}`, home: 'MIN', away: o })),
      game({ id: 'mL', home: 'MIN', away: 'CON', score: [70, 80] }),
      ...opps.map((o, i) => open(`o${i}`, o, 'LV')),
    ])
    // LV's 5th place needs a particular number of wins: many separate ways.
    await userEvent.click(cell('LV the 5 seed'))
    expect(screen.getAllByRole('button', { name: /^Pick / })).toHaveLength(6)
    expect(screen.getByText(/^\+ \d+ more combinations \(\d+ outcomes\)$/)).toBeInTheDocument()
  })
})

describe('ScenariosView — edge states', () => {
  it('asks for more picks when too many games are open', async () => {
    const pairs = [
      ['MIN', 'SEA'], ['LV', 'GS'], ['LA', 'PHX'], ['POR', 'DAL'], ['ATL', 'NY'],
      ['IND', 'CHI'], ['CON', 'WSH'], ['TOR', 'MIN'], ['SEA', 'LV'], ['GS', 'LA'],
      ['PHX', 'POR'], ['DAL', 'ATL'], ['NY', 'IND'], ['CHI', 'CON'],
    ]
    mount(pairs.map(([a, h], i) => open(`t${i}`, a, h)))
    expect(screen.getByText(/14 games are still open/)).toHaveTextContent('Pick 2 more')
    await userEvent.click(screen.getByRole('button', { name: 'Favorites win' }))
    expect(screen.getByText('Seeding with your picks')).toBeInTheDocument()
  })

  it('shows the final seeding, tiebreakers and first round once the season is done', async () => {
    const onPick = vi.fn()
    mount(
      [
        game({ home: 'MIN', away: 'SEA' }),
        game({ home: 'SEA', away: 'MIN', score: [85, 80] }),
        game({ home: 'LV', away: 'GS' }),
      ],
      { onPick }
    )
    expect(screen.getByText(/seeds are final/)).toBeInTheDocument()
    expect(screen.getByText('Final seeding')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Favorites win' })).toBeNull()
    expect(screen.getByText(/head-to-head point differential/)).toBeInTheDocument()
    expect(screen.queryByText(/could land anywhere in it/)).toBeNull()
    expect(screen.getByText('First round:').nextSibling.children).toHaveLength(4)
    await userEvent.click(screen.getAllByRole('button', { name: /Las Vegas/ })[0])
    expect(onPick).toHaveBeenCalledWith('LV')
  })

  it('lists no tiebreakers when every record is distinct', () => {
    // A full round-robin where the earlier team always wins: 15 distinct records.
    const order = ['MIN', 'LV', 'LA', 'GS', 'PHX', 'SEA', 'DAL', 'POR', 'ATL', 'NY', 'IND', 'CHI', 'CON', 'WSH', 'TOR']
    const games = []
    order.forEach((h, i) => order.slice(i + 1).forEach((a) => games.push(game({ id: `${h}${a}`, home: h, away: a }))))
    mount(games)
    expect(screen.getByText('Final seeding')).toBeInTheDocument()
    expect(screen.queryByText('Tiebreakers:')).toBeNull()
  })

  it('flags a fully picked order that hinges on a picked margin', async () => {
    mount([game({ home: 'MIN', away: 'SEA' }), open('g', 'GS', 'LV')])
    await userEvent.click(screen.getByRole('button', { name: 'Las Vegas Aces win' }))
    expect(screen.getByText(/could land anywhere in it/)).toHaveTextContent('1 to 10')
    expect(screen.getAllByText('1–2')).toHaveLength(2)
    expect(screen.getAllByTitle('Depends on the final margins').length).toBeGreaterThan(1)
    expect(screen.getAllByText(/the final margins could change this/).length).toBeGreaterThan(0)
  })
})
