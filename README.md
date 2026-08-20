# Velum 2.2 — Infinite Canvas Edition

A polished, local-first desktop PDF reader built with React, TypeScript, Vite, Tauri 2 and PDF.js.

## What changed

### Reading engine
- Continuous vertical canvas-style page stack instead of a single-page repaint.
- Lazy page rendering with IntersectionObserver and a generous pre-render window.
- Hardware-accelerated PDF.js mode enabled where supported.
- Pages render to real DOM canvases with device-pixel-ratio awareness.
- Smooth native scrolling, overscroll containment, custom scrollbars and space-drag panning.
- Trackpad / wheel zoom using Cmd/Ctrl + wheel.
- Page-aware navigation as you scroll.

### UI
- Reworked top command bar and document chrome.
- Scrollable thumbnail rail.
- Recent-document launch surface.
- Search modal with local text extraction.
- Command palette.
- Bookmarks.
- Reader settings for page spacing and zoom mode.
- Dark/light appearance.
- Drag & drop PDF intake.

## Build

```bash
npm install
npm run typecheck
npm run build
npm run tauri:build
```

CI builds Windows x64, macOS Apple Silicon, macOS Intel and Linux x64.
