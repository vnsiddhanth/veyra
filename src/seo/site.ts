/**
 * Page titles, descriptions, structured data and crawler-readable content for every public route.
 * Used by the app (document.title at runtime) and by the build, which writes one static HTML file
 * per route so search engines and AI crawlers that do not run JavaScript still see each page.
 *
 * Pure data only: relative imports, no DOM, no React (the Vite config imports this file).
 */
import { BRAND } from '../config/brand.ts';
import { CATEGORY_LABELS, TOOLS, relatedTools, type ToolCategory, type ToolDef } from '../tools/registry.ts';
import { guideFor } from '../tools/guides.ts';

/** The promise people search for. Kept identical everywhere. */
export const PROMISE = 'Your video is never uploaded: it is processed on your own device, in your browser.';

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Are my videos uploaded anywhere?',
    a: 'No. The page reads files straight from your disk and processes them in your browser. Its security policy blocks it from sending your media to any server, and you can confirm that in your browser’s network panel.',
  },
  {
    q: 'Is it really free? What’s the catch?',
    a: 'There is no paid plan, no watermark and no limit. Because the work happens on your device, running the site costs almost nothing — that is what keeps it free.',
  },
  {
    q: 'How large can my files be?',
    a: 'There is no limit set by us. Large files are read in pieces rather than loaded into memory at once, and results are written to disk as they are made. Your device’s memory, storage and codecs set the practical limit.',
  },
  {
    q: 'Which browser should I use?',
    a: 'Recent Chrome or Edge support the most codecs and features. Firefox works too (it saves MP4 audio as Opus because it has no AAC encoder). Safari is not fully supported yet. The compatibility page shows exactly what your browser can do.',
  },
  {
    q: 'What happens to my project if I close the tab?',
    a: 'Projects save automatically in your browser. Your media stays where it is on your disk; in Chrome and Edge the editor reconnects with one click, in other browsers you pick the files again once.',
  },
  {
    q: 'Can I see the code?',
    a: `Yes. ${BRAND.name} is open source under the MIT licence. Read it, run it yourself or contribute on GitHub.`,
  },
  {
    q: 'Which formats can I open?',
    a: 'MP4, MOV, WebM, MKV, MPEG-TS, Ogg, MP3, WAV, M4A, FLAC, common images and SRT/VTT subtitles. Older formats like AVI, FLV and WMV are not supported — convert them first with a desktop tool.',
  },
];

