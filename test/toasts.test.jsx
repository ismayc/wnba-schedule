import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toasts from '../src/components/Toasts.jsx'

const game = { id: 'g1', home: 'MIN', away: 'SEA', score: [90, 86] }
const evt = (over) => ({ id: 'g1', game, key: 'k1', ...over })

describe('Toasts', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<Toasts events={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('announces politely without stealing focus', () => {
    render(<Toasts events={[evt({ kind: 'tipoff' })]} />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('phrases a tipoff', () => {
    render(<Toasts events={[evt({ kind: 'tipoff' })]} />)
    expect(screen.getByText('Tipoff')).toBeInTheDocument()
    expect(screen.getByText('Storm at Lynx')).toBeInTheDocument()
  })

  it('phrases a lead change with the new leader', () => {
    render(<Toasts events={[evt({ kind: 'lead-change', leader: 'SEA', margin: 2 })]} />)
    expect(screen.getByText('Lead change')).toBeInTheDocument()
    expect(screen.getByText('Storm by 2')).toBeInTheDocument()
  })

  it('phrases a close finish, including a tie', () => {
    const { rerender } = render(
      <Toasts events={[evt({ kind: 'nailbiter', leader: 'MIN', margin: 3 })]} />
    )
    expect(screen.getByText('Lynx by 3 in the fourth')).toBeInTheDocument()

    rerender(<Toasts events={[evt({ kind: 'nailbiter', leader: 'tie', margin: 0 })]} />)
    expect(screen.getByText('Tied in the fourth')).toBeInTheDocument()
  })

  it('phrases a final as winner-first, regardless of home or away', () => {
    const { rerender } = render(<Toasts events={[evt({ kind: 'final', leader: 'MIN' })]} />)
    expect(screen.getByText('Lynx 90–86')).toBeInTheDocument()

    // Away winner: the winning score still leads.
    rerender(
      <Toasts
        events={[evt({ kind: 'final', leader: 'SEA', game: { ...game, score: [86, 90] } })]}
      />
    )
    expect(screen.getByText('Storm 90–86')).toBeInTheDocument()
  })

  it('opens the game when clicked', async () => {
    const onOpen = vi.fn()
    render(<Toasts events={[evt({ kind: 'final', leader: 'MIN' })]} onOpen={onOpen} />)
    await userEvent.click(screen.getByText('Lynx 90–86'))
    expect(onOpen).toHaveBeenCalledWith(game)
  })

  it('dismisses by key', async () => {
    const onDismiss = vi.fn()
    render(<Toasts events={[evt({ kind: 'tipoff' })]} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledWith('k1')
  })

  it('stacks several moments at once', () => {
    render(
      <Toasts
        events={[
          evt({ kind: 'final', leader: 'MIN', key: 'a' }),
          evt({ kind: 'tipoff', key: 'b' }),
        ]}
      />
    )
    expect(screen.getAllByLabelText('Dismiss')).toHaveLength(2)
  })
})
