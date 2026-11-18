import { describe, expect, it } from 'vitest';
import { parseSubtitles, parseTimestamp, sanitizeCueText, toSrt, toVtt } from './parse';

const SRT = `1
00:00:01,000 --> 00:00:02,500
Hello <i>world</i>

2
00:00:03,000 --> 00:00:04,000
<script>alert(1)</script>Line one
Line two

3
00:00:05,000 --> 00:00:04,000
Backwards cue
`;

describe('subtitle parsing', () => {
  it('parses SRT cues, sanitises markup and reports bad cues', () => {
    const { cues, errors } = parseSubtitles(SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 2.5, text: 'Hello <i>world</i>' });
    expect(cues[1]!.text).toBe('alert(1)Line one\nLine two');
    expect(errors).toHaveLength(1);
  });

  it('parses WebVTT with headers, notes, cue ids, settings and short timestamps', () => {
    const vtt = 'WEBVTT - title\n\nNOTE a comment\n\nintro\n00:01.000 --> 00:02.000 align:start\nHi\n\n01:00:00.000 --> 01:00:01.500\nLater';
    const { cues, errors } = parseSubtitles(vtt);
    expect(errors).toEqual([]);
    expect(cues).toEqual([
      { start: 1, end: 2, text: 'Hi' },
      { start: 3600, end: 3601.5, text: 'Later' },
    ]);
  });

  it('handles BOM and CRLF', () => {
    const { cues } = parseSubtitles('﻿1\r\n00:00:00,500 --> 00:00:01,000\r\nX\r\n');
    expect(cues).toEqual([{ start: 0.5, end: 1, text: 'X' }]);
  });

  it('parses timestamps strictly', () => {
    expect(parseTimestamp('00:00:01,5')).toBe(1.5);
    expect(parseTimestamp('00:61:00,000')).toBeNull();
    expect(parseTimestamp('nonsense')).toBeNull();
  });

  it('strips all tags except b/i/u', () => {
    expect(sanitizeCueText('<font color="red">a</font><b>b</b><img src=x onerror=y>')).toBe('a<b>b</b>');
  });

  it('serialises back to SRT and VTT', () => {
    const cues = [{ start: 3661.25, end: 3662, text: 'A' }];
    expect(toSrt(cues)).toBe('1\n01:01:01,250 --> 01:01:02,000\nA\n');
    expect(toVtt(cues)).toBe('WEBVTT\n\n01:01:01.250 --> 01:01:02.000\nA\n');
    expect(parseSubtitles(toSrt(cues)).cues).toEqual(cues);
  });
});
