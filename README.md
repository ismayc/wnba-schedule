# The WNBA Schedule

[![CI](https://github.com/ismayc/wnba-schedule/actions/workflows/ci.yml/badge.svg)](https://github.com/ismayc/wnba-schedule/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://the-wnba-schedule.netlify.app/coverage.json)](https://github.com/ismayc/wnba-schedule/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Live:** [the-wnba-schedule.netlify.app](https://the-wnba-schedule.netlify.app) ·
[ismayc.github.io/wnba-schedule](https://ismayc.github.io/wnba-schedule/)

An unofficial viewer for the WNBA season: every game in your timezone, live scores,
standings, the playoff bracket, and league leaders.

No backend, no API keys, no tracking. The whole app is a static bundle plus a committed
snapshot of the season.

---

## Views

| View | What it does |
|---|---|
| 📋 **Schedule** | Every game grouped by the calendar day *you* see, opening on today — previous days are hidden behind a toggle. Filter by team or by the teams you follow. |
| 📆 **Week** | A Sun–Sat grid you can page through, collapsing to a two-column agenda on a phone. |
| 📊 **Regular Season** | League seeding with the playoff cutline, or conference tables. W/L, PCT, GB, home/road splits, last-10, streak, net rating. |
| 🏆 **Playoffs** | The bracket, where each slot is a best-of series. Projected from current standings until the real field is set. |
| 🎯 **Radial** | The same bracket as concentric rings — seeds outside, the title in the middle. |
| 📈 **Stats** | Season totals, league leaders across 8 categories, scoring margin, and the playoff race with magic numbers. |

Clicking any team opens a **team panel** — splits, form, leading scorers, and what's
next. Plus: light/dark themes, spoiler-free mode, shareable URLs, live alerts for
notable moments, a game-detail modal with a quarter line score and season series,
`.ics` calendar export (whole season or one team's), and installable-PWA support.

## Data

Everything comes from ESPN's public, keyless, CORS-open feeds.

**The season is committed, not fetched.** `scripts/fetch-schedule.mjs` generates
`src/data/schedule.js`, `src/data/teams.js`, and `src/data/leaders.js`, and mirrors team
logos into `public/logos/`. The app therefore renders a complete season — including
every result so far — with **zero requests on load**. At runtime, ESPN's scoreboard is
polled only to overlay games that are live or just finished (every 30s while a game is
in progress, 2 min otherwise, never once the season ends).

That snapshot is refreshed twice daily by `.github/workflows/refresh-data.yml`, which
regenerates the data, runs the test suite against it, and opens a PR. Standings are
*derived* from the committed scores, so a bad refresh surfaces as a failing test rather
than a quietly wrong table.

### Three feed quirks worth knowing

These are the difference between "looks about right" and matching the official
standings exactly:

1. **The Commissioner's Cup Championship is not a regular-season game.** It appears in
   the schedule feed like any other, but doesn't count toward the standings. It's
   reclassified as `seasonType: 'cup'` and excluded.
2. **A postponed game appears twice** — the original slot *and* its makeup date, both
   live in the feed. The dead one is flagged and skipped.
3. **Broadcast data has two shapes.** The team-schedule feed uses `media.shortName`;
   the scoreboard uses `names[]`. Both are accepted.

With those handled, derived W-L, home/road splits, last-10, and streaks match ESPN's
published standings exactly for all 15 teams.

### Scoring frequency: why there are no per-basket events

The biggest structural difference from a soccer viewer. Goals are rare enough to
enumerate as events — scorer, minute, penalty — and a Golden Boot table can be *derived*
from them. Basketball can't work that way: ~65 scoring plays per game, ~20,000 per
season.

So the model inverts. Games store a final score, and player leaderboards come from
**pre-aggregated season stat lines** rather than being summed from events. Two things
fill the gap that losing the event stream would otherwise leave:

- **Quarter line scores** are the analogue of a goal timeline. A final score of 98–93
  hides whether a team led by 20 or trailed all night; the quarter breakdown shows it,
  with the higher scorer of each quarter marked. Committed for every played game, and
  every one is asserted to sum to its final score.
- **Per-game leaders** (points/rebounds/assists) answer "who did it" without an event
  list.

Frequency also changes the *live* display. A soccer app can show a goal the moment it
lands and be right for the next ten minutes; a basketball score is stale within seconds.
So the live badge shows the **period** (`Q3`, `HALF`, `OT`) rather than a running game
clock, which would imply a precision a 30-second poll can't deliver. The exact feed
status stays in the tooltip.

And it rules out goal-style alerts. One notification per basket would fire ~65 times a
game. The 🔔 toggle instead surfaces the moments that change how a game *feels* —
tipoff, a lead change, a one-possession fourth quarter, and the final — detected by
diffing poll snapshots, so no play-by-play feed is needed. A close fourth quarter
alerts once on entering that state, not every 30 seconds while it holds, and a
buzzer-beater that both flips the lead and ends the game is reported as one moment
rather than three.

### Format notes

The WNBA is not a group-stage tournament, and two details drive most of the app's logic:

- **Seeding is league-wide 1–8, not by conference.** Conference is presentational.
- **A playoff slot is a series, not a game** — best-of-3, then best-of-5, then
  best-of-7 — and the bracket is *fixed*: semifinal pairings don't re-seed.

## Develop

```bash
npm install
npm run dev              # local dev server
npm test                 # unit + render tests
npm run build            # production bundle
npm run coverage:badge   # tests with coverage, writes public/coverage.json

npm run fetch:schedule   # regenerate committed data from ESPN
npm run check:schedule   # report drift between committed data and the live feed
npm run verify:live      # check the live overlay's assumptions against a game in progress
```

`scripts/` uses **Node built-ins only** — no imports from `node_modules` — so CI can run
the data jobs on a bare checkout with no install step. A CI job enforces this.

### Testing approach

The suite leans on real data rather than hand-made fixtures, because real data contains
the edge cases you wouldn't think to invent.

- **Standings** are checked against the actual 2026 season, and the numbers are
  independently verifiable against ESPN's published standings.
- **The bracket** is tested against the complete 2025 postseason
  (`test/fixtures/playoffs-2025.js`) — 24 games, 7 series — because the 2026 bracket
  doesn't exist until September. It reproduces the real outcome: Las Vegas over Phoenix
  4–0. That fixture caught two bugs a synthetic test would have reproduced my own
  assumptions right past.
- **Format invariants** that would otherwise depend on this week's results (like
  "seeding ignores conference") are tested with synthetic data instead, so they don't
  break when the standings shift.

One gap the suite structurally cannot close: the live overlay's field mapping was
inferred from completed and scheduled games, and the tests mock ESPN using the same
inferences — so they agree with the assumption by construction. `npm run verify:live`,
run while a game is actually in progress, is the only check that compares those
assumptions to reality.

## Deploy

Built with `base: './'`, so the same `dist/` works at a domain root (Netlify) and under
a subpath (GitHub Pages `/wnba-schedule/`) with no separate build.

- **GitHub Pages** deploys automatically from `ci.yml` on every push to `main`, gated on
  tests passing.
- **Netlify** deploys from the same workflow, but only once `NETLIFY_AUTH_TOKEN` is set
  as a repository secret (`NETLIFY_SITE_ID` is already stored as a repo variable). Until
  then that step is skipped and Netlify can be updated with
  `npx netlify-cli deploy --prod --dir dist`.

## Credits

Created by [Chester Ismay](https://chester.rbind.io). Source on
[GitHub](https://github.com/ismayc/wnba-schedule).

Unofficial fan project. Not affiliated with, endorsed by, or sponsored by the WNBA.
Team names and logos are trademarks of their respective owners. Schedule, results, and
player data via ESPN's public feeds.

MIT licensed.
