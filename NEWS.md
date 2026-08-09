# NEWS

A dated changelog for The WNBA Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-09

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
