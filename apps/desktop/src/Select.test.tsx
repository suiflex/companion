// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { Select } from './Select'

const OPTIONS = [
  { value: '', label: '—' },
  { value: 'To Do', label: 'To Do' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Done', label: 'Done' },
]

function setup(initial = '') {
  const onChange = vi.fn()
  function Harness() {
    const [value, setValue] = useState(initial)
    return (
      <div>
        <Select
          label="Status"
          value={value}
          options={OPTIONS}
          onChange={(v) => {
            setValue(v)
            onChange(v)
          }}
        />
        <button type="button">outside</button>
      </div>
    )
  }
  render(<Harness />)
  return { onChange, trigger: () => screen.getByLabelText('Status') }
}

afterEach(cleanup)

describe('Select', () => {
  it('shows the current value and opens on click', async () => {
    const { trigger } = setup('In Progress')
    expect(trigger().textContent).toContain('In Progress')
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.click(trigger())
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('marks only the selected option, whatever the cursor is doing', async () => {
    setup('Done')
    await userEvent.click(screen.getByLabelText('Status'))
    const selected = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].textContent).toBe('Done')
  })

  // A native <select> gives all of this away for free; replacing it must not
  // take it back.
  it('opens with the keyboard and moves with the arrows', async () => {
    const { onChange, trigger } = setup('')
    trigger().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeTruthy()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('To Do')
  })

  it('starts from the current value rather than the top of the list', async () => {
    const { onChange, trigger } = setup('In Progress')
    trigger().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('Done')
  })

  it('jumps with Home and End', async () => {
    const { onChange, trigger } = setup('')
    trigger().focus()
    await userEvent.keyboard('{ArrowDown}{End}{Enter}')
    expect(onChange).toHaveBeenCalledWith('Done')
  })

  it('closes on Escape without changing the value', async () => {
    const { onChange, trigger } = setup('To Do')
    trigger().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger().textContent).toContain('To Do')
  })

  it('closes when the click lands outside it', async () => {
    setup('')
    await userEvent.click(screen.getByLabelText('Status'))
    expect(screen.getByRole('listbox')).toBeTruthy()
    await userEvent.click(screen.getByText('outside'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('colours an option and tints its label', async () => {
    render(
      <Select
        label="Priority"
        value="Urgent"
        options={[
          { value: '', label: '—' },
          { value: 'Urgent', label: 'Urgent', tone: 'danger' },
        ]}
        onChange={() => {}}
      />,
    )
    const trigger = screen.getByLabelText('Priority')
    expect(trigger.querySelector('.tone-dot.tone-danger')).toBeTruthy()
    expect(trigger.querySelector('.tone-label.tone-danger')).toBeTruthy()
  })

  it('shows an unset value as hollow rather than as a grey status', async () => {
    render(
      <Select label="Status" value="" options={[{ value: '', label: '—' }]} onChange={() => {}} />,
    )
    expect(screen.getByLabelText('Status').querySelector('.tone-dot.tone-empty')).toBeTruthy()
  })

  it('falls back to neutral for a value with no tone', async () => {
    render(
      <Select
        label="Status"
        value="Waiting on legal"
        options={[{ value: 'Waiting on legal', label: 'Waiting on legal' }]}
        onChange={() => {}}
      />,
    )
    expect(screen.getByLabelText('Status').querySelector('.tone-dot.tone-neutral')).toBeTruthy()
  })

  it('keeps a value it does not recognise selectable', async () => {
    // A note written by another version can hold a status this build has never
    // heard of; dropping it would rewrite the file behind the user's back.
    const onChange = vi.fn()
    render(
      <Select
        label="Status"
        value="Waiting on legal"
        options={[...OPTIONS, { value: 'Waiting on legal', label: 'Waiting on legal' }]}
        onChange={onChange}
      />,
    )
    expect(screen.getByLabelText('Status').textContent).toContain('Waiting on legal')
  })

  // The bug this exists for: the folder picker sits in the editor's action bar,
  // a few pixels above the window's bottom edge, and its panel was drawn off
  // screen — the options were there and unreachable.
  it('opens upwards when there is no room below', async () => {
    const user = userEvent.setup()
    render(<Select label="Folder" value="" options={OPTIONS} onChange={() => {}} />)
    const wrap = screen.getByLabelText('Folder').closest('.select') as HTMLElement
    // jsdom lays nothing out, so the geometry is the thing under test.
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
      top: 700,
      bottom: 740,
    } as DOMRect)
    window.innerHeight = 800
    await user.click(screen.getByLabelText('Folder'))
    expect(wrap.querySelector('.select-list.up')).toBeTruthy()
  })

  it('opens downwards when it fits', async () => {
    const user = userEvent.setup()
    render(<Select label="Folder" value="" options={OPTIONS} onChange={() => {}} />)
    const wrap = screen.getByLabelText('Folder').closest('.select') as HTMLElement
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({ top: 40, bottom: 80 } as DOMRect)
    window.innerHeight = 800
    await user.click(screen.getByLabelText('Folder'))
    expect(wrap.querySelector('.select-list')).toBeTruthy()
    expect(wrap.querySelector('.select-list.up')).toBeNull()
  })
})
