# A branch covered by another test's pinned clock loses coverage on a data refresh

*Recorded 2026-07-26. Fixed in `e5069bb`.*

After rebasing onto the twice-daily data refresh, the 100% gate dropped to
**99.89% branches** — with all 501 tests passing. The uncovered lines were
`src/components/GameCard.jsx:156-157`, the All-Star card's countdown:

```jsx
extra={
  state === 'upcoming' &&
  countdown(game.tip) && <span className="countdown">in {countdown(game.tip)}</span>
}
```

## What was actually covering it

Nothing on purpose. `test/app-imminent.cov.test.jsx` pins a fake clock relative to
whichever game the selector below returns, in order to test the **poll cadence**:

```js
const upcoming = GAMES.find((g) => !g.score && !g.postponed && !g.canceled)
vi.setSystemTime(new Date(new Date(upcoming.tip).getTime() - 5 * 60_000))
```

Before the refresh, the first unscored game *was* the All-Star Game. So that test
rendered the app 5 minutes before the All-Star tip, the card was `upcoming`, and the
countdown branch was covered as a side effect of a test about polling.

## What the refresh changed

The refresh added a final score to the All-Star Game:

```console
$ git show <pre-refresh>:src/data/schedule.js | grep -o 'allstar.\{0,140\}'
allstar","home":"COOP","away":"SPO",...,"note":"AT&T WNBA All-Star Game"

$ grep -o 'allstar.\{0,140\}' src/data/schedule.js
allstar","home":"COOP","away":"SPO",...,"score":[122,129],"note":"AT&T WNBA All-Star Game"
```

`liveState` returns on the score **before** it ever looks at the tip:

```js
if (game.score) return 'final'          // ← short-circuits here
const start = new Date(game.tip).getTime()
if (now < start) return 'upcoming'
```

So the pinned clock stopped mattering, `upcoming` resolved to a different game, and
the branch lost its only coverage.

## The wrong first diagnosis

The initial read was "the test's hard-coded date `2026-07-26T00:30:00.000Z` expired."
That was wrong: the tip was already ~25 hours past during the runs that reported
**100%**. Real elapsed time was not the variable — the committed data was. The
`git show` diff above is what settled it. Worth noting because both explanations
predict the same symptom, and only one leads to a fix that holds.

## The fix

Give the branch its own pinned-clock test built on a **literal fixture**, not on
`GAMES` — a fixture can't be rescored by a refresh — and assert the rendered output
so the branch fails loudly instead of decaying quietly:

```js
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-07-25T00:30:00.000Z'))   // one day before tip
...
expect(container.querySelector('.countdown')).toHaveTextContent('in 1d 0h')
```

Plus `afterEach(() => vi.useRealTimers())` in that file, so a failure there can't
leak fake timers into sibling tests.

## The general rule

- A time-dependent branch needs its **own** pinned clock and a literal fixture.
  Incidental coverage from a test about something else is coverage you will lose.
- `GAMES.find(g => !g.score …)` — "the first unscored game" — is not a stable
  selector. It moves whenever the refresh scores a game, and around the All-Star
  break it lands on a fixture with no franchise sides.
- Run the full coverage gate **after** rebasing onto a refresh commit, not only
  before. The rebase brings in new data, and these suites assert against it.
