import { svgToPng, type RasterPng } from './raster';

// Suiflex organization logo (public/icons/suiflex.svg), rasterized once to a
// PNG data URL for jsPDF covers. Transparent background: it sits on the dark
// cover panel. Returns null when the asset is missing — PDF export must never
// fail because of branding.

export const ORG_NAME = 'Suiflex';

let cached: Promise<RasterPng | null> | null = null;

export function orgLogoPng(): Promise<RasterPng | null> {
  cached ??= (async () => {
    try {
      const res = await fetch(chrome.runtime.getURL('icons/suiflex.svg'));
      if (!res.ok) return null;
      return await svgToPng(await res.text(), 2, null);
    } catch {
      return null;
    }
  })();
  return cached;
}
