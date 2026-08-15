import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// A season whose feed names are all national produces an empty LOCAL_CATALOG (the
// NFL viewer lives in this state permanently) — the shelf must vanish, not render
// an empty <details>.
vi.mock('../src/utils/watch.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, LOCAL_CATALOG: [] }
})

import ServicesModal from '../src/components/ServicesModal.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

describe('ServicesModal — no local channels in the data', () => {
  it('hides the local-channel shelf entirely', () => {
    const { container } = render(
      <ServicesProvider>
        <ServicesModal onClose={() => {}} />
      </ServicesProvider>
    )
    expect(container.querySelector('.svc-local')).toBeNull()
    // The national catalog still renders.
    expect(container.querySelectorAll('.svc-item').length).toBeGreaterThan(0)
  })
})
