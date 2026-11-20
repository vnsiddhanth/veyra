/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { llmsTxt, pageInfo, publicPaths, staticBody } from './src/seo/site.ts';

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
  // Cloudflare Web Analytics (cookie-free visit counter, injected by Cloudflare Pages)
  "script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' blob: https://cloudflareinsights.com",
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
 * Search and AI-crawler support:
 * - one static HTML file per public route (tools/compress-video.html, …) with its own title,
 *   description, canonical URL, JSON-LD and readable content inside #root. The app replaces that
 *   content when it starts; crawlers that do not run JavaScript (most AI crawlers) read it.
 * - robots.txt always; sitemap.xml and llms.txt when VEYRA_SITE_URL is set (they need absolute URLs).
 */
function seoPlugin(): Plugin {
  const site = (process.env.VEYRA_SITE_URL ?? '').replace(/\/$/, '');
  return {
    name: 'veyra-seo',
    apply: 'build',
    generateBundle() {
      let robots = 'User-agent: *\nAllow: /\nDisallow: /editor/\n';
      if (site) {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicPaths()
          .map((p) => `  <url><loc>${site}${p}</loc></url>`)
          .join('\n')}\n</urlset>\n`;
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml });
        this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llmsTxt(site) });
        robots += `Sitemap: ${site}/sitemap.xml\n`;
      }
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
    },
    writeBundle(options) {
      const dir = options.dir ?? 'dist';
      const shell = readFileSync(`${dir}/index.html`, 'utf8');
      const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      for (const path of publicPaths()) {
        const info = pageInfo(path, site)!;
        const head = [
          site ? `<link rel="canonical" href="${site}${path === '/' ? '/' : path}" />` : '',
          site ? `<meta property="og:url" content="${site}${path}" />` : '',
          ...info.jsonLd.map((o) => `<script type="application/ld+json" data-static>${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`),
        ]
          .filter(Boolean)
          .join('\n    ');
        const html = shell
          .replace(/<title>[^<]*<\/title>/, `<title>${attr(info.title)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*(")/, `$1${attr(info.description)}$2`)
          .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${attr(info.title)}$2`)
          .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${attr(info.description)}$2`)
          .replace('</head>', `  ${head}\n  </head>`)
          .replace('<div id="root"></div>', `<div id="root">${staticBody(info)}</div>`);
        const file = path === '/' ? 'index.html' : `${path.slice(1)}.html`;
        mkdirSync(dirname(`${dir}/${file}`), { recursive: true });
        writeFileSync(`${dir}/${file}`, html);
      }
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
