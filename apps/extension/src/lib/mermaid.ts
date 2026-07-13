// Browser-only Mermaid wrapper. Kept out of @meetcc/exporters so that package
// stays DOM-free and node-testable; rendering (SVG + rasterization) is a UI
// concern shared by the Diagram tab (SVG) and the PDF export (PNG).
//
// mermaid is ~400KB — imported lazily (dynamic import) so it never weighs down
// the initial dashboard load, only when a diagram is actually shown/exported.

type MermaidApi = {
  initialize: (cfg: Record<string, unknown>) => void;
  parse: (def: string) => Promise<unknown>;
  render: (id: string, def: string) => Promise<{ svg: string }>;
};

import { lazyImport } from './lazy'

let apiPromise: Promise<MermaidApi> | null = null;

// theme 'neutral' + Helvetica match the PDF (black-on-white, jsPDF helvetica);
// securityLevel 'strict' sanitizes AI-authored definitions.
function loadMermaid(): Promise<MermaidApi> {
  apiPromise ??= lazyImport(() => import('mermaid')).then((m) => {
    const api = m.default as unknown as MermaidApi;
    api.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
      fontFamily: 'Helvetica, Arial, sans-serif',
      flowchart: { htmlLabels: false, useMaxWidth: true },
    });
    return api;
  });
  return apiPromise;
}

let seq = 0;
const nextId = () => `mcc-mermaid-${seq++}`;

/** Render to SVG markup for on-screen display. Throws on invalid syntax. */
export async function renderSvg(def: string): Promise<string> {
  const api = await loadMermaid();
  await api.parse(def); // surfaces syntax errors before render
  const { svg } = await api.render(nextId(), def);
  return svg;
}

export type { RasterPng as DiagramPng } from './raster';

/**
 * Rasterize a diagram to a PNG data URL at `scale`× resolution. High scale
 * (3-4×) ≈ 300 DPI at A4 width so text stays crisp in print — the single most
 * common cause of "Mermaid looks bad in PDF" is rasterizing at 1× screen res.
 */
export async function renderPng(def: string, scale = 4) {
  const { svgToPng } = await lazyImport(() => import('./raster'));
  return svgToPng(await renderSvg(def), scale, '#ffffff');
}
