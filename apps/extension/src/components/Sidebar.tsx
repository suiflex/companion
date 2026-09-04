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

const themeLabel = (p: ThemePref): string =>
  t('ext.sidebar.theme', {
    mode: p === 'system' ? t('pref.system') : p === 'light' ? t('pref.light') : t('pref.dark'),
  })

const THEME_ICON: Record<ThemePref, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
}

const NEXT: Record<ThemePref, ThemePref> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
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

  return (
    <button
      className='icon-btn'
      onClick={() => setPref((p) => NEXT[p])}
      aria-label={themeLabel(pref)}
      title={themeLabel(pref)}>
      {THEME_ICON[pref]}
    </button>
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
  onSelect: (id: string) => void
  onSettings: () => void
  onDecisions: () => void
  onKnowledge: () => void
  onSearch: () => void
  onDelete: (id: string) => void
}

export function Sidebar({
  meetings,
  loading,
  records,
  titles,
  now,
  selectedId,
  onSelect,
  onSettings,
  onDecisions,
  onKnowledge,
  onSearch,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(true)
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

  const shown = useMemo(
    () => (filter ? meetings.filter((m) => projectOf[m.id] === filter) : meetings),
    [meetings, filter, projectOf],
  )
  const live = shown.filter((m) => isLive(m, now))
  const past = shown.filter((m) => !isLive(m, now))

  const badge = (m: Meeting) => {
    const r = records[m.id]
    if (!r) return null
    if (r.status === 'processing')
      return <span className='ai-badge processing'>AI…</span>
    if (r.status === 'error') return <span className='ai-badge error'>!</span>
    return <span className='ai-badge done'>✓</span>
  }

  const item = (m: Meeting) => {
    // named by the AI summary (or the user); falls back to the raw meeting id
    const label = titles[m.id] || displayMeetingId(m.id)
    return (
    <div key={m.id} className='meeting-row'>
      <button
        className={`meeting ${m.id === selectedId ? 'selected' : ''}`}
        title={m.id}
        onClick={() => onSelect(m.id)}>
        <span className={`status ${isLive(m, now) ? 'on' : ''}`} />
        <span className='meeting-body'>
          <span className='meeting-id'>{label}</span>
          <span className='meeting-sub'>
            {fmtDate(startedAt(m))} · {t('ext.sidebar.lines', { count: m.entries.length })}
          </span>
        </span>
        {badge(m)}
      </button>
      <button
        className='meeting-del'
        aria-label={t('ext.sidebar.deleteMeeting', { label })}
        title={t('ext.sidebar.deleteMeetingHint')}
        onClick={() => onDelete(m.id)}>
        🗑
      </button>
    </div>
    )
  }

  // collapsed: slim icon rail — every action stays reachable, zero clutter
  if (!open) {
    return (
      <aside className='sidebar collapsed'>
        <button
          className='icon-btn'
          onClick={() => setOpen(true)}
          aria-label={t('ext.sidebar.expand')}
          aria-expanded='false'
          title={t('ext.sidebar.expand')}>
          »
        </button>
        <img className='brand-logo' src='icons/suiflex.svg' alt='Suiflex' />
        {live.length > 0 && (
          <span
            className='rail-live'
            title={t('ext.sidebar.liveCount', { count: live.length })}
          />
        )}
        <span className='spacer' />
        <ThemeToggle />
        <button
          className='icon-btn'
          onClick={onSearch}
          aria-label={t('ext.sidebar.searchAll')}
          title={t('ext.sidebar.searchAllShortcut')}>
          ⌕
        </button>
        <button
          className='icon-btn'
          onClick={onKnowledge}
          aria-label={t('ext.sidebar.knowledge')}
          title={t('ext.sidebar.knowledge')}>
          ✦
        </button>
        <button
          className='icon-btn'
          onClick={onDecisions}
          aria-label={t('ext.sidebar.decisions')}
          title={t('ext.sidebar.decisions')}>
          ▤
        </button>
        <button
          className='icon-btn'
          onClick={onSettings}
          aria-label={t('ext.sidebar.settings')}
          title={t('ext.sidebar.settings')}>
          ⚙
        </button>
        {/* One row of controls, not two footers: the links used to sit on a
            line of their own between this row and the credit, which read as a
            third footer stacked under the second. */}
        {activeSponsorLinks().map((link) => (
          <a
            key={link.id}
            className='icon-btn'
            href={link.url}
            target='_blank'
            rel='noreferrer noopener'
            aria-label={`${t('sponsor.title')} · ${t(link.label)}`}
            title={`${t('sponsor.title')} · ${t(link.label)}`}>
            {link.icon}
          </a>
        ))}
      </aside>
    )
  }

  return (
    <aside className='sidebar'>
      <div className='brand'>
        <img className='brand-logo' src='icons/suiflex.svg' alt='Suiflex' />
        <span className='brand-name'>Companion</span>
        <button
          className='icon-btn'
          onClick={() => setOpen(false)}
          aria-label={t('ext.sidebar.collapse')}
          aria-expanded='true'
          title={t('ext.sidebar.collapse')}>
          «
        </button>
      </div>

      {projects.length > 0 && (
        <label className='sidebar-filter'>
          <span className='section-label'>{t('ext.sidebar.project')}</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('ext.sidebar.projectFilter')}>
            <option value=''>{t('ext.sidebar.allMeetings')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {loading ? (
        <div aria-hidden='true'>
          {[0, 1, 2].map((i) => (
            <div key={i} className='skeleton skeleton-row' />
          ))}
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <section>
              <h2 className='section-label'>{t('ext.sidebar.live')}</h2>
              {live.map(item)}
            </section>
          )}
          <section>
            <h2 className='section-label'>{t('ext.sidebar.history')}</h2>
            {past.length ? (
              past.map(item)
            ) : (
              <p className='section-empty'>{t('ext.sidebar.historyEmpty')}</p>
            )}
          </section>
        </>
      )}
      <div className='sidebar-foot'>
        <ThemeToggle />
        <button
          className='icon-btn'
          onClick={onSearch}
          aria-label={t('ext.sidebar.searchAll')}
          title={t('ext.sidebar.searchAllShortcut')}>
          ⌕
        </button>
        <button
          className='icon-btn'
          onClick={onKnowledge}
          aria-label={t('ext.sidebar.knowledge')}
          title={t('ext.sidebar.knowledge')}>
          ✦
        </button>
        <button
          className='icon-btn'
          onClick={onDecisions}
          aria-label={t('ext.sidebar.decisions')}
          title={t('ext.sidebar.decisions')}>
          ▤
        </button>
        <button
          className='icon-btn'
          onClick={onSettings}
          aria-label={t('ext.sidebar.settings')}
          title={t('ext.sidebar.settings')}>
          ⚙
        </button>
      </div>
      <p className='sidebar-credit'>
        <img className='credit-logo' src='icons/suiflex.svg' alt='' />
        powered by suiflex
      </p>
    </aside>
  )
}
