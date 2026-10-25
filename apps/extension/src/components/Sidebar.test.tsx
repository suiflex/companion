// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisRecord, Meeting } from '@meetcc/shared'
import { t } from '@meetcc/shared/i18n'
import { Sidebar } from './Sidebar'

vi.mock('../lib/db', () => ({
  listProjects: vi.fn(async () => []),
  listSessions: vi.fn(async () => []),
}))
vi.mock('../lib/sponsor', () => ({ activeSponsorLinks: () => [] }))

const meetings: Meeting[] = [
  {
    id: 'project-sync-1',
    meta: { id: 'project-sync-1', startedAt: '2026-09-20T10:00:00Z', lastSeenAt: '2026-09-20T10:30:00Z' },
    entries: [{ speaker: 'Rani', text: 'Bahas roadmap.', time: '2026-09-20T10:10:00Z' }],
  },
  {
    id: 'project-sync-2',
    meta: { id: 'project-sync-2', startedAt: '2026-09-21T10:00:00Z', lastSeenAt: '2026-09-21T10:30:00Z' },
    entries: [{ speaker: 'Dimas', text: 'Review milestone.', time: '2026-09-21T10:10:00Z' }],
  },
  {
    id: 'project-sync-3',
    meta: { id: 'project-sync-3', startedAt: '2026-09-22T09:00:00Z', lastSeenAt: '2026-09-22T09:59:58Z' },
    entries: [{ speaker: 'Rani', text: 'Tindak lanjut.', time: '2026-09-22T09:10:00Z' }],
  },
]

