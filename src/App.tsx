import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import {
  Bookmark, ChevronLeft, ChevronRight, Command, Download, FileText, FolderOpen,
  Fullscreen, Grid2X2, Maximize2, Menu, Moon, PanelLeft, Plus, Search, Sparkles,
  Sun, X, ZoomIn, ZoomOut
} from 'lucide-react'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import './styles.css'

GlobalWorkerOptions.workerSrc = pdfWorker

const RECENTS_KEY = 'velum:recents:v2'
const THEME_KEY = 'velum:theme'

type Recent = { name: string; size: number; lastOpened: number }

type ThumbProps = { pdf: PDFDocumentProxy; page: number; active: boolean; onClick: () => void }

function PageThumb({ pdf, page, active, onClick }: ThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let dead = false
    pdf.getPage(page).then(async p => {
      if (dead || !canvasRef.current) return
      const viewport = p.getViewport({ scale: 0.16 })
      const canvas = canvasRef.current
      const ratio = window.devicePixelRatio || 1
      canvas.width = viewport.width * ratio
      canvas.height = viewport.height * ratio
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      await p.render({ canvasContext: ctx, viewport }).promise
    })
    return () => { dead = true }
  }, [pdf, page])
  return <button className={`thumb ${active ? 'active' : ''}`} onClick={onClick} aria-label={`Go to page ${page}`}>
    <div className="thumb-paper"><canvas ref={canvasRef} /></div><span>{page}</span>
  </button>
}

