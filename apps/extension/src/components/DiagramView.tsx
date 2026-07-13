import { useEffect, useState } from 'react';
import type { Diagram, Meeting } from '@meetcc/shared';
import { renderSvg } from '../lib/mermaid';
import { useToast } from '../toast';

type State =
  | { status: 'rendering' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string };

/** Renders one Mermaid definition to inline SVG. Full syntax validation
 *  happens here (browser has the DOM the service worker lacks) — a bad
 *  diagram degrades to its source, the rest of the tab stays intact. */
function DiagramCard({ diagram, index }: { diagram: Diagram; index: number }) {
  const [state, setState] = useState<State>({ status: 'rendering' });
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setState({ status: 'rendering' });
    renderSvg(diagram.mermaid)
      .then((svg) => alive && setState({ status: 'ready', svg }))
      .catch((e: unknown) =>
        alive && setState({ status: 'error', message: (e as Error).message }),
      );
    return () => {
      alive = false;
    };
  }, [diagram.mermaid]);

  const copy = async () => {
    await navigator.clipboard.writeText(diagram.mermaid);
    toast('success', 'Sumber Mermaid disalin.');
  };

  return (
    <figure className="diagram-card" style={{ animationDelay: `${index * 70}ms` }}>
      <figcaption className="diagram-head">
        <span className="diagram-title">{diagram.title}</span>
        <span className="diagram-type">{diagram.type}</span>
        <span className="spacer" />
        <button className="ghost" onClick={copy}>
          ⧉ Copy source
        </button>
      </figcaption>
      <div className="diagram-plate">
        {state.status === 'rendering' && (
          <div className="diagram-loading" aria-live="polite">
            <span className="diagram-spinner" aria-hidden="true" />
            Merender diagram…
          </div>
        )}
        {state.status === 'ready' && (
          // svg is sanitized by mermaid (securityLevel: 'strict')
          <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: state.svg }} />
        )}
        {state.status === 'error' && (
          <div className="diagram-fallback" role="alert">
            <p className="diagram-err">Diagram tidak bisa dirender: {state.message}</p>
            <pre className="diagram-source">{diagram.mermaid}</pre>
          </div>
        )}
      </div>
    </figure>
  );
}

export function DiagramView({ meeting, diagrams }: { meeting: Meeting; diagrams: Diagram[] }) {
  if (!diagrams.length) {
    return (
      <div className="empty-state">
        <div className="empty-glyph">◇</div>
        <p>Belum ada diagram.</p>
        <p className="empty-hint">
          Diagram alur dibuat otomatis dari notulen bila rapat membahas proses
          atau urutan langkah. Rapat {meeting.id} belum menghasilkan diagram.
        </p>
      </div>
    );
  }
  return (
    <div className="diagram-scroll">
      {diagrams.map((d, i) => (
        <DiagramCard key={`${i}-${d.title}`} diagram={d} index={i} />
      ))}
    </div>
  );
}
