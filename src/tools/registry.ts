/**
 * Every standalone tool. `status` is honest: a tool is 'available' only when its processing
 * pipeline is implemented and verified. Planned tools have a page that says so and when.
 */
export type ToolCategory = 'compress' | 'convert' | 'edit' | 'audio' | 'visual' | 'film' | 'subtitles' | 'utility';

export type ToolStatus = 'available' | 'planned';

/** Which implementation renders the tool page. */
export type ToolEngine =
  | 'inspect'
  | 'trim'
  | 'thumbnail'
  | 'convert'
  | 'gif'
  | 'frames'
  | 'split'
  | 'merge'
  | 'speed'
  | 'audio-track'
  | 'decor'
  | 'slideshow'
  | 'silence'
  | 'subtitle-editor'
  | 'soft-subtitles'
  | 'stabilize'
  | 'film'
  | 'guide'
  | 'none';

export interface ToolDef {
  slug: string;
  title: string;
  summary: string;
  category: ToolCategory;
  status: ToolStatus;
  /** Roadmap phase delivering the tool. */
  phase: number;
  engine: ToolEngine;
  /** For inspector tools: which facet to emphasise. */
  focus?: 'all' | 'frame-rate' | 'resolution' | 'duration' | 'audio';
  keywords: string[];
  popular?: boolean;
  /** Sub-mode for engines that serve several tools (convert, decor). */
  mode?: string;
  /** Fixed options, e.g. the output container of "Convert to MP4". */
  preset?: { container?: string };
  /** Label of the main action button. */
  action?: string;
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  compress: 'Compress',
  convert: 'Convert',
  edit: 'Edit',
  audio: 'Audio',
  visual: 'Visual',
  film: 'Film',
  subtitles: 'Subtitles',
  utility: 'Inspect & utilities',
};

const tool = (
  slug: string,
  title: string,
  summary: string,
  category: ToolCategory,
  phase: number,
  engine: ToolEngine,
  keywords: string[] = [],
  extra: Partial<ToolDef> = {},
): ToolDef => ({ slug, title, summary, category, status: 'available', phase, engine, keywords, ...extra });

const inspect = (
  slug: string,
  title: string,
  summary: string,
  focus: ToolDef['focus'],
  keywords: string[] = [],
  popular = false,
): ToolDef => ({ slug, title, summary, category: 'utility', status: 'available', phase: 1, engine: 'inspect', focus, keywords, popular });

