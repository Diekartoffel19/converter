# Morph

Desktop app for converting images, video and audio (via a bundled FFmpeg) and for working with PDFs (merge, organize/split, sign/annotate, images ↔ PDF).

Built with Tauri 2, React and TypeScript.

## Download

Grab `Morph_<version>_x64-setup.exe` from the [Releases](https://github.com/Diekartoffel19/converter/releases) page and run it. No admin rights needed. Windows SmartScreen may warn because the installer is unsigned: click "More info" → "Run anyway".

## Requirements (Windows)

- Node.js 20+
- Rust (stable, MSVC toolchain)
- Visual Studio Build Tools with the "Desktop development with C++" workload

## Develop

```sh
npm install
npm run tauri dev
```

The first run downloads a static FFmpeg build into `src-tauri/binaries/` (`scripts/fetch-ffmpeg.mjs`). Run it from PowerShell or cmd: Git Bash's `link` command shadows the MSVC linker.

## Build the installer

```sh
npm run tauri build
```

Installers are written to `src-tauri/target/release/bundle/nsis/` (`.exe` setup) and `bundle/msi/`.

## Layout

- `src-tauri/src/media.rs`: probing, thumbnails and GPU encoder detection through the ffmpeg sidecar
- `src-tauri/src/jobs.rs`: conversion jobs, progress events and cancellation
- `src/lib/presets.ts`: output formats and the ffmpeg arguments for each option
- `src/store/queue.ts`: file queue and the job runner (concurrency, taskbar progress)
- `src/pages/pdf/`: PDF tools (pdf-lib + PDF.js, all running locally)

FFmpeg is licensed under the GPL. The bundled build comes from https://github.com/BtbN/FFmpeg-Builds.
