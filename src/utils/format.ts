export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[i]}`;
}

/** Human duration, e.g. 1:02:03.45 or 3:07.20 */
export function formatDuration(seconds: number | null | undefined, precision = 2): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const sign = seconds < 0 ? '-' : '';
  const s = Math.abs(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const secStr = sec.toFixed(precision).padStart(precision > 0 ? precision + 3 : 2, '0');
  return h > 0 ? `${sign}${h}:${String(m).padStart(2, '0')}:${secStr}` : `${sign}${m}:${secStr}`;
}

export function formatBitrate(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) return '—';
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
}

export function formatFps(fps: number | null | undefined): string {
  if (fps == null || !Number.isFinite(fps)) return '—';
  return `${Number(fps.toFixed(3))} fps`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Reduced aspect ratio, with a friendly name for common ratios. */
export function formatAspectRatio(width: number, height: number): string {
  if (!width || !height) return '—';
  const g = gcd(Math.round(width), Math.round(height));
  const r = width / height;
  const named: Array<[number, string]> = [
    [16 / 9, '16:9'],
    [9 / 16, '9:16'],
    [4 / 3, '4:3'],
    [3 / 4, '3:4'],
    [1, '1:1'],
    [21 / 9, '21:9'],
    [4 / 5, '4:5'],
    [2.39, '2.39:1'],
  ];
  for (const [value, label] of named) if (Math.abs(r - value) < 0.01) return label;
  return `${width / g}:${height / g} (${r.toFixed(3)}:1)`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
