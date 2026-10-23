import { invoke } from "@tauri-apps/api/core";

export interface MediaInfo {
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
}

export interface JobSpec {
  id: string;
  input: string;
  inputArgs: string[];
  outputArgs: string[];
  outputDir: string | null;
  ext: string;
  duration: number | null;
}

export interface JobProgress {
  id: string;
  percent: number | null;
  speed: number | null;
}

export const probe = (path: string) => invoke<MediaInfo>("probe", { path });
export const thumbnail = (path: string) => invoke<string>("thumbnail", { path });
export const detectHwEncoders = () => invoke<string[]>("detect_hw_encoders");
/** Resolves with the output path once ffmpeg finishes; rejects with "cancelled" or ffmpeg's error. */
export const startJob = (spec: JobSpec) => invoke<string>("start_job", { spec });
export const cancelJob = (id: string) => invoke<void>("cancel_job", { id });
