// The single source of this league's identity, vocabulary, and display rules.
//
// Everything a component or util would otherwise hardcode inline lives here: the ESPN
// paths, the storage prefix, the period vocabulary, the live-overlay window, the .ics
// identity, the deploy host, the locale. The pattern comes from the-nfl-schedule, which
// was the only sibling that had it; see that repo's src/config/league.js.
//
// Two rules this file is written to:
//
//   1. Every field below has a real consumer in src/. A field only a config reader
//      touches is a shallow module pretending to be a seam, and the NFL original grew
//      seven of them (season, themeColor, gameNoun, periodNoun, kickoffLabel,
//      weekStartsMonday, standingsModel had no callers at all). The exceptions are
//      marked: `title`, `tagline` and `themeColor` are consumed by
//      test/chrome-identity.test.js, because index.html and the manifest are static
//      files no module can import, and a test is the only thing that can hold them to
//      this file.
//
//   2. Structure stays out. Conference membership, the playoff bracket, the seeding
//      chain and the tiebreakers live in src/utils/standings.js, src/utils/bracket.js
//      and the generated src/data/. This file owns facts, not rules.
//
// Field set is per-repo on purpose. The March Madness siblings carry `periodLabels`
// because they name periods with ordinals; this league numbers them, so it carries
// `periodShort` instead. There is no shared schema across the family yet, and there
// should not be one until enough real configs exist to derive it from.
import { SEASON } from '../data/teams.js'

export const LEAGUE = {
  id: 'wnba',
  name: 'WNBA',
  // `title` + `tagline` are the two halves of index.html's <title>.
  title: 'The WNBA Schedule',
  tagline: 'every game in your timezone',
  season: SEASON,
  // site.web.api /apis/site/v2/sports/<espnPath>/… and /apis/common/v3/sports/<espnPath>/…
  espnPath: 'basketball/wnba',
  // sports.core.api /v2/sports/<coreLeaguePath>/… is spelled differently: it puts the
  // league under a `leagues/` segment. Two fields rather than one derived from the
  // other, because deriving would couple two URL grammars that ESPN changes separately.
  coreLeaguePath: 'basketball/leagues/wnba',
  storageKey: 'wnba', // 'wnba:theme', 'wnba:followed', 'wnba:alerts', …
  // UI chrome only. Matches --bg in index.css, <meta name="theme-color">, and the
  // manifest's theme_color and background_color.
  themeColor: '#15171b',

  // ── Vocabulary ──────────────────────────────────────────────────────────────
  periodNoun: 'quarter',
  periodShort: 'Q', // Q1…Q4
  regulationPeriods: 4,
  overtimeLabel: 'OT',
  homeAwaySep: '@',
  tipoffLabel: 'Tipoff',
  // "Close finish" threshold. Five points is the NBA's own clutch-time definition and
  // the convention the basketball siblings follow; the NFL uses 8, one score in football.
  closeMargin: 5,

  // ── Time ────────────────────────────────────────────────────────────────────
  locale: 'en-US',
  // The window in which a game with no live feed should still count as possibly in
  // progress. Getting this wrong leaves a finished game showing "live".
  gameLengthMs: 2.25 * 60 * 60 * 1000,

  // ── Calendar export ─────────────────────────────────────────────────────────
  // `domain` is the repo slug, but `filenameBase` is deliberately the short league
  // name: a subscriber sees the download, not the repo.
  ics: {
    durationIso: 'PT2H30M',
    prodId: '-//the-wnba-schedule//EN',
    domain: 'the-wnba-schedule',
    filenameBase: 'wnba',
  },

  // Netlify serves /calendar.ics; GitHub Pages cannot run the function.
  feedHost: 'https://the-wnba-schedule.netlify.app',
}

export { SEASON }
