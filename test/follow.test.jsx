import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameCard from '../src/components/GameCard.jsx'
import Bracket from '../src/components/Bracket.jsx'
import RadialBracket from '../src/components/RadialBracket.jsx'
import StandingsView from '../src/components/StandingsView.jsx'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'
const game = {
  id: '1',
  tip: '2026-07-20T23:00:00.000Z',
  seasonType: 'regular',
  home: 'MIN',
  away: 'SEA',
}

const wrap = (ui) => render(<FollowProvider>{ui}</FollowProvider>)

beforeEach(() => {
  localStorage.clear()
})

describe('following from a game card', () => {
  it('offers a star for each team', () => {
    wrap(<GameCard game={game} tz={TZ} />)
    expect(screen.getByLabelText('Follow Minnesota Lynx')).toBeInTheDocument()
    expect(screen.getByLabelText('Follow Seattle Storm')).toBeInTheDocument()
  })

  it('toggles on click and reflects it in the label', async () => {
    wrap(<GameCard game={game} tz={TZ} />)
    await userEvent.click(screen.getByLabelText('Follow Minnesota Lynx'))
    const btn = screen.getByLabelText('Unfollow Minnesota Lynx')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveTextContent('★')
  })

  // The whole card is a button that opens the game detail. Following a team from it
  // must not also open that modal.
  it('does not trigger the card while starring', async () => {
    const onOpen = vi.fn()
    wrap(<GameCard game={game} tz={TZ} onOpen={onOpen} />)
    await userEvent.click(screen.getByLabelText('Follow Minnesota Lynx'))
    expect(onOpen).not.toHaveBeenCalled()

    // …but the card itself still opens normally.
    await userEvent.click(screen.getByText('Lynx'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('highlights the followed side', async () => {
    const { container } = wrap(<GameCard game={game} tz={TZ} />)
    expect(container.querySelector('.side.followed')).toBeNull()
    await userEvent.click(screen.getByLabelText('Follow Minnesota Lynx'))
    expect(container.querySelector('.side.followed')).toBeTruthy()
  })

  it('persists across a remount', async () => {
    const { unmount } = wrap(<GameCard game={game} tz={TZ} />)
    await userEvent.click(screen.getByLabelText('Follow Minnesota Lynx'))
    unmount()

    wrap(<GameCard game={game} tz={TZ} />)
    expect(screen.getByLabelText('Unfollow Minnesota Lynx')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

describe('following is shared across views', () => {
  // A star set anywhere must show everywhere — the context is the single source.
  function Harness() {
    const { toggle } = useFollow()
    return (
      <>
        <button onClick={() => toggle('MIN')}>seed</button>
        <GameCard game={game} tz={TZ} />
        <Bracket games={GAMES} tz={TZ} />
        <RadialBracket games={GAMES} />
      </>
    )
  }

  it('propagates to the schedule, bracket, and radial at once', async () => {
    const { container } = wrap(<Harness />)
    expect(container.querySelectorAll('.followed')).toHaveLength(0)

    await userEvent.click(screen.getByText('seed'))

    expect(container.querySelector('.side.followed')).toBeTruthy()
    expect(container.querySelector('.bx-side.followed')).toBeTruthy()
    expect(container.querySelector('.rb-node.followed')).toBeTruthy()
  })
})

describe('following from the standings', () => {
  it('stars a team and marks the row', async () => {
    const { container } = wrap(<StandingsView games={GAMES} />)
    const star = screen.getByLabelText('Follow Minnesota Lynx')
    await userEvent.click(star)
    expect(container.querySelector('tr.row-followed')).toBeTruthy()
  })
})

describe('the follow store', () => {
  function Probe() {
    const { followed, count, toggle, clear, isFollowed } = useFollow()
    return (
      <div>
        <span data-testid="count">{count}</span>
        <span data-testid="list">{[...followed].sort().join(',')}</span>
        <span data-testid="has-min">{String(isFollowed('MIN'))}</span>
        <button onClick={() => toggle('MIN')}>min</button>
        <button onClick={() => toggle('SEA')}>sea</button>
        <button onClick={clear}>clear</button>
      </div>
    )
  }

  it('adds, removes, counts, and clears', async () => {
    wrap(<Probe />)
    const count = () => screen.getByTestId('count').textContent

    await userEvent.click(screen.getByText('min'))
    await userEvent.click(screen.getByText('sea'))
    expect(count()).toBe('2')
    expect(screen.getByTestId('list').textContent).toBe('MIN,SEA')

    await userEvent.click(screen.getByText('min')) // toggles back off
    expect(count()).toBe('1')
    expect(screen.getByTestId('has-min').textContent).toBe('false')

    await userEvent.click(screen.getByText('clear'))
    expect(count()).toBe('0')
  })

  it('survives corrupt localStorage rather than crashing', () => {
    localStorage.setItem('wnba:followed', 'not json')
    wrap(<Probe />)
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('renders standalone without a provider', () => {
    // The inert fallback keeps components usable in isolation and in tests.
    render(<GameCard game={game} tz={TZ} />)
    expect(screen.getByLabelText('Follow Minnesota Lynx')).toBeInTheDocument()
  })
})