export const TOOLS: ToolDef[] = [
  // Compression
  tool('compress-video', 'Compress video', 'Shrink a video by quality, resolution or bitrate.', 'compress', 3, 'convert', ['smaller', 'reduce size'], { popular: true, mode: 'compress', action: 'Compress' }),
  tool('compress-to-size', 'Compress to target size', 'Fit a video under a file-size limit, e.g. 25 MB for chat apps.', 'compress', 3, 'convert', ['discord', 'email', 'limit'], { mode: 'compress-size', action: 'Compress' }),
  // Conversion
  tool('convert-video', 'Convert video', 'Convert between MP4, WebM, MOV and MKV, choosing codecs your browser supports.', 'convert', 3, 'convert', ['format', 'mkv to mp4'], { popular: true, mode: 'convert' }),
  tool('mp4-converter', 'Convert to MP4', 'Turn any supported video into a widely compatible MP4.', 'convert', 3, 'convert', ['h264'], { mode: 'convert', preset: { container: 'mp4' } }),
  tool('webm-converter', 'Convert to WebM', 'Make a VP9/AV1 WebM for the web.', 'convert', 3, 'convert', ['vp9'], { mode: 'convert', preset: { container: 'webm' } }),
  tool('mov-converter', 'Convert to MOV', 'Wrap or convert video into a QuickTime MOV container.', 'convert', 3, 'convert', ['quicktime'], { mode: 'convert', preset: { container: 'mov' } }),
  tool('video-to-gif', 'Video to GIF', 'Turn a clip into an animated GIF with size and colour control.', 'convert', 3, 'gif', ['animated'], { popular: true }),
  tool('video-to-audio', 'Video to audio', 'Save the soundtrack of a video as MP3, M4A, Opus, FLAC or WAV.', 'convert', 3, 'convert', ['mp3', 'extract'], { mode: 'audio', action: 'Save audio' }),
  tool('audio-converter', 'Convert audio', 'Convert between WAV, MP3, M4A, Opus and FLAC.', 'convert', 3, 'convert', ['mp3', 'wav'], { mode: 'audio' }),
  tool('change-frame-rate', 'Change frame rate', 'Convert to 12-60 fps by dropping or repeating frames.', 'convert', 3, 'convert', ['fps'], { mode: 'fps' }),
  tool('change-resolution', 'Change resolution', 'Rescale to 360p up to 4K.', 'convert', 3, 'convert', ['1080p', '720p', '4k'], { mode: 'resolution', action: 'Rescale' }),
  tool('repair-video', 'Repair / remux video', 'Rewrite an oddly muxed file into a clean container without re-encoding.', 'convert', 3, 'convert', ['fix', 'corrupt'], { mode: 'repair', action: 'Remux' }),
  // Editing
  {
    slug: 'trim-video',
    title: 'Trim video',
    summary: 'Cut the start and end off a video, frame-accurately or instantly without re-encoding.',
    category: 'edit',
    status: 'available',
    phase: 2,
    engine: 'trim',
    keywords: ['cut', 'shorten', 'clip'],
    popular: true,
  },
  tool('split-video', 'Split video', 'Split a video into parts at chosen points or fixed lengths.', 'edit', 3, 'split', ['segments'], {}),
  tool('merge-videos', 'Merge videos', 'Join several clips into one video.', 'edit', 3, 'merge', ['join', 'combine'], { popular: true }),
  tool('crop-video', 'Crop video', 'Crop to any region or a preset aspect ratio.', 'edit', 3, 'convert', ['cut edges'], { mode: 'crop', action: 'Crop' }),
  tool('resize-video', 'Resize video', 'Fit, fill or pad to a new size for any platform.', 'edit', 3, 'convert', ['instagram', 'tiktok', 'youtube'], { popular: true, mode: 'resize', action: 'Resize' }),
  tool('rotate-video', 'Rotate & flip video', 'Rotate 90°/180° or mirror a video.', 'edit', 3, 'convert', ['flip', 'mirror'], { mode: 'rotate', action: 'Rotate' }),
  tool('reverse-video', 'Reverse video', 'Play a clip backwards.', 'edit', 3, 'speed', ['backwards'], {}),
  tool('change-speed', 'Change video speed', 'Speed up or slow down a video, with pitch-corrected audio.', 'edit', 3, 'speed', ['slow motion', 'fast forward'], {}),
  tool('aspect-ratio-converter', 'Aspect ratio converter', 'Convert between 16:9, 9:16, 1:1, 4:5 with padding, blur fill or crop.', 'edit', 3, 'convert', ['vertical', 'square'], { mode: 'aspect' }),
  tool('stabilize-video', 'Stabilize video', 'Reduce handheld camera shake (side-to-side and up-down).', 'edit', 8, 'stabilize', ['shaky', 'steady']),
  // Audio
  tool('mute-video', 'Mute video', 'Remove the audio track without re-encoding the video.', 'audio', 3, 'convert', ['remove sound'], { mode: 'mute', action: 'Remove audio' }),
  tool('extract-audio', 'Extract audio', 'Save a video’s audio track as a separate file.', 'audio', 3, 'convert', ['rip audio'], { popular: true, mode: 'audio', action: 'Extract audio' }),
  tool('replace-audio', 'Replace audio', 'Swap a video’s soundtrack for another audio file.', 'audio', 3, 'audio-track', ['music'], {}),
  tool('add-audio', 'Add audio to video', 'Mix music or narration into a video, with optional ducking.', 'audio', 3, 'audio-track', ['background music'], {}),
  tool('remove-silence', 'Remove silence', 'Detect and cut silent passages automatically.', 'audio', 3, 'silence', ['jump cut'], {}),
  // Visual
  tool('video-filters', 'Video filters', 'Apply looks like vintage, black & white and film grain.', 'visual', 3, 'decor', ['effects'], { mode: 'look' }),
  tool('adjust-colors', 'Adjust brightness, contrast & saturation', 'Basic color correction for a whole video.', 'visual', 3, 'decor', ['brightness', 'contrast', 'saturation'], { mode: 'look' }),
  tool('add-text', 'Add text to video', 'Place animated titles or captions on a video.', 'visual', 3, 'decor', ['caption', 'title'], { mode: 'text' }),
  tool('add-watermark', 'Add watermark', 'Overlay your logo or text on a video.', 'visual', 3, 'decor', ['logo'], { mode: 'watermark' }),
  tool('remove-overlay', 'Remove your own overlay', 'Re-export one of your projects without an overlay you added earlier.', 'visual', 7, 'guide', ['remove text', 'remove logo']),
  tool('add-transitions', 'Add transitions', 'Join clips with fades, wipes and slides.', 'visual', 3, 'merge', ['fade'], {}),
  {
    slug: 'thumbnail-maker',
    title: 'Thumbnail maker',
    summary: 'Step to the exact frame you want and save it as PNG, JPEG or WebP.',
    category: 'visual',
    status: 'available',
    phase: 2,
    engine: 'thumbnail',
    keywords: ['poster', 'cover', 'screenshot', 'still', 'frame grab'],
    popular: true,
  },
  tool('extract-frames', 'Extract frames', 'Export frames as PNG/JPEG at an interval or every frame, in one ZIP.', 'visual', 3, 'frames', ['screenshots', 'images'], {}),
  tool('gif-maker', 'GIF maker', 'Build GIFs from video or images, with size control.', 'visual', 3, 'gif', ['animated'], {}),
  tool('slideshow-maker', 'Slideshow maker', 'Turn photos into a video with transitions, pan & zoom and music.', 'visual', 3, 'slideshow', ['photos to video'], {}),
  tool('images-to-video', 'Images to video', 'Create a video from an image sequence.', 'visual', 3, 'slideshow', ['timelapse'], {}),
  // Film
  tool('remove-background-noise', 'Remove background noise', 'Clean hiss, hum and room noise from dialogue in a video or audio file.', 'film', 9, 'film', ['denoise', 'noise reduction', 'hiss', 'hum', 'clean audio'], { popular: true, mode: 'denoise', action: 'Remove noise' }),
  tool('normalize-loudness', 'Normalize loudness', 'Set audio to −14 LUFS for YouTube or −23 LUFS for broadcast and festivals.', 'film', 9, 'film', ['lufs', 'normalize audio', 'ebu r128', 'volume'], { mode: 'loudness', action: 'Normalize loudness' }),
  tool('cinematic-bars', 'Add cinematic bars', 'Letterbox a video to 2.39:1, 1.85:1 or 4:3 with black bars.', 'film', 9, 'film', ['letterbox', 'black bars', 'anamorphic', 'widescreen'], { mode: 'bars', action: 'Add bars' }),
  tool('add-end-credits', 'Add end credits', 'Roll cast and crew credits after or over the end of your video.', 'film', 9, 'film', ['credits', 'rolling credits', 'end titles'], { mode: 'credits', action: 'Add credits' }),
  tool('freeze-frame', 'Freeze frame', 'Hold any frame for a few seconds, then let the video carry on.', 'film', 9, 'film', ['still', 'hold frame', 'pause'], { mode: 'freeze', action: 'Freeze this frame' }),
  tool('video-color-scopes', 'Video color scopes', 'Check exposure and colour with a waveform, RGB parade, vectorscope and histogram.', 'film', 9, 'film', ['waveform', 'vectorscope', 'histogram', 'exposure', 'color grading'], { mode: 'scopes' }),
  // Subtitles
  tool('subtitle-editor', 'Subtitle editor', 'Edit SRT/VTT timing and text with a live preview.', 'subtitles', 6, 'subtitle-editor', ['srt', 'vtt', 'captions']),
  tool('add-subtitles', 'Add subtitles', 'Attach a soft (switchable) subtitle track to a video, without re-encoding.', 'subtitles', 6, 'soft-subtitles', ['captions']),
  tool('burn-subtitles', 'Burn in subtitles', 'Render SRT/VTT subtitles permanently into the picture.', 'subtitles', 3, 'decor', ['hardcode'], { mode: 'subtitles' }),
  // Inspect & utilities (available)
  inspect('video-metadata', 'Video metadata viewer', 'See container, codecs, bitrate, frame rate, HDR and every track in a file.', 'all', ['info', 'mediainfo', 'codec'], true),
  inspect('frame-rate-inspector', 'Frame rate inspector', 'Measure the real frame rate and detect variable-frame-rate footage.', 'frame-rate', ['fps', 'vfr']),
  inspect('resolution-inspector', 'Resolution inspector', 'Check display size, coded size, rotation and pixel aspect ratio.', 'resolution', ['dimensions', 'size']),
  inspect('duration-calculator', 'Video duration calculator', 'Get exact durations of one or many files and their total.', 'duration', ['length', 'total time']),
  inspect('audio-metadata', 'Audio metadata viewer', 'Inspect codec, sample rate, channels, bitrate and tags of audio files.', 'audio', ['mp3 info', 'tags']),
];

export function findTool(slug: string): ToolDef | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function searchTools(query: string, tools: ToolDef[] = TOOLS): ToolDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return tools;
  const terms = q.split(/\s+/);
  return tools
    .map((t) => {
      const hay = `${t.title} ${t.summary} ${t.keywords.join(' ')} ${CATEGORY_LABELS[t.category]}`.toLowerCase();
      const score = terms.reduce((s, term) => s + (t.title.toLowerCase().includes(term) ? 3 : hay.includes(term) ? 1 : -100), 0);
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.t.status === 'available' ? 0 : 1) - (b.t.status === 'available' ? 0 : 1) ||
        (b.t.popular ? 1 : 0) - (a.t.popular ? 1 : 0) ||
        a.t.title.length - b.t.title.length,
    )
    .map((x) => x.t);
}

export function relatedTools(tool: ToolDef, limit = 4): ToolDef[] {
  const same = TOOLS.filter((t) => t.slug !== tool.slug && t.category === tool.category);
  const others = TOOLS.filter((t) => t.slug !== tool.slug && t.category !== tool.category && t.popular);
  return [...same, ...others].slice(0, limit);
}
