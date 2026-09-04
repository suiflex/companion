// What a delivered meeting knows about itself.
//
// The note file has carried `participants`, `platform`, `startedAt` and a
// transcript sidecar path since the bridge first wrote one; the editor simply
// never showed any of it, so the inbox could say "3 participants" and opening
// the note told you nothing about who they were.
import { useState } from 'react'
import { formatDateTime, t } from '@meetcc/shared/i18n'
import { useToast } from './toast'
import type { Vault, VaultNote } from '@meetcc/vault'

/**
 * The id Chromium loads the shipped extension under.
 *
 * Derived from the `key` pinned in apps/extension/public/manifest.json, which
 * is why it is a constant and not a guess — `extensionIdFromKey` in
 * scripts/nativeHost.mjs computes it, and MeetingMeta.test.ts checks this
 * string still matches the manifest.
 */
export const EXTENSION_ID = 'pkgpllhlmhhocidmipbokpigndoeiemb'

/** `room#2026-09-04T10:00` → `room`, which is the extension's meeting id. */
export function roomIdOf(sessionKey: string): string {
  return sessionKey.split('#')[0] ?? ''
}

export function dashboardUrl(sessionKey: string): string {
  return `chrome-extension://${EXTENSION_ID}/index.html?meeting=${encodeURIComponent(roomIdOf(sessionKey))}`
}

export interface TranscriptLine {
  speaker: string
  text: string
  time: string
}

/** One JSONL line per caption. A malformed line is skipped, not fatal. */
export function parseTranscript(jsonl: string): TranscriptLine[] {
  const out: TranscriptLine[] = []
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line) as Partial<TranscriptLine>
      if (typeof row.text === 'string') {
        out.push({ speaker: row.speaker ?? '', text: row.text, time: row.time ?? '' })
      }
    } catch {
      /* a truncated final line is normal for an append-only file */
    }
  }
  return out
}

const PLATFORM_LABELS: Record<string, string> = {
  'google-meet': 'Google Meet',
  'microsoft-teams': 'Microsoft Teams',
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
  import: 'Import',
}

export function MeetingMeta({ note, vault }: { note: VaultNote; vault: Vault | null }) {
  const toast = useToast()
  const [lines, setLines] = useState<TranscriptLine[] | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const participants = note.participants ?? []
  const url = dashboardUrl(note.sessionKey)

  // Read on demand, not with the note: a long meeting's sidecar is large and
  // opening a note must not pay for a transcript nobody asked to see.
  const toggle = async (): Promise<void> => {
    if (open) return setOpen(false)
    setOpen(true)
    if (lines || !note.transcript || !vault) return
    setBusy(true)
    try {
      const raw = await vault.io.readFile(vault.io.join(vault.io.root, note.transcript))
      setLines(parseTranscript(raw))
    } catch (e) {
      setFailed(String(e))
    } finally {
      setBusy(false)
    }
  }

  // Two faults lived here: the label said "Copied" for the rest of the session
  // after one click, and a rejection set the same state as never having
  // clicked — so a failure looked exactly like doing nothing. `?.` on the
  // clipboard also short-circuited to silence where the API is absent.
  const copy = (): void => {
    const clipboard = navigator.clipboard
    if (!clipboard) return toast('error', t('desktop.toast.copyFailed'))
    void clipboard
      .writeText(url)
      .then(() => toast('success', t('desktop.toast.linkCopied')))
      .catch(() => toast('error', t('desktop.toast.copyFailed')))
  }

  return (
    <section className="meeting-meta">
      <div className="mm-row">
        <span className="mm-platform">{PLATFORM_LABELS[note.platform] ?? note.platform}</span>
        {note.startedAt && <span className="mm-when">{formatDateTime(note.startedAt)}</span>}
        {note.transcript && (
          <button type="button" className="mm-link" onClick={() => void toggle()}>
            {open ? t('desktop.meeting.hideTranscript') : t('desktop.meeting.showTranscript')}
          </button>
        )}
      </div>

      {participants.length > 0 && (
        <div className="mm-people">
          <span className="mm-label">{t('desktop.meeting.participants')}</span>
          {participants.map((p) => (
            <span key={p} className="mm-person">
              {p}
            </span>
          ))}
        </div>
      )}

      {/* Not an "open in browser" button: chrome-extension:// is not a scheme
          the OS can launch, and the extension runs in a dedicated profile that
          the default browser is not. Copying is the only form of this that
          actually works, so the field says what it is. */}
      <div className="mm-link-row">
        <span className="mm-label">{t('desktop.meeting.openInExtension')}</span>
        <input className="mm-url" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn" onClick={copy}>
          {t('desktop.meeting.copyLink')}
        </button>
      </div>

      {open && (
        <div className="mm-transcript">
          {busy && <p className="hint">{t('desktop.meeting.loadingTranscript')}</p>}
          {failed && <p className="hint">{failed}</p>}
          {lines?.length === 0 && <p className="hint">{t('desktop.meeting.emptyTranscript')}</p>}
          {lines?.map((l, i) => (
            <p key={i} className="mm-line">
              <span className="mm-time">{l.time ? l.time.slice(11, 16) : ''}</span>
              <span className="mm-speaker">{l.speaker}</span>
              <span>{l.text}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
