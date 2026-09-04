import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openDatabase, type SqlDriver } from '@meetcc/store'
import { createIndex, search, Vault, uuidV7, type VaultNote } from '@meetcc/vault'
import { tauriVaultIo } from './vaultIo'
import { t, formatDate, onLangChange, type LangPref, LANGS } from '@meetcc/shared/i18n'
import { applyLang, loadLangPref, saveLangPref } from './lang'
import { DateField } from './DateField'
import { MeetingMeta } from './MeetingMeta'
import { Select, type Option, type Tone } from './Select'
import { useToast } from './toast'
import { activeSponsorLinks } from './sponsor'
import { NoteTree } from './NoteTree'
import { saveTarget } from './saveTarget'
import { buildTree, folderPaths, withEmptyFolders } from './tree'
import {
  applyTheme,
  loadThemePref,
  saveThemePref,
  watchSystemTheme,
  type ThemePref,
} from './theme'
import { NoteEditor } from './NoteEditor'
import UpdateBanner from './UpdateBanner'

/** Vault & bridge settings. Small on purpose: the only thing here that changes
 *  state is where the vault lives, and that is a decision worth making explicit
 *  rather than burying in a preferences tree. */
// Looked up per render, not frozen at module load: the language can change
// while the app is open.
const themeLabel = (p: ThemePref): string =>
  p === 'system' ? t('pref.system') : p === 'light' ? t('pref.light') : t('pref.dark')

const langLabel = (p: LangPref): string =>
  p === 'system' ? t('pref.system') : p === 'en' ? t('lang.en') : t('lang.id')

function Settings({
  root,
  noteCount,
  onMove,
  onReset,
  isDefaultRoot,
  themePref,
  onThemeChange,
  langPref,
  onLangChange,
}: {
  root: string
  noteCount: number
  onMove: () => void
  onReset: () => void
  /** Hides the reset action when there is nothing to reset. */
  isDefaultRoot: boolean
  themePref: ThemePref
  onThemeChange: (pref: ThemePref) => void
  langPref: LangPref
  onLangChange: (pref: LangPref) => void
}) {
  return (
    <div className="settings">
      <h1>{t('desktop.settings.title')}</h1>

      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.language')}</h2>
          <p className="hint">{t('desktop.settings.languageHint')}</p>
        </div>
        <div className="segmented" role="group" aria-label={t('desktop.settings.language')}>
          {(['system', ...LANGS] as LangPref[]).map((p) => (
            <button
              key={p}
              type="button"
              className={langPref === p ? 'seg active' : 'seg'}
              aria-pressed={langPref === p}
              onClick={() => onLangChange(p)}
            >
              {langLabel(p)}
            </button>
          ))}
        </div>
      </section>

      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.theme')}</h2>
          <p className="hint">{t('desktop.settings.themeHint')}</p>
        </div>
        <div className="segmented" role="group" aria-label={t('desktop.settings.theme')}>
          {(['system', 'light', 'dark'] as ThemePref[]).map((p) => (
            <button
              key={p}
              type="button"
              className={themePref === p ? 'seg active' : 'seg'}
              aria-pressed={themePref === p}
              onClick={() => onThemeChange(p)}
            >
              {themeLabel(p)}
            </button>
          ))}
        </div>
      </section>

      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.vaultLocation')}</h2>
          <p className="setting-path">{root}</p>
          <p className="hint">{t('desktop.settings.vaultHint', { count: noteCount })}</p>
        </div>
        <div className="setting-actions">
          <button type="button" className="btn" onClick={onMove}>
            {t('desktop.settings.moveVault')}
          </button>
          {!isDefaultRoot && (
            <button type="button" className="btn" onClick={onReset}>
              {t('desktop.settings.resetVault')}
            </button>
          )}
        </div>
      </section>

      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.bridge')}</h2>
          <p className="hint">{t('desktop.settings.bridgeHint')}</p>
        </div>
      </section>

      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.index')}</h2>
          <p className="hint">{t('desktop.settings.indexHint')}</p>
        </div>
      </section>
    </div>
  )
}

/** The Companion mark from assets/brand/logo-mark.svg, inlined. */
function BrandMark() {
  return (
    <svg className="brand" viewBox="0 0 32 32" role="img" aria-label="Meet Companion">
      <rect width="32" height="32" rx="7" fill="#0a0a0a" />
      <path
        d="M10 7 H22 A4 4 0 0 1 26 11 V17 A4 4 0 0 1 22 21 H14.5 L10 25.5 V21 A4 4 0 0 1 6 17 V11 A4 4 0 0 1 10 7 Z"
        fill="#4ade80"
      />
      <rect x="10" y="11.2" width="12" height="2.6" rx="1.3" fill="#0a0a0a" />
      <rect x="10" y="15.4" width="7" height="2.6" rx="1.3" fill="#0a0a0a" opacity=".55" />
    </svg>
  )
}

