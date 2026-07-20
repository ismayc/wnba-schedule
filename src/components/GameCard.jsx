import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatTime, formatZoneAbbr, liveState, countdown } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

function Side({ abbr, score, winner, hideScores }) {
  const team = TEAM_BY_ABBR[abbr]
  const { isFollowed } = useFollow()
  return (
    <div className={`side ${winner ? 'winner' : ''} ${isFollowed(abbr) ? 'followed' : ''}`}>
      <TeamLogo abbr={abbr} size={32} />
      <span className="side-name">
        <span className="side-loc">{team?.location}</span>
        <span className="side-nick">{team?.name}</span>
      </span>
      {score != null && !hideScores && <span className="side-score">{score}</span>}
    </div>
  )
}

export default function GameCard({ game, tz, hideScores, onOpen }) {
  const state = liveState(game)
  const scored = game.score && !hideScores
  const [hs, as] = game.score || []
  const homeWon = scored && hs > as
  const awayWon = scored && as > hs

  const meta = []
  if (game.venue) meta.push(game.city ? `${game.venue}, ${game.city}` : game.venue)
  if (game.broadcast?.length) meta.push(game.broadcast.slice(0, 3).join(' · '))

  return (
    <article
      className={`game state-${state}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(game)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen?.(game))}
    >
      <div className="game-when">
        {state === 'live' ? (
          <span className="live-badge">
            ● {game.statusLabel || 'LIVE'}
          </span>
        ) : state === 'void' ? (
          <span className="void-badge">{game.canceled ? 'Canceled' : 'Postponed'}</span>
        ) : game.score ? (
          <span className="final-badge">Final{game.ot ? (game.ot > 1 ? `/${game.ot}OT` : '/OT') : ''}</span>
        ) : (
          <>
            <span className="time">{formatTime(game.tip, tz)}</span>
            <span className="zone">{formatZoneAbbr(game.tip, tz)}</span>
          </>
        )}
      </div>

      <div className="game-teams">
        <Side abbr={game.away} score={as} winner={awayWon} hideScores={hideScores} />
        <span className="at">@</span>
        <Side abbr={game.home} score={hs} winner={homeWon} hideScores={hideScores} />
      </div>

      <div className="game-meta">
        {game.note && <span className="note">{game.note}</span>}
        {meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
        {state === 'upcoming' && countdown(game.tip) && (
          <span className="countdown">in {countdown(game.tip)}</span>
        )}
      </div>
    </article>
  )
}
