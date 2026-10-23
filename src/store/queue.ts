import { create } from "zustand";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { buildAudioJob, buildImageJob, buildVideoJob, INPUT_EXTS, type BuiltJob, type Kind } from "../lib/presets";
import { cancelJob, probe, startJob, thumbnail, type MediaInfo } from "../lib/tauri";
import { basename, extname, uid } from "../lib/format";
import { activeHwEncoder, useSettings } from "./settings";
import { toast } from "./toast";

export type Status = "idle" | "queued" | "running" | "done" | "error" | "cancelled";

export interface Item {
  id: string;
  kind: Kind;
  path: string;
  name: string;
  ext: string;
  info?: MediaInfo;
  /** Absolute path of a rendered preview (videos, and images the webview can't display). */
  thumb?: string;
  /** Per-file format override; falls back to the page's format. */
  target?: string;
  status: Status;
  progress: number | null;
  speed: number | null;
  output?: string;
  outputSize?: number;
  error?: string;
}

interface QueueState {
  items: Item[];
  add: (kind: Kind, paths: string[]) => number;
  remove: (id: string) => void;
  clear: (kind: Kind, finishedOnly?: boolean) => void;
  update: (id: string, patch: Partial<Item>) => void;
}

// WebView2 renders these directly through the asset protocol; anything else gets an ffmpeg thumbnail
const WEBVIEW_IMAGES = ["png", "jpg", "jpeg", "jfif", "webp", "avif", "gif", "bmp", "ico"];

export const useQueue = create<QueueState>()((set, get) => ({
  items: [],
  add: (kind, paths) => {
    const existing = new Set(get().items.filter((i) => i.kind === kind).map((i) => i.path));
    const fresh = paths
      .filter((p) => INPUT_EXTS[kind].includes(extname(p)) && !existing.has(p))
      .map<Item>((path) => ({ id: uid(), kind, path, name: basename(path), ext: extname(path), status: "idle", progress: null, speed: null }));
    set((s) => ({ items: [...s.items, ...fresh] }));
    for (const item of fresh) {
      probe(item.path)
        .then((info) => get().update(item.id, { info }))
        .catch(() => {});
      if (kind === "video" || (kind === "image" && !WEBVIEW_IMAGES.includes(item.ext))) {
        thumbnail(item.path)
          .then((thumb) => get().update(item.id, { thumb }))
          .catch(() => {});
      }
    }
    return fresh.length;
  },
  remove: (id) => {
    const item = get().items.find((i) => i.id === id);
    if (item?.status === "running") cancelJob(id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
  clear: (kind, finishedOnly) =>
    set((s) => ({
      items: s.items.filter((i) => i.kind !== kind || (finishedOnly ? i.status !== "done" : i.status === "running" || i.status === "queued")),
    })),
  update: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
}));

// ---------- runner ----------

let running = 0;

export function convertAll(kind: Kind) {
  const { items, update } = useQueue.getState();
  for (const item of items) {
    if (item.kind === kind && item.status !== "running" && item.status !== "queued" && item.status !== "done") {
      update(item.id, { status: "queued", progress: null, error: undefined });
    }
  }
  pump();
}

export function retry(id: string) {
  useQueue.getState().update(id, { status: "queued", progress: null, error: undefined });
  pump();
}

export function cancelAll(kind: Kind) {
  const { items, update } = useQueue.getState();
  for (const item of items) {
    if (item.kind !== kind) continue;
    if (item.status === "queued") update(item.id, { status: "idle" });
    if (item.status === "running") cancelJob(item.id);
  }
}

function pump() {
  const { concurrency } = useSettings.getState();
  while (running < concurrency) {
    const next = useQueue.getState().items.find((i) => i.status === "queued");
    if (!next) break;
    running++;
    useQueue.getState().update(next.id, { status: "running", progress: null, speed: null });
    runItem(next).finally(() => {
      running--;
      pump();
      if (running === 0) onBatchFinished();
    });
  }
  syncTaskbar();
}

function buildJob(item: Item, info: MediaInfo | undefined): BuiltJob {
  const s = useSettings.getState();
  if (item.kind === "image") return buildImageJob(s.image, info, item.ext, item.target);
  if (item.kind === "video") return buildVideoJob(s.video, info, activeHwEncoder(), item.target);
  return buildAudioJob(s.audio, info, item.target);
}

async function runItem(item: Item) {
  const { update } = useQueue.getState();
  try {
    const info = item.info ?? (await probe(item.path));
    const job = buildJob(item, info);
    const output = await startJob({
      id: item.id,
      input: item.path,
      inputArgs: job.inputArgs,
      outputArgs: job.outputArgs,
      outputDir: useSettings.getState().outputDir,
      ext: job.ext,
      duration: job.duration,
    });
    const outInfo = await probe(output).catch(() => undefined);
    update(item.id, { status: "done", progress: 100, output, outputSize: outInfo?.size, info });
  } catch (e) {
    const msg = String(e);
    update(item.id, msg === "cancelled" ? { status: "cancelled", progress: null } : { status: "error", error: msg, progress: null });
  }
}

let batchStats = { done: 0, failed: 0 };
useQueue.subscribe((s, prev) => {
  for (const item of s.items) {
    const before = prev.items.find((p) => p.id === item.id);
    if (before && before.status === "running" && item.status !== "running") {
      if (item.status === "done") batchStats.done++;
      if (item.status === "error") batchStats.failed++;
    }
  }
  syncTaskbar();
});

function onBatchFinished() {
  const { done, failed } = batchStats;
  batchStats = { done: 0, failed: 0 };
  if (!done && !failed) return;
  if (failed) toast(`${done} converted, ${failed} failed`, "error");
  else toast(`${done} file${done === 1 ? "" : "s"} converted`, "success");
}

let lastTaskbar = "";
function syncTaskbar() {
  const active = useQueue.getState().items.filter((i) => i.status === "running" || i.status === "queued");
  let state: string;
  let progress = 0;
  if (!active.length) state = "none";
  else {
    progress = Math.round(active.reduce((acc, i) => acc + (i.progress ?? 0), 0) / active.length);
    state = `normal:${progress}`;
  }
  if (state === lastTaskbar) return;
  lastTaskbar = state;
  getCurrentWindow()
    .setProgressBar(active.length ? { status: ProgressBarStatus.Normal, progress } : { status: ProgressBarStatus.None })
    .catch(() => {});
}
