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
    expect(cell('TOR out of the playoffs')).toHaveTextContent('✓')
    expect(cell('TOR the 1 seed')).toBeDisabled()
    expect(cell('MIN the 1 seed').closest('tr')).toHaveClass('row-followed')

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
    await userEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'MIN' }))
    expect(onPick).toHaveBeenCalledWith('MIN')
  })
})

describe('ScenariosView — what a seed takes', () => {
  it('lists the required results and applies them', async () => {
    mount(SMALL)
    await userEvent.click(cell('MIN the 1 seed'))
    expect(cell('MIN the 1 seed')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/in/, { selector: '.sc-path-lead' })).toHaveTextContent('2 of 4')
    expect(screen.getByText('Every one of them needs:')).toBeInTheDocument()
    expect(screen.getByText(/combination of the other results/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pick the required results' }))
    expect(screen.getByText(/1 of 2 picked/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Minnesota Lynx win' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says when no single result is required, and shows an example', async () => {
    mount(SMALL)
    // LV is 2nd after (LV, GS) or (MIN, LV): both games go both ways.
    await userEvent.click(cell('LV the 2 seed'))
    expect(screen.getByText(/No single result is required/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick the required results' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Show one way it happens' }))
    expect(screen.getByText(/2 of 2 picked/)).toBeInTheDocument()
    expect(screen.getByText('Seeding with your picks')).toBeInTheDocument()
  })

  it('reports a locked seed, deselects, and handles a seed that picks rule out', async () => {
    mount(SMALL)
    await userEvent.click(cell('TOR out of the playoffs'))
    expect(screen.getByText('Locked.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show one way it happens' })).toBeNull()
    await userEvent.click(cell('TOR out of the playoffs'))
    expect(screen.queryByText('Locked.')).toBeNull()

    await userEvent.click(cell('LV the 1 seed'))
    await userEvent.click(screen.getByRole('button', { name: 'Minnesota Lynx win' }))
    expect(screen.getByText(/can no longer finish as the 1 seed/)).toBeInTheDocument()
  })

  it('warns when point differential decides the order', async () => {
    // MIN beat SEA for real; LV/GS is open. Whoever wins it ties MIN at 1-0 without
    // having met MIN, so step 4 settles the tie on a hypothetical margin.
    mount([game({ home: 'MIN', away: 'SEA' }), open('g', 'GS', 'LV')])
    await userEvent.click(cell('LV the 2 seed'))
    expect(screen.getByText(/comes down to point differential/)).toBeInTheDocument()
  })

  it('shows a share under 1% as <1%', () => {
    // LV must win all seven of its games to pass a 7-1 MIN: 1 of 128 outcomes.
    const opps = ['GS', 'LA', 'PHX', 'POR', 'SEA', 'DAL', 'TOR']
    const beaten = ['CHI', 'CON', 'WSH', 'ATL', 'NY', 'IND', 'CHI']
    mount([
      ...beaten.map((o, i) => game({ id: `m${i}`, home: 'MIN', away: o })),
      game({ id: 'mL', home: 'MIN', away: 'CON', score: [70, 80] }),
      ...opps.map((o, i) => open(`o${i}`, o, 'LV')),
    ])
    expect(cell('LV the 1 seed')).toHaveTextContent('<1%')
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
    expect(screen.getByText(/14 games are still open/)).toHaveTextContent('Pick 1 more')
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
    expect(screen.queryByText(/real margins could change/)).toBeNull()
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
    expect(screen.getByText(/real margins could change this order/)).toBeInTheDocument()
  })
})
