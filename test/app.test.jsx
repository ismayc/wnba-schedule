import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// The game detail fetches the ESPN summary on open. These wiring tests don't exercise
// the summary sections (they have their own suite), so stub the service to keep the
// fetch call count deterministic and the tests off the network.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'
import { ServicesProvider } from '../src/context/services.jsx'

// App is the wiring layer — polling, filters, URL state, and which view is on screen.
// These are integration tests over that wiring, not over the views themselves.

// The mount-time poll resolves on a later microtask, so its setState lands outside
// act() and React warns. Flushing here keeps the update inside act and the output
// free of warnings that would otherwise mask real ones.
const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
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

// The filter controls (team, my-teams, services, search) live inside a panel that's
// collapsed by default; open it before reaching for anything inside.
const openFilters = () => userEvent.click(screen.getByRole('button', { name: /⚙ Filters/ }))

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
    await openFilters()
    await userEvent.selectOptions(screen.getByLabelText('Team'), 'MIN')
    await waitFor(() => expect(search().get('team')).toBe('MIN'))
    const after = document.querySelectorAll('.game').length
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })

  describe('my services', () => {
    it('opens the picker from the filter bar and remembers picks', async () => {
      await mount()
      await openFilters()
      // With nothing chosen, the chip invites you to choose.
      await userEvent.click(screen.getByRole('button', { name: /Choose my services/ }))
      const dialog = screen.getByRole('dialog', { name: 'My services' })
      await userEvent.click(within(dialog).getByLabelText(/Peacock/))
      expect(JSON.parse(localStorage.getItem('wnba:services'))).toContain('peacock')
      // Closing reveals the filter toggle with the count.
      await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
      expect(screen.getByRole('button', { name: /On my services \(1\)/ })).toBeInTheDocument()
    })

    it('narrows the schedule to watchable games and remembers the choice', async () => {
      localStorage.setItem('wnba:services', JSON.stringify(['youtubetv', 'prime', 'peacock']))
      await mount()
      const before = document.querySelectorAll('.game').length
      await openFilters()
      const btn = screen.getByRole('button', { name: /On my services/ })
      expect(btn).toHaveAttribute('aria-pressed', 'false')

      await userEvent.click(btn)
      expect(btn).toHaveAttribute('aria-pressed', 'true')
      expect(localStorage.getItem('wnba:watchOnly')).toBe('1')

      const after = document.querySelectorAll('.game').length
      expect(after).toBeGreaterThan(0)
      expect(after).toBeLessThan(before)
      // Every remaining card carries a watchable-service badge.
      for (const card of document.querySelectorAll('.game')) {
        expect(within(card).getAllByText(/YouTube TV|Prime Video|Peacock/).length).toBeGreaterThan(0)
      }
    })

    it('restores the filter from localStorage on load', async () => {
      localStorage.setItem('wnba:services', JSON.stringify(['youtubetv']))
      localStorage.setItem('wnba:watchOnly', '1')
      await mount()
      expect(screen.getByRole('button', { name: /On my services/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    })
  })

  describe('past days', () => {
    it('switches to the month-grouped full season on click', async () => {
      await mount()
      // Recent view: a flat list, no month navigation.
      expect(document.querySelector('.month-jump')).toBeFalsy()
      const btn = screen.getByRole('button', { name: /full season/i })
      expect(btn).toHaveAttribute('aria-pressed', 'false')

      await userEvent.click(btn)
      await waitFor(() => expect(search().get('past')).toBe('1'))
      // Full season: the sticky month jump-bar and collapsible month sections appear.
      expect(document.querySelector('.month-jump')).toBeTruthy()
      expect(document.querySelectorAll('.month').length).toBeGreaterThan(0)
      expect(btn).toHaveAttribute('aria-pressed', 'true')
    })

    it('reports how many days are hidden', async () => {
      await mount()
      const btn = screen.getByRole('button', { name: /full season/i })
      const count = Number(within(btn).getByText(/^\d+$/).textContent)
      expect(count).toBeGreaterThan(0)
    })

    it('remembers the choice per-device in localStorage', async () => {
      await mount()
      await userEvent.click(screen.getByRole('button', { name: /full season/i }))
      await waitFor(() => expect(localStorage.getItem('wnba:showPast')).toBe('1'))
    })

    it('restores from localStorage when the link says nothing', async () => {
      localStorage.setItem('wnba:showPast', '1')
      await mount()
      expect(screen.getByRole('button', { name: /full season/i })).toHaveAttribute('aria-pressed', 'true')
    })

    it('lets an explicit ?past= in a shared link override the saved preference', async () => {
      localStorage.setItem('wnba:showPast', '1')
      window.history.replaceState(null, '', '/?past=0')
      await mount()
      expect(screen.getByRole('button', { name: /full season/i })).toHaveAttribute('aria-pressed', 'false')
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

    it('also remembers the choice per-device in localStorage', async () => {
      await mount()
      await userEvent.click(screen.getByTitle('Spoiler-free mode'))
      await waitFor(() => expect(localStorage.getItem('wnba:spoilerFree')).toBe('1'))
    })

    it('restores from localStorage when the link says nothing', async () => {
      localStorage.setItem('wnba:spoilerFree', '1')
      await mount()
      expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'true')
    })

    it('lets an explicit ?hide= in a shared link override the saved preference', async () => {
      localStorage.setItem('wnba:spoilerFree', '1')
      window.history.replaceState(null, '', '/?hide=0')
      await mount()
      expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'false')
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

describe('filter panel', () => {
  const toggle = () => screen.getByRole('button', { name: /⚙ Filters/ })

  it('is collapsed by default and toggles open/closed with aria-expanded', async () => {
    await mount()
    // Collapsed: the panel controls (the search box) aren't in the DOM.
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Search games')).not.toBeInTheDocument()

    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Search games')).toBeInTheDocument()

    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Search games')).not.toBeInTheDocument()
  })

  it('narrows the schedule as you type a scoped query', async () => {
    await mount()
    const before = document.querySelectorAll('.game').length
    await userEvent.click(toggle())
    await userEvent.type(screen.getByLabelText('Search games'), 'team: Storm')
    const after = document.querySelectorAll('.game').length
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })

  it('counts an active search on the toggle badge and clears it with Clear all', async () => {
    await mount()
    // No badge with nothing applied.
    expect(within(toggle()).queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()

    await userEvent.click(toggle())
    await userEvent.type(screen.getByLabelText('Search games'), 'Seattle')
    // Badge now reports one active filter.
    expect(within(toggle()).getByText('1')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByLabelText('Search games')).toHaveValue('')
    expect(within(toggle()).queryByText('1')).not.toBeInTheDocument()
  })

  it('bumps the badge count as more filters combine', async () => {
    window.history.replaceState(null, '', '/?team=MIN')
    await mount()
    // ?team= already counts as one active filter (and auto-opened the panel).
    expect(within(toggle()).getByText('1')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Search games'), 'Lynx')
    expect(within(toggle()).getByText('2')).toBeInTheDocument()
  })

  it('fills the search box from an example chip', async () => {
    await mount()
    await userEvent.click(toggle())
    await userEvent.click(screen.getByRole('button', { name: 'team: Storm' }))
    expect(screen.getByLabelText('Search games')).toHaveValue('team: Storm')
  })

  it('auto-opens on load when a shared link already has a team applied', async () => {
    window.history.replaceState(null, '', '/?team=MIN')
    await mount()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Search games')).toBeInTheDocument()
  })
})

describe('game deep link', () => {
  it('opens straight onto the linked game detail, then drops the one-shot param', async () => {
    window.history.replaceState(null, '', `/?game=${GAMES[0].id}`)
    await mount()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // The param is read-only: the first URL write returns to plain filter state.
    expect(new URLSearchParams(window.location.search).get('game')).toBeNull()
  })

  it('ignores a deep link to a game not in the committed season', async () => {
    window.history.replaceState(null, '', '/?game=000000')
    await mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
