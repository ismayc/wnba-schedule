import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// Every channel in the committed schedule currently resolves to a single team, so
// the modal's unattributed fallback tag ("Local") can only be exercised with a
// synthetic catalog — a feed whose games never share one team keeps team: null.
vi.mock('../src/utils/watch.js', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    LOCAL_CATALOG: [
      { key: 'local:Shared Feed', label: 'Shared Feed', kind: 'local', team: null, match: () => true },
    ],
  }
})

import ServicesModal from '../src/components/ServicesModal.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

describe('ServicesModal — a local channel with no single team', () => {
  it('falls back to a plain Local tag', () => {
    const { container } = render(
      <ServicesProvider>
        <ServicesModal onClose={() => {}} />
      </ServicesProvider>
    )
    const item = container.querySelector('.svc-local .svc-item')
    expect(item.querySelector('.svc-name').textContent).toBe('Shared Feed')
    expect(item.querySelector('.svc-kind').textContent).toBe('Local')
  })
})
