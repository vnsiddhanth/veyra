#!/usr/bin/env bash
# Harsh test fixtures: every format, size, rate and edge case we can think of, plus broken files.
# Needs ffmpeg/ffprobe. Writes e2e/fixtures/harsh/*.{mp4,…} and manifest.json (probed properties).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../fixtures/harsh"
mkdir -p "$OUT"
cd "$OUT"
F="ffmpeg -hide_banner -loglevel error -y"
SRC="testsrc2=size=1280x720:rate=30"
TONE="sine=frequency=440:sample_rate=48000"
ok() { echo "  made $1"; }
try() { local name=$1; shift; if "$@"; then ok "$name"; else echo "  SKIPPED $name (encoder unavailable)"; rm -f "$name"; fi; }

echo "Video (H.264 / AAC variants)"
try v_h264_1080p30.mp4 $F -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -movflags +faststart -shortest v_h264_1080p30.mp4
try v_h264_720p_moov_end.mp4 $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest v_h264_720p_moov_end.mp4
try v_h264_fragmented.mp4 $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags frag_keyframe+empty_moov+default_base_moof -shortest v_h264_fragmented.mp4
try v_h264_4k.mp4 $F -f lavfi -i "testsrc2=size=3840x2160:rate=30:duration=2" -f lavfi -i "$TONE:duration=2" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_4k.mp4
try v_h264_long_3min.mp4 $F -f lavfi -i "testsrc2=size=320x180:rate=24:duration=180" -f lavfi -i "$TONE:duration=180" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart -shortest v_h264_long_3min.mp4
try v_h264_60fps.mp4 $F -f lavfi -i "testsrc2=size=1280x720:rate=60:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_60fps.mp4
try v_h264_23976.mp4 $F -f lavfi -i "testsrc2=size=1280x720:rate=24000/1001:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_23976.mp4
try v_h264_portrait_1080x1920.mp4 $F -f lavfi -i "testsrc2=size=1080x1920:rate=30:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_portrait_1080x1920.mp4
# Phone-style: landscape pixels with a 90° display rotation → shows as 720×1280.
$F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest /tmp/rot_src.mp4
try v_h264_rotated90.mp4 $F -display_rotation:v:0 -90 -i /tmp/rot_src.mp4 -c copy -movflags +faststart v_h264_rotated90.mp4
try v_h264_odd_642x362.mp4 $F -f lavfi -i "testsrc2=size=642x362:rate=30:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_odd_642x362.mp4
try v_h264_tiny_64x36.mp4 $F -f lavfi -i "testsrc2=size=64x36:rate=30:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_tiny_64x36.mp4
try v_h264_vfr.mp4 $F -f lavfi -i "$SRC:duration=4" -f lavfi -i "$TONE:duration=4" -vf "setpts='if(lt(N,45),N/30/TB,(45/30+(N-45)/12)/TB)'" -fps_mode vfr -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart v_h264_vfr.mp4
try v_h264_noaudio.mp4 $F -f lavfi -i "$SRC:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -movflags +faststart v_h264_noaudio.mp4
try v_h264_mono44k.mp4 $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "sine=frequency=330:sample_rate=44100:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -ac 1 -ar 44100 -movflags +faststart -shortest v_h264_mono44k.mp4
try v_h264_51.mp4 $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -ac 6 -movflags +faststart -shortest v_h264_51.mp4
try v_h264_96k.mp4 $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "sine=frequency=440:sample_rate=96000:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -ar 96000 -movflags +faststart -shortest v_h264_96k.mp4
try v_h264_silent.mp4 $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "anullsrc=r=48000:cl=stereo" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -t 3 -movflags +faststart v_h264_silent.mp4
try v_h264_oneframe.mp4 $F -f lavfi -i "$SRC" -frames:v 1 -c:v libx264 -pix_fmt yuv420p -movflags +faststart v_h264_oneframe.mp4
try v_h264_short_0_3s.mp4 $F -f lavfi -i "$SRC:duration=0.3" -f lavfi -i "$TONE:duration=0.3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_short_0_3s.mp4
try v_h264_longgop.mp4 $F -f lavfi -i "$SRC:duration=12" -f lavfi -i "$TONE:duration=12" -c:v libx264 -preset veryfast -g 300 -keyint_min 300 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_longgop.mp4
try v_h264_baseline.mp4 $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -profile:v baseline -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_baseline.mp4
try v_h264_high10.mp4 $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p10le -c:a aac -movflags +faststart -shortest v_h264_high10.mp4

