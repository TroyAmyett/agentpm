import { useState, useRef } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  FolderPlus,
  Download,
  Plus,
} from 'lucide-react'
import type { Folder as FolderType, Note } from '@/types'

interface FolderItemProps {
  folder: FolderType
  depth: number
  index: number
  parentId: string | null
  onExportFolder: (folderId: string) => void
}

function FolderItem({ folder, depth, index, parentId, onExportFolder }: FolderItemProps) {
  const {
    currentFolderId,
    expandedFolders,
    setCurrentFolder,
    toggleFolderExpanded,
    getFolderChildren,
    getNotesInFolder,
    updateFolder,
    deleteFolder,
    addFolder,
    addNote,
    moveNoteToFolder,
    moveFolderTo,
    reorderFolder,
  } = useNotesStore()

  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(folder.name)
  const [isDragOver, setIsDragOver] = useState(false)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | 'inside' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRef = useRef<HTMLDivElement>(null)

  const isExpanded = expandedFolders.has(folder.id)
  const isSelected = currentFolderId === folder.id
  const children = getFolderChildren(folder.id)
  const notes = getNotesInFolder(folder.id)
  const hasChildren = children.length > 0 || notes.length > 0

  const handleRename = () => {
    if (renameValue.trim() && renameValue !== folder.name) {
      updateFolder(folder.id, { name: renameValue.trim() })
    }
    setIsRenaming(false)
  }

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('folder-id', folder.id)
    e.dataTransfer.setData('folder-parent-id', parentId || '')
    e.dataTransfer.setData('folder-index', String(index))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const rect = itemRef.current?.getBoundingClientRect()
    if (!rect) return

    const draggedFolderId = e.dataTransfer.types.includes('folder-id')
    const draggedNoteId = e.dataTransfer.types.includes('note-id')

    if (draggedNoteId) {
      // Notes always go inside folders
      setDropPosition('inside')
      setIsDragOver(true)
    } else if (draggedFolderId) {
      // For folders, calculate top/middle/bottom thirds
      const third = rect.height / 3
      const relativeY = e.clientY - rect.top

      if (relativeY < third) {
        setDropPosition('above')
        setIsDragOver(false)
      } else if (relativeY > third * 2) {
        setDropPosition('below')
        setIsDragOver(false)
      } else {
        // Middle third = drop inside
        setDropPosition('inside')
        setIsDragOver(true)
      }
    }
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
    setDropPosition(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const currentDropPosition = dropPosition
    setIsDragOver(false)
    setDropPosition(null)

    const noteId = e.dataTransfer.getData('note-id')
    const draggedFolderId = e.dataTransfer.getData('folder-id')
    const draggedParentId = e.dataTransfer.getData('folder-parent-id') || null
    const draggedIndex = parseInt(e.dataTransfer.getData('folder-index'), 10)

    if (noteId) {
      // Move note into this folder
      moveNoteToFolder(noteId, folder.id)
    } else if (draggedFolderId && draggedFolderId !== folder.id) {
      if (currentDropPosition === 'inside') {
        // Move folder inside this folder
        moveFolderTo(draggedFolderId, folder.id)
      } else if (currentDropPosition === 'above' || currentDropPosition === 'below') {
        // Reorder within same parent
        const isSameParent = draggedParentId === (parentId || '')

        if (isSameParent) {
          let newPosition = currentDropPosition === 'above' ? index : index + 1
          if (draggedIndex < newPosition) {
            newPosition = newPosition - 1
          }
          reorderFolder(draggedFolderId, newPosition)
        } else {
          // Move to different parent, then it will be at the end
          moveFolderTo(draggedFolderId, parentId)
        }
      }
    }
  }

  return (
    <div ref={itemRef} className="relative">
      {/* Drop indicator above */}
      {dropPosition === 'above' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-primary-500 rounded-full z-10" />
      )}

      <div
        className={`group flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/30'
            : isDragOver
            ? 'bg-primary-100 dark:bg-primary-900/40'
            : 'hover:bg-surface-100 dark:hover:bg-surface-800'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          setCurrentFolder(folder.id)
          if (!isExpanded) toggleFolderExpanded(folder.id)
        }}
      >
        {/* Expand/collapse */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFolderExpanded(folder.id)
          }}
          className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={14} className="text-surface-500" />
            ) : (
              <ChevronRight size={14} className="text-surface-500" />
            )
          ) : (
            <span className="w-3.5" />
          )}
        </button>

        {/* Folder icon */}
        {isExpanded ? (
          <FolderOpen size={16} className="text-primary-500 flex-shrink-0" />
        ) : (
          <Folder size={16} className="text-surface-400 flex-shrink-0" />
        )}

        {/* Name */}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') setIsRenaming(false)
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-white dark:bg-surface-800 border border-primary-500 rounded px-1 text-sm focus:outline-none"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm truncate">{folder.name}</span>
        )}

        {/* Quick action icons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              const noteName = prompt('Enter note title:')
              if (noteName && noteName.trim()) {
                addNote({ folder_id: folder.id, title: noteName.trim() })
                if (!isExpanded) toggleFolderExpanded(folder.id)
              }
            }}
            className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
            title="New Note"
          >
            <Plus size={12} className="text-surface-500" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              const folderName = prompt('Enter subfolder name:')
              if (folderName && folderName.trim()) {
                addFolder({ parent_id: folder.id, name: folderName.trim() })
                if (!isExpanded) toggleFolderExpanded(folder.id)
              }
            }}
            className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
            title="New Subfolder"
          >
            <FolderPlus size={12} className="text-surface-500" />
          </button>
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(!menuOpen)
            }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-200 dark:hover:bg-surface-700 transition-opacity"
          >
            <MoreVertical size={14} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-6 z-50 rounded-lg shadow-lg py-1 min-w-[160px]"
                  style={{
                    background: 'var(--fl-color-bg-elevated, #1a1a24)',
                    border: '1px solid var(--fl-color-border, rgba(255,255,255,0.1))',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const folderName = prompt('Enter subfolder name:')
                      if (folderName && folderName.trim()) {
                        addFolder({ parent_id: folder.id, name: folderName.trim() })
                        if (!isExpanded) toggleFolderExpanded(folder.id)
                      }
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--fl-color-text-primary)] hover:bg-white/5"
                  >
                    <FolderPlus size={14} />
                    New Subfolder
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const noteName = prompt('Enter note title:')
                      if (noteName && noteName.trim()) {
                        addNote({ folder_id: folder.id, title: noteName.trim() })
                        if (!isExpanded) toggleFolderExpanded(folder.id)
                      }
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--fl-color-text-primary)] hover:bg-white/5"
                  >
                    <Plus size={14} />
                    New Note
                  </button>
                  <div className="h-px bg-white/10 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsRenaming(true)
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--fl-color-text-primary)] hover:bg-white/5"
                  >
                    <Pencil size={14} />
                    Rename
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onExportFolder(folder.id)
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--fl-color-text-primary)] hover:bg-white/5"
                  >
                    <Download size={14} />
                    Export Folder
                  </button>
                  <div className="h-px bg-white/10 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete "${folder.name}" and all its contents?`)) {
                        deleteFolder(folder.id, true)
                      }
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Children */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Subfolders */}
            {children.map((child, childIndex) => (
              <FolderItem
                key={child.id}
                folder={child}
                depth={depth + 1}
                index={childIndex}
                parentId={folder.id}
                onExportFolder={onExportFolder}
              />
            ))}

            {/* Notes in folder */}
            {notes.map((note, index) => (
              <NoteItem
                key={note.id}
                note={note}
                depth={depth + 1}
                index={index}
                totalInFolder={notes.length}
                folderId={folder.id}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drop indicator below */}
      {dropPosition === 'below' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary-500 rounded-full z-10" />
      )}
    </div>
  )
}

