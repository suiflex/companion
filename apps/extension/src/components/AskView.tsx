import { useEffect, useRef, useState } from 'react';
import { clearChat, loadChat, type ChatMessage, type Meeting } from '@meetcc/shared';
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

export function AskView({ meeting, live }: { meeting: Meeting; live: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // reload history when switching meetings
  useEffect(() => {
    let alive = true;
    void loadChat(meeting.id).then((h) => alive && setMessages(h));
    return () => {
      alive = false;
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
      if (res?.ok) {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: res.answer, time: new Date().toISOString() },
        ]);
      } else {
        toast('error', `Gagal: ${res?.error ?? 'unknown'}`);
      }
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
              Jawaban diambil dari isi rapat {meeting.id} dan disertai bukti (timestamp / pembicara).
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
