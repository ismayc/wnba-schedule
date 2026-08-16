# NEWS

A dated changelog for The WNBA Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-16

- **The data refresh is unblocked.** Every run since yesterday evening had failed
  with `HTTP 403`, leaving the site a day stale mid-season. The cause was not the
  runner's IP, as first assumed, but the *host*: ESPN's edge blocks
  `site.api.espn.com` for requests from datacenter IPs, so an unattended refresh
  403s while the same URL answers fine from a home connection. Its sibling
  `site.web.api.espn.com` serves the identical `apis/site/v2` routes with no such
  block — verified payload-for-payload on every route the refresh calls — so the
  data scripts now fetch from there. The two missed games from 08-15 are back in,
  with line scores and leaders.
- The app itself is unchanged; only the build-time scripts moved host. The live
  in-page score overlay was never affected, because it runs from your own browser
  rather than a datacenter.

- **The new-season watch can no longer report success while it fails.** Its check
  step piped the script through `tee`, and the exit status of a pipe is the last
  command's — `tee` always succeeds — so when the script crashed the run still went
  green, the outputs came back empty, and every step behind them skipped quietly.
  Today's outage was hiding there. The step now runs under `pipefail`.

## 2026-08-15

- **My services now covers local & regional channels.** A game on a market feed
  (Fox 12 Plus, KOMO-TV, MNMT, an RSN) could never count as watchable: only
  national networks were matched, because carriage of a local station depends on
  where you live. The picker now has a collapsible "Local & regional channels"
  shelf listing all 26 feeds this season's games name, grouped by the team each
  one follows, so you check the ones your own provider actually carries. They
  then drive the 📺 badge and the "On my services" filter exactly like a national
  service. In Portland, adding Fox 12 Plus takes the Fire from 20 of 44 games
  watchable on YouTube TV alone to 43 of 44.
- The shelf is built from the committed schedule rather than a hand-kept list, so
  a feed ESPN starts (or stops) naming appears (or disappears) on the next data
  refresh, and a saved pick for a vanished channel is dropped on load.

## 2026-08-14

- **A New season watch now guards the rollover.** Ported from nba-schedule
  after its 2026-27 release: a daily workflow asks ESPN whether the NEXT
  season (committed season + 1) has been published; the day it lands it files
  a one-time issue and drafts the mechanical half of the rollover as a draft
  PR. The detector was re-derived for this league and verified against the
  live scoreboard (the current season detects as complete; the next reports
  not-yet). The season-<label> branch it creates must never be deleted — its
  existence is the once-per-season guard.

- **The default schedule now folds the far future behind "Later games".** With a
  freshly-rolled-over season nothing is in the past, so the default view renders
  the entire upcoming season on load — heavy on a phone, and slow enough to time
  out CI's app tests on the NBA sibling. It now shows the last week of results
  plus the next fortnight of game-days, with the rest behind a "Later games"
  toggle that mirrors "Earlier games" (count badge included). Counted in
  game-days, so a pre-season landing shows the fortnight around opening day
  rather than an empty window (ported from nba-schedule).

- **A PR branch can no longer cancel main's CI or deploy.** The whole CI
  workflow (pull-request runs included) and the refresh workflow shared one
  static `pages` concurrency group; GitHub keeps one running + one pending run
  per group and each new arrival cancels the previous pending one, so a busy PR
  branch could kill main's queued runs — this bit the NBA viewer during its
  2026-08-13 rollover PR. CI now groups per ref, the refresh has its own group,
  and only the Pages deploy keeps a shared job-level `pages` lock (ported from
  nba-schedule).

- **The refresh now defaults to the committed season, not the calendar.** The
  fetch script derived its default season from today's date; the NBA viewer
  showed (2026-08-13) that the morning after a rollover this re-fetches the
  ARCHIVED season over the freshly committed one — growth, so the shrink guard
  waves it through, and only the coverage gate stops the site reverting a whole
  season. The default is now `SEASON` from `src/data/teams.js`: the bot
  refreshes whatever season the site is committed to, and only a rollover moves
  that target.

## 2026-08-11

- **The leaders data was missing a third of the league.** ESPN's `byathlete`
  feed — the sole source for every leaderboard, team roster panel and player
  pop-out — answered with **128 of 207 rostered players**, and the omissions
  were not fringe: no Sabrina Ionescu (21 games), Kelsey Plum (16), Napheesa
  Collier or Satou Sabally. It is inconsistent season to season, too: the 2025
  feed drops **Angel Reese, who led the WNBA in rebounding that year**, so the
  archived 2025 rebounding board named the wrong leader outright.

  The universe is now built from the rosters as well: anyone `byathlete` skips
  is rebuilt from `/athletes/{id}/stats`, which is the richer payload anyway —
  integer season totals (so an average is computed at full precision rather than
  read back from a rounded one), the double-double and triple-double counts, and
  the per-team splits. 201 players now, and 2025's rebounding leader is Angel
  Reese as it should always have been.

