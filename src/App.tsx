import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowDownToLine, Bookmark, BookmarkCheck, Check, ChevronDown, ChevronLeft, ChevronRight,
  Command, FileText, FolderOpen, Grid2X2, Keyboard, Maximize2, Menu, Moon, PanelLeft,
  Search, Settings2, Sparkles, Sun, X, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { RenderTask } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()

type Recent = { name: string; size: number; lastOpened: number }
type SearchHit = { page: number; preview: string }
type FitMode = 'fit' | 'width' | 'actual'
type Theme = 'dark' | 'light'

type PageMetric = { width: number; height: number }

const RECENTS_KEY = 'velum:recents:v4'
const BOOKMARKS_KEY = 'velum:bookmarks:v4'
const THEME_KEY = 'velum:theme:v4'
const FIT_KEY = 'velum:fit:v2'
const SIDEBAR_KEY = 'velum:sidebar:v2'
const SPACING_KEY = 'velum:spacing:v1'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const readStorage = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback } }

function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => readStorage(key, initial))
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* ignore */ } }, [key, state])
  return [state, setState] as const
}

function Thumbnail({ pdf, page, active, bookmarked, onSelect }: { pdf: PDFDocumentProxy; page: number; active: boolean; bookmarked: boolean; onSelect: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    let task: RenderTask | null = null
    void pdf.getPage(page).then((p) => {
      if (cancelled || !canvasRef.current) return
      const viewport = p.getViewport({ scale: 0.17 })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      canvas.width = Math.ceil(viewport.width * ratio)
      canvas.height = Math.ceil(viewport.height * ratio)
      canvas.style.width = `${Math.ceil(viewport.width)}px`
      canvas.style.height = `${Math.ceil(viewport.height)}px`
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      task = p.render({ canvas, canvasContext: ctx, viewport })
      void task.promise.then(() => setReady(true)).catch(() => undefined)
    }).catch(() => undefined)
    return () => { cancelled = true; task?.cancel() }
  }, [pdf, page])

  return <button className={`thumbnail ${active ? 'is-active' : ''}`} onClick={onSelect} aria-label={`Open page ${page}`}>
    <div className={`thumbnail-card ${ready ? 'is-ready' : ''}`}><canvas ref={canvasRef} />{!ready && <div className="thumb-skeleton" />}{bookmarked && <BookmarkCheck size={12} className="thumbnail-bookmark" />}</div>
    <span>{page}</span>
  </button>
}

function PageCanvas({
  pdf, page, scale, metric, gap, onVisible, onReady
}: { pdf: PDFDocumentProxy; page: number; scale: number; metric: PageMetric; gap: number; onVisible: (page: number) => void; onReady: (page: number) => void }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const taskRef = useRef<RenderTask | null>(null)
  const [rendered, setRendered] = useState(false)
  const [hover, setHover] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    const node = shellRef.current
    if (!node) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        onVisible(page)
        setShouldRender(true)
      }
    }, { rootMargin: '70% 0px 70% 0px', threshold: 0.01 })
    io.observe(node)
    return () => io.disconnect()
  }, [onVisible, page])

  useEffect(() => {
    let cancelled = false
    taskRef.current?.cancel()
    setRendered(false)
    if (!shouldRender) return
    void pdf.getPage(page).then((pdfPage: PDFPageProxy) => {
      if (cancelled || !canvasRef.current) return
      const viewport = pdfPage.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      canvas.width = Math.ceil(viewport.width * ratio)
      canvas.height = Math.ceil(viewport.height * ratio)
      canvas.style.width = `${Math.ceil(viewport.width)}px`
      canvas.style.height = `${Math.ceil(viewport.height)}px`
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.imageSmoothingEnabled = true
      taskRef.current = pdfPage.render({ canvas, canvasContext: ctx, viewport })
      void taskRef.current.promise.then(() => {
        if (cancelled) return
        setRendered(true)
        onReady(page)
      }).catch((error: unknown) => {
        if ((error as { name?: string })?.name !== 'RenderingCancelledException') console.warn('Velum render:', error)
      })
    }).catch(() => undefined)
    return () => { cancelled = true; taskRef.current?.cancel() }
  }, [metric.height, metric.width, onReady, page, pdf, scale, shouldRender])

  const width = metric.width * scale
  const height = metric.height * scale
  return <div ref={shellRef} className="page-shell" style={{ width, minHeight: height, marginBottom: gap }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
    <div className={`page-paper ${rendered ? 'is-rendered' : ''}`} style={{ width, height }}>
      <div className="page-loading" aria-hidden={!rendered}><div className="mini-spinner" /></div>
      <canvas ref={canvasRef} className="page-canvas" />
      {hover && rendered && <div className="page-badge">{page}</div>}
    </div>
  </div>
}

