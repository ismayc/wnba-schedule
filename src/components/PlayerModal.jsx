import { useEffect, useState } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatDate } from '../utils/time.js'
import { fetchPlayer, headshotUrl } from '../services/player.js'
import { flagUrl } from '../utils/flag.js'
import { useModalA11y } from '../hooks/useModalA11y.js'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => (typeof n === 'number' ? n.toFixed(1) : (n ?? '–'))

// First + last initial, for the headshot fallback (~5 fringe players have no photo).
const initials = (name) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

// Headline season averages, straight from the committed PLAYERS row (no fetch).
const SEASON_STATS = [
  { key: 'avgPoints', label: 'PPG' },
  { key: 'avgRebounds', label: 'RPG' },
  { key: 'avgAssists', label: 'APG' },
  { key: 'avgSteals', label: 'SPG' },
  { key: 'avgBlocks', label: 'BPG' },
  { key: 'avgMinutes', label: 'MPG' },
]

export default function PlayerModal({ player, tz, onClose }) {
  const ref = useModalA11y(onClose, !!player)
  const [extra, setExtra] = useState({ status: 'loading', bio: null, games: null })
  const [hasShot, setHasShot] = useState(true)
  const id = player?.id

  useEffect(() => {
    if (!id) return
    const ctrl = new AbortController()
    setHasShot(true) // reset the headshot fallback for the new player
    setExtra({ status: 'loading', bio: null, games: null })
    fetchPlayer(id, { signal: ctrl.signal }).then((data) => {
      if (ctrl.signal.aborted) return
      setExtra({ status: 'ready', bio: data?.bio ?? null, games: data?.games ?? null })
    })
    return () => ctrl.abort()
  }, [id])

  if (!player) return null

  const team = TEAM_BY_ABBR[player.team]
  const { bio, games, status } = extra

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal player-modal"
        role="dialog"
        aria-modal="true"
        aria-label={player.name}
        ref={ref}
        tabIndex={-1}
      >
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="pm-head">
          {hasShot ? (
            <img
              className="pm-shot"
              src={headshotUrl(player.id)}
              alt=""
              loading="lazy"
              onError={() => setHasShot(false)}
            />
          ) : (
            <span className="pm-shot pm-initials" aria-hidden="true">
              {initials(player.name)}
            </span>
          )}
          <div className="pm-id">
            <strong className="pm-name">{player.name}</strong>
            <span className="pm-sub">
              {team && <TeamLogo abbr={player.team} size={16} />}
              {team?.displayName || player.team}
              {player.pos ? ` · ${player.pos}` : ''}
              {bio?.jersey ? ` · #${bio.jersey}` : ''}
            </span>
            {bio && (bio.height || bio.weight || bio.age || bio.college) && (
              <span className="pm-bio dim">
                {[bio.height, bio.weight, bio.age && `Age ${bio.age}`, bio.college]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            {bio?.country && (
              <span className="pm-origin dim">
                {flagUrl(bio.country) && (
                  <img
                    className="pm-flag"
                    src={flagUrl(bio.country)}
                    alt=""
                    width="20"
                    height="14"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )}
                {bio.country}
              </span>
            )}
          </div>
        </div>

        <h4 className="md-sub">Season averages · {player.gamesPlayed} GP</h4>
        <div className="pm-stats">
          {SEASON_STATS.map((s) => (
            <div className="pm-stat" key={s.key}>
              <span className="pm-stat-v">{one(player[s.key])}</span>
              <span className="pm-stat-l">{s.label}</span>
            </div>
          ))}
        </div>
        <div className="pm-splits">
          <span>
            FG {player.avgFgMade}-{player.avgFgAtt} · {one(player.fgPct)}%
          </span>
          <span>
            3PT {player.avgThreeMade}-{player.avgThreeAtt} · {one(player.threePct)}%
          </span>
          <span>
            FT {player.avgFtMade}-{player.avgFtAtt} · {one(player.ftPct)}%
          </span>
        </div>

        <h4 className="md-sub">Recent games</h4>
        {status === 'loading' ? (
          <p className="dim lu-note">Loading…</p>
        ) : games?.length ? (
          <div className="table-scroll">
            <table className="pm-log">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Opp</th>
                  <th scope="col">MIN</th>
                  <th scope="col">PTS</th>
                  <th scope="col">REB</th>
                  <th scope="col">AST</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.id}>
                    <td className="pm-date">{formatDate(g.date, tz)}</td>
                    <td className="pm-opp">
                      <span className="dim">{g.atVs}</span> {g.opp}
                      {g.result && (
                        <span className={`pm-res r-${g.result.toLowerCase()}`}>{g.result}</span>
                      )}
                    </td>
                    <td>{g.stats.MIN ?? '–'}</td>
                    <td>{g.stats.PTS ?? '–'}</td>
                    <td>{g.stats.REB ?? '–'}</td>
                    <td>{g.stats.AST ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim lu-note">No game log available.</p>
        )}
      </div>
    </div>
  )
}
