import { useEffect, useState } from 'react'
import { fetchLineup } from '../services/lineups.js'
import TeamLogo from './TeamLogo.jsx'

// Starting lineups inside the game detail.
//
// Loaded when the game is opened rather than with the page, because a lineup does not
// exist until ESPN posts it around tip-off. Three states are worth distinguishing:
// "still loading", "not posted yet" (the normal state for an upcoming game, and not an
// error), and "here they are".
export default function Lineups({ game, hideScores }) {
  const [state, setState] = useState({ status: 'loading', lineup: null })

  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading', lineup: null })

    fetchLineup(game.id, { signal: ctrl.signal }).then((lineup) => {
      // An aborted request resolves after the modal has gone; setting state then would
      // warn and, worse, overwrite a newer game's lineup.
      if (ctrl.signal.aborted) return
      setState({ status: lineup ? 'ready' : 'empty', lineup })
    })

    return () => ctrl.abort()
  }, [game.id])

  if (state.status === 'loading') {
    return (
      <section className="lineups">
        <h4 className="md-sub">Starting lineups</h4>
        <p className="dim lu-note">Loading…</p>
      </section>
    )
  }

  if (state.status === 'empty') {
    return (
      <section className="lineups">
        <h4 className="md-sub">Starting lineups</h4>
        <p className="dim lu-note">Not posted yet — starters usually appear around tip-off.</p>
      </section>
    )
  }

  const { sides } = state.lineup
  // Match by abbreviation (the reliable join), falling back to feed order.
  const away = sides.find((s) => s.abbr === game.away) ?? sides[0]
  const home = sides.find((s) => s.abbr === game.home) ?? sides[1]

  return (
    <section className="lineups">
      <h4 className="md-sub">Starting lineups</h4>
      <div className="lu-sides">
        <Side side={away} hideScores={hideScores} />
        <Side side={home} hideScores={hideScores} />
      </div>
    </section>
  )
}

function Side({ side, hideScores }) {
  if (!side) return null

  return (
    <div className="lu-side">
      <header className="lu-head">
        {side.abbr && <TeamLogo abbr={side.abbr} size={18} />}
        <strong>{side.name}</strong>
      </header>

      <ul className="lu-list">
        {side.starters.map((p) => (
          <Player key={p.id ?? p.name} player={p} hideScores={hideScores} />
        ))}
      </ul>

      {side.bench.length > 0 && (
        <details className="lu-bench">
          <summary>Bench ({side.bench.length})</summary>
          <ul className="lu-list">
            {side.bench.map((p) => (
              <Player key={p.id ?? p.name} player={p} hideScores={hideScores} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Player({ player, hideScores }) {
  const { pts, reb, ast } = player.line
  // A stat line only exists once the game has tipped; it's also a score, so the
  // spoiler-free toggle suppresses it while still showing who started.
  const showLine = !player.dnp && pts != null && pts !== '' && !hideScores

  return (
    <li className="lu-player">
      <span className="lu-jersey">{player.jersey ?? '–'}</span>
      <span className="lu-name">{player.name}</span>
      {player.pos && <span className="lu-pos">{player.pos}</span>}
      {showLine && (
        <span className="lu-line" title="Points · Rebounds · Assists">
          {pts}·{reb}·{ast}
        </span>
      )}
    </li>
  )
}
