# Deploying Veyra

Veyra is a static site: build once, serve the `dist/` folder. There is no server code, database or API key, and processing runs in visitors'
browsers, so hosting costs stay near zero at any traffic.

```bash
npm ci
npm run build        # outputs dist/
npm run preview      # optional: serve dist/ locally at http://localhost:4173 to check it
```

## Two requirements for any host

1. **Isolation headers on every response.** These enable the fastest media paths and are part of the security model:
   ```
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```
2. **Single-page-app fallback.** Unknown paths such as `/tools/trim-video` or `/editor/prj_…` must serve `index.html` with status 200.

The configs below already do both, plus a strict Content-Security-Policy and long-term caching of hashed assets.

## Cloudflare Pages (recommended — free, global CDN)

### One command from your computer

```powershell
npx.cmd wrangler@4 login     # once: opens your browser to sign in to Cloudflare
npm run deploy               # builds and uploads dist/ to the "veyra" Pages project
```

The first deploy creates the project and prints its address (`https://veyra.pages.dev` or similar). Run `npm run deploy` again to publish
updates. On Windows PowerShell use `npx.cmd`, because the default script policy blocks `npx.ps1`.

### Or automatic deploys from GitHub

1. Push the repository to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build command `npm run build`, output directory `dist`. Under *Environment variables* add `NODE_VERSION = 22`.
4. Deploy. `public/_headers` and `public/_redirects` are applied automatically.

## Netlify

**Add new site → Import an existing project** → pick the repo. `netlify.toml` sets the build command, output folder and Node version;
`_headers` and `_redirects` are picked up from `dist/`.

## Vercel

**Add New → Project** → import the repo. `vercel.json` sets the build, the headers and the SPA rewrite. No other settings are needed.

## Your own server

Copy `dist/` to the server and use [`deploy/nginx.conf`](deploy/nginx.conf) as a starting point. It serves `.wasm` as `application/wasm`
and sets the same headers and fallback.

## GitHub Pages

Not recommended. GitHub Pages cannot set custom response headers, so the isolation headers and the HTTP-level security policy are missing.

## Optional: sitemap

Set `VEYRA_SITE_URL` to your public URL at build time to emit `sitemap.xml` (and reference it from `robots.txt`):

```bash
VEYRA_SITE_URL=https://video.example.com npm run build
```

## Check a deployment

Open `/compatibility` on the deployed site. **Cross-origin isolated** must say *Yes*. Then convert a short clip with any tool: the result card
shows the validation checks it passed.
