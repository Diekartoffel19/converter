import { open } from "@tauri-apps/plugin-dialog";
import { motion } from "motion/react";
import { CheckSquare, FileOutput, FolderOpen, Loader2, RotateCcw, RotateCw, Save, Scissors, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, cx, Field, IconButton, Segmented, TextInput } from "../../components/ui";
import { basename, dirname, extname, joinPath, parsePageRanges, stem, uid } from "../../lib/format";
import { closePdfJs, assemble, canvasToBlob, loadPdfJs, loadPdfLib, pdfName, pickPdfs, pickSavePath, readBytes, renderPage, writeBytes, type PdfJsDoc } from "../../lib/pdf";
import { useFileDrop } from "../../store/drop";
import { toast } from "../../store/toast";
import { EmptyDrop, errorToast, savedToast, ToolLayout } from "./common";

interface Page {
  id: string;
  /** 0-based index in the source document */
  index: number;
  rotation: number;
}

type SplitMode = "each" | "every" | "ranges";

export function OrganizeTool() {
  const [path, setPath] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Page[][]>([]);
  const [meta, setMeta] = useState({ title: "", author: "" });
  const [split, setSplit] = useState<{ mode: SplitMode; every: number; ranges: string }>({ mode: "each", every: 2, ranges: "" });
  const [busy, setBusy] = useState(false);
  const docRef = useRef<PdfJsDoc | null>(null);
  const lastClicked = useRef<number | null>(null);

  const load = useCallback(async (paths: string[]) => {
    const p = paths.find((x) => extname(x) === "pdf");
    if (!p) return;
    try {
      const data = await readBytes(p);
      const [doc, lib] = await Promise.all([loadPdfJs(data), loadPdfLib(data)]);
      closePdfJs(docRef.current);
      docRef.current = doc;
      setPath(p);
      setBytes(data);
      setPages([...Array(doc.numPages).keys()].map((index) => ({ id: uid(), index, rotation: 0 })));
      setThumbs({});
      setSelected(new Set());
      setHistory([]);
      setMeta({ title: lib.getTitle() ?? "", author: lib.getAuthor() ?? "" });
    } catch (e) {
      errorToast(e);
    }
  }, []);
  useFileDrop(load);

  // Render thumbnails one by one so the first pages show up immediately
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      for (let i = 1; i <= doc.numPages && !cancelled; i++) {
        try {
          const first = await doc.getPage(i);
          const scale = 200 / first.getViewport({ scale: 1 }).width;
          const { canvas } = await renderPage(doc, i, scale);
          const url = URL.createObjectURL(await canvasToBlob(canvas, "image/jpeg", 0.85));
          urls.push(url);
          if (!cancelled) setThumbs((t) => ({ ...t, [i - 1]: url }));
        } catch {
          /* leave placeholder */
        }
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [bytes]);

  const commit = (next: Page[]) => {
    setHistory((h) => [...h.slice(-49), pages]);
    setPages(next);
  };
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setPages(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  const rotate = (ids: Set<string>, delta: number) => commit(pages.map((p) => (ids.has(p.id) ? { ...p, rotation: (p.rotation + delta + 360) % 360 } : p)));
  const remove = (ids: Set<string>) => {
    if (ids.size >= pages.length) return toast("A PDF needs at least one page", "error");
    commit(pages.filter((p) => !ids.has(p.id)));
    setSelected(new Set());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") undo();
      if (e.key === "Delete" && selected.size) remove(selected);
      if (e.ctrlKey && e.key.toLowerCase() === "a" && pages.length) {
        e.preventDefault();
        setSelected(new Set(pages.map((p) => p.id)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ----- pointer drag reordering (HTML5 drag & drop is taken by Tauri's file drop) -----
  const drag = useRef<{ id: string; x: number; y: number; active: boolean; snapshot: Page[] } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    drag.current = { id, x: e.clientX, y: e.clientY, active: false, snapshot: pages };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.active = true;
      setDragId(d.id);
    }
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-page-id]")?.dataset.pageId;
    if (!over || over === d.id) return;
    setPages((cur) => {
      const from = cur.findIndex((p) => p.id === d.id);
      const to = cur.findIndex((p) => p.id === over);
      if (from < 0 || to < 0) return cur;
      const next = [...cur];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  };
  const onPointerUp = (e: React.PointerEvent, idx: number) => {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    if (!d) return;
    if (d.active) {
      setHistory((h) => [...h.slice(-49), d.snapshot]);
      return;
    }
    // plain click: toggle, shift-click: range
    setSelected((sel) => {
      const next = new Set(sel);
      if (e.shiftKey && lastClicked.current != null) {
        const [a, b] = [lastClicked.current, idx].sort((x, y) => x - y);
        pages.slice(a, b + 1).forEach((p) => next.add(p.id));
      } else if (next.has(d.id)) next.delete(d.id);
      else next.add(d.id);
      return next;
    });
    lastClicked.current = idx;
  };

  // ----- output -----
  const refs = (list: Page[]) => list.map((p) => ({ source: 0, index: p.index, rotation: p.rotation }));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  const saveAll = () =>
    run(async () => {
      const target = await pickSavePath(joinPath(dirname(path!), pdfName(path!, "-edited")));
      if (!target) return;
      await writeBytes(target, await assemble([bytes!], refs(pages), meta));
      savedToast(target);
    });

  const extract = () =>
    run(async () => {
      const chosen = pages.filter((p) => selected.has(p.id));
      const target = await pickSavePath(joinPath(dirname(path!), pdfName(path!, `-pages`)));
      if (!target) return;
      await writeBytes(target, await assemble([bytes!], refs(chosen), meta));
      savedToast(target, `Extracted ${chosen.length} page${chosen.length === 1 ? "" : "s"}`);
    });

  const splitGroups = (): Page[][] | null => {
    if (split.mode === "each") return pages.map((p) => [p]);
    if (split.mode === "every") {
      const n = Math.max(1, Math.floor(split.every));
      const groups: Page[][] = [];
      for (let i = 0; i < pages.length; i += n) groups.push(pages.slice(i, i + n));
      return groups;
    }
    const groups = split.ranges
      .split(",")
      .filter((g) => g.trim())
      .map((g) => parsePageRanges(g, pages.length)?.map((i) => pages[i]));
    return groups.length && groups.every(Boolean) ? (groups as Page[][]) : null;
  };

  const doSplit = () =>
    run(async () => {
      const groups = splitGroups();
      if (!groups) return void toast("Invalid ranges. Example: 1-3, 4-6, 7", "error");
      const dir = await open({ directory: true, defaultPath: dirname(path!) });
      if (!dir) return;
      const pad = String(groups.length).length;
      let first = "";
      for (const [i, group] of groups.entries()) {
        const out = joinPath(dir, `${stem(path!)}-part${String(i + 1).padStart(pad, "0")}.pdf`);
        await writeBytes(out, await assemble([bytes!], refs(group), meta));
        first ||= out;
      }
      savedToast(first, `Split into ${groups.length} files`);
    });

  if (!path) {
    return <ToolLayout main={<EmptyDrop title="Drop a PDF to organize" hint="Reorder, rotate, delete, extract and split pages" onClick={async () => load(await pickPdfs(false))} />} footer={null} />;
  }

  return (
    <ToolLayout
      main={
        <div>
          <div className="sticky top-0 z-10 -mx-2 mb-4 flex items-center gap-1 rounded-2xl border border-line bg-panel/90 p-1.5 backdrop-blur">
            <span className="min-w-0 flex-1 truncate px-2 text-[13px]">
              <span className="font-medium">{basename(path)}</span>
              <span className="text-muted"> · {pages.length} pages{selected.size ? ` · ${selected.size} selected` : ""}</span>
            </span>
            <IconButton title="Select all (Ctrl+A)" onClick={() => setSelected(selected.size === pages.length ? new Set() : new Set(pages.map((p) => p.id)))}>
              <CheckSquare size={16} />
            </IconButton>
            <IconButton title="Rotate left" disabled={!selected.size} onClick={() => rotate(selected, -90)}>
              <RotateCcw size={16} />
            </IconButton>
            <IconButton title="Rotate right" disabled={!selected.size} onClick={() => rotate(selected, 90)}>
              <RotateCw size={16} />
            </IconButton>
            <IconButton title="Delete (Del)" disabled={!selected.size} onClick={() => remove(selected)}>
              <Trash2 size={16} />
            </IconButton>
            <IconButton title="Undo (Ctrl+Z)" disabled={!history.length} onClick={undo}>
              <Undo2 size={16} />
            </IconButton>
            <div className="mx-1 h-5 w-px bg-line-strong" />
            <IconButton title="Close file" onClick={() => setPath(null)}>
              <X size={16} />
            </IconButton>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 pb-6">
            {pages.map((p, i) => {
              const isSel = selected.has(p.id);
              return (
                <motion.div
                  layout
                  transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                  key={p.id}
                  data-page-id={p.id}
                  onPointerDown={(e) => onPointerDown(e, p.id)}
                  onPointerMove={onPointerMove}
                  onPointerUp={(e) => onPointerUp(e, i)}
                  className={cx(
                    "group relative cursor-pointer rounded-2xl border p-2.5 transition-[border-color,background-color] touch-none",
                    isSel ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-line-strong",
                    dragId === p.id && "z-10 scale-[1.04] shadow-2xl ring-2 ring-accent",
                  )}
                >
                  <div className="flex aspect-[3/4] items-center justify-center overflow-hidden">
                    {thumbs[p.index] ? (
                      <img
                        src={thumbs[p.index]}
                        draggable={false}
                        style={{ transform: `rotate(${p.rotation}deg)` }}
                        className="max-h-full max-w-full rounded-sm bg-white shadow-md transition-transform duration-300"
                      />
                    ) : (
                      <Loader2 size={18} className="animate-spin text-muted" />
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[12px]">
                    <span className={cx("font-semibold", isSel ? "text-accent" : "text-muted")}>{i + 1}</span>
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                      <button title="Rotate" className="rounded-md p-1 text-muted hover:bg-hover hover:text-fg cursor-pointer" onClick={() => rotate(new Set([p.id]), 90)}>
                        <RotateCw size={13} />
                      </button>
                      <button title="Delete" className="rounded-md p-1 text-muted hover:bg-hover hover:text-red-400 cursor-pointer" onClick={() => remove(new Set([p.id]))}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {isSel && <span className="absolute right-3 top-3 h-3 w-3 rounded-full border-2 border-panel bg-accent" />}
                </motion.div>
              );
            })}
          </div>
        </div>
      }
      side={
        <>
          <Field label="Split">
            <Segmented<SplitMode>
              value={split.mode}
              onChange={(mode) => setSplit((s) => ({ ...s, mode }))}
              options={[
                { value: "each", label: "Every page" },
                { value: "every", label: "Every N" },
                { value: "ranges", label: "Ranges" },
              ]}
            />
            {split.mode === "every" && (
              <TextInput type="number" min={1} value={split.every} onChange={(e) => setSplit((s) => ({ ...s, every: Number(e.target.value) }))} />
            )}
            {split.mode === "ranges" && (
              <TextInput placeholder="e.g. 1-3, 4-6, 7" value={split.ranges} onChange={(e) => setSplit((s) => ({ ...s, ranges: e.target.value }))} />
            )}
            <Button className="w-full" disabled={busy} onClick={doSplit}>
              <Scissors size={15} /> Split into files
            </Button>
          </Field>
          <Field label="Selection">
            <Button className="w-full" disabled={!selected.size || busy} onClick={extract}>
              <FileOutput size={15} /> Extract {selected.size || ""} selected
            </Button>
          </Field>
          <Field label="Document info">
            <TextInput placeholder="Title" value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} />
            <TextInput placeholder="Author" value={meta.author} onChange={(e) => setMeta((m) => ({ ...m, author: e.target.value }))} />
          </Field>
          <p className="text-[12px] leading-relaxed text-muted">Click pages to select, Shift-click for a range, drag to reorder.</p>
        </>
      }
      footer={
        <>
          <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={saveAll}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Save PDF
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={async () => load(await pickPdfs(false))}>
            <FolderOpen size={14} /> Open another
          </Button>
        </>
      }
    />
  );
}
