import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import PlayerModal from '../src/components/PlayerModal.jsx'
import { fetchPlayer, headshotUrl } from '../src/services/player.js'
import { flagUrl } from '../src/utils/flag.js'

const overview = {
  athlete: {
    displayName: "A'ja Wilson",
    jersey: '22',
    position: { abbreviation: 'C' },
    displayHeight: `6' 4"`,
    displayWeight: '195 lbs',
    age: 29,
    college: { name: 'South Carolina' },
    team: { displayName: 'Las Vegas Aces' },
  },
}

// birthPlace only rides on the core athlete record, fetched separately.
const core = { birthPlace: { city: 'Columbia', state: 'SC', country: 'USA' } }

const gamelog = {
  labels: ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'PF'],
  seasonTypes: [
    {
      categories: [
        {
          events: [
            { eventId: 'e2', stats: ['30', '18', '9', '2', '0', '2', '3', '7-15', '46.7', '0-1', '0', '4-4', '100', '2'] },
            { eventId: 'e1', stats: ['28', '26', '6', '4', '1', '4', '0', '11-14', '78.6', '3-3', '100', '1-1', '100', '0'] },
          ],
        },
      ],
    },
  ],
  events: {
    e1: { gameDate: '2026-07-19T23:00Z', atVs: 'vs', gameResult: 'W', opponent: { abbreviation: 'PHX' } },
    e2: { gameDate: '2026-07-15T23:00Z', atVs: '@', gameResult: 'L', opponent: { abbreviation: 'SEA' } },
  },
}

const stub = () => {
  globalThis.fetch = vi.fn((url) => {
    const u = String(url)
    const body = u.endsWith('/gamelog') ? gamelog : u.includes('sports.core.api') ? core : overview
    return Promise.resolve({ ok: true, json: async () => body })
  })
}

const player = {
  id: '3149391',
  name: "A'ja Wilson",
  short: 'A. Wilson',
  team: 'LV',
  pos: 'C',
  gamesPlayed: 23,
  avgMinutes: 31.5,
  avgRebounds: 9.6,
  avgPoints: 25.6,
  avgFgMade: 9.2,
  avgFgAtt: 17.6,
  fgPct: 52.5,
  avgThreeMade: 1,
  avgThreeAtt: 2.3,
  threePct: 43.4,
  avgFtMade: 6.1,
  avgFtAtt: 7.3,
  ftPct: 83.4,
  avgAssists: 2.9,
  avgTurnovers: 2.4,
  avgSteals: 1.5,
  avgBlocks: 2,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('fetchPlayer (service)', () => {
  it('parses bio and maps game-log stats by the feed’s labels, most recent first', async () => {
    stub()
    const { bio, games } = await fetchPlayer('3149391')
    expect(bio).toMatchObject({
      jersey: '22',
      pos: 'C',
      height: `6' 4"`,
      age: 29,
      college: 'South Carolina',
      country: 'USA',
    })
    // Sorted newest-first regardless of feed order (e1 = 7/19 comes before e2 = 7/15).
    expect(games.map((g) => g.opp)).toEqual(['PHX', 'SEA'])
    expect(games[0]).toMatchObject({ result: 'W', atVs: 'vs' })
    expect(games[0].stats).toEqual({ MIN: '28', PTS: '26', REB: '6', AST: '4' })
  })

  it('returns null when the request throws', async () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error('offline')
    })
    expect(await fetchPlayer('x')).toBeNull()
  })

  it('builds a deterministic headshot URL', () => {
    expect(headshotUrl('3149391')).toContain('/headshots/wnba/players/full/3149391.png')
  })
})

describe('flagUrl', () => {
  it('maps a country name onto its ESPN IOC flag code', () => {
    expect(flagUrl('USA')).toContain('/countries/500/usa.png')
    expect(flagUrl('Australia')).toContain('/countries/500/aus.png')
    expect(flagUrl('United States')).toContain('/countries/500/usa.png')
  })

  it('returns null for a country it has no code for', () => {
    expect(flagUrl('Wakanda')).toBeNull()
    expect(flagUrl(null)).toBeNull()
  })
})

describe('PlayerModal (component)', () => {
  it('renders nothing without a player', () => {
    const { container } = render(<PlayerModal player={null} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows committed season stats immediately, then the fetched game log', async () => {
    stub()
    render(<PlayerModal player={player} tz="America/New_York" onClose={() => {}} />)
    // Committed and instant — averages forced to one decimal (blocks 2 → "2.0").
    expect(screen.getByText("A'ja Wilson")).toBeInTheDocument()
    expect(screen.getByText('25.6')).toBeInTheDocument()
    expect(screen.getByText('2.0')).toBeInTheDocument()
    expect(screen.getByText(/FG 9.2-17.6/)).toBeInTheDocument()
    // The fetched recent games fill in.
    expect(await screen.findByText('PHX')).toBeInTheDocument()
    expect(screen.getByText('SEA')).toBeInTheDocument()
    // Birthplace country + its flag arrive with the bio fetch.
    expect(screen.getByText('USA')).toBeInTheDocument()
    const flag = document.querySelector('img.pm-flag')
    expect(flag?.getAttribute('src')).toContain('/countries/500/usa.png')
    // A flag that 404s hides itself rather than showing a broken image.
    fireEvent.error(flag)
    expect(flag.style.display).toBe('none')
  })

  it('falls back to the player’s initials when the headshot 404s', () => {
    stub()
    const { container } = render(<PlayerModal player={player} tz="America/New_York" onClose={() => {}} />)
    // jsdom never loads the image, so simulate the 404.
    fireEvent.error(container.querySelector('img.pm-shot'))
    expect(container.querySelector('.pm-initials')?.textContent).toBe('AW')
    expect(container.querySelector('img.pm-shot')).toBeNull()
  })
})
