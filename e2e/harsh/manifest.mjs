// Probe every harsh fixture with ffprobe and write manifest.json with what tests should expect.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => !f.endsWith('.json')).sort();

/** Inputs no browser is expected to decode reliably: the tool must either work or refuse clearly. */
const EITHER = /hevc|high10|av1|x_truncated\.mp4|i_8000x8000|vp8|a_vorbis|v_h264_51|a_mono8k|v_h264_96k|i_bmp/;
/** Inputs that must be refused with a message. */
const REJECT = /^x_(empty|random|text|png_named|truncated_no_index)|\.avi$|s_garbage|s_empty/;

const out = [];
for (const name of files) {
  const path = join(dir, name);
  const kind = name.startsWith('v_') ? 'video' : name.startsWith('a_') ? 'audio' : name.startsWith('i_') ? 'image' : name.startsWith('s_') ? 'subtitle' : 'broken';
  const entry = { name, kind, size: statSync(path).size, expect: REJECT.test(name) ? 'reject' : EITHER.test(name) ? 'either' : 'ok' };
  if (kind === 'video' || kind === 'audio' || kind === 'image') {
    try {
      const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }));
      const v = j.streams.find((s) => s.codec_type === 'video');
      const a = j.streams.find((s) => s.codec_type === 'audio');
      const rot = Number(v?.side_data_list?.find((d) => d.rotation != null)?.rotation ?? v?.tags?.rotate ?? 0);
      const swap = Math.abs(rot) % 180 === 90;
      const fr = v?.avg_frame_rate && v.avg_frame_rate !== '0/0' ? v.avg_frame_rate.split('/').map(Number) : null;
      Object.assign(entry, {
        duration: Number(j.format?.duration ?? v?.duration ?? a?.duration ?? 0),
        width: v ? (swap ? v.height : v.width) : null,
        height: v ? (swap ? v.width : v.height) : null,
        rotation: rot,
        fps: fr ? fr[0] / fr[1] : null,
        vcodec: v?.codec_name ?? null,
        hasVideo: !!v && kind !== 'audio',
        hasAudio: !!a,
        channels: a?.channels ?? null,
        sampleRate: a ? Number(a.sample_rate) : null,
      });
    } catch (e) {
      entry.probeError = String(e.message ?? e).slice(0, 200);
    }
  }
  out.push(entry);
}
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(out, null, 2));
console.log(`  ${out.length} fixtures: ${out.filter((x) => x.expect === 'ok').length} must work, ${out.filter((x) => x.expect === 'either').length} may be refused, ${out.filter((x) => x.expect === 'reject').length} must be refused`);
