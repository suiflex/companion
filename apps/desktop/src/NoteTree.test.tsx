// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@meetcc/shared/i18n'
import { NoteTree } from './NoteTree'
import type { TreeFolder } from './tree'

const ROOT: TreeFolder = {
  path: '',
  name: '',
  folders: [
    {
      path: 'Projects',
      name: 'Projects',
      folders: [],
      notes: [
        {
          rel: 'Projects/quarterly.md',
          title: 'Quarterly notes',
          platform: 'google-meet',
          source: 'Google Meet',
          updatedAt: '2026-09-26T10:00:00.000Z',
        },
      ],
    },
  ],
  notes: [],
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('NoteTree sidebar controls', () => {
  it('keeps folder creation separate from expansion and shows note metadata', async () => {
    const user = userEvent.setup()
    const onAddFolder = vi.fn()
    render(
      <NoteTree
        root={ROOT}
        selected={null}
        onOpen={vi.fn()}
        onMove={vi.fn()}
        onAddFolder={onAddFolder}
      />,
    )

    const folder = screen.getByRole('button', { name: /Projects\s*1/ })
    const addFolder = screen.getByRole('button', {
      name: t('desktop.vault.newFolderIn', { folder: 'Projects' }),
    })

    await user.click(addFolder)
    expect(onAddFolder).toHaveBeenCalledWith('Projects')
    expect(folder.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Quarterly notes')).toBeTruthy()
    expect(screen.getByText('Google Meet')).toBeTruthy()

    await user.click(folder)
    expect(folder.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Quarterly notes')).toBeNull()
  })

  it('keeps nested folder state independent of sibling folders', async () => {
    const user = userEvent.setup()
    const root: TreeFolder = {
      path: '',
      name: '',
      notes: [],
      folders: [
        {
          path: 'Rapat',
          name: 'Rapat',
          notes: [],
          folders: [{
            path: 'Rapat/2026-09-26',
            name: '2026-09-26',
            folders: [],
            notes: [{ rel: 'Rapat/2026-09-26/meeting.md', title: 'Meeting outcome' }],
          }],
        },
        {
          path: 'Other',
          name: 'Other',
          folders: [],
          notes: [{ rel: 'Other/plan.md', title: 'Project plan' }],
        },
      ],
    }
    render(
      <NoteTree root={root} selected={null} onOpen={vi.fn()} onMove={vi.fn()} onAddFolder={vi.fn()} />,
    )

    const parent = screen.getByRole('button', { name: /Rapat\s*1/ })
    const child = screen.getByRole('button', { name: /2026-09-26\s*1/ })
    await user.click(child)
    expect(screen.queryByText('Meeting outcome')).toBeNull()
    expect(screen.getByText('Project plan')).toBeTruthy()

    await user.click(parent)
    await user.click(parent)
    expect(screen.getByRole('button', { name: /2026-09-26\s*1/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Meeting outcome')).toBeNull()
  })
})
