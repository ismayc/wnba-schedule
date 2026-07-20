import { useMemo } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatDate, formatTime, formatZoneAbbr, liveState, countdown } from '../utils/time.js'
import { computeStandings, countsForStandings } from '../utils/standings.js'
import { playersByTeam } from '../utils/stats.js'
import { watchableServices } from '../utils/watch.js'
import { useServices } from '../context/services.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)

// Season series between these two, so the detail answers "who's had the better of
// this matchup" without a trip to the schedule.
function useSeries(games, a, b) {
  return useMemo(() => {
    const met = games.filter(
      (g) => countsForStandings(g) && [g.home, g.away].includes(a) && [g.home, g.away].includes(b)
    )
    const wins = { [a]: 0, [b]: 0 }
    for (const g of met) {
      const winner = g.score[0] > g.score[1] ? g.home : g.away
      wins[winner]++
    }
    return { met, wins }
  }, [games, a, b])
}

// Basketball's answer to a goal timeline. Individual baskets are too numerous to
// enumerate (~65 a game), but the quarter breakdown carries the shape of the game —
// "won by 8" and "led by 20 and held on" look identical in a final score.
function LineScore({ game, hideScores }) {
  if (!game.line || hideScores) return null

  const { home, away } = game.line
  const periods = Math.max(home.length, away.length)
  if (!periods) return null

  const label = (i) => (i < 4 ? `Q${i + 1}` : periods - 4 > 1 ? `OT${i - 3}` : 'OT')
  const sum = (arr) => arr.reduce((a, b) => a + b, 0)

  const Row = ({ abbr, vals, total }) => (
    <tr>
      <th scope="row">
        <TeamLogo abbr={abbr} size={18} />
        <span>{abbr}</span>
      </th>
      {Array.from({ length: periods }, (_, i) => {
        const mine = vals[i]
        const theirs = (abbr === game.home ? away : home)[i]
        // Bolding the higher number per quarter turns the row into a momentum read.
        const won = mine != null && theirs != null && mine > theirs
        return (
          <td key={i} className={won ? 'q-won' : ''}>
            {mine ?? '–'}
          </td>
        )
      })}
      <td className="q-total">{total}</td>
    </tr>
  )

  return (
    <>
      <h4 className="md-sub">By quarter</h4>
      <div className="table-scroll">
        <table className="linescore">
          <thead>
            <tr>
              <th />
              {Array.from({ length: periods }, (_, i) => (
                <th key={i}>{label(i)}</th>
              ))}
              <th className="q-total">T</th>
            </tr>
          </thead>
          <tbody>
            <Row abbr={game.away} vals={away} total={sum(away)} />
            <Row abbr={game.home} vals={home} total={sum(home)} />
          </tbody>
        </table>
      </div>
    </>
  )
}

const CAT_LABEL = { points: 'PTS', rebounds: 'REB', assists: 'AST' }

