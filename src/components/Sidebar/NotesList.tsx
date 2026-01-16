import { useState } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { FolderTree } from './FolderTree'
import { toMarkdown } from '@/utils/markdown'
import JSZip from 'jszip'
import {
  Plus,
  Search,
  FolderPlus,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Note } from '@/types'

export function NotesList() {
  const {
    notes,
    folders,
    addNote,
    addFolder,
    searchNotes,
    setCurrentNote,
    currentNoteId,
    getAllDescendantNotes,
    getFolderPath,
  } = useNotesStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Note[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim()) {
      setIsSearching(true)
      setSearchResults(searchNotes(query))
    } else {
      setIsSearching(false)
      setSearchResults([])
    }
  }

  const handleNewNote = () => {
    addNote({ title: 'Untitled' })
  }

  const handleNewFolder = () => {
    addFolder({ name: 'New Folder' })
  }

  const handleExportFolder = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return

    const descendantNotes = getAllDescendantNotes(folderId)
    const notesInFolder = notes.filter((n) => n.folder_id === folderId)
    const allNotes = [...notesInFolder, ...descendantNotes]

    if (allNotes.length === 0) {
      alert('No notes to export in this folder.')
      return
    }

    // Create ZIP file
    const zip = new JSZip()

    // Helper to get folder path for a note
    const getFolderPathForNote = (note: Note): string => {
      if (!note.folder_id) return ''
      const path = getFolderPath(note.folder_id)
      // Remove the root folder from path since we're exporting from there
      const relativePath = path.slice(path.findIndex((f) => f.id === folderId))
      return relativePath.map((f) => sanitizeName(f.name)).join('/')
    }

    // Add notes to ZIP
    for (const note of allNotes) {
      const markdown = toMarkdown(note.content)
      const filename = sanitizeName(note.title || 'untitled') + '.md'
      const folderPath = getFolderPathForNote(note)
      const fullPath = folderPath ? `${folderPath}/${filename}` : filename
      zip.file(fullPath, markdown)
    }

    // Generate and download ZIP
    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeName(folder.name)}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            Notes
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewFolder}
              className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              title="New folder"
            >
              <FolderPlus size={18} />
            </button>
            <button
              onClick={handleNewNote}
              className="p-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition-colors"
              title="New note"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-9 pr-8 py-2 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isSearching ? (
        // Search Results
        <div className="flex-1 overflow-y-auto p-2">
          <div className="px-2 py-1 text-xs font-medium text-surface-500 uppercase tracking-wider">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          </div>
          <AnimatePresence>
            {searchResults.map((note) => (
              <motion.button
                key={note.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setCurrentNote(note.id)
                  handleSearch('')
                }}
                className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${
                  currentNoteId === note.id
                    ? 'bg-primary-50 dark:bg-primary-900/30'
                    : 'hover:bg-surface-100 dark:hover:bg-surface-800'
                }`}
              >
                <div className="font-medium text-sm truncate">
                  {note.title || 'Untitled'}
                </div>
                <div className="text-xs text-surface-500 mt-1">
                  {formatDate(note.updated_at)}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        // Folder Tree
        <FolderTree onExportFolder={handleExportFolder} />
      )}
    </div>
  )
}

// Helper to sanitize folder/file names
function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '-').trim() || 'untitled'
}
