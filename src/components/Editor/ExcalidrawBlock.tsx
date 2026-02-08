// Excalidraw drawing block — renders inside TipTap as an inline canvas
// Clicking opens a fullscreen overlay for maximum drawing area
// Libraries auto-fetched from CDN on first use, cached in localStorage

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NodeViewWrapper } from '@tiptap/react'
import { Pencil, Trash2, Maximize2, X, Loader2 } from 'lucide-react'

// Excalidraw component + required stylesheet
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { NodeViewProps } from '@tiptap/react'

// Use simple type aliases — Excalidraw v0.18 exports types from subpaths
type ExcalidrawElementType = Record<string, unknown> & { isDeleted?: boolean }

// ---------------------------------------------------------------------------
// Library persistence + auto-fetch defaults
// ---------------------------------------------------------------------------
const LIBRARY_KEY = 'excalidraw-library'
const LIBRARY_LOADED_KEY = 'excalidraw-defaults-loaded'

// Curated libraries fetched from Excalidraw CDN on first use
// Swap these URLs to a self-hosted VPS endpoint later if needed
const DEFAULT_LIBRARY_URLS = [
  'https://libraries.excalidraw.com/libraries/youritjang/software-architecture.excalidrawlib',
  'https://libraries.excalidraw.com/libraries/BjoernKW/UML-ER-library.excalidrawlib',
  'https://libraries.excalidraw.com/libraries/aretecode/system-design-template.excalidrawlib',
  'https://libraries.excalidraw.com/libraries/spfr/lo-fi-wireframing-kit.excalidrawlib',
  'https://libraries.excalidraw.com/libraries/pgilfernandez/basic-shapes.excalidrawlib',
  'https://libraries.excalidraw.com/libraries/danimaniarqsoft/scrum-board.excalidrawlib',
]

function getStoredLibrary(): any[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLibrary(items: any[]) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items))
  } catch {
    // Storage full or unavailable
  }
}

// Fetch curated libraries once, merge into localStorage
let fetchPromise: Promise<void> | null = null

