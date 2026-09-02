import { useEffect, useRef, useState } from 'react';
import {
  CHAT_PREFIX,
  clearChat,
  displayMeetingId,
  loadChat,
  watchStorage,
  type Answerability,
  type AskResult,
  type ChatMessage,
  type Meeting,
} from '@meetcc/shared';
import { useToast } from '../toast';

const SUGGESTIONS = [
  'Apa keputusan utama rapat ini?',
  'Siapa yang bertanggung jawab atas action item?',
  'Adakah deadline yang disebut?',
  'Apa yang belum terjawab di rapat ini?',
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** The four grades are the point of Ask v2: "partial" and "inferred" are real
 *  answers, so they must not look like a failure in the UI. */
const ANSWERABILITY_LABEL: Record<Answerability, string> = {
  explicit: 'Disebut langsung',
  partial: 'Belum tuntas dibahas',
  inferred: 'Simpulan dari pembahasan',
  not_found: 'Tidak dibahas',
};

function confidenceLabel(c: number): string {
  return c >= 0.75 ? 'tinggi' : c >= 0.45 ? 'sedang' : 'rendah';
}

function ResultMeta({ result, onAsk }: { result: AskResult; onAsk: (q: string) => void }) {
  return (
    <div className="ask-meta">
      <div className="ask-grades">
        <span className={`ask-grade ask-grade-${result.answerability}`}>
          {ANSWERABILITY_LABEL[result.answerability]}
        </span>
        {result.intent === 'advise' && (
          <span className="ask-grade ask-grade-advise">Analisis Companion, di luar isi rapat</span>
        )}
        <span className="ask-conf dim">Keyakinan {confidenceLabel(result.confidence)}</span>
      </div>

      {result.missing.length > 0 && (
        <div className="ask-missing">
          <span className="ask-meta-label">Belum diputuskan</span>
          <ul>
            {result.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {result.evidence.length > 0 && (
        <div className="ask-evidence">
          <span className="ask-meta-label">Bukti dari transcript</span>
          <ul>
            {result.evidence.map((e, i) => (
              <li key={i}>
                <span className="ask-ev-who">
                  {e.speakers.join(', ')} · {fmtTime(e.startTime)}
                </span>
                <span className="ask-ev-text">{e.preview}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.followUps.length > 0 && (
        <div className="ask-followups">
          {result.followUps.map((q, i) => (
            <button key={i} className="ask-chip" onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AskView({ meeting, live }: { meeting: Meeting; live: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Storage is the transcript of the conversation, not this component. The
  // service worker writes both turns there — it holds the API key, so it has
  // to — and this follows along, which is what makes an answer that landed
  // while the view was unmounted show up on the way back.
  useEffect(() => {
    let alive = true;
    const reload = () => void loadChat(meeting.id).then((h) => alive && setMessages(h));
    reload();
    const stop = watchStorage(reload, [CHAT_PREFIX]);
    return () => {
      alive = false;
      stop();
    };
  }, [meeting.id]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  const send = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    setInput('');
    const now = new Date().toISOString();
    setMessages((m) => [...m, { role: 'user', content: question, time: now }]);
    setBusy(true);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'ask', meetingId: meeting.id, question });
      // The answer arrives through storage, like every other turn — appending
      // it here as well would show it twice.
      if (!res?.ok) toast('error', `Gagal: ${res?.error ?? 'unknown'}`);
    } catch (e) {
      toast('error', `Gagal: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    await clearChat(meeting.id);
    setMessages([]);
    toast('info', 'Riwayat tanya-jawab dihapus.');
  };

  const empty = messages.length === 0;

  return (
    <div className="ask">
      <div className="subbar">
        <span className="ask-hint dim">Tanya apa saja tentang rapat ini — dijawab dari transcript.</span>
        <span className="spacer" />
        <button className="danger" onClick={clear} disabled={empty || busy}>
          Clear
        </button>
      </div>

      <div className="ask-scroll" ref={scroller}>
        {empty && !busy ? (
          <div className="ask-empty">
            <div className="empty-glyph">?</div>
            <p>Tanya ke transcript.</p>
            <p className="empty-hint">
              Jawaban diambil dari isi rapat {displayMeetingId(meeting.id)} dan disertai bukti (timestamp / pembicara).
            </p>
            <div className="ask-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ask-chip" onClick={() => void send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ask-thread">
            {messages.map((m, i) => (
              <div key={i} className={`bubble bubble-${m.role}`}>
                <div className="bubble-text">{m.content}</div>
                {m.result && <ResultMeta result={m.result} onAsk={(q) => void send(q)} />}
                <time className="bubble-time">{fmtTime(m.time)}</time>
              </div>
            ))}
            {busy && (
              <div className="bubble bubble-assistant" aria-live="polite">
                <div className="typing" aria-label="Menjawab">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        className="ask-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          className="ask-input"
          value={input}
          rows={1}
          placeholder={live ? 'Rapat masih berlangsung — tetap bisa ditanya' : 'Tulis pertanyaan…'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          aria-label="Pertanyaan"
        />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          {busy ? '…' : 'Kirim'}
        </button>
      </form>
    </div>
  );
}
