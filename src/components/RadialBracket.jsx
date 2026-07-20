import { useMemo, useState } from 'react'
import { buildBracket, layout, polar, CENTER, RING } from '../utils/bracket.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import TeamLogo from './TeamLogo.jsx'

function Node({ pos, abbr, label, size, className = '', title, onClick, dim }) {
  const { x, y } = polar(pos.angle, pos.r)
  const style = { left: `${x}%`, top: `${y}%` }
  const team = TEAM_BY_ABBR[abbr]

  return (
    <button
      className={`rb-node ${className} ${dim ? 'is-dim' : ''} ${team ? '' : 'is-empty'}`}
      style={style}
      onClick={() => team && onClick?.(abbr)}
      title={title || team?.displayName || label}
      aria-label={title || team?.displayName || label}
    >
      {team ? <TeamLogo abbr={abbr} size={size} /> : <span className="rb-tbd">{label}</span>}
    </button>
  )
}

export default function RadialBracket({ games, onPick }) {
  const bracket = useMemo(() => buildBracket(games), [games])
  const geo = useMemo(layout, [])
  const [hover, setHover] = useState(null)

  const { rounds, champion, projected, seeded } = bracket
  const bySeed = Object.fromEntries(seeded.map((r) => [r.seed, r]))

  const lines = [
    ...geo.r1.flatMap((m, i) =>
      m.children.map((c) => ({ from: c, to: m, key: `r1-${i}-${c.seed}` }))
    ),
    ...geo.sf.flatMap((s, i) => s.children.map((c, j) => ({ from: c, to: s, key: `sf-${i}-${j}` }))),
    ...geo.sf.map((s, i) => ({ from: s, to: { angle: 0, r: 0 }, key: `f-${i}` })),
  ]

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Radial bracket</h2>
          <p className="sub">
            Seeds on the outside, the title in the middle. Every round advances one ring
            inward.
          </p>
        </div>
      </div>

      {projected && (
        <p className="banner">
          <strong>Projected</strong> from the current standings — the postseason
          hasn&apos;t started.
        </p>
      )}

      <div className="rb" onMouseLeave={() => setHover(null)}>
        <svg className="rb-lines" viewBox="0 0 100 100" aria-hidden="true">
          {lines.map(({ from, to, key }) => {
            const a = polar(from.angle, from.r)
            const b = polar(to.angle, to.r)
            return <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          })}
          <circle cx={CENTER} cy={CENTER} r={RING.leaf} className="rb-ring" />
          <circle cx={CENTER} cy={CENTER} r={RING.R1} className="rb-ring" />
          <circle cx={CENTER} cy={CENTER} r={RING.SF} className="rb-ring" />
        </svg>

        {/* Outer ring — the eight seeds */}
        {geo.leaves.map((leaf, i) => {
          const row = bySeed[leaf.seed]
          const abbr = row?.abbr
          return (
            <span key={`leaf-${leaf.seed}`} onMouseEnter={() => setHover(abbr)}>
              <Node
                pos={leaf}
                abbr={abbr}
                label={`${leaf.seed}`}
                size={34}
                className="rb-leaf"
                dim={hover && hover !== abbr}
                title={row ? `${leaf.seed}. ${row.team.displayName} (${row.w}–${row.l})` : undefined}
                onClick={onPick}
              />
              <span
                className="rb-seed"
                style={{
                  left: `${polar(leaf.angle, RING.leaf + 7).x}%`,
                  top: `${polar(leaf.angle, RING.leaf + 7).y}%`,
                }}
              >
                {leaf.seed}
              </span>
            </span>
          )
        })}

        {/* First-round winners */}
        {geo.r1.map((pos, i) => {
          const w = rounds.R1[i]?.winner
          return (
            <span key={`r1-${i}`} onMouseEnter={() => w && setHover(w)}>
              <Node
                pos={pos}
                abbr={w}
                label="—"
                size={30}
                className="rb-r1"
                dim={hover && hover !== w}
                onClick={onPick}
              />
            </span>
          )
        })}

        {/* Semifinal winners */}
        {geo.sf.map((pos, i) => {
          const w = rounds.SF[i]?.winner
          return (
            <span key={`sf-${i}`} onMouseEnter={() => w && setHover(w)}>
              <Node
                pos={pos}
                abbr={w}
                label="—"
                size={30}
                className="rb-sf"
                dim={hover && hover !== w}
                onClick={onPick}
              />
            </span>
          )
        })}

        {/* Centre */}
        <div className="rb-center">
          {champion ? (
            <>
              <TeamLogo abbr={champion} size={44} />
              <span className="rb-champ">{TEAM_BY_ABBR[champion]?.name}</span>
            </>
          ) : (
            <span className="rb-trophy">🏆</span>
          )}
        </div>
      </div>
    </section>
  )
}
