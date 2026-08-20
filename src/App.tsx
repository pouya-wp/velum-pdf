import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Check, ChevronDown,
  ChevronLeft, ChevronRight, Command, FileText, FolderOpen, Grid2X2, Keyboard, Maximize2,
  Menu, Moon, PanelLeft, Plus, Search, Settings2, Sparkles, Sun, X, ZoomIn, ZoomOut
} from 'lucide-react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

type Recent = { name: string; size: number; lastOpened: number }
type SearchHit = { page: number; preview: string }
type FitMode = 'fit' | 'width' | 'actual'
type Theme = 'dark' | 'light'

const RECENTS_KEY = 'velum:recents:v3'
const BOOKMARKS_KEY = 'velum:bookmarks:v2'
const THEME_KEY = 'velum:theme:v2'
const FIT_KEY = 'velum:fit:v1'
const SIDEBAR_KEY = 'velum:sidebar:v1'
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const readStorage = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback } }

function Thumbnail({ pdf, page, active, bookmarked, onSelect }: { pdf: PDFDocumentProxy; page: number; active: boolean; bookmarked: boolean; onSelect: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    let task: { cancel?: () => void } | undefined
    void pdf.getPage(page).then((p) => {
      if (cancelled || !canvasRef.current) return
      const viewport = p.getViewport({ scale: 0.17 })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      canvas.width = Math.ceil(viewport.width * ratio)
      canvas.height = Math.ceil(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      task = p.render({ canvasContext: ctx, viewport } as any)
    }).catch(() => undefined)
    return () => { cancelled = true; task?.cancel?.() }
  }, [pdf, page])

  return <button className={`thumbnail ${active ? 'is-active' : ''}`} onClick={onSelect} aria-label={`Open page ${page}`}>
    <div className="thumbnail-card"><canvas ref={canvasRef} />{bookmarked && <BookmarkCheck size={12} className="thumbnail-bookmark" />}</div><span>{page}</span>
  </button>
}

