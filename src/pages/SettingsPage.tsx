import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { Cpu, FolderOpen } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "../components/Shell";
import { Button, Card, cx, Segmented, Slider, Toggle } from "../components/ui";
import { useSettings, type Theme } from "../store/settings";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <Card className="divide-y divide-line">{children}</Card>
    </div>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("px-5 py-4", className)}>{children}</div>;
}

export function SettingsPage() {
  const s = useSettings();
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  const pickDir = async () => {
    const dir = await open({ directory: true });
    if (dir) s.set({ outputDir: dir });
  };
  const hwLabel = s.hwEncoders == null ? "Detecting…" : s.hwEncoders.length ? s.hwEncoders.map((e) => e.toUpperCase()).join(", ") : "No supported GPU encoder found";
  const cores = navigator.hardwareConcurrency || 4;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-7 px-8 pb-12 pt-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight">Settings</h1>
          <p className="mt-0.5 text-muted">Output, performance and appearance</p>
        </div>

        <Section title="Output">
          <Row className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium">Default output folder</div>
              <div className="truncate text-[12.5px] text-muted">{s.outputDir ?? "Same folder as the original file"}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              {s.outputDir && (
                <Button size="sm" variant="ghost" onClick={() => s.set({ outputDir: null })}>
                  Reset
                </Button>
              )}
              <Button size="sm" onClick={pickDir}>
                <FolderOpen size={14} /> Choose
              </Button>
            </div>
          </Row>
        </Section>

        <Section title="Performance">
          <Row>
            <Toggle
              checked={s.gpu}
              onChange={(gpu) => s.set({ gpu })}
              label="GPU acceleration"
              description="Use the graphics card for H.264 / H.265 video. Much faster, slightly larger files."
            />
            <div className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
              <Cpu size={14} /> {hwLabel}
            </div>
          </Row>
          <Row className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-medium">Parallel conversions</div>
                <div className="text-[12.5px] text-muted">How many files convert at once. Video encoders already use all cores.</div>
              </div>
              <span className="text-[15px] font-semibold tabular-nums text-accent">{s.concurrency}</span>
            </div>
            <Slider value={s.concurrency} min={1} max={Math.max(2, Math.min(8, cores))} onChange={(concurrency) => s.set({ concurrency })} />
          </Row>
        </Section>

        <Section title="Appearance">
          <Row className="flex items-center justify-between gap-4">
            <div className="font-medium">Theme</div>
            <div className="w-72">
              <Segmented<Theme>
                value={s.theme}
                onChange={(theme) => s.set({ theme })}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                  { value: "system", label: "System" },
                ]}
              />
            </div>
          </Row>
        </Section>

        <Section title="About">
          <Row className="flex items-center gap-4">
            <Logo size={44} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Morph {version}</div>
              <div className="text-[12.5px] text-muted">
                Media conversion powered by FFmpeg (GPL build, ffmpeg.org). PDF tools powered by pdf-lib and PDF.js.
              </div>
            </div>
          </Row>
        </Section>
      </div>
    </div>
  );
}
