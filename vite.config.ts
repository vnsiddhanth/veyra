/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Cross-origin isolation is required for SharedArrayBuffer (multi-threaded WASM fallback).
// Everything we load is same-origin, so `require-corp` costs nothing.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Production CSP, injected as a <meta> so it holds on any static host (headers in public/_headers
// repeat it with frame-ancestors, which meta tags cannot set). Not applied in dev: Vite's HMR uses inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const cspPlugin: Plugin = {
  name: 'veyra-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
  },
};

/**
 * robots.txt always; sitemap.xml only when VEYRA_SITE_URL (e.g. https://example.com) is set, because
 * sitemaps need absolute URLs and we will not invent a domain.
 */
function seoPlugin(): Plugin {
  return {
    name: 'veyra-seo',
    apply: 'build',
    async generateBundle() {
      const site = (process.env.VEYRA_SITE_URL ?? '').replace(/\/$/, '');
      let robots = 'User-agent: *\nAllow: /\nDisallow: /editor/\n';
      if (site) {
        const src = readFileSync(new URL('./src/tools/registry.ts', import.meta.url), 'utf8');
        const slugs = [...src.matchAll(/^\s+(?:tool|inspect)\('([a-z0-9-]+)'/gm)].map((m) => m[1]);
        const trimSlugs = [...src.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]);
        const paths = ['/', '/tools', '/editor', '/privacy', '/compatibility', '/benchmark', '/guide', ...[...new Set([...slugs, ...trimSlugs])].map((s) => `/tools/${s}`)];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml });
        robots += `Sitemap: ${site}/sitemap.xml\n`;
      }
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin, seoPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  // Pre-bundle media deps so the dev server never reloads the page mid-session when a worker first imports them.
  optimizeDeps: { include: ['mediabunny', 'gifenc', '@mediabunny/mp3-encoder'] },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
