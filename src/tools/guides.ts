/**
 * Plain-language how-to for every tool. Shown on each tool page ("How to use") and on /guide.
 * Steps name the exact on-screen labels so users can follow along.
 */
export interface ToolGuide {
  /** When to reach for this tool. */
  when: string;
  steps: string[];
  tips?: string[];
}

const DROP = 'Drop your file on the page, or press Choose file.';
const DOWNLOAD = 'When it says “output verified”, press Download. The file has been checked before you get it.';

export const TOOL_GUIDES: Record<string, ToolGuide> = {
  'compress-video': {
    when: 'Your video is too big to send, upload or store.',
    steps: [DROP, 'Pick how strong the compression is. “Balanced” suits most videos; “Strongest” gives the smallest file.', 'Optionally cap the resolution (for example 720p) to shrink it further.', 'Press Compress.', DOWNLOAD],
    tips: ['The result card shows how much smaller the file got.', 'Lowering the resolution saves far more space than lowering quality alone.'],
  },
  'compress-to-size': {
    when: 'A site or app has a size limit, like 25 MB for chat apps or email.',
    steps: [DROP, 'Type the target size in MB.', 'Press Compress. If the first result is still too big, it is re-encoded smaller automatically.', DOWNLOAD],
    tips: ['Very long videos need a bigger target to stay watchable; trim them first if the picture gets blocky.', 'Turn off “Keep audio” for silent clips to free bits for the picture.'],
  },
  'convert-video': {
    when: 'A device or site will not play your file, or wants a specific format.',
    steps: [DROP, 'Choose the output format: MP4 plays almost everywhere; WebM is great for websites.', 'Leave the codec on Automatic unless you need a specific one.', 'Press Convert.', DOWNLOAD],
    tips: ['If the codec already fits the new format, the video is copied without quality loss and it finishes in seconds.'],
  },
  'mp4-converter': {
    when: 'You need the most widely compatible file — phones, TVs, social media.',
    steps: [DROP, 'Press Convert. MP4 is already selected.', DOWNLOAD],
    tips: ['H.264 video is chosen automatically when your browser can make it; that is the safest choice.'],
  },
  'webm-converter': {
    when: 'You are putting video on a website and want small, open-format files.',
    steps: [DROP, 'Optionally pick VP9 or AV1 under Video codec (AV1 is smaller but slower to make).', 'Press Convert.', DOWNLOAD],
  },
  'mov-converter': {
    when: 'An Apple app or editing program asks for a QuickTime .mov file.',
    steps: [DROP, 'Press Convert.', DOWNLOAD],
    tips: ['When the video is H.264 already, it is re-wrapped without re-encoding — no quality loss.'],
  },
  'video-to-gif': {
    when: 'You want a short looping animation for chat, docs or a website.',
    steps: [DROP, 'Set Start and End (in seconds) — GIFs work best under 10 seconds.', 'Pick a frame rate and width. 12 fps at 480 px is a good balance.', 'Press Make GIF.', DOWNLOAD],
    tips: ['Fewer colours and a smaller width give much smaller files.', 'Use “Playback speed” to make a quick boomerang-style loop.'],
  },
  'video-to-audio': {
    when: 'You only need the sound: a podcast, a song, a voice memo.',
    steps: [DROP, 'Choose a format: MP3 for anything, M4A for Apple devices, WAV or FLAC for full quality.', 'Choose a bitrate (192 kbps is great for music).', 'Press Save audio.', DOWNLOAD],
  },
  'audio-converter': {
    when: 'An app needs a different audio format than the one you have.',
    steps: ['Drop an audio file (or a video — its sound is used).', 'Choose the output format and bitrate.', 'Press Convert.', DOWNLOAD],
    tips: ['Converting a compressed file (MP3, AAC) to WAV or FLAC does not restore lost quality; it only changes the container.'],
  },
  'change-frame-rate': {
    when: 'A platform requires a specific frame rate, or you want smaller files at a lower rate.',
    steps: [DROP, 'Pick the new frame rate.', 'Press Convert.', DOWNLOAD],
    tips: ['Lowering the rate drops frames; raising it repeats frames. It does not invent new in-between frames.'],
  },
  'change-resolution': {
    when: 'You need a standard size like 1080p or 720p.',
    steps: [DROP, 'Pick a resolution — the exact output size is shown next to each option.', 'Press Rescale.', DOWNLOAD],
  },
  'repair-video': {
    when: 'A file plays badly, will not seek, or an app rejects it, but the picture itself is fine.',
    steps: [DROP, 'Keep the same format or pick another.', 'Press Remux. Packets are copied into a clean new container.', DOWNLOAD],
    tips: ['This fixes broken indexes and odd containers. It cannot rebuild frames that are damaged in the data itself.'],
  },
  'trim-video': {
    when: 'You want to cut off the start and/or end of a video.',
    steps: [
      DROP,
      'Play or step to where it should start and press Set start (or I). Then go to the end and press Set end (or O).',
      'Or drag the handles on the thumbnail strip, or type exact times.',
      'Choose Frame-accurate (exact) or Fast (no re-encoding, instant).',
      'Press Trim and export.',
      DOWNLOAD,
    ],
    tips: ['Use ← → to move one frame at a time for exact cuts.', '“Play selection” previews just the part you will keep.'],
  },
  'split-video': {
    when: 'You want a long video in several pieces — for stories, chapters or upload limits.',
    steps: [DROP, 'Choose how to split: into equal parts, every N seconds, or at times you type (like 1:30, 2:45).', 'Choose Fast or Frame-accurate.', 'Press Split. Each part appears with its own Download button.'],
    tips: ['Fast mode cuts at the nearest key frame, so parts can be a little longer than asked. Use Frame-accurate for exact cuts.'],
  },
  'merge-videos': {
    when: 'You have several clips and want one video.',
    steps: [
      'Drop two or more videos (or press Add files).',
      'Drag the thumbnails into the order you want. Hover over one and move the mouse to preview it.',
      'Optionally pick a transition between clips.',
      'Press Merge videos.',
      DOWNLOAD,
    ],
    tips: ['Use Sort A→Z to order numbered files like clip1, clip2, clip10 correctly.', 'Clips with a different shape are fitted with black bars; pick “Largest input” to keep the most detail.'],
  },
  'crop-video': {
    when: 'You want to cut away the edges, or zoom into part of the frame.',
    steps: [DROP, 'Drag on the picture to draw the area to keep. Drag the box to move it, or the corners to resize.', 'Pick an aspect like 1:1 or 9:16 to lock the shape, or type exact pixel values.', 'Press Crop.', DOWNLOAD],
  },
  'resize-video': {
    when: 'You are posting to Instagram, TikTok, YouTube or X and need their exact size.',
    steps: [DROP, 'Choose the platform size, or Custom.', 'Choose how it fits: Fit (black bars), Fill (crop edges) or Stretch.', 'Press Resize.', DOWNLOAD],
  },
  'rotate-video': {
    when: 'A phone video came out sideways or mirrored.',
    steps: [DROP, 'Choose 90°, 180° or 270° clockwise, and/or a flip.', 'Press Rotate.', DOWNLOAD],
  },
  'reverse-video': {
    when: 'You want a clip to play backwards.',
    steps: [DROP, 'Choose what happens to the sound: reverse it too, or remove it.', 'Press Reverse video.', DOWNLOAD],
    tips: ['Reversing takes longer than playing forwards, so very long videos take a while. Trim first if you only need part.'],
  },
  'change-speed': {
    when: 'Slow motion, time-lapse, or just getting to the point faster.',
    steps: [DROP, 'Drag the Speed slider (the new length is shown).', 'For sound, “Keep pitch” keeps voices natural; “Change pitch” sounds like a tape.', 'Press Change speed.', DOWNLOAD],
    tips: ['Tick “Also play backwards” to combine speed and reverse in one go.'],
  },
  'aspect-ratio-converter': {
    when: 'Turning a wide video into vertical (9:16) or square (1:1), or the other way round.',
    steps: [DROP, 'Pick the aspect ratio.', 'Choose how to fill the frame: a blurred copy behind (looks best), black bars, or crop.', 'Press Convert.', DOWNLOAD],
  },
  'stabilize-video': {
    when: 'Handheld footage is shaky.',
    steps: [DROP, 'Press Analyse shake and wait while every frame is measured.', 'Adjust Smoothing (higher is calmer) and keep “Also correct rotation” on for tilting shake.', 'Press Stabilize video.', DOWNLOAD],
    tips: ['The picture is zoomed in slightly so the moving edges stay hidden — the amount is shown before you start.', 'Shots of plain sky or walls give less to measure; textured scenes stabilise best.'],
  },
  'mute-video': {
    when: 'You want the video without any sound.',
    steps: [DROP, 'Press Remove audio. The picture is copied unchanged, so it is fast and lossless.', DOWNLOAD],
  },
  'extract-audio': {
    when: 'You want the soundtrack of a video as its own file.',
    steps: [DROP, 'Choose MP3, M4A, Opus, WAV or FLAC.', 'Press Extract audio.', DOWNLOAD],
  },
  'replace-audio': {
    when: 'You want a different soundtrack under your video.',
    steps: ['Drop the video.', 'Drop the new audio (music, a voice-over, or another video’s sound).', 'Choose when it starts, whether it loops, and the fade-out at the end.', 'Press Replace audio.', DOWNLOAD],
  },
  'add-audio': {
    when: 'You want music or narration on top of the original sound.',
    steps: ['Drop the video, then the audio to add.', 'Balance the two volume sliders.', 'Tick “Lower the added audio while the video has sound” to keep speech clear.', 'Press Add audio.', DOWNLOAD],
  },
  'remove-silence': {
    when: 'Recordings with long pauses — lectures, podcasts, screen recordings.',
    steps: [
      'Drop a video or audio recording. The waveform appears with the parts to keep highlighted.',
      'Move the threshold until the red lines sit just above the background noise.',
      'Set the shortest pause to cut and how much breathing room to keep.',
      'Press Remove silence.',
      DOWNLOAD,
    ],
  },
  'video-filters': {
    when: 'You want a look — black & white, vintage, cinematic.',
    steps: [DROP, 'Pick a Look and watch the live preview.', 'Fine-tune brightness, contrast and the other sliders.', 'Press Render video.', DOWNLOAD],
  },
  'adjust-colors': {
    when: 'The video is too dark, flat, or the colours are off.',
    steps: [DROP, 'Start with Look: None, then adjust Brightness, Contrast, Saturation and Temperature while watching the preview.', 'Press Render video.', DOWNLOAD],
  },
  'add-text': {
    when: 'Titles, captions or call-outs on a video.',
    steps: [DROP, 'Type your text and pick the font, size and colour.', 'Choose the position and when it shows (from / until).', 'Pick an animation like Fade or Typewriter.', 'Press Render video.', DOWNLOAD],
    tips: ['Turn on Outline or Background box so text stays readable over busy video.'],
  },
  'add-watermark': {
    when: 'Branding your video with a logo or your name.',
    steps: [DROP, 'Choose Logo image (drop a PNG) or Text.', 'Pick a corner, the size and the opacity.', 'Press Render video.', DOWNLOAD],
    tips: ['PNG logos with a transparent background look best.'],
  },
  'remove-overlay': {
    when: 'You added a title or logo in a Veyra project and want a version without it.',
    steps: ['Open the project in the editor.', 'Select the overlay clip and press Delete, or hide its track with the eye icon.', 'Press Export.'],
    tips: ['This only works for overlays you added as separate clips. It does not remove marks baked into other people’s video.'],
  },
  'add-transitions': {
    when: 'Joining clips with smooth fades, wipes or slides.',
    steps: ['Drop your clips and drag them into order.', 'Pick a transition and its length.', 'Press Join with transitions.', DOWNLOAD],
  },
  'thumbnail-maker': {
    when: 'A cover image or screenshot from an exact moment.',
    steps: [DROP, 'Play to the moment, then use ← → to pick the exact frame.', 'Choose PNG, JPEG or WebP and the size.', 'Press Capture frame, then Download.'],
  },
  'extract-frames': {
    when: 'Many stills from a video — for a storyboard, a dataset, or picking the best shot.',
    steps: [DROP, 'Choose which frames: every N seconds, a fixed number, or every frame.', 'Pick the range, image format and width.', 'Press Extract frames. You get one ZIP file.', DOWNLOAD],
  },
  'gif-maker': {
    when: 'Making a GIF from a video clip or from a set of images.',
    steps: ['Choose “A video clip” or “A set of images”.', 'For images: drop them and drag the thumbnails into order; set the time per image.', 'Set the size and colours.', 'Press Make GIF.', DOWNLOAD],
  },
  'slideshow-maker': {
    when: 'Turning photos into a video with music.',
    steps: [
      'Drop your photos and drag them into order (or Sort by date).',
      'Pick the video size, time per photo and a transition.',
      'Keep “Slow pan & zoom” on for a lively look.',
      'Optionally drop a music file — it loops and fades out at the end.',
      'Press Create video.',
      DOWNLOAD,
    ],
  },
  'images-to-video': {
    when: 'An image sequence — time-lapse frames, renders, animation.',
    steps: ['Drop the images, then press Sort A→Z so frame_2 comes before frame_10.', 'Set the frame rate.', 'Press Create video.', DOWNLOAD],
  },
  'subtitle-editor': {
    when: 'Fixing timing or typos in an SRT/VTT file, or writing subtitles from scratch.',
    steps: [
      'Optionally drop the video so you can see subtitles over it.',
      'Drop an .srt or .vtt file, or press “Add cue” to start from scratch.',
      'Edit the text and the start/end times. Click a number to jump the video there.',
      'If everything is early or late, use “Shift all cues by” with a positive or negative number.',
      'Press Download .srt or Download .vtt.',
    ],
  },
  'add-subtitles': {
    when: 'Subtitles that viewers can turn on and off in their player.',
    steps: [DROP, 'Drop the .srt or .vtt file.', 'Choose the language and track name.', 'Press Add subtitle track. The video and sound are copied without re-encoding.', DOWNLOAD],
    tips: ['To show subtitles always (for social media), use Burn in subtitles instead.'],
  },
  'burn-subtitles': {
    when: 'Subtitles that are always visible, for social media where players hide caption tracks.',
    steps: [DROP, 'Drop the .srt or .vtt file.', 'Adjust the text size, colour, outline or background box while watching the preview.', 'Press Render video.', DOWNLOAD],
  },
  'video-metadata': {
    when: 'You want to know what a file really is: codecs, bitrate, frame rate, tracks.',
    steps: [DROP, 'Read the details. Everything is measured from the file itself.'],
  },
  'frame-rate-inspector': {
    when: 'Checking a video’s real frame rate, or whether it is variable (common on phones).',
    steps: [DROP, 'See the measured frame rate and whether it varies.'],
    tips: ['Variable-frame-rate phone video can drift out of sync in some editors; converting it fixes that.'],
  },
  'resolution-inspector': {
    when: 'Checking size, rotation and pixel shape.',
    steps: [DROP, 'See the display size, the stored size and any rotation.'],
  },
  'duration-calculator': {
    when: 'Adding up the length of several files.',
    steps: ['Drop one or more files.', 'Read each duration and the total.'],
  },
  'audio-metadata': {
    when: 'Checking an audio file’s format, sample rate, channels and tags.',
    steps: [DROP, 'Read the details.'],
  },
};

export function guideFor(slug: string): ToolGuide | undefined {
  return TOOL_GUIDES[slug];
}
