import { describe, it, expect } from 'vitest'
import { watchableServices } from '../src/utils/watch.js'

const labels = (b) => watchableServices(b).map((s) => s.label)

describe('watchableServices', () => {
  it('matches national networks YouTube TV carries', () => {
    expect(labels(['ESPN'])).toEqual(['YouTube TV'])
    expect(labels(['ION'])).toEqual(['YouTube TV'])
    expect(labels(['CBS', 'Paramount+'])).toEqual(['YouTube TV'])
  })

  it('matches Peacock and national Prime Video by exact name', () => {
    expect(labels(['Peacock'])).toEqual(['Peacock'])
    expect(labels(['Prime Video'])).toEqual(['Prime Video'])
  })

  it('lists every subscribed service that carries the game, in order', () => {
    // NBC + Peacock simulcasts are watchable both ways.
    expect(labels(['NBC', 'Peacock'])).toEqual(['YouTube TV', 'Peacock'])
  })

  it('excludes regional feeds that need an in-market add-on', () => {
    expect(labels(['Prime Video-Seattle'])).toEqual([])
    expect(labels(['NBC Sports BO'])).toEqual([]) // regional NBC Sports, not national NBC
  })

  it('excludes services the owner does not subscribe to', () => {
    expect(labels(['WNBA League Pass', 'TSN'])).toEqual([])
    expect(labels(['Disney+'])).toEqual([]) // streaming, not a YouTube TV linear channel
  })

  it('returns [] for missing or empty broadcast', () => {
    expect(watchableServices(undefined)).toEqual([])
    expect(watchableServices([])).toEqual([])
  })
})
