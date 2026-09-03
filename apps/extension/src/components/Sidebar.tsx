import { useEffect, useMemo, useState } from 'react'
import {
  displayMeetingId,
  isLive,
  startedAt,
  type AnalysisRecord,
  type Meeting,
} from '@meetcc/shared'

import { listProjects, listSessions } from '../lib/db'
import { resolveTheme, watchSystemTheme, type ThemePref } from '../lib/theme'

const THEME_LABEL: Record<ThemePref, string> = {
  system: 'Tema: ikut sistem',
  light: 'Tema: terang',
  dark: 'Tema: gelap',
}

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
      aria-label={`${THEME_LABEL[pref]}. Klik untuk ganti.`}
      title={THEME_LABEL[pref]}>
      {THEME_ICON[pref]}
    </button>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
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
            {fmtDate(startedAt(m))} · {m.entries.length} baris
          </span>
        </span>
        {badge(m)}
      </button>
      <button
        className='meeting-del'
        aria-label={`Hapus meeting ${label}`}
        title='Hapus meeting (transcript, notulen, chat)'
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
          aria-label='Buka sidebar'
          aria-expanded='false'
          title='Buka sidebar'>
          »
        </button>
        <img className='brand-logo' src='icons/suiflex.svg' alt='Suiflex' />
        {live.length > 0 && (
          <span
            className='rail-live'
            title={`${live.length} meeting berlangsung`}
          />
        )}
        <span className='spacer' />
        <ThemeToggle />
        <button
          className='icon-btn'
          onClick={onSearch}
          aria-label='Cari semua rapat'
          title='Cari semua rapat (⌘K)'>
          ⌕
        </button>
        <button
          className='icon-btn'
          onClick={onKnowledge}
          aria-label='Knowledge base lintas rapat'
          title='Knowledge base lintas rapat'>
          ✦
        </button>
        <button
          className='icon-btn'
          onClick={onDecisions}
          aria-label='Keputusan & carry-over'
          title='Keputusan & carry-over'>
          ▤
        </button>
        <button
          className='icon-btn'
          onClick={onSettings}
          aria-label='Settings'
          title='Settings'>
          ⚙
        </button>
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
          aria-label='Sembunyikan sidebar'
          aria-expanded='true'
          title='Sembunyikan sidebar'>
          «
        </button>
      </div>

      {projects.length > 0 && (
        <label className='sidebar-filter'>
          <span className='section-label'>Proyek</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label='Filter proyek'>
            <option value=''>Semua rapat</option>
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
              <h2 className='section-label'>Berlangsung</h2>
              {live.map(item)}
            </section>
          )}
          <section>
            <h2 className='section-label'>Riwayat</h2>
            {past.length ? (
              past.map(item)
            ) : (
              <p className='section-empty'>Kosong</p>
            )}
          </section>
        </>
      )}
      <div className='sidebar-foot'>
        <ThemeToggle />
        <button
          className='icon-btn'
          onClick={onSearch}
          aria-label='Cari semua rapat'
          title='Cari semua rapat (⌘K)'>
          ⌕
        </button>
        <button
          className='icon-btn'
          onClick={onKnowledge}
          aria-label='Knowledge base lintas rapat'
          title='Knowledge base lintas rapat'>
          ✦
        </button>
        <button
          className='icon-btn'
          onClick={onDecisions}
          aria-label='Keputusan & carry-over'
          title='Keputusan & carry-over'>
          ▤
        </button>
        <button
          className='icon-btn'
          onClick={onSettings}
          aria-label='Settings'
          title='Settings'>
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
