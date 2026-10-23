import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, Reorder } from "motion/react";
import { FileDown, GripVertical, Loader2, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { PageSizes, PDFDocument } from "pdf-lib";
import { Button, Field, IconButton, Segmented } from "../../components/ui";
import { basename, dirname, extname, joinPath, stem, uid } from "../../lib/format";
import { imageForPdf, pickSavePath, writeBytes } from "../../lib/pdf";
import { useFileDrop } from "../../store/drop";
import { EmptyDrop, errorToast, savedToast, ToolLayout } from "./common";

const EXTS = ["png", "jpg", "jpeg", "jfif", "webp", "gif", "bmp", "avif", "ico"];

type PageSize = "fit" | "a4" | "letter";
type Orientation = "auto" | "portrait" | "landscape";

interface Img {
  id: string;
  path: string;
}

export function ImagesToPdfTool() {
  const [images, setImages] = useState<Img[]>([]);
  const [size, setSize] = useState<PageSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [margin, setMargin] = useState<"0" | "24" | "48">("24");
  const [busy, setBusy] = useState(false);

  const add = useCallback((paths: string[]) => {
    const ok = paths.filter((p) => EXTS.includes(extname(p)));
    setImages((prev) => [...prev, ...ok.map((path) => ({ id: uid(), path }))]);
  }, []);
  useFileDrop(add);

  const browse = async () => {
    const picked = await open({ multiple: true, filters: [{ name: "Images", extensions: EXTS }] });
    if (picked) add(picked);
  };

  const build = async () => {
    const target = await pickSavePath(joinPath(dirname(images[0].path), images.length === 1 ? `${stem(images[0].path)}.pdf` : "images.pdf"));
    if (!target) return;
    setBusy(true);
    try {
      const doc = await PDFDocument.create();
      const m = Number(margin);
      for (const { path } of images) {
        const { bytes, type } = await imageForPdf(path);
        const img = type === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        let [pw, ph] = size === "fit" ? [img.width + m * 2, img.height + m * 2] : size === "a4" ? PageSizes.A4 : PageSizes.Letter;
        const landscape = orientation === "landscape" || (orientation === "auto" && img.width > img.height);
        if (size !== "fit" && landscape !== pw > ph) [pw, ph] = [ph, pw];
        const page = doc.addPage([pw, ph]);
        // contain the image inside the margins, never upscaling past 1:1 on fitted pages
        const scale = Math.min((pw - m * 2) / img.width, (ph - m * 2) / img.height, size === "fit" ? 1 : Infinity);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      }
      doc.setProducer("Morph");
      await writeBytes(target, await doc.save());
      savedToast(target, `Created PDF with ${images.length} page${images.length === 1 ? "" : "s"}`);
    } catch (e) {
      errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolLayout
      main={
        images.length === 0 ? (
          <EmptyDrop title="Drop images to make a PDF" hint="One page per image · drag to reorder" onClick={browse} />
        ) : (
          <div className="space-y-2">
            <Reorder.Group axis="y" values={images} onReorder={setImages} className="space-y-2">
              <AnimatePresence initial={false}>
                {images.map((img, i) => (
                  <Reorder.Item
                    key={img.id}
                    value={img}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    whileDrag={{ scale: 1.02, boxShadow: "0 12px 30px rgb(0 0 0 / 0.35)" }}
                    className="group flex cursor-grab items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5 active:cursor-grabbing"
                  >
                    <GripVertical size={16} className="shrink-0 text-muted" />
                    <span className="w-5 shrink-0 text-center text-[12px] font-semibold text-muted">{i + 1}</span>
                    <img src={convertFileSrc(img.path)} className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover" draggable={false} />
                    <span className="min-w-0 flex-1 truncate font-medium">{basename(img.path)}</span>
                    <IconButton title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => setImages((prev) => prev.filter((x) => x.id !== img.id))}>
                      <X size={16} />
                    </IconButton>
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
            <Button variant="ghost" size="sm" onClick={browse}>
              <Plus size={15} /> Add images
            </Button>
          </div>
        )
      }
      side={
        <>
          <Field label="Page size">
            <Segmented<PageSize>
              value={size}
              onChange={setSize}
              options={[
                { value: "a4", label: "A4" },
                { value: "letter", label: "Letter" },
                { value: "fit", label: "Fit image" },
              ]}
            />
          </Field>
          <Field label="Orientation">
            <Segmented<Orientation>
              value={orientation}
              onChange={setOrientation}
              options={[
                { value: "auto", label: "Auto", disabled: size === "fit" },
                { value: "portrait", label: "Portrait", disabled: size === "fit" },
                { value: "landscape", label: "Landscape", disabled: size === "fit" },
              ]}
            />
          </Field>
          <Field label="Margin">
            <Segmented
              value={margin}
              onChange={setMargin}
              options={[
                { value: "0", label: "None" },
                { value: "24", label: "Small" },
                { value: "48", label: "Large" },
              ]}
            />
          </Field>
        </>
      }
      footer={
        <Button variant="primary" size="lg" className="w-full" disabled={!images.length || busy} onClick={build}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <FileDown size={17} />} Create PDF
        </Button>
      }
    />
  );
}
