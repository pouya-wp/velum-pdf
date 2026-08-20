import { useEffect, useMemo, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import { getVersion } from 'pdfjs-dist/build/pdf.mjs'
import {
  BookOpen, ChevronDown, ChevronLeft, ChevronRight, Command, Download, FileText,
  FolderOpen, Grid2X2, Maximize2, Menu, Moon, MoreHorizontal, PanelLeft,
  Plus, Search, Sparkles, Sun, ZoomIn, ZoomOut
} from 'lucide-react'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

const RECENTS_KEY = 'velum-recents'

type Recent = { name: string; size: number; lastOpened: number }

type PageThumbProps = { pdf: PDFDocumentProxy; page: number; active: boolean; onClick: () => void }

function PageThumb({ pdf, page, active, onClick }: PageThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    pdf.getPage(page).then(async (p) => {
      if (cancelled || !ref.current) return
      const viewport = p.getViewport({ scale: 0.18 })
      const canvas = ref.current
      canvas.width = viewport.width
      canvas.height = viewport.height
      await p.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
    })
    return () => { cancelled = true }
  }, [pdf, page])
  return <button className={`thumb ${active ? 'active' : ''}`} onClick={onClick} title={`Page ${page}`}>
    <div className="thumb-paper"><canvas ref={ref} /></div>
    <span>{page}</span>
  </button>
}

export default function App() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [fileName, setFileName] = useState('Welcome to Velum')
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [dark, setDark] = useState(true)
  const [sidebar, setSidebar] = useState(true)
  const [search, setSearch] = useState('')
  const [recent, setRecent] = useState<Recent[]>(() => JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'))
  const [dragging, setDragging] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const pages = pdf?.numPages ?? 1
  const zoomLabel = `${Math.round(scale * 100)}%`

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    pdf.getPage(page).then(async (p: PDFPageProxy) => {
      if (cancelled || !canvasRef.current) return
      const base = p.getViewport({ scale: 1 })
      const maxWidth = Math.min(window.innerWidth * (sidebar ? 0.64 : 0.76), 980)
      const fit = Math.min(maxWidth / base.width, 1.12)
      const viewport = p.getViewport({ scale: fit * scale })
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
    return () => { cancelled = true }
  }, [pdf, page, scale, sidebar])

  const openFile = async (file: File) => {
    if (!file || file.type !== 'application/pdf') return
    const data = new Uint8Array(await file.arrayBuffer())
    const task = getDocument({ data })
    const doc = await task.promise
    setPdf(doc)
    setFileName(file.name)
    setPage(1)
    setScale(1)
    const next = [{ name: file.name, size: file.size, lastOpened: Date.now() }, ...recent.filter(r => r.name !== file.name)].slice(0, 8)
    setRecent(next)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void openFile(file)
  }

  const welcome = !pdf
  const subtitle = useMemo(() => welcome ? 'A calm place for your documents.' : `${pages} pages · ${zoomLabel}`, [welcome, pages, zoomLabel])

  return <div className="app" onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
    {dragging && <div className="drop-overlay"><div><FileText size={42}/><strong>Drop your PDF here</strong><span>Release to open it in Velum</span></div></div>}

    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Sparkles size={15}/></div><span>Velum</span></div>
      <div className="window-title"><FileText size={14}/><span>{fileName}</span><ChevronDown size={14}/></div>
      <div className="top-actions">
        <button className="icon-btn" title="Command palette"><Command size={17}/></button>
        <button className="icon-btn" title="Toggle theme" onClick={() => setDark(v => !v)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
        <button className="avatar">P</button>
      </div>
    </header>

    <div className="workspace">
      <aside className={`sidebar ${sidebar ? '' : 'closed'}`}>
        <div className="sidebar-top">
          <button className="new-btn" onClick={() => fileInput.current?.click()}><Plus size={16}/><span>Open PDF</span><kbd>⌘ O</kbd></button>
          <input ref={fileInput} type="file" accept="application/pdf" hidden onChange={e => { const f=e.target.files?.[0]; if(f) void openFile(f) }} />
          <div className="side-search"><Search size={15}/><input placeholder="Search documents" value={search} onChange={e=>setSearch(e.target.value)}/><kbd>⌘ K</kbd></div>
        </div>
        <div className="sidebar-section">
          <div className="section-label">LIBRARY</div>
          <button className="nav-item active"><BookOpen size={16}/><span>All documents</span></button>
          <button className="nav-item"><Grid2X2 size={16}/><span>Recent</span></button>
        </div>
        <div className="sidebar-section recent-section">
          <div className="section-label">RECENT</div>
          {recent.filter(r => r.name.toLowerCase().includes(search.toLowerCase())).map(r => <button key={r.name} className="recent-item" onClick={() => fileInput.current?.click()}><div className="recent-icon"><FileText size={15}/></div><div><strong>{r.name}</strong><span>{Math.max(1, Math.round(r.size/1024))} KB</span></div></button>)}
          {!recent.length && <div className="empty-recent">Your opened PDFs<br/>will appear here.</div>}
        </div>
        <div className="sidebar-bottom"><div className="pro-card"><Sparkles size={16}/><div><strong>Velum is yours.</strong><span>Open source · no account</span></div></div></div>
      </aside>

      <main className="reader">
        <div className="reader-toolbar">
          <div className="tool-group"><button className="tool-btn" onClick={()=>setSidebar(v=>!v)}><PanelLeft size={17}/></button><span className="crumb">Documents <ChevronRight size={13}/><b>{fileName}</b></span></div>
          <div className="page-control"><button className="tool-btn" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={17}/></button><span><b>{page}</b> / {pages}</span><button className="tool-btn" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}><ChevronRight size={17}/></button></div>
          <div className="tool-group"><button className="tool-btn" onClick={()=>setScale(s=>Math.max(.6,s-.1))}><ZoomOut size={16}/></button><span className="zoom">{zoomLabel}</span><button className="tool-btn" onClick={()=>setScale(s=>Math.min(2,s+.1))}><ZoomIn size={16}/></button><button className="tool-btn"><Download size={16}/></button><button className="tool-btn"><Maximize2 size={16}/></button><button className="tool-btn"><MoreHorizontal size={17}/></button></div>
        </div>

        {welcome ? <section className="welcome" onClick={() => fileInput.current?.click()}>
          <div className="orb"><Sparkles size={28}/></div>
          <div className="welcome-copy"><p className="eyebrow">A new kind of PDF reader</p><h1>Quietly powerful.<br/><em>Beautifully simple.</em></h1><p>{subtitle}</p></div>
          <div className="open-card"><div className="open-icon"><FolderOpen size={21}/></div><div><strong>Open a PDF</strong><span>Drag & drop or click to browse</span></div><kbd>⌘ O</kbd></div>
          <div className="hint-row"><span>PDF.js {getVersion()}</span><span>·</span><span>Local-first</span><span>·</span><span>Open source</span></div>
        </section> : <div className="canvas-wrap"><div className="paper"><canvas ref={canvasRef}/></div></div>}
      </main>
    </div>
  </div>
}
