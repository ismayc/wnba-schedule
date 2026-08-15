import { describe, it, expect } from 'vitest'
import {
  watchableServices,
  broadcastNotBadged,
  localChannelCatalog,
  SERVICE_CATALOG,
  SERVICE_BY_KEY,
  LOCAL_CATALOG,
} from '../src/utils/watch.js'

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

  it('lists ALL of a viewer’s many services that carry the game — never capped', () => {
    // A viewer with more services than average, on a nationally-televised (ESPN) game:
    // every bundle/service that carries ESPN is returned, not a truncated subset.
    expect(labels(['ESPN'], ['youtubetv', 'hulu', 'sling', 'cable', 'disney'])).toEqual([
      'Disney+ / ESPN+',
      'YouTube TV',
      'Hulu + Live TV',
      'Sling TV',
      'Cable / Satellite',
    ])
  })

  it('bundle carriage differs — Sling has no ABC-only game, Fubo does', () => {
    expect(labels(['ABC'], ['sling'])).toEqual([])
    expect(labels(['ABC'], ['fubo'])).toEqual(['Fubo'])
  })

  it('never folds a regional feed into a national service or bundle', () => {
    expect(labels(['Prime Video-Seattle'], ['prime'])).toEqual([])
    expect(labels(['NBC Sports BO'], ['youtubetv', 'cable'])).toEqual([])
  })

  it('matches a local channel only when the viewer has opted into it', () => {
    // Data-independent: whatever local feed the current schedule names first.
    const local = LOCAL_CATALOG[0]
    expect(labels([local.label], [local.key])).toEqual([local.label])
    expect(labels([local.label], ['youtubetv', 'cable'])).toEqual([])
    // A selected local channel never matches a game it isn't airing.
    expect(labels(['ESPN'], [local.key])).toEqual([])
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

describe('localChannelCatalog', () => {
  const g = (home, away, ...broadcast) => ({ home, away, broadcast })

  it('collects the distinct non-national feeds as picker entries, attributed to their team', () => {
    const cat = localChannelCatalog([
      g('POR', 'SEA', 'ESPN', 'Fox 12 Plus'),
      g('LV', 'POR', 'KOMO-TV', 'Fox 12 Plus'), // duplicate feed collapses; POR survives the intersection
      g('NY', 'ATL', 'Peacock', 'NBCSN'), // all national/stream names — contributes nothing
      { id: 'nobroadcast', home: 'MIN', away: 'PHX' }, // games without a broadcast list are tolerated
    ])
    // Fox 12 Plus appears in two games whose only common team is POR. KOMO-TV
    // appears once, leaving BOTH that game's teams as candidates — no single team,
    // so it's unattributed and sorts after the attributed entry.
    expect(cat.map((c) => [c.label, c.team])).toEqual([
      ['Fox 12 Plus', 'POR'],
      ['KOMO-TV', null],
    ])
    expect(cat[0]).toMatchObject({ key: 'local:Fox 12 Plus', kind: 'local' })
    expect(cat[0].match(['Fox 12 Plus'])).toBe(true)
    expect(cat[0].match(['ESPN'])).toBe(false)
  })

  it('attributes a feed seen in one game to a single team only via more games', () => {
    // Two SEA games from different opponents pin KOMO-TV to SEA.
    const cat = localChannelCatalog([g('SEA', 'LV', 'KOMO-TV'), g('POR', 'SEA', 'KOMO-TV')])
    expect(cat).toHaveLength(1)
    expect(cat[0].team).toBe('SEA')
  })

  it('sorts unattributed feeds after attributed ones, alphabetically among themselves', () => {
    const cat = localChannelCatalog([
      g('SEA', 'LV', 'KOMO-TV'),
      g('POR', 'SEA', 'KOMO-TV'), // pinned to SEA
      g('NY', 'CON', 'Zed TV'), // one game each → unattributed
      g('ATL', 'IND', 'Alpha TV'),
    ])
    expect(cat.map((c) => c.label)).toEqual(['KOMO-TV', 'Alpha TV', 'Zed TV'])
  })

  it('returns an empty catalog when every feed is national (the section then hides)', () => {
    expect(localChannelCatalog([g('NY', 'CON', 'ESPN'), g('NY', 'CON', 'CBS', 'Paramount+')])).toEqual([])
  })

  it('derives a real, well-formed catalog from the committed schedule', () => {
    // The WNBA slate always names market feeds; if this ever drops to zero the data
    // (or the national-name set) deserves a human look.
    expect(LOCAL_CATALOG.length).toBeGreaterThan(0)
    for (const c of LOCAL_CATALOG) {
      expect(c.key).toBe(`local:${c.label}`)
      expect(c.kind).toBe('local')
    }
    // National names never leak into the local picker.
    const labels = new Set(LOCAL_CATALOG.map((c) => c.label))
    for (const n of ['ESPN', 'ABC', 'CBS', 'NBC', 'ION', 'NBCSN', 'Peacock', 'WNBA League Pass'])
      expect(labels.has(n)).toBe(false)
  })
})

describe('broadcastNotBadged', () => {
  const svc = (label) => ({ label })

  it('drops a network already shown as a badge but keeps the rest', () => {
    expect(broadcastNotBadged(['NBC', 'Peacock'], [svc('Peacock')])).toEqual(['NBC'])
    expect(broadcastNotBadged(['Prime Video'], [svc('Prime Video')])).toEqual([])
  })

  it('leaves a bundle badge’s underlying network in place (YouTube TV ≠ ESPN)', () => {
    expect(broadcastNotBadged(['ESPN'], [svc('YouTube TV')])).toEqual(['ESPN'])
  })

  it('returns the whole list when nothing is badged', () => {
    expect(broadcastNotBadged(['ESPN', 'ABC'], [])).toEqual(['ESPN', 'ABC'])
    expect(broadcastNotBadged(undefined, [])).toEqual([])
  })
})
