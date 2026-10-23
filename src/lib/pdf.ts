import { convertFileSrc } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { degrees, PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { extname, stem } from "./format";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfJsDoc = pdfjs.PDFDocumentProxy;

export async function pickPdfs(multiple: boolean): Promise<string[]> {
  const picked = await open({ multiple, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export async function pickSavePath(defaultName: string, ext = "pdf"): Promise<string | null> {
  return save({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
}

export const readBytes = (path: string) => readFile(path);
export const writeBytes = (path: string, bytes: Uint8Array) => writeFile(path, bytes);

export async function loadPdfLib(bytes: Uint8Array) {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

/** pdf.js takes ownership of (detaches) the buffer it gets, so it always receives a copy. */
export function loadPdfJs(bytes: Uint8Array): Promise<PdfJsDoc> {
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

/** Frees the worker-side document (pdf.js v6 moved destroy() to the loading task). */
export const closePdfJs = (doc: PdfJsDoc | null | undefined) => void doc?.loadingTask.destroy();

/** Renders a page to a canvas at the given scale (1 = 72 dpi), applying an extra rotation. */
export async function renderPage(doc: PdfJsDoc, pageNumber: number, scale: number, extraRotation = 0) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation: (page.rotate + extraRotation) % 360 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return { canvas, viewport, page };
}

export const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), type, quality));

export async function canvasToBytes(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Uint8Array(await (await canvasToBlob(canvas, type, quality)).arrayBuffer());
}

export interface PageRef {
  /** Index into `sources` */
  source: number;
  /** 0-based page index inside that source */
  index: number;
  /** Extra clockwise rotation in degrees (multiple of 90) */
  rotation: number;
}

/** Builds a new PDF from pages of one or more source documents. */
export async function assemble(sources: Uint8Array[], pages: PageRef[], meta?: { title?: string; author?: string }) {
  const out = await PDFDocument.create();
  const loaded = await Promise.all(sources.map(loadPdfLib));
  for (const ref of pages) {
    const [copied] = await out.copyPages(loaded[ref.source], [ref.index]);
    if (ref.rotation) copied.setRotation(degrees((copied.getRotation().angle + ref.rotation) % 360));
    out.addPage(copied);
  }
  if (meta?.title) out.setTitle(meta.title);
  if (meta?.author) out.setAuthor(meta.author);
  out.setProducer("Morph");
  return out.save();
}

const PDF_LIB_IMAGES = ["png", "jpg", "jpeg"];

/** Returns PNG or JPEG bytes for any image the webview can decode (pdf-lib only embeds those two). */
export async function imageForPdf(path: string): Promise<{ bytes: Uint8Array; type: "png" | "jpg" }> {
  const ext = extname(path);
  if (PDF_LIB_IMAGES.includes(ext)) return { bytes: await readFile(path), type: ext === "png" ? "png" : "jpg" };
  const img = new Image();
  img.src = convertFileSrc(path);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return { bytes: await canvasToBytes(canvas, "image/png"), type: "png" };
}

export const pdfName = (path: string, suffix: string) => `${stem(path)}${suffix}.pdf`;
