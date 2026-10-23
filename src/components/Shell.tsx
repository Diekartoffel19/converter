import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, motion } from "motion/react";
import { AudioLines, CheckCircle2, Copy, FileText, Film, Image, Info, Minus, Settings, Square, X, XCircle, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueue } from "../store/queue";
import { useToasts } from "../store/toast";
import { useDrop } from "../store/drop";
import { cx } from "./ui";

export type SectionId = "image" | "video" | "audio" | "pdf" | "settings";

export const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; accent: string; title: string; subtitle: string }[] = [
  { id: "image", label: "Images", icon: Image, accent: "#38bdf8", title: "Images", subtitle: "PNG, JPG, WEBP, AVIF, GIF, TIFF, ICO and more" },
  { id: "video", label: "Video", icon: Film, accent: "#8b7cf6", title: "Video", subtitle: "MP4, WEBM, MKV, MOV, AVI and GIF" },
  { id: "audio", label: "Audio", icon: AudioLines, accent: "#34d399", title: "Audio", subtitle: "MP3, M4A, WAV, FLAC, OGG, OPUS, or audio from video" },
  { id: "pdf", label: "PDF", icon: FileText, accent: "#fb7185", title: "PDF tools", subtitle: "Merge, organize, sign and convert PDFs" },
  { id: "settings", label: "Settings", icon: Settings, accent: "#a1a1aa", title: "Settings", subtitle: "Output, performance and appearance" },
];

export function TitleBar() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    win.isMaximized().then(setMaximized);
    const un = win.onResized(() => win.isMaximized().then(setMaximized));
    return () => {
      un.then((f) => f());
    };
  }, [win]);
  return (
    <div data-tauri-drag-region className="flex h-10 shrink-0 items-center justify-between pl-4">
      <div data-tauri-drag-region className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-muted">
        <Logo size={16} />
        Morph
      </div>
      <div className="flex h-full">
        {[
          { icon: <Minus size={15} />, onClick: () => win.minimize(), label: "Minimize" },
          { icon: maximized ? <Copy size={13} className="-scale-x-100" /> : <Square size={12} />, onClick: () => win.toggleMaximize(), label: "Maximize" },
          { icon: <X size={16} />, onClick: () => win.close(), label: "Close", danger: true },
        ].map((b) => (
          <button
            key={b.label}
            title={b.label}
            onClick={b.onClick}
            className={cx("flex h-full w-12 items-center justify-center text-muted transition-colors cursor-pointer", b.danger ? "hover:bg-red-600 hover:text-white" : "hover:bg-hover hover:text-fg")}
          >
            {b.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#8b7cf6" />
          <stop offset="1" stopColor="#fb7185" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lg)" />
      <path d="M18 44V22l14 13 14-13v22" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sidebar({ active, onSelect }: { active: SectionId; onSelect: (id: SectionId) => void }) {
  const items = useQueue((s) => s.items);
  return (
    <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1 pb-4 pt-2">
      {SECTIONS.map((s, i) => {
        const busy = s.id !== "pdf" && s.id !== "settings" && items.some((it) => it.kind === s.id && (it.status === "running" || it.status === "queued"));
        const isActive = active === s.id;
        return (
          <div key={s.id} className={cx("w-full px-2", i === SECTIONS.length - 1 && "mt-auto")}>
            <button
              onClick={() => onSelect(s.id)}
              style={{ ["--accent" as string]: s.accent }}
              className={cx(
                "group relative flex w-full flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-medium transition-colors cursor-pointer",
                isActive ? "text-fg" : "text-muted hover:text-fg hover:bg-hover",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-accent/12 border border-accent/25"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <s.icon size={20} className={cx("relative transition-colors", isActive && "text-accent")} />
              <span className="relative">{s.label}</span>
              {busy && <span className="absolute right-3 top-2 h-2 w-2 animate-pulse rounded-full bg-accent" />}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex max-w-sm cursor-pointer items-center gap-3 rounded-xl border border-line-strong bg-panel px-4 py-3 shadow-2xl"
          >
            {t.kind === "success" && <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />}
            {t.kind === "error" && <XCircle size={18} className="shrink-0 text-red-400" />}
            {t.kind === "info" && <Info size={18} className="shrink-0 text-sky-400" />}
            <span className="text-[13.5px]">{t.message}</span>
            {t.action && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="ml-1 shrink-0 rounded-lg bg-hover px-2.5 py-1 text-[12.5px] font-semibold hover:bg-line-strong cursor-pointer"
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function DropOverlay() {
  const { hovering, handler } = useDrop();
  return (
    <AnimatePresence>
      {hovering && handler && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-bg/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="rounded-3xl border-2 border-dashed border-accent/60 bg-accent/10 px-16 py-12 text-center"
          >
            <div className="text-xl font-semibold">Drop to add files</div>
            <div className="mt-1 text-muted">Release anywhere</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
