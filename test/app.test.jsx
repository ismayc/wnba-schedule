import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

// App is the wiring layer — polling, filters, URL state, and which view is on screen.
// These are integration tests over that wiring, not over the views themselves.

// The mount-time poll resolves on a later microtask, so its setState lands outside
// act() and React warns. Flushing here keeps the update inside act and the output
// free of warnings that would otherwise mask real ones.
const mount = async () => {
  const utils = render(
    <FollowProvider>
      <App />
    </FollowProvider>
  )
  await act(async () => {})
  return utils
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  // The live overlay fires on mount; keep it inert so tests exercise committed data.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const search = () => new URLSearchParams(window.location.search)

describe('App', () => {
  it('renders the shell and opens on the schedule', async () => {
    await mount()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The WNBA Schedule')
    expect(screen.getByRole('button', { name: /Schedule/ })).toHaveAttribute('aria-current', 'page')
  })

  it('offers every view', async () => {
    await mount()
    for (const label of [/Schedule/, /Week/, /Regular Season/, /Playoffs/, /Radial/, /Stats/]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('switches views and records it in the URL', async () => {
    await mount()
    await userEvent.click(screen.getByRole('button', { name: /Stats/ }))
    expect(screen.getByRole('heading', { name: 'Stats' })).toBeInTheDocument()
    await waitFor(() => expect(search().get('view')).toBe('stats'))
  })

  it('keeps the default view out of the URL', async () => {
    await mount()
    await userEvent.click(screen.getByRole('button', { name: /Stats/ }))
    await waitFor(() => expect(search().get('view')).toBe('stats'))
    await userEvent.click(screen.getByRole('button', { name: /📋 Schedule/ }))
    await waitFor(() => expect(search().get('view')).toBeNull())
  })

  it('restores the view from a shared link', async () => {
    window.history.replaceState(null, '', '/?view=standings&hide=1')
    await mount()
    expect(screen.getByRole('heading', { name: 'Regular Season' })).toBeInTheDocument()
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'true')
  })

  it('restores the team filter from a shared link', async () => {
    // The filter row only exists on the schedule and week views.
    window.history.replaceState(null, '', '/?team=MIN')
    await mount()
    expect(screen.getByDisplayValue('Minnesota Lynx')).toBeInTheDocument()
  })

  it('filters the schedule by team', async () => {
    await mount()
    const before = document.querySelectorAll('.game').length
    await userEvent.selectOptions(screen.getByLabelText('Team'), 'MIN')
    await waitFor(() => expect(search().get('team')).toBe('MIN'))
    const after = document.querySelectorAll('.game').length
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })

  describe('past days', () => {
    it('hides them by default and reveals them on click', async () => {
      await mount()
      const before = document.querySelectorAll('.day').length
      const btn = screen.getByRole('button', { name: /past days/ })
      expect(btn).toHaveAttribute('aria-pressed', 'false')

      await userEvent.click(btn)
      await waitFor(() => expect(search().get('past')).toBe('1'))
      expect(document.querySelectorAll('.day').length).toBeGreaterThan(before)
    })

    it('reports how many days are hidden', async () => {
      await mount()
      const btn = screen.getByRole('button', { name: /past days/ })
      const count = Number(within(btn).getByText(/^\d+$/).textContent)
      expect(count).toBeGreaterThan(0)
    })
  })

  describe('spoiler-free mode', () => {
    it('toggles and persists to the URL', async () => {
      window.history.replaceState(null, '', '/?past=1')
      await mount()
      const btn = screen.getByTitle('Spoiler-free mode')
      await userEvent.click(btn)
      await waitFor(() => expect(search().get('hide')).toBe('1'))
      expect(btn).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('theme', () => {
    it('flips the document attribute and persists it', async () => {
      await mount()
      const before = document.documentElement.dataset.theme
      await userEvent.click(screen.getByTitle('Toggle theme'))
      const after = document.documentElement.dataset.theme
      expect(after).not.toBe(before)
      expect(localStorage.getItem('wnba:theme')).toBe(after)
    })
  })

  describe('live alerts', () => {
    it('are off by default and persist when enabled', async () => {
      await mount()
      const btn = screen.getByTitle('Live alerts off')
      expect(btn).toHaveAttribute('aria-pressed', 'false')
      await userEvent.click(btn)
      expect(localStorage.getItem('wnba:alerts')).toBe('1')
    })
  })

  describe('the live overlay', () => {
    it('polls on mount', async () => {
      await mount()
      await waitFor(() => expect(fetch).toHaveBeenCalled())
      // Three days of scoreboard per refresh.
      expect(fetch.mock.calls.length).toBe(3)
    })

    it('still renders the committed season when the feed is down', async () => {
      fetch.mockRejectedValue(new Error('offline'))
      await mount()
      await waitFor(() => expect(fetch).toHaveBeenCalled())
      expect(document.querySelectorAll('.game').length).toBeGreaterThan(0)
    })
  })

  describe('team panel', () => {
    it('opens from the standings and can be dismissed', async () => {
      window.history.replaceState(null, '', '/?view=standings')
      await mount()
      await userEvent.click(document.querySelector('.team-btn'))
      const panel = screen.getByRole('dialog')
      // The panel has several heading levels; the team name is the h3.
      expect(within(panel).getByRole('heading', { level: 3 })).toHaveTextContent(/Lynx/)

      await userEvent.click(within(panel).getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('game detail', () => {
    it('opens when a game is clicked', async () => {
      await mount()
      await userEvent.click(document.querySelector('.game'))
      expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
    })
  })
})
