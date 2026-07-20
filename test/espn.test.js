import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchLive, applyLive, liveCount } from '../src/services/espn.js'

// Minimal shape of an ESPN scoreboard event, with only the fields the normalizer reads.
const event = ({
  id = '1',
  state = 'in',
  completed = false,
  name,
  shortDetail = 'Q3 4:21',
  period = 3,
  clock = '4:21',
  home = 60,
  away = 58,
} = {}) => ({
  id,
  competitions: [
    {
      status: { period, displayClock: clock, type: { state, completed, name, shortDetail } },
      competitors: [
        { homeAway: 'home', score: { value: home } },
        { homeAway: 'away', score: { value: away } },
      ],
    },
  ],
})

const scoreboard = (events) => ({ ok: true, json: async () => ({ events }) })

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchLive', () => {
  const NOW = new Date('2026-07-20T12:00:00Z')

  it('asks for yesterday, today, and tomorrow', async () => {
    fetch.mockResolvedValue(scoreboard([]))
    await fetchLive({ now: NOW })

    const dates = fetch.mock.calls.map((c) => new URL(c[0]).searchParams.get('dates'))
    expect(dates).toEqual(['20260719', '20260720', '20260721'])
  })

  it('rolls over year boundaries correctly', async () => {
    fetch.mockResolvedValue(scoreboard([]))
    await fetchLive({ now: new Date('2026-01-01T00:00:00Z') })

    const dates = fetch.mock.calls.map((c) => new URL(c[0]).searchParams.get('dates'))
    expect(dates).toEqual(['20251231', '20260101', '20260102'])
  })

  it('returns games keyed by id', async () => {
    fetch.mockResolvedValue(scoreboard([event({ id: '42' })]))
    const live = await fetchLive({ now: NOW })
    expect(live.get('42')).toMatchObject({ id: '42', live: true })
  })

  it('survives one day failing — the others still land', async () => {
    // A rolling window means a single bad date shouldn't blank the whole overlay.
    fetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce(scoreboard([event({ id: 'a' })]))
      .mockResolvedValueOnce(scoreboard([event({ id: 'b' })]))
    const live = await fetchLive({ now: NOW })
    expect([...live.keys()].sort()).toEqual(['a', 'b'])
  })

  it('returns an empty map when every request fails', async () => {
    fetch.mockRejectedValue(new Error('offline'))
    await expect(fetchLive({ now: NOW })).resolves.toEqual(new Map())
  })

  it('passes the abort signal through', async () => {
    fetch.mockResolvedValue(scoreboard([]))
    const signal = new AbortController().signal
    await fetchLive({ now: NOW, signal })
    for (const call of fetch.mock.calls) expect(call[1]).toMatchObject({ signal })
  })

  it('skips malformed events rather than throwing', async () => {
    fetch.mockResolvedValue(
      scoreboard([
        { id: 'no-competition' },
        { id: 'one-sided', competitions: [{ competitors: [{ homeAway: 'home' }] }] },
        event({ id: 'good' }),
      ])
    )
    const live = await fetchLive({ now: NOW })
    expect([...live.keys()]).toEqual(['good'])
  })

  describe('normalizing status', () => {
    const one = async (over) => {
      fetch.mockResolvedValue(scoreboard([event(over)]))
      return (await fetchLive({ now: NOW })).get('1')
    }

    it('marks an in-progress game live with a running score', async () => {
      expect(await one({ state: 'in', home: 60, away: 58 })).toMatchObject({
        live: true,
        score: [60, 58],
        period: 3,
        statusLabel: 'Q3 4:21',
      })
    })

    it('marks a completed game not-live but scored', async () => {
      const g = await one({ state: 'post', completed: true, shortDetail: 'Final' })
      expect(g.live).toBe(false)
      expect(g.score).toEqual([60, 58])
    })

    it('withholds a score for a game that has not started', async () => {
      // ESPN reports 0-0 before tip; surfacing that would render a fake 0-0 result.
      const g = await one({ state: 'pre', completed: false, home: 0, away: 0, period: 0 })
      expect(g.live).toBe(false)
      expect(g.score).toBeUndefined()
    })

    it('flags postponed and canceled games', async () => {
      expect(await one({ state: 'post', name: 'STATUS_POSTPONED' })).toMatchObject({
        postponed: true,
      })
      expect(await one({ state: 'post', name: 'STATUS_CANCELED' })).toMatchObject({
        canceled: true,
      })
    })

    it('derives overtime periods past the fourth quarter', async () => {
      expect((await one({ period: 4 })).ot).toBeUndefined()
      expect((await one({ period: 5 })).ot).toBe(1)
      expect((await one({ period: 6 })).ot).toBe(2)
    })

    it('accepts a bare numeric score as well as {value}', async () => {
      fetch.mockResolvedValue(
        scoreboard([
          {
            id: 'x',
            competitions: [
              {
                status: { period: 2, type: { state: 'in' } },
                competitors: [
                  { homeAway: 'home', score: 55 },
                  { homeAway: 'away', score: 51 },
                ],
              },
            ],
          },
        ])
      )
      expect((await fetchLive({ now: NOW })).get('x').score).toEqual([55, 51])
    })
  })
})