echo "Other codecs and containers"
try v_hevc.mp4 $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx265 -preset ultrafast -tag:v hvc1 -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_hevc.mp4
try v_vp9_opus.webm $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 1M -c:a libopus -shortest v_vp9_opus.webm
try v_vp8_vorbis.webm $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libvpx -deadline realtime -cpu-used 8 -b:v 1M -c:a libvorbis -shortest v_vp8_vorbis.webm
try v_av1_opus.webm $F -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2" -f lavfi -i "$TONE:duration=2" -c:v libaom-av1 -cpu-used 8 -row-mt 1 -b:v 500k -c:a libopus -shortest v_av1_opus.webm
try v_h264_aac.mkv $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest v_h264_aac.mkv
try v_h264_aac.mov $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_aac.mov
# Transport streams start at a non-zero PTS (~1.4 s). .mts: a plain 188-byte stream with AAC (stream type 0x0f);
# .m2ts: Blu-ray/AVCHD 192-byte packets (video only: ffmpeg tags AAC there as private data, which real cameras never do).
try v_h264_aac.mts $F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -f mpegts -mpegts_m2ts_mode 0 -shortest v_h264_aac.mts
try v_h264_bdav.m2ts $F -f lavfi -i "$SRC:duration=3" -an -c:v libx264 -preset veryfast -pix_fmt yuv420p -f mpegts -mpegts_m2ts_mode 1 v_h264_bdav.m2ts
try v_mjpeg.avi $F -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2" -c:v mjpeg -q:v 5 v_mjpeg.avi

echo "Phone and camera footage"
# iPhone default: HEVC Main 10 with HLG (BT.2020) tags in a QuickTime .mov, shot portrait (pixels landscape + 90° rotation).
$F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -c:v libx265 -preset ultrafast -tag:v hvc1 -pix_fmt yuv420p10le -x265-params "colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc" -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc -c:a aac -ac 2 -shortest -f mov /tmp/iphone_hdr.mov
try v_iphone_hdr_hevc.mov $F -display_rotation:v:0 -90 -i /tmp/iphone_hdr.mov -c copy v_iphone_hdr_hevc.mov
# iPhone "Most Compatible": H.264 .mov, slightly variable frame rate around 29.97, portrait rotation.
$F -f lavfi -i "$SRC:duration=3" -f lavfi -i "$TONE:duration=3" -vf "setpts='(N/29.97+0.004*sin(N))/TB'" -fps_mode vfr -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest -f mov /tmp/iphone_h264.mov
try v_iphone_h264_vfr.mov $F -display_rotation:v:0 -90 -i /tmp/iphone_h264.mov -c copy v_iphone_h264_vfr.mov
# Android: 60 fps nominal with jittery frame intervals and dropped frames, mono 48 kHz, 270° rotation.
$F -f lavfi -i "testsrc2=size=1280x720:rate=60:duration=3" -f lavfi -i "sine=frequency=500:sample_rate=48000:duration=3" -vf "select='not(eq(mod(n,7),3))',setpts='(N/55+0.003*mod(N,3))/TB'" -fps_mode vfr -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -ac 1 -shortest /tmp/android.mp4
try v_android_vfr60.mp4 $F -display_rotation:v:0 90 -i /tmp/android.mp4 -c copy -movflags +faststart v_android_vfr60.mp4
# Phone screen recording: tall odd aspect (886x1920), 60 fps with long frozen stretches, no audio.
try v_screen_recording_vfr.mp4 $F -f lavfi -i "testsrc2=size=886x1920:rate=60:duration=4" -vf "setpts='if(lt(N,60),N/60,1+(N-60)/60+if(gt(N,120),1.5,0))/TB'" -fps_mode vfr -c:v libx264 -preset veryfast -pix_fmt yuv420p -movflags +faststart v_screen_recording_vfr.mp4
# A long recording (10 minutes): tested on a handful of tools only, see fixtures.spec.ts.
try v_h264_long_10min.mp4 $F -f lavfi -i "testsrc2=size=320x180:rate=25:duration=600" -f lavfi -i "$TONE:duration=600" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 48k -movflags +faststart -shortest v_h264_long_10min.mp4