// The per-game equivalent of "who scored" — aggregated leaders rather than an event
// list, for the same reason.
function GameLeaders({ game }) {
  if (!game.stars?.length) return null
  const byTeam = [game.away, game.home].map((abbr) => ({
    abbr,
    rows: game.stars.filter((s) => s.team === abbr),
  }))
  if (!byTeam.some((t) => t.rows.length)) return null

  return (
    <>
      <h4 className="md-sub">Game leaders</h4>
      <div className="leaders-split">
        {byTeam.map(({ abbr, rows }) => (
          <div key={abbr} className="gl-team">
            <div className="gl-head">
              <TeamLogo abbr={abbr} size={18} />
              <span>{abbr}</span>
            </div>
            {rows.map((s) => (
              <div className="gl-row" key={s.cat}>
                <span className="gl-cat">{CAT_LABEL[s.cat] || s.cat}</span>
                <span className="gl-who">{s.who}</span>
                <span className="gl-v">{s.v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function TaleRow({ label, left, right, betterLeft }) {
  return (
    <div className="tale-row">
      <span className={`tale-val ${betterLeft === true ? 'better' : ''}`}>{left}</span>
      <span className="tale-label">{label}</span>
      <span className={`tale-val ${betterLeft === false ? 'better' : ''}`}>{right}</span>
    </div>
  )
}

export default function GameDetail({ game, games, tz, hideScores, onClose, onPickTeam }) {
  const ref = useModalA11y(onClose, !!game)
  const { services } = useServices()
  const table = useMemo(() => computeStandings(games), [games])
  const series = useSeries(games, game?.away, game?.home)

  if (!game) return null

  const watch = watchableServices(game.broadcast, services)

  const away = TEAM_BY_ABBR[game.away]
  const home = TEAM_BY_ABBR[game.home]
  const A = table[game.away]
  const H = table[game.home]
  const state = liveState(game)
  const scored = game.score && !hideScores
  const [hs, as] = game.score || []

  const topScorer = (abbr) => playersByTeam(abbr)[0]

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Game detail" ref={ref} tabIndex={-1}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="md-head">
          <div className="md-side">
            <TeamLogo abbr={game.away} size={52} />
            <strong>{away?.displayName}</strong>
            <span className="dim">
              {A.w}–{A.l}
            </span>
          </div>
          <div className="md-center">
            {scored ? (
              <>
                <span className="md-score">
                  {as} – {hs}
                </span>
                <span className="md-state">
                  {state === 'live' ? game.statusLabel || 'Live' : `Final${game.ot ? (game.ot > 1 ? `/${game.ot}OT` : '/OT') : ''}`}
                </span>
              </>
            ) : (
              <>
                <span className="md-time">{formatTime(game.tip, tz)}</span>
                <span className="md-state">{formatZoneAbbr(game.tip, tz)}</span>
                {countdown(game.tip) && <span className="md-state">in {countdown(game.tip)}</span>}
              </>
            )}
          </div>
          <div className="md-side">
            <TeamLogo abbr={game.home} size={52} />
            <strong>{home?.displayName}</strong>
            <span className="dim">
              {H.w}–{H.l}
            </span>
          </div>
        </div>

        <dl className="md-facts">
          <div>
            <dt>Date</dt>
            <dd>{formatDate(game.tip, tz, { year: 'numeric' })}</dd>
          </div>
          {game.venue && (
            <div>
              <dt>Venue</dt>
              <dd>
                {game.venue}
                {game.city ? `, ${game.city}` : ''}
                {game.state ? `, ${game.state}` : ''}
              </dd>
            </div>
          )}
          {game.broadcast?.length && (
            <div>
              <dt>Watch</dt>
              <dd>
                {game.broadcast.join(' · ')}
                {watch.length > 0 && (
                  <span
                    className="watch"
                    aria-label={`Watch on ${watch.map((s) => s.label).join(', ')}`}
                  >
                    <span className="watch-tv" aria-hidden="true">
                      📺
                    </span>
                    {watch.map((s) => (
                      <span key={s.key} className="watch-chip">
                        {s.label}
                      </span>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          )}
          {game.note && (
            <div>
              <dt>Note</dt>
              <dd className="note">{game.note}</dd>
            </div>
          )}
        </dl>

        <LineScore game={game} hideScores={hideScores} />
        <GameLeaders game={game} />

        <h4 className="md-sub">Tale of the tape</h4>
        <div className="tale">
          <TaleRow
            label="Record"
            left={`${A.w}–${A.l}`}
            right={`${H.w}–${H.l}`}
            betterLeft={A.pct === H.pct ? null : A.pct > H.pct}
          />
          <TaleRow
            label="Points per game"
            left={one(A.ppg)}
            right={one(H.ppg)}
            betterLeft={A.ppg === H.ppg ? null : A.ppg > H.ppg}
          />
          <TaleRow
            label="Allowed per game"
            left={one(A.oppPpg)}
            right={one(H.oppPpg)}
            betterLeft={A.oppPpg === H.oppPpg ? null : A.oppPpg < H.oppPpg}
          />
          <TaleRow
            label="Last 10"
            left={`${A.last10.filter(Boolean).length}–${A.last10.filter((x) => !x).length}`}
            right={`${H.last10.filter(Boolean).length}–${H.last10.filter((x) => !x).length}`}
          />
          {topScorer(game.away) && topScorer(game.home) && (
            <TaleRow
              label="Leading scorer"
              left={`${topScorer(game.away).short} ${topScorer(game.away).avgPoints}`}
              right={`${topScorer(game.home).short} ${topScorer(game.home).avgPoints}`}
            />
          )}
        </div>

        {series.met.length > 0 && (
          <>
            <h4 className="md-sub">
              Season series — {series.wins[game.away]}–{series.wins[game.home]}
            </h4>
            <ul className="drill">
              {series.met.map((g) => (
                <li key={g.id}>
                  <span className="drill-date">{formatDate(g.tip, tz)}</span>
                  <span className="dim">{g.away} @ {g.home}</span>
                  <span className="drill-score">
                    {hideScores ? '—' : `${g.score[1]} – ${g.score[0]}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="md-actions">
          <button className="chip" onClick={() => (onPickTeam?.(game.away), onClose())}>
            <TeamLogo abbr={game.away} size={16} /> {away?.name} schedule
          </button>
          <button className="chip" onClick={() => (onPickTeam?.(game.home), onClose())}>
            <TeamLogo abbr={game.home} size={16} /> {home?.name} schedule
          </button>
        </div>
      </div>
    </div>
  )
}