export default function App() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState('Velum')
  const [fileSize, setFileSize] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [fitMode, setFitMode] = usePersistentState<FitMode>(FIT_KEY, 'fit')
  const [theme, setTheme] = usePersistentState<Theme>(THEME_KEY, 'dark')
  const [sidebarOpen, setSidebarOpen] = usePersistentState<boolean>(SIDEBAR_KEY, true)
  const [pageGap, setPageGap] = usePersistentState<number>(SPACING_KEY, 22)
  const [bookmarks, setBookmarks] = usePersistentState<number[]>(BOOKMARKS_KEY, [])
  const [recents, setRecents] = usePersistentState<Recent[]>(RECENTS_KEY, [])
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
  const [metrics, setMetrics] = useState<PageMetric[]>([])
  const [renderedPages, setRenderedPages] = useState<number[]>([])
  const [zoomLock, setZoomLock] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const readerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const searchTokenRef = useRef(0)
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const toastTimer = useRef<number | null>(null)
  const pages = pdf?.numPages ?? 0
  const activeBookmarks = useMemo(() => bookmarks.filter((n) => n >= 1 && n <= pages), [bookmarks, pages])

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    const loadMetrics = async () => {
      const next: PageMetric[] = []
      for (let index = 1; index <= pdf.numPages; index += 1) {
        if (cancelled) return
        const p = await pdf.getPage(index)
        const viewport = p.getViewport({ scale: 1 })
        next[index - 1] = { width: viewport.width, height: viewport.height }
      }
      if (!cancelled) setMetrics(next)
    }
    void loadMetrics()
    return () => { cancelled = true }
  }, [pdf])

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2400)
  }, [])

  const openFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('Velum only opens PDF files.'); notify('That file is not a PDF'); return }
    setError(''); setLoading(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const document = await getDocument({ data: bytes, enableHWA: true, isOffscreenCanvasSupported: true, useWasm: true }).promise
      setPdf((old) => { void old?.destroy(); return document })
      setFileBytes(bytes); setFileName(file.name); setFileSize(file.size); setPage(1); setZoom(1); setFitMode('fit')
      setQuery(''); setSearchHits([]); setBookmarks([]); setRenderedPages([]); setMetrics([])
      setRecents((current) => [{ name: file.name, size: file.size, lastOpened: Date.now() }, ...current.filter((x) => x.name !== file.name)].slice(0, 16))
      notify(`Opened ${file.name}`)
    } catch (cause) {
      console.error(cause); setError('Velum could not read this PDF. It may be damaged, encrypted, or unsupported.'); notify('Could not open that PDF')
    } finally { setLoading(false) }
  }, [notify, setBookmarks, setFitMode, setRecents])

  const pickFile = useCallback(() => fileInputRef.current?.click(), [])
  const navigate = useCallback((next: number) => { if (pages) setPage(clamp(next, 1, pages)) }, [pages])

  const scale = useMemo(() => {
    if (!metrics[page - 1]) return zoom
    if (!readerRef.current) return zoom
    const metric = metrics[page - 1]
    const availableWidth = Math.max(420, readerRef.current.clientWidth - 130)
    const availableHeight = Math.max(420, readerRef.current.clientHeight - 100)
    if (fitMode === 'width') return clamp((availableWidth / metric.width) * zoom, 0.35, 4)
    if (fitMode === 'fit') return clamp(Math.min(availableWidth / metric.width, availableHeight / metric.height) * zoom, 0.35, 4)
    return clamp(zoom, 0.35, 4)
  }, [fitMode, metrics, page, zoom])

  const scrollToPage = useCallback((target: number, behavior: ScrollBehavior = 'smooth') => {
    const node = pageRefs.current.get(target)
    if (node && readerRef.current) node.scrollIntoView({ behavior, block: 'center', inline: 'center' })
    setPage(target)
  }, [])

  const onPageVisible = useCallback((visiblePage: number) => setPage((current) => Math.abs(visiblePage - current) > 0 ? visiblePage : current), [])
  const onPageReady = useCallback((readyPage: number) => setRenderedPages((current) => current.includes(readyPage) ? current : [...current, readyPage]), [])

  useEffect(() => {
    if (!pdf || !readerRef.current || metrics.length !== pages) return
    const root = readerRef.current
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-page]'))
    if (!nodes.length) return
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setPage(Number((visible.target as HTMLElement).dataset.page))
    }, { root, rootMargin: '-18% 0px -58% 0px', threshold: [0.05, 0.25, 0.6, 0.9] })
    nodes.forEach((node) => io.observe(node))
    return () => io.disconnect()
  }, [metrics.length, pages, pdf])

  const searchDocument = useCallback(async (value: string) => {
    setQuery(value)
    if (!pdf || value.trim().length < 2) { setSearchHits([]); return }
    const token = ++searchTokenRef.current; setSearching(true)
    const needle = value.trim().toLocaleLowerCase(); const results: SearchHit[] = []
    try {
      for (let index = 1; index <= pdf.numPages; index += 1) {
        if (token !== searchTokenRef.current) return
        const pageProxy = await pdf.getPage(index)
        const content = (await pageProxy.getTextContent()).items.filter((item): item is TextItem => 'str' in item).map((item) => item.str).join(' ')
        const lower = content.toLocaleLowerCase(); const position = lower.indexOf(needle)
        if (position !== -1) { const start = Math.max(0, position - 60); results.push({ page: index, preview: content.slice(start, start + 150).trim() }); if (results.length >= 80) break }
      }
      if (token === searchTokenRef.current) setSearchHits(results)
    } finally { if (token === searchTokenRef.current) setSearching(false) }
  }, [pdf])

  const downloadCurrent = useCallback(() => {
    if (!fileBytes) return
    const stableBytes = new Uint8Array(fileBytes)
    const blob = new Blob([stableBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); notify('Saved a copy')
  }, [fileBytes, fileName, notify])

  const toggleBookmark = useCallback(() => {
    if (!pdf) return
    setBookmarks((current) => current.includes(page) ? current.filter((value) => value !== page) : [...current, page].sort((a, b) => a - b))
    notify(bookmarks.includes(page) ? 'Bookmark removed' : 'Bookmarked this page')
  }, [bookmarks, notify, page, pdf, setBookmarks])

  const centerZoom = useCallback((next: number) => { setFitMode('actual'); setZoom(clamp(next, 0.35, 4)) }, [setFitMode])

  const setZoomPreset = useCallback((preset: FitMode) => {
    if (preset === 'actual') { setFitMode('actual'); setZoom(1) }
    else { setFitMode(preset); setZoom(1) }
  }, [setFitMode])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const cmd = event.metaKey || event.ctrlKey
      if (event.code === 'Space' && !event.repeat) { setSpaceDown(true); return }
      if (cmd && event.key.toLowerCase() === 'o') { event.preventDefault(); pickFile(); return }
      if (cmd && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); window.setTimeout(() => searchInputRef.current?.focus(), 0); return }
      if (cmd && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); return }
      if (event.key === 'Escape') { setCommandOpen(false); setSearchOpen(false); setSettingsOpen(false); return }
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { if (!event.altKey) navigate(page + 1) }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { if (!event.altKey) navigate(page - 1) }
      if ((event.key === '+' || event.key === '=') && cmd) { event.preventDefault(); centerZoom(zoom + 0.1) }
      if ((event.key === '-' || event.key === '_') && cmd) { event.preventDefault(); centerZoom(zoom - 0.1) }
    }
    const onUp = (event: KeyboardEvent) => { if (event.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp) }
  }, [centerZoom, navigate, page, pickFile, zoom])

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!readerRef.current) return
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        centerZoom(zoom * (event.deltaY < 0 ? 1.08 : 0.93))
      }
    }
    const node = readerRef.current
    node?.addEventListener('wheel', onWheel, { passive: false })
    return () => node?.removeEventListener('wheel', onWheel)
  }, [centerZoom, zoom])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!spaceDown && event.button !== 1) return
    const node = readerRef.current; if (!node) return
    dragRef.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop }
    node.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; const node = readerRef.current
    if (!drag || !node) return
    node.scrollLeft = drag.left - (event.clientX - drag.x)
    node.scrollTop = drag.top - (event.clientY - drag.y)
  }
  const stopPan = () => { dragRef.current = null }

  useEffect(() => {
    const onDragOver = (event: DragEvent) => { event.preventDefault(); setDragging(true) }
    const onDragLeave = (event: DragEvent) => { if (event.relatedTarget == null) setDragging(false) }
    const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer?.files?.[0]; if (file) void openFile(file) }
    window.addEventListener('dragover', onDragOver); window.addEventListener('dragleave', onDragLeave); window.addEventListener('drop', onDrop)
    return () => { window.removeEventListener('dragover', onDragOver); window.removeEventListener('dragleave', onDragLeave); window.removeEventListener('drop', onDrop) }
  }, [openFile])

  const fitLabel = fitMode === 'fit' ? 'Page' : fitMode === 'width' ? 'Width' : `${Math.round(zoom * 100)}%`

  return <div className={`app-shell ${dragging ? 'is-dragging' : ''} ${spaceDown ? 'is-panning' : ''}`}>
    <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void openFile(file); e.currentTarget.value = '' }} />

    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark"><Sparkles size={15} /></div><div><strong>Velum</strong><span>Document Studio</span></div></div>
      <div className="top-center">
        <button className="command-pill" onClick={() => setCommandOpen(true)}><Command size={12} /><span>Jump to anything</span><kbd>⌘K</kbd></button>
      </div>
      <div className="top-actions">
        <button className="top-action" onClick={pickFile}><FolderOpen size={14} /><span>Open</span></button>
        <button className="top-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
        <button className="top-icon" onClick={() => setSettingsOpen((v) => !v)} aria-label="Settings"><Settings2 size={15} /></button>
      </div>
    </header>

    <div className="workspace">
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-head"><div className="sidebar-title"><Grid2X2 size={13} /><span>Pages</span></div><button className="quiet-icon" onClick={() => setSidebarOpen(false)}><PanelLeft size={14} /></button></div>
        <div className="sidebar-scroll">
          {pdf ? <>{Array.from({ length: pages }, (_, i) => i + 1).map((number) => <Thumbnail key={number} pdf={pdf} page={number} active={page === number} bookmarked={activeBookmarks.includes(number)} onSelect={() => scrollToPage(number)} />)}</> : <div className="sidebar-empty"><FileText size={17} /><span>Open a PDF to see its pages.</span></div>}
        </div>
        {pdf && <div className="sidebar-foot"><span>{pages} pages</span><span>{formatSize(fileSize)}</span></div>}
      </aside>

      <main className="main-view">
        <div className="reader-topbar">
          <div className="reader-title">
            <button className="quiet-icon mobile-menu" onClick={() => setSidebarOpen((v) => !v)}><Menu size={15} /></button>
            <div className="file-chip"><FileText size={13} /><span title={fileName}>{fileName}</span></div>
            {pdf && <span className="meta-pill">PDF · {formatSize(fileSize)}</span>}
          </div>
          <div className="reader-tools">
            <button className="tool-icon" onClick={() => setSearchOpen(true)} disabled={!pdf} aria-label="Search"><Search size={15} /></button>
            <button className={`tool-icon ${activeBookmarks.includes(page) ? 'selected' : ''}`} onClick={toggleBookmark} disabled={!pdf} aria-label="Bookmark page">{activeBookmarks.includes(page) ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}</button>
            <div className="tool-divider" />
            <button className="tool-icon" onClick={() => navigate(page - 1)} disabled={!pdf || page <= 1}><ChevronLeft size={15} /></button>
            <span className="page-counter"><b>{page}</b><span>/</span><span>{pages || '—'}</span></span>
            <button className="tool-icon" onClick={() => navigate(page + 1)} disabled={!pdf || page >= pages}><ChevronRight size={15} /></button>
            <div className="tool-divider" />
            <button className="tool-icon" onClick={() => centerZoom(zoom - 0.1)} disabled={!pdf}><ZoomOut size={15} /></button>
            <button className="zoom-pill" onClick={() => setZoomPreset(fitMode === 'fit' ? 'width' : 'fit')} disabled={!pdf}>{fitLabel}<ChevronDown size={11} /></button>
            <button className="tool-icon" onClick={() => centerZoom(zoom + 0.1)} disabled={!pdf}><ZoomIn size={15} /></button>
            <button className={`tool-icon ${zoomLock ? 'selected' : ''}`} onClick={() => setZoomLock((v) => !v)} disabled={!pdf} title="Keep zoom">{zoomLock ? <Check size={15} /> : <RotateCcw size={15} />}</button>
            <button className="tool-icon" onClick={() => document.documentElement.requestFullscreen?.()} disabled={!pdf}><Maximize2 size={15} /></button>
          </div>
        </div>

        <div
          className="canvas-viewport"
          ref={readerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
        >
          {!pdf ? <div className="empty-state">
            <div className="ambient ambient-one" /><div className="ambient ambient-two" />
            <div className="hero-mark"><Sparkles size={18} /></div>
            <span className="eyebrow">A quieter way to read</span>
            <h1>Make PDFs feel<br /><em>alive.</em></h1>
            <p>Fast, fluid, local-first document reading. Designed to disappear while you work.</p>
            <button className="hero-open" onClick={pickFile}><FolderOpen size={14} /><span>Open your first PDF</span><kbd>⌘O</kbd></button>
            <div className="hero-hints"><span><Check size={10} />Local-only</span><span><Check size={10} />Smooth canvas</span><span><Check size={10} />Keyboard first</span></div>
            <div className="recent-grid">{recents.slice(0, 4).map((item) => <button key={`${item.name}-${item.lastOpened}`} className="recent-card" onClick={pickFile}><div className="recent-icon"><FileText size={14} /></div><div><strong>{item.name}</strong><span>{formatSize(item.size)} · recently opened</span></div><ChevronRight size={13} /></button>)}</div>
          </div> : <div className="document-canvas" style={{ '--page-width': `${metrics[page - 1] ? metrics[page - 1].width * scale : 760}px` } as CSSProperties}>
            <div className="document-spine">{Array.from({ length: pages }, (_, i) => {
              const number = i + 1
              const metric = metrics[i]
              return metric ? <div key={number} data-page={number} ref={(node) => { if (node) pageRefs.current.set(number, node); else pageRefs.current.delete(number) }}><PageCanvas pdf={pdf} page={number} scale={scale} metric={metric} gap={pageGap} onVisible={onPageVisible} onReady={onPageReady} /></div> : <div key={number} className="metric-placeholder" style={{ height: 760 }} />
            })}</div>
          </div>}

          {loading && <div className="floating-loading"><span className="loader" />Opening PDF…</div>}
          {error && <div className="error-card"><X size={14} /><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}
          {dragging && <div className="drop-screen"><div className="drop-card"><div className="drop-mark"><Sparkles size={18} /></div><strong>Drop your PDF</strong><span>Velum will keep it on this device.</span></div></div>}
        </div>

        <div className="bottom-status"><div><span className="live-dot" />{pdf ? `${renderedPages.length}/${pages} pages rendered` : 'Ready when you are'}</div><div><span>{spaceDown ? 'Pan mode' : 'Space + drag to pan'}</span><span>⌘K commands</span></div></div>
      </main>
    </div>

    {searchOpen && <div className="modal-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) setSearchOpen(false) }}><section className="search-modal"><div className="modal-searchbar"><Search size={14} /><input ref={searchInputRef} value={query} onChange={(e) => void searchDocument(e.target.value)} placeholder={pdf ? 'Search this PDF…' : 'Open a PDF first'} /><kbd>ESC</kbd></div><div className="search-results">{searching ? <div className="search-empty"><span className="loader" /><strong>Reading text layers…</strong><span>Velum searches the document locally.</span></div> : searchHits.length ? searchHits.map((hit) => <button key={`${hit.page}-${hit.preview}`} className="search-hit" onClick={() => { setSearchOpen(false); scrollToPage(hit.page) }}><div className="hit-page">{hit.page}</div><div><strong>Page {hit.page}</strong><span>{hit.preview}</span></div><ChevronRight size={13} /></button>) : <div className="search-empty"><Search size={18} /><strong>{pdf ? (query ? 'No results' : 'Find anything in this document') : 'Open a PDF first'}</strong><span>{pdf ? 'Type at least two characters to start searching.' : 'Your document never leaves this device.'}</span></div>}</div></section></div>}

    {commandOpen && <div className="modal-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) setCommandOpen(false) }}><section className="command-modal"><div className="command-head"><Command size={14} /><span>Velum Command Palette</span><kbd>ESC</kbd></div>
      <button onClick={() => { setCommandOpen(false); pickFile() }}><FolderOpen size={13} /><span>Open PDF</span><kbd>⌘O</kbd></button>
      <button onClick={() => { setCommandOpen(false); setSearchOpen(true); window.setTimeout(() => searchInputRef.current?.focus(), 0) }} disabled={!pdf}><Search size={13} /><span>Search document</span><kbd>⌘F</kbd></button>
      <button onClick={() => { setCommandOpen(false); setSidebarOpen((v) => !v) }}><PanelLeft size={13} /><span>Toggle page rail</span><kbd>⌘\</kbd></button>
      <button onClick={() => { setCommandOpen(false); toggleBookmark() }} disabled={!pdf}><Bookmark size={13} /><span>Toggle bookmark</span><kbd>B</kbd></button>
      <button onClick={() => { setCommandOpen(false); downloadCurrent() }} disabled={!pdf}><ArrowDownToLine size={13} /><span>Save a copy</span><kbd>⌘S</kbd></button>
      <button onClick={() => { setCommandOpen(false); setTheme(theme === 'dark' ? 'light' : 'dark') }}><Sun size={13} /><span>Toggle appearance</span><kbd>⌘⇧L</kbd></button>
    </section></div>}

    {settingsOpen && <aside className="settings-card"><div className="settings-title"><Settings2 size={13} /><strong>Reader settings</strong></div><div className="settings-row"><span>Page spacing</span><div className="segment"><button className={pageGap === 12 ? 'selected' : ''} onClick={() => setPageGap(12)}>Tight</button><button className={pageGap === 22 ? 'selected' : ''} onClick={() => setPageGap(22)}>Balanced</button><button className={pageGap === 34 ? 'selected' : ''} onClick={() => setPageGap(34)}>Airy</button></div></div><div className="settings-row"><span>Zoom mode</span><div className="segment"><button className={fitMode === 'fit' ? 'selected' : ''} onClick={() => setZoomPreset('fit')}>Page</button><button className={fitMode === 'width' ? 'selected' : ''} onClick={() => setZoomPreset('width')}>Width</button><button className={fitMode === 'actual' ? 'selected' : ''} onClick={() => setZoomPreset('actual')}>100%</button></div></div><div className="settings-foot"><Keyboard size={12} /> Space + drag pans the canvas · ⌘ + wheel zooms</div></aside>}

    {toast && <div className="toast"><Check size={13} />{toast}</div>}
  </div>
}
