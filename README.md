# Velum PDF

A modern, local-first PDF reader for Windows, macOS and Linux.

## What is already here

- Drag & drop PDF opening
- PDF.js rendering
- Page navigation
- Zoom controls
- Thumbnail-ready architecture
- Recent documents stored locally
- Dark / light theme toggle
- Responsive, minimal UI
- Tauri 2 desktop shell
- No account, no cloud upload
- GitHub Actions build pipeline for Windows/macOS/Linux

## Run locally

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm run tauri:build
```

### Important

You do not need Visual Studio as an IDE. Tauri's Windows build still requires Microsoft's C++ build toolchain because Rust ultimately links a native Windows application. If you don't want to install any native toolchain locally, push this repo to GitHub: the included workflow builds Windows, macOS and Linux installers for you.

## GitHub build

Push the repository to GitHub. The workflow in `.github/workflows/build.yml` builds:

- Windows: `.msi` / `.exe`
- macOS: `.dmg`
- Linux: `.AppImage` / `.deb`
