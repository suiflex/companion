import { useCallback, useEffect, useState } from 'react'
import { DOC_META } from '@meetcc/ai'
import {
  loadDocProgress,
  loadDocs,
  watchStorage,
  type DocProgressRecord,
  type DocType,
  type Meeting,
  type MeetingDocs,
} from '@meetcc/shared'
import { lazyImport } from '../lib/lazy'
import { useToast } from '../toast'

const TYPES = Object.keys(DOC_META) as DocType[]

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function DocGen({ meeting }: { meeting: Meeting }) {
  const [type, setType] = useState<DocType>('brd')
  const [docs, setDocs] = useState<MeetingDocs>({})
  const [prog, setProg] = useState<DocProgressRecord | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const toast = useToast()

  const reload = useCallback(() => {
    void loadDocs(meeting.id).then(setDocs)
    void loadDocProgress(meeting.id).then(setProg)
  }, [meeting.id])

  useEffect(() => {
    reload()
    return watchStorage(reload) // background writes progress/doc -> auto-refresh
  }, [reload])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  const current = docs[type]
  const meta = DOC_META[type]

  // progress belongs to the type being generated; stale updatedAt = crashed run
  const active = prog && prog.type === type ? prog : null
  const stalled = active ? now - Date.parse(active.updatedAt) > 90_000 : false
  const running = !!active && !stalled
  const pct = active && active.total > 0 ? Math.round((active.step / active.total) * 100) : 0
  // any type currently generating (blocks starting another to keep one at a time)
  const anyRunning = prog ? now - Date.parse(prog.updatedAt) <= 90_000 : false

  const generate = async (docType: DocType) => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'generate-doc',
        meetingId: meeting.id,
        docType,
      })
      if (res?.ok) toast('success', `${DOC_META[docType].label} selesai dibuat.`)
      else toast('error', `Gagal: ${res?.error ?? 'unknown'}`)
    } catch (e) {
      toast('error', `Gagal: ${(e as Error).message}`)
    }
    reload()
  }

  const exportPdf = async () => {
    if (!current) return
    setPdfBusy(true)
    try {
      const [{ docToPdf }, { orgLogoPng }] = await Promise.all([
        lazyImport(() => import('@meetcc/exporters/docpdf')),
        lazyImport(() => import('../lib/logo')),
      ])
      const logo = await orgLogoPng()
      downloadBlob(
        `${meeting.id}-${meta.filename}.pdf`,
        docToPdf(meeting, meta.label, current.content, logo),
      )
      toast('success', 'PDF diunduh.')
    } catch (e) {
      toast('error', `Gagal membuat PDF: ${(e as Error).message}`)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="docgen">
      <div className="subbar">
        <div className="seg" role="tablist" aria-label="Jenis dokumen">
          {TYPES.map((t) => {
            const busy = prog?.type === t && now - Date.parse(prog.updatedAt) <= 90_000
            return (
              <button
                key={t}
                role="tab"
                aria-selected={type === t}
                className={`seg-btn ${type === t ? 'active' : ''}`}
                onClick={() => setType(t)}
              >
                {DOC_META[t].label}
                {busy ? (
                  <span className="seg-busy" aria-label="sedang dibuat" />
                ) : (
                  docs[t] && <span className="seg-dot" aria-label="sudah dibuat" />
                )}
              </button>
            )
          })}
        </div>
        <span className="spacer" />
        {current && !running && (
          <>
            <button
              className="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(current.content)
                toast('success', 'Markdown disalin.')
              }}
            >
              ⧉ Copy
            </button>
            <button
              className="ghost"
              onClick={() =>
                downloadBlob(
                  `${meeting.id}-${meta.filename}.md`,
                  new Blob([current.content], { type: 'text/markdown' }),
                )
              }
            >
              ⬇ .md
            </button>
            <button className="ghost" onClick={exportPdf} disabled={pdfBusy}>
              {pdfBusy ? '…' : '⬇ PDF'}
            </button>
          </>
        )}
        <button
          className="primary"
          onClick={() => void generate(type)}
          disabled={running || (anyRunning && !active)}
        >
          {running
            ? `⏳ ${active!.label} ${pct}%`
            : stalled
              ? `↻ Ulangi ${meta.label}`
              : current
                ? `↻ Regenerate ${meta.label}`
                : `Generate ${meta.label}`}
        </button>
      </div>

      {running ? (
        <div className="summary-body">
          <p className="transcript-note dim">
            AI menyusun {meta.label} ({active!.label})… {pct}% · draft → periksa → revisi.
            Hasil muncul otomatis.
          </p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton-block" />
          ))}
        </div>
      ) : current ? (
        <div className="doc-view">
          <div className="doc-meta dim">
            {meta.label} · dibuat {new Date(current.generatedAt).toLocaleString('id-ID')}
          </div>
          <pre className="doc-sheet">{current.content}</pre>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-glyph">¶</div>
          <p>Belum ada {meta.label}.</p>
          <p className="empty-hint">
            {stalled
              ? `Proses ${meta.label} sebelumnya terhenti. Klik untuk mengulang.`
              : `Buat draft ${meta.label} dari transcript rapat ${meeting.id} (draft → periksa → revisi). Draft ini titik mulai — tinjau sebelum dipakai.`}
          </p>
        </div>
      )}
    </div>
  )
}
