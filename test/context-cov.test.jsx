import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'
import { ServicesProvider, useServices } from '../src/context/services.jsx'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── follow context ─────────────────────────────────────────────────────────
function FollowProbe() {
  const { count, toggle, clear, isFollowed } = useFollow()
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="has">{String(isFollowed('MIN'))}</span>
      <button onClick={() => toggle('MIN')}>min</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

describe('follow context — fallback with no provider', () => {
  it('exposes inert toggle/clear/isFollowed that never throw or change state', async () => {
    render(<FollowProbe />)
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.getByTestId('has').textContent).toBe('false')

    await userEvent.click(screen.getByRole('button', { name: 'min' }))
    await userEvent.click(screen.getByRole('button', { name: 'clear' }))
    // The fallback ignores writes, so nothing moved.
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})

describe('follow context — persistence failure', () => {
  it('swallows a localStorage write that throws (private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota / private mode')
    })
    // The persist effect throws internally but is caught; render still succeeds.
    expect(() =>
      render(
        <FollowProvider>
          <FollowProbe />
        </FollowProvider>
      )
    ).not.toThrow()
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})

// ── services context ───────────────────────────────────────────────────────
function ServicesProbe() {
  const { services, has, toggle, clear, count } = useServices()
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="list">{services.join(',')}</span>
      <span data-testid="has">{String(has('peacock'))}</span>
      <button onClick={() => toggle('peacock')}>peacock</button>
      <button onClick={() => toggle('bogus')}>bogus</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

describe('services context — provider actions', () => {
  it('adds, ignores invalid keys, removes, and clears', async () => {
    render(
      <ServicesProvider>
        <ServicesProbe />
      </ServicesProvider>
    )
    const count = () => screen.getByTestId('count').textContent

    await userEvent.click(screen.getByRole('button', { name: 'peacock' })) // add
    expect(count()).toBe('1')
    expect(screen.getByTestId('has').textContent).toBe('true')
    expect(screen.getByTestId('list').textContent).toBe('peacock')

    await userEvent.click(screen.getByRole('button', { name: 'bogus' })) // not in catalog → no-op
    expect(count()).toBe('1')

    await userEvent.click(screen.getByRole('button', { name: 'peacock' })) // remove
    expect(count()).toBe('0')

    await userEvent.click(screen.getByRole('button', { name: 'peacock' })) // add again
    await userEvent.click(screen.getByRole('button', { name: 'clear' })) // clear all
    expect(count()).toBe('0')
  })
})

describe('services context — fallback with no provider', () => {
  it('exposes inert has/toggle/clear that never throw or change state', async () => {
    render(<ServicesProbe />)
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.getByTestId('has').textContent).toBe('false')

    await userEvent.click(screen.getByRole('button', { name: 'peacock' }))
    await userEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})

describe('services context — restoring from localStorage', () => {
  it('starts empty when the saved value is corrupt', () => {
    localStorage.setItem('wnba:services', 'not json')
    render(
      <ServicesProvider>
        <ServicesProbe />
      </ServicesProvider>
    )
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('starts empty when the saved value is valid JSON but not an array', () => {
    localStorage.setItem('wnba:services', JSON.stringify({ peacock: true }))
    render(
      <ServicesProvider>
        <ServicesProbe />
      </ServicesProvider>
    )
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('drops saved keys the catalog no longer defines', () => {
    localStorage.setItem('wnba:services', JSON.stringify(['peacock', 'gonesvc']))
    render(
      <ServicesProvider>
        <ServicesProbe />
      </ServicesProvider>
    )
    expect(screen.getByTestId('list').textContent).toBe('peacock')
    expect(screen.getByTestId('count').textContent).toBe('1')
  })
})

describe('services context — persistence failure', () => {
  it('swallows a localStorage write that throws (private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota / private mode')
    })
    expect(() =>
      render(
        <ServicesProvider>
          <ServicesProbe />
        </ServicesProvider>
      )
    ).not.toThrow()
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})
