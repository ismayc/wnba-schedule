import { useMemo } from 'react'
import { buildBracket, PLAYOFF_ROUNDS } from '../utils/bracket.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatDate } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

// One dot per game in the series: filled for a played game, hollow for one still to
// come. Reads faster than a scoreline when scanning a bracket.
// Each dot that HAS a game is a button onto that game's box score — the dots are the
// only per-game handle the bracket offers, so making them inert wasted the one place
// you'd naturally click to ask "what happened in game 3?". Hollow dots are games that
// don't exist (a sweep leaves two of them), so they stay inert.
function SeriesDots({ series, team, onOpen }) {
  const played = series.games.filter((g) => g.score)
  return (
    <span className="dots">
      {Array.from({ length: series.bestOf }, (_, i) => {
        const g = played[i]
        if (!g) return <i key={i} className="dot-empty" aria-hidden="true" />
        const winner = g.score[0] > g.score[1] ? g.home : g.away
        const label = `Game ${g.game ?? i + 1}: ${TEAM_BY_ABBR[g.away]?.name} ${g.score[1]}, ${
          TEAM_BY_ABBR[g.home]?.name
        } ${g.score[0]}`
        return (
          <button
            key={i}
            type="button"
            className={`dot ${winner === team ? 'dot-w' : 'dot-l'}`}
            title={label}
            aria-label={label}
            onClick={() => onOpen?.(g)}
          />
        )
      })}
    </span>
  )
}

function Side({ abbr, label, seed, wins, isWinner, decided, onPick }) {
  const team = TEAM_BY_ABBR[abbr]
  const { isFollowed } = useFollow()

  if (!team) {
    return (
      <div className="bx-side bx-empty">
        <span className="bx-feeder">{label || 'TBD'}</span>
      </div>
    )
  }

  return (
    <div
      className={`bx-side ${isWinner ? 'bx-won' : decided ? 'bx-lost' : ''} ${
        isFollowed(abbr) ? 'followed' : ''
      }`}
    >
      {seed && <span className="bx-seed">{seed}</span>}
      <button className="bx-team" onClick={() => onPick?.(abbr)}>
        <TeamLogo abbr={abbr} size={24} />
        <span className="bx-name">{team.name}</span>
      </button>
      <span className="bx-wins">{wins}</span>
    </div>
  )
}

function Series({ series, onPick, tz, onOpen }) {
  const [a, b] = series.order
  const decided = series.complete
  const next = series.games.find((g) => !g.score)

  return (
    <div
      className={`bx-series ${series.projected ? 'is-proj' : ''} ${series.live ? 'is-live' : ''} ${
        decided ? 'is-done' : ''
      }`}
    >
      <Side
        abbr={a}
        label={series.feeders?.[0]}
        seed={series.seeds?.[0]}
        wins={series.wins[a] ?? 0}
        isWinner={series.winner === a}
        decided={decided}
        onPick={onPick}
      />
      <Side
        abbr={b}
        label={series.feeders?.[1]}
        seed={series.seeds?.[1]}
        wins={series.wins[b] ?? 0}
        isWinner={series.winner === b}
        decided={decided}
        onPick={onPick}
      />
      <div className="bx-foot">
        <span className="bx-bo">Best of {series.bestOf}</span>
        {series.games.length > 0 && <SeriesDots series={series} team={a} onOpen={onOpen} />}
        {next && <span className="bx-next">Game {next.game} · {formatDate(next.tip, tz)}</span>}
        {series.live && <span className="bx-live">● LIVE</span>}
      </div>
    </div>
  )
}

// The bracket itself, without the page heading around it.
//
// Split out from the Playoffs view so the History tab can render an archived season
// through exactly this component. A historical season ships its final standings, only its
// playoff games, and its OWN series lengths (the Finals grew from best-of-5 to best-of-7
// in 2025), so it passes `seeds` and `lengths` in rather than having them assumed.
export function BracketBody({ games, seeds, lengths, tz, onPick, onOpen }) {
  const bracket = useMemo(() => buildBracket(games, { seeds, lengths }), [games, seeds, lengths])
  const { rounds, champion, projected, seeded } = bracket

  return (
    <>
      {projected && (
        <p className="banner">
          <strong>Projected.</strong> The postseason hasn&apos;t started, so this is the
          bracket you&apos;d get if the regular season ended today.
        </p>
      )}

      {champion && (
        <p className="banner banner-champ">
          🏆 <strong>{TEAM_BY_ABBR[champion]?.displayName}</strong> win the title.
        </p>
      )}

      <div className="bx">
        <div className="bx-col">
          <h4 className="bx-round">{PLAYOFF_ROUNDS.R1}</h4>
          <Series series={rounds.R1[0]} onPick={onPick} tz={tz} onOpen={onOpen} />
          <Series series={rounds.R1[1]} onPick={onPick} tz={tz} onOpen={onOpen} />
        </div>
        <div className="bx-col bx-col-mid">
          <h4 className="bx-round">{PLAYOFF_ROUNDS.SF}</h4>
          <Series series={rounds.SF[0]} onPick={onPick} tz={tz} onOpen={onOpen} />
        </div>
        <div className="bx-col bx-col-final">
          <h4 className="bx-round">{PLAYOFF_ROUNDS.Final}</h4>
          <Series series={rounds.Final[0]} onPick={onPick} tz={tz} onOpen={onOpen} />
        </div>
        <div className="bx-col bx-col-mid">
          <h4 className="bx-round">{PLAYOFF_ROUNDS.SF}</h4>
          <Series series={rounds.SF[1]} onPick={onPick} tz={tz} onOpen={onOpen} />
        </div>
        <div className="bx-col">
          <h4 className="bx-round">{PLAYOFF_ROUNDS.R1}</h4>
          <Series series={rounds.R1[2]} onPick={onPick} tz={tz} onOpen={onOpen} />
          <Series series={rounds.R1[3]} onPick={onPick} tz={tz} onOpen={onOpen} />
        </div>
      </div>

      {projected && (
        <div className="card">
          <h3 className="card-title">The field, as it stands</h3>
          <ol className="bx-field">
            {seeded.map((r) => (
              <li key={r.abbr}>
                <span className="bx-field-seed">{r.seed}</span>
                <TeamLogo abbr={r.abbr} size={20} />
                <span>{r.team.name}</span>
                <span className="dim">
                  {r.w}–{r.l}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}

export default function Bracket({ games, tz, onPick, onOpen }) {
  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Playoffs</h2>
          <p className="sub">
            Eight teams, seeded 1–8 by record. First round is best-of-3, semifinals
            best-of-5, the Finals best-of-7. The bracket is fixed — semifinal pairings
            don&apos;t re-seed.
          </p>
        </div>
      </div>

      <BracketBody games={games} tz={tz} onPick={onPick} onOpen={onOpen} />
    </section>
  )
}
