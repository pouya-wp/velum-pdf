# Velum

A calm, local-first PDF reader for Windows, macOS and Linux.

## Highlights

- Modern, minimal desktop UI
- Local PDF rendering with PDF.js
- Drag & drop
- Page thumbnails
- Page navigation and zoom
- Text search across the document
- Bookmarks stored for the current session
- Dark / light appearance
- Command palette
- Fullscreen mode
- Recent document history (metadata only)
- No account and no upload
- Tauri 2 native desktop shell

## Build

```bash
npm install
npm run tauri:build
```

## GitHub Actions

- Pushes to `main` build Windows, macOS Intel, macOS Apple Silicon and Linux artifacts.
- Tags like `v1.0.0` create a GitHub Release automatically.

```bash
git add .
git commit -m "Release Velum 1.0"
git push
git tag v1.0.0
git push origin v1.0.0
```

For production distribution, add Windows Authenticode signing and Apple Developer signing/notarization credentials to the release workflow.
