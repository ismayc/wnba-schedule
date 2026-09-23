import { useMemo, useState } from 'react'
import { computeStandings, countsForStandings, PLAYOFF_SPOTS } from '../utils/standings.js'
import {
  OUT,
  MAX_OPEN_GAMES,
  TIEBREAK_STEPS,
  enumerateScenarios,
  favoritePicks,
  meanSeed,
  picksFromMask,
  rankScenario,
  requirements,
} from '../utils/scenarios.js'
import { formatDate, formatTime } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import { TEAM_BY_ABBR } from '../data/teams.js'
import TeamLogo from './TeamLogo.jsx'

const SEEDS = Array.from({ length: OUT }, (_, i) => i + 1)
const seedName = (s) => (s === OUT ? 'out of the playoffs' : `the ${s} seed`)
const winnerOf = (g, side) => (side === 'home' ? g.home : g.away)
const loserOf = (g, side) => (side === 'home' ? g.away : g.home)
const share = (count, total) => {
  const p = (100 * count) / total
  return p < 1 ? '<1%' : `${Math.round(p)}%`
}

// One open game: tap a team to pick it, tap it again to leave the game open.
function GameRow({ game, pick, onPick, tz }) {
  const side = (s) => {
    const abbr = s === 'home' ? game.home : game.away
    const on = pick === s
    return (
      <button
        className={`sc-team ${on ? 'on' : ''} ${pick && !on ? 'lost' : ''}`}
        aria-pressed={on}
        aria-label={`${TEAM_BY_ABBR[abbr].displayName} win`}
        onClick={() => onPick(game.id, on ? null : s)}
      >
        <TeamLogo abbr={abbr} size={22} />
        <span>{abbr}</span>
      </button>
    )
  }
  return (
    <li className="sc-game">
      <span className="sc-when">
        {formatDate(game.tip, tz)} · {game.live ? <span className="sc-live">Live</span> : formatTime(game.tip, tz)}
      </span>
      <span className="sc-pick">
        {side('away')}
        <span className="sc-at">@</span>
        {side('home')}
      </span>
    </li>
  )
}

