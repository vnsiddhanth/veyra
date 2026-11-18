/** Shows what Veyra stores on this device and lets the user free it, category by category. */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { clearFolder, listStoredFiles } from '@/storage/proxies';
import { formatBytes } from '@/utils/format';

interface Usage {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
  outputs: { count: number; size: number };
  proxies: { count: number; size: number };
}

const sum = (xs: { size: number }[]) => ({ count: xs.length, size: xs.reduce((s, x) => s + x.size, 0) });

export function StorageManager() {
  const [u, setU] = useState<Usage | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const est = await navigator.storage?.estimate?.().catch(() => null);
    const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null;
    const [outputs, proxies] = await Promise.all([listStoredFiles('outputs'), listStoredFiles('proxies')]);
    setU({ usage: est?.usage ?? null, quota: est?.quota ?? null, persisted, outputs: sum(outputs), proxies: sum(proxies) });
  }, []);
  useEffect(() => void refresh(), [refresh]);

  if (!u) return <p className="text-sm text-muted">Measuring storage…</p>;
  const pct = u.usage != null && u.quota ? Math.min(100, (u.usage / u.quota) * 100) : null;
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4 text-sm" aria-label="Storage on this device">
      <div>
        <div className="flex justify-between text-xs text-muted">
          <span>Used by this site</span>
          <span className="font-mono tabular">
            {u.usage != null ? formatBytes(u.usage) : 'unknown'}
            {u.quota ? ` of ${formatBytes(u.quota)} available` : ''}
          </span>
        </div>
        {pct != null && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
            <div className="h-full bg-accent" style={{ width: `${Math.max(1, pct)}%` }} />
          </div>
        )}
        <p className="mt-1 text-xs text-faint">
          {u.persisted ? 'Storage is persistent: the browser will not evict it under pressure.' : 'Storage is best-effort: the browser may evict it when the disk is nearly full.'}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {(
          [
            ['outputs', 'Finished exports and tool results', 'Temporary; removed when you dismiss a result and after 24 h.', u.outputs],
            ['proxies', 'Preview proxies', 'Small copies of large videos for smooth preview. Re-creatable.', u.proxies],
          ] as const
        ).map(([key, label, hint, v]) => (
          <li key={key} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{label}</p>
              <p className="text-xs text-muted">
                {v.count} file{v.count === 1 ? '' : 's'} · {formatBytes(v.size)} · {hint}
              </p>
            </div>
            <Button
              size="sm"
              disabled={v.count === 0}
              onClick={async () => {
                const n = await clearFolder(key);
                setMsg(`Removed ${n} file${n === 1 ? '' : 's'}.`);
                void refresh();
              }}
            >
              Clear
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">Projects, thumbnails and waveforms live in IndexedDB and are included in the total above. Your original media is never copied here.</p>
      {msg && (
        <p className="text-xs text-ok" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
