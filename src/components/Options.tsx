import { Cpu, Scissors } from "lucide-react";
import { FORMATS, LOSSLESS_AUDIO, videoCodecsFor, type Kind, type ResizeMode, type VideoCodec } from "../lib/presets";
import { parseTime } from "../lib/format";
import { useSettings } from "../store/settings";
import { cx, Field, Segmented, Select, Slider, TextInput, Toggle } from "./ui";

export function FormatGrid({ kind }: { kind: Kind }) {
  const format = useSettings((s) => s[kind].format);
  const setOptions = useSettings((s) => s.setOptions);
  return (
    <div className="grid grid-cols-3 gap-2">
      {FORMATS[kind].map((f) => {
        const active = f.id === format;
        return (
          <button
            key={f.id}
            onClick={() => {
              const patch: Record<string, unknown> = { format: f.id };
              // keep the codec valid for the new container
              if (kind === "video") {
                const codecs = videoCodecsFor(f.id);
                const current = useSettings.getState().video.codec;
                if (codecs.length && !codecs.includes(current)) patch.codec = codecs[0];
              }
              setOptions(kind, patch);
            }}
            className={cx(
              "rounded-xl border px-2 py-2.5 text-center transition-all cursor-pointer",
              active ? "border-accent bg-accent/12 shadow-[0_0_0_3px] shadow-accent/15" : "border-line bg-panel-2 hover:border-line-strong",
            )}
          >
            <div className={cx("text-[13.5px] font-bold tracking-wide", active && "text-accent")}>{f.label}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted">{f.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

export function ImageOptionsPanel() {
  const o = useSettings((s) => s.image);
  const set = (patch: Partial<typeof o>) => useSettings.getState().setOptions("image", patch);
  const lossy = ["jpg", "webp", "avif"].includes(o.format);
  return (
    <>
      {lossy && (
        <Field label="Quality" hint={o.quality === 100 && o.format === "webp" ? "Lossless" : `${o.quality}%`}>
          <Slider value={o.quality} min={10} max={100} onChange={(quality) => set({ quality })} />
        </Field>
      )}
      <Field label="Resize">
        <Segmented<ResizeMode>
          value={o.resize}
          onChange={(resize) => set({ resize, resizeValue: resize === "percent" ? 50 : resize === "none" ? o.resizeValue : 1920 })}
          options={[
            { value: "none", label: "Original" },
            { value: "percent", label: "%" },
            { value: "width", label: "Width" },
            { value: "height", label: "Height" },
          ]}
        />
        {o.resize === "percent" && <Slider value={o.resizeValue} min={5} max={200} step={5} onChange={(resizeValue) => set({ resizeValue })} />}
        {o.resize === "percent" && <div className="text-right text-[12px] text-muted">{o.resizeValue}% of original</div>}
        {(o.resize === "width" || o.resize === "height") && (
          <div className="relative">
            <TextInput type="number" min={1} value={o.resizeValue} onChange={(e) => set({ resizeValue: Number(e.target.value) })} />
            <span className="pointer-events-none absolute right-3 top-2.5 text-muted">px</span>
          </div>
        )}
      </Field>
      <Toggle checked={o.stripMetadata} onChange={(stripMetadata) => set({ stripMetadata })} label="Strip metadata" description="Remove EXIF, GPS and camera info" />
    </>
  );
}

const CODEC_LABEL: Record<VideoCodec, string> = { h264: "H.264", h265: "H.265 / HEVC", vp9: "VP9", av1: "AV1" };

export function VideoOptionsPanel() {
  const o = useSettings((s) => s.video);
  const hw = useSettings((s) => (s.gpu && s.hwEncoders?.length ? s.hwEncoders[0] : null));
  const set = (patch: Partial<typeof o>) => useSettings.getState().setOptions("video", patch);
  const codecs = videoCodecsFor(o.format);
  const usesHw = hw && (o.codec === "h264" || o.codec === "h265") && codecs.length > 0;
  const badTrim = (o.trimStart && parseTime(o.trimStart) == null) || (o.trimEnd && parseTime(o.trimEnd) == null);
  return (
    <>
      {codecs.length > 0 && (
        <Field label="Codec" hint={usesHw ? <span className="flex items-center gap-1 text-accent"><Cpu size={12} /> GPU ({hw!.toUpperCase()})</span> : undefined}>
          <Segmented<VideoCodec> value={o.codec} onChange={(codec) => set({ codec })} options={codecs.map((c) => ({ value: c, label: CODEC_LABEL[c] }))} />
        </Field>
      )}
      <Field label="Quality">
        <Segmented
          value={o.quality}
          onChange={(quality) => set({ quality })}
          options={[
            { value: "high", label: "High" },
            { value: "balanced", label: "Balanced" },
            { value: "small", label: "Small file" },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Resolution">
          <Select
            value={o.resolution}
            onChange={(resolution) => set({ resolution })}
            options={[
              { value: "source", label: o.format === "gif" ? "Auto (480p)" : "Original" },
              { value: "2160", label: "4K" },
              { value: "1440", label: "1440p" },
              { value: "1080", label: "1080p" },
              { value: "720", label: "720p" },
              { value: "480", label: "480p" },
            ]}
          />
        </Field>
        <Field label="Frame rate">
          <Select
            value={o.fps}
            onChange={(fps) => set({ fps })}
            options={[
              { value: "source", label: o.format === "gif" ? "Auto (15)" : "Original" },
              { value: "60", label: "60 fps" },
              { value: "30", label: "30 fps" },
              { value: "24", label: "24 fps" },
              { value: "15", label: "15 fps" },
            ]}
          />
        </Field>
      </div>
      <Field label="Trim" hint={<Scissors size={12} />}>
        <div className="grid grid-cols-2 gap-3">
          <TextInput placeholder="Start 0:00" value={o.trimStart} onChange={(e) => set({ trimStart: e.target.value })} />
          <TextInput placeholder="End" value={o.trimEnd} onChange={(e) => set({ trimEnd: e.target.value })} />
        </div>
        {badTrim && <div className="text-[12px] text-red-400">Use seconds or m:ss, e.g. 1:30</div>}
      </Field>
      {o.format !== "gif" && <Toggle checked={o.mute} onChange={(mute) => set({ mute })} label="Remove audio" />}
    </>
  );
}

export function AudioOptionsPanel() {
  const o = useSettings((s) => s.audio);
  const set = (patch: Partial<typeof o>) => useSettings.getState().setOptions("audio", patch);
  const lossless = LOSSLESS_AUDIO.includes(o.format);
  return (
    <>
      {!lossless && (
        <Field label="Bitrate" hint={`${o.bitrate} kbps`}>
          <Segmented
            value={String(o.bitrate)}
            onChange={(b) => set({ bitrate: Number(b) })}
            options={["96", "128", "192", "256", "320"].map((b) => ({ value: b, label: b }))}
          />
        </Field>
      )}
      <Field label="Sample rate">
        <Segmented
          value={o.sampleRate}
          onChange={(sampleRate) => set({ sampleRate })}
          options={[
            { value: "source", label: "Original" },
            { value: "44100", label: "44.1 kHz", disabled: o.format === "opus" },
            { value: "48000", label: "48 kHz" },
          ]}
        />
      </Field>
      <Field label="Channels">
        <Segmented
          value={o.channels}
          onChange={(channels) => set({ channels })}
          options={[
            { value: "source", label: "Original" },
            { value: "2", label: "Stereo" },
            { value: "1", label: "Mono" },
          ]}
        />
      </Field>
    </>
  );
}
