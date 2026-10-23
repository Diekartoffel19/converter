import { open } from "@tauri-apps/plugin-dialog";
import { AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, FolderOpen, Hash, ImagePlus, Loader2, PenLine, Save, Stamp, Trash2, Type, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { degrees, rgb, StandardFonts } from "pdf-lib";
import { Button, cx, Field, IconButton, Segmented, Slider, TextInput, Toggle } from "../../components/ui";
import { basename, dirname, extname, joinPath, uid } from "../../lib/format";
import { closePdfJs, canvasToBlob, imageForPdf, loadPdfJs, loadPdfLib, pdfName, pickPdfs, pickSavePath, readBytes, renderPage, writeBytes, type PdfJsDoc } from "../../lib/pdf";
import { useFileDrop } from "../../store/drop";
import { EmptyDrop, errorToast, savedToast, ToolLayout } from "./common";
import { SignaturePad } from "./SignaturePad";

/** Overlay geometry is stored in PDF.js viewport units at scale 1 (top-left origin, as displayed). */
interface Overlay {
  id: string;
  page: number;
  kind: "text" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  size?: number;
  color?: string;
  src?: string;
  bytes?: Uint8Array;
  type?: "png" | "jpg";
}

const COLORS = ["#111827", "#1d4ed8", "#b91c1c", "#047857", "#7c3aed"];
const LINE_HEIGHT = 1.2;
// Distance from the top of a CSS line box (line-height 1.2) to the Helvetica/Arial baseline, in ems
const BASELINE = (LINE_HEIGHT - 1.117) / 2 + 0.905;
const RENDER_SCALE = 2;

const hexToRgb = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

export function SignTool() {
  const [path, setPath] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageImg, setPageImg] = useState<{ url: string; w: number; h: number } | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [pageNumbers, setPageNumbers] = useState({ enabled: false, position: "center" as "center" | "right" });
  const [watermark, setWatermark] = useState({ enabled: false, text: "CONFIDENTIAL", opacity: 0.15 });
  const [busy, setBusy] = useState(false);
  const [containerW, setContainerW] = useState(800);
  const docRef = useRef<PdfJsDoc | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (paths: string[]) => {
    const p = paths.find((x) => extname(x) === "pdf");
    if (!p) return;
    try {
      const data = await readBytes(p);
      const doc = await loadPdfJs(data);
      closePdfJs(docRef.current);
      docRef.current = doc;
      setPath(p);
      setBytes(data);
      setPageCount(doc.numPages);
      setPage(1);
      setOverlays([]);
      setSelectedId(null);
    } catch (e) {
      errorToast(e);
    }
  }, []);
  useFileDrop(load);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    let url = "";
    let cancelled = false;
    renderPage(doc, page, RENDER_SCALE).then(async ({ canvas, viewport }) => {
      if (cancelled) return;
      url = URL.createObjectURL(await canvasToBlob(canvas, "image/png"));
      setPageImg({ url, w: viewport.width / RENDER_SCALE, h: viewport.height / RENDER_SCALE });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bytes, page]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [path]);

  const ds = pageImg ? Math.min((containerW - 8) / pageImg.w, 1.6) : 1;
  const selected = overlays.find((o) => o.id === selectedId) ?? null;
  const update = (id: string, patch: Partial<Overlay>) => setOverlays((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const removeOverlay = (id: string) => {
    setOverlays((list) => list.filter((o) => o.id !== id));
    setSelectedId(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) removeOverlay(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const addOverlay = (o: Omit<Overlay, "id" | "page" | "x" | "y">) => {
    if (!pageImg) return;
    const id = uid();
    setOverlays((list) => [...list, { ...o, id, page, x: (pageImg.w - o.w) / 2, y: (pageImg.h - o.h) / 2 }]);
    setSelectedId(id);
  };

  const addText = () => addOverlay({ kind: "text", text: "Your text", size: 16, color: COLORS[0], w: 0, h: 0 });

  const addImage = async () => {
    const picked = await open({ filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"] }] });
    if (!picked) return;
    try {
      const img = await imageForPdf(picked);
      const src = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: img.type === "png" ? "image/png" : "image/jpeg" }));
      const el = new Image();
      el.src = src;
      await el.decode();
      const w = Math.min(200, (pageImg?.w ?? 400) * 0.5);
      addOverlay({ kind: "image", src, bytes: img.bytes, type: img.type, w, h: (w * el.naturalHeight) / el.naturalWidth });
    } catch (e) {
      errorToast(e);
    }
  };

  // ----- move / resize -----
  const gesture = useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; o: Overlay } | null>(null);
  const startGesture = (e: React.PointerEvent, o: Overlay, mode: "move" | "resize") => {
    e.stopPropagation();
    setSelectedId(o.id);
    gesture.current = { id: o.id, mode, sx: e.clientX, sy: e.clientY, o };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moveGesture = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = (e.clientX - g.sx) / ds;
    const dy = (e.clientY - g.sy) / ds;
    if (g.mode === "move") update(g.id, { x: g.o.x + dx, y: g.o.y + dy });
    else if (g.o.kind === "image") {
      const w = Math.max(16, g.o.w + dx);
      update(g.id, { w, h: (w * g.o.h) / g.o.w });
    } else update(g.id, { size: Math.max(6, Math.round((g.o.size ?? 16) + dy / 2)) });
  };
  const endGesture = () => (gesture.current = null);

  // ----- save -----
  const save = async () => {
    const doc = docRef.current;
    if (!doc || !bytes || !path) return;
    const target = await pickSavePath(joinPath(dirname(path), pdfName(path, "-signed")));
    if (!target) return;
    setBusy(true);
    try {
      const lib = await loadPdfLib(bytes);
      const font = await lib.embedFont(StandardFonts.Helvetica);
      const bold = await lib.embedFont(StandardFonts.HelveticaBold);
      const pages = lib.getPages();

      for (const o of overlays) {
        const pdfPage = pages[o.page - 1];
        const vp = (await doc.getPage(o.page)).getViewport({ scale: 1 });
        if (o.kind === "text" && o.text) {
          const size = o.size ?? 16;
          o.text.split("\n").forEach((line, k) => {
            const [x, y] = vp.convertToPdfPoint(o.x, o.y + k * size * LINE_HEIGHT + BASELINE * size);
            pdfPage.drawText(line, { x, y, size, font, color: hexToRgb(o.color ?? "#000000") });
          });
        } else if (o.kind === "image" && o.bytes) {
          const img = o.type === "png" ? await lib.embedPng(o.bytes) : await lib.embedJpg(o.bytes);
          const [x1, y1] = vp.convertToPdfPoint(o.x, o.y + o.h);
          const [x2, y2] = vp.convertToPdfPoint(o.x + o.w, o.y);
          pdfPage.drawImage(img, { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
        }
      }

      pages.forEach((p, i) => {
        const { width, height } = p.getSize();
        if (pageNumbers.enabled) {
          const label = `${i + 1}`;
          const tw = font.widthOfTextAtSize(label, 10);
          p.drawText(label, { x: pageNumbers.position === "center" ? (width - tw) / 2 : width - tw - 36, y: 24, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
        }
        if (watermark.enabled && watermark.text.trim()) {
          const size = Math.min(width, height) / 9;
          const tw = bold.widthOfTextAtSize(watermark.text, size);
          const a = Math.PI / 4;
          // center the rotated text on the page
          const x = width / 2 - (tw / 2) * Math.cos(a) + (size / 3) * Math.sin(a);
          const y = height / 2 - (tw / 2) * Math.sin(a) - (size / 3) * Math.cos(a);
          p.drawText(watermark.text, { x, y, size, font: bold, rotate: degrees(45), color: rgb(0.5, 0.5, 0.5), opacity: watermark.opacity });
        }
      });

      await writeBytes(target, await lib.save());
      savedToast(target);
    } catch (e) {
      if (/WinAnsi cannot encode/i.test(String(e))) errorToast("Text contains characters the built-in PDF font can't write (e.g. emoji or non-Latin script).");
      else errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  if (!path) {
    return <ToolLayout main={<EmptyDrop title="Drop a PDF to sign or annotate" hint="Add text, signatures, images, page numbers and watermarks" onClick={async () => load(await pickPdfs(false))} />} footer={null} />;
  }

  const onPage = overlays.filter((o) => o.page === page);

  return (
    <>
      <ToolLayout
        main={
          <div className="flex min-h-full flex-col">
            <div className="sticky top-0 z-10 -mx-2 mb-4 flex items-center gap-1 rounded-2xl border border-line bg-panel/90 p-1.5 backdrop-blur">
              <Button size="sm" variant="ghost" onClick={addText}>
                <Type size={15} /> Text
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPadOpen(true)}>
                <PenLine size={15} /> Signature
              </Button>
              <Button size="sm" variant="ghost" onClick={addImage}>
                <ImagePlus size={15} /> Image
              </Button>
              <div className="flex-1" />
              <IconButton title="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={16} />
              </IconButton>
              <span className="w-20 text-center text-[13px] tabular-nums text-muted">
                {page} / {pageCount}
              </span>
              <IconButton title="Next page" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={16} />
              </IconButton>
              <div className="mx-1 h-5 w-px bg-line-strong" />
              <IconButton title="Close file" onClick={() => setPath(null)}>
                <X size={16} />
              </IconButton>
            </div>
            <div ref={containerRef} className="flex flex-1 justify-center pb-6" onPointerDown={() => setSelectedId(null)}>
              {pageImg ? (
                <div className="relative shadow-2xl" style={{ width: pageImg.w * ds, height: pageImg.h * ds }}>
                  <img src={pageImg.url} className="h-full w-full bg-white" draggable={false} />
                  {watermark.enabled && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                      <span className="-rotate-45 font-bold text-neutral-500" style={{ fontSize: (Math.min(pageImg.w, pageImg.h) / 9) * ds, opacity: watermark.opacity, fontFamily: "Helvetica, Arial" }}>
                        {watermark.text}
                      </span>
                    </div>
                  )}
                  {pageNumbers.enabled && (
                    <span
                      className="pointer-events-none absolute text-neutral-600"
                      style={{ bottom: 18 * ds, fontSize: 10 * ds, fontFamily: "Helvetica, Arial", ...(pageNumbers.position === "center" ? { left: "50%", transform: "translateX(-50%)" } : { right: 36 * ds }) }}
                    >
                      {page}
                    </span>
                  )}
                  {onPage.map((o) => (
                    <div
                      key={o.id}
                      onPointerDown={(e) => startGesture(e, o, "move")}
                      onPointerMove={moveGesture}
                      onPointerUp={endGesture}
                      className={cx("absolute cursor-move touch-none outline-offset-2", o.id === selectedId ? "outline-2 outline-dashed outline-[var(--accent)]" : "hover:outline-1 hover:outline-dashed hover:outline-neutral-400")}
                      style={{ left: o.x * ds, top: o.y * ds, ...(o.kind === "image" ? { width: o.w * ds, height: o.h * ds } : {}) }}
                    >
                      {o.kind === "text" ? (
                        <div style={{ fontSize: (o.size ?? 16) * ds, color: o.color, lineHeight: LINE_HEIGHT, fontFamily: "Helvetica, Arial", whiteSpace: "pre" }}>{o.text || " "}</div>
                      ) : (
                        <img src={o.src} className="h-full w-full" draggable={false} />
                      )}
                      {o.id === selectedId && (
                        <span
                          onPointerDown={(e) => startGesture(e, o, "resize")}
                          onPointerMove={moveGesture}
                          onPointerUp={endGesture}
                          title={o.kind === "image" ? "Drag to resize" : "Drag to change size"}
                          className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-accent shadow"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Loader2 className="mt-20 animate-spin text-muted" />
              )}
            </div>
          </div>
        }
        side={
          <>
            {selected ? (
              <Field label={selected.kind === "text" ? "Text" : "Image"} hint={<span className="text-muted">page {selected.page}</span>}>
                {selected.kind === "text" && (
                  <>
                    <textarea
                      value={selected.text}
                      autoFocus
                      onChange={(e) => update(selected.id, { text: e.target.value })}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-line bg-panel-2 p-3 outline-none focus:border-accent"
                    />
                    <div className="flex items-center gap-3">
                      <span className="w-14 text-[12px] text-muted">{selected.size}pt</span>
                      <Slider value={selected.size ?? 16} min={6} max={72} onChange={(size) => update(selected.id, { size })} />
                    </div>
                    <div className="flex gap-2">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => update(selected.id, { color: c })}
                          style={{ background: c }}
                          className={cx("h-7 w-7 rounded-full border-2 cursor-pointer", selected.color === c ? "border-accent" : "border-line")}
                        />
                      ))}
                    </div>
                  </>
                )}
                <Button variant="danger" size="sm" className="w-full" onClick={() => removeOverlay(selected.id)}>
                  <Trash2 size={14} /> Remove
                </Button>
              </Field>
            ) : (
              <div className="rounded-xl bg-panel-2 p-4 text-[12.5px] leading-relaxed text-muted">
                Add text, a signature or an image from the toolbar, then drag it into place. Drag the round handle to resize. Press Delete to remove.
                {overlays.length > 0 && <div className="mt-2 text-fg">{overlays.length} item{overlays.length === 1 ? "" : "s"} added</div>}
              </div>
            )}
            <Field label="Page numbers" hint={<Hash size={12} />}>
              <Toggle checked={pageNumbers.enabled} onChange={(enabled) => setPageNumbers((p) => ({ ...p, enabled }))} label="Number every page" />
              {pageNumbers.enabled && (
                <Segmented
                  value={pageNumbers.position}
                  onChange={(position) => setPageNumbers((p) => ({ ...p, position }))}
                  options={[
                    { value: "center", label: "Bottom center" },
                    { value: "right", label: "Bottom right" },
                  ]}
                />
              )}
            </Field>
            <Field label="Watermark" hint={<Stamp size={12} />}>
              <Toggle checked={watermark.enabled} onChange={(enabled) => setWatermark((w) => ({ ...w, enabled }))} label="Add watermark" />
              {watermark.enabled && (
                <>
                  <TextInput value={watermark.text} onChange={(e) => setWatermark((w) => ({ ...w, text: e.target.value }))} />
                  <div className="flex items-center gap-3">
                    <span className="w-14 text-[12px] text-muted">{Math.round(watermark.opacity * 100)}%</span>
                    <Slider value={watermark.opacity * 100} min={5} max={60} onChange={(v) => setWatermark((w) => ({ ...w, opacity: v / 100 }))} />
                  </div>
                </>
              )}
            </Field>
          </>
        }
        footer={
          <>
            <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={save}>
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Save PDF
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={async () => load(await pickPdfs(false))}>
              <FolderOpen size={14} /> {basename(path)}
            </Button>
          </>
        }
      />
      <AnimatePresence>
        {padOpen && (
          <SignaturePad
            onCancel={() => setPadOpen(false)}
            onDone={(sig) => {
              setPadOpen(false);
              const w = Math.min(180, sig.width / 2);
              addOverlay({ kind: "image", src: sig.url, bytes: sig.bytes, type: "png", w, h: (w * sig.height) / sig.width });
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
