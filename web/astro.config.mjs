import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const site = process.env.SITE_URL;
if (site) {
  const url = new URL(site);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'SITE_URL must be an HTTP(S) origin without a path, query or fragment.',
    );
  }
}

export default defineConfig({
  site,
  output: 'static',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  devToolbar: { enabled: false },
});
