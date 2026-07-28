import { describe, it, expect } from 'vitest'
import { readState, toSearch, isValidZone, DEFAULTS } from '../src/utils/urlState.js'

describe('readState', () => {
  it('falls back to defaults on an empty query', () => {
    expect(readState('')).toEqual({
      view: 'schedule',
      tz: null,
      team: '',
      game: '',
      // Spoiler-free is the default, so an empty query hides scores.
      hide: true,
      hideExplicit: false,
      mine: false,
      past: false,
      pastExplicit: false,
      season: null,
    })
  })

  it('reads every supported key', () => {
    expect(
      readState(
        '?view=stats&tz=America/Chicago&team=MIN&game=401857072&hide=1&mine=1&past=1&season=2023'
      )
    ).toEqual({
      view: 'stats',
      tz: 'America/Chicago',
      team: 'MIN',
      game: '401857072',
      hide: true,
      hideExplicit: true,
      mine: true,
      past: true,
      pastExplicit: true,
      season: 2023,
    })
  })

  it('honours an explicit hide=0 from a sender who wanted scores shown', () => {
    const s = readState('?hide=0')
    expect(s.hide).toBe(false)
    expect(s.hideExplicit).toBe(true)
  })

  it('ignores an unknown view rather than rendering a blank page', () => {
    expect(readState('?view=nope').view).toBe(DEFAULTS.view)
  })

  it('rejects a bogus timezone so a bad link cannot crash formatting', () => {
    expect(readState('?tz=Mars/Olympus').tz).toBeNull()
  })

  it('accepts any real IANA zone, not just the ones in the picker', () => {
    expect(readState('?tz=Pacific/Auckland').tz).toBe('Pacific/Auckland')
  })
})

describe('isValidZone', () => {
  it('accepts real zones and rejects junk', () => {
    expect(isValidZone('Europe/London')).toBe(true)
    expect(isValidZone('UTC')).toBe(true)
    expect(isValidZone('Not/AZone')).toBe(false)
    expect(isValidZone(null)).toBe(false)
  })
})

describe('the history view and its season', () => {
  it('accepts the history view', () => {
    expect(readState('?view=history').view).toBe('history')
  })

  it('ignores a season that is not a four-digit year', () => {
    expect(readState('?season=nope').season).toBeNull()
    expect(readState('?season=23').season).toBeNull()
  })
})

describe('toSearch', () => {
  const detected = 'America/New_York'

  it('writes nothing when everything is default', () => {
    expect(toSearch({ view: 'schedule', tz: detected, team: '', hide: true }, detected)).toBe('')
  })

  it('omits the timezone when it matches the viewer’s own zone', () => {
    // Keeps a link shared between two people in the same zone clean.
    expect(toSearch({ view: 'stats', tz: detected, hide: true }, detected)).toBe('?view=stats')
  })

  it('pins the timezone when it differs', () => {
    expect(toSearch({ view: 'schedule', tz: 'Europe/London', hide: true }, detected)).toBe(
      '?tz=Europe%2FLondon',
    )
  })

  it('writes hide=0 when the sender chose to see scores', () => {
    // Spoiler-free is the default, so it's the opt-out that has to travel in the link.
    expect(toSearch({ view: 'schedule', tz: detected, hide: false }, detected)).toBe('?hide=0')
  })

  it('round-trips through readState', () => {
    const state = {
      view: 'history',
      tz: 'Europe/London',
      team: 'LV',
      hide: false,
      mine: true,
      past: true,
      season: 2022,
    }
    // readState also reports whether hide/past were explicit; toSearch wrote them, so both are.
    expect(readState(toSearch(state, detected))).toEqual({
      ...state,
      game: '',
      hideExplicit: true,
      pastExplicit: true,
    })
  })
})
