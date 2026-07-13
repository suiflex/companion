// Shared browser-side SVG -> PNG rasterizer, used by the Mermaid pipeline and
// the organization logo. High scale keeps text/edges crisp inside PDFs.

export interface RasterPng {
  dataUrl: string;
  /** intrinsic pixel size before scaling — used for PDF layout geometry */
  wPx: number;
  hPx: number;
}

export function svgSize(svg: string): { w: number; h: number } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = doc.documentElement;
  const vb = el.getAttribute('viewBox');
  if (vb) {
    const [, , w, h] = vb.split(/[\s,]+/).map(Number);
    if (w > 0 && h > 0) return { w, h };
  }
  const w = parseFloat(el.getAttribute('width') || '0');
  const h = parseFloat(el.getAttribute('height') || '0');
  return { w: w > 0 ? w : 600, h: h > 0 ? h : 400 };
}

/**
 * Rasterize SVG markup to a PNG data URL at `scale`× its intrinsic size.
 * `background` fills the canvas first (PDFs have no transparency); pass
 * null to keep transparency (e.g. logo over a dark cover).
 */
export async function svgToPng(
  svg: string,
  scale = 4,
  background: string | null = '#ffffff',
): Promise<RasterPng> {
  const { w, h } = svgSize(svg);
  // canvas has a hard max (~16k px on most engines); clamp scale so huge
  // inputs don't silently produce a blank canvas
  const MAX = 12000;
  const s = Math.max(1, Math.min(scale, MAX / w, MAX / h));

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image();
  img.width = w;
  img.height = h;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Gagal merender SVG ke gambar'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * s);
  canvas.height = Math.round(h * s);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context tidak tersedia');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return { dataUrl: canvas.toDataURL('image/png'), wPx: w, hPx: h };
}
