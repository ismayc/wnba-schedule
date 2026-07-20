import { describe, it, expect } from 'vitest'
import { detectEvents, eventKey } from '../src/services/alerts.js'

const g = (over = {}) => ({
  id: 'g1',
  home: 'MIN',
  away: 'SEA',
  seasonType: 'regular',
  tip: '2026-07-20T23:00:00.000Z',
  ...over,
})

const kinds = (evts) => evts.map((e) => e.kind)

describe('detectEvents', () => {
  it('reports nothing on first load, when there is no previous snapshot', () => {
    // Otherwise every in-progress game would announce itself on page open.
    expect(detectEvents(null, [g({ live: true, score: [50, 40], period: 3 })])).toEqual([])
  })

  it('reports nothing when nothing changed', () => {
    const snap = [g({ live: true, score: [50, 40], period: 3 })]
    expect(detectEvents(snap, snap)).toEqual([])
  })

  it('detects a tipoff', () => {
    const before = [g({ live: false })]
    const after = [g({ live: true, score: [2, 0], period: 1 })]
    expect(kinds(detectEvents(before, after))).toEqual(['tipoff'])
  })

  it('detects a final', () => {
    const before = [g({ live: true, score: [88, 86], period: 4 })]
    const after = [g({ live: false, score: [90, 86] })]
    const [e] = detectEvents(before, after)
    expect(e.kind).toBe('final')
    expect(e.leader).toBe('MIN')
  })

  it('detects a lead change', () => {
    const before = [g({ live: true, score: [50, 48], period: 3 })]
    const after = [g({ live: true, score: [50, 52], period: 3 })]
    const [e] = detectEvents(before, after)
    expect(e.kind).toBe('lead-change')
    expect(e.leader).toBe('SEA')
  })

  it('does not treat a tie, or coming out of one, as a lead change', () => {
    const led = g({ live: true, score: [50, 48], period: 3 })
    const tied = g({ live: true, score: [50, 50], period: 3 })
    // Falling into a tie is not a lead change...
    expect(detectEvents([led], [tied])).toEqual([])
    // ...nor is breaking one by the team that was already ahead.
    expect(kinds(detectEvents([tied], [g({ live: true, score: [52, 50], period: 3 })]))).toEqual([])
  })

  it('does not fire on an ordinary basket', () => {
    // The whole point: scoring is not itself notable.
    const before = [g({ live: true, score: [50, 40], period: 3 })]
    const after = [g({ live: true, score: [52, 40], period: 3 })]
    expect(detectEvents(before, after)).toEqual([])
  })

  describe('nailbiters', () => {
    it('fires on entering a close fourth quarter', () => {
      const before = [g({ live: true, score: [70, 60], period: 3 })]
      const after = [g({ live: true, score: [80, 78], period: 4 })]
      expect(kinds(detectEvents(before, after))).toEqual(['nailbiter'])
    })

    it('fires once, not on every poll while it holds', () => {
      const close = g({ live: true, score: [80, 78], period: 4 })
      const stillClose = g({ live: true, score: [82, 80], period: 4 })
      expect(detectEvents([close], [stillClose])).toEqual([])
    })

    it('ignores a close margin before the fourth quarter', () => {
      const before = [g({ live: true, score: [40, 39], period: 2 })]
      const after = [g({ live: true, score: [42, 41], period: 3 })]
      expect(detectEvents(before, after)).toEqual([])
    })

    it('ignores a blowout in the fourth', () => {
      const before = [g({ live: true, score: [70, 50], period: 3 })]
      const after = [g({ live: true, score: [90, 60], period: 4 })]
      expect(detectEvents(before, after)).toEqual([])
    })
  })

  it('collapses a buzzer-beater into a single final, not three events', () => {
    // Lead flips AND the game ends AND it was close — one moment.
    const before = [g({ live: true, score: [88, 89], period: 4 })]
    const after = [g({ live: false, score: [90, 89] })]
    expect(kinds(detectEvents(before, after))).toEqual(['final'])
  })

  it('skips postponed and cancelled games', () => {
    const before = [g({ live: true, score: [50, 48], period: 3 })]
    const after = [g({ live: true, score: [50, 52], period: 3, postponed: true })]
    expect(detectEvents(before, after)).toEqual([])
  })

  it('ignores games absent from the previous snapshot', () => {
    expect(detectEvents([], [g({ live: true, score: [2, 0] })])).toEqual([])
  })

  describe('following', () => {
    const before = [
      g({ id: 'a', home: 'MIN', away: 'SEA', live: true, score: [50, 48], period: 3 }),
      g({ id: 'b', home: 'NY', away: 'ATL', live: true, score: [50, 48], period: 3 }),
    ]
    const after = [
      g({ id: 'a', home: 'MIN', away: 'SEA', live: true, score: [50, 52], period: 3 }),
      g({ id: 'b', home: 'NY', away: 'ATL', live: true, score: [50, 52], period: 3 }),
    ]

    it('reports every game when not filtering', () => {
      expect(detectEvents(before, after)).toHaveLength(2)
    })

    it('reports only followed teams when filtering', () => {
      const evts = detectEvents(before, after, { teams: new Set(['NY']) })
      expect(evts).toHaveLength(1)
      expect(evts[0].id).toBe('b')
    })

    it('matches a followed team on either side of the game', () => {
      expect(detectEvents(before, after, { teams: new Set(['SEA']) })).toHaveLength(1)
    })
  })
})

describe('eventKey', () => {
  it('is stable for the same moment', () => {
    const e = { id: 'g1', kind: 'lead-change', leader: 'SEA' }
    expect(eventKey(e)).toBe(eventKey({ ...e }))
  })

  it('distinguishes successive lead changes in the same game', () => {
    expect(eventKey({ id: 'g1', kind: 'lead-change', leader: 'SEA' })).not.toBe(
      eventKey({ id: 'g1', kind: 'lead-change', leader: 'MIN' })
    )
  })

  it('distinguishes kinds within one game', () => {
    expect(eventKey({ id: 'g1', kind: 'final' })).not.toBe(eventKey({ id: 'g1', kind: 'tipoff' }))
  })
})
