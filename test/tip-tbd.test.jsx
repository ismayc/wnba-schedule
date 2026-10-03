import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { splitTeamFeed } from '../scripts/fetch-schedule.mjs'
import {
  timeTbd,
  gameDayKey,
  gameTime,
  gameCountdown,
  liveState,
  whenBucket,
  isImminent,
} from '../src/utils/time.js'
import { buildIcs } from '../src/utils/ics.js'
import ScheduleView from '../src/components/ScheduleView.jsx'

// A GAME WITH NO ANNOUNCED TIP TIME.
//
// ESPN sets `timeValid: false` and ships midnight US Eastern on the day of the game as a
// stand-in for the tip. `pendingSlot` has always flagged that, but only a playoff slot
// with one side still "TBD" goes through pendingSlot — the moment the matchup is decided
// the game arrives as an ordinary game instead, and the flag was dropped. That is how the
// 11 and 14 October semifinals were committed with a bare 04:00Z tip, which Mountain time
// renders as "9:00 PM" on the EVENING BEFORE.
//
// Phoenix is the zone it was caught in: UTC-7 all year, so 04:00Z is 9pm the previous day.
const PHX = 'America/Phoenix'
const TBD = { id: '401918301', tip: '2026-10-11T04:00:00.000Z', timeTbd: true, home: 'NY', away: 'ATL' }
const REAL = { id: '401918295', tip: '2026-10-04T18:00:00.000Z', home: 'ATL', away: 'NY' }

describe('fetch-schedule: the flag survives the matchup being decided', () => {
  const side = (id, abbreviation, homeAway) => ({ homeAway, team: { id, abbreviation } })
  // The TEAM-SCHEDULE shape (what fetchSchedule reads): the season type sits on the
  // event as `seasonType.id`, not on `season.type` the way the scoreboard sends it.
  const event = (timeValid) => ({
    id: '401918301',
    date: '2026-10-11T04:00Z',
    seasonType: { id: '3' },
    competitions: [
      {
        status: { type: { name: 'STATUS_SCHEDULED', completed: false } },
        venue: { fullName: 'Barclays Center', address: { city: 'Brooklyn', state: 'NY' } },
        notes: [{ headline: 'Semifinals - Game 4' }],
        competitors: [side('9', 'NY', 'home'), side('20', 'ATL', 'away')],
        ...(timeValid === undefined ? {} : { timeValid }),
      },
    ],
  })
  const KNOWN = new Set(['NY', 'ATL'])

  it('flags a game BOTH of whose teams are known but whose time is not', () => {
    // The regression: two real franchises, so this is a game and not a pending slot.
    const { games } = splitTeamFeed([event(false)], KNOWN)
    expect(games[0].timeTbd).toBe(true)
  })

  it('leaves an ordinary game unflagged, whether or not ESPN sends the field', () => {
    for (const v of [undefined, true]) {
      const { games } = splitTeamFeed([event(v)], KNOWN)
      expect(games[0].timeTbd, `timeValid: ${v}`).toBeUndefined()
    }
  })
})

describe('the placeholder never answers a question it cannot answer', () => {
  it('belongs to the day ESPN meant, not the day its midnight lands on locally', () => {
    expect(gameDayKey(TBD, PHX)).toBe('2026-10-11')
    // What the bug did: the raw instant in Phoenix is the evening before.
    expect(gameDayKey({ ...TBD, timeTbd: false }, PHX)).toBe('2026-10-10')
  })

  it('shows no clock, and no countdown to a time nobody set', () => {
    expect(timeTbd(TBD)).toBe(true)
    expect(gameTime(TBD, PHX)).toBe('Time TBD')
    expect(gameCountdown(TBD, Date.parse('2026-10-10T20:00:00Z'))).toBeNull()
  })

  it('is not "live" at 1am and not "past" by breakfast', () => {
    // The placeholder is 00:00 ET on the 11th. Without this guard the game reads
    // likely-live at 01:00 ET and past from 02:00 ET — hours before it is played.
    for (const t of ['2026-10-11T05:00:00Z', '2026-10-11T12:00:00Z', '2026-10-11T18:00:00Z']) {
      expect(liveState(TBD, Date.parse(t)), t).toBe('upcoming')
      expect(whenBucket(TBD, Date.parse(t)), t).toBe('upcoming')
    }
  })

  it('still yields to a real score or a live feed', () => {
    // The guard must not outrank evidence that the game HAS been played.
    expect(liveState({ ...TBD, score: [88, 84] })).toBe('final')
    expect(liveState({ ...TBD, live: true })).toBe('live')
    expect(liveState({ ...TBD, postponed: true })).toBe('void')
  })

  it('never opens a live-polling window around the wrong midnight', () => {
    // isImminent fired at 23:45 ET the night before and expired by 02:00 ET.
    expect(isImminent(TBD, Date.parse('2026-10-11T03:50:00Z'))).toBe(false)
    expect(isImminent(TBD, Date.parse('2026-10-11T05:00:00Z'))).toBe(false)
  })

  it('leaves a real tip entirely alone', () => {
    expect(gameTime(REAL, PHX)).toBe('11:00 AM') // 18:00Z, as ESPN later published it
    expect(gameDayKey(REAL, PHX)).toBe('2026-10-04')
    expect(liveState(REAL, Date.parse('2026-10-04T19:00:00Z'))).toBe('likely-live')
    expect(gameCountdown(REAL, Date.parse('2026-10-04T17:00:00Z'))).toBe('1h 0m')
  })
})

describe('the calendar export', () => {
  it('writes an all-day event, not a confident midnight', () => {
    const ics = buildIcs([TBD], { now: '2026-10-03T12:00:00.000Z' })
    expect(ics).toContain('DTSTART;VALUE=DATE:20261011')
    // The failure this replaces: a timed entry that subscribers see at 9pm on the 10th.
    expect(ics).not.toContain('DTSTART:20261011T040000Z')
    // An all-day event takes no DURATION — the date is the whole of what is known.
    expect(ics).not.toMatch(/DTSTART;VALUE=DATE:20261011\r?\nDURATION/)
  })

  it('still writes a timed event for a game with a tip time', () => {
    const ics = buildIcs([REAL], { now: '2026-10-03T12:00:00.000Z' })
    expect(ics).toContain('DTSTART:20261004T180000Z')
    expect(ics).toContain('DURATION:')
  })
})

describe('the schedule list', () => {
  // ScheduleView scrolls the current day into view on mount; jsdom has no such method.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('groups the game under its own date and says the time is unknown', () => {
    render(<ScheduleView games={[TBD]} tz={PHX} showPast onOpen={() => {}} />)
    expect(screen.getByText('Time TBD')).toBeInTheDocument()
    // The day heading is rendered from the bucket key; Oct 10 would be the bug.
    const headings = document.body.textContent
    expect(headings).toMatch(/Oct(ober)? 11/)
    expect(headings).not.toMatch(/Oct(ober)? 10/)
  })
})
