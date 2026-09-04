import { useEffect, useState } from 'react';
import { t } from '@meetcc/shared/i18n';
import type { Diagram, Meeting } from '@meetcc/shared';
import { lazyImport } from '../lib/lazy';
import { useToast } from '../toast';

type State =
  | { status: 'rendering' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string };

/** Renders one Mermaid definition to inline SVG. Full syntax validation
 *  happens here (browser has the DOM the service worker lacks) — a bad
 *  diagram degrades to its source, the rest of the tab stays intact.
 *
 *  The wrapper is imported dynamically, the same way SummaryView's PDF export
 *  does it: a static import here would pull it into the main dashboard chunk
 *  and block that split for both call sites. */
function DiagramCard({ diagram, index }: { diagram: Diagram; index: number }) {
  const [state, setState] = useState<State>({ status: 'rendering' });
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setState({ status: 'rendering' });
    lazyImport(() => import('../lib/mermaid'))
      .then(({ renderSvg }) => renderSvg(diagram.mermaid))
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
    toast('success', t('ext.diagram.copied'));
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
            <p className="diagram-err">{t('ext.diagram.renderFailed', { message: state.message })}</p>
            <pre className="diagram-source">{diagram.mermaid}</pre>
          </div>
        )}
      </div>
    </figure>
  );
}

interface Props {
  meeting: Meeting;
  diagrams: Diagram[];
  analysisReady: boolean;
}

export function DiagramView({ meeting, diagrams, analysisReady }: Props) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const generate = async () => {
    setBusy(true);
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'generate-diagram',
        meetingId: meeting.id,
      });
      if (res?.ok) {
        toast(
          res.count ? 'success' : 'info',
          res.count
            ? `${res.count} diagram dibuat.`
            : 'Tidak ada alur/proses yang bisa didiagramkan.',
        );
      } else {
        toast('error', t('ext.failed', { error: res?.error ?? t('ext.unknownError') }));
      }
    } catch (e) {
      toast('error', t('ext.failed', { error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const genButton = (
    <button
      className="primary"
      onClick={generate}
      disabled={busy || !analysisReady}
      title={analysisReady ? '' : t('ext.diagram.needSummary')}
    >
      {busy
        ? t('ext.diagram.generating')
        : diagrams.length
          ? t('ext.diagram.regenerate')
          : t('ext.diagram.generate')}
    </button>
  );

  if (busy && !diagrams.length) {
    return (
      <div className="summary-body">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton skeleton-block" />
        ))}
      </div>
    );
  }

  if (!diagrams.length) {
    return (
      <div className="empty-state">
        <div className="empty-glyph">◇</div>
        <p>{t('ext.diagram.empty')}</p>
        <p className="empty-hint">
          {analysisReady
            ? t('ext.diagram.hint', { id: meeting.id })
            : t('ext.diagram.hintNoSummary')}
        </p>
        {genButton}
      </div>
    );
  }
  return (
    <>
      <div className="subbar">
        <span className="dim" style={{ fontSize: 11 }}>
          {diagrams.length} diagram
        </span>
        <span className="spacer" />
        {genButton}
      </div>
      <div className="diagram-scroll">
        {diagrams.map((d, i) => (
          <DiagramCard key={`${i}-${d.title}`} diagram={d} index={i} />
        ))}
      </div>
    </>
  );
}