export default function App() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [fileName, setFileName] = useState('Welcome to Velum')
  const [fileSize, setFileSize] = useState(0)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [sidebar, setSidebar] = useState(true)
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) !== 'light')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recents, setRecents] = useState<Recent[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]') } catch { return [] }
  })
  const [bookmarks, setBookmarks] = useState<number[]>([])
  const [searchResults, setSearchResults] = useState<number[]>([])
  const [searching, setSearching] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  const pages = pdf?.numPages ?? 0
  const zoomLabel = `${Math.round(scale * 100)}%`
  const isBookmarked = bookmarks.includes(page)

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }, [dark])

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current) return
    const p = await pdf.getPage(page)
    const base = p.getViewport({ scale: 1 })
    const available = Math.max(480, mainRef.current?.clientWidth ?? 900)
    const fit = Math.min((available - 120) / base.width, 1.22)
    const viewport = p.getViewport({ scale: fit * scale })
    const canvas = canvasRef.current
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.ceil(viewport.width * ratio)
    canvas.height = Math.ceil(viewport.height * ratio)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    await p.render({ canvasContext: ctx, viewport }).promise
  }, [pdf, page, scale])

  useEffect(() => { void renderPage() }, [renderPage])
  useEffect(() => {
    const onResize = () => void renderPage()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [renderPage])

  const openFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.')
      return
    }
    setLoading(true); setError('')
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      const doc = await getDocument({ data }).promise
      ;(window as Window & { __velumPdf?: Uint8Array }).__velumPdf = data
      setPdf(old => { old?.destroy(); return doc })
      setFileName(file.name)
      setFileSize(file.size)
      setPage(1); setScale(1); setBookmarks([]); setQuery(''); setSearchResults([])
      const next = [{ name: file.name, size: file.size, lastOpened: Date.now() }, ...recents.filter(x => x.name !== file.name)].slice(0, 12)
      setRecents(next); localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
    } catch (e) {
      console.error(e); setError('Velum could not open this PDF. The file may be damaged or encrypted.')
    } finally { setLoading(false) }
  }, [recents])

  const pickFile = () => fileInput.current?.click()

  const downloadCurrent = () => {
    const data = (window as Window & { __velumPdf?: Uint8Array }).__velumPdf
    if (!data) return
    const blob = new Blob([data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url)
  }

  const toggleBookmark = () => setBookmarks(v => v.includes(page) ? v.filter(x => x !== page) : [...v, page].sort((a,b) => a-b))

  const runSearch = async (value: string) => {
    setQuery(value)
    if (!pdf || value.trim().length < 2) { setSearchResults([]); return }
    setSearching(true)
    const hits: number[] = []
    const needle = value.toLowerCase()
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const text = await (await pdf.getPage(i)).getTextContent()
        const joined = text.items.map((item: any) => item.str || '').join(' ').toLowerCase()
        if (joined.includes(needle)) hits.push(i)
        if (hits.length >= 40) break
      }
      setSearchResults(hits)
      if (hits.length) setPage(hits[0])
    } finally { setSearching(false) }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFile() }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandOpen(true) }
      if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchInput.current?.focus(), 20) }
      if (e.key === 'ArrowLeft' && pdf) setPage(p => Math.max(1, p - 1))
      if (e.key === 'ArrowRight' && pdf) setPage(p => Math.min(pages, p + 1))
      if (e.key === 'Escape') { setCommandOpen(false); setSearchOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pdf, pages])

  useEffect(() => {
    const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer?.files?.[0]; if (f) void openFile(f) }
    const onOver = (e: DragEvent) => { e.preventDefault(); setDragging(true) }
    window.addEventListener('dragover', onOver); window.addEventListener('drop', onDrop)
    return () => { window.removeEventListener('dragover', onOver); window.removeEventListener('drop', onDrop) }
  }, [openFile])

  const fullscreen = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()
  const welcome = !pdf

  return <div className="app">
    <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void openFile(f); e.currentTarget.value = '' }} />
    {dragging && <div className="drop-overlay"><div className="drop-box"><div className="drop-icon"><FileText size={28}/></div><strong>Drop your PDF here</strong><span>Velum keeps your document on this device.</span></div></div>}
    {loading && <div className="loading"><div className="spinner"/><span>Opening {fileName === 'Welcome to Velum' ? 'PDF' : fileName}…</span></div>}

    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Sparkles size={15}/></div><span>Velum</span><small>PDF</small></div>
      <button className="document-pill" onClick={welcome ? pickFile : undefined}><FileText size={14}/><span>{fileName}</span>{pdf && <span className="doc-pages">{pages} pages</span>}</button>
      <div className="top-actions">
        <button className="icon-btn" title="Search (Ctrl/Cmd + F)" onClick={() => { setSearchOpen(true); setTimeout(() => searchInput.current?.focus(), 20) }}><Search size={17}/></button>
        <button className="icon-btn" title="Command palette" onClick={() => setCommandOpen(true)}><Command size={17}/></button>
        <button className="icon-btn" title="Toggle theme" onClick={() => setDark(v => !v)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
      </div>
    </header>

    <div className="workspace">
      <aside className={`sidebar ${sidebar ? '' : 'closed'}`}>
        <div className="sidebar-top">
          <button className="open-btn" onClick={pickFile}><Plus size={16}/><span>Open PDF</span><kbd>⌘ O</kbd></button>
          <button className="library-search" onClick={() => { setSearchOpen(true); setTimeout(() => searchInput.current?.focus(), 20) }}><Search size={15}/><span>Search in document</span><kbd>⌘ F</kbd></button>
        </div>
        <div className="sidebar-section">
          <div className="section-label">DOCUMENT</div>
          <button className="nav-item active"><Grid2X2 size={15}/><span>Pages</span><b>{pages || '—'}</b></button>
          <button className="nav-item" onClick={() => bookmarks[0] && setPage(bookmarks[0])}><Bookmark size={15}/><span>Bookmarks</span><b>{bookmarks.length || '—'}</b></button>
        </div>
        {pdf ? <div className="thumbs">{Array.from({ length: pages }, (_, i) => <PageThumb key={i+1} pdf={pdf} page={i+1} active={page === i+1} onClick={() => setPage(i+1)} />)}</div> : <div className="sidebar-empty"><FileText size={23}/><span>No document open</span><small>Open a PDF to see its pages.</small></div>}
        <div className="sidebar-section recent-list">
          <div className="section-label">RECENT</div>
          {recents.slice(0, 5).map(r => <div className="recent-row" key={`${r.name}-${r.lastOpened}`}><div className="recent-file"><FileText size={14}/></div><div><strong>{r.name}</strong><span>{Math.max(1, Math.round(r.size / 1024))} KB</span></div></div>)}
          {!recents.length && <small className="muted">Your recently opened files appear here.</small>}
        </div>
        <div className="sidebar-footer"><div className="privacy"><Sparkles size={15}/><div><strong>Local-first</strong><span>No account · no upload</span></div></div></div>
      </aside>

      <main className="reader" ref={mainRef}>
        <div className="reader-toolbar">
          <div className="toolbar-side"><button className="tool-btn" onClick={() => setSidebar(v => !v)} title="Toggle sidebar"><PanelLeft size={17}/></button><span className="breadcrumb">Library <ChevronRight size={12}/><b>{fileName}</b></span></div>
          {pdf && <div className="page-control"><button className="tool-btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p-1))}><ChevronLeft size={17}/></button><span><b>{page}</b> <i>/</i> {pages}</span><button className="tool-btn" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p+1))}><ChevronRight size={17}/></button></div>}
          <div className="toolbar-side right"><button className={`tool-btn ${isBookmarked ? 'selected' : ''}`} onClick={toggleBookmark} disabled={!pdf} title="Bookmark page"><Bookmark size={16}/></button><button className="tool-btn" onClick={() => setScale(s => Math.max(.55, s-.1))} disabled={!pdf}><ZoomOut size={16}/></button><span className="zoom">{pdf ? zoomLabel : 'Fit'}</span><button className="tool-btn" onClick={() => setScale(s => Math.min(2.5, s+.1))} disabled={!pdf}><ZoomIn size={16}/></button><button className="tool-btn" onClick={downloadCurrent} disabled={!pdf} title="Download"><Download size={16}/></button><button className="tool-btn" onClick={fullscreen} title="Fullscreen"><Fullscreen size={16}/></button></div>
        </div>

        {welcome ? <section className="welcome" onDoubleClick={pickFile}>
          <div className="welcome-glow"/><div className="orb"><Sparkles size={27}/></div>
          <div className="welcome-copy"><div className="eyebrow">A calmer PDF workspace</div><h1>Read without<br/><em>the clutter.</em></h1><p>Fast, private, beautifully minimal. Your files stay on your device.</p></div>
          <button className="open-card" onClick={pickFile}><div className="open-icon"><FolderOpen size={20}/></div><div><strong>Open a PDF</strong><span>Choose a document or drag it anywhere</span></div><kbd>⌘ O</kbd></button>
          <div className="feature-row"><span>⌁ Local-first</span><span>·</span><span>PDF.js powered</span><span>·</span><span>Open source</span></div>
          <div className="shortcut-row"><span><kbd>⌘ K</kbd> Commands</span><span><kbd>← →</kbd> Pages</span><span><kbd>⌘ F</kbd> Search</span></div>
        </section> : <div className="canvas-wrap"><div className="paper"><canvas ref={canvasRef}/></div></div>}
      </main>
    </div>

    {error && <div className="toast error"><span>{error}</span><button onClick={() => setError('')}><X size={14}/></button></div>}

    {searchOpen && <div className="modal-backdrop" onMouseDown={() => setSearchOpen(false)}><div className="search-modal" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><Search size={18}/><input ref={searchInput} value={query} onChange={e => void runSearch(e.target.value)} placeholder="Search text in this PDF…"/><kbd>ESC</kbd></div><div className="results">{searching && <div className="result-empty">Searching pages…</div>}{!searching && query.length > 1 && !searchResults.length && <div className="result-empty">No matches found.</div>}{!query && <div className="result-empty">Type at least two characters to search the document.</div>}{searchResults.map(p => <button key={p} onClick={() => { setPage(p); setSearchOpen(false) }}><FileText size={15}/><span>Page {p}</span><ChevronRight size={15}/></button>)}</div></div></div>}

    {commandOpen && <div className="modal-backdrop" onMouseDown={() => setCommandOpen(false)}><div className="command-modal" onMouseDown={e => e.stopPropagation()}><div className="command-title"><Command size={17}/><span>Command palette</span><kbd>ESC</kbd></div><div className="command-list">
      <button onClick={() => { setCommandOpen(false); pickFile() }}><FolderOpen size={16}/><span>Open PDF</span><kbd>⌘ O</kbd></button>
      <button onClick={() => { setCommandOpen(false); setSearchOpen(true); setTimeout(() => searchInput.current?.focus(), 20) }}><Search size={16}/><span>Search document</span><kbd>⌘ F</kbd></button>
      <button onClick={() => { setCommandOpen(false); setDark(v => !v) }}>{dark ? <Sun size={16}/> : <Moon size={16}/>}<span>Toggle appearance</span><kbd>⌘ ⇧ T</kbd></button>
      <button disabled={!pdf} onClick={() => { setCommandOpen(false); setScale(1) }}><Maximize2 size={16}/><span>Reset zoom</span><kbd>0</kbd></button>
      <button onClick={() => { setCommandOpen(false); fullscreen() }}><Fullscreen size={16}/><span>Toggle fullscreen</span><kbd>F11</kbd></button>
    </div></div></div>}
  </div>
}