const SMALL = new Set(['a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'by', 'with', '&', '/']);

/** "compress to target size" → "Compress to Target Size"; keeps MP4, GIF, etc. as written. */
export function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export interface PageInfo {
  path: string;
  title: string;
  description: string;
  /** Visible headline in the crawler-readable body. */
  h1: string;
  jsonLd: object[];
}

const app = (name: string, description: string, url: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name,
  url,
  description,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires a modern browser with WebCodecs (Chrome, Edge or Firefox).',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
});

/** Google shows about 60 characters; long tool names drop the less important words first. */
export function toolTitle(tool: ToolDef): string {
  const t = titleCase(tool.title);
  const options = [`${t} Online — Free, No Upload | ${BRAND.name}`, `${t} — Free, No Upload | ${BRAND.name}`, `${t} — No Upload | ${BRAND.name}`];
  return options.find((o) => o.length <= 60) ?? options[options.length - 1]!;
}
export function toolDescription(tool: ToolDef): string {
  return `${tool.summary} Runs in your browser, so your video is never uploaded. Free, no watermark, no sign-up.`;
}

/** Metadata for a route, or null if it is not a public page. `site` is the absolute origin ('' when unknown). */
export function pageInfo(path: string, site = ''): PageInfo | null {
  const url = `${site}${path}`;
  const tool = path.startsWith('/tools/') ? TOOLS.find((t) => `/tools/${t.slug}` === path) : undefined;
  if (tool) {
    const g = guideFor(tool.slug);
    const description = toolDescription(tool);
    const ld: object[] = [app(`${tool.title} — ${BRAND.name}`, description, url)];
    if (g)
      ld.push({
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: `How to use ${tool.title} without uploading your video`,
        step: g.steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })),
      });
    return { path, title: toolTitle(tool), description, h1: `${tool.title} online — free, no upload`, jsonLd: ld };
  }
  const homeDesc = `Free online video editor and ${TOOLS.length} video tools that run entirely in your browser. No upload, no watermark, no account. Compress, convert, trim, merge and more — open source.`;
  const simple: Record<string, [string, string, string]> = {
    '/': [`Free Online Video Editor — No Upload, No Watermark | ${BRAND.name}`, homeDesc, 'Free video editor that never uploads your videos'],
    '/tools': [
      `All Video Tools Online — Free, No Upload | ${BRAND.name}`,
      `${TOOLS.length} free video tools — compress, convert, trim, merge, resize, add text, make GIFs and more. Everything runs in your browser; nothing is uploaded.`,
      'All video tools — free, no upload',
    ],
    '/editor': [
      `Online Video Editor — Free, No Upload | ${BRAND.name}`,
      'A multitrack video editor in your browser: cuts, transitions, titles, colour and audio mixing. Your media never leaves your device. Free, no watermark.',
      'Online video editor — free, no upload',
    ],
    '/guide': [
      `How to Edit Video in Your Browser Without Uploading | ${BRAND.name}`,
      `Step-by-step guides for the ${BRAND.name} editor and all ${TOOLS.length} tools. Everything runs locally in your browser.`,
      'Guide: edit video in your browser without uploading',
    ],
    '/privacy': [
      `Privacy: Your Videos Are Never Uploaded | ${BRAND.name}`,
      `${BRAND.name} processes your media on your device. Nothing is uploaded. See exactly what is stored locally and clear it.`,
      'Privacy: your videos are never uploaded',
    ],
    '/compatibility': [
      `Browser Compatibility — ${BRAND.name}`,
      'Live check of which video and audio codecs your browser can decode and encode for in-browser editing.',
      'Browser compatibility',
    ],
    '/benchmark': [`Device Benchmark — ${BRAND.name}`, 'Measure how fast your device encodes, decodes and exports video in the browser.', 'Device benchmark'],
    '/filmmakers': [
      `Free Video Editor for Filmmakers — No Upload | ${BRAND.name}`,
      'Scopes, dialogue noise reduction, LUFS loudness, rolling credits, freeze frames and FCPXML hand-off to DaVinci Resolve. Free, in your browser, nothing uploaded.',
      'Finish your short film in the browser',
    ],
    '/feedback': [`Report a Problem — ${BRAND.name}`, `Report a bug, make a complaint or suggest an idea for ${BRAND.name}.`, 'Report a problem'],
  };
  const s = simple[path];
  if (!s) return null;
  const [title, description, h1] = s;
  const ld: object[] = [];
  if (path === '/') {
    ld.push(app(BRAND.name, description, url));
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    });
  }
  return { path, title, description, h1, jsonLd: ld };
}

