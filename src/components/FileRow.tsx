import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { motion } from "motion/react";
import { AlertCircle, ArrowRight, Check, FolderOpen, Music, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { FORMATS, type Kind } from "../lib/presets";
import { fmtBytes, fmtDuration } from "../lib/format";
import { cancelJob } from "../lib/tauri";
import { retry, useQueue, type Item } from "../store/queue";
import { useSettings } from "../store/settings";
import { cx, IconButton, ProgressBar } from "./ui";

function Thumb({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);
  const src = item.thumb ? convertFileSrc(item.thumb) : item.kind === "image" ? convertFileSrc(item.path) : null;
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-panel-2 border border-line">
      {src && !failed ? (
        <img src={src} onError={() => setFailed(true)} className="h-full w-full object-cover" draggable={false} loading="lazy" />
      ) : item.kind === "audio" ? (
        <Music size={20} className="text-accent" />
      ) : (
        <span className="text-[10px] font-bold uppercase text-muted">{item.ext}</span>
      )}
    </div>
  );
}

function TargetPicker({ item, kind }: { item: Item; kind: Kind }) {
  const pageFormat = useSettings((s) => s[kind].format);
  const update = useQueue((s) => s.update);
  const value = item.target ?? pageFormat;
  return (
    <label className="relative flex items-center gap-1 rounded-lg border border-line bg-panel-2 pl-2 pr-1 text-[12px] font-semibold hover:border-line-strong">
      <ArrowRight size={12} className="text-muted" />
      <select
        value={value}
        onChange={(e) => update(item.id, { target: e.target.value === pageFormat ? undefined : e.target.value })}
        className={cx("h-7 cursor-pointer appearance-none bg-transparent pr-1 outline-none", item.target ? "text-accent" : "text-fg")}
      >
        {FORMATS[kind].map((f) => (
          <option key={f.id} value={f.id} className="bg-panel text-fg">
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FileRow({ item }: { item: Item }) {
  const remove = useQueue((s) => s.remove);
  const info = item.info;
  const meta = [
    fmtBytes(info?.size),
    info?.width && info?.height ? `${info.width}×${info.height}` : null,
    info?.duration ? fmtDuration(info.duration) : null,
    item.kind === "video" ? info?.videoCodec : item.kind === "audio" ? info?.audioCodec : null,
  ].filter(Boolean);

  const saved = item.status === "done" && info?.size && item.outputSize ? Math.round((1 - item.outputSize / info.size) * 100) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
      className="group flex items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong"
    >
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium" title={item.path}>
            {item.name}
          </span>
        </div>
        {item.status === "running" ? (
          <div className="mt-1.5 flex items-center gap-3">
            <ProgressBar value={item.progress} className="flex-1" />
            <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-muted">
              {item.progress != null ? `${Math.floor(item.progress)}%` : "Working…"}
              {item.speed ? ` · ${item.speed.toFixed(1)}×` : ""}
            </span>
          </div>
        ) : item.status === "error" ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-red-400" title={item.error}>
            <AlertCircle size={13} className="shrink-0" />
            <span className="truncate">{item.error?.split("\n").pop() || "Conversion failed"}</span>
          </div>
        ) : item.status === "done" ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-emerald-400">
            <Check size={13} />
            <span className="truncate">
              Done · {fmtBytes(item.outputSize)}
              {saved != null && saved > 0 && <span className="text-muted"> · {saved}% smaller</span>}
            </span>
          </div>
        ) : (
          <div className="mt-0.5 truncate text-[12.5px] text-muted">
            {item.status === "queued" ? "Waiting…" : item.status === "cancelled" ? "Cancelled" : meta.join(" · ") || "Reading…"}
          </div>
        )}
      </div>

      {(item.status === "idle" || item.status === "cancelled" || item.status === "error") && <TargetPicker item={item} kind={item.kind} />}
      <div className="flex items-center">
        {item.status === "done" && item.output && (
          <IconButton title="Show in folder" onClick={() => revealItemInDir(item.output!)}>
            <FolderOpen size={16} />
          </IconButton>
        )}
        {(item.status === "error" || item.status === "cancelled") && (
          <IconButton title="Retry" onClick={() => retry(item.id)}>
            <RotateCcw size={15} />
          </IconButton>
        )}
        {item.status === "running" ? (
          <IconButton title="Cancel" onClick={() => cancelJob(item.id)}>
            <X size={16} />
          </IconButton>
        ) : (
          <IconButton title="Remove" onClick={() => remove(item.id)} className="opacity-0 group-hover:opacity-100">
            <X size={16} />
          </IconButton>
        )}
      </div>
    </motion.div>
  );
}
