import TeamLogo from './TeamLogo.jsx'

// The summary-derived sections of the game detail, exported one per concern so the modal
// can distribute them across its tabs. Each takes the shared summary state (one fetch,
// owned by GameDetail) and renders null when its data isn't present. Scores are
// suppressed under spoiler-free mode, so a completed game still shows who played without
// giving the result away.

// ── Players: box score once stats exist, else starting lineups ─────────
export function PlayerBox({ summary, game, hideScores }) {
  if (summary.status === 'loading') {
    return (
      <section className="lineups">
        <h4 className="md-sub">Box score</h4>
        <p className="dim lu-note">Loading…</p>
      </section>
    )
  }

  const box = summary.data?.box
  if (!box) {
    return (
      <section className="lineups">
        <h4 className="md-sub">Starting lineups</h4>
        <p className="dim lu-note">Not posted yet — starters usually appear around tip-off.</p>
      </section>
    )
  }

  const away = box.sides.find((s) => s.abbr === game.away) ?? box.sides[0]
  const home = box.sides.find((s) => s.abbr === game.home) ?? box.sides[1]
  const showBox = box.hasStats && !hideScores

  return (
    <section className="lineups">
      <h4 className="md-sub">{showBox ? 'Box score' : 'Starting lineups'}</h4>
      {showBox ? (
        <div className="box-sides">
          <BoxTable side={away} />
          <BoxTable side={home} />
        </div>
      ) : (
        <div className="lu-sides">
          <LineupSide side={away} />
          <LineupSide side={home} />
        </div>
      )}
    </section>
  )
}

export function TeamStatsSection({ summary, game, hideScores }) {
  const rows = summary.data?.teamStats
  if (hideScores || !rows?.length) return null
  return (
    <section className="team-stats">
      <h4 className="md-sub">Team stats</h4>
      <div className="ts-head">
        <span>{game.away}</span>
        <span />
        <span>{game.home}</span>
      </div>
      {rows.map((r) => (
        <div className="ts-row" key={r.label}>
          <span className={`ts-val ${r.better === 'away' ? 'better' : ''}`}>{r.away ?? '–'}</span>
          <span className="ts-label">{r.label}</span>
          <span className={`ts-val ${r.better === 'home' ? 'better' : ''}`}>{r.home ?? '–'}</span>
        </div>
      ))}
    </section>
  )
}

export function InjuryReport({ summary, game }) {
  const injuries = summary.data?.injuries
  if (!injuries?.length) return null

  // Away team first, to match the header/box order.
  const order = (b) => (b.abbr === game.away ? 0 : b.abbr === game.home ? 1 : 2)
  const sides = [...injuries].sort((a, b) => order(a) - order(b))

  return (
    <section className="injuries">
      <h4 className="md-sub">Injury report</h4>
      <div className="inj-sides">
        {sides.map((b) => (
          <div className="inj-side" key={b.abbr}>
            <header className="lu-head">
              {b.abbr && <TeamLogo abbr={b.abbr} size={18} />}
              <strong>{b.abbr}</strong>
            </header>
            <ul className="inj-list">
              {b.players.map((p) => (
                <li className="inj-player" key={p.name}>
                  <span className="inj-name">
                    {p.name}
                    {p.pos && <span className="lu-pos"> {p.pos}</span>}
                  </span>
                  <span className={`inj-status s-${(p.status || '').toLowerCase()}`}>
                    {p.status}
                    {p.detail ? ` · ${p.detail}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

export function WinProbSection({ summary, game, hideScores }) {
  const series = summary.data?.winprob
  if (hideScores || !series || series.length < 2) return null

  const n = series.length
  const W = 100
  const H = 32
  // y = 0 (top) is a home lock; y = H (bottom) an away lock; 50% sits on the midline.
  const pts = series.map((p, i) => `${((i / (n - 1)) * W).toFixed(2)},${((1 - p) * H).toFixed(2)}`)
  const line = `M${pts.join(' L')}`
  const area = `${line} L${W},${H / 2} L0,${H / 2} Z`
  const finalHome = Math.round(series[n - 1] * 100)
  const favored = finalHome >= 50 ? game.home : game.away
  const pct = finalHome >= 50 ? finalHome : 100 - finalHome

  return (
    <section className="winprob">
      <h4 className="md-sub">
        Win probability <span className="wp-caption">{game.home} above · {game.away} below</span>
      </h4>
      <svg
        className="wp-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Win probability chart — ${favored} ended at ${pct}%`}
      >
        <path className="wp-area" d={area} />
        <line className="wp-mid" x1="0" y1={H / 2} x2={W} y2={H / 2} />
        <path className="wp-line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="dim wp-note">
        Ended {pct}% {favored}
      </p>
    </section>
  )
}

// ── Private renderers ──────────────────────────────────────────────────
function BoxTable({ side }) {
  if (!side) return null
  const rows = [...side.starters, ...side.bench]
  const benchStart = side.starters.length

  const cell = (p, key) => {
    if (p.dnp) return key === 'minutes' ? 'DNP' : ''
    const v = p.stats[key]
    return v == null || v === '' ? '–' : v
  }

  return (
    <div className="box-team">
      <header className="lu-head">
        {side.abbr && <TeamLogo abbr={side.abbr} size={18} />}
        <strong>{side.name}</strong>
      </header>
      <div className="table-scroll">
        <table className="boxscore">
          <thead>
            <tr>
              <th className="bx-name" scope="col">
                Player
              </th>
              {side.columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id ?? p.name} className={i === benchStart ? 'bx-benchstart' : ''}>
                <th scope="row" className="bx-name">
                  <span className="bx-player">{p.name}</span>
                  {p.pos && <span className="lu-pos">{p.pos}</span>}
                </th>
                {side.columns.map((c) => (
                  <td key={c.key}>{cell(p, c.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {side.totals && (
            <tfoot>
              <tr>
                <th scope="row" className="bx-name">
                  Totals
                </th>
                {side.columns.map((c) => (
                  <td key={c.key}>{side.totals[c.key] || ''}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function LineupSide({ side }) {
  if (!side) return null
  const Player = (p) => (
    <li className="lu-player" key={p.id ?? p.name}>
      <span className="lu-jersey">{p.jersey ?? '–'}</span>
      <span className="lu-name">{p.name}</span>
      {p.pos && <span className="lu-pos">{p.pos}</span>}
    </li>
  )
  return (
    <div className="lu-side">
      <header className="lu-head">
        {side.abbr && <TeamLogo abbr={side.abbr} size={18} />}
        <strong>{side.name}</strong>
      </header>
      <ul className="lu-list">{side.starters.map(Player)}</ul>
      {side.bench.length > 0 && (
        <details className="lu-bench">
          <summary>Bench ({side.bench.length})</summary>
          <ul className="lu-list">{side.bench.map(Player)}</ul>
        </details>
      )}
    </div>
  )
}
