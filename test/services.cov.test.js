import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchLive } from '../src/services/espn.js'
import { detectEvents } from '../src/services/alerts.js'
import { fetchPlayer } from '../src/services/player.js'
import { fetchGameSummary } from '../src/services/summary.js'

// ── espn.js remaining branches ────────────────────────────────────────────
describe('espn normalizer edge cases', () => {
  const NOW = new Date('2026-07-20T12:00:00Z')
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  const board = (events) => ({ ok: true, json: async () => ({ events }) })
  const one = async (ev) => {
    fetch.mockResolvedValue(board([ev]))
    return (await fetchLive({ now: NOW })).get(ev.id)
  }

  it('falls back to an empty status object when the event carries no status (line 19)', async () => {
    // No competition.status at all — the `|| {}` guard keeps the normalizer from throwing.
    const g = await one({
      id: 'nostatus',
      competitions: [
        {
          competitors: [
            { homeAway: 'home', score: { value: 55 } },
            { homeAway: 'away', score: { value: 51 } },
          ],
        },
      ],
    })
    expect(g).toMatchObject({ id: 'nostatus', live: false, final: false })
    expect(g.statusLabel).toBeNull()
    // No state 'in' and not completed → the score is withheld even though both are finite.
    expect(g.score).toBeUndefined()
  })

  it('treats a null score value as no score (line 20)', async () => {
    const g = await one({
      id: 'nullscore',
      competitions: [
        {
          status: { period: 2, type: { state: 'in' } },
          competitors: [
            { homeAway: 'home', score: null },
            { homeAway: 'away', score: { value: 3 } },
          ],
        },
      ],
    })
    expect(g.live).toBe(true)
    // hs is null → not finite → no [h,a] pair surfaced.
    expect(g.score).toBeUndefined()
  })

  it('tolerates a fulfilled response with no events array (line 60)', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    const live = await fetchLive({ now: NOW })
    expect(live.size).toBe(0)
  })
})

// ── alerts.js remaining branches ──────────────────────────────────────────
describe('alerts detection edge cases', () => {
  const g = (over = {}) => ({ id: 'g1', home: 'MIN', away: 'SEA', seasonType: 'regular', ...over })

  it('handles a scoreless previous snapshot when a game turns into a nailbiter (lines 19, 25)', () => {
    // `was` is live and late but carries no score yet, so leaderOf/marginOf(was) return
    // null rather than throwing — and the close-and-late transition still fires once.
    const before = [g({ live: true, period: 4 })] // no score
    const after = [g({ live: true, period: 4, score: [80, 78] })]
    const evts = detectEvents(before, after)
    expect(evts.map((e) => e.kind)).toEqual(['nailbiter'])
    expect(evts[0].margin).toBe(2)
  })

  it('treats a missing period as pre-regulation, so nothing fires (line 28)', () => {
    // Same leader, still live, but period is absent → (period ?? 0) keeps isLate false.
    const before = [g({ live: true, period: 1, score: [50, 48] })]
    const after = [g({ live: true, score: [50, 48] })] // no period
    expect(detectEvents(before, after)).toEqual([])
  })
})

// ── player.js remaining branches ──────────────────────────────────────────
describe('fetchPlayer parsing edge cases', () => {
  afterEach(() => vi.restoreAllMocks())

  // Route each of the three requests to a supplied body (or a not-ok response).
  const stub = ({ overview, gamelog, core, ok = true }) => {
    globalThis.fetch = vi.fn((url) => {
      const u = String(url)
      const body = u.endsWith('/gamelog') ? gamelog : u.includes('sports.core.api') ? core : overview
      return Promise.resolve({ ok, json: async () => body })
    })
  }

  it('degrades to null bio and empty games when every request is not-ok (lines 68-70, 16-18, 37-41)', async () => {
    stub({ ok: false })
    const { bio, games } = await fetchPlayer('x')
    expect(bio).toBeNull()
    expect(games).toEqual([])
  })

  it('fills bio fields with null when the athlete record is empty (lines 20-28)', async () => {
    stub({ overview: { athlete: {} }, core: { birthPlace: { country: 'USA' } }, gamelog: null })
    const { bio } = await fetchPlayer('x')
    expect(bio).toEqual({
      jersey: null,
      pos: null,
      height: null,
      weight: null,
      age: null,
      college: null,
      country: 'USA', // sourced from the core birthPlace
      team: null,
      experience: null,
    })
  })

  it('falls back to the overview birthPlace and reads numeric experience (lines 17, 28)', async () => {
    stub({
      overview: { athlete: { birthPlace: { country: 'France' }, experience: { years: 5 } } },
      core: null, // not-ok core would be null; here core is explicitly absent
      ok: true,
      gamelog: null,
    })
    const { bio } = await fetchPlayer('x')
    expect(bio.country).toBe('France')
    expect(bio.experience).toBe(5)
  })

  it('maps the game log by labels, defaulting missing columns and metadata (lines 39-51)', async () => {
    const gamelog = {
      labels: ['MIN', 'PTS'], // REB/AST columns are absent → those stats resolve to null
      events: {
        e1: { gameDate: '2026-07-19', atVs: '@', gameResult: 'W', opponent: { abbreviation: 'PHX' } },
        e3: { gameDate: '2026-06-01' }, // no opponent/atVs/result
      },
      seasonTypes: [
        {}, // no categories
        { categories: [{}] }, // category with no events
        {
          categories: [
            {
              events: [
                { eventId: 'e1', stats: ['28', '26'] },
                { eventId: 'e2' }, // no stats and no metadata → dropped (no date)
                { eventId: 'e3' }, // dated but statless
              ],
            },
          ],
        },
      ],
    }
    stub({ overview: { athlete: {} }, core: null, gamelog })
    const { games } = await fetchPlayer('x')
    expect(games).toHaveLength(2) // e2 filtered out for lacking a date
    expect(games[0]).toMatchObject({ opp: 'PHX', atVs: '@', result: 'W' })
    expect(games[0].stats).toEqual({ MIN: '28', PTS: '26', REB: null, AST: null })
    // e3 defaults: no opponent → null, no atVs → 'vs', no result → null, statless → null cells.
    expect(games[1]).toMatchObject({ opp: null, atVs: 'vs', result: null })
    expect(games[1].stats).toEqual({ MIN: null, PTS: null, REB: null, AST: null })
  })
})

