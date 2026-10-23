// Output formats per media kind and the ffmpeg arguments each option set produces.
import type { MediaInfo } from "./tauri";
import { parseTime } from "./format";

export type Kind = "image" | "video" | "audio";

export interface FormatDef {
  id: string;
  label: string;
  ext: string;
  hint: string;
}

export const FORMATS: Record<Kind, FormatDef[]> = {
  image: [
    { id: "png", label: "PNG", ext: "png", hint: "Lossless" },
    { id: "jpg", label: "JPG", ext: "jpg", hint: "Photos" },
    { id: "webp", label: "WEBP", ext: "webp", hint: "Web, small" },
    { id: "avif", label: "AVIF", ext: "avif", hint: "Smallest" },
    { id: "gif", label: "GIF", ext: "gif", hint: "Animated" },
    { id: "bmp", label: "BMP", ext: "bmp", hint: "Bitmap" },
    { id: "tiff", label: "TIFF", ext: "tiff", hint: "Print" },
    { id: "ico", label: "ICO", ext: "ico", hint: "Icons" },
  ],
  video: [
    { id: "mp4", label: "MP4", ext: "mp4", hint: "Plays anywhere" },
    { id: "webm", label: "WEBM", ext: "webm", hint: "Web" },
    { id: "mkv", label: "MKV", ext: "mkv", hint: "Flexible" },
    { id: "mov", label: "MOV", ext: "mov", hint: "Apple" },
    { id: "avi", label: "AVI", ext: "avi", hint: "Legacy" },
    { id: "gif", label: "GIF", ext: "gif", hint: "Animation" },
  ],
  audio: [
    { id: "mp3", label: "MP3", ext: "mp3", hint: "Universal" },
    { id: "m4a", label: "M4A", ext: "m4a", hint: "AAC" },
    { id: "wav", label: "WAV", ext: "wav", hint: "Uncompressed" },
    { id: "flac", label: "FLAC", ext: "flac", hint: "Lossless" },
    { id: "ogg", label: "OGG", ext: "ogg", hint: "Vorbis" },
    { id: "opus", label: "OPUS", ext: "opus", hint: "Best quality/size" },
  ],
};

const VIDEO_EXTS = ["mp4", "mkv", "webm", "mov", "avi", "m4v", "wmv", "flv", "mpg", "mpeg", "ts", "mts", "m2ts", "3gp", "ogv", "gif"];
export const INPUT_EXTS: Record<Kind, string[]> = {
  image: ["png", "jpg", "jpeg", "jfif", "webp", "avif", "gif", "bmp", "tif", "tiff", "ico", "tga", "jxl"],
  video: VIDEO_EXTS,
  audio: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "oga", "opus", "wma", "aif", "aiff", "ac3", "amr", ...VIDEO_EXTS.filter((e) => e !== "gif")],
};

export const formatDef = (kind: Kind, id: string) => FORMATS[kind].find((f) => f.id === id) ?? FORMATS[kind][0];

// ---------- options ----------

export type ResizeMode = "none" | "percent" | "width" | "height";
export interface ImageOptions {
  format: string;
  quality: number;
  resize: ResizeMode;
  resizeValue: number;
  stripMetadata: boolean;
}

export type VideoCodec = "h264" | "h265" | "vp9" | "av1";
export type QualityLevel = "high" | "balanced" | "small";
export interface VideoOptions {
  format: string;
  codec: VideoCodec;
  quality: QualityLevel;
  resolution: "source" | "2160" | "1440" | "1080" | "720" | "480";
  fps: "source" | "60" | "30" | "24" | "15";
  trimStart: string;
  trimEnd: string;
  mute: boolean;
}

export interface AudioOptions {
  format: string;
  bitrate: number;
  sampleRate: "source" | "48000" | "44100";
  channels: "source" | "2" | "1";
}

export const DEFAULTS = {
  image: { format: "webp", quality: 85, resize: "none", resizeValue: 50, stripMetadata: false } as ImageOptions,
  video: { format: "mp4", codec: "h264", quality: "balanced", resolution: "source", fps: "source", trimStart: "", trimEnd: "", mute: false } as VideoOptions,
  audio: { format: "mp3", bitrate: 192, sampleRate: "source", channels: "source" } as AudioOptions,
};

export function videoCodecsFor(format: string): VideoCodec[] {
  if (format === "webm") return ["vp9", "av1"];
  if (format === "mp4" || format === "mkv" || format === "mov") return ["h264", "h265"];
  return [];
}

export const LOSSLESS_AUDIO = ["wav", "flac"];

export interface BuiltJob {
  inputArgs: string[];
  outputArgs: string[];
  ext: string;
  duration: number | null;
}

// ---------- images ----------