export default function App() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState('Velum')
  const [fileSize, setFileSize] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [fitMode, setFitMode] = useState<FitMode>(() => readStorage(FIT_KEY, 'fit'))
  const [theme, setTheme] = useState<Theme>(() => readStorage(THEME_KEY, 'dark'))
  const [sidebarOpen, setSidebarOpen] = useState(() => readStorage(SIDEBAR_KEY, true))
  const [bookmarks, setBookmarks] = useState<number[]>(() => readStorage(BOOKMARKS_KEY, []))
  const [recents, setRecents] = useState<Recent[]>(() => readStorage(RECENTS_KEY, []))
  const [searchOpen, setSearchOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [showStatus, setShowStatus] = useState(true)
  const [renderVersion, setRenderVersion] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const readerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null)
  const searchTokenRef = useRef(0)
  const pages = pdf?.numPages ?? 0
  const isBookmarked = bookmarks.includes(page)
  const zoomLabel = fitMode === 'fit' ? 'Fit' : fitMode === 'width' ? 'Width' : `${Math.round(zoom * 100)}%`
  const activeBookmarks = useMemo(() => bookmarks.filter((n) => n <= pages), [bookmarks, pages])

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, JSON.stringify(theme)) }, [theme])
  useEffect(() => { localStorage.setItem(FIT_KEY, JSON.stringify(fitMode)) }, [fitMode])
  useEffect(() => { localStorage.setItem(SIDEBAR_KEY, JSON.stringify(sidebarOpen)) }, [sidebarOpen])
  useEffect(() => { localStorage.setItem(RECENTS_KEY, JSON.stringify(recents)) }, [recents])
  useEffect(() => { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks)) }, [bookmarks])
  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }, [])

  const openFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('Velum only opens PDF files.'); return }
    setError(''); setLoading(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const document = await getDocument({ data: bytes }).promise
      setPdf((old) => { void old?.destroy(); return document })
      setFileBytes(bytes); setFileName(file.name); setFileSize(file.size); setPage(1); setZoom(1); setFitMode('fit')
      setQuery(''); setSearchHits([]); setBookmarks([])
      setRecents((current) => [{ name: file.name, size: file.size, lastOpened: Date.now() }, ...current.filter((x) => x.name !== file.name)].slice(0, 16))
      notify(`Opened ${file.name}`)
    } catch (cause) {
      console.error(cause); setError('Velum could not read this PDF. It may be damaged, encrypted, or unsupported.'); notify('Could not open that PDF')
    } finally { setLoading(false) }
  }, [notify])

  const pickFile = useCallback(() => fileInputRef.current?.click(), [])
  const navigate = useCallback((next: number) => { if (pages) setPage(clamp(next, 1, pages)) }, [pages])

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || !readerRef.current) return
    renderTaskRef.current?.cancel?.()
    const current = await pdf.getPage(page)
    const base = current.getViewport({ scale: 1 })
    const availableWidth = Math.max(420, readerRef.current.clientWidth - 96)
    const availableHeight = Math.max(420, readerRef.current.clientHeight - 76)
    let scale = zoom
    if (fitMode === 'fit') scale = Math.min(availableWidth / base.width, availableHeight / base.height)
    if (fitMode === 'width') scale = availableWidth / base.width
    scale = clamp(scale, 0.35, 4)
    const viewport = current.getViewport({ scale })
    const canvas = canvasRef.current; const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio)
    canvas.style.width = `${Math.round(viewport.width)}px`; canvas.style.height = `${Math.round(viewport.height)}px`
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const renderTask = current.render({ canvasContext: ctx, viewport } as any)
    renderTaskRef.current = renderTask
    try { await renderTask.promise } catch (cause) { if ((cause as { name?: string }).name !== 'RenderingCancelledException') console.error(cause) }
  }, [fitMode, page, pdf, renderVersion, zoom])
  useEffect(() => { void renderPage() }, [renderPage])
  useEffect(() => { const onResize = () => setRenderVersion((v) => v + 1); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize) }, [])

  const searchDocument = useCallback(async (value: string) => {
    setQuery(value)
    if (!pdf || value.trim().length < 2) { setSearchHits([]); return }
    const token = ++searchTokenRef.current; setSearching(true); const needle = value.trim().toLocaleLowerCase(); const results: SearchHit[] = []
    try {
      for (let index = 1; index <= pdf.numPages; index += 1) {
        if (token !== searchTokenRef.current) return
        const pageProxy = await pdf.getPage(index)
        const content = (await pageProxy.getTextContent()).items.filter((item): item is TextItem => 'str' in item).map((item) => item.str).join(' ')
        const lower = content.toLocaleLowerCase(); const position = lower.indexOf(needle)
        if (position !== -1) { const start = Math.max(0, position - 42); results.push({ page: index, preview: content.slice(start, start + 120).trim() }); if (results.length >= 50) break }
      }
      if (token === searchTokenRef.current) { setSearchHits(results); if (results.length) navigate(results[0].page) }
    } finally { if (token === searchTokenRef.current) setSearching(false) }
  }, [navigate, pdf])

  const downloadCurrent = useCallback(() => {
    if (!fileBytes) return
    const blob = new Blob([fileBytes as unknown as BlobPart], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); notify('Saved a copy of the PDF')
  }, [fileBytes, fileName, notify])
  const toggleBookmark = useCallback(() => { if (!pdf) return; setBookmarks((current) => current.includes(page) ? current.filter((value) => value !== page) : [...current, page].sort((a, b) => a - b)); notify(isBookmarked ? `Removed page ${page} bookmark` : `Bookmarked page ${page}`) }, [isBookmarked, notify, page, pdf])
  const toggleFullscreen = useCallback(async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() } catch { notify('Fullscreen is unavailable here') } }, [notify])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey; const key = event.key.toLowerCase(); const target = event.target as HTMLElement | null; const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (modifier && key === 'o') { event.preventDefault(); pickFile(); return }
      if (modifier && key === 'k') { event.preventDefault(); setCommandOpen(true); return }
      if (modifier && key === 'f') { event.preventDefault(); setSearchOpen(true); window.setTimeout(() => searchInputRef.current?.focus(), 30); return }
      if (modifier && key === 'b') { event.preventDefault(); toggleBookmark(); return }
      if (key === 'f11') { event.preventDefault(); void toggleFullscreen(); return }
      if (event.key === 'Escape') { setCommandOpen(false); setSearchOpen(false); setSettingsOpen(false); return }
      if (typing || !pdf) return
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); navigate(page - 1) }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); navigate(page + 1) }
      if (event.key.toLowerCase() === 'b') toggleBookmark(); if (event.key === '0') { setFitMode('fit'); setZoom(1) }; if (event.key === '1') setFitMode('actual'); if (event.key === '2') setFitMode('width')
    }
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, page, pdf, pickFile, toggleBookmark, toggleFullscreen])

  useEffect(() => {
    const onDragOver = (event: DragEvent) => { event.preventDefault(); setDragging(true) }
    const onDragLeave = (event: DragEvent) => { if (event.clientX <= 0 || event.clientY <= 0) setDragging(false) }
    const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer?.files?.[0]; if (file) void openFile(file) }
    window.addEventListener('dragover', onDragOver); window.addEventListener('dragleave', onDragLeave); window.addEventListener('drop', onDrop)
    return () => { window.removeEventListener('dragover', onDragOver); window.removeEventListener('dragleave', onDragLeave); window.removeEventListener('drop', onDrop) }
  }, [openFile])
  useEffect(() => () => { void pdf?.destroy() }, [pdf])

  const welcome = !pdf; const subtitle = welcome ? 'A quieter place for your documents.' : `${formatSize(fileSize)} · ${pages} ${pages === 1 ? 'page' : 'pages'}`

  return <div className="shell">
    <input ref={fileInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); event.currentTarget.value = '' }} />
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-icon"><Sparkles size={16} /></div><div><strong>Velum</strong><span>PDF reader</span></div></div>
      <div className="document-heading"><div className="document-title"><FileText size={15} /><span title={fileName}>{fileName}</span></div><span>{subtitle}</span></div>
      <div className="topbar-actions"><button className="topbar-action" onClick={() => { setSearchOpen(true); window.setTimeout(() => searchInputRef.current?.focus(), 30) }} title="Search"><Search size={17} /><span>Search</span><kbd>⌘F</kbd></button><button className="topbar-action compact" onClick={() => setCommandOpen(true)} title="Command palette"><Command size={17} /></button><button className="topbar-action compact" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} title="Toggle appearance">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button></div>
    </header>
    <div className="content-shell">
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-controls"><button className="primary-button" onClick={pickFile}><Plus size={15} /><span>Open PDF</span><kbd>⌘O</kbd></button><button className="secondary-button" onClick={() => { setSearchOpen(true); window.setTimeout(() => searchInputRef.current?.focus(), 30) }}><Search size={15} /><span>Search document</span></button></div>
        <div className="sidebar-block"><div className="sidebar-label">DOCUMENT</div><button className="side-row is-selected"><Grid2X2 size={15} /><span>Pages</span><b>{pages || '—'}</b></button><button className="side-row" disabled={!activeBookmarks.length} onClick={() => navigate(activeBookmarks[0] ?? page)}><Bookmark size={15} /><span>Bookmarks</span><b>{activeBookmarks.length || '—'}</b></button></div>
        <div className="thumbnail-rail">{pdf ? Array.from({ length: pages }, (_, index) => { const pageNumber = index + 1; return <Thumbnail key={pageNumber} pdf={pdf} page={pageNumber} active={pageNumber === page} bookmarked={bookmarks.includes(pageNumber)} onSelect={() => navigate(pageNumber)} /> }) : <div className="empty-sidebar"><div className="empty-icon"><FileText size={18} /></div><strong>Nothing open</strong><span>Drop a PDF here or choose one above.</span></div>}</div>
        <div className="recent-area"><div className="sidebar-label">RECENT</div>{recents.slice(0, 5).map((recent) => <div className="recent-item" key={`${recent.name}-${recent.lastOpened}`}><div className="recent-symbol"><FileText size={13} /></div><div><strong>{recent.name}</strong><span>{formatSize(recent.size)}</span></div></div>)}{!recents.length && <p className="quiet-note">Your last opened documents will appear here.</p>}</div>
        <div className="sidebar-footer"><div className="privacy-card"><div className="privacy-dot"><Check size={13} /></div><div><strong>Private by default</strong><span>Files stay on this device.</span></div></div></div>
      </aside>
      <main className="reader-shell">
        <div className="reader-header">
          <div className="reader-header-left"><button className="icon-button" onClick={() => setSidebarOpen((open) => !open)} title="Toggle sidebar"><PanelLeft size={17} /></button><div className="crumbs"><span>Library</span><ChevronRight size={13} /><strong>{welcome ? 'Start reading' : fileName}</strong></div></div>
          <div className="reader-header-center">{pdf && <><button className="icon-button" disabled={page <= 1} onClick={() => navigate(page - 1)}><ChevronLeft size={16} /></button><span className="page-indicator"><b>{page}</b><i>/</i>{pages}</span><button className="icon-button" disabled={page >= pages} onClick={() => navigate(page + 1)}><ChevronRight size={16} /></button></>}</div>
          <div className="reader-header-right"><button className={`icon-button ${isBookmarked ? 'active-button' : ''}`} disabled={!pdf} onClick={toggleBookmark} title="Bookmark page"><Bookmark size={16} /></button><button className="icon-button" disabled={!pdf} onClick={() => { setFitMode('actual'); setZoom((value) => clamp(value - 0.1, 0.35, 4)) }}><ZoomOut size={16} /></button><button className="zoom-button" disabled={!pdf} onClick={() => setFitMode((mode) => mode === 'fit' ? 'width' : mode === 'width' ? 'actual' : 'fit')}><span>{zoomLabel}</span><ChevronDown size={13} /></button><button className="icon-button" disabled={!pdf} onClick={() => { setFitMode('actual'); setZoom((value) => clamp(value + 0.1, 0.35, 4)) }}><ZoomIn size={16} /></button><button className="icon-button" disabled={!pdf} onClick={downloadCurrent} title="Save a copy"><ArrowDownToLine size={16} /></button><button className="icon-button" onClick={toggleFullscreen} title="Fullscreen"><Maximize2 size={16} /></button><button className="icon-button" onClick={() => setSettingsOpen((open) => !open)} title="Reader settings"><Settings2 size={16} /></button></div>
        </div>
        <div className={`document-stage ${welcome ? 'welcome-stage' : ''}`} ref={readerRef}>
          {welcome ? <section className="welcome-card" onDoubleClick={pickFile}><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-symbol"><Sparkles size={24} /></div><div className="hero-kicker">LOCAL · FOCUSED · BEAUTIFUL</div><h1>PDF reading,<br /><em>reimagined.</em></h1><p>Velum strips away the noise and leaves the document.<br />Fast rendering, thoughtful controls, zero cloud upload.</p><button className="hero-open" onClick={pickFile}><FolderOpen size={18} /><span>Open a PDF</span><kbd>⌘O</kbd></button><div className="hero-microcopy"><span><Check size={12} /> Local-first</span><span><Check size={12} /> Open source</span><span><Check size={12} /> No account</span></div></section> : <div className="paper-wrap"><div className="paper-shadow" /><div className="paper"><canvas ref={canvasRef} /></div></div>}
          {loading && <div className="loading-pill"><span className="loader" />Opening document…</div>}
          {dragging && <div className="drop-screen"><div className="drop-card"><div className="drop-logo"><FileText size={25} /></div><strong>Drop your PDF</strong><span>Velum never sends your document anywhere.</span></div></div>}
        </div>
        <footer className={`statusbar ${showStatus ? '' : 'hidden'}`}><div><span className="status-dot" />{pdf ? 'Ready' : 'Ready when you are'}</div><div><span>{pdf ? `${formatSize(fileSize)} · local` : 'Local-first'}</span><span>⌘K commands</span><button onClick={() => setShowStatus(false)}><X size={12} /></button></div></footer>
      </main>
    </div>
    {error && <div className="toast error"><span>{error}</span><button onClick={() => setError('')}><X size={14} /></button></div>}
    {toast && <div className="toast"><Check size={14} /><span>{toast}</span></div>}
    {searchOpen && <div className="modal-layer" onMouseDown={() => setSearchOpen(false)}><div className="search-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-searchbar"><Search size={18} /><input ref={searchInputRef} value={query} onChange={(event) => void searchDocument(event.target.value)} placeholder={pdf ? 'Search every page…' : 'Open a PDF to search'} autoFocus /><kbd>ESC</kbd></div><div className="search-results">{searching && <div className="search-empty"><span className="loader" />Searching the document…</div>}{!searching && !query && <div className="search-empty"><Search size={20} /><strong>Find anything in your PDF</strong><span>Type two or more characters to scan the document.</span></div>}{!searching && query && !searchHits.length && <div className="search-empty"><Search size={20} /><strong>No matches</strong><span>Try another phrase or a shorter search.</span></div>}{!searching && searchHits.map((hit) => <button className="search-hit" key={hit.page} onClick={() => { navigate(hit.page); setSearchOpen(false) }}><div className="hit-page">{hit.page}</div><div><strong>Page {hit.page}</strong><span>{hit.preview || 'Match found on this page.'}</span></div><ArrowRight size={15} /></button>)}</div></div></div>}
    {commandOpen && <div className="modal-layer" onMouseDown={() => setCommandOpen(false)}><div className="command-modal" onMouseDown={(event) => event.stopPropagation()}><div className="command-head"><Command size={17} /><span>Quick actions</span><kbd>ESC</kbd></div><button onClick={() => { setCommandOpen(false); pickFile() }}><FolderOpen size={16} /><span>Open PDF</span><kbd>⌘O</kbd></button><button onClick={() => { setCommandOpen(false); setSearchOpen(true); window.setTimeout(() => searchInputRef.current?.focus(), 30) }}><Search size={16} /><span>Search document</span><kbd>⌘F</kbd></button><button onClick={() => { setCommandOpen(false); toggleBookmark() }} disabled={!pdf}><Bookmark size={16} /><span>{isBookmarked ? 'Remove bookmark' : 'Bookmark page'}</span><kbd>⌘B</kbd></button><button onClick={() => { setCommandOpen(false); setFitMode('fit') }} disabled={!pdf}><Maximize2 size={16} /><span>Fit page</span><kbd>0</kbd></button><button onClick={() => { setCommandOpen(false); setFitMode('width') }} disabled={!pdf}><PanelLeft size={16} /><span>Fit width</span><kbd>2</kbd></button><button onClick={() => { setCommandOpen(false); void toggleFullscreen() }}><Maximize2 size={16} /><span>Fullscreen</span><kbd>F11</kbd></button><button onClick={() => { setCommandOpen(false); setTheme((current) => current === 'dark' ? 'light' : 'dark') }}><Sun size={16} /><span>Toggle appearance</span></button></div></div>}
    {settingsOpen && <div className="settings-popover" onMouseLeave={() => setSettingsOpen(false)}><div className="popover-title"><Settings2 size={14} /> Reader</div><div className="popover-row"><span>Appearance</span><button onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Dark' : 'Light'}</button></div><div className="popover-row"><span>Page fit</span><div className="segmented"><button className={fitMode === 'fit' ? 'selected' : ''} onClick={() => setFitMode('fit')}>Fit</button><button className={fitMode === 'width' ? 'selected' : ''} onClick={() => setFitMode('width')}>Width</button><button className={fitMode === 'actual' ? 'selected' : ''} onClick={() => setFitMode('actual')}>100%</button></div></div><div className="popover-row"><span>Sidebar</span><button onClick={() => setSidebarOpen((open) => !open)}>{sidebarOpen ? 'Visible' : 'Hidden'}</button></div><div className="popover-foot"><Keyboard size={13} /><span>⌘K for all commands</span></div></div>}
    <div className="mobile-bottom-bar"><button onClick={() => setSidebarOpen((open) => !open)}><Menu size={17} /></button><button onClick={() => navigate(page - 1)} disabled={!pdf || page <= 1}><ArrowLeft size={17} /></button><span>{pdf ? `${page} / ${pages}` : 'Velum'}</span><button onClick={() => navigate(page + 1)} disabled={!pdf || page >= pages}><ArrowRight size={17} /></button><button onClick={() => setCommandOpen(true)}><Command size={17} /></button></div>
  </div>
}
