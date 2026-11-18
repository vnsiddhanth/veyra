/**
 * SRT / WebVTT parsing and serialization.
 * Output is plain text with a tiny styling whitelist. Any other markup is stripped,
 * so subtitle content can never inject HTML.
 */
export interface SubtitleCue {
  /** Seconds. */
  start: number;
  end: number;
  text: string;
}

export interface SubtitleParseResult {
  cues: SubtitleCue[];
  errors: string[];
}

const TIME_RE = /(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;

export function parseTimestamp(s: string): number | null {
  const m = TIME_RE.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = Number((m[4] ?? '0').padEnd(3, '0'));
  if (min > 59 || sec > 59) return null;
  return h * 3600 + min * 60 + sec + ms / 1000;
}

/** Remove all tags except <b>, <i>, <u> (kept as plain markers for our renderer), and decode basic entities. */
export function sanitizeCueText(text: string): string {
  return text
    .replace(/<(?!\/?(?:b|i|u)>)[^>]*>/gi, '')
    .replace(/\{\\[^}]*\}/g, '') // ASS-style override tags sometimes found in SRT
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

export function parseSubtitles(source: string): SubtitleParseResult {
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const isVtt = text.trimStart().startsWith('WEBVTT');
  const blocks = text.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  const errors: string[] = [];
  blocks.forEach((block, i) => {
    const lines = block.split('\n').filter((l, idx) => idx > 0 || l.trim() !== '');
    if (lines.length === 0) return;
    if (isVtt && (lines[0]!.startsWith('WEBVTT') || /^(NOTE|STYLE|REGION)\b/.test(lines[0]!))) return;
    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx === -1) {
      if (block.trim()) errors.push(`Block ${i + 1}: no timing line.`);
      return;
    }
    const [a, b] = lines[timingIdx]!.split('-->');
    const start = parseTimestamp(a ?? '');
    const end = parseTimestamp((b ?? '').trim().split(/\s+/)[0] ?? '');
    if (start == null || end == null) {
      errors.push(`Block ${i + 1}: invalid timestamp.`);
      return;
    }
    if (end <= start) {
      errors.push(`Block ${i + 1}: end time is not after start time.`);
      return;
    }
    const body = sanitizeCueText(lines.slice(timingIdx + 1).join('\n'));
    if (!body) return;
    cues.push({ start, end, text: body });
  });
  cues.sort((x, y) => x.start - y.start);
  return { cues, errors };
}

function stamp(seconds: number, sep: ',' | '.'): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms, 3)}`;
}

export function toSrt(cues: SubtitleCue[]): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function toVtt(cues: SubtitleCue[]): string {
  return `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')}`;
}