function renderSidebar(
  onExportMeetings: (ids: string[]) => Promise<string[]>,
  onDeleteMeetings: (ids: string[]) => Promise<string[] | null> = async () => [],
  onMergeMeetings: (ids: string[], targetId: string) => Promise<boolean> = async () => true,
) {
  return render(
    <Sidebar
      meetings={meetings}
      loading={false}
      records={{} as Record<string, AnalysisRecord>}
      titles={{
        'project-sync-1': 'Project Sync 1',
        'project-sync-2': 'Project Sync 2',
        'project-sync-3': 'Project Sync 3',
      }}
      now={Date.parse('2026-09-22T10:00:00Z')}
      selectedId={null}
      activeView='meeting'
      onSelect={vi.fn()}
      onSettings={vi.fn()}
      onDecisions={vi.fn()}
      onKnowledge={vi.fn()}
      onSearch={vi.fn()}
      onDelete={vi.fn()}
      onExportMeetings={onExportMeetings}
      onDeleteMeetings={onDeleteMeetings}
      onMergeMeetings={onMergeMeetings}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('sidebar multi-meeting export', () => {
  it('retries only failed meetings after a partial desktop transfer', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    })
    const onExportMeetings = vi.fn()
      .mockResolvedValueOnce(['project-sync-2'])
      .mockResolvedValueOnce([])
    const user = userEvent.setup()
    renderSidebar(onExportMeetings)

    await user.click(screen.getByRole('button', { name: t('ext.sidebar.selectMeetings') }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 1/ }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 2/ }))
    await user.click(screen.getByRole('button', { name: t('ext.sidebar.sendMeetingsToDesktop', { count: 2 }) }))

    await waitFor(() => expect(onExportMeetings).toHaveBeenCalledTimes(1))
    expect(onExportMeetings).toHaveBeenNthCalledWith(1, ['project-sync-1', 'project-sync-2'])
    expect((screen.getByRole('checkbox', { name: /Project Sync 1/ }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: /Project Sync 2/ }) as HTMLInputElement).checked).toBe(true)

    await user.click(screen.getByRole('button', { name: t('ext.sidebar.sendMeetingsToDesktop', { count: 1 }) }))
    await waitFor(() => expect(onExportMeetings).toHaveBeenCalledTimes(2))
    expect(onExportMeetings).toHaveBeenNthCalledWith(2, ['project-sync-2'])
    expect(screen.queryByRole('checkbox', { name: /Project Sync/ })).toBeNull()
  })
  it('retries only undeleted meetings after a partial bulk delete', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    })
    const onDeleteMeetings = vi.fn()
      .mockResolvedValueOnce(['project-sync-2'])
      .mockResolvedValueOnce([])
    const user = userEvent.setup()
    renderSidebar(vi.fn(async () => []), onDeleteMeetings)

    await user.click(screen.getByRole('button', { name: t('ext.sidebar.selectMeetings') }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 1/ }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 2/ }))
    await user.click(screen.getByRole('button', { name: t('ext.sidebar.deleteSelectedMeetings', { count: 2 }) }))

    await waitFor(() => expect(onDeleteMeetings).toHaveBeenCalledTimes(1))
    expect(onDeleteMeetings).toHaveBeenNthCalledWith(1, ['project-sync-1', 'project-sync-2'])
    expect((screen.getByRole('checkbox', { name: /Project Sync 1/ }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: /Project Sync 2/ }) as HTMLInputElement).checked).toBe(true)

    await user.click(screen.getByRole('button', { name: t('ext.sidebar.deleteSelectedMeetings', { count: 1 }) }))
    await waitFor(() => expect(onDeleteMeetings).toHaveBeenCalledTimes(2))
    expect(onDeleteMeetings).toHaveBeenNthCalledWith(2, ['project-sync-2'])
    expect(screen.queryByRole('checkbox', { name: /Project Sync/ })).toBeNull()
  })

  it('defaults a live meeting as the destination and requires modal confirmation', async () => {
    const onMergeMeetings = vi.fn(async () => true)
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    })
    const user = userEvent.setup()
    renderSidebar(vi.fn(async () => []), async () => [], onMergeMeetings)

    await user.click(screen.getByRole('button', { name: t('ext.sidebar.selectMeetings') }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 1/ }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 2/ }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 3/ }))

    const target = screen.getByLabelText(t('ext.sidebar.mergeTarget')) as HTMLSelectElement
    expect(target.value).toBe('project-sync-3')
    expect(target.disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: t('ext.sidebar.mergeSelectedMeetings', { count: 3 }) }))

    expect(screen.getByText(t('ext.sidebar.liveMeetingMergeWarning'))).toBeTruthy()
    expect(onMergeMeetings).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: t('ext.sidebar.confirmMergeAction') }))

    await waitFor(() =>
      expect(onMergeMeetings).toHaveBeenCalledWith(
        ['project-sync-1', 'project-sync-2', 'project-sync-3'],
        'project-sync-3',
      ),
    )
    expect(screen.queryByRole('checkbox', { name: /Project Sync/ })).toBeNull()
  })

  it('does not merge when the confirmation modal is cancelled', async () => {
    const onMergeMeetings = vi.fn(async () => true)
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    })
    const user = userEvent.setup()
    renderSidebar(vi.fn(async () => []), async () => [], onMergeMeetings)

    await user.click(screen.getByRole('button', { name: t('ext.sidebar.selectMeetings') }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 1/ }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 2/ }))
    await user.click(screen.getByRole('button', { name: t('ext.sidebar.mergeSelectedMeetings', { count: 2 }) }))
    await user.click(screen.getByRole('button', { name: t('ext.sidebar.cancelMerge') }))

    expect(onMergeMeetings).not.toHaveBeenCalled()
  })

  it('cancels selection and clears all checked meetings', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    })
    const onExportMeetings = vi.fn(async () => [])
    const user = userEvent.setup()
    renderSidebar(onExportMeetings)

    await user.click(screen.getByRole('button', { name: t('ext.sidebar.selectMeetings') }))
    await user.click(screen.getByRole('checkbox', { name: /Project Sync 1/ }))
    await user.click(screen.getByRole('button', { name: t('ext.sidebar.cancelMeetingSelection') }))

    expect(screen.queryByRole('checkbox', { name: /Project Sync/ })).toBeNull()
    expect(onExportMeetings).not.toHaveBeenCalled()
  })
})
