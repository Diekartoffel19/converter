import { AnimatePresence, Reorder } from "motion/react";
import { FileText, GripVertical, Loader2, Merge, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Button, Field, IconButton, TextInput } from "../../components/ui";
import { basename, dirname, extname, fmtBytes, joinPath, parsePageRanges, uid } from "../../lib/format";
import { closePdfJs, assemble, canvasToBytes, loadPdfJs, pickPdfs, pickSavePath, readBytes, renderPage, writeBytes, type PageRef } from "../../lib/pdf";
import { useFileDrop } from "../../store/drop";
import { EmptyDrop, errorToast, savedToast, ToolLayout } from "./common";

interface PdfFile {
  id: string;
  path: string;
  name: string;
  size: number;
  pages: number;
  thumb: string | null;
  /** Optional "1-3, 5" selection; empty = all pages */
  range: string;
}

async function inspect(path: string): Promise<PdfFile> {
  const bytes = await readBytes(path);
  const doc = await loadPdfJs(bytes);
  let thumb: string | null = null;
  try {
    const { canvas } = await renderPage(doc, 1, 0.35);
    thumb = URL.createObjectURL(new Blob([(await canvasToBytes(canvas, "image/jpeg", 0.8)) as BlobPart], { type: "image/jpeg" }));
  } catch {
    /* thumbnail is optional */
  }
  const pages = doc.numPages;
  closePdfJs(doc);
  return { id: uid(), path, name: basename(path), size: bytes.length, pages, thumb, range: "" };
}

export function MergeTool() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [loading, setLoading] = useState(0);
  const [busy, setBusy] = useState(false);

  const add = useCallback(async (paths: string[]) => {
    const pdfs = paths.filter((p) => extname(p) === "pdf");
    setLoading((n) => n + pdfs.length);
    for (const p of pdfs) {
      try {
        const f = await inspect(p);
        setFiles((prev) => [...prev, f]);
      } catch (e) {
        errorToast(e);
      } finally {
        setLoading((n) => n - 1);
      }
    }
  }, []);
  useFileDrop(add);

  const totalPages = files.reduce((acc, f) => acc + f.pages, 0);

  const merge = async () => {
    const target = await pickSavePath(joinPath(dirname(files[0].path), "merged.pdf"));
    if (!target) return;
    setBusy(true);
    try {
      const sources = await Promise.all(files.map((f) => readBytes(f.path)));
      const refs: PageRef[] = [];
      files.forEach((f, source) => {
        const indexes = f.range.trim() ? parsePageRanges(f.range, f.pages) : [...Array(f.pages).keys()];
        if (!indexes) throw new Error(`Invalid page range for ${f.name}`);
        indexes.forEach((index) => refs.push({ source, index, rotation: 0 }));
      });
      await writeBytes(target, await assemble(sources, refs));
      savedToast(target, `Merged ${files.length} files`);
    } catch (e) {
      errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  const browse = async () => add(await pickPdfs(true));

  return (
    <ToolLayout
      main={
        files.length === 0 && !loading ? (
          <EmptyDrop title="Drop PDFs to merge" hint="or click to browse · drag to reorder" onClick={browse} />
        ) : (
          <div className="space-y-2">
            <Reorder.Group axis="y" values={files} onReorder={setFiles} className="space-y-2">
              <AnimatePresence initial={false}>
                {files.map((f, i) => (
                  <Reorder.Item
                    key={f.id}
                    value={f}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    whileDrag={{ scale: 1.02, boxShadow: "0 12px 30px rgb(0 0 0 / 0.35)" }}
                    className="group flex cursor-grab items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5 active:cursor-grabbing"
                  >
                    <GripVertical size={16} className="shrink-0 text-muted" />
                    <span className="w-5 shrink-0 text-center text-[12px] font-semibold text-muted">{i + 1}</span>
                    <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-white">
                      {f.thumb ? <img src={f.thumb} className="h-full w-full object-cover" draggable={false} /> : <FileText size={18} className="text-neutral-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{f.name}</div>
                      <div className="text-[12.5px] text-muted">
                        {f.pages} page{f.pages === 1 ? "" : "s"} · {fmtBytes(f.size)}
                      </div>
                    </div>
                    <TextInput
                      placeholder="All pages"
                      value={f.range}
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) => setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, range: e.target.value } : x)))}
                      className="h-8! w-32 text-[12.5px]"
                      title="Pages to include, e.g. 1-3, 5"
                    />
                    <IconButton title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}>
                      <X size={16} />
                    </IconButton>
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
            {loading > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 text-muted">
                <Loader2 size={16} className="animate-spin" /> Reading {loading} file{loading === 1 ? "" : "s"}…
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={browse}>
              <Plus size={15} /> Add PDFs
            </Button>
          </div>
        )
      }
      side={
        <Field label="Summary">
          <div className="rounded-xl bg-panel-2 p-4 text-[13px] leading-relaxed text-muted">
            <div>
              <span className="text-fg font-semibold">{files.length}</span> files · <span className="text-fg font-semibold">{totalPages}</span> pages
            </div>
            <div className="mt-2">Drag files to change their order. Use the page field to include only some pages, e.g. <span className="text-fg">1-3, 7</span>.</div>
          </div>
        </Field>
      }
      footer={
        <Button variant="primary" size="lg" className="w-full" disabled={files.length < 2 || busy} onClick={merge}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Merge size={17} />}
          Merge {files.length > 1 ? `${files.length} PDFs` : "PDFs"}
        </Button>
      }
    />
  );
}
