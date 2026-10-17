import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${site ? `<url><loc>${new URL('/', site).href.replace(/&/g, '&amp;')}</loc></url>` : ''}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
