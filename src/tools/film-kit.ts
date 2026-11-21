/**
 * The single-file tools a filmmaker reaches for, grouped the way a post-production workflow runs.
 * Used by the For Filmmakers page and its pre-rendered HTML. `note` replaces the tool's general
 * summary with what it does for a film; tools built for film specifically are in category 'film'.
 */
export interface FilmKitGroup {
  id: string;
  title: string;
  lede: string;
  tools: { slug: string; note?: string }[];
}

export const FILM_KIT: FilmKitGroup[] = [
  {
    id: "kit-check",
    title: "Check the footage",
    lede: "Know what you shot before you cut it.",
    tools: [
      {
        slug: "video-color-scopes",
        note: "Waveform, RGB parade, vectorscope and histogram for any frame, with clipped-highlight and crushed-black readouts.",
      },
      {
        slug: "video-metadata",
        note: "Codec, bitrate, HDR and every track in a camera file.",
      },
      {
        slug: "frame-rate-inspector",
        note: "The real frame rate, and whether phone footage is variable frame rate before it drifts out of sync.",
      },
      { slug: "resolution-inspector" },
      {
        slug: "audio-metadata",
        note: "Codec, sample rate and channels of location sound.",
      },
      {
        slug: "duration-calculator",
        note: "Exact running time of a cut, or the total of a folder of rushes.",
      },
    ],
  },
  {
    id: "kit-cut",
    title: "Cut and fix",
    lede: "Quick jobs on a single clip, without opening a timeline.",
    tools: [
      {
        slug: "trim-video",
        note: "Frame-accurate in and out points, or an instant cut with no re-encode.",
      },
      { slug: "split-video" },
      { slug: "merge-videos" },
      { slug: "freeze-frame" },
      {
        slug: "change-speed",
        note: "Slow motion or fast motion, with pitch kept on the sound.",
      },
      { slug: "reverse-video" },
      {
        slug: "stabilize-video",
        note: "Smooth out handheld shake, side to side and up and down.",
      },
      {
        slug: "change-frame-rate",
        note: "Conform footage to 24, 25, 30, 50 or 60 fps.",
      },
      {
        slug: "repair-video",
        note: "Rewrap a file an editor refuses to open, without touching the picture.",
      },
    ],
  },
  {
    id: "kit-picture",
    title: "Picture and framing",
    lede: "Aspect ratio, framing and a first look.",
    tools: [
      { slug: "cinematic-bars" },
      {
        slug: "crop-video",
        note: "Reframe a shot or crop to an exact aspect ratio.",
      },
      {
        slug: "aspect-ratio-converter",
        note: "Make 9:16 and 1:1 cut-downs of a 16:9 film for trailers and socials.",
      },
      { slug: "rotate-video" },
      { slug: "adjust-colors" },
      {
        slug: "video-filters",
        note: "Black and white, vintage and film grain looks.",
      },
      { slug: "add-transitions" },
    ],
  },
  {
    id: "kit-sound",
    title: "Sound",
    lede: "Clean dialogue and a mix that meets the spec.",
    tools: [
      { slug: "remove-background-noise" },
      { slug: "normalize-loudness" },
      {
        slug: "replace-audio",
        note: "Lay the final mix back onto the picture.",
      },
      {
        slug: "add-audio",
        note: "Add score or room tone under the dialogue, with optional ducking.",
      },
      {
        slug: "extract-audio",
        note: "Pull the soundtrack out for a separate mix.",
      },
      {
        slug: "mute-video",
        note: "A picture-only copy for a composer or a sound designer.",
      },
    ],
  },
  {
    id: "kit-titles",
    title: "Titles and subtitles",
    lede: "Opening titles to the last line of the credits.",
    tools: [
      { slug: "add-end-credits" },
      { slug: "add-text", note: "Title cards, captions and lower thirds." },
      {
        slug: "subtitle-editor",
        note: "Write and time SRT or VTT subtitles against the picture.",
      },
      {
        slug: "add-subtitles",
        note: "Attach subtitles as a track viewers can switch off.",
      },
      {
        slug: "burn-subtitles",
        note: "Burn subtitles into the picture for festivals and socials.",
      },
    ],
  },
  {
    id: "kit-deliver",
    title: "Deliver and share",
    lede: "Screeners, festival uploads, posters and stills.",
    tools: [
      {
        slug: "compress-to-size",
        note: "Hit a festival or screener upload limit exactly.",
      },
      { slug: "compress-video" },
      {
        slug: "convert-video",
        note: "MP4, MOV, WebM or MKV for whatever the festival or platform asks for.",
      },
      {
        slug: "change-resolution",
        note: "Deliver 4K, 1080p or 720p versions from one master.",
      },
      {
        slug: "add-watermark",
        note: 'Put a name or "screener" on copies you send out.',
      },
      {
        slug: "thumbnail-maker",
        note: "Save the exact frame you want as a poster or festival still.",
      },
      {
        slug: "extract-frames",
        note: "Export stills from a scene for a press kit or storyboard.",
      },
      { slug: "video-to-gif", note: "A short looping GIF for social posts." },
    ],
  },
];
