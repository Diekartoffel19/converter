import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { motion } from "motion/react";
import { UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "../../store/toast";

export function EmptyDrop({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className="group flex h-full min-h-[300px] w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-line-strong bg-panel/50 transition-colors hover:border-accent/60 hover:bg-accent/5 cursor-pointer"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent transition-transform group-hover:-translate-y-1">
        <UploadCloud size={30} />
      </div>
      <div className="text-center">
        <div className="text-[17px] font-semibold">{title}</div>
        <div className="mt-1 text-muted">{hint}</div>
      </div>
    </motion.button>
  );
}

/** Two-column tool layout: content on the left, options + action on the right. */
export function ToolLayout({ main, side, footer }: { main: ReactNode; side?: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 border-t border-line">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-6">{main}</div>
      <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-panel/60">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">{side}</div>
        <div className="space-y-2 border-t border-line p-5">{footer}</div>
      </aside>
    </div>
  );
}

export function savedToast(path: string, message = "Saved") {
  toast(`${message} — ${path.split(/[\\/]/).pop()}`, "success", { label: "Show", run: () => revealItemInDir(path) });
}

export function errorToast(e: unknown) {
  console.error(e);
  const msg = String(e instanceof Error ? e.message : e);
  toast(/encrypted/i.test(msg) ? "This PDF is password-protected" : msg.slice(0, 160), "error");
}