function ensureDefaultLibraries(): Promise<void> {
  if (localStorage.getItem(LIBRARY_LOADED_KEY)) return Promise.resolve()
  if (fetchPromise) return fetchPromise

  fetchPromise = (async () => {
    const allItems: any[] = [...getStoredLibrary()]

    const results = await Promise.allSettled(
      DEFAULT_LIBRARY_URLS.map(async (url) => {
        const res = await fetch(url)
        if (!res.ok) return []
        const data = await res.json()
        return data.libraryItems || data.library || []
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allItems.push(...result.value)
      }
    }

    saveLibrary(allItems)
    localStorage.setItem(LIBRARY_LOADED_KEY, '1')
  })()

  return fetchPromise
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExcalidrawBlock({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [libraryReady, setLibraryReady] = useState(!!localStorage.getItem(LIBRARY_LOADED_KEY))
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const excalidrawApiRef = useRef<any>(null)

  // Parse stored scene data
  const sceneData = node.attrs.data ? (() => {
    try { return JSON.parse(node.attrs.data) } catch { return null }
  })() : null

  const hasContent = sceneData?.elements?.length > 0

  // Auto-fetch default libraries when editor opens
  useEffect(() => {
    if (!isEditing) return
    let cancelled = false
    ensureDefaultLibraries().then(() => {
      if (!cancelled) setLibraryReady(true)
    })
    return () => { cancelled = true }
  }, [isEditing])

  // Build initialData with library items included
  const initialData = (isEditing && libraryReady) ? {
    ...(sceneData || {}),
    libraryItems: getStoredLibrary(),
  } : undefined

  // Auto-center on content when opening a drawing that has elements
  useEffect(() => {
    if (!isEditing || !libraryReady) return
    const timer = setTimeout(() => {
      const api = excalidrawApiRef.current
      if (!api) return
      const els = api.getSceneElements()
      if (els.length > 0) api.scrollToContent(els, { fitToContent: true })
    }, 150)
    return () => clearTimeout(timer)
  }, [isEditing, libraryReady])

  // Generate thumbnail when collapsing
  const generateThumbnail = useCallback(async () => {
    const api = excalidrawApiRef.current
    if (!api) return

    try {
      const elements = api.getSceneElements()
      if (elements.length === 0) {
        setThumbnailUrl(null)
        return
      }
      const blob = await exportToBlob({
        elements,
        appState: { exportWithDarkMode: true, exportBackground: false },
        files: api.getFiles(),
      })
      const url = URL.createObjectURL(blob)
      setThumbnailUrl(url)
    } catch {
      // Thumbnail generation failed — not critical
    }
  }, [])

  const closeEditor = useCallback(() => {
    generateThumbnail()
    setIsEditing(false)
  }, [generateThumbnail])

  // Save scene data to TipTap node attrs (debounced)
  const handleChange = useCallback(
    (elements: readonly ExcalidrawElementType[]) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        const data = JSON.stringify({
          elements: elements.filter((e) => !e.isDeleted),
          appState: {},
          files: {},
        })
        updateAttributes({ data })
      }, 300)
    },
    [updateAttributes]
  )

  // Persist library items when user adds/removes from the panel
  const handleLibraryChange = useCallback((items: readonly any[]) => {
    saveLibrary([...items])
  }, [])

  // Close editor on Escape
  useEffect(() => {
    if (!isEditing) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeEditor()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isEditing, closeEditor])

  // Cleanup thumbnail URLs
  useEffect(() => {
    return () => {
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [thumbnailUrl])

  // Fullscreen overlay rendered via portal
  const fullscreenEditor = isEditing
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col"
          style={{ background: '#181818' }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.08]"
            style={{ background: 'rgba(24, 24, 27, 0.95)', backdropFilter: 'blur(12px)' }}
          >
            <div className="flex items-center gap-2 text-surface-300">
              <Pencil size={16} className="text-primary-400" />
              <span className="text-sm font-medium">Drawing</span>
              {!libraryReady && (
                <span className="flex items-center gap-1 text-xs text-surface-500">
                  <Loader2 size={12} className="animate-spin" />
                  Loading libraries...
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  deleteNode()
                  setIsEditing(false)
                }}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors"
                title="Delete drawing"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={closeEditor}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-surface-300 hover:text-white hover:bg-surface-700 transition-colors flex items-center gap-1.5"
                title="Close (Esc)"
              >
                <X size={14} />
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Excalidraw fills remaining space */}
          <div className="flex-1 relative">
            {libraryReady ? (
              <Excalidraw
                excalidrawAPI={(api: any) => { excalidrawApiRef.current = api }}
                initialData={initialData}
                onChange={handleChange}
                onLibraryChange={handleLibraryChange}
                theme="dark"
                UIOptions={{
                  canvasActions: {
                    saveToActiveFile: false,
                    loadScene: false,
                    export: false,
                    toggleTheme: false,
                  },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-surface-500">
                <Loader2 size={24} className="animate-spin mr-2" />
                Loading drawing libraries...
              </div>
            )}
          </div>
        </div>,
        document.body
      )
    : null

  // Collapsed view — thumbnail or placeholder
  return (
    <NodeViewWrapper>
      {fullscreenEditor}
      <div
        className={`relative group rounded-xl border cursor-pointer my-4 transition-all hover:-translate-y-0.5 hover:shadow-card-hover ${
          selected ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-white/[0.08]'
        }`}
        style={{
          background: 'rgba(24, 24, 27, 0.6)',
          backdropFilter: 'blur(8px)',
          minHeight: hasContent ? '120px' : '80px',
        }}
        onClick={() => setIsEditing(true)}
      >
        {/* Action buttons */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsEditing(true)
            }}
            className="p-1.5 rounded-md bg-surface-800/80 backdrop-blur text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
            title="Edit drawing"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteNode()
            }}
            className="p-1.5 rounded-md bg-surface-800/80 backdrop-blur text-red-400 hover:text-red-300 hover:bg-red-900/50 transition-colors"
            title="Delete drawing"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {thumbnailUrl && hasContent ? (
          <div className="flex items-center justify-center p-4">
            <img
              src={thumbnailUrl}
              alt="Drawing preview"
              className="max-h-[200px] object-contain rounded"
            />
          </div>
        ) : hasContent ? (
          <div className="flex items-center gap-3 p-4 text-surface-400">
            <Pencil size={20} className="text-primary-400" />
            <div>
              <p className="text-sm font-medium text-surface-200">Drawing</p>
              <p className="text-xs">
                {sceneData?.elements?.length || 0} element{(sceneData?.elements?.length || 0) !== 1 ? 's' : ''} — click to edit
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 text-surface-400">
            <Pencil size={20} className="text-primary-400" />
            <div>
              <p className="text-sm font-medium text-surface-200">Empty Drawing</p>
              <p className="text-xs">Click to start drawing</p>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}
