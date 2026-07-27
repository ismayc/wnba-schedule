// Query-string state.
//
// There's no router — `view` is a useState string — so the URL is kept in sync by
// hand. Only non-default values are written, which keeps a shared link readable:
//
//   ?view=stats&tz=America/Chicago&team=MIN&hide=0
//
// Writes use history.replaceState so changing a filter doesn't stack up back-button
// entries.

export const DEFAULTS = {
  view: 'schedule',
  tz: null, // no default — falls back to the detected zone
  team: '',
  // Spoiler-free is on by default: this schedule is mostly played games, so the
  // default landing state shouldn't spoil a result you haven't watched yet.
  hide: true,
  mine: false,
  past: false,
}

const VALID_VIEWS = ['schedule', 'week', 'standings', 'playoffs', 'radial', 'stats']

export function readState(search = window.location.search) {
  const p = new URLSearchParams(search)
  const view = p.get('view')
  const tz = p.get('tz')

  return {
    // An unknown view in a stale link should land on the schedule, not a blank page.
    view: VALID_VIEWS.includes(view) ? view : DEFAULTS.view,
    // Validated against the platform rather than a hard-coded list, so any IANA zone
    // in a shared link works.
    tz: isValidZone(tz) ? tz : null,
    team: p.get('team') || DEFAULTS.team,
    // A one-shot deep link (the family hub sends these): open straight onto this
    // game's detail. Read-only — writeState never emits it, so the first state
    // write returns the URL to plain shareable filter state.
    game: p.get('game') || '',
    hide: p.has('hide') ? p.get('hide') === '1' : DEFAULTS.hide,
    // Whether the link explicitly carried a spoiler-free choice — lets the app tell a
    // shared "hide=0" from an absent param, so a saved preference only applies when the
    // link says nothing.
    hideExplicit: p.has('hide'),
    mine: p.get('mine') === '1',
    past: p.get('past') === '1',
    // Like hideExplicit: whether the link carried a past-days choice, so a saved
    // preference only applies when the link says nothing.
    pastExplicit: p.has('past'),
  }
}

export function isValidZone(tz) {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function toSearch(state, detectedTz) {
  const p = new URLSearchParams()
  if (state.view && state.view !== DEFAULTS.view) p.set('view', state.view)
  // Only pin the timezone when it differs from what this device would pick anyway,
  // so a link shared between two people in the same zone stays clean.
  if (state.tz && state.tz !== detectedTz) p.set('tz', state.tz)
  if (state.team) p.set('team', state.team)
  // Spoiler-free defaults to on, so it's *turning it off* that has to travel in the
  // link — otherwise a sender who chose to see scores would share a hidden board.
  if (state.hide === false) p.set('hide', '0')
  if (state.mine) p.set('mine', '1')
  if (state.past) p.set('past', '1')
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function writeState(state, detectedTz) {
  if (typeof window === 'undefined') return
  const next = `${window.location.pathname}${toSearch(state, detectedTz)}${window.location.hash}`
  window.history.replaceState(null, '', next)
}
