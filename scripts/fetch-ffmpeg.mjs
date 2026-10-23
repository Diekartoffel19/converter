// Downloads a static FFmpeg build and places it where Tauri expects
// sidecar binaries: src-tauri/binaries/ffmpeg-<target-triple>.exe (probing also uses ffmpeg, no ffprobe)
import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(root, "src-tauri", "binaries");
const URL = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";

const triple = execSync("rustc -vV").toString().match(/host: (\S+)/)[1];
const targets = ["ffmpeg"].map((n) => join(binDir, `${n}-${triple}.exe`));

if (targets.every(existsSync) && !process.argv.includes("--force")) {
  console.log("[ffmpeg] already present, skipping");
  process.exit(0);
}

mkdirSync(binDir, { recursive: true });
const work = join(tmpdir(), `morph-ffmpeg-${Date.now()}`);
mkdirSync(work, { recursive: true });
const zip = join(work, "ffmpeg.zip");

console.log(`[ffmpeg] downloading ${URL}`);
const res = await fetch(URL);
if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));

console.log("[ffmpeg] extracting");
// Use Windows' bundled bsdtar (handles .zip); GNU tar from Git Bash may shadow it on PATH
const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
execSync(`"${tar}" -xf "${zip}" -C "${work}"`);

function find(dir, name) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      const hit = find(p, name);
      if (hit) return hit;
    } else if (entry.toLowerCase() === name) return p;
  }
  return null;
}

for (const [i, name] of ["ffmpeg.exe"].entries()) {
  const src = find(work, name);
  if (!src) throw new Error(`${name} not found in archive`);
  renameSync(src, targets[i]);
}
rmSync(work, { recursive: true, force: true });
console.log(`[ffmpeg] installed to ${binDir}`);
