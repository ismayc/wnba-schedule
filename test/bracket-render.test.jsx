import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import RadialBracket from '../src/components/RadialBracket.jsx'
import { PLAYOFFS_2025 } from './fixtures/playoffs-2025.js'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

// The 2026 postseason doesn't exist yet, so the finished-bracket path can only be
// exercised through the 2025 fixture.
// The dots are the bracket's only per-game handle, so they have to reach the box score.
describe('the series dots', () => {
  it('opens the right game, and labels each dot with it', async () => {
    const onOpen = vi.fn()
    const { container } = render(<Bracket games={PLAYOFFS_2025} tz={TZ} onOpen={onOpen} />)

    const dots = container.querySelectorAll('.dots .dot')
    expect(dots.length).toBeGreaterThan(0)
    expect(dots[0]).toHaveAccessibleName(/Game 1: .+ \d+, .+ \d+/)

    await userEvent.click(dots[1])
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ seasonType: 'playoffs', game: 2 })
    )
  })

  it('numbers a dot by its position when the feed gave the game no number', () => {
    // ESPN's series headline is prose ("WNBA Semifinals - Game 1"); a season where it
    // doesn't parse must still label the dot rather than say "Game undefined".
    const unnumbered = PLAYOFFS_2025.map((g) => ({ ...g, game: undefined }))
    const { container } = render(<Bracket games={unnumbered} tz={TZ} />)
    expect(container.querySelector('.dots .dot')).toHaveAccessibleName(/^Game 1: /)
  })

  it('leaves an unplayed dot inert and survives a click with no handler', async () => {
    const { container } = render(<Bracket games={PLAYOFFS_2025} tz={TZ} />)
    // A sweep leaves hollow dots, and they are not buttons.
    expect(container.querySelectorAll('.dot-empty button')).toHaveLength(0)
    await userEvent.click(container.querySelector('.dots .dot'))
    expect(container.querySelector('.dots .dot')).toBeInTheDocument()
  })
})

describe('Bracket with a completed postseason', () => {
  it('announces the champion', () => {
    render(<Bracket games={PLAYOFFS_2025} tz={TZ} />)
    expect(screen.getByText(/win the title/i)).toBeInTheDocument()
    expect(screen.getByText('Las Vegas Aces')).toBeInTheDocument()
  })

  it('shows series win counts, not game scores', () => {
    const { container } = render(<Bracket games={PLAYOFFS_2025} tz={TZ} />)
    const finals = container.querySelector('.bx-col-final .bx-series')
    const wins = [...finals.querySelectorAll('.bx-wins')].map((n) => n.textContent)
    expect(wins).toEqual(['4', '0'])
  })

  it('labels each round with its series length', () => {
    render(<Bracket games={PLAYOFFS_2025} tz={TZ} />)
    expect(screen.getAllByText('Best of 3')).toHaveLength(4)
    expect(screen.getAllByText('Best of 5')).toHaveLength(2)
    expect(screen.getAllByText('Best of 7')).toHaveLength(1)
  })

  it('marks the series winner and dims the loser', () => {
    const { container } = render(<Bracket games={PLAYOFFS_2025} tz={TZ} />)
    const finals = container.querySelector('.bx-col-final .bx-series')
    expect(within(finals.querySelector('.bx-won')).getByText('Aces')).toBeInTheDocument()
    expect(finals.querySelector('.bx-lost')).toBeTruthy()
  })

  it('does not show the projected banner', () => {
    render(<Bracket games={PLAYOFFS_2025} tz={TZ} />)
    expect(screen.queryByText(/Projected/)).not.toBeInTheDocument()
  })
})

describe('Bracket before the postseason', () => {
  it('flags the bracket as projected and lists the current field', () => {
    render(<Bracket games={GAMES} tz={TZ} />)
    expect(screen.getByText(/Projected\./)).toBeInTheDocument()
    expect(screen.getByText(/field, as it stands/i)).toBeInTheDocument()
  })

  it('labels unresolved slots with their feeders', () => {
    render(<Bracket games={GAMES} tz={TZ} />)
    expect(screen.getByText('Winner 1/8')).toBeInTheDocument()
    expect(screen.getByText('Winner 4/5')).toBeInTheDocument()
    expect(screen.getAllByText('Semifinal winner')).toHaveLength(2)
  })

  it('seeds the top team against the eighth', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    const first = container.querySelector('.bx-series')
    const seeds = [...first.querySelectorAll('.bx-seed')].map((n) => n.textContent)
    expect(seeds).toEqual(['1', '8'])
  })

  it('routes a team click back to the schedule', async () => {
    const onPick = vi.fn()
    const { container } = render(<Bracket games={GAMES} tz={TZ} onPick={onPick} />)
    await userEvent.click(container.querySelector('.bx-team'))
    expect(onPick).toHaveBeenCalled()
  })
})

describe('RadialBracket', () => {
  it('renders a node per seed plus the inner rounds', () => {
    const { container } = render(<RadialBracket games={GAMES} />)
    expect(container.querySelectorAll('.rb-leaf')).toHaveLength(8)
    expect(container.querySelectorAll('.rb-r1')).toHaveLength(4)
    expect(container.querySelectorAll('.rb-sf')).toHaveLength(2)
  })

  it('shows the trophy while undecided and the champion once settled', () => {
    const { container: pending } = render(<RadialBracket games={GAMES} />)
    expect(pending.querySelector('.rb-trophy')).toBeTruthy()

    const { container: done } = render(<RadialBracket games={PLAYOFFS_2025} />)
    expect(done.querySelector('.rb-trophy')).toBeFalsy()
    expect(within(done.querySelector('.rb-center')).getByText('Aces')).toBeInTheDocument()
  })

  it('labels seeds around the outer ring', () => {
    const { container } = render(<RadialBracket games={GAMES} />)
    const seeds = [...container.querySelectorAll('.rb-seed')].map((n) => n.textContent)
    expect(seeds.sort((a, b) => a - b)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })
})
