import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

// A fully-decided season: every game already carries a final score. The poll effect
// must short-circuit (seasonOver === true) and never touch the network.
vi.mock('../src/data/schedule.js', () => ({
  GAMES: [
    {
      id: '900001',
      tip: '2026-05-08T23:30:00.000Z',
      seasonType: 'regular',
      home: 'NY',
      away: 'CON',
      venue: 'Barclays Center',
      city: 'Brooklyn',
      state: 'NY',
      broadcast: ['ION'],
      score: [100, 90],
      line: { home: [25, 25, 25, 25], away: [22, 23, 22, 23] },
    },
    {
      id: '900002',
      tip: '2026-05-09T23:30:00.000Z',
      seasonType: 'regular',
      home: 'MIN',
      away: 'SEA',
      venue: 'Target Center',
      city: 'Minneapolis',
      state: 'MN',
      broadcast: ['ION'],
      score: [88, 80],
      line: { home: [22, 22, 22, 22], away: [20, 20, 20, 20] },
    },
  ],
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a finished season', () => {
  it('never polls once every game is final', async () => {
    render(
      <FollowProvider>
        <ServicesProvider>
          <App />
        </ServicesProvider>
      </FollowProvider>
    )
    await act(async () => {})
    expect(fetch).not.toHaveBeenCalled()
  })
})
