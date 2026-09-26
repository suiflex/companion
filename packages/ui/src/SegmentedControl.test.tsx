// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

const OPTIONS = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

afterEach(cleanup)

describe('SegmentedControl', () => {
  it('updates the pressed option and emits its value', async () => {
    const onChange = vi.fn()
    function Harness() {
      const [value, setValue] = useState('dark')
      return (
        <SegmentedControl
          options={OPTIONS}
          value={value}
          ariaLabel="Theme"
          onChange={(next) => {
            setValue(next)
            onChange(next)
          }}
        />
      )
    }

    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Light' }))

    expect(onChange).toHaveBeenCalledWith('light')
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('preserves tab semantics when used for navigation', () => {
    render(
      <SegmentedControl
        options={OPTIONS}
        value="light"
        ariaLabel="Appearance sections"
        role="tablist"
        onChange={() => {}}
      />,
    )

    expect(screen.getByRole('tablist', { name: 'Appearance sections' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Light' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Dark' }).getAttribute('aria-selected')).toBe('false')
  })
})
