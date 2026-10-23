import { open } from "@tauri-apps/plugin-dialog";
import { FileImage, FileText, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, Field, IconButton, ProgressBar, Segmented, Slider, TextInput } from "../../components/ui";
import { basename, dirname, extname, fmtBytes, joinPath, parsePageRanges, stem } from "../../lib/format";
import { closePdfJs, canvasToBlob, canvasToBytes, loadPdfJs, pickPdfs, readBytes, renderPage, writeBytes, type PdfJsDoc } from "../../lib/pdf";
import { useFileDrop } from "../../store/drop";
import { toast } from "../../store/toast";
import { EmptyDrop, errorToast, savedToast, ToolLayout } from "./common";

export function PdfToImagesTool() {
  const [file, setFile] = useState<{ path: string; size: number; doc: PdfJsDoc; preview: string | null } | null>(null);
  const [format, setFormat] = useState<"png" | "jpg">("png");
  const [dpi, setDpi] = useState<"72" | "150" | "300">("150");
  const [quality, setQuality] = useState(90);
  const [range, setRange] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  const load = useCallback(async (paths: string[]) => {
    const p = paths.find((x) => extname(x) === "pdf");
    if (!p) return;
    try {
      const bytes = await readBytes(p);
      const doc = await loadPdfJs(bytes);
      const { canvas } = await renderPage(doc, 1, 0.6);
      const preview = URL.createObjectURL(await canvasToBlob(canvas, "image/jpeg", 0.85));
      setFile((old) => {
        closePdfJs(old?.doc);
        return { path: p, size: bytes.length, doc, preview };
      });
    } catch (e) {
      errorToast(e);
    }
  }, []);
  useFileDrop(load);
  useEffect(
    () => () => {
      if (file?.preview) URL.revokeObjectURL(file.preview);
    },
    [file],
  );

  const exportImages = async () => {
    if (!file) return;
    const pages = range.trim() ? parsePageRanges(range, file.doc.numPages) : [...Array(file.doc.numPages).keys()];
    if (!pages) return toast("Invalid page range. Example: 1-3, 5", "error");
    const dir = await open({ directory: true, defaultPath: dirname(file.path) });
    if (!dir) return;
    setProgress(0);
    try {
      const pad = String(file.doc.numPages).length;
      let first = "";
      for (const [i, index] of pages.entries()) {
        const { canvas } = await renderPage(file.doc, index + 1, Number(dpi) / 72);
        const bytes = await canvasToBytes(canvas, format === "png" ? "image/png" : "image/jpeg", quality / 100);
        const out = joinPath(dir, `${stem(file.path)}-${String(index + 1).padStart(pad, "0")}.${format}`);
        await writeBytes(out, bytes);
        canvas.width = canvas.height = 0; // release canvas memory right away
        first ||= out;
        setProgress(((i + 1) / pages.length) * 100);
      }
      savedToast(first, `Exported ${pages.length} image${pages.length === 1 ? "" : "s"}`);
    } catch (e) {
      errorToast(e);
    } finally {
      setProgress(null);
    }
  };

  return (
    <ToolLayout
      main={
        !file ? (
          <EmptyDrop title="Drop a PDF to export pages as images" hint="PNG or JPG, up to 300 DPI" onClick={async () => load(await pickPdfs(false))} />
        ) : (
          <div className="flex items-start gap-6">
            <div className="w-56 shrink-0 overflow-hidden rounded-xl border border-line bg-white shadow-xl">
              {file.preview ? <img src={file.preview} className="w-full" /> : <FileText className="m-auto my-16 text-neutral-400" />}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-semibold">{basename(file.path)}</div>
                  <div className="mt-1 text-muted">
                    {file.doc.numPages} pages · {fmtBytes(file.size)}
                  </div>
                </div>
                <IconButton title="Close" onClick={() => setFile(null)}>
                  <X size={16} />
                </IconButton>
              </div>
              {progress != null && (
                <div className="mt-6 space-y-2">
                  <ProgressBar value={progress} />
                  <div className="text-[12.5px] text-muted">Rendering… {Math.floor(progress)}%</div>
                </div>
              )}
            </div>
          </div>
        )
      }
      side={
        <>
          <Field label="Format">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: "png", label: "PNG" },
                { value: "jpg", label: "JPG" },
              ]}
            />
          </Field>
          {format === "jpg" && (
            <Field label="Quality" hint={`${quality}%`}>
              <Slider value={quality} min={40} max={100} onChange={setQuality} />
            </Field>
          )}
          <Field label="Resolution">
            <Segmented
              value={dpi}
              onChange={setDpi}
              options={[
                { value: "72", label: "72 DPI" },
                { value: "150", label: "150 DPI" },
                { value: "300", label: "300 DPI" },
              ]}
            />
          </Field>
          <Field label="Pages">
            <TextInput placeholder="All pages, or e.g. 1-3, 5" value={range} onChange={(e) => setRange(e.target.value)} />
          </Field>
        </>
      }
      footer={
        <Button variant="primary" size="lg" className="w-full" disabled={!file || progress != null} onClick={exportImages}>
          {progress != null ? <Loader2 size={17} className="animate-spin" /> : <FileImage size={17} />} Export images
        </Button>
      }
    />
  );
}