function Matrix({ result, selected, onSelect, onPickTeam }) {
  const { isFollowed } = useFollow()
  const order = Object.keys(result.teams).sort(
    (a, b) => meanSeed(result.teams[a]) - meanSeed(result.teams[b]) || a.localeCompare(b)
  )
  return (
    <div className="table-scroll">
      <table className="standings sc-matrix">
        <thead>
          <tr>
            <th className="col-team">Team</th>
            {SEEDS.map((s) => (
              <th key={s} className="num">
                {s === OUT ? 'Out' : s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((abbr) => (
            <tr key={abbr} className={isFollowed(abbr) ? 'row-followed' : ''}>
              <td className="col-team">
                <button className="team-btn" onClick={() => onPickTeam?.(abbr)}>
                  <TeamLogo abbr={abbr} size={22} />
                  <span className="team-nick">{abbr}</span>
                </button>
              </td>
              {SEEDS.map((s) => {
                const { count } = result.teams[abbr][s]
                const on = selected?.abbr === abbr && selected.seed === s
                const locked = count === result.total
                return (
                  <td key={s} className="num sc-cell-td">
                    <button
                      className={`sc-cell ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${s === OUT ? 'out' : ''}`}
                      style={{ '--share': count / result.total }}
                      disabled={!count}
                      aria-pressed={on}
                      aria-label={`${abbr} ${seedName(s)}: ${count} of ${result.total} outcomes`}
                      onClick={() => onSelect(on ? null : { abbr, seed: s })}
                    >
                      {!count ? '' : locked ? '✓' : share(count, result.total)}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// What it takes for one team to land in one seed bucket.
function Path({ result, selected, picks, onApply, tz }) {
  const { abbr, seed } = selected
  const cell = result.teams[abbr][seed]
  const team = TEAM_BY_ABBR[abbr]
  if (!cell.count) {
    return (
      <p className="sc-path-lead">
        With these picks, the {team.name} can no longer finish as {seedName(seed)}.
      </p>
    )
  }
  const needs = requirements(cell, result.undecided)
  const lockPicks = { ...picks }
  for (const { game, side } of needs) lockPicks[game.id] = side
  return (
    <div className="sc-path">
      <p className="sc-path-lead">
        {cell.count === result.total ? (
          <>
            <strong>Locked.</strong> The {team.name} finish as {seedName(seed)} in every remaining
            outcome.
          </>
        ) : (
          <>
            The {team.name} finish as {seedName(seed)} in <strong>{cell.count}</strong> of{' '}
            {result.total} possible outcomes.
          </>
        )}
      </p>
      {cell.count < result.total &&
        (needs.length ? (
          <>
            <p className="sc-path-sub">Every one of them needs:</p>
            <ul className="sc-needs">
              {needs.map(({ game, side }) => (
                <li key={game.id}>
                  <TeamLogo abbr={winnerOf(game, side)} size={18} />
                  <strong>{winnerOf(game, side)}</strong> beats {loserOf(game, side)}
                  <span className="dim"> · {formatDate(game.tip, tz)}</span>
                </li>
              ))}
            </ul>
            {needs.length < result.undecided.length && (
              <p className="sc-path-sub">
                Beyond that, it comes down to a combination of the other results.
              </p>
            )}
          </>
        ) : (
          <p className="sc-path-sub">
            No single result is required. It comes down to a combination of results.
          </p>
        ))}
      {cell.margin > 0 && (
        <p className="sc-path-sub sc-margin">
          In {cell.margin} of these outcomes the order comes down to point differential, so the
          final margins could change it.
        </p>
      )}
      {cell.count < result.total && (
        <div className="sc-actions">
          <button className="chip" disabled={!needs.length} onClick={() => onApply(lockPicks)}>
            Pick the required results
          </button>
          <button className="chip" onClick={() => onApply(picksFromMask(result.undecided, cell.example, picks))}>
            Show one way it happens
          </button>
        </div>
      )}
    </div>
  )
}

// A fully decided season: the exact seeding, how ties broke, and the first round.
function Final({ scenario, complete, onPickTeam }) {
  const { rows, trace, marginDependent } = scenario
  const seeds = rows.slice(0, PLAYOFF_SPOTS)
  return (
    <div className="card">
      <h3 className="card-title">{complete ? 'Final seeding' : 'Seeding with your picks'}</h3>
      <ol className="sc-final">
        {rows.map((row, i) => (
          <li key={row.abbr} className={i < PLAYOFF_SPOTS ? '' : 'sc-final-out'}>
            <span className="rank">{i + 1}</span>
            <button className="team-btn" onClick={() => onPickTeam?.(row.abbr)}>
              <TeamLogo abbr={row.abbr} size={22} />
              <span className="team-name">
                <span className="team-loc">{row.team.location}</span>{' '}
                <span className="team-nick">{row.team.name}</span>
              </span>
            </button>
            <span className="num dim">
              {row.w}-{row.l}
            </span>
          </li>
        ))}
      </ol>
      {trace.length > 0 && (
        <>
          <p className="sc-path-sub">Tiebreakers:</p>
          <ul className="sc-ties">
            {trace.map((t, i) => (
              <li key={i}>
                {t.teams.join(' / ')}: {TIEBREAK_STEPS[t.step]}
              </li>
            ))}
          </ul>
        </>
      )}
      {marginDependent && (
        <p className="sc-path-sub sc-margin">
          Picked games count as one-point wins, and point differential decides a tie here, so the
          real margins could change this order.
        </p>
      )}
      <p className="sc-path-sub">First round:</p>
      <ul className="sc-matchups">
        {seeds.slice(0, PLAYOFF_SPOTS / 2).map((top, i) => {
          const low = seeds[PLAYOFF_SPOTS - 1 - i]
          return (
            <li key={top.abbr}>
              <span className="rank">{i + 1}</span> <TeamLogo abbr={top.abbr} size={18} /> {top.abbr}
              <span className="dim"> vs </span>
              <span className="rank">{PLAYOFF_SPOTS - i}</span> <TeamLogo abbr={low.abbr} size={18} />{' '}
              {low.abbr}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function ScenariosView({ games, tz, onPick }) {
  const [rawPicks, setPicks] = useState({})
  const [selected, setSelected] = useState(null)

  const result = useMemo(() => enumerateScenarios(games, rawPicks), [games, rawPicks])
  const { open, undecided } = result
  // Picks for games that have since gone final drop out on their own.
  const picks = useMemo(
    () => Object.fromEntries(open.filter((g) => rawPicks[g.id]).map((g) => [g.id, rawPicks[g.id]])),
    [open, rawPicks]
  )
  const scenario = useMemo(
    () => (undecided.length ? null : rankScenario(games, picks)),
    [games, picks, undecided.length]
  )

  const pickGame = (id, side) =>
    setPicks((cur) => {
      const next = { ...cur }
      if (side) next[id] = side
      else delete next[id]
      return next
    })
  const favorites = () =>
    setPicks(favoritePicks(open, computeStandings(games.filter(countsForStandings))))

  const nPicked = open.length - undecided.length

  return (
    <section className="view scenarios">
      <div className="view-head">
        <div>
          <h2>Scenarios</h2>
          <p className="sub">
            Pick winners for the games that are left. Every combination of the rest is played out
            under the official tiebreakers, so the grid shows each seed a team can still reach.
            Tap a cell to see exactly what it takes.
          </p>
        </div>
        {open.length > 0 && (
          <div className="sc-toolbar">
            <button className="chip" onClick={favorites}>
              Favorites win
            </button>
            <button className="chip" disabled={!nPicked} onClick={() => setPicks({})}>
              Clear picks
            </button>
          </div>
        )}
      </div>

      {open.length === 0 ? (
        <>
          <p className="empty">The regular season is complete, so the seeds are final.</p>
          <Final scenario={scenario} complete onPickTeam={onPick} />
        </>
      ) : (
        <div className="grid-2">
          <div className="card">
            <h3 className="card-title">
              Games left · {nPicked} of {open.length} picked
            </h3>
            <ul className="sc-games">
              {open.map((g) => (
                <GameRow key={g.id} game={g} pick={picks[g.id]} onPick={pickGame} tz={tz} />
              ))}
            </ul>
          </div>

          <div>
            {result.tooMany ? (
              <div className="card">
                <h3 className="card-title">Where every team can finish</h3>
                <p className="sc-path-sub">
                  {undecided.length} games are still open, which is too many to play out every
                  combination. Pick {undecided.length - MAX_OPEN_GAMES} more (or tap Favorites win)
                  to see the grid.
                </p>
              </div>
            ) : scenario ? (
              <Final scenario={scenario} onPickTeam={onPick} />
            ) : (
              <div className="card">
                <h3 className="card-title">
                  Where every team can finish · {result.total.toLocaleString()} outcomes
                </h3>
                <Matrix result={result} selected={selected} onSelect={setSelected} onPickTeam={onPick} />
                {selected && (
                  <Path
                    result={result}
                    selected={selected}
                    picks={picks}
                    onApply={(next) => (setPicks(next), setSelected(null))}
                    tz={tz}
                  />
                )}
                <p className="legend">
                  <span className="legend-item">
                    Each cell is the share of the {result.total.toLocaleString()} ways the open games
                    can go, not a win probability. ✓ means locked.
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