/** Every public route, for the sitemap and static pages. */
export function publicPaths(): string[] {
  return ['/', '/tools', '/filmmakers', '/editor', '/guide', '/privacy', '/compatibility', '/benchmark', '/feedback', ...TOOLS.map((t) => `/tools/${t.slug}`)];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toolList(tools: ToolDef[]): string {
  return `<ul>${tools.map((t) => `<li><a href="/tools/${t.slug}">${esc(t.title)}</a> — ${esc(t.summary)}</li>`).join('')}</ul>`;
}

function byCategory(): string {
  const cats = Object.keys(CATEGORY_LABELS) as ToolCategory[];
  return cats
    .map((c) => {
      const ts = TOOLS.filter((t) => t.category === c);
      return ts.length ? `<h2>${esc(CATEGORY_LABELS[c])}</h2>${toolList(ts)}` : '';
    })
    .join('');
}

/**
 * Crawler-readable page content, placed inside #root. The app replaces it on start, so visitors see
 * the normal interface; crawlers that do not run JavaScript read this.
 */
export function staticBody(info: PageInfo): string {
  const nav = `<nav aria-label="Main"><a href="/">${BRAND.name}</a> · <a href="/tools">Tools</a> · <a href="/editor">Editor</a> · <a href="/guide">Guide</a> · <a href="/privacy">Privacy</a></nav>`;
  let main = `<h1>${esc(info.h1)}</h1><p>${esc(info.description)}</p>`;
  const tool = TOOLS.find((t) => `/tools/${t.slug}` === info.path);
  if (tool) {
    const g = guideFor(tool.slug);
    main += `<p><strong>${esc(PROMISE)}</strong></p>`;
    if (g) {
      main += `<h2>When to use it</h2><p>${esc(g.when)}</p>`;
      main += `<h2>How to use ${esc(tool.title)}</h2><ol>${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
      if (g.tips?.length) main += `<h2>Tips</h2><ul>${g.tips.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
    }
    main += `<h2>Related tools</h2>${toolList(relatedTools(tool))}`;
  } else if (info.path === '/filmmakers') {
    main += `<h2>Quick film tools</h2>${toolList(TOOLS.filter((t) => t.category === 'film'))}`;
    main += '<h2>In the editor</h2><ul><li>Video scopes: waveform, RGB parade, vectorscope, histogram</li><li>Framing guides: safe areas, 2.39:1, 1.85:1, 4:3, 9:16</li><li>Dialogue noise reduction, EQ, compressor, auto-ducking</li><li>Delivery loudness to −14, −16, −23 or −24 LUFS</li><li>Freeze frame, speed ramps, rolling credits, LUTs, curves, chroma key</li><li>FCPXML and EDL hand-off to DaVinci Resolve, Premiere and Final Cut</li></ul>';
  } else if (info.path === '/' || info.path === '/tools') {
    if (info.path === '/') main += `<p><strong>${esc(PROMISE)}</strong> No account, no watermark, no file size limit set by us.</p><p><a href="/editor">Open the editor</a> or pick a tool:</p>`;
    main += byCategory();
    if (info.path === '/') main += `<h2>Questions</h2>${FAQ.map(({ q, a }) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}`;
  }
  return `<div class="veyra-static mx-auto max-w-3xl px-4 py-10">${nav}<main>${main}</main></div>`;
}

/** /llms.txt: a plain summary of the site for AI assistants. */
export function llmsTxt(site: string): string {
  const cats = Object.keys(CATEGORY_LABELS) as ToolCategory[];
  return [
    `# ${BRAND.name}`,
    '',
    `> ${BRAND.name} is a free, open-source video editor and set of ${TOOLS.length} video tools that run entirely in the web browser. Videos are never uploaded: all processing happens on the user's device using WebCodecs. No account, no watermark, no file size limit set by the site.`,
    '',
    'Key facts:',
    '- Price: free. No paid plan, no watermark, no sign-up.',
    '- Privacy: files are read from the user\'s disk and processed locally; the site\'s Content Security Policy blocks sending media to any server.',
    '- Browsers: best in Chrome and Edge; Firefox works (MP4 audio is saved as Opus); Safari is not fully supported yet.',
    '- Formats: MP4, MOV, WebM, MKV, MPEG-TS, Ogg, MP3, WAV, M4A, FLAC, images, SRT/VTT. Not AVI, FLV or WMV.',
    `- Source code (MIT): ${BRAND.repoUrl}`,
    '',
    '## Main pages',
    `- [Editor](${site}/editor): multitrack timeline editor with cuts, transitions, titles, colour and audio mixing`,
    `- [All tools](${site}/tools)`,
    `- [Guide](${site}/guide): how to use every tool`,
    `- [Privacy](${site}/privacy): what stays on the device`,
    '',
    ...cats.flatMap((c) => {
      const ts = TOOLS.filter((t) => t.category === c);
      return ts.length ? [`## ${CATEGORY_LABELS[c]}`, ...ts.map((t) => `- [${t.title}](${site}/tools/${t.slug}): ${t.summary}`), ''] : [];
    }),
  ].join('\n');
}
