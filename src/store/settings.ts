import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULTS, type AudioOptions, type ImageOptions, type VideoOptions } from "../lib/presets";

export type Theme = "dark" | "light" | "system";

interface SettingsState {
  theme: Theme;
  /** null = save next to the source file */
  outputDir: string | null;
  concurrency: number;
  gpu: boolean;
  /** Working hardware encoder families, detected once per launch (not persisted). */
  hwEncoders: string[] | null;
  image: ImageOptions;
  video: VideoOptions;
  audio: AudioOptions;
  set: (patch: Partial<Omit<SettingsState, "set" | "setOptions">>) => void;
  setOptions: <K extends "image" | "video" | "audio">(kind: K, patch: Partial<SettingsState[K]>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      outputDir: null,
      concurrency: Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 4))),
      gpu: true,
      hwEncoders: null,
      image: DEFAULTS.image,
      video: DEFAULTS.video,
      audio: DEFAULTS.audio,
      set: (patch) => set(patch),
      setOptions: (kind, patch) => set((s) => ({ [kind]: { ...s[kind], ...patch } }) as Partial<SettingsState>),
    }),
    {
      name: "morph-settings",
      partialize: ({ hwEncoders: _hw, set: _set, setOptions: _so, ...rest }) => rest,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        // Merge option objects key by key so options added in later versions get their defaults
        return {
          ...current,
          ...p,
          image: { ...current.image, ...p.image },
          video: { ...current.video, ...p.video },
          audio: { ...current.audio, ...p.audio },
        };
      },
    },
  ),
);

/** Hardware encoder family to use for H.264/H.265, or null for software encoding. */
export const activeHwEncoder = () => {
  const { gpu, hwEncoders } = useSettings.getState();
  return gpu && hwEncoders?.length ? hwEncoders[0] : null;
};