- **League leaders now use the WNBA's published qualification minimums.** The
  per-game boards ranked anyone with a stat line, and the percentage boards
  qualified on attempts per game. The real rule — published at
  basketball-reference.com/about/wnba_rate_stat_req.html, and *not* the NBA's —
  takes either leg: **20 games or the season total** (400 PTS / 200 TRB / 100 AST
  / 35 STL / 35 BLK), and **85 made field goals** for FG%, **20 made threes** for
  3P%. Each is scaled by how much of the season has been played, so a board in
  June ranks who has been available instead of sitting empty.

  Against Basketball-Reference's current 2026 board, points, rebounds, assists
  and blocks now match exactly. Steals differs at #10 only in how a 1.5-vs-1.5
  display tie is ordered, and there our arithmetic is right (48 steals in 31
  games beats 40 in 26). The percentage boards deliberately differ in-season:
  BBRef applies the made-shot minimums unscaled, which would leave FG% empty
  through May. They converge once a season is complete.

- **Leaders show the team(s) a player actually played for that season**, oldest
  first, with the games alongside each. This could not simply reuse the NBA's
  approach: ESPN's `teams` array is season-accurate for 2026 but **absent
  entirely for 2023**, leaving only the player's *current* club — which badged
  2023's scoring leader Jewell Loyd as an Ace when she spent that season a Storm.
  Season membership is therefore resolved from the per-team splits for every
  player, not just the ones who moved. Archived History boards carry the field
  and show badges for the first time.

- **Per-game averages are shown at two decimals and sorted at four.** One decimal
  manufactured ties that then broke alphabetically; the hidden digits are never
  displayed and exist only so a pair reading the same still sorts correctly.

## 2026-08-10

- **The refresh gate is now CI's own gate.** The twice-daily refresh ran plain
  `npm test` before committing, but a bot push triggers no CI — so refreshed
  data could break the 100% coverage invariant invisibly until the next human
  push (exactly what happened with the WNBA race engine this morning). The
  refresh workflow now runs the same coverage command CI runs.
- **The ESPN fetch layer is now vendored, not copy-pasted.** The hardened
  transport (5 retries with exponential backoff + jitter, retry only on
  5xx/429/network errors, a 6-request concurrency cap) previously lived as an
  inline copy in each data script; it now lives in `scripts/lib/fetch.mjs`,
  vendored byte-for-byte from the canonical copy in `sports-viewer-meta`
  (which diffs every repo's copy via `check-fetch-sync`). No behavior change
  to the refresh pipeline.

## 2026-08-09

- **Live window anchors on the Eastern day.** The scoreboard poll's three-day
  window was computed in UTC, but ESPN buckets `dates=` by the US-Eastern day —
  every US evening the window slid to {today, +1, +2} and dropped yesterday's
  finals from the overlay. The window now converts each offset to its Eastern
  day.
- **Refresh no longer attaches mid-game line scores.** Today's refresh run
  failed its test gate when the scoreboard's month query served a mid-game
  snapshot: a partial line (and provisional star leaders) attached to a game
  whose final score came from the fresher team-schedule feed. The box-score
  enrichment now skips events the scoreboard doesn't mark completed.
- **Live scores no longer count as final.** The live overlay's provisional
  score was being banked everywhere a result matters: standings absorbed
  halftime leads, the bracket could crown a series winner mid-game, the race
  engine treated an in-progress head-to-head as settled, and — worst — the
  season's last game going live read as "season over" and killed the live
  polling exactly when it mattered. Every consumer now requires
  score-and-not-live (the soccer viewers' provisional-score convention), so
  nothing counts until the game is actually final.
- **Sharper clinch math: banked ties + a late-season scenario engine.** The ✓
  no longer vanishes when a chaser can merely TIE a team's lose-out floor: a
  finished, won season series settles that tie (head-to-head is step 1), so it
  stops counting — the Lynx case that surfaced today. And once the remaining
  coupled schedule is small enough to enumerate, a scenario engine checks every
  outcome, seeing what independent bounds can't: chasers who still play each
  other can't all win out. Elimination stays purely arithmetic — a ✕ never
  rests on an assumption.

## 2026-08-08

- **Official tiebreakers + Finish column.** Seeding now applies the league's
  published tiebreak procedure exactly (verified against the wnba.com standings
  footnote for 2026): head-to-head record, then record vs .500-or-better teams,
  then head-to-head point differential, then overall point differential — with
  the official multi-team rule that a shrunken tie restarts from step one. The
  league table also gained a **Finish** column: the final seeds still
  arithmetically open to each team (a lone gold number = seed locked).
- **Standings legend.** The Regular Season tab now spells out its markers below
  the table — ✓ clinched a playoff spot (top-8 guaranteed), ✕ eliminated (row
  dims), ★ a followed team — instead of relying on hover-only tooltips.
- **Condensed view strip.** Once the tab nav scrolls out of view, a slim fixed
  strip pins to the top showing the current view; tapping it drops down the
  full tab set, so switching views never means scrolling back to the top.
  The sticky filter bar and month jump-bar offset beneath it, and jump/landing scrolls reserve for its height.
  Rolled out family-wide.
- **Changelog started.** Earlier history lives in the git log.