// ── summary.js remaining branches ─────────────────────────────────────────
describe('fetchGameSummary parsing edge cases', () => {
  afterEach(() => vi.restoreAllMocks())
  const stub = (payload) => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
  }

  // A payload that exercises the null/fallback path of nearly every parser.
  const edge = () => ({
    boxscore: {
      players: [
        {
          team: { shortDisplayName: 'Lynx' }, // no abbreviation, no displayName
          statistics: [
            {
              keys: ['minutes', 'points'],
              names: ['MIN'], // labels absent → names used; names[1] missing → key label
              athletes: [
                { starter: true }, // no athlete, no stats
                { starter: false, didNotPlay: true, athlete: { shortName: 'B. Bench', id: '9' }, stats: ['20'] },
              ],
              totals: ['15'], // only one column present → second totals cell defaults to ''
            },
          ],
        },
        {}, // no team, no statistics at all
      ],
      teams: [
        { homeAway: 'away', statistics: [
          { name: 'assists', displayValue: '25' },
          { name: 'totalTurnovers', displayValue: '20' },
        ] },
        { homeAway: 'home', statistics: [
          { name: 'assists', displayValue: '20' },
          { name: 'totalTurnovers', displayValue: '15' },
        ] },
      ],
    },
    injuries: [
      { injuries: [{}] }, // no team, an injury with no athlete/status/detail
      { team: { abbreviation: 'X' } }, // no injuries → filtered out
      {
        team: { abbreviation: 'Y' },
        injuries: [
          { athlete: { shortName: 'S. Only', position: { abbreviation: 'G' } }, status: 'Out', details: { type: 'Sprain' } },
          { athlete: { displayName: 'D. Player' }, details: {} },
        ],
      },
    ],
    gameInfo: { attendance: 17000, officials: [{ fullName: 'Ref One' }] }, // official via fullName
    winprobability: [{ homeWinPercentage: 0.5 }, { homeWinPercentage: null }, { homeWinPercentage: 0.6 }],
  })

  it('parses a box score full of missing fields without throwing (lines 18-56)', async () => {
    stub(edge())
    const { box } = await fetchGameSummary('g1')
    const side = box.sides.find((s) => s.name === 'Lynx')
    expect(side.abbr).toBeNull()
    // names shorter than keys → the second column falls back to its key as the label.
    expect(side.columns).toEqual([{ key: 'minutes', label: 'MIN' }, { key: 'points', label: 'points' }])
    expect(side.starters[0]).toMatchObject({ id: null, name: 'Unknown', jersey: null, pos: null })
    expect(side.starters[0].stats).toEqual({ minutes: null, points: null })
    expect(side.bench[0]).toMatchObject({ name: 'B. Bench', dnp: true })
    expect(side.bench[0].stats).toEqual({ minutes: '20', points: null })
    expect(side.totals).toEqual({ minutes: '15', points: '' })
    // The teamless/statless side collapses to empties.
    const empty = box.sides.find((s) => s.name === null)
    expect(empty).toMatchObject({ abbr: null, columns: [], totals: null })
    expect(box.hasStats).toBe(false)
  })

  it('marks the better side both ways, including a lower-better stat the away side leads (lines 107-108)', async () => {
    stub(edge())
    const { teamStats } = await fetchGameSummary('g1')
    const byLabel = Object.fromEntries(teamStats.map((r) => [r.label, r]))
    expect(byLabel['AST'].better).toBe('away') // 25 > 20 → higher wins
    expect(byLabel['TO'].better).toBe('home') // away 20 > home 15, fewer is better → home
  })

  it('parses injuries with missing team/athlete/detail fields (lines 121-126)', async () => {
    stub(edge())
    const { injuries } = await fetchGameSummary('g1')
    // The empty-injuries block is filtered; two blocks remain.
    expect(injuries.map((b) => b.abbr)).toEqual([null, 'Y'])
    expect(injuries[0].players[0]).toEqual({ name: 'Unknown', pos: null, status: null, detail: null })
    const y = injuries[1].players
    expect(y[0]).toEqual({ name: 'S. Only', pos: 'G', status: 'Out', detail: 'Sprain' })
    expect(y[1]).toEqual({ name: 'D. Player', pos: null, status: null, detail: null })
  })

  it('reads an official by fullName and filters a partial win-prob series (lines 136, 146)', async () => {
    stub(edge())
    const { info, winprob } = await fetchGameSummary('g1')
    expect(info.officials).toEqual(['Ref One'])
    expect(winprob).toEqual([0.5, 0.6]) // the null datapoint is dropped
  })

  it('returns no team-stat rows when the teams carry no statistics (lines 97, 114)', async () => {
    stub({
      boxscore: {
        players: [
          {
            team: { abbreviation: 'A' },
            statistics: [{ keys: ['points'], labels: ['PTS'], athletes: [{ starter: true, athlete: { id: '1', displayName: 'P' }, stats: ['10'] }] }],
          },
        ],
        teams: [{ homeAway: 'away' }, { homeAway: 'home' }],
      },
    })
    const { teamStats } = await fetchGameSummary('g1')
    expect(teamStats).toBeNull()
  })
})
