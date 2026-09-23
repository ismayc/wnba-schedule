import { Fragment, useMemo, useState } from 'react'
import { computeStandings, countsForStandings, PLAYOFF_SPOTS } from '../utils/standings.js'
import {
  OUT,
  MAX_OPEN_GAMES,
  TIEBREAK_STEPS,
  enumerateScenarios,
  favoritePicks,
  meanSeed,
  combinations,
  rowPercents,
  rankScenario,
} from '../utils/scenarios.js'
import { formatDate, formatTime } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import { TEAM_BY_ABBR } from '../data/teams.js'
import TeamLogo from './TeamLogo.jsx'

const SEEDS = Array.from({ length: OUT }, (_, i) => i + 1)
// A cell lists at most this many result combinations, then sums up the rest.
const MAX_COMBOS = 6
const seedName = (s) => (s === OUT ? 'out of the playoffs' : `the ${s} seed`)
const winnerOf = (g, side) => (side === 'home' ? g.home : g.away)
const loserOf = (g, side) => (side === 'home' ? g.away : g.home)
// A share that rounds to 0% is still possible, so it reads "<1%" rather than nothing.
const share = (pct) => (pct ? `${pct}%` : '<1%')

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
              <th key={s} className={`num ${s === OUT ? 'sc-out-col' : ''}`}>
                {s === OUT ? 'Out' : s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((abbr, row) => {
            const out = result.teams[abbr][OUT]
            // With the current picks: out in every outcome, or in the top 8 in every one.
            const eliminated = out.count === result.total
            const clinched = !out.count && !out.maybe
            const percents = rowPercents(result.teams[abbr], result.total)
            return (
              <Fragment key={abbr}>
                <tr className={`${isFollowed(abbr) ? 'row-followed' : ''} ${eliminated ? 'row-elim' : ''}`}>
                  <td className="col-team">
                    <button
                      className="team-btn"
                      aria-label={`${abbr}${clinched ? ', clinched' : ''}${eliminated ? ', eliminated' : ''}`}
                      onClick={() => onPickTeam?.(abbr)}
                    >
                      <TeamLogo abbr={abbr} size={22} />
                      <span className="team-nick">{abbr}</span>
                      {clinched && (
                        <span className="badge badge-in hide-sm" title="In the playoffs in every outcome">
                          ✓
                        </span>
                      )}
                      {eliminated && (
                        <span className="badge badge-out hide-sm" title="Out of the playoffs in every outcome">
                          ✕
                        </span>
                      )}
                    </button>
                  </td>
                  {SEEDS.map((s) => {
                    const { count, maybe } = result.teams[abbr][s]
                    const on = selected?.abbr === abbr && selected.seed === s
                    const locked = count === result.total
                    // A lock on "Out" is elimination, not an achievement: an ✕, not a ✓.
                    const mark = s === OUT ? '✕' : '✓'
                    const text = locked ? mark : count ? share(percents[s]) : ''
                    return (
                      <td key={s} className={`num sc-cell-td ${s === OUT ? 'sc-out-col' : ''}`}>
                        <button
                          className={`sc-cell ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${s === OUT ? 'out' : ''} ${maybe ? 'maybe' : ''}`}
                          style={{ '--share': (count + maybe / 2) / result.total }}
                          disabled={!count && !maybe}
                          aria-pressed={on}
                          aria-label={`${abbr} ${seedName(s)}: ${count} of ${result.total} outcomes${
                            maybe ? `, ${maybe} more depending on margins` : ''
                          }`}
                          onClick={() => onSelect(on ? null : { abbr, seed: s })}
                        >
                          {text}
                          {maybe > 0 && <sup>*</sup>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
                {row + 1 === PLAYOFF_SPOTS && (
                  <tr className="cutline">
                    <td colSpan={SEEDS.length + 1}>
                      <span>Playoff line: top {PLAYOFF_SPOTS} make the postseason</span>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Which tiebreak steps helped place the team, in how many of the outcomes.
function Tiebreaks({ tally, of }) {
  const steps = Object.keys(tally).sort()
  if (!steps.length) return null
  return (
    <>
      <p className="sc-path-sub">Tiebreakers that decide it:</p>
      <ul className="sc-ties">
        {steps.map((step) => (
          <li key={step}>
            {TIEBREAK_STEPS[step]}: in {tally[step].toLocaleString()} of {of.toLocaleString()}
          </li>
        ))}
      </ul>
    </>
  )
}

// What it takes for one team to land in one seed bucket.
function Path({ result, selected, picks, onApply }) {
  const { abbr, seed } = selected
  const cell = result.teams[abbr][seed]
  const team = TEAM_BY_ABBR[abbr]
  const possible = cell.count + cell.maybe
  if (!possible) {
    return (
      <p className="sc-path-lead">
        With these picks, the {team.name} can no longer finish as {seedName(seed)}.
      </p>
    )
  }
  const locked = cell.count === result.total
  const combos = combinations(cell.masks, result.undecided)
  const shown = combos.slice(0, MAX_COMBOS)
  const hidden = combos.slice(MAX_COMBOS)
  const apply = (results) => {
    const next = { ...picks }
    for (const { game, side } of results) next[game.id] = side
    onApply(next)
  }
  return (
    <div className="sc-path">
      <p className="sc-path-lead">
        {locked ? (
          <>
            <strong>Locked.</strong> The {team.name} finish as {seedName(seed)} in every remaining
            outcome.
          </>
        ) : cell.count ? (
          <>
            The {team.name} finish as {seedName(seed)} in <strong>{cell.count.toLocaleString()}</strong>{' '}
            of {result.total.toLocaleString()} outcomes{combos.length > 1 ? ', when:' : ', when'}
          </>
        ) : (
          <>
            The {team.name} can finish as {seedName(seed)} only on point differential, in{' '}
            <strong>{cell.maybe.toLocaleString()}</strong> of {result.total.toLocaleString()} outcomes.
          </>
        )}
      </p>
      {!locked && shown.length > 0 && (
        <ul className="sc-combos">
          {shown.map(({ results, count }) => (
            <li key={results.map((r) => r.game.id + r.side).join()}>
              <button
                className="sc-combo"
                aria-label={`Pick ${results.map(({ game, side }) => `${winnerOf(game, side)} over ${loserOf(game, side)}`).join(', ')}`}
                onClick={() => apply(results)}
              >
                <span className="sc-combo-results">
                  {results.map(({ game, side }, i) => (
                    <span key={game.id}>
                      {i > 0 && <span className="dim"> + </span>}
                      <strong>{winnerOf(game, side)}</strong> beats {loserOf(game, side)}
                    </span>
                  ))}
                </span>
                <span className="sc-combo-count">{count.toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hidden.length > 0 && (
        <p className="sc-path-sub">
          + {hidden.length} more combinations ({hidden.reduce((n, c) => n + c.count, 0).toLocaleString()}{' '}
          outcomes)
        </p>
      )}
      {!locked && shown.length > 0 && (
        <p className="sc-path-sub">
          {combos.length > 1 ? 'Each line lists' : 'Those are'} the only results that matter; the
          other games can go either way. Tap a line to pick it.
        </p>
      )}
      {cell.maybe > 0 && (
        <p className="sc-path-sub sc-margin">
          {cell.count
            ? `In ${cell.maybe.toLocaleString()} more outcomes they could, depending on the final margins.`
            : 'That depends on the final margins.'}{' '}
          A tie there comes down to point differential, and a picked game could finish by
          anywhere from 1 to {result.margin} points (this season's biggest win).
        </p>
      )}
      <Tiebreaks tally={cell.tiebreaks} of={possible} />
    </div>
  )
}

// A fully decided season: the exact seeding, how ties broke, and the first round.
function Final({ scenario, complete, onPickTeam }) {
  const { rows, trace, ranges, margin, marginDependent } = scenario
  const seeds = rows.slice(0, PLAYOFF_SPOTS)
  return (
    <div className="card">
      <h3 className="card-title">{complete ? 'Final seeding' : 'Seeding with your picks'}</h3>
      <ol className="sc-final">
        {rows.map((row, i) => (
          <li key={row.abbr} className={i < PLAYOFF_SPOTS ? '' : 'sc-final-out'}>
            <span className="rank" title={ranges[row.abbr][0] === ranges[row.abbr][1] ? undefined : 'Depends on the final margins'}>
              {ranges[row.abbr][0] === ranges[row.abbr][1]
                ? i + 1
                : `${ranges[row.abbr][0]}–${ranges[row.abbr][1]}`}
            </span>
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
                {t.margin && <span className="sc-margin"> (the final margins could change this)</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {marginDependent && (
        <p className="sc-path-sub sc-margin">
          A picked game has no score, and point differential decides a tie here. A seed shown
          as a range could land anywhere in it, depending on the final margins (1 to {margin}{' '}
          points, this season's biggest win). The list and first round below book every picked
          game as a one-point win.
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
                  />
                )}
                <p className="legend">
                  <span className="legend-item">
                    Each cell is the share of the {result.total.toLocaleString()} ways the open
                    games can go, not a win probability. Each row adds up to 100%, not counting
                    outcomes marked *, whose seed depends on margins. ✓ means the seed is locked,
                    and ✕ under Out means eliminated. * means the seed is also possible in some
                    outcomes depending on the final margins, since point differential is a
                    tiebreaker. Teams are ordered by their average finish, so the playoff line falls
                    after the eight best.
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
