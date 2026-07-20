import { describe, it, expect } from 'vitest'
import { watchableServices, SERVICE_CATALOG, SERVICE_BY_KEY } from '../src/utils/watch.js'

const labels = (b, keys) => watchableServices(b, keys).map((s) => s.label)

describe('watchableServices', () => {
  it('matches a live-TV bundle via the national networks it carries', () => {
    expect(labels(['ESPN'], ['youtubetv'])).toEqual(['YouTube TV'])
    expect(labels(['ION'], ['youtubetv'])).toEqual(['YouTube TV'])
  })

  it('matches streaming exclusives by name', () => {
    expect(labels(['Peacock'], ['peacock'])).toEqual(['Peacock'])
    expect(labels(['Prime Video'], ['prime'])).toEqual(['Prime Video'])
    expect(labels(['Paramount+', 'CBS'], ['paramount'])).toEqual(['Paramount+'])
  })

  it('only reports services the viewer has selected', () => {
    // The game is on ESPN, but the viewer only has Peacock.
    expect(labels(['ESPN'], ['peacock'])).toEqual([])
    // Selecting YouTube TV surfaces it.
    expect(labels(['ESPN'], ['peacock', 'youtubetv'])).toEqual(['YouTube TV'])
  })

  it('lists every selected service that carries the game, in catalog order', () => {
    // NBC + Peacock simulcast, viewer has both a bundle and Peacock.
    expect(labels(['NBC', 'Peacock'], ['youtubetv', 'peacock'])).toEqual(['Peacock', 'YouTube TV'])
  })

  it('bundle carriage differs — Sling has no ABC-only game, Fubo does', () => {
    expect(labels(['ABC'], ['sling'])).toEqual([])
    expect(labels(['ABC'], ['fubo'])).toEqual(['Fubo'])
  })

  it('excludes regional feeds that need an in-market add-on', () => {
    expect(labels(['Prime Video-Seattle'], ['prime'])).toEqual([])
    expect(labels(['NBC Sports BO'], ['youtubetv', 'cable'])).toEqual([])
  })

  it('returns [] with no selection or no broadcast', () => {
    expect(watchableServices(['ESPN'], [])).toEqual([])
    expect(watchableServices(['ESPN'], undefined)).toEqual([])
    expect(watchableServices(undefined, ['youtubetv'])).toEqual([])
    expect(watchableServices([], ['youtubetv'])).toEqual([])
  })

  it('exposes a catalog keyed for lookup', () => {
    expect(SERVICE_CATALOG.length).toBeGreaterThanOrEqual(10)
    expect(SERVICE_BY_KEY.youtubetv.label).toBe('YouTube TV')
    expect(SERVICE_BY_KEY.peacock.kind).toBe('stream')
    expect(SERVICE_BY_KEY.youtubetv.kind).toBe('bundle')
  })
})
