import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ServicesModal from '../src/components/ServicesModal.jsx'
import { LOCAL_CATALOG } from '../src/utils/watch.js'
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

// ── ServicesModal — local-channel shelf ────────────────────────────────────
describe('ServicesModal — local & regional channels', () => {
  const open = () =>
    render(
      <ServicesProvider>
        <ServicesModal onClose={() => {}} />
      </ServicesProvider>
    )

  // The shelf renders LOCAL_CATALOG in order, so its first checkbox IS
  // LOCAL_CATALOG[0] — data-independent, no name matching (labels like
  // "Victory+" vs "Victory+ ATL" make accessible-name queries ambiguous).
  const firstLocalBox = (container) =>
    container.querySelector('details.svc-local input[type="checkbox"]')

  it('starts collapsed when no local channel is selected, and stays put across toggles', () => {
    const { container } = open()
    const shelf = container.querySelector('details.svc-local')
    expect(shelf).not.toHaveAttribute('open')

    // Open the shelf the way a browser does: flip the DOM state, fire `toggle`.
    shelf.open = true
    fireEvent(shelf, new Event('toggle'))
    expect(shelf).toHaveAttribute('open')

    // Checking a channel re-renders the modal — the shelf must not snap shut.
    fireEvent.click(firstLocalBox(container))
    expect(shelf).toHaveAttribute('open')
    expect(JSON.parse(localStorage.getItem('wnba:services'))).toContain(LOCAL_CATALOG[0].key)
  })

  it('starts open (channel checked and highlighted) when a local pick is saved', () => {
    localStorage.setItem('wnba:services', JSON.stringify([LOCAL_CATALOG[0].key]))
    const { container } = open()
    expect(container.querySelector('details.svc-local')).toHaveAttribute('open')
    const box = firstLocalBox(container)
    expect(box).toBeChecked()
    expect(box.closest('.svc-item')).toHaveClass('on')
  })

  it('lists every channel the data names, in catalog order, tagged with its team', () => {
    const { container } = open()
    const items = [...container.querySelectorAll('.svc-local .svc-item')]
    expect(items.map((el) => el.querySelector('.svc-name').textContent)).toEqual(
      LOCAL_CATALOG.map((s) => s.label)
    )
    items.forEach((el, i) =>
      expect(el.querySelector('.svc-kind').textContent).toBe(LOCAL_CATALOG[i].team || 'Local')
    )
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
