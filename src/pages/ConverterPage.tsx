import { open } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "motion/react";
import { FolderOpen, Plus, Sparkles, Square, Trash2, UploadCloud, X } from "lucide-react";
import { useCallback, useMemo } from "react";
import { AudioOptionsPanel, FormatGrid, ImageOptionsPanel, VideoOptionsPanel } from "../components/Options";
import { FileRow } from "../components/FileRow";
import { Button, Field, IconButton } from "../components/ui";
import { formatDef, INPUT_EXTS, type Kind } from "../lib/presets";
import { useFileDrop } from "../store/drop";
import { cancelAll, convertAll, useQueue } from "../store/queue";
import { useSettings } from "../store/settings";
import { toast } from "../store/toast";

const NOUN: Record<Kind, string> = { image: "images", video: "videos", audio: "audio files" };

export function ConverterPage({ kind, title, subtitle }: { kind: Kind; title: string; subtitle: string }) {
  const allItems = useQueue((s) => s.items);
  const items = useMemo(() => allItems.filter((i) => i.kind === kind), [allItems, kind]);
  const add = useQueue((s) => s.add);
  const clear = useQueue((s) => s.clear);
  const format = useSettings((s) => s[kind].format);
  const outputDir = useSettings((s) => s.outputDir);

  const addPaths = useCallback(
    (paths: string[]) => {
      const added = add(kind, paths);
      const skipped = paths.length - added;
      if (skipped > 0) toast(`${skipped} file${skipped === 1 ? "" : "s"} skipped (unsupported or already added)`, "info");
    },
    [add, kind],
  );
  useFileDrop(addPaths);

  const browse = async () => {
    const picked = await open({ multiple: true, filters: [{ name: NOUN[kind], extensions: INPUT_EXTS[kind] }] });
    if (picked) addPaths(picked);
  };

  const pickOutput = async () => {
    const dir = await open({ directory: true });
    if (dir) useSettings.getState().set({ outputDir: dir });
  };

  const busy = items.some((i) => i.status === "running" || i.status === "queued");
  const pending = items.filter((i) => i.status !== "done").length;
  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-end justify-between gap-4 px-8 pb-5 pt-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold tracking-tight">{title}</h1>
            <p className="mt-0.5 text-muted">{subtitle}</p>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-1">
              {doneCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => clear(kind, true)}>
                  Clear finished
                </Button>
              )}
              <IconButton title="Clear all" onClick={() => clear(kind)}>
                <Trash2 size={16} />
              </IconButton>
              <Button size="sm" onClick={browse}>
                <Plus size={15} /> Add
              </Button>
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
          {items.length === 0 ? (
            <motion.button
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={browse}
              className="group flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-line-strong bg-panel/50 transition-colors hover:border-accent/60 hover:bg-accent/5 cursor-pointer"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent transition-transform group-hover:-translate-y-1">
                <UploadCloud size={30} />
              </div>
              <div className="text-center">
                <div className="text-[17px] font-semibold">Drop {NOUN[kind]} here</div>
                <div className="mt-1 text-muted">or click to browse · batch conversion supported</div>
              </div>
              <div className="flex max-w-md flex-wrap justify-center gap-1.5 px-6">
                {INPUT_EXTS[kind].slice(0, 14).map((e) => (
                  <span key={e} className="rounded-md bg-panel-2 px-2 py-0.5 text-[11px] font-semibold uppercase text-muted">
                    {e}
                  </span>
                ))}
              </div>
            </motion.button>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <FileRow key={item.id} item={item} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>

      <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-panel/60">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <Field label="Convert to">
            <FormatGrid kind={kind} />
          </Field>
          {kind === "image" && <ImageOptionsPanel />}
          {kind === "video" && <VideoOptionsPanel />}
          {kind === "audio" && <AudioOptionsPanel />}
        </div>
        <div className="space-y-3 border-t border-line p-5">
          <div className="flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2 text-[12.5px]">
            <FolderOpen size={15} className="shrink-0 text-muted" />
            <button onClick={pickOutput} className="min-w-0 flex-1 truncate text-left hover:text-accent cursor-pointer" title={outputDir ?? undefined}>
              {outputDir ?? "Same folder as original"}
            </button>
            {outputDir && (
              <button title="Use source folder" onClick={() => useSettings.getState().set({ outputDir: null })} className="text-muted hover:text-fg cursor-pointer">
                <X size={14} />
              </button>
            )}
          </div>
          {busy ? (
            <Button variant="secondary" size="lg" className="w-full" onClick={() => cancelAll(kind)}>
              <Square size={14} /> Stop
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="w-full" disabled={pending === 0} onClick={() => convertAll(kind)}>
              <Sparkles size={17} />
              {pending > 0 ? `Convert ${pending} to ${formatDef(kind, format).label}` : "Convert"}
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
