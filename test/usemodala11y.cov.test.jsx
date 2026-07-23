import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useModalA11y } from '../src/hooks/useModalA11y.js'

// A dialog with three focusable buttons so we can drive the focus trap by hand.
function Dialog({ onClose, isOpen = true, attach = true }) {
  const ref = useModalA11y(onClose, isOpen)
  return (
    <div ref={attach ? ref : undefined} data-testid="dialog" tabIndex={-1}>
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  )
}

// jsdom has no layout, so offsetParent is null for everything, which would make the
// visibility filter drop every focusable. Fake it so the trap has real items to wrap.
function withLayout() {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.parentElement
    },
  })
}

afterEach(() => {
  cleanup()
  delete HTMLElement.prototype.offsetParent
})

describe('useModalA11y — Escape and non-trap keys', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Dialog onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores keys that are neither Escape nor Tab', () => {
    const onClose = vi.fn()
    render(<Dialog onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('useModalA11y — focus trap', () => {
  beforeEach(withLayout)

  it('wraps Tab from the last focusable back to the first', () => {
    const { getByText } = render(<Dialog onClose={() => {}} />)
    const first = getByText('first')
    const last = getByText('last')
    last.focus()
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('wraps Shift+Tab from the first focusable to the last', () => {
    const { getByText } = render(<Dialog onClose={() => {}} />)
    const first = getByText('first')
    const last = getByText('last')
    first.focus()
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('leaves focus alone when Tab is pressed in the middle', () => {
    const { getByText } = render(<Dialog onClose={() => {}} />)
    const middle = getByText('middle')
    middle.focus()

    // Neither end matches, so the hook does not intervene.
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(middle)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(middle)
  })
})

describe('useModalA11y — edge cases', () => {
  it('does nothing on Tab when the dialog holds no focusable items', () => {
    // Force every element off-screen (offsetParent null) so the visibility filter
    // empties the list and the handler bails before touching focus.
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return null
      },
    })
    render(<Dialog onClose={() => {}} />)
    expect(() => fireEvent.keyDown(document, { key: 'Tab' })).not.toThrow()
  })

  it('bails on Tab when the ref was never attached to a node', () => {
    // ref.current stays null, so the `!node` guard short-circuits the trap.
    render(<Dialog onClose={() => {}} attach={false} />)
    expect(() => fireEvent.keyDown(document, { key: 'Tab' })).not.toThrow()
  })
})