interface NoteHeader {
  rel: string
  id: string
  sessionKey: string
  /** Set when this note is an edited copy of a delivered meeting. */
  source?: string
  title: string
  updatedAt: string
  /** `manual` for a note written here; the meeting platform for a delivered one. */
  platform: string
  startedAt?: string
  participants: number
  /** A delivered note has no body until the extension sends the summary. */
  hasBody: boolean
}

const PLATFORM_LABELS: Record<string, string> = {
  'google-meet': 'Google Meet',
  'microsoft-teams': 'Microsoft Teams',
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
  import: 'Impor',
}

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

function dayOf(iso?: string): string {
  return iso ? iso.slice(0, 10) : ''
}

// Stored values stay English whatever the interface language: the note file is
// data other tools read, and a status whose spelling changed with the UI would
// make two notes written in two languages incomparable.
const STATUSES = ['', 'To Do', 'In Progress', 'Blocked', 'Done'] as const
const PRIORITIES = ['', 'Low', 'Medium', 'High', 'Urgent'] as const

const STATUS_LABEL: Record<string, string> = {
  'To Do': 'desktop.status.todo',
  'In Progress': 'desktop.status.inProgress',
  Blocked: 'desktop.status.blocked',
  Done: 'desktop.status.done',
}
const PRIORITY_LABEL: Record<string, string> = {
  Low: 'desktop.priority.low',
  Medium: 'desktop.priority.medium',
  High: 'desktop.priority.high',
  Urgent: 'desktop.priority.urgent',
}
/** Where each value sits on the palette's existing scale. */
const TONES: Record<string, Tone> = {
  'To Do': 'neutral',
  'In Progress': 'info',
  Blocked: 'danger',
  Done: 'success',
  Low: 'neutral',
  Medium: 'info',
  High: 'warning',
  Urgent: 'danger',
}

const optionLabel = (map: Record<string, string>, value: string): string =>
  value ? t(map[value] as Parameters<typeof t>[0]) : t('desktop.field.none')

/**
 * The choices to offer, plus whatever the note already holds.
 *
 * A note written elsewhere — by hand, or by a future version — can carry a
 * status this build does not know. Keeping it in the list means selecting
 * something else is a choice rather than the only way to make the control
 * agree with the file.
 */
function options(
  values: readonly string[],
  labels: Record<string, string>,
  current: string | undefined,
): Option[] {
  const known = values.map((v) => ({ value: v, label: optionLabel(labels, v), tone: TONES[v] }))
  // A value from another version has no tone — neutral is the honest colour
  // for "this build does not know what this means".
  return current && !values.includes(current)
    ? [...known, { value: current, label: current }]
    : known
}

/**
 * The ticket half of a note: what the body cannot carry as prose.
 *
 * The values are free-form in the file (frontmatter is hand-editable markdown,
 * not a schema), so the selects offer a set without enforcing it — a note
 * carrying a value from somewhere else keeps it.
 */
function TicketFields({
  note,
  onChange,
}: {
  note: VaultNote
  onChange: (patch: Partial<VaultNote>) => void
}) {
  const pick = (value: string): string | undefined => value || undefined
  const [showEmpty, setShowEmpty] = useState(false)

  // The partition is by value, not by field. A note is a markdown file someone
  // can edit by hand, so a value can exist in the file without ever having been
  // set here — hiding a set field would hide the only place it is visible.
  // Empty ones are what goes away until asked for.
  const set = {
    status: Boolean(note.status),
    priority: Boolean(note.priority),
    assignee: Boolean(note.assignee),
    due: Boolean(note.dueDate),
  }
  const anyEmpty = Object.values(set).some((v) => !v)
  const show = (field: keyof typeof set): boolean => set[field] || showEmpty

  return (
    <div className="ticket-fields">
      {show('status') && (
      <label>
        <span>{t('desktop.field.status')}</span>
        <Select
          label={t('desktop.field.status')}
          value={note.status ?? ''}
          options={options(STATUSES, STATUS_LABEL, note.status)}
          onChange={(v) => onChange({ status: pick(v) })}
        />
      </label>
      )}
      {show('priority') && (
      <label>
        <span>{t('desktop.field.priority')}</span>
        <Select
          label={t('desktop.field.priority')}
          value={note.priority ?? ''}
          options={options(PRIORITIES, PRIORITY_LABEL, note.priority)}
          onChange={(v) => onChange({ priority: pick(v) })}
        />
      </label>
      )}
      {show('assignee') && (
      <label>
        <span>{t('desktop.field.assignee')}</span>
        <input
          value={note.assignee ?? ''}
          placeholder={t('desktop.field.assigneePlaceholder')}
          onChange={(e) => onChange({ assignee: pick(e.target.value) })}
        />
      </label>
      )}
      {show('due') && (
      <label>
        <span>{t('desktop.field.due')}</span>
        <DateField value={note.dueDate ?? ''} onChange={(v) => onChange({ dueDate: pick(v) })} />
      </label>
      )}
      {anyEmpty && (
        <button
          type="button"
          className="add-property"
          onClick={() => setShowEmpty((v) => !v)}
        >
          {showEmpty ? t('desktop.field.hideEmpty') : t('desktop.field.addProperty')}
        </button>
      )}
    </div>
  )
}