interface NoteItemProps {
  note: Note
  depth: number
  index: number
  totalInFolder: number
  folderId: string | null
}

function NoteItem({ note, depth, index, folderId }: NoteItemProps) {
  const { currentNoteId, setCurrentNote, deleteNote, moveNoteToFolder, reorderNote } = useNotesStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
  const itemRef = useRef<HTMLDivElement>(null)
  const isSelected = currentNoteId === note.id

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('note-id', note.id)
    e.dataTransfer.setData('note-folder-id', folderId || '')
    e.dataTransfer.setData('note-index', String(index))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const draggedNoteId = e.dataTransfer.types.includes('note-id')
    if (!draggedNoteId) return

    // Calculate if cursor is in top or bottom half
    const rect = itemRef.current?.getBoundingClientRect()
    if (rect) {
      const midY = rect.top + rect.height / 2
      setDropPosition(e.clientY < midY ? 'above' : 'below')
    }
  }

  const handleDragLeave = () => {
    setDropPosition(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropPosition(null)

    const draggedNoteId = e.dataTransfer.getData('note-id')
    const draggedFolderId = e.dataTransfer.getData('note-folder-id') || null
    const draggedIndex = parseInt(e.dataTransfer.getData('note-index'), 10)

    if (!draggedNoteId || draggedNoteId === note.id) return

    // Check if same folder (reorder) or different folder (move)
    const isSameFolder = draggedFolderId === (folderId || '')

    if (isSameFolder) {
      // Reorder within same folder
      const rect = itemRef.current?.getBoundingClientRect()
      if (rect) {
        const midY = rect.top + rect.height / 2
        let newPosition = e.clientY < midY ? index : index + 1

        // Adjust for dragging down (the item being moved will shift positions)
        if (draggedIndex < newPosition) {
          newPosition = newPosition - 1
        }

        reorderNote(draggedNoteId, newPosition)
      }
    } else {
      // Move to different folder - place at position
      moveNoteToFolder(draggedNoteId, folderId)
    }
  }

  return (
    <div ref={itemRef} className="relative">
      {/* Drop indicator above */}
      {dropPosition === 'above' && (
        <div className="absolute top-0 left-4 right-2 h-0.5 bg-primary-500 rounded-full z-10" />
      )}

      <div
        className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/30'
            : 'hover:bg-surface-100 dark:hover:bg-surface-800'
        }`}
        style={{ paddingLeft: `${depth * 16 + 24}px` }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => setCurrentNote(note.id)}
      >
        <FileText size={14} className="text-surface-400 flex-shrink-0" />
        <span className="flex-1 text-sm truncate">{note.title || 'Untitled'}</span>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(!menuOpen)
            }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-200 dark:hover:bg-surface-700 transition-opacity"
          >
            <MoreVertical size={14} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-6 z-50 rounded-lg shadow-lg py-1 min-w-[140px]"
                  style={{
                    background: 'var(--fl-color-bg-elevated, #1a1a24)',
                    border: '1px solid var(--fl-color-border, rgba(255,255,255,0.1))',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      moveNoteToFolder(note.id, null)
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--fl-color-text-primary)] hover:bg-white/5"
                  >
                    <Folder size={14} />
                    Move to Root
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteNote(note.id)
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Drop indicator below */}
      {dropPosition === 'below' && (
        <div className="absolute bottom-0 left-4 right-2 h-0.5 bg-primary-500 rounded-full z-10" />
      )}
    </div>
  )
}

interface FolderTreeProps {
  onExportFolder: (folderId: string) => void
}

export function FolderTree({ onExportFolder }: FolderTreeProps) {
  const {
    getFolderChildren,
    getNotesInFolder,
    currentFolderId,
    setCurrentFolder,
    moveNoteToFolder,
    moveFolderTo,
  } = useNotesStore()

  const [isDragOverRoot, setIsDragOverRoot] = useState(false)

  const rootFolders = getFolderChildren(null)
  const rootNotes = getNotesInFolder(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverRoot(true)
  }

  const handleDragLeave = () => {
    setIsDragOverRoot(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverRoot(false)

    const noteId = e.dataTransfer.getData('note-id')
    const folderId = e.dataTransfer.getData('folder-id')

    if (noteId) {
      moveNoteToFolder(noteId, null)
    } else if (folderId) {
      moveFolderTo(folderId, null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* All Notes (root) */}
      <div
        className={`flex items-center gap-2 py-2 px-3 cursor-pointer transition-colors ${
          currentFolderId === null
            ? 'bg-primary-50 dark:bg-primary-900/30'
            : isDragOverRoot
            ? 'bg-primary-100 dark:bg-primary-900/40'
            : 'hover:bg-surface-100 dark:hover:bg-surface-800'
        }`}
        onClick={() => setCurrentFolder(null)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Folder size={16} className="text-surface-500" />
        <span className="text-sm font-medium">All Folders</span>
      </div>

      <div className="h-px bg-surface-200 dark:bg-surface-700 mx-2 my-1" />

      {/* Folder tree */}
      <div className="px-1">
        {rootFolders.map((folder, index) => (
          <FolderItem
            key={folder.id}
            folder={folder}
            depth={0}
            index={index}
            parentId={null}
            onExportFolder={onExportFolder}
          />
        ))}

        {/* Root notes (not in any folder) */}
        {currentFolderId === null &&
          rootNotes.map((note, index) => (
            <NoteItem
              key={note.id}
              note={note}
              depth={0}
              index={index}
              totalInFolder={rootNotes.length}
              folderId={null}
            />
          ))}
      </div>
    </div>
  )
}
