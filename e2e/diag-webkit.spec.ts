// TEMPORARY diagnostics for the macOS WebKit job. Not part of the suite; removed before merge.
import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { engineReady, fixture } from './helpers';

test('diag: storage, encoder bitrate, OPFS listing', async ({ page }) => {
  test.setTimeout(240_000);
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
  await page.goto('/tools/trim-video');
  await engineReady(page);
  const b64 = readFileSync(fixture('counter-720p30-5s.mp4')).toString('base64');
  const r = await page.evaluate(async (b64) => {
    const out: Record<string, unknown> = {};
    const step = async (k: string, f: () => Promise<unknown>) => {
      try {
        out[k] = await f();
      } catch (e: any) {
        out[k] = `THREW ${e?.name}: ${e?.message}`;
      }
    };
    out.mainCreateWritable = typeof (FileSystemFileHandle.prototype as any).createWritable;
    out.mainSync = typeof (FileSystemFileHandle.prototype as any).createSyncAccessHandle;
    await step('estimate', () => navigator.storage.estimate());
    await step('persisted', () => navigator.storage.persisted());
    await step('worker', () =>
      new Promise((res) => {
        const src = `onmessage = async () => { const o = {}; o.cw = typeof FileSystemFileHandle.prototype.createWritable; o.sync = typeof FileSystemFileHandle.prototype.createSyncAccessHandle;
          try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('diag', {create:true}); const f = await d.getFileHandle('x.bin', {create:true});
            const h = await f.createSyncAccessHandle(); h.truncate(0); let at=0; const buf = new Uint8Array(1<<20); for (let i=0;i<20;i++) at += h.write(buf, {at}); h.flush(); h.close(); o.wrote = at; o.size = (await f.getFile()).size; await d.removeEntry('x.bin'); } catch (e) { o.err = e.name + ': ' + e.message; }
          postMessage(o); }`;
        const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        w.onmessage = (e) => res(e.data);
        w.onerror = (e) => res('worker error ' + e.message);
        w.postMessage(0);
      }),
    );
    await step('list', async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const n of (root as any).keys()) names.push(n);
      const o = await root.getDirectoryHandle('outputs', { create: true });
      const outs: string[] = [];
      for await (const n of (o as any).keys()) outs.push(n);
      return { root: names, outputs: outs };
    });
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'c.mp4', { type: 'video/mp4' });
    const { mediaEngine } = (window as any).__veyra;
    for (const br of ['very-low', 150_000, 400_000, 2_000_000]) {
      await step(`compress ${br}`, async () => {
        const res = await mediaEngine.convert(file, { container: 'mp4', copy: 'never', video: { bitrate: br }, audio: { bitrate: 64_000 }, fileName: `d${br}` }).result;
        const s = { size: res.file.size, storage: res.storage, src: file.size };
        await mediaEngine.releaseOutput(res);
        return s;
      });
    }
    for (const codec of ['vp9', 'vp8', 'avc']) {
      await step(`encode ${codec}`, async () => {
        const res = await mediaEngine.convert(file, { container: codec === 'avc' ? 'mp4' : 'webm', copy: 'never', video: { codec }, fileName: `e${codec}` }).result;
        const s = { size: res.file.size, storage: res.storage };
        await mediaEngine.releaseOutput(res);
        return s;
      });
    }
    await step('cancel', async () => {
      const job = mediaEngine.convert(file, { container: 'webm', copy: 'never', video: { codec: 'vp9' }, fileName: 'cancel-me' });
      job.onProgress((p: number) => p > 0.1 && job.cancel());
      try {
        await job.result;
        return 'resolved';
      } catch (e: any) {
        return `code=${e.code} name=${e.name} ${e.message}`;
      }
    });
    await new Promise((r) => setTimeout(r, 1500));
    await step('list after', async () => {
      const o = await (await navigator.storage.getDirectory()).getDirectoryHandle('outputs', { create: true });
      const outs: string[] = [];
      for await (const n of (o as any).keys()) outs.push(n);
      return outs;
    });
    await step('estimate after', () => navigator.storage.estimate());
    return out;
  }, b64);
  console.log('DIAG', JSON.stringify(r, null, 1));
});

test('diag: proxy', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(fixture('counter-1080p60-3s.mp4'));
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').first();
  await card.getByRole('button', { name: 'counter-1080p60-3s', exact: true }).click();
  await card.getByRole('button', { name: /Create preview proxy/ }).click();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const t = await page.locator('body').innerText();
    const m = /Proxy failed[^\n]*/.exec(t);
    if (m) {
      console.log('DIAG proxy:', m[0]);
      return;
    }
    if ((await card.getByTitle('Preview proxy', { exact: true }).textContent().catch(() => null)) === 'proxy') {
      console.log('DIAG proxy: ok');
      return;
    }
    await page.waitForTimeout(250);
  }
  console.log('DIAG proxy: timeout');
});
