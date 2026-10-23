import { motion } from "motion/react";
import { FileImage, Images, LayoutGrid, Merge, PenLine, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cx } from "../components/ui";
import { MergeTool } from "./pdf/MergeTool";
import { OrganizeTool } from "./pdf/OrganizeTool";
import { SignTool } from "./pdf/SignTool";
import { ImagesToPdfTool } from "./pdf/ImagesToPdfTool";
import { PdfToImagesTool } from "./pdf/PdfToImagesTool";

type ToolId = "merge" | "organize" | "sign" | "from-images" | "to-images";

const TOOLS: { id: ToolId; label: string; icon: LucideIcon }[] = [
  { id: "merge", label: "Merge", icon: Merge },
  { id: "organize", label: "Organize & split", icon: LayoutGrid },
  { id: "sign", label: "Sign & annotate", icon: PenLine },
  { id: "from-images", label: "Images → PDF", icon: Images },
  { id: "to-images", label: "PDF → Images", icon: FileImage },
];

export function PdfPage() {
  const [tool, setTool] = useState<ToolId>("merge");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-8 pb-4 pt-4">
        <h1 className="font-display text-[26px] font-semibold tracking-tight">PDF tools</h1>
        <p className="mt-0.5 text-muted">Merge, organize, sign and convert PDFs — everything stays on your PC</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={cx(
                "relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-colors cursor-pointer",
                tool === t.id ? "text-fg" : "text-muted hover:bg-hover hover:text-fg",
              )}
            >
              {tool === t.id && (
                <motion.span layoutId="pdf-tool" className="absolute inset-0 rounded-xl border border-accent/30 bg-accent/12" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />
              )}
              <t.icon size={16} className={cx("relative", tool === t.id && "text-accent")} />
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {tool === "merge" && <MergeTool />}
        {tool === "organize" && <OrganizeTool />}
        {tool === "sign" && <SignTool />}
        {tool === "from-images" && <ImagesToPdfTool />}
        {tool === "to-images" && <PdfToImagesTool />}
      </div>
    </div>
  );
}
