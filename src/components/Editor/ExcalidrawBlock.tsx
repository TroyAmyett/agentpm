// Excalidraw drawing block — renders inside TipTap as an inline canvas
// Click to expand into full editor, click outside or Escape to collapse

import { useState, useCallback, useRef, useEffect } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { Pencil, Trash2, Maximize2, Minimize2 } from 'lucide-react'

// Lazy-load Excalidraw to avoid SSR issues and reduce initial bundle
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'
import type { NodeViewProps } from '@tiptap/react'

// Use simple type aliases — Excalidraw v0.18 exports types from subpaths
type ExcalidrawElementType = Record<string, unknown> & { isDeleted?: boolean }

export function ExcalidrawBlock({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const excalidrawApiRef = useRef<any>(null)

  // Parse stored scene data
  const sceneData = node.attrs.data ? (() => {
    try { return JSON.parse(node.attrs.data) } catch { return null }
  })() : null

  const hasContent = sceneData?.elements?.length > 0

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

  // Close editor on Escape
  useEffect(() => {
    if (!isEditing) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        generateThumbnail()
        setIsEditing(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isEditing, generateThumbnail])

  // Cleanup thumbnail URLs
  useEffect(() => {
    return () => {
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [thumbnailUrl])

  if (isEditing) {
    return (
      <NodeViewWrapper>
        <div
          ref={containerRef}
          className={`relative rounded-xl border overflow-hidden my-4 ${
            selected ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-white/[0.1]'
          }`}
          style={{ height: '480px' }}
        >
          {/* Toolbar overlay */}
          <div className="absolute top-2 right-2 z-50 flex items-center gap-1">
            <button
              onClick={() => {
                generateThumbnail()
                setIsEditing(false)
              }}
              className="p-1.5 rounded-md bg-surface-800/80 backdrop-blur text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
              title="Collapse (Esc)"
            >
              <Minimize2 size={14} />
            </button>
            <button
              onClick={deleteNode}
              className="p-1.5 rounded-md bg-surface-800/80 backdrop-blur text-red-400 hover:text-red-300 hover:bg-red-900/50 transition-colors"
              title="Delete drawing"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <Excalidraw
            excalidrawAPI={(api: any) => { excalidrawApiRef.current = api }}
            initialData={sceneData || undefined}
            onChange={handleChange}
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
        </div>
      </NodeViewWrapper>
    )
  }

  // Collapsed view — thumbnail or placeholder
  return (
    <NodeViewWrapper>
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
