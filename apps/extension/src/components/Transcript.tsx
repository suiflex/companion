import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CLEAN_PREFIX,
  cleanChanges,
  effectiveClean,
  loadClean,
  saveClean,
  watchStorage,
  type CleanRecord,
  type Entry,
  type Meeting,
} from '@meetcc/shared'
import { useToast } from '../toast'
import { db, listHighlights } from '../lib/db'

// Teams avatar URLs need the Teams session cookies; from the extension page
// they 401 into a broken image, so fall back to the initial on load error.
function Avatar({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  if (!src || broken) {
    return <div className='avatar avatar-ph'>{(name[0] || '?').toUpperCase()}</div>
  }
  return <img className='avatar' src={src} alt='' onError={() => setBroken(true)} />
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function toTxt(entries: Entry[]): string {
  return entries.map((e) => `[${e.time}] ${e.speaker}: ${e.text}`).join('\n')
}

interface Props {
  meeting: Meeting
  live: boolean
  onClear: () => void
}

const HIGHLIGHT_LABEL: Record<string, string> = {
  decision: 'Keputusan',
  action: 'Action',
  deadline: 'Deadline',
  risk: 'Risiko',
}

export function Transcript({ meeting, live, onClear }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const toast = useToast()

  // cleanup state comes from storage (a persisted record), so "Merapikan…"
  // survives tab switches / remounts and the button can't double-fire.
  const [record, setRecord] = useState<CleanRecord | null>(null)
  const [view, setView] = useState<'raw' | 'clean'>('raw')
  const [now, setNow] = useState(() => Date.now())
  // P2.2 — moments the live pass flagged (decision / action / deadline / risk)
  const [highlights, setHighlights] = useState<
    { id: number; seq: number; kind: string; text: string }[]
  >([])
  // imported recordings arrive as "Speaker 1" when the endpoint cannot diarize;
  // renaming is offered only once a meeting is over, because live captions keep
  // arriving under the original name and would undo it
  const [renaming, setRenaming] = useState<{ from: string; draft: string } | null>(null)

  const reload = useCallback(() => {
    void loadClean(meeting.id).then((r) => {
      setRecord(r)
      setView(r?.status === 'done' && r.entries.length ? 'clean' : 'raw')
    })
  }, [meeting.id])

  useEffect(() => {
    reload()
    return watchStorage(reload, [CLEAN_PREFIX]) // background writes clean:<id>
  }, [reload])

  useEffect(() => {
    let alive = true
    void listHighlights(meeting.id)
      .then((h) => alive && setHighlights(h))
      .catch(() => undefined) // index not built yet: the transcript still shows
    return () => {
      alive = false
    }
  }, [meeting.id, meeting.entries.length])

  // tick so a crashed run (no storage updates) is detected as stalled
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 8000)
    return () => clearInterval(t)
  }, [])

  const bySeq = useMemo(
    () => new Map(highlights.map((h) => [h.seq, h.kind])),
    [highlights],
  )

  // §26 provenance: what the AI changed, and whether the user kept the original
  const changes = useMemo(() => cleanChanges(meeting.entries, record), [meeting.entries, record])
  const changedAt = useMemo(() => new Map(changes.map((c) => [c.index, c])), [changes])

  // toggling a correction rewrites the stored record, so every downstream
  // reader (summary, Ask, docs, index) picks the decision up on its next read
  const keepOriginal = async (index: number, keep: boolean) => {
    if (record?.status !== 'done') return
    const kept = new Set(record.kept ?? [])
    if (keep) kept.add(index)
    else kept.delete(index)
    const next = { ...record, kept: [...kept].sort((a, b) => a - b) }
    setRecord(next)
    await saveClean(meeting.id, next)
  }

  // renames every line of one speaker at once, in the index and in the
  // chrome.storage copy a re-index would otherwise restore
  const commitRename = async () => {
    if (!renaming) return
    const { from, draft } = renaming
    setRenaming(null)
    if (!draft.trim() || draft.trim() === from) return
    try {
      const res = await db<{ moved: number }>('rename-speaker', {
        sessionId: meeting.id,
        from,
        to: draft.trim(),
      })
      toast('success', `${res.moved} baris kini atas nama ${draft.trim()}.`)
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const cleaned = record?.status === 'done' ? record.entries : null
  const processing = record?.status === 'processing'
  const done = processing ? (record.done ?? 0) : 0
  const total = processing ? (record.total ?? 0) : 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  // no progress update for 60s (or a malformed/old record with no updatedAt)
  // = the run died -> treat as stalled so the user can resume or restart
  const age = processing ? now - Date.parse(record.updatedAt) : 0
  const stalled = processing && !(age < 60_000)
  const running = processing && !stalled
  const entries =
    view === 'clean' && cleaned ? effectiveClean(meeting.entries, record) : meeting.entries

  useEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [entries])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const cleanUp = async (fromScratch = false) => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'clean-transcript',
        meetingId: meeting.id,
        fromScratch,
      })
      if (res?.ok) toast('success', `Transcript dirapikan — ${res.changed} baris dikoreksi.`)
      else toast('error', `Gagal: ${res?.error ?? 'unknown'}`)
    } catch (e) {
      toast('error', `Gagal: ${(e as Error).message}`)
    }
    reload()
  }

  return (
    <>
      <div className='subbar'>
        {cleaned && (
          <div className='seg' role='tablist' aria-label='Versi transcript'>
            <button
              role='tab'
              aria-selected={view === 'raw'}
              className={`seg-btn ${view === 'raw' ? 'active' : ''}`}
              onClick={() => setView('raw')}>
              Asli
            </button>
            <button
              role='tab'
              aria-selected={view === 'clean'}
              className={`seg-btn ${view === 'clean' ? 'active' : ''}`}
              onClick={() => setView('clean')}>
              Rapi
            </button>
          </div>
        )}
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(toTxt(entries))
            toast('success', 'Transcript disalin.')
          }}>
          Copy
        </button>
        <button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([toTxt(entries)], { type: 'text/plain' }),
            )
            const a = document.createElement('a')
            a.href = url
            a.download = `${meeting.id}${view === 'clean' ? '-rapi' : ''}.txt`
            a.click()
            URL.revokeObjectURL(url)
          }}>
          TXT
        </button>
        <span className='spacer' />
        {(cleaned || stalled) && (
          <button
            className='ghost'
            onClick={() => void cleanUp(true)}
            disabled={running || live}
            title='Abaikan hasil lama, rapikan ulang dari awal'>
            ↻ Dari awal
          </button>
        )}
        <button
          className={running ? '' : 'primary'}
          onClick={() => void cleanUp(false)}
          disabled={running || live || !meeting.entries.length}
          title={
            live
              ? 'Tunggu rapat selesai'
              : 'Perbaiki salah-dengar (angka, nama, istilah) dengan AI'
          }>
          {running
            ? `⏳ Merapikan… ${pct}%`
            : stalled
              ? `▶ Lanjutkan ${pct}%`
              : cleaned
                ? '✨ Rapikan ulang'
                : '✨ Rapikan'}
        </button>
        <button className='danger' onClick={onClear}>
          Clear
        </button>
      </div>

      {highlights.length > 0 && view === 'raw' && (
        <div className='hl-strip'>
          <span className='section-label'>Sorotan</span>
          {highlights.slice(-8).map((h) => (
            <button
              key={h.id}
              className={`hl-chip hl-${h.kind}`}
              title={h.text}
              onClick={() => {
                const el = ref.current?.querySelectorAll('.entry')[h.seq]
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}>
              {HIGHLIGHT_LABEL[h.kind] ?? h.kind}: {h.text.slice(0, 48)}
            </button>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className='empty-state'>
          <p className='empty-hint'>Menunggu ada yang bicara…</p>
        </div>
      ) : (
        <div className='transcript' ref={ref} onScroll={onScroll}>
          {running && (
            <p className='transcript-note dim'>
              AI merapikan transcript… {done}/{total} baris ({pct}%). Hasil muncul otomatis.
            </p>
          )}
          {stalled && (
            <p className='transcript-note dim'>
              Proses terhenti di {pct}% (mungkin tab lama ditutup). Klik “Lanjutkan” untuk melanjutkan.
            </p>
          )}
          {view === 'clean' && cleaned && record?.status === 'done' && (
            <p className='transcript-note dim'>
              Versi rapi — {record.changed} baris dikoreksi ·{' '}
              {new Date(record.generatedAt).toLocaleString('id-ID')}. Verifikasi bila ragu.
            </p>
          )}
          {cleaned && meeting.entries.length > cleaned.length && (
            <p className='transcript-note dim'>
              +{meeting.entries.length - cleaned.length} baris baru sejak dirapikan (belum
              dikoreksi). Klik “✨ Rapikan ulang” untuk merapikan semuanya.
            </p>
          )}
          {entries.map((e, i) => {
            const isTail = live && view === 'raw' && i === entries.length - 1
            const flag = view === 'raw' ? bySeq.get(i) : undefined
            return (
              <article
                className={`entry ${flag ? 'entry-flagged' : ''}`}
                key={`${e.time}-${i}`}>
                <Avatar src={e.avatar} name={e.speaker} />
                <div className='entry-body'>
                  <div className='entry-head'>
                    {renaming?.from === e.speaker ? (
                      <input
                        className='speaker-rename'
                        autoFocus
                        aria-label={`Ganti nama ${e.speaker}`}
                        value={renaming.draft}
                        onChange={(ev) => setRenaming({ from: e.speaker, draft: ev.target.value })}
                        onBlur={() => setRenaming(null)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Escape') setRenaming(null)
                          if (ev.key === 'Enter') void commitRename()
                        }}
                      />
                    ) : live ? (
                      <span className='speaker'>{e.speaker}</span>
                    ) : (
                      <button
                        className='speaker speaker-editable'
                        title='Ganti nama pembicara ini di seluruh rapat'
                        onClick={() => setRenaming({ from: e.speaker, draft: e.speaker })}>
                        {e.speaker}
                      </button>
                    )}
                    <time className='stamp'>{fmtTime(e.time)}</time>
                    {flag && <span className={`hl-tag hl-${flag}`}>{HIGHLIGHT_LABEL[flag] ?? flag}</span>}
                  </div>
                  <p className='text'>
                    {e.text}
                    {isTail && <span className='caret' />}
                  </p>
                  {view === 'clean' && changedAt.has(i) && (
                    <div className='clean-diff'>
                      <span className='clean-raw' title='Yang tertangkap caption'>
                        {changedAt.get(i)!.raw}
                      </span>
                      <button
                        className='clean-toggle'
                        onClick={() => void keepOriginal(i, !changedAt.get(i)!.kept)}>
                        {changedAt.get(i)!.kept ? '↺ Pakai versi AI' : 'Pakai versi asli'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
