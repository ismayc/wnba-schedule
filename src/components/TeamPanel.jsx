import { useMemo } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { playoffRace, CONFERENCE_BY_ABBR, CONFERENCES } from '../utils/standings.js'
import { playersByTeam } from '../utils/stats.js'
import { formatDate, formatTime, liveState } from '../utils/time.js'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)
const signed = (n) => (n > 0 ? `+${one(n)}` : one(n))

// Form as a strip of results, oldest first — the same read as the standings dots but
// with the opponent attached.
function Form({ results, onOpen, gamesById }) {
  return (
    <div className="tp-form">
      {results.slice(-10).map((r) => (
        <button
          key={r.id}
          className={`tp-chip ${r.won ? 'w' : 'l'}`}
          onClick={() => onOpen?.(gamesById.get(r.id))}
          title={`${r.won ? 'Won' : 'Lost'} ${r.pf}–${r.pa} ${r.side === 'home' ? 'vs' : 'at'} ${
            TEAM_BY_ABBR[r.opp]?.name
          }`}
        >
          {r.won ? 'W' : 'L'}
        </button>
      ))}
    </div>
  )
}

export default function TeamPanel({ abbr, games, tz, hideScores, onClose, onSchedule, onOpenGame }) {
  const ref = useModalA11y(onClose, !!abbr)
  const { isFollowed, toggle } = useFollow()

  const race = useMemo(() => playoffRace(games), [games])
  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])
  const row = race.find((r) => r.abbr === abbr)
  const roster = useMemo(() => (abbr ? playersByTeam(abbr).slice(0, 6) : []), [abbr])

  const upcoming = useMemo(() => {
    if (!abbr) return []
    return games
      .filter((g) => (g.home === abbr || g.away === abbr) && !g.score && !g.postponed)
      .slice(0, 5)
  }, [games, abbr])

  if (!abbr || !row) return null
  const team = TEAM_BY_ABBR[abbr]
  const followed = isFollowed(abbr)

  const homeAway = (g) => (g.home === abbr ? g.away : g.home)
  const prefix = (g) => (g.home === abbr ? 'vs' : 'at')

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={team.displayName} ref={ref} tabIndex={-1}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="tp-head">
          <TeamLogo abbr={abbr} size={54} />
          <div>
            <h3 className="tp-name">{team.displayName}</h3>
            <p className="tp-sub">
              {row.w}–{row.l} · {CONFERENCES[CONFERENCE_BY_ABBR[abbr]]} · seed {row.seed}
              {row.clinched && <span className="badge badge-in"> ✓ clinched</span>}
              {row.eliminated && <span className="badge badge-out"> ✕ eliminated</span>}
            </p>
          </div>
          <button
            className={`chip ${followed ? 'on' : ''}`}
            onClick={() => toggle(abbr)}
            aria-pressed={followed}
          >
            {followed ? '★ Following' : '☆ Follow'}
          </button>
        </div>

        <div className="tp-stats">
          {[
            ['Scored', one(row.ppg)],
            ['Allowed', one(row.oppPpg)],
            ['Net', signed(row.netPpg)],
            ['Home', `${row.home.w}–${row.home.l}`],
            ['Road', `${row.road.w}–${row.road.l}`],
            ['Left', row.remaining],
          ].map(([label, v]) => (
            <div className="tp-stat" key={label}>
              <span className="tp-stat-v">{v}</span>
              <span className="tp-stat-l">{label}</span>
            </div>
          ))}
        </div>

        {row.results.length > 0 && !hideScores && (
          <>
            <h4 className="md-sub">Last 10</h4>
            <Form results={row.results} onOpen={onOpenGame} gamesById={gamesById} />
          </>
        )}

        {roster.length > 0 && (
          <>
            <h4 className="md-sub">Leading scorers</h4>
            <div className="tp-roster">
              {roster.map((p) => (
                <div className="tp-player" key={p.id}>
                  <span className="tp-p-name">
                    {p.name}
                    <span className="lead-pos">{p.pos}</span>
                  </span>
                  <span className="tp-p-line">
                    {p.avgPoints} <i>pts</i> · {p.avgRebounds} <i>reb</i> · {p.avgAssists}{' '}
                    <i>ast</i>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {upcoming.length > 0 && (
          <>
            <h4 className="md-sub">Next up</h4>
            <ul className="drill">
              {upcoming.map((g) => (
                <li key={g.id}>
                  <span className="drill-date">{formatDate(g.tip, tz)}</span>
                  <span className="dim">{prefix(g)}</span>
                  <TeamLogo abbr={homeAway(g)} size={18} />
                  <span>{TEAM_BY_ABBR[homeAway(g)]?.name}</span>
                  <span className="drill-note">
                    {liveState(g) === 'live' ? 'Live' : formatTime(g.tip, tz)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="md-actions">
          <button className="chip" onClick={() => (onSchedule?.(abbr), onClose())}>
            📋 Full schedule
          </button>
        </div>
      </div>
    </div>
  )
}
