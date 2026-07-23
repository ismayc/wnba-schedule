import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import { PlayerBox } from '../src/components/GameSummary.jsx'
import { LINEUPS } from '../src/data/lineups.js'

const ready = (data) => ({ status: 'ready', data })
const ALLSTAR = { id: '401857320', home: 'COOP', away: 'SPO' }

afterEach(cleanup)

describe('committed All-Star lineup fallback', () => {
  it('shows the announced rosters when ESPN has no box score yet', () => {
    render(<PlayerBox summary={ready({ box: null })} game={ALLSTAR} hideScores={false} />)

    // Lineups view, not a box score (no stats committed).
    expect(screen.getByRole('heading', { name: 'Starting lineups' })).toBeInTheDocument()
    expect(screen.getByText('Team Spoon')).toBeInTheDocument()
    expect(screen.getByText('Team Coop')).toBeInTheDocument()

    // Starters render in the main list...
    expect(screen.getByText('Caitlin Clark')).toBeInTheDocument()
    expect(screen.getByText('Paige Bueckers')).toBeInTheDocument()

    // ...and the six reserves per side sit behind a Bench disclosure.
    const bench = screen.getAllByText(/^Bench \(6\)$/)
    expect(bench).toHaveLength(2)
    expect(screen.getByText('Nneka Ogwumike')).toBeInTheDocument() // a Team Spoon reserve

    // Injury replacement applied: Kahleah Copper in for the injured Kelsey Plum.
    expect(screen.getByText('Kahleah Copper')).toBeInTheDocument()
    expect(screen.queryByText('Kelsey Plum')).not.toBeInTheDocument()
  })

  it('defers to ESPN once a real box score is posted', () => {
    // A live box for the same event must win over the committed fallback.
    const espnBox = {
      hasStats: false,
      sides: [
        { abbr: 'SPO', name: 'Team Spoon', starters: [{ id: 'x', name: 'ESPN Starter', pos: 'G' }], bench: [] },
        { abbr: 'COOP', name: 'Team Coop', starters: [{ id: 'y', name: 'Other Starter', pos: 'F' }], bench: [] },
      ],
    }
    render(<PlayerBox summary={ready({ box: espnBox })} game={ALLSTAR} hideScores={false} />)
    expect(screen.getByText('ESPN Starter')).toBeInTheDocument()
    expect(screen.queryByText('Caitlin Clark')).not.toBeInTheDocument()
  })

  it('keeps the committed data internally consistent (10 starters = 4G + 6F per game)', () => {
    const sides = LINEUPS['401857320'].sides
    const starters = sides.flatMap((s) => s.starters)
    const bench = sides.flatMap((s) => s.bench)
    expect(starters).toHaveLength(10)
    expect(bench).toHaveLength(12)
    const guards = starters.filter((p) => p.pos.startsWith('G')).length
    expect(guards).toBe(4)
    expect(starters.length - guards).toBe(6)
  })
})
