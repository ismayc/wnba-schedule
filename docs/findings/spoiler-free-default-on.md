# Spoiler-free is the default, and what that changes

*Recorded 2026-07-26. Shipped in `6d4f500`.*

Spoiler-free mode is now **on for a first-time visitor**. The premier-league viewer
got the same change the same day; NBA, NFL and both March Madness viewers still
default to scores shown.

## Precedence

An explicit `?hide=` in a shared link beats the saved per-device choice, which beats
the default:

```js
if (initial.hideExplicit) return initial.hide
try {
  return localStorage.getItem('wnba:spoilerFree') !== '0'
} catch {
  return DEFAULTS.hide
}
```

The stored read is `!== '0'`, not `=== '1'`. An **absent key means "never chose"**
and must take the default — reading `=== '1'` would quietly pin every existing
visitor to the old behaviour forever. The private-mode `catch` returns
`DEFAULTS.hide` rather than a hardcoded `false`, so it can't drift from the default
it's meant to fall back to.

## The URL now carries the opt-out

`toSearch` writes only non-default values, so flipping the default flips which value
has to travel:

```js
if (state.hide === false) p.set('hide', '0')   // was: if (state.hide) p.set('hide', '1')
```

Otherwise someone who turned scores **on** shares a link with no `hide` param, and
the recipient's default hides everything — the choice arrives inverted, not lost.
`readState` correspondingly has to tell an absent param from an explicit `0`:

```js
hide: p.has('hide') ? p.get('hide') === '1' : DEFAULTS.hide,
```

Don't generalise this to `state.hide !== DEFAULTS.hide ? '1' : '0'` — with the
default at `true` the `'1'` arm is unreachable for a boolean, and the 100% branch
gate fails on it (it did, at 96.29% on that line).

## Test fallout

Anything asserting on a score now needs `?hide=0`. The team panel's form strip is
suppressed entirely under spoiler-free (`row.results.length > 0 && !hideScores` in
`TeamPanel.jsx`), so the `.tp-chip` coverage test opens with
`?view=standings&hide=0`.
