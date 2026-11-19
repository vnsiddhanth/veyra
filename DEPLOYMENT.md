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

## Cloudflare (recommended — free, global CDN) — **this is how veyra is deployed**

Live: **https://veyraedit.pages.dev** (Cloudflare Pages, primary) — also mirrored at https://veyra.siddhanth-n-vishnubhotla.workers.dev

Cloudflare now serves static sites through **Workers static assets** (the successor to Pages). `wrangler.toml` points at `dist/`,
enables single-page-app routing, and `dist/_headers` supplies the isolation and security headers.

### Deploy from your computer

```powershell
npx.cmd wrangler@4 login     # once: authorise Wrangler in your browser
npm run deploy               # build + upload to veyraedit.pages.dev
```

On Windows PowerShell use `npx.cmd`, because the default script policy blocks `npx.ps1`. If the browser sign-in fails with
"No CSRF value", sign in at dash.cloudflare.com first in the same browser, and turn off Brave Shields for that site.

### Automatic deploys on every push

`.github/workflows/deploy.yml` deploys whenever `main` changes, once two repository secrets exist:

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers** → create, then copy the token.
2. GitHub → repository **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN`: the token from step 1.
   - `CLOUDFLARE_ACCOUNT_ID`: shown by `npx.cmd wrangler@4 whoami`, or on the right-hand side of the Cloudflare dashboard.

Until both are set, the workflow skips itself.

### Custom domain

Cloudflare dashboard → **Workers & Pages → veyra → Settings → Domains & Routes → Add → Custom domain**. If you set one, rebuild with
`VEYRA_SITE_URL=https://your.domain` to emit a sitemap.

## Netlify

**Add new site → Import an existing project** → pick the repo. `netlify.toml` sets the build command, output folder and Node version;
`_headers` is picked up from `dist/`.

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
