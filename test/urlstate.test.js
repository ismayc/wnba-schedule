import { describe, it, expect } from 'vitest'
import { readState, toSearch, isValidZone, DEFAULTS } from '../src/utils/urlState.js'

describe('readState', () => {
  it('falls back to defaults on an empty query', () => {
    expect(readState('')).toEqual({
      view: 'schedule',
      tz: null,
      team: '',
      hide: false,
      hideExplicit: false,
      mine: false,
      past: false,
    })
  })

  it('reads every supported key', () => {
    expect(readState('?view=stats&tz=America/Chicago&team=MIN&hide=1&mine=1&past=1')).toEqual({
      view: 'stats',
      tz: 'America/Chicago',
      team: 'MIN',
      hide: true,
      hideExplicit: true,
      mine: true,
      past: true,
    })
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

describe('toSearch', () => {
  const detected = 'America/New_York'

  it('writes nothing when everything is default', () => {
    expect(toSearch({ view: 'schedule', tz: detected, team: '', hide: false }, detected)).toBe('')
  })

  it('omits the timezone when it matches the viewer’s own zone', () => {
    // Keeps a link shared between two people in the same zone clean.
    expect(toSearch({ view: 'stats', tz: detected }, detected)).toBe('?view=stats')
  })

  it('pins the timezone when it differs', () => {
    expect(toSearch({ view: 'schedule', tz: 'Europe/London' }, detected)).toBe('?tz=Europe%2FLondon')
  })

  it('round-trips through readState', () => {
    const state = {
      view: 'playoffs',
      tz: 'Europe/London',
      team: 'LV',
      hide: true,
      mine: true,
      past: true,
    }
    // readState also reports whether hide was explicit; toSearch wrote it, so it is.
    expect(readState(toSearch(state, detected))).toEqual({ ...state, hideExplicit: true })
  })
})