describe('applyLive', () => {
  const committed = [
    { id: '1', home: 'MIN', away: 'SEA', tip: '2026-07-20T23:00:00.000Z' },
    { id: '2', home: 'NY', away: 'ATL', tip: '2026-07-20T23:00:00.000Z', score: [90, 80] },
  ]

  it('returns the original list untouched when there is nothing live', () => {
    expect(applyLive(committed, null)).toBe(committed)
    expect(applyLive(committed, new Map())).toBe(committed)
  })

  it('leaves games the overlay does not mention alone', () => {
    const live = new Map([['1', { id: '1', live: true, score: [10, 8] }]])
    expect(applyLive(committed, live)[1]).toBe(committed[1])
  })

  it('overlays live score and status onto a committed game', () => {
    const live = new Map([
      ['1', { id: '1', live: true, score: [55, 51], period: 2, statusLabel: 'Q2 1:10' }],
    ])
    expect(applyLive(committed, live)[0]).toMatchObject({
      id: '1',
      home: 'MIN', // committed fields survive
      live: true,
      score: [55, 51],
      statusLabel: 'Q2 1:10',
    })
  })

  it('lets a fresher live result overwrite a committed score', () => {
    const live = new Map([['2', { id: '2', live: false, score: [95, 88] }]])
    expect(applyLive(committed, live)[1].score).toEqual([95, 88])
  })

  it('never lets a null or undefined field erase committed data', () => {
    // The overlay reports statusLabel: null for games it knows nothing about; that
    // must not blank a value the committed snapshot already has.
    const withLabel = [{ ...committed[1], statusLabel: 'Final' }]
    const live = new Map([['2', { id: '2', live: false, statusLabel: null, score: undefined }]])
    const [merged] = applyLive(withLabel, live)
    expect(merged.statusLabel).toBe('Final')
    expect(merged.score).toEqual([90, 80])
  })

  it('drops the internal `final` flag rather than leaking it into game objects', () => {
    const live = new Map([['1', { id: '1', live: false, final: true, score: [88, 80] }]])
    expect(applyLive(committed, live)[0]).not.toHaveProperty('final')
  })

  it('does not mutate the games it is given', () => {
    const live = new Map([['1', { id: '1', live: true, score: [55, 51] }]])
    applyLive(committed, live)
    expect(committed[0]).not.toHaveProperty('score')
  })
})

describe('liveCount', () => {
  it('counts only games flagged live', () => {
    expect(liveCount([{ live: true }, { live: false }, {}, { live: true }])).toBe(2)
    expect(liveCount([])).toBe(0)
  })
})
