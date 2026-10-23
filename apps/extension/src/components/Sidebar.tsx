import { useEffect, useMemo, useState } from 'react'
import {
  displayMeetingId,
  isLive,
  startedAt,
  type AnalysisRecord,
  type Meeting,
} from '@meetcc/shared'

import { listProjects, listSessions } from '../lib/db'
import { activeSponsorLinks } from '../lib/sponsor'
import { resolveTheme, watchSystemTheme, type ThemePref } from '../lib/theme'
import { locale, t } from '@meetcc/shared/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  ArrowRightLeft,
  Check,
  Coffee,
  Heart,
  ListCheck,
  Merge,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

const themeLabel = (p: ThemePref): string =>
  t('ext.sidebar.theme', {
    mode: p === 'system' ? t('pref.system') : p === 'light' ? t('pref.light') : t('pref.dark'),
  })

const NEXT: Record<ThemePref, ThemePref> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const SPONSOR_ICON: Record<string, LucideIcon> = {
  github: Heart,
  saweria: Coffee,
}

/** Cycles system → light → dark; persisted so the next open keeps the choice. */
function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>('system')

  // main.tsx already stamped the resolved theme before first paint; this only
  // recovers which *preference* produced it, so the cycle starts where the
  // user left off rather than always at `system`.
  useEffect(() => {
    void chrome.storage.local
      .get('theme')
      .then(({ theme }) => {
        if (theme === 'light' || theme === 'dark' || theme === 'system') setPref(theme)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    document.body.dataset.theme = resolveTheme(pref)
    try {
      void chrome.storage.local.set({ theme: pref })
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
    if (pref !== 'system') return
    // Follow the OS live, not just on the next open.
    return watchSystemTheme((t) => {
      document.body.dataset.theme = t
    })
  }, [pref])

  const Icon = pref === 'system' ? Monitor : pref === 'light' ? Sun : Moon

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="icon-btn text-muted-foreground hover:text-foreground"
      onClick={() => setPref((p) => NEXT[p])}
      aria-label={themeLabel(pref)}
      title={themeLabel(pref)}
    >
      <Icon className="size-4" />
    </Button>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString(locale(), { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  )
}

interface Props {
  meetings: Meeting[]
  loading: boolean
  records: Record<string, AnalysisRecord>
  titles: Record<string, string>
  now: number
  selectedId: string | null
  activeView: 'meeting' | 'knowledge' | 'decisions' | 'settings'
  onSelect: (id: string) => void
  onSettings: () => void
  onDecisions: () => void
  onKnowledge: () => void
  onSearch: () => void
  onDelete: (id: string) => void
  onExportMeetings: (ids: string[]) => Promise<string[]>
  onDeleteMeetings: (ids: string[]) => Promise<string[] | null>
  onMergeMeetings: (ids: string[], targetId: string) => Promise<boolean>
}

export function Sidebar({
  meetings,
  loading,
  records,
  titles,
  now,
  selectedId,
  activeView,
  onSelect,
  onSettings,
  onDecisions,
  onKnowledge,
  onSearch,
  onDelete,
  onExportMeetings,
  onDeleteMeetings,
  onMergeMeetings,
}: Props) {
  const [open, setOpen] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [selectedMeetings, setSelectedMeetings] = useState<Set<string>>(() => new Set())
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeConfirmationOpen, setMergeConfirmationOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState('')
  // P2.3 — project grouping. The mapping lives in the index, so a failed load
  // just means the filter is unavailable, never an empty meeting list.
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectOf, setProjectOf] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let alive = true
    void Promise.all([listProjects(), listSessions()])
      .then(([p, sessions]) => {
        if (!alive) return
        setProjects(p)
        setProjectOf(
          Object.fromEntries(
            sessions.filter((s) => s.projectId).map((s) => [s.id, s.projectId as string]),
          ),
        )
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [meetings.length])
  useEffect(() => {
    const currentIds = new Set(meetings.map((m) => m.id))
    setSelectedMeetings((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [meetings])

  const shown = useMemo(
    () => (filter ? meetings.filter((m) => projectOf[m.id] === filter) : meetings),
    [meetings, filter, projectOf],
  )
  const live = shown.filter((m) => isLive(m, now))
  const allVisibleSelected = shown.length > 0 && shown.every((m) => selectedMeetings.has(m.id))
  const toggleMeeting = (id: string, checked: boolean) => {
    setSelectedMeetings((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const toggleVisibleMeetings = () => {
    setSelectedMeetings((current) => {
      const next = new Set(current)
      const clearVisible = shown.length > 0 && shown.every((m) => current.has(m.id))
      for (const m of shown) {
        if (clearVisible) next.delete(m.id)
        else next.add(m.id)
      }
      return next
    })
  }
  const cancelSelection = () => {
    setMergeConfirmationOpen(false)
    setSelecting(false)
    setSelectedMeetings(new Set())
  }
  const selectedForMerge = meetings.filter((meeting) => selectedMeetings.has(meeting.id))
  const liveMergeTarget = selectedForMerge.find((meeting) => isLive(meeting, now))
  const defaultMergeTarget =
    liveMergeTarget?.id ??
    (selectedMeetings.has(selectedId ?? '') ? selectedId! : selectedForMerge[0]?.id ?? '')
  const mergeTargetId = liveMergeTarget?.id ?? (selectedMeetings.has(mergeTarget) ? mergeTarget : defaultMergeTarget)
  const mergeSourceNames: string[] = []
  let mergeSourcesLive = false
  for (const meeting of selectedForMerge) {
    if (meeting.id === mergeTargetId) continue
    if (isLive(meeting, now)) mergeSourcesLive = true
    mergeSourceNames.push(titles[meeting.id] || displayMeetingId(meeting.id))
  }
  const mergeSourceList = [
    ...mergeSourceNames.slice(0, 5),
    ...(mergeSourceNames.length > 5
      ? [t('ext.sidebar.moreMeetingNames', { count: mergeSourceNames.length - 5 })]
      : []),
  ].join('\n')
  const mergeSelected = async () => {
    if (selectedForMerge.length < 2 || !mergeTargetId || mergeSourcesLive || merging) return
    setMergeConfirmationOpen(false)
    setMerging(true)
    try {
      if (await onMergeMeetings([...selectedMeetings], mergeTargetId)) cancelSelection()
    } finally {
      setMerging(false)
    }
  }
  const transferSelected = async () => {
    if (!selectedMeetings.size || exporting || deleting || merging) return
    setExporting(true)
    try {
      const failedIds = await onExportMeetings([...selectedMeetings])
      setSelectedMeetings(new Set(failedIds))
      if (!failedIds.length) setSelecting(false)
    } finally {
      setExporting(false)
    }
  }
  const deleteSelected = async () => {
    if (!selectedMeetings.size || exporting || deleting || merging) return
    setDeleting(true)
    try {
      const failedIds = await onDeleteMeetings([...selectedMeetings])
      if (failedIds === null) return
      setSelectedMeetings(new Set(failedIds))
      if (!failedIds.length) setSelecting(false)
    } finally {
      setDeleting(false)
    }
  }
  const past = shown.filter((m) => !isLive(m, now))

  const badge = (m: Meeting) => {
    const r = records[m.id]
    if (!r) return null
    if (r.status === 'processing')
      return (
        <Badge
          variant="outline"
          className="ai-badge processing border-primary/40 bg-primary/10 text-primary text-[10px] px-1 py-0 gap-1 animate-pulse"
        >
          <Sparkles className="size-2.5" />
          AI…
        </Badge>
      )
    if (r.status === 'error')
      return (
        <Badge
          variant="destructive"
          className="ai-badge error size-4 p-0 rounded-full flex items-center justify-center text-[10px]"
        >
          !
        </Badge>
      )
    return (
      <Badge
        variant="secondary"
        className="ai-badge done size-4 p-0 rounded-full flex items-center justify-center border border-primary/40 text-primary bg-primary/10"
      >
        <Check className="size-2.5" />
      </Badge>
    )
  }

  const item = (m: Meeting) => {
    // named by the AI summary (or the user); falls back to the raw meeting id
    const label = titles[m.id] || displayMeetingId(m.id)
    const isSelected = m.id === selectedId
    return (
      <div key={m.id} className="meeting-row group">
        {selecting && (
          <input
            className="meeting-select"
            type="checkbox"
            aria-label={t('ext.sidebar.selectMeeting', { label })}
            checked={selectedMeetings.has(m.id)}
            disabled={exporting || deleting || merging}
            onChange={(event) => toggleMeeting(m.id, event.target.checked)}
          />
        )}
        <Button
          variant="ghost"
          className={cn('meeting', isSelected && 'selected')}
          title={m.id}
          onClick={() => onSelect(m.id)}
        >
          <span className={cn('status', isLive(m, now) && 'on')} />
          <span className="meeting-body">
            <span className="meeting-id truncate">{label}</span>
            <span className="meeting-sub">
              {fmtDate(startedAt(m))} · {t('ext.sidebar.lines', { count: m.entries.length })}
            </span>
          </span>
          {badge(m)}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="meeting-del text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
          aria-label={t('ext.sidebar.deleteMeeting', { label })}
          title={t('ext.sidebar.deleteMeetingHint')}
          onClick={() => onDelete(m.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    )
  }

  // collapsed: slim icon rail — every action stays reachable, zero clutter
  if (!open) {
    return (
      <aside className="sidebar collapsed">
        <Button
          variant="ghost"
          size="icon-xs"
          className="icon-btn"
          onClick={() => setOpen(true)}
          aria-label={t('ext.sidebar.expand')}
          aria-expanded="false"
          title={t('ext.sidebar.expand')}
        >
          <PanelLeftOpen className="size-4" />
        </Button>
        <img className="brand-logo" src="icons/suiflex.svg" alt="Suiflex" />
        {live.length > 0 && (
          <span
            className="rail-live"
            title={t('ext.sidebar.liveCount', { count: live.length })}
          />
        )}
        <span className="spacer" />
        <Button
          variant="ghost"
          size="icon-xs"
          className="icon-btn"
          onClick={onSearch}
          aria-label={t('ext.sidebar.searchAll')}
          title={t('ext.sidebar.searchAllShortcut')}
        >
          <Search className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn('icon-btn', activeView === 'knowledge' && 'active')}
          onClick={onKnowledge}
          aria-label={t('ext.sidebar.knowledge')}
          title={t('ext.sidebar.knowledge')}
        >
          <Sparkles className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn('icon-btn', activeView === 'decisions' && 'active')}
          onClick={onDecisions}
          aria-label={t('ext.sidebar.decisions')}
          title={t('ext.sidebar.decisions')}
        >
          <ListCheck className="size-4" />
        </Button>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn('icon-btn', activeView === 'settings' && 'active')}
          onClick={onSettings}
          aria-label={t('ext.sidebar.settings')}
          title={t('ext.sidebar.settings')}
        >
          <Settings className="size-4" />
        </Button>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img className="brand-logo" src="icons/suiflex.svg" alt="Suiflex" />
            <span className="brand-name">Companion</span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="icon-btn collapse-btn"
            onClick={() => setOpen(false)}
            aria-label={t('ext.sidebar.collapse')}
            aria-expanded="true"
            title={t('ext.sidebar.collapse')}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>

        <Button
          variant="outline"
          className="sidebar-search-btn w-full justify-start h-8 px-2.5 text-muted-foreground hover:text-foreground border-border/60 bg-muted/40"
          onClick={onSearch}
          aria-label={t('ext.sidebar.searchAll')}
          title={t('ext.sidebar.searchAllShortcut')}
        >
          <Search className="sidebar-search-icon size-3.5 mr-2 shrink-0 text-muted-foreground" />
          <span className="sidebar-search-text text-xs flex-1 text-left">{t('ext.sidebar.searchAll')}</span>
          <kbd className="sidebar-search-kbd text-[10px] font-mono text-muted-foreground/80 border border-border/60 rounded px-1 py-0.5 bg-background/50">⌘K</kbd>
        </Button>

        <nav className="sidebar-nav" aria-label={t('ext.sidebar.knowledge')}>
          <Button
            variant="ghost"
            size="sm"
            className={cn('sidebar-nav-btn w-full justify-start h-7 text-xs font-medium', activeView === 'knowledge' && 'active')}
            onClick={onKnowledge}
            title={t('ext.sidebar.knowledge')}
          >
            <Sparkles className="sidebar-nav-icon size-3.5 mr-2 text-primary shrink-0" />
            <span className="sidebar-nav-label truncate">{t('ext.sidebar.knowledge')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('sidebar-nav-btn w-full justify-start h-7 text-xs font-medium', activeView === 'decisions' && 'active')}
            onClick={onDecisions}
            title={t('ext.sidebar.decisions')}
          >
            <ListCheck className="sidebar-nav-icon size-3.5 mr-2 text-amber shrink-0" />
            <span className="sidebar-nav-label truncate">{t('ext.sidebar.decisions')}</span>
          </Button>
        </nav>
      </div>

      <div className="sidebar-scroll">
        {projects.length > 0 && (
          <label className="sidebar-filter">
            <span className="section-label">{t('ext.sidebar.project')}</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('ext.sidebar.projectFilter')}>
              <option value="">{t('ext.sidebar.allMeetings')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="meeting-bulk">
          <div className="meeting-bulk-row">
            <Button
              type="button"
              size="xs"
              variant={selecting ? 'ghost' : 'outline'}
              disabled={loading || meetings.length === 0 || exporting || deleting || merging}
              aria-pressed={selecting}
              onClick={() => (selecting ? cancelSelection() : setSelecting(true))}
            >
              {selecting ? t('ext.sidebar.cancelMeetingSelection') : t('ext.sidebar.selectMeetings')}
            </Button>
            {selecting && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={shown.length === 0 || exporting || deleting || merging}
                onClick={toggleVisibleMeetings}
              >
                {allVisibleSelected ? t('ext.sidebar.clearVisibleSelection') : t('ext.sidebar.selectVisibleMeetings')}
              </Button>
            )}
          </div>
          {selecting && (
            <>
              <div className="meeting-bulk-row">
                <span className="meeting-selection-count">
                  {t('ext.sidebar.selectedMeetingCount', { count: selectedMeetings.size })}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="default"
                  disabled={!selectedMeetings.size || exporting || deleting || merging}
                  onClick={() => void transferSelected()}
                >
                  <ArrowRightLeft className="size-3 mr-1" />
                  {exporting
                    ? t('ext.sidebar.sendingMeetingsToDesktop')
                    : t('ext.sidebar.sendMeetingsToDesktop', { count: selectedMeetings.size })}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  disabled={!selectedMeetings.size || exporting || deleting || merging}
                  onClick={() => void deleteSelected()}
                >
                  <Trash2 className="size-3 mr-1" />
                  {deleting
                    ? t('ext.sidebar.deletingMeetings')
                    : t('ext.sidebar.deleteSelectedMeetings', { count: selectedMeetings.size })}
                </Button>
              </div>
              {selectedMeetings.size > 1 && (
                <>
                  <label className="meeting-merge-target flex flex-col gap-1 text-xs text-muted-foreground mt-2">
                    <span className="font-medium text-foreground">{t('ext.sidebar.mergeTarget')}</span>
                    <select
                      className="h-7 rounded-md border border-border/60 bg-muted/30 px-2 text-xs text-foreground outline-none focus:border-ring"
                      value={mergeTargetId}
                      disabled={!!liveMergeTarget || exporting || deleting || merging}
                      onChange={(event) => setMergeTarget(event.target.value)}
                    >
                      {selectedForMerge.map((meeting) => (
                        <option key={meeting.id} value={meeting.id}>
                          {titles[meeting.id] || displayMeetingId(meeting.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {mergeSourcesLive && (
                    <p className="meeting-merge-warning text-[11px] text-warning mt-1">{t('ext.sidebar.liveSourceMergeBlocked')}</p>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="mt-2 w-full gap-1 text-xs"
                    disabled={selectedForMerge.length < 2 || mergeSourcesLive || exporting || deleting || merging}
                    onClick={() => setMergeConfirmationOpen(true)}
                  >
                    <Merge className="size-3" />
                    {merging
                      ? t('ext.sidebar.mergingMeetings')
                      : t('ext.sidebar.mergeSelectedMeetings', { count: selectedForMerge.length })}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
        {loading ? (
          <div aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton skeleton-row" />
            ))}
          </div>
        ) : (
          <>
            {live.length > 0 && (
              <section className="meeting-section">
                <h2 className="section-label">{t('ext.sidebar.live')}</h2>
                {live.map(item)}
              </section>
            )}
            <section className="meeting-section">
              <h2 className="section-label">{t('ext.sidebar.history')}</h2>
              {past.length ? (
                past.map(item)
              ) : (
                <p className="section-empty">{t('ext.sidebar.historyEmpty')}</p>
              )}
            </section>
          </>
        )}
      </div>
      <Dialog open={mergeConfirmationOpen} onOpenChange={setMergeConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ext.sidebar.confirmMergeTitle')}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap">
              {t('ext.sidebar.confirmMergeMeetings', {
                count: selectedForMerge.length,
                target: titles[mergeTargetId] || displayMeetingId(mergeTargetId),
                sources: mergeSourceList,
              })}
            </DialogDescription>
          </DialogHeader>
          {liveMergeTarget && (
            <p className="m-0 text-sm text-warning">{t('ext.sidebar.liveMeetingMergeWarning')}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMergeConfirmationOpen(false)}
              disabled={merging}
            >
              {t('ext.sidebar.cancelMerge')}
            </Button>
            <Button
              type="button"
              onClick={() => void mergeSelected()}
              disabled={merging || mergeSourcesLive}
            >
              {merging ? t('ext.sidebar.mergingMeetings') : t('ext.sidebar.confirmMergeAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="sidebar-bottom">
        <div className="sidebar-foot flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn('icon-btn', activeView === 'settings' && 'active')}
            onClick={onSettings}
            aria-label={t('ext.sidebar.settings')}
            title={t('ext.sidebar.settings')}
          >
            <Settings className="size-4" />
          </Button>
          <span className="spacer flex-1" />
          {activeSponsorLinks().map((link) => {
            const Icon = SPONSOR_ICON[link.id]
            return (
              <a
                key={link.id}
                className="icon-btn flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`${t('sponsor.title')} · ${t(link.label)}`}
                title={`${t('sponsor.title')} · ${t(link.label)}`}
              >
                {Icon ? <Icon className="size-3.5" /> : link.icon}
              </a>
            )
          })}
        </div>
        <p className="sidebar-credit">
          <img className="credit-logo" src="icons/suiflex.svg" alt="" />
          powered by suiflex
        </p>
      </div>
    </aside>
  )
}
