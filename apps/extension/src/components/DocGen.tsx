import { useCallback, useEffect, useState } from 'react'
import { t, formatDateTime } from '@meetcc/shared/i18n'
import { DOC_META } from '@meetcc/ai'
import {
  DOCPROG_PREFIX,
  DOCS_PREFIX,
  loadDocProgress,
  loadDocs,
  watchStorage,
  type DocProgressRecord,
  type DocType,
  type Meeting,
  type MeetingDocs,
} from '@meetcc/shared'
import { lazyImport } from '../lib/lazy'
import { db } from '../lib/db'
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

  // P2.1 — an optional user template steers the document's structure.
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [templateId, setTemplateId] = useState('')

  useEffect(() => {
    let alive = true
    void db<{ id: string; name: string }[]>('templates', { kind: 'doc' })
      .then((t) => alive && setTemplates(t))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const reload = useCallback(() => {
    void loadDocs(meeting.id).then(setDocs)
    void loadDocProgress(meeting.id).then(setProg)
  }, [meeting.id])

  useEffect(() => {
    reload()
    return watchStorage(reload, [DOCS_PREFIX, DOCPROG_PREFIX]) // background writes progress/doc
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
        templateId: templateId || undefined,
      })
      if (res?.ok) toast('success', t('ext.docs.done', { label: DOC_META[docType].label }))
      else toast('error', t('ext.failed', { error: res?.error ?? t('ext.unknownError') }))
    } catch (e) {
      toast('error', t('ext.failed', { error: (e as Error).message }))
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
      toast('success', t('ext.docs.pdfDownloaded'))
    } catch (e) {
      toast('error', t('ext.docs.pdfFailed', { error: (e as Error).message }))
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="docgen">
      <div className="subbar">
        <div className="seg" role="tablist" aria-label={t('ext.docs.kinds')}>
          {TYPES.map((kind) => {
            const busy = prog?.type === kind && now - Date.parse(prog.updatedAt) <= 90_000
            return (
              <button
                key={kind}
                role="tab"
                aria-selected={type === kind}
                className={`seg-btn ${type === kind ? 'active' : ''}`}
                onClick={() => setType(kind)}
              >
                {DOC_META[kind].label}
                {busy ? (
                  <span className="seg-busy" aria-label={t('ext.docs.generating')} />
                ) : (
                  docs[kind] && <span className="seg-dot" aria-label={t('ext.docs.generated')} />
                )}
              </button>
            )
          })}
        </div>
        {templates.length > 0 && (
          <label className="doc-template">
            Template
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={anyRunning}
              aria-label={t('ext.docs.template')}
            >
              <option value="">{t('ext.docgen.standardTemplate')}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="spacer" />
        {current && !running && (
          <>
            <button
              className="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(current.content)
                toast('success', t('ext.docs.markdownCopied'))
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
            {t('ext.docs.progress', { label: meta.label, stage: active!.label, pct })}
          </p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton-block" />
          ))}
        </div>
      ) : current ? (
        <div className="doc-view">
          <div className="doc-meta dim">
            {t('ext.docs.meta', { label: meta.label, date: formatDateTime(current.generatedAt) })}
          </div>
          <pre className="doc-sheet">{current.content}</pre>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-glyph">¶</div>
          <p>{t('ext.docs.empty', { label: meta.label })}</p>
          <p className="empty-hint">
            {stalled
              ? t('ext.docs.stalled', { label: meta.label })
              : t('ext.docs.hint', { label: meta.label, id: meeting.id })}
          </p>
        </div>
      )}
    </div>
  )
}