const ALPHA_CAPABLE = ["png", "webp", "gif", "tif", "tiff", "avif", "ico", "tga", "jxl"];
const SINGLE_FRAME = ["png", "jpg", "bmp", "tiff", "ico", "avif"];
const IMAGE2_MUXED = ["png", "jpg", "bmp", "tiff"];

export function buildImageJob(o: ImageOptions, info: MediaInfo | undefined, srcExt: string, target?: string): BuiltJob {
  const fmt = target ?? o.format;
  const vf: string[] = [];
  if (o.resize === "percent" && o.resizeValue > 0 && o.resizeValue !== 100) vf.push(`scale=iw*${o.resizeValue / 100}:-1:flags=lanczos`);
  if (o.resize === "width" && o.resizeValue > 0) vf.push(`scale=${Math.round(o.resizeValue)}:-1:flags=lanczos`);
  if (o.resize === "height" && o.resizeValue > 0) vf.push(`scale=-1:${Math.round(o.resizeValue)}:flags=lanczos`);
  if (fmt === "ico") vf.push("scale='min(256,iw)':'min(256,ih)':force_original_aspect_ratio=decrease");

  const args: string[] = [];
  if (o.stripMetadata) args.push("-map_metadata", "-1");
  const q = Math.min(100, Math.max(1, Math.round(o.quality)));
  const animated = srcExt === "gif" || srcExt === "webp";

  switch (fmt) {
    case "jpg": {
      // JPG has no alpha: composite transparent sources over white instead of letting them turn black
      const flatten = ALPHA_CAPABLE.includes(srcExt) && info?.width && info?.height;
      const tail = [...vf, "format=yuvj420p"].join(",");
      if (flatten) {
        args.push("-filter_complex", `color=c=white:s=${info!.width}x${info!.height}[bg];[bg][0:v]overlay=shortest=1:format=auto,${tail}`);
      } else {
        args.push("-vf", tail);
      }
      args.push("-c:v", "mjpeg", "-q:v", String(Math.round(2 + ((100 - q) / 100) * 29)));
      break;
    }
    case "png":
      if (vf.length) args.push("-vf", vf.join(","));
      args.push("-c:v", "png");
      break;
    case "webp":
      if (vf.length) args.push("-vf", vf.join(","));
      args.push("-c:v", animated ? "libwebp_anim" : "libwebp");
      if (q === 100) args.push("-lossless", "1");
      else args.push("-quality", String(q));
      if (animated) args.push("-loop", "0");
      break;
    case "avif":
      if (vf.length) args.push("-vf", vf.join(","));
      args.push("-c:v", "libaom-av1", "-still-picture", "1", "-crf", String(Math.round((100 - q) * 0.5 + 8)), "-cpu-used", "6", "-pix_fmt", "yuv420p");
      break;
    case "gif":
      args.push("-vf", [...vf, "split[a][b];[a]palettegen[p];[b][p]paletteuse"].join(","), "-loop", "0");
      break;
    case "bmp":
      if (vf.length) args.push("-vf", vf.join(","));
      args.push("-c:v", "bmp");
      break;
    case "tiff":
      if (vf.length) args.push("-vf", vf.join(","));
      args.push("-c:v", "tiff", "-compression_algo", "lzw");
      break;
    case "ico":
      args.push("-vf", vf.join(","), "-c:v", "png");
      break;
  }
  if (SINGLE_FRAME.includes(fmt)) args.push("-frames:v", "1");
  if (IMAGE2_MUXED.includes(fmt)) args.push("-update", "1");
  return { inputArgs: [], outputArgs: args, ext: formatDef("image", fmt).ext, duration: null };
}

// ---------- video ----------

const QUALITY_INDEX: Record<QualityLevel, number> = { high: 0, balanced: 1, small: 2 };

function videoEncoderArgs(codec: VideoCodec, quality: QualityLevel, hw: string | null, container: string): string[] {
  const i = QUALITY_INDEX[quality];
  if (hw && (codec === "h264" || codec === "h265")) {
    const enc = `${codec === "h264" ? "h264" : "hevc"}_${hw}`;
    const q = String([19, 24, 30][i]);
    const tag = codec === "h265" && container !== "mkv" ? ["-tag:v", "hvc1"] : [];
    if (hw === "nvenc") return ["-c:v", enc, "-preset", "p5", "-rc", "vbr", "-cq", q, "-b:v", "0", "-pix_fmt", "yuv420p", ...tag];
    if (hw === "qsv") return ["-c:v", enc, "-preset", "medium", "-global_quality", q, "-pix_fmt", "nv12", ...tag];
    if (hw === "amf") return ["-c:v", enc, "-quality", "balanced", "-rc", "cqp", "-qp_i", q, "-qp_p", q, "-pix_fmt", "yuv420p", ...tag];
  }
  switch (codec) {
    case "h264":
      return ["-c:v", "libx264", "-preset", "medium", "-crf", String([18, 23, 28][i]), "-pix_fmt", "yuv420p"];
    case "h265":
      return ["-c:v", "libx265", "-preset", "medium", "-crf", String([20, 26, 30][i]), "-pix_fmt", "yuv420p", ...(container !== "mkv" ? ["-tag:v", "hvc1"] : [])];
    case "vp9":
      return ["-c:v", "libvpx-vp9", "-crf", String([24, 32, 40][i]), "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-pix_fmt", "yuv420p"];
    case "av1":
      return ["-c:v", "libsvtav1", "-crf", String([26, 35, 45][i]), "-preset", "8", "-pix_fmt", "yuv420p"];
  }
}

