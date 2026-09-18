// The FROZEN stand-in for src/data/schedule.js. Under vitest every import of the live
// module resolves here instead; see the frozenData plugin in vite.config.js.
//
// The board itself is test/fixtures/season-2026.js (September 4, 2026: 298 games played,
// 35 to come), re-exported under the live module's name. The constants below are copied
// from the live module, and test/live/parity.live.test.js fails if they ever differ or if
// the live module grows an export this file lacks.
export { GAMES_2026 as GAMES } from '../season-2026.js'

export const SEASON_TYPES = ['regular', 'allstar', 'playoffs']

export const PLAYOFF_ROUNDS = { R1: 'First Round', SF: 'Semifinals', Final: 'WNBA Finals' }

// Best-of length per round, for series progress rendering.
export const SERIES_LENGTH = { R1: 3, SF: 5, Final: 7 }
