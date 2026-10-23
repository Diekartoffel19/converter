import { motion } from "motion/react";
import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, cx } from "../../components/ui";

const INKS = ["#111827", "#1d4ed8", "#b91c1c"];

/** Modal drawing pad; resolves with a tightly cropped transparent PNG. */
export function SignaturePad({ onDone, onCancel }: { onDone: (png: { url: string; bytes: Uint8Array; width: number; height: number }) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ink, setInk] = useState(INKS[0]);
  const [empty, setEmpty] = useState(true);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const draw = (e: React.PointerEvent) => {
    if (!last.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    // pressure-ish width: faster strokes are thinner
    const dist = Math.hypot(p.x - last.current.x, p.y - last.current.y);
    ctx.lineWidth = Math.max(1.6, 3.4 - dist * 0.08);
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setEmpty(false);
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  const finish = async () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let [minX, minY, maxX, maxY] = [width, height, 0, 0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const pad = 6;
    const w = Math.min(width, maxX + pad) - Math.max(0, minX - pad);
    const h = Math.min(height, maxY + pad) - Math.max(0, minY - pad);
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d")!.drawImage(c, Math.max(0, minX - pad), Math.max(0, minY - pad), w, h, 0, 0, w, h);
    const blob = await new Promise<Blob>((r) => out.toBlob((b) => r(b!), "image/png"));
    onDone({ url: URL.createObjectURL(blob), bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm" onPointerDown={onCancel}>
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-[620px] rounded-3xl border border-line-strong bg-panel p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Draw your signature</h2>
          <div className="flex items-center gap-2">
            {INKS.map((c) => (
              <button
                key={c}
                onClick={() => setInk(c)}
                style={{ background: c }}
                className={cx("h-6 w-6 rounded-full border-2 cursor-pointer", ink === c ? "border-accent" : "border-transparent")}
              />
            ))}
          </div>
        </div>
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="h-[220px] w-full touch-none rounded-2xl bg-white cursor-crosshair"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              last.current = point(e);
            }}
            onPointerMove={draw}
            onPointerUp={() => (last.current = null)}
          />
          <div className="pointer-events-none absolute inset-x-10 bottom-12 border-b border-dashed border-neutral-300" />
          {empty && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-neutral-400">Sign here with your mouse or pen</div>}
        </div>
        <div className="mt-5 flex justify-between">
          <Button variant="ghost" onClick={clear}>
            <Eraser size={15} /> Clear
          </Button>
          <div className="flex gap-2">
            <Button onClick={onCancel}>Cancel</Button>
            <Button variant="primary" disabled={empty} onClick={finish}>
              Use signature
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