export function buildVideoJob(o: VideoOptions, info: MediaInfo | undefined, hw: string | null, target?: string): BuiltJob {
  const fmt = target ?? o.format;
  const i = QUALITY_INDEX[o.quality];
  const inputArgs: string[] = [];
  const args: string[] = [];

  const start = parseTime(o.trimStart);
  const end = parseTime(o.trimEnd);
  if (start) inputArgs.push("-ss", String(start));
  const srcDuration = info?.duration ?? null;
  const effectiveEnd = end != null && (srcDuration == null || end < srcDuration) ? end : srcDuration;
  const duration = effectiveEnd != null ? Math.max(0, effectiveEnd - (start ?? 0)) : null;
  // -ss before -i resets timestamps to 0, so the cut is expressed as a length
  if (end != null && duration != null) args.push("-t", String(duration));

  const vf: string[] = [];
  if (o.fps !== "source") vf.push(`fps=${o.fps}`);

  if (fmt === "gif") {
    if (o.fps === "source") vf.push("fps=15");
    vf.push(o.resolution === "source" ? "scale='min(480,iw)':-1:flags=lanczos" : `scale=-1:'min(${o.resolution},ih)':flags=lanczos`);
    vf.push("split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5");
    args.push("-vf", vf.join(","), "-an", "-loop", "0");
    return { inputArgs, outputArgs: args, ext: "gif", duration };
  }

  if (o.resolution !== "source") vf.push(`scale=-2:'min(${o.resolution},ih)':flags=lanczos`);
  args.push("-map", "0:v:0");
  if (!o.mute) args.push("-map", "0:a:0?");
  if (vf.length) args.push("-vf", vf.join(","));

  if (fmt === "avi") {
    args.push("-c:v", "mpeg4", "-q:v", String([2, 5, 9][i]));
    if (!o.mute) args.push("-c:a", "libmp3lame", "-b:a", ["256k", "192k", "128k"][i]);
  } else {
    const codecs = videoCodecsFor(fmt);
    const codec = codecs.includes(o.codec) ? o.codec : codecs[0];
    args.push(...videoEncoderArgs(codec, o.quality, hw, fmt));
    if (!o.mute) {
      if (fmt === "webm") args.push("-c:a", "libopus", "-b:a", ["160k", "128k", "96k"][i]);
      else args.push("-c:a", "aac", "-b:a", ["192k", "160k", "128k"][i]);
    }
    if (fmt === "mp4" || fmt === "mov") args.push("-movflags", "+faststart");
  }
  if (o.mute) args.push("-an");
  return { inputArgs, outputArgs: args, ext: formatDef("video", fmt).ext, duration };
}

// ---------- audio ----------

export function buildAudioJob(o: AudioOptions, info: MediaInfo | undefined, target?: string): BuiltJob {
  const fmt = target ?? o.format;
  const args = ["-vn", "-map", "0:a:0"];
  const br = `${o.bitrate}k`;
  switch (fmt) {
    case "mp3":
      args.push("-c:a", "libmp3lame", "-b:a", br);
      break;
    case "m4a":
      args.push("-c:a", "aac", "-b:a", br);
      break;
    case "wav":
      args.push("-c:a", "pcm_s16le");
      break;
    case "flac":
      args.push("-c:a", "flac", "-compression_level", "5");
      break;
    case "ogg":
      args.push("-c:a", "libvorbis", "-b:a", br);
      break;
    case "opus":
      args.push("-c:a", "libopus", "-b:a", `${Math.min(o.bitrate, 256)}k`);
      break;
  }
  // Opus only accepts 48 kHz-family rates; let ffmpeg pick for it
  if (o.sampleRate !== "source" && fmt !== "opus") args.push("-ar", o.sampleRate);
  if (o.channels !== "source") args.push("-ac", o.channels);
  return { inputArgs: [], outputArgs: args, ext: formatDef("audio", fmt).ext, duration: info?.duration ?? null };
}
