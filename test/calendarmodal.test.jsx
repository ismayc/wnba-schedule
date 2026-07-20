import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CalendarModal from '../src/components/CalendarModal.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

// A tiny stand-in season; the modal only needs id/tip/home/away to build an .ics on
// download. Two games so "My teams" and "current filter" can be genuine subsets.
const GAMES = [
  { id: 'g1', tip: '2026-05-16T17:00:00.000Z', home: 'MIN', away: 'NY', round: undefined },
  { id: 'g2', tip: '2026-05-17T17:00:00.000Z', home: 'LV', away: 'SEA', round: undefined },
]

const FEED = 'https://the-wnba-schedule.netlify.app/calendar.ics'

const open = ({ followed = [], filtered = GAMES, onClose = () => {} } = {}) => {
  localStorage.setItem('wnba:followed', JSON.stringify(followed))
  return render(
    <FollowProvider>
      <CalendarModal games={GAMES} filtered={filtered} onClose={onClose} />
    </FollowProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock')
  globalThis.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('CalendarModal — subscribe rows', () => {
  it('always offers an "all games" subscribe row with webcal + Google links', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Calendar' })
    expect(within(dialog).getByText(`All ${GAMES.length} games`)).toBeInTheDocument()
    expect(within(dialog).getAllByRole('link', { name: 'Subscribe' })[0]).toHaveAttribute(
      'href',
      'webcal://the-wnba-schedule.netlify.app/calendar.ics'
    )
    expect(within(dialog).getAllByRole('link', { name: 'Google' })[0].getAttribute('href')).toBe(
      'https://www.google.com/calendar/render?cid=webcal://the-wnba-schedule.netlify.app/calendar.ics'
    )
  })

  it('hides the "My teams" row when nothing is followed', () => {
    open({ followed: [] })
    expect(screen.queryByText(/My teams/)).not.toBeInTheDocument()
  })

  it('adds a "My teams" subscribe row carrying a ?teams= filter when following', () => {
    open({ followed: ['MIN'] })
    const dialog = screen.getByRole('dialog', { name: 'Calendar' })
    expect(
      within(dialog).getByText('My teams (1)', { selector: '.cal-row-label' })
    ).toBeInTheDocument()
    const subs = within(dialog).getAllByRole('link', { name: 'Subscribe' })
    expect(subs.at(-1)).toHaveAttribute(
      'href',
      'webcal://the-wnba-schedule.netlify.app/calendar.ics?teams=MIN'
    )
  })
})

describe('CalendarModal — copy URL', () => {
  it('copies the feed URL and flips the label to "Copied!" then back', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    open()
    const copy = screen.getAllByRole('button', { name: 'Copy URL' })[0]
    await act(async () => {
      fireEvent.click(copy)
    })
    expect(writeText).toHaveBeenCalledWith(FEED)
    expect(copy).toHaveTextContent('Copied!')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(copy).toHaveTextContent('Copy URL')
    vi.unstubAllGlobals()
  })

  it('stays put when the clipboard write is rejected', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    open()
    const copy = screen.getAllByRole('button', { name: 'Copy URL' })[0]
    await userEvent.click(copy)
    expect(copy).toHaveTextContent('Copy URL')
    vi.unstubAllGlobals()
  })
})

describe('CalendarModal — one-time downloads', () => {
  it('downloads all games', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: `All games (${GAMES.length})` }))
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
  })

  it('offers the current filter only when it is a strict subset', async () => {
    open({ filtered: [GAMES[0]] })
    await userEvent.click(screen.getByRole('button', { name: 'Current filter (1)' }))
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
  })

  it('omits the current-filter button when the filter is the whole season', () => {
    open({ filtered: GAMES })
    expect(screen.queryByRole('button', { name: /Current filter/ })).not.toBeInTheDocument()
  })

  it('downloads just the followed teams', async () => {
    open({ followed: ['MIN'] })
    await userEvent.click(screen.getByRole('button', { name: 'My teams (1)' }))
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
  })
})

describe('CalendarModal — dismissal', () => {
  it('closes via the ✕ button', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the backdrop is pressed but not when the card is', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.mouseDown(document.querySelector('.modal'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
