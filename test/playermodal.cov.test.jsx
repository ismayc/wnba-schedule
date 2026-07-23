import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('../src/services/player.js', () => ({
  fetchPlayer: vi.fn(),
  headshotUrl: (id) => `https://example.test/headshots/${id}.png`,
}))
import PlayerModal from '../src/components/PlayerModal.jsx'
import { fetchPlayer } from '../src/services/player.js'

const fullPlayer = {
  id: '1',
  name: 'Test Player',
  short: 'T. Player',
  team: 'LV',
  pos: 'C',
  gamesPlayed: 10,
  avgMinutes: 30,
  avgRebounds: 8,
  avgPoints: 20,
  avgSteals: 1,
  avgBlocks: 2,
  avgAssists: 4,
  avgFgMade: 8,
  avgFgAtt: 16,
  fgPct: 50,
  avgThreeMade: 1,
  avgThreeAtt: 3,
  threePct: 33,
  avgFtMade: 3,
  avgFtAtt: 4,
  ftPct: 75,
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  fetchPlayer.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PlayerModal coverage', () => {
  it('handles an unknown team, a missing average, an empty name, and no game log', async () => {
    fetchPlayer.mockResolvedValue(null) // no bio, no games
    const player = { ...fullPlayer, name: '', team: 'ZZZ', avgSteals: undefined, pos: undefined }
    const { container } = render(<PlayerModal player={player} tz="America/New_York" onClose={() => {}} />)

    // Unknown team → no logo, the raw abbreviation stands in for the display name.
    expect(container.querySelector('.pm-sub .logo')).toBeNull()
    expect(screen.getByText(/ZZZ/)).toBeInTheDocument()
    // A non-numeric average renders as an en-dash (avgSteals is undefined).
    expect(screen.getAllByText('–').length).toBeGreaterThan(0)
    // The fetch resolved with nothing → the empty game-log state.
    expect(await screen.findByText('No game log available.')).toBeInTheDocument()

    // Headshot 404 with a blank name → empty initials, no crash.
    fireEvent.error(container.querySelector('img.pm-shot'))
    expect(container.querySelector('.pm-initials')?.textContent).toBe('')
  })

  it('renders a game-log row with missing stats and no result', async () => {
    fetchPlayer.mockResolvedValue({
      bio: { height: `6' 2"`, college: 'Somewhere' },
      games: [{ id: 'g1', date: '2026-07-01T23:00:00.000Z', atVs: '@', opp: 'SEA', result: null, stats: {} }],
    })
    const { container } = render(<PlayerModal player={fullPlayer} tz="America/New_York" onClose={() => {}} />)

    expect(await screen.findByText('SEA')).toBeInTheDocument()
    // Every missing stat cell falls back to an en-dash.
    const dashes = [...container.querySelectorAll('.pm-log tbody td')].filter((td) => td.textContent === '–')
    expect(dashes.length).toBe(4) // MIN, PTS, REB, AST
    // No result → no win/loss chip.
    expect(container.querySelector('.pm-res')).toBeNull()
  })

  it('renders the bio line from a later field when the earlier ones are absent', async () => {
    // Only college is present, so the height/weight/age operands all fall through.
    fetchPlayer.mockResolvedValue({ bio: { college: 'Late Field U' }, games: [] })
    render(<PlayerModal player={fullPlayer} tz="America/New_York" onClose={() => {}} />)
    expect(await screen.findByText('Late Field U')).toBeInTheDocument()
  })

  it('closes when the backdrop is pressed', () => {
    fetchPlayer.mockResolvedValue(null)
    const onClose = vi.fn()
    const { container } = render(<PlayerModal player={fullPlayer} tz="America/New_York" onClose={onClose} />)
    fireEvent.mouseDown(container.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })
})
