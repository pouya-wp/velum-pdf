# Velum

A premium, local-first PDF reader for Windows, macOS and Linux.

Velum is built to feel like a native product instead of an old document utility: quiet chrome, keyboard-first navigation, fast PDF.js rendering, thumbnails, search, bookmarks and a local-only workflow.

## Product surface

- PDF rendering with PDF.js
- Fit page, fit width and 100% modes
- Zoom controls
- Page navigation and keyboard navigation
- Thumbnail rail
- Full-document text search with page previews
- Bookmarks with persistent UI state
- Command palette (`Ctrl/Cmd + K`)
- Open (`Ctrl/Cmd + O`), search (`Ctrl/Cmd + F`), bookmark (`Ctrl/Cmd + B`)
- Drag and drop
- Recent-document metadata
- Dark/light appearance
- Fullscreen
- Save a copy of the currently opened PDF
- Responsive/mobile shell
- No account, no cloud upload

## Stack

- React + TypeScript
- Vite
- PDF.js
- Tauri 2
- Rust
- Lucide

## Development

```bash
npm install
npm run tauri:dev
```

Typecheck:

```bash
npm run typecheck
```

Production bundle:

```bash
npm run tauri:build
```

## Cross-platform builds

Pushes to `main` build Windows x64, macOS Apple Silicon, macOS Intel and Linux x64 and upload the installers as GitHub Actions artifacts.

A semantic version tag such as `v2.0.0` runs the release pipeline. The pipeline builds every target, collects the native bundles and publishes one GitHub Release containing the installers.

The CI intentionally uses explicit runner dependencies and GitHub's artifact service rather than custom inputs on `tauri-action`. This keeps the build pipeline easy to diagnose and independent from optional action features.

## Distribution notes

Unsigned Windows builds can trigger SmartScreen warnings. Unsigned macOS builds can trigger Gatekeeper warnings. Production distribution should add Windows Authenticode signing and Apple signing/notarization credentials.

For Linux, the build uses Ubuntu 22.04 as the baseline for the AppImage so the resulting binary is compatible with an older glibc baseline. Tauri's documentation recommends building on an older supported Linux base rather than a very new base for this reason.