export default function App() {
  const [vault, setVault] = useState<Vault | null>(null)
  const [notes, setNotes] = useState<NoteHeader[]>([])
  const [driver, setDriver] = useState<SqlDriver | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState<VaultNote | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'notes' | 'inbox' | 'settings'>('notes')
  const [dirty, setDirty] = useState(false)
  // Search fell back to titles because the SQLite index would not open.
  const [indexDown, setIndexDown] = useState(false)
  // The duplicate-key warning already shown, so it is not repeated per poll.
  const reportedRef = useRef('')
  // Bumped when the language changes, purely to force a re-render: `t()` reads
  // a module-level language that React cannot see.
  const [, setLangTick] = useState(0)
  useEffect(() => onLangChange(() => setLangTick((n) => n + 1)), [])
  const [themePref, setThemePref] = useState<ThemePref>(loadThemePref)
  const toast = useToast()
  const [langPref, setLangPref] = useState<LangPref>(loadLangPref)
  // The default root is only known to Rust, so ask once rather than rebuilding
  // `~/Companion` in the frontend and hoping the two agree.
  // Folders that exist on disk, including ones holding no notes — an empty
  // directory has no note path to be derived from, so it would vanish the
  // moment it was made.
  const [folders, setFolders] = useState<string[]>([])
  // The folder a new folder is being named inside: null is "not naming", ''
  // is the vault root. Which parent it belongs to comes from the button that
  // was clicked, so nothing has to be asked afterwards.
  const [namingFolder, setNamingFolder] = useState<string | null>(null)
  // Where an unsaved note will land. Null means "wherever the session key
  // says", which is what happened before folders existed.
  const [target, setTarget] = useState<string | null>(null)
  const [defaultRoot, setDefaultRoot] = useState<string | null>(null)
  useEffect(() => {
    void invoke<string>('default_vault_root').then(setDefaultRoot).catch(() => undefined)
  }, [])
  const isDefaultRoot = !defaultRoot || vault?.io.root === defaultRoot

  // Applied and persisted the same way the theme is. `applyLang` also stamps
  // <html lang>, so the document declares the language it is actually showing.
  useEffect(() => {
    applyLang(langPref)
    saveLangPref(langPref)
  }, [langPref])

  // Applied on change, and re-applied when the OS flips while on `system` —
  // otherwise following the system would only take effect on the next launch.
  useEffect(() => {
    applyTheme(themePref)
    saveThemePref(themePref)
    if (themePref !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
  }, [themePref])
  // Leaving a note with unsaved edits used to drop them silently. Hold the
  // action the user asked for until they say what to do with the edits.
  const [pending, setPending] = useState<null | (() => Promise<void>)>(null)
  // A second confirmation, for actions that are not about unsaved edits. Kept
  // separate rather than folded into `pending` so the two can chain: leaving a
  // dirty note *and* moving the vault asks about the note first.
  const [confirm, setConfirm] = useState<null | {
    message: string
    label: string
    run: () => Promise<void>
  }>(null)
  const driverRef = useRef<SqlDriver | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const root = await invoke<string>('vault_root')
        const v = new Vault({ io: tauriVaultIo(root) })
        // The vault is the product; it is plain .md over Rust IPC and needs no
        // SQLite at all. Open it first, so nothing downstream can take away the
        // ability to read and write notes.
        setVault(v)

        // Derived index is disposable and session-scoped: an in-memory SQLite
        // rebuilt from the .md files is all the UI needs for search. Losing it
        // costs full-text search, nothing else — `filtered` already falls back
        // to matching titles, and `refresh` skips indexing without a driver. It
        // used to be opened before the vault, so a failure here left the whole
        // window inert with a disabled "new note" button.
        try {
          const { driver } = await openDatabase()
          driverRef.current = driver
          setDriver(driver)
        } catch (e) {
          console.warn('[Companion] search index unavailable, titles only:', e)
          setIndexDown(true)
        }

        await refresh(v)
      } catch (e) {
        setError(String(e))
      }
    }
    void init()
  }, [])

  async function refresh(v: Vault) {
    // Read the vault once and feed both the sidebar and the index from it —
    // every read here is a round trip through Rust, and this runs on every save.
    const rel = await v.listNotes()
    const read = await Promise.all(rel.map((r) => v.readNote(r)))
    setNotes(
      read.map((n, i) => ({
        rel: rel[i],
        id: n.id,
        sessionKey: n.sessionKey,
        source: n.source,
        title: n.title || rel[i],
        updatedAt: n.updatedAt,
        platform: n.platform,
        startedAt: n.startedAt,
        participants: n.participants?.length ?? 0,
        hasBody: Boolean(n.body.trim()),
      })),
    )
    if (driverRef.current) {
      const skipped = await createIndex(driverRef.current, v, read, rel)
      // A duplicate session key no longer fails the rebuild, but silently
      // dropping a note from search would be its own trap — say which file.
      //
      // Once, though. This runs on every save and every five-second poll, and
      // a duplicate is a state that persists until someone opens the vault and
      // deletes a file — repeating the warning on every tick turns a fact into
      // noise that buries the toasts that report what just happened.
      const key = skipped.join('\n')
      if (key !== reportedRef.current) {
        reportedRef.current = key
        if (skipped.length) {
          toast(
            'error',
            skipped.length === 1
              ? t('desktop.vault.duplicateSessionKey', { path: skipped[0] })
              : t('desktop.vault.duplicateSessionKeys', {
                  count: skipped.length,
                  path: skipped[0],
                }),
          )
        }
      }
    }
    await invoke<string[]>('list_vault_folders').then(setFolders).catch(() => undefined)
  }

  // Notes also arrive from outside this window: the extension hands finished
  // meetings to the native host, which writes straight into the vault. Without
  // this the app only ever read the vault at startup, so a delivery looked
  // like nothing had happened until the next restart.
  //
  // ponytail: polls `listMarkdown` — one IPC call per tick, whatever the vault
  // holds. Deliberately NOT `listNotes`, which stats every note individually
  // and would put a round trip per note on a five-second loop forever.
  //
  // The ceiling that buys: only *new* files are noticed, so a second delivery
  // filling in an existing note's summary waits for the next save or reopen.
  // Swap in tauri-plugin-fs watch when that starts to matter.
  useEffect(() => {
    if (!vault) return
    const seen = notes.map((n) => n.rel).sort().join('\n')
    const timer = setInterval(() => {
      // Never while editing: refresh replaces the note list the editor's
      // selection is addressed against, and unsaved work is not ours to drop.
      if (dirty) return
      void vault.io
        .listMarkdown()
        .then((abs) => {
          // Same prefix rule the Vault's own `relative` uses, so the two sides
          // of this comparison cannot drift apart over a trailing slash.
          const root = vault.io.root.replace(/\/+$/, '')
          const rel = abs.map((a) => (a.startsWith(`${root}/`) ? a.slice(root.length + 1) : a)).sort()
          if (rel.join('\n') !== seen) return refresh(vault)
        })
        .catch(() => undefined)
    }, 5000)
    return () => clearInterval(timer)
  }, [vault, notes, dirty])

  /** Run `action`, unless there are unsaved edits to resolve first. */
  function guard(action: () => Promise<void>) {
    if (dirty) setPending(() => action)
    else void action()
  }

  async function resume(discard: boolean) {
    const action = pending
    setPending(null)
    if (!discard) await save()
    setDirty(false)
    if (action) await action()
  }

  async function open(rel: string) {
    if (!vault) return
    const n = await vault.readNote(rel)
    setSelected(rel)
    setTarget(null)
    setNote(n)
    setDirty(false)
    setError(null)
  }

  // `window.prompt` is a no-op in this window — the WebView has no dialog for
  // it and returns null without showing anything, so the button appeared dead.
  // The name is typed in the sidebar instead.
  async function createFolder(parent: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return setNamingFolder(null)
    try {
      // Slashes would make one field create a whole path, which is more than
      // the control promises; the rest is left alone so a folder can be named
      // in any language.
      const safe = trimmed.replace(/[/\\]/g, '-')
      const rel = parent ? `${parent}/${safe}` : safe
      await invoke('create_vault_folder', { rel })
      if (vault) await refresh(vault)
      toast('success', t('desktop.vault.folderCreated', { name: rel }))
    } catch (e) {
      setError(String(e))
    } finally {
      setNamingFolder(null)
    }
  }

  const moveNote = (folder: string) => (selected ? moveNoteFrom(selected, folder) : undefined)

  async function moveNoteFrom(from: string, folder: string) {
    if (!vault) return
    const file = from.split('/').pop() ?? from
    const to = folder ? `${folder}/${file}` : file
    if (to === from) return
    try {
      await invoke('move_vault_file', { from, to })
      if (selected === from) setSelected(to)
      await refresh(vault)
      toast('success', t('desktop.vault.moved', { folder: folder || t('desktop.vault.rootFolder') }))
    } catch (e) {
      setError(String(e))
    }
  }

  async function openNew() {
    if (!vault) return
    const fresh: VaultNote = {
      id: uuidV7(),
      sessionKey: `nota/${Date.now().toString(36)}`,
      platform: 'manual',
      updatedAt: new Date().toISOString(),
      title: t('desktop.editor.newNoteTitle'),
      body: '',
    }
    // A new note belongs where you were looking, but `selected` has to stay
    // null: it means "this note has a file", and `remove()` reads it to decide
    // between trashing a file and simply dropping an unsaved draft. The folder
    // travels separately until the first save gives the note a path.
    setTarget(selected ? selected.split('/').slice(0, -1).join('/') : null)
    setSelected(null)
    setNote(fresh)
    setDirty(false)
    setError(null)
  }

  async function save() {
    if (!vault || !note) return
    try {
      // Where this goes and what it writes lives in `saveTarget`, which is
      // pure and has tests: the rule was three nested ternaries here and was
      // wrong twice — once writing a second file for a note that already had
      // one, once making a fresh copy of a meeting on every single save.
      const { rel, note: toWrite, copied } = saveTarget({
        note,
        selected,
        target,
        relPath: (n) => vault.relPath(n),
        existing: notes,
      })
      await vault.writeNoteAt(rel, toWrite)
      // `selected` addresses a file, so it has to become the path the note was
      // just written to — otherwise trashing a freshly created note aims at
      // its session key and misses.
      setSelected(rel)
      setTarget(null)
      setNote({ ...toWrite })
      setDirty(false)
      await refresh(vault)
      setError(null)
      toast('success', copied ? t('desktop.toast.copiedToNotes') : t('desktop.toast.saved'))
    } catch (e) {
      setError(String(e))
    }
  }

  async function remove() {
    if (!vault) return
    try {
      // a note that was never saved has no file — dropping it is the delete
      if (selected) {
        await vault.trash(selected)
        await refresh(vault)
        toast('info', t('desktop.toast.trashed'))
      }
      setNote(null)
      setSelected(null)
      setDirty(false)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  /**
   * Point the vault at another folder.
   *
   * `set_vault_root` has existed in the backend since the first commit with
   * nothing calling it; this is what finally reaches it. The Vault is rebuilt
   * rather than mutated because its io carries the root, and the derived index
   * is repopulated from whatever the new folder holds.
   */
  /** Point the vault at `path`, rebuilding everything that captured the old root. */
  async function applyRoot(path: string): Promise<void> {
    const next = new Vault({ io: tauriVaultIo(path) })
    setVault(next)
    setNote(null)
    setSelected(null)
    setDirty(false)
    await refresh(next)
    setError(null)
    toast('success', t('desktop.toast.vaultMoved', { path }))
  }

  async function resetVault() {
    setConfirm({
      message: t('desktop.settings.confirmReset'),
      label: t('desktop.settings.resetVault'),
      run: async () => {
        const root = await invoke<string>('reset_vault_root')
        await applyRoot(root)
      },
    })
  }

  async function moveVault() {
    if (!vault) return
    try {
      const picked = await openDialog({ directory: true, title: t('desktop.settings.pickVault') })
      if (typeof picked !== 'string') return

      // Ask before writing. `set_vault_root` prepares the folder, so a
      // mis-click used to leave a `.transcript/` directory behind somewhere
      // the user never meant to touch.
      const probe = await invoke<{ exists: boolean; markdown: number; is_vault: boolean }>(
        'probe_vault_root',
        { path: picked },
      )
      setConfirm({
        message: probe.is_vault
          ? t('desktop.settings.confirmExistingVault', { path: picked })
          : probe.markdown > 0
            ? t('desktop.settings.confirmForeignFolder', { path: picked, count: probe.markdown })
            : t('desktop.settings.confirmEmptyFolder', { path: picked }),
        label: t('desktop.settings.moveHere'),
        run: async () => {
          await invoke('set_vault_root', { path: picked })
          await applyRoot(picked)
        },
      })
    } catch (e) {
      setError(String(e))
    }
  }


  const filtered = useMemo(() => {
    if (!query.trim()) return notes
    const q = query.trim().toLowerCase()
    // FTS hits carry a vault-relative `path` (and match the note body too);
    // title-substring matches on the full list fill any gap. Dedupe by rel.
    const hits = driver
      ? search(driver, q).map((h) => {
          // The index carries no metadata; take it from the note list when the
          // hit is one we already read, so a search result renders like a row.
          const known = notes.find((n) => n.rel === h.path)
          return {
            rel: h.path,
            id: known?.id ?? h.path,
            sessionKey: known?.sessionKey ?? '',
            source: known?.source,
            title: h.title,
            updatedAt: h.updatedAt,
            platform: known?.platform ?? '',
            startedAt: known?.startedAt,
            participants: known?.participants ?? 0,
            hasBody: known?.hasBody ?? false,
          }
        })
      : []
    const seen = new Set<string>()
    const ordered: NoteHeader[] = []
    for (const h of hits) {
      if (!h.rel) continue
      if (seen.has(h.rel)) continue
      seen.add(h.rel)
      ordered.push(h)
    }
    for (const n of notes) {
      if (n.title.toLowerCase().includes(q) && !seen.has(n.rel)) {
        seen.add(n.rel)
        ordered.push(n)
      }
    }
    return ordered
  }, [notes, driver, query])

  // Grouped view of the same notes the search filters over — when a query is
  // running the flat result list is what makes sense, so the tree is only the
  // resting state.
  const tree = useMemo(
    () =>
      withEmptyFolders(
        buildTree(notes.map((n) => ({ rel: n.rel, title: n.title, platform: n.platform }))),
        folders,
      ),
    [notes, folders],
  )

  // Notes the extension delivered, as opposed to ones written here. The split
  // needs no new field: openNew stamps `manual`, applyBatch stamps the meeting
  // platform. Newest meeting first — an inbox is read from the top.
  const incoming = useMemo(
    () =>
      notes
        .filter((n) => n.platform && n.platform !== 'manual')
        .sort((a, b) => (b.startedAt ?? b.updatedAt).localeCompare(a.startedAt ?? a.updatedAt)),
    [notes],
  )

  return (
    <div className="shell">
      <UpdateBanner />
      <aside className="rail" aria-label="Navigasi utama">
        <BrandMark />
        <button
          type="button"
          data-tip={t('desktop.nav.notes')} data-tip-side="right"
          className={view === 'notes' ? 'rail-btn rail-active' : 'rail-btn'}
          aria-label={t('desktop.nav.notes')}
          aria-current={view === 'notes' ? 'page' : undefined}
          onClick={() => setView('notes')}
        >
          ▤
        </button>
        <button
          type="button"
          data-tip={t('desktop.nav.inbox')} data-tip-side="right"
          className={view === 'inbox' ? 'rail-btn rail-active' : 'rail-btn'}
          aria-label={t('desktop.nav.inbox')}
          aria-current={view === 'inbox' ? 'page' : undefined}
          onClick={() => setView('inbox')}
        >
          ◈
        </button>
        <span className="rail-spacer" />
        {activeSponsorLinks().map((link) => (
          <button
            key={link.id}
            type="button"
            className="rail-btn"
            data-tip={`${t('sponsor.title')} · ${t(link.label)}`}
            data-tip-side="right"
            aria-label={`${t('sponsor.title')} · ${t(link.label)}`}
            onClick={() => void invoke('open_external', { url: link.url })}
          >
            {link.icon}
          </button>
        ))}
        <button
          type="button"
          className="rail-btn"
          data-tip={t('desktop.nav.theme', { mode: themeLabel(themePref) })} data-tip-side="right"
          aria-label={t('desktop.nav.theme', { mode: themeLabel(themePref) })}
          onClick={() =>
            setThemePref((p) => (p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system'))
          }
        >
          {themePref === 'system' ? '◐' : themePref === 'light' ? '☀' : '☾'}
        </button>
        <button
          type="button"
          data-tip={t('desktop.nav.settings')} data-tip-side="right"
          className={view === 'settings' ? 'rail-btn rail-active' : 'rail-btn'}
          aria-label={t('desktop.nav.settings')}
          aria-current={view === 'settings' ? 'page' : undefined}
          onClick={() => setView('settings')}
        >
          ⚙
        </button>
      </aside>

      {view === 'notes' && (
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="kicker">{t('desktop.vault.kicker')}</span>
            <span className="count">{t('desktop.vault.count', { count: notes.length })}</span>
            {/* The vault opens asynchronously and openNew returns early without
                it, so until then the button would look live and answer a click
                with nothing. The tip lives on the wrapper because a disabled
                button receives no hover — which is exactly when it most needs
                to say why it is disabled. */}
            <span className="tip-wrap" data-tip={t('desktop.vault.newFolder')}>
              <button
                type="button"
                className="add-btn"
                onClick={() => setNamingFolder('')}
                aria-label={t('desktop.vault.newFolder')}
                disabled={!vault}
              >
                ⊞
              </button>
            </span>
            <span
              className="tip-wrap"
              data-tip={vault ? t('desktop.vault.newNote') : t('desktop.vault.preparing')}
            >
              <button
                type="button"
                className="add-btn"
                onClick={() => guard(openNew)}
                aria-label={t('desktop.vault.newNote')}
                disabled={!vault}
              >
                ＋
              </button>
            </span>
          </div>
          {namingFolder !== null && (
            <input
              className="search"
              autoFocus
              placeholder={
                namingFolder
                  ? t('desktop.vault.folderNameIn', { folder: namingFolder })
                  : t('desktop.vault.folderName')
              }
              aria-label={t('desktop.vault.folderName')}
              onBlur={(e) => void createFolder(namingFolder, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolder(namingFolder, e.currentTarget.value)
                if (e.key === 'Escape') setNamingFolder(null)
              }}
            />
          )}
          <input
            className="search"
            placeholder={
              !vault
                ? t('desktop.vault.preparing')
                : indexDown
                  ? t('desktop.vault.searchTitlesOnly')
                  : t('desktop.vault.search')
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!vault}
          />
          {!query.trim() ? (
            <NoteTree
              root={tree}
              selected={selected}
              onOpen={(rel) => guard(() => open(rel))}
              onMove={(rel, folder) => void moveNoteFrom(rel, folder)}
              onAddFolder={(folder) => setNamingFolder(folder)}
            />
          ) : (
          <ul className="note-list">
            {filtered.map((n) => (
              <li key={n.rel || n.title}>
                {n.rel ? (
                  <button
                    type="button"
                    className={selected === n.rel ? 'note-item active' : 'note-item'}
                    onClick={() => guard(() => open(n.rel))}
                  >
                    <span className="note-title">{n.title}</span>
                    <span className="note-row-meta">
                      {/* A delivered meeting stays in this list — it is still a
                          note — but says where it came from, so the two views
                          do not read as the same undifferentiated pile. */}
                      {n.platform && n.platform !== 'manual' && (
                        <span className="note-source">{platformLabel(n.platform)}</span>
                      )}
                      <span className="note-date">{dayOf(n.updatedAt)}</span>
                    </span>
                  </button>
                ) : (
                  <span className="note-title muted" data-tip={t('desktop.vault.bodyHit')}>
                    {n.title}
                  </span>
                )}
              </li>
            ))}
            {filtered.length === 0 && <li className="empty-hint">{t('desktop.vault.empty')}</li>}
          </ul>
          )}
        </aside>
      )}

      {view === 'inbox' && (
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="kicker">{t('desktop.inbox.kicker')}</span>
            <span className="count">{t('desktop.inbox.count', { count: incoming.length })}</span>
          </div>
          <ul className="note-list">
            {incoming.map((n) => (
              <li key={n.rel}>
                <button
                  type="button"
                  className={selected === n.rel ? 'note-item active' : 'note-item'}
                  onClick={() => guard(() => open(n.rel))}
                >
                  <span className="note-title">{n.title}</span>
                  <span className="inbox-meta">
                    <span>{platformLabel(n.platform)}</span>
                    <span>{dayOf(n.startedAt) || dayOf(n.updatedAt)}</span>
                    {n.participants > 0 && <span>{t('desktop.inbox.participants', { count: n.participants })}</span>}
                    {/* A meeting arrives as captions first; the body only fills
                        once the extension has a summary to send. Saying so beats
                        an empty note looking like a failed delivery. */}
                    {!n.hasBody && <span className="pending">{t('desktop.inbox.transcriptOnly')}</span>}
                  </span>
                </button>
              </li>
            ))}
            {incoming.length === 0 && (
              <li className="empty-hint">
                {t('desktop.inbox.empty')}
              </li>
            )}
          </ul>
        </aside>
      )}

      <main className="content">
        <header className="topbar">
          <span className="vault">{vault?.io.root ?? '…'}</span>
          {note && (
            <span className="badge" data-tip={t('desktop.badge.local')}>
              LOKAL
            </span>
          )}
        </header>

        <section className="editor-wrap">
          {view === 'settings' ? (
            <Settings
              root={vault?.io.root ?? '…'}
              noteCount={notes.length}
              onMove={() => guard(moveVault)}
              onReset={() => guard(resetVault)}
              isDefaultRoot={isDefaultRoot}
              themePref={themePref}
              onThemeChange={setThemePref}
              langPref={langPref}
              onLangChange={setLangPref}
            />
          ) : note ? (
            <>
              <input
                className="title-input"
                value={note.title}
                placeholder={t('desktop.editor.titlePlaceholder')}
                onChange={(e) => {
                  setNote({ ...note, title: e.target.value })
                  setDirty(true)
                }}
              />
              {note.platform && note.platform !== 'manual' && (
                <MeetingMeta note={note} vault={vault} />
              )}
              <TicketFields note={note} onChange={(patch) => { setNote({ ...note, ...patch }); setDirty(true) }} />
              {/* Keyed by the note id, not its path: the editor owns its
                  document, so opening another note must remount it — but the
                  first save of a new note, which is the moment a path appears,
                  must not, or the cursor jumps out from under the typing. */}
              <NoteEditor
                key={note.id}
                value={note.body}
                onChange={(body) => {
                  setNote({ ...note, body })
                  setDirty(true)
                }}
              />
              <div className="editor-actions">
                <span className="meta">
                  {dirty
                    ? t('desktop.editor.unsaved')
                    : t('desktop.editor.updated', {
                        date: formatDate(note.updatedAt) || '—',
                      })}
                </span>
                {/* A saved note moves its file; an unsaved one only records
                    where the first save should land — until then there is no
                    file to move. Same control either way, because "which
                    folder is this in" is the same question. */}
                <Select
                  label={selected ? t('desktop.vault.moveTo') : t('desktop.vault.saveTo')}
                  value={selected ? selected.split('/').slice(0, -1).join('/') : (target ?? '')}
                  options={[
                    { value: '', label: t('desktop.vault.rootFolder') },
                    ...folderPaths(tree).map((p) => ({ value: p, label: p })),
                  ]}
                  onChange={(v) => (selected ? void moveNote(v) : setTarget(v))}
                />
                <button type="button" className="btn danger" onClick={remove}>
                  {t('desktop.editor.trash')}
                </button>
                {/* The label says what the button does: for a delivered
                    meeting it never overwrites the archive, it makes the note
                    you go on editing. Removing Save here would leave no way to
                    act on a meeting at all. */}
                <button type="button" className="btn primary" onClick={save}>
                  {note.platform && note.platform !== 'manual'
                    ? t('desktop.editor.saveCopy')
                    : t('desktop.editor.save')}
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              <h1>{t('desktop.editor.emptyTitle')}</h1>
              <p>{t('desktop.editor.emptyBody')}</p>
            </div>
          )}
          {confirm && (
            <div className="confirm-bar" role="alert">
              <span>{confirm.message}</span>
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                {t('desktop.settings.cancel')}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const action = confirm.run
                  setConfirm(null)
                  void action().catch((e) => setError(String(e)))
                }}
              >
                {confirm.label}
              </button>
            </div>
          )}
          {pending && (
            <div className="confirm-bar" role="alert">
              <span>{t('desktop.editor.confirmUnsaved')}</span>
              <button type="button" className="btn" onClick={() => void resume(true)}>
                {t('desktop.editor.discard')}
              </button>
              <button type="button" className="btn primary" onClick={() => void resume(false)}>
                {t('desktop.editor.saveAndGo')}
              </button>
            </div>
          )}
          {error && <div className="error-bar">{error}</div>}
        </section>
      </main>
    </div>
  )
}
