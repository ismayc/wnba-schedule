import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatTime, formatZoneAbbr, liveState, countdown, isImminent } from '../utils/time.js'
import { watchableServices, broadcastNotBadged } from '../utils/watch.js'
import { useFollow } from '../context/follow.jsx'
import { useServices } from '../context/services.jsx'
import TeamLogo from './TeamLogo.jsx'

// Halftime and end-of-quarter are stable states; a running clock is not. Falls back
// to ESPN's own label when the period is unknown.
export function livePeriod(game) {
  const label = game.statusLabel || ''
  if (/half/i.test(label)) return 'HALF'
  if (/end/i.test(label)) return label.toUpperCase()
  const p = game.period
  if (!p) return label.toUpperCase() || 'LIVE'
  return p > 4 ? (p - 4 > 1 ? `OT${p - 4}` : 'OT') : `Q${p}`
}

function Side({ abbr, score, winner, hideScores }) {
  const team = TEAM_BY_ABBR[abbr]
  const { isFollowed, toggle } = useFollow()
  const on = isFollowed(abbr)

  return (
    <div className={`side ${winner ? 'winner' : ''} ${on ? 'followed' : ''}`}>
      <button
        className={`star ${on ? 'on' : ''}`}
        // The whole card is a button that opens the game detail, so the star has to
        // stop the click from reaching it — otherwise following also opens a modal.
        onClick={(e) => {
          e.stopPropagation()
          toggle(abbr)
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-pressed={on}
        aria-label={`${on ? 'Unfollow' : 'Follow'} ${team?.displayName || abbr}`}
        title={`${on ? 'Unfollow' : 'Follow'} ${team?.displayName || abbr}`}
      >
        {on ? '★' : '☆'}
      </button>
      <TeamLogo abbr={abbr} size={32} />
      <span className="side-name">
        <span className="side-loc">{team?.location}</span>
        <span className="side-nick">{team?.name}</span>
      </span>
      {score != null && !hideScores && <span className="side-score">{score}</span>}
    </div>
  )
}

// The when-column: live period, void badge, final, or tip time — shared by the regular
// and All-Star cards.
function Timing({ game, tz, state }) {
  return (
    <div className="game-when">
      {state === 'live' ? (
        // A basketball score changes every ~35 seconds, so anything shown here is stale
        // by up to one refresh. The period is durable enough to display; the exact game
        // clock is not, so it stays in the tooltip.
        <span className="live-badge" title={`${game.statusLabel || 'Live'} — as of the last refresh`}>
          ● {livePeriod(game)}
        </span>
      ) : state === 'void' ? (
        <span className="void-badge">{game.canceled ? 'Canceled' : 'Postponed'}</span>
      ) : game.score ? (
        <span className="final-badge">Final{game.ot ? (game.ot > 1 ? `/${game.ot}OT` : '/OT') : ''}</span>
      ) : (
        <>
          <span className="time">{formatTime(game.tip, tz)}</span>
          <span className="zone">{formatZoneAbbr(game.tip, tz)}</span>
          {isImminent(game) && (
            // Near tip but the feed still says pre — make it clear the app is watching
            // for the opening jump rather than sitting idle. ESPN flips to live only at
            // the actual tip, which trails the listed time by the pre-game window.
            <span className="pregame-badge" title="Scheduled tip — watching for the opening jump">
              Pre-game
            </span>
          )}
        </>
      )}
    </div>
  )
}

// The 📺 badge + the leftover networks, shared by both card types.
function Meta({ game, watch, lead, extra }) {
  const meta = []
  if (game.venue) meta.push(game.city ? `${game.venue}, ${game.city}` : game.venue)
  // Drop any network already shown as a badge (e.g. "Peacock") so it isn't repeated; a
  // bundle badge's underlying network (ESPN for YouTube TV) still shows.
  const networks = broadcastNotBadged(game.broadcast, watch)
  if (networks.length) meta.push(networks.slice(0, 3).join(' · '))

  return (
    <div className="game-meta">
      {lead}
      {meta.map((m) => (
        <span key={m}>{m}</span>
      ))}
      {watch.length > 0 && (
        <span className="watch" aria-label={`Watch on ${watch.map((s) => s.label).join(', ')}`}>
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
      {extra}
    </div>
  )
}

export default function GameCard({ game, tz, hideScores, onOpen }) {
  const { services } = useServices()
  const state = liveState(game)
  const scored = game.score && !hideScores
  const [hs, as] = game.score || []
  const homeWon = scored && hs > as
  const awayWon = scored && as > hs

  // Which of the viewer's chosen services carry this game — a 📺 icon plus a label
  // per service. Empty (no badge) until the viewer picks services.
  const watch = watchableServices(game.broadcast, services)

  const open = () => onOpen?.(game)
  const onKey = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())

  // The All-Star Game's sides are captain-drafted (no franchise, no logo), so it reads as
  // an event rather than a matchup of the 15 teams.
  if (game.seasonType === 'allstar') {
    return (
      <article className="game allstar" role="button" tabIndex={0} onClick={open} onKeyDown={onKey}>
        <Timing game={game} tz={tz} state={state} />
        <div className="allstar-body">
          <span className="allstar-tag">⭐ {game.note || 'All-Star Game'}</span>
          <span className="allstar-matchup">
            <span className="allstar-team">{game.awayName || game.away}</span>
            {scored ? (
              <span className="allstar-score">
                {as} – {hs}
              </span>
            ) : (
              <span className="allstar-vs">vs</span>
            )}
            <span className="allstar-team">{game.homeName || game.home}</span>
          </span>
        </div>
        <Meta
          game={game}
          watch={watch}
          extra={
            state === 'upcoming' &&
            countdown(game.tip) && <span className="countdown">in {countdown(game.tip)}</span>
          }
        />
      </article>
    )
  }

  return (
    <article className={`game state-${state}`} role="button" tabIndex={0} onClick={open} onKeyDown={onKey}>
      <Timing game={game} tz={tz} state={state} />

      <div className="game-teams">
        <Side abbr={game.away} score={as} winner={awayWon} hideScores={hideScores} />
        <span className="at">@</span>
        <Side abbr={game.home} score={hs} winner={homeWon} hideScores={hideScores} />
      </div>

      <Meta
        game={game}
        watch={watch}
        lead={game.note && <span className="note">{game.note}</span>}
        extra={
          state === 'upcoming' &&
          countdown(game.tip) && <span className="countdown">in {countdown(game.tip)}</span>
        }
      />
    </article>
  )
}
