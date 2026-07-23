import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ServicesModal from '../src/components/ServicesModal.jsx'
import TeamLogo from '../src/components/TeamLogo.jsx'
import Toasts from '../src/components/Toasts.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── ServicesModal — backdrop click ─────────────────────────────────────────
describe('ServicesModal — backdrop dismissal', () => {
  const open = (onClose) =>
    render(
      <ServicesProvider>
        <ServicesModal onClose={onClose} />
      </ServicesProvider>
    )

  it('closes on a mousedown that starts on the backdrop itself', () => {
    const onClose = vi.fn()
    const { container } = open(onClose)
    const wrap = container.querySelector('.modal-wrap')
    fireEvent.mouseDown(wrap)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on a mousedown that starts inside the dialog', () => {
    const onClose = vi.fn()
    open(onClose)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ── TeamLogo — missing team ────────────────────────────────────────────────
describe('TeamLogo', () => {
  it('renders two theme variants for a known team', () => {
    const { container } = render(<TeamLogo abbr="MIN" />)
    expect(container.querySelector('.logo-light')).toBeInTheDocument()
    expect(container.querySelector('.logo-dark')).toBeInTheDocument()
  })

  it('renders nothing for an unknown team abbreviation', () => {
    const { container } = render(<TeamLogo abbr="ZZZ" />)
    expect(container).toBeEmptyDOMElement()
  })
})

// ── Toasts — remaining branches ────────────────────────────────────────────
const game = { id: 'g1', home: 'MIN', away: 'SEA', score: [90, 86] }
const evt = (over) => ({ id: 'g1', game, key: 'k1', ...over })

describe('Toasts — describe() edge cases', () => {
  it('falls back to a neutral bullet for an unrecognized kind', () => {
    const { container } = render(<Toasts events={[evt({ kind: 'mystery' })]} />)
    expect(container.querySelector('.toast-icon').textContent).toBe('•')
    // No label text for an unknown kind.
    expect(container.querySelector('.toast-label').textContent).toBe('')
  })

  it('says just "Final" when a game ended tied', () => {
    render(<Toasts events={[evt({ kind: 'final', leader: 'tie' })]} />)
    // Both the label and the body read "Final" for a tie.
    expect(screen.getAllByText('Final')).toHaveLength(2)
  })

  it('uses the raw abbreviation when the team is not in the catalog', () => {
    render(<Toasts events={[evt({ kind: 'lead-change', leader: 'XYZ', margin: 4 })]} />)
    expect(screen.getByText('XYZ by 4')).toBeInTheDocument()
  })
})
