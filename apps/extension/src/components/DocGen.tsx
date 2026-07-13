import { useEffect, useState } from 'react'
import { DOC_META } from '@meetcc/ai'
import {
  loadDocs,
  type DocType,
  type Meeting,
  type MeetingDocs,
} from '@meetcc/shared'
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
  // which type is generating — only THAT segment shows the skeleton; the
  // others keep showing their own content (fixes "BRD loading = all loading")
  const [busyType, setBusyType] = useState<DocType | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    let alive = true
    void loadDocs(meeting.id).then((d) => alive && setDocs(d))
    return () => {
      alive = false
    }
  }, [meeting.id])

  const current = docs[type]
  const meta = DOC_META[type]
  const generating = busyType === type

  const generate = async (docType: DocType) => {
    setBusyType(docType)
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'generate-doc',
        meetingId: meeting.id,
        docType,
      })
      if (res?.ok) {
        setDocs((d) => ({
          ...d,
          [docType]: {
            content: res.content,
            generatedAt: new Date().toISOString(),
            provider: '',
          },
        }))
        toast('success', `${DOC_META[docType].label} selesai dibuat.`)
      } else {
        toast('error', `Gagal: ${res?.error ?? 'unknown'}`)
      }
    } catch (e) {
      toast('error', `Gagal: ${(e as Error).message}`)
    } finally {
      setBusyType(null)
    }
  }

  const exportPdf = async () => {
    if (!current) return
    setPdfBusy(true)
    try {
      // jsPDF is heavy; load it (and the logo) only when actually exporting
      const [{ docToPdf }, { orgLogoPng }] = await Promise.all([
        import('@meetcc/exporters/docpdf'),
        import('../lib/logo'),
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
          {TYPES.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              className={`seg-btn ${type === t ? 'active' : ''}`}
              onClick={() => setType(t)}
            >
              {DOC_META[t].label}
              {busyType === t ? (
                <span className="seg-busy" aria-label="sedang dibuat" />
              ) : (
                docs[t] && <span className="seg-dot" aria-label="sudah dibuat" />
              )}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {current && !generating && (
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
          disabled={busyType !== null}
        >
          {generating
            ? 'Membuat…'
            : current
              ? `↻ Regenerate ${meta.label}`
              : `Generate ${meta.label}`}
        </button>
      </div>

      {generating ? (
        <div className="summary-body">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton-block" />
          ))}
        </div>
      ) : current ? (
        <div className="doc-view">
          <div className="doc-meta dim">
            {meta.label} · dibuat{' '}
            {new Date(current.generatedAt).toLocaleString('id-ID')}
          </div>
          <pre className="doc-sheet">{current.content}</pre>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-glyph">¶</div>
          <p>Belum ada {meta.label}.</p>
          <p className="empty-hint">
            Buat draft {meta.label} otomatis dari transcript rapat {meeting.id}.
            Draft ini titik mulai — tinjau sebelum dipakai.
          </p>
        </div>
      )}
    </div>
  )
}
