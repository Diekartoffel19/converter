import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { DropOverlay, SECTIONS, Sidebar, TitleBar, Toasts, type SectionId } from "./components/Shell";
import { detectHwEncoders, type JobProgress } from "./lib/tauri";
import { ConverterPage } from "./pages/ConverterPage";
import { PdfPage } from "./pages/PdfPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useDrop } from "./store/drop";
import { useQueue } from "./store/queue";
import { useSettings } from "./store/settings";

function useTheme() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

export default function App() {
  const [section, setSection] = useState<SectionId>("image");
  useTheme();

  useEffect(() => {
    // Disable the webview's default context menu and Ctrl+R style reloads in the packaged app
    const noMenu = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
    };
    window.addEventListener("contextmenu", noMenu);

    detectHwEncoders()
      .then((hwEncoders) => useSettings.getState().set({ hwEncoders }))
      .catch(() => useSettings.getState().set({ hwEncoders: [] }));

    const unProgress = listen<JobProgress>("job-progress", ({ payload }) => {
      const { update, items } = useQueue.getState();
      if (items.find((i) => i.id === payload.id)?.status === "running") update(payload.id, { progress: payload.percent, speed: payload.speed });
    });
    const unDrop = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "enter" || payload.type === "over") useDrop.setState({ hovering: true });
      else if (payload.type === "leave") useDrop.setState({ hovering: false });
      else if (payload.type === "drop") {
        useDrop.setState({ hovering: false });
        useDrop.getState().handler?.(payload.paths);
      }
    });
    return () => {
      window.removeEventListener("contextmenu", noMenu);
      unProgress.then((f) => f());
      unDrop.then((f) => f());
    };
  }, []);

  const current = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="flex h-full flex-col" style={{ ["--accent" as string]: current.accent }}>
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={section} onSelect={setSection} />
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-tl-2xl border-l border-t border-line bg-panel/40">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="h-full"
            >
              {section === "pdf" ? (
                <PdfPage />
              ) : section === "settings" ? (
                <SettingsPage />
              ) : (
                <ConverterPage kind={section} title={current.title} subtitle={current.subtitle} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <DropOverlay />
      <Toasts />
    </div>
  );
}
