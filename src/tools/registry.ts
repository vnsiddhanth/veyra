/**
 * Every standalone tool. `status` is honest: a tool is 'available' only when its processing
 * pipeline is implemented and verified. Planned tools have a page that says so and when.
 */
export type ToolCategory = 'compress' | 'convert' | 'edit' | 'audio' | 'visual' | 'subtitles' | 'utility';

export type ToolStatus = 'available' | 'planned';

/** Which implementation renders the tool page. */
export type ToolEngine = 'inspect' | 'trim' | 'thumbnail' | 'none';

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
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  compress: 'Compress',
  convert: 'Convert',
  edit: 'Edit',
  audio: 'Audio',
  visual: 'Visual',
  subtitles: 'Subtitles',
  utility: 'Inspect & utilities',
};

const planned = (
  slug: string,
  title: string,
  summary: string,
  category: ToolCategory,
  phase: number,
  keywords: string[] = [],
  popular = false,
): ToolDef => ({ slug, title, summary, category, status: 'planned', phase, engine: 'none', keywords, popular });

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
  planned('compress-video', 'Compress video', 'Shrink a video by quality, resolution or bitrate.', 'compress', 3, ['smaller', 'reduce size'], true),
  planned('compress-to-size', 'Compress to target size', 'Fit a video under a file-size limit, e.g. 25 MB for chat apps.', 'compress', 3, ['discord', 'email', 'limit']),
  // Conversion
  planned('convert-video', 'Convert video', 'Convert between MP4, WebM and MOV, choosing codecs your browser supports.', 'convert', 3, ['format', 'mkv to mp4'], true),
  planned('mp4-converter', 'Convert to MP4', 'Turn any supported video into a widely compatible MP4.', 'convert', 3, ['h264']),
  planned('webm-converter', 'Convert to WebM', 'Make a VP9/AV1 WebM for the web.', 'convert', 3, ['vp9']),
  planned('mov-converter', 'Convert to MOV', 'Wrap or convert video into a QuickTime MOV container.', 'convert', 3, ['quicktime']),
  planned('video-to-gif', 'Video to GIF', 'Turn a clip into an optimised animated GIF.', 'convert', 3, ['animated'], true),
  planned('video-to-audio', 'Video to audio', 'Save the soundtrack of a video as MP3, M4A, Opus or WAV.', 'convert', 3, ['mp3', 'extract']),
  planned('audio-converter', 'Convert audio', 'Convert between WAV, MP3, M4A, Opus and FLAC.', 'convert', 3, ['mp3', 'wav']),
  planned('change-frame-rate', 'Change frame rate', 'Convert to 24, 25, 30, 60 fps or a custom rate.', 'convert', 3, ['fps']),
  planned('change-resolution', 'Change resolution', 'Rescale to 360p up to 4K.', 'convert', 3, ['1080p', '720p', '4k']),
  planned('repair-video', 'Repair / remux video', 'Rewrite a damaged or oddly muxed file into a clean container without re-encoding.', 'convert', 3, ['fix', 'corrupt']),
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
  planned('split-video', 'Split video', 'Split a video into parts at chosen points or fixed lengths.', 'edit', 3, ['segments']),
  planned('merge-videos', 'Merge videos', 'Join several clips into one video.', 'edit', 3, ['join', 'combine'], true),
  planned('crop-video', 'Crop video', 'Crop to any region or a preset aspect ratio.', 'edit', 3, ['cut edges']),
  planned('resize-video', 'Resize video', 'Fit, fill or pad to a new size for any platform.', 'edit', 3, ['instagram', 'tiktok', 'youtube'], true),
  planned('rotate-video', 'Rotate & flip video', 'Rotate 90°/180° or mirror a video.', 'edit', 3, ['flip', 'mirror']),
  planned('reverse-video', 'Reverse video', 'Play a clip backwards.', 'edit', 3, ['backwards']),
  planned('change-speed', 'Change video speed', 'Speed up or slow down a video, with pitch-corrected audio.', 'edit', 3, ['slow motion', 'fast forward']),
  planned('aspect-ratio-converter', 'Aspect ratio converter', 'Convert between 16:9, 9:16, 1:1, 4:5 with padding, blur fill or crop.', 'edit', 3, ['vertical', 'square']),
  planned('stabilize-video', 'Stabilize video', 'Reduce camera shake (feasibility under evaluation for in-browser processing).', 'edit', 8, ['shaky']),
  // Audio
  planned('mute-video', 'Mute video', 'Remove the audio track without re-encoding the video.', 'audio', 3, ['remove sound']),
  planned('extract-audio', 'Extract audio', 'Save a video’s audio track as a separate file.', 'audio', 3, ['rip audio'], true),
  planned('replace-audio', 'Replace audio', 'Swap a video’s soundtrack for another audio file.', 'audio', 3, ['music']),
  planned('add-audio', 'Add audio to video', 'Mix music or narration into a video.', 'audio', 3, ['background music']),
  planned('remove-silence', 'Remove silence', 'Detect and cut silent passages automatically.', 'audio', 6, ['jump cut']),
  // Visual
  planned('video-filters', 'Video filters', 'Apply looks like vintage, black & white and film grain.', 'visual', 5, ['effects']),
  planned('adjust-colors', 'Adjust brightness, contrast & saturation', 'Basic color correction for a whole video.', 'visual', 5, ['brightness', 'contrast', 'saturation']),
  planned('add-text', 'Add text to video', 'Place titles or captions on a video.', 'visual', 5, ['caption', 'title']),
  planned('add-watermark', 'Add watermark', 'Overlay your logo or text on a video.', 'visual', 5, ['logo']),
  planned('remove-overlay', 'Remove your own overlay', 'Re-export a project without an overlay you added earlier.', 'visual', 7, []),
  planned('add-transitions', 'Add transitions', 'Join clips with fades, wipes and slides.', 'visual', 5, ['fade']),
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
  planned('extract-frames', 'Extract frames', 'Export frames as PNG/JPEG at an interval or every frame.', 'visual', 3, ['screenshots', 'images']),
  planned('gif-maker', 'GIF maker', 'Build GIFs from video or images, with size control.', 'visual', 3, ['animated']),
  planned('slideshow-maker', 'Slideshow maker', 'Turn photos into a video with transitions and music.', 'visual', 5, ['photos to video']),
  planned('images-to-video', 'Images to video', 'Create a video from an image sequence.', 'visual', 5, ['timelapse']),
  // Subtitles
  planned('subtitle-editor', 'Subtitle editor', 'Edit SRT/VTT timing and text with a live preview.', 'subtitles', 6, ['srt', 'vtt', 'captions']),
  planned('add-subtitles', 'Add subtitles', 'Attach a soft subtitle track to a video file.', 'subtitles', 6, ['captions']),
  planned('burn-subtitles', 'Burn in subtitles', 'Render subtitles permanently into the picture.', 'subtitles', 7, ['hardcode']),
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
    .sort((a, b) => b.score - a.score || (a.t.status === 'available' ? -1 : 1))
    .map((x) => x.t);
}

export function relatedTools(tool: ToolDef, limit = 4): ToolDef[] {
  const same = TOOLS.filter((t) => t.slug !== tool.slug && t.category === tool.category);
  const others = TOOLS.filter((t) => t.slug !== tool.slug && t.category !== tool.category && t.popular);
  return [...same, ...others].slice(0, limit);
}
