import { useEffect, useRef, useState } from 'react';
import type { Meeting } from '@meetcc/shared';
import { useToast } from '../toast';

// Teams avatar URLs need the Teams session cookies; from the extension page
// they 401 into a broken image, so fall back to the initial on load error.
function Avatar({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (!src || broken) {
    return <div className="avatar avatar-ph">{(name[0] || '?').toUpperCase()}</div>;
  }
  return <img className="avatar" src={src} alt="" onError={() => setBroken(true)} />;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function toTxt(m: Meeting): string {
  return m.entries.map((e) => `[${e.time}] ${e.speaker}: ${e.text}`).join('\n');
}

interface Props {
  meeting: Meeting;
  live: boolean;
  onClear: () => void;
}

export function Transcript({ meeting, live, onClear }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const toast = useToast();
  const { entries } = meeting;

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  return (
    <>
      <div className="subbar">
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(toTxt(meeting));
            toast('success', 'Transcript disalin.');
          }}
        >
          Copy
        </button>
        <button
          onClick={() => {
            const url = URL.createObjectURL(new Blob([toTxt(meeting)], { type: 'text/plain' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${meeting.id}.txt`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          TXT
        </button>
        <span className="spacer" />
        <button className="danger" onClick={onClear}>
          Clear
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <p className="empty-hint">Menunggu ada yang bicara…</p>
        </div>
      ) : (
        <div className="transcript" ref={ref} onScroll={onScroll}>
          {entries.map((e, i) => {
            const isTail = live && i === entries.length - 1;
            return (
              <article className="entry" key={`${e.time}-${i}`}>
                <Avatar src={e.avatar} name={e.speaker} />
                <div className="entry-body">
                  <div className="entry-head">
                    <span className="speaker">{e.speaker}</span>
                    <time className="stamp">{fmtTime(e.time)}</time>
                  </div>
                  <p className="text">
                    {e.text}
                    {isTail && <span className="caret" />}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
