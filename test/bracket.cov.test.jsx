import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import RadialBracket from '../src/components/RadialBracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { PLAYOFFS_2025 } from './fixtures/playoffs-2025.js'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

beforeEach(() => {
  localStorage.clear()
})

// A real, mid-postseason feed derived from the finished 2025 bracket:
//  - GS (a first-round loser) is renamed to a non-existent team so its side has no
//    logo AND no feeder label — the "TBD" empty-slot path.
//  - the Finals' game 4 is switched to in-progress, so the Finals series is live and
//    still has a next game to play.
const LIVE_FEED = PLAYOFFS_2025.map((g) => {
  let ng = { ...g }
  if (ng.home === 'GS') ng.home = 'ZZ'
  if (ng.away === 'GS') ng.away = 'ZZ'
  if (ng.id === '401820329') ng = { ...ng, score: undefined, live: true }
  return ng
})

describe('Bracket — live and empty-slot paths', () => {
  it('renders a bare TBD slot and marks a followed team', () => {
    localStorage.setItem('wnba:followed', JSON.stringify(['LV']))
    const { container } = render(
      <FollowProvider>
        <Bracket games={LIVE_FEED} tz={TZ} />
      </FollowProvider>
    )
    // The renamed 'ZZ' side resolves to no team and, on the semis-recovery code path,
    // carries no feeder label — so it falls back to "TBD".
    expect(screen.getAllByText('TBD').length).toBeGreaterThan(0)
    // A followed franchise's side is highlighted.
    expect(container.querySelector('.bx-side.followed')).toBeTruthy()
  })

  it('marks a live series and shows its next game', () => {
    const { container } = render(<Bracket games={LIVE_FEED} tz={TZ} />)
    const live = container.querySelector('.bx-series.is-live')
    expect(live).toBeTruthy()
    expect(within(live).getByText('● LIVE')).toBeInTheDocument()
    expect(within(live).getByText(/Game 4 ·/)).toBeInTheDocument()
  })
})

describe('RadialBracket — hover and pick interactions', () => {
  it('dims other nodes on hover, clears on leave, and routes a seed click', async () => {
    localStorage.setItem('wnba:followed', JSON.stringify(['MIN']))
    const onPick = vi.fn()
    const { container } = render(
      <FollowProvider>
        <RadialBracket games={GAMES} onPick={onPick} />
      </FollowProvider>
    )

    // A followed top seed carries the followed class; the projected inner rounds have
    // no winners yet, so those nodes render empty.
    expect(container.querySelector('.rb-leaf.followed')).toBeTruthy()
    expect(container.querySelector('.rb-r1.is-empty')).toBeTruthy()

    // Hovering a seed dims every other node.
    const leaf = container.querySelector('.rb-leaf')
    fireEvent.mouseEnter(leaf.parentElement)
    expect(container.querySelector('.rb-node.is-dim')).toBeTruthy()
    // The hovered node itself is not dimmed.
    expect(leaf.classList.contains('is-dim')).toBe(false)

    // Leaving the board clears the highlight.
    fireEvent.mouseLeave(container.querySelector('.rb'))
    expect(container.querySelector('.rb-node.is-dim')).toBeFalsy()

    // Clicking a seed routes back through onPick.
    await userEvent.click(leaf)
    expect(onPick).toHaveBeenCalled()
  })

  it('highlights from the inner rounds when they have winners', () => {
    const { container } = render(<RadialBracket games={PLAYOFFS_2025} />)

    // Hovering a first-round winner dims the rest.
    fireEvent.mouseEnter(container.querySelector('.rb-r1').parentElement)
    expect(container.querySelector('.rb-node.is-dim')).toBeTruthy()

    // Hovering a semifinal winner does the same.
    fireEvent.mouseEnter(container.querySelector('.rb-sf').parentElement)
    expect(container.querySelector('.rb-node.is-dim')).toBeTruthy()

    // A seeded outer node carries its seed/record title.
    const leaf = container.querySelector('.rb-leaf')
    expect(leaf.getAttribute('title')).toMatch(/\d+\.\s/)
  })
})
