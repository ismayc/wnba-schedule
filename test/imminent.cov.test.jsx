import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { isImminent, anyImminent, IMMINENT_MS, liveState } from '../src/utils/time.js'
import GameCard from '../src/components/GameCard.jsx'

const TIP = '2026-07-23T02:00:00.000Z'
const at = (iso) => new Date(iso).getTime()

describe('isImminent', () => {
  const game = { tip: TIP }

  it('is false before the warm-up window opens', () => {
    expect(isImminent(game, at(TIP) - IMMINENT_MS - 1)).toBe(false)
  })

  it('turns true from IMMINENT_MS before tip up to the scheduled time', () => {
    expect(isImminent(game, at(TIP) - IMMINENT_MS)).toBe(true)
    expect(isImminent(game, at(TIP) - 60_000)).toBe(true)
    expect(isImminent(game, at(TIP))).toBe(true)
  })

  it('stays true through the ~game-length fallback after a tip the feed has not confirmed', () => {
    expect(isImminent(game, at(TIP) + 60 * 60_000)).toBe(true)
  })

  it('is false once the fallback window has expired', () => {
    expect(isImminent(game, at(TIP) + 3 * 60 * 60_000)).toBe(false)
  })

  it('is never imminent for a live, final, or void game inside the window', () => {
    const now = at(TIP) - 60_000
    expect(isImminent({ ...game, live: true }, now)).toBe(false)
    expect(isImminent({ ...game, score: [10, 8] }, now)).toBe(false)
    expect(isImminent({ ...game, postponed: true }, now)).toBe(false)
    expect(isImminent({ ...game, canceled: true }, now)).toBe(false)
  })
})

describe('liveState', () => {
  // Pinned with an explicit `now` so both the 'likely-live' and 'past' arms are
  // covered deterministically — otherwise coverage of this branch drifts with the
  // wall-clock relative to committed game tips.
  const GAME_MS = 2.25 * 60 * 60 * 1000

  it('flags postponed/canceled games void', () => {
    expect(liveState({ postponed: true }, at(TIP))).toBe('void')
    expect(liveState({ canceled: true }, at(TIP))).toBe('void')
  })

  it('flags a live game live and a scored game final', () => {
    expect(liveState({ live: true, tip: TIP }, at(TIP))).toBe('live')
    expect(liveState({ score: [80, 70], tip: TIP }, at(TIP))).toBe('final')
  })

  it('is upcoming before tip', () => {
    expect(liveState({ tip: TIP }, at(TIP) - 60_000)).toBe('upcoming')
  })

  it('is likely-live inside the game window and past once it closes', () => {
    expect(liveState({ tip: TIP }, at(TIP) + 60_000)).toBe('likely-live')
    expect(liveState({ tip: TIP }, at(TIP) + GAME_MS + 1)).toBe('past')
  })
})

describe('anyImminent', () => {
  it('is true when at least one game is near tip', () => {
    const games = [{ tip: '2026-08-01T00:00:00.000Z' }, { tip: TIP }]
    expect(anyImminent(games, at(TIP) - 60_000)).toBe(true)
  })

  it('is false when no game is near tip', () => {
    expect(anyImminent([{ tip: TIP }], at(TIP) - IMMINENT_MS - 10_000)).toBe(false)
  })
})

describe('GameCard pre-game hint', () => {
  const base = {
    id: '1',
    tip: TIP,
    seasonType: 'regular',
    home: 'DAL',
    away: 'POR',
    venue: 'Moda Center',
    city: 'Portland',
  }

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('shows a Pre-game badge alongside the tip time within the warm-up window', () => {
    vi.setSystemTime(new Date(at(TIP) - 5 * 60_000)) // 5 min to tip, feed still pre
    const { container } = render(<GameCard game={base} tz="America/New_York" />)
    expect(container.querySelector('.pregame-badge')).toBeInTheDocument()
    expect(container.querySelector('.time')).toBeInTheDocument()
  })

  it('shows no Pre-game badge when tip is still hours away', () => {
    vi.setSystemTime(new Date(at(TIP) - 3 * 60 * 60_000))
    const { container } = render(<GameCard game={base} tz="America/New_York" />)
    expect(container.querySelector('.pregame-badge')).not.toBeInTheDocument()
    expect(container.querySelector('.time')).toBeInTheDocument()
  })
})