echo "Audio"
try a_mp3_44k.mp3 $F -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=4" -ac 2 -c:a libmp3lame -b:a 128k a_mp3_44k.mp3
try a_aac.m4a $F -f lavfi -i "$TONE:duration=4" -ac 2 -c:a aac -b:a 128k a_aac.m4a
try a_pcm16.wav $F -f lavfi -i "$TONE:duration=4" -ac 2 -c:a pcm_s16le a_pcm16.wav
try a_float32.wav $F -f lavfi -i "$TONE:duration=4" -ac 2 -c:a pcm_f32le a_float32.wav
try a_flac.flac $F -f lavfi -i "$TONE:duration=4" -ac 2 -c:a flac a_flac.flac
try a_vorbis.ogg $F -f lavfi -i "$TONE:duration=4" -ac 2 -c:a libvorbis a_vorbis.ogg
try a_opus.opus $F -f lavfi -i "$TONE:duration=4" -ac 2 -c:a libopus a_opus.opus
try a_mono8k.wav $F -f lavfi -i "sine=frequency=300:sample_rate=8000:duration=4" -ac 1 -c:a pcm_s16le a_mono8k.wav
try a_silence.wav $F -f lavfi -i "anullsrc=r=48000:cl=stereo" -t 4 -c:a pcm_s16le a_silence.wav
# Dialogue-like bursts over hiss, with gaps (noise reduction, silence removal, loudness).
try a_noisy_dialogue.wav $F -f lavfi -i "anoisesrc=color=pink:amplitude=0.04:sample_rate=48000:duration=6" -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=6" -filter_complex "[1]volume='if(lt(mod(t,1.2),0.6),0.35,0)':eval=frame[v];[0][v]amix=inputs=2:normalize=0" -ac 2 -c:a pcm_s16le a_noisy_dialogue.wav

# Speech-like bursts separated by digital silence (remove-silence must cut these gaps).
try a_gappy_speech.wav $F -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=6" -af "volume='if(lt(mod(t,1.5),0.7),0.5,0)':eval=frame" -ac 2 -c:a pcm_s16le a_gappy_speech.wav
try v_h264_gappy.mp4 $F -f lavfi -i "$SRC:duration=6" -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=6" -af "volume='if(lt(mod(t,1.5),0.7),0.5,0)':eval=frame" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest v_h264_gappy.mp4

echo "Images"
try i_1080p.png $F -f lavfi -i "testsrc2=size=1920x1080" -frames:v 1 i_1080p.png
try i_alpha_512.png $F -f lavfi -i "color=c=red@0.5:size=512x512,format=rgba" -frames:v 1 i_alpha_512.png
try i_4000x3000.jpg $F -f lavfi -i "testsrc2=size=4000x3000" -frames:v 1 -q:v 3 i_4000x3000.jpg
try i_webp.webp $F -f lavfi -i "testsrc2=size=1280x720" -frames:v 1 i_webp.webp
try i_animated.gif $F -f lavfi -i "testsrc2=size=320x180:rate=10:duration=1" i_animated.gif
try i_bmp.bmp $F -f lavfi -i "testsrc2=size=640x360" -frames:v 1 i_bmp.bmp
try i_1x1.png $F -f lavfi -i "color=c=blue:size=1x1" -frames:v 1 i_1x1.png
try i_8000x8000.png $F -f lavfi -i "color=c=gray:size=8000x8000" -frames:v 1 i_8000x8000.png

echo "Subtitles"
printf '1\n00:00:00,200 --> 00:00:01,200\nHello\n\n2\n00:00:01,500 --> 00:00:02,800\nSecond line\n' > s_good.srt
printf 'WEBVTT\n\n00:00.200 --> 00:01.200\nHello\n\n00:01.500 --> 00:02.800\nSecond line\n' > s_good.vtt
printf 'this is not a subtitle file\n%%%%%%\n' > s_garbage.srt
: > s_empty.srt
printf '1\n00:00:00,000 --> 00:00:02,000\nOverlap one\n\n2\n00:00:01,000 --> 00:00:03,000\nOverlap two\n' > s_overlap.srt
printf '1\n00:00:00,500 --> 00:00:02,000\n日本語 · émoji 🎬 · العربية\n' > s_unicode.srt
ok subtitles

echo "Broken files"
: > x_empty.mp4
head -c 200000 /dev/urandom > x_random.mp4
printf 'Hello, I am a text file pretending to be a video.\n' > x_text.mp4
if [ -f v_h264_1080p30.mp4 ]; then head -c $(( $(stat -c%s v_h264_1080p30.mp4) * 6 / 10 )) v_h264_1080p30.mp4 > x_truncated.mp4; fi
if [ -f v_h264_720p_moov_end.mp4 ]; then head -c $(( $(stat -c%s v_h264_720p_moov_end.mp4) * 6 / 10 )) v_h264_720p_moov_end.mp4 > x_truncated_no_index.mp4; fi
if [ -f i_1080p.png ]; then cp i_1080p.png x_png_named.mp4; fi
ok broken

echo "Manifest"
node "$HERE/manifest.mjs" "$OUT"
