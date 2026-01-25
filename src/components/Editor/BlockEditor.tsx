import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { useUIStore } from '@/stores/uiStore'
import { useTemplatesStore } from '@/stores/templatesStore'
import { SlashCommand } from './SlashCommand'
import { FormattingToolbar } from './FormattingToolbar'
import { SaveAsTemplateModal } from './SaveAsTemplateModal'
import { BookTemplate } from 'lucide-react'

// Debounce helper with flush capability for note updates
interface DebouncedNoteUpdate {
  (noteId: string, content: JSONContent): void
  cancel: () => void
  flush: () => void
}

function createDebouncedNoteUpdate(
  fn: (noteId: string, content: JSONContent) => void,
  delay: number
): DebouncedNoteUpdate {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let pendingNoteId: string | null = null
  let pendingContent: JSONContent | null = null

  const debounced = (noteId: string, content: JSONContent) => {
    pendingNoteId = noteId
    pendingContent = content
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      fn(noteId, content)
      pendingNoteId = null
      pendingContent = null
      timeoutId = null
    }, delay)
  }

  debounced.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = null
    pendingNoteId = null
    pendingContent = null
  }

  // Flush immediately executes any pending call
  debounced.flush = () => {
    if (timeoutId && pendingNoteId && pendingContent) {
      clearTimeout(timeoutId)
      fn(pendingNoteId, pendingContent)
      timeoutId = null
      pendingNoteId = null
      pendingContent = null
    }
  }

  return debounced
}

export function BlockEditor() {
  const { currentNoteId, notes, updateNote, isAuthenticated } = useNotesStore()
  const { showAIToolbar, hideAIToolbar } = useUIStore()
  const { createTemplate } = useTemplatesStore()

  const currentNote = notes.find((n) => n.id === currentNoteId)
  const [showTemplateModal, setShowTemplateModal] = useState(false)

  // Track right-click to prevent AI toolbar during context menu
  const isRightClickRef = useRef(false)
  // Timer for delayed AI toolbar show
  const aiToolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track if we're setting content programmatically (to avoid save loop)
  const isSettingContentRef = useRef(false)

  // Debounced update function - saves after 500ms of inactivity
  const debouncedUpdate = useMemo(
    () =>
      createDebouncedNoteUpdate((noteId: string, content: JSONContent) => {
        updateNote(noteId, { content })
      }, 500),
    [updateNote]
  )

  // Flush pending saves when note changes or component unmounts
  // This ensures content is saved before switching away
  useEffect(() => {
    return () => {
      // Flush any pending update to ensure content is saved
      debouncedUpdate.flush()
    }
  }, [debouncedUpdate, currentNoteId])

  const handleSaveAsTemplate = useCallback(() => {
    if (currentNote && currentNote.content && isAuthenticated) {
      setShowTemplateModal(true)
    }
  }, [currentNote, isAuthenticated])

  const handleSaveTemplate = useCallback(async (data: {
    name: string
    description: string
    icon: string
    category: string
  }) => {
    if (!currentNote?.content) {
      throw new Error('Note has no content')
    }

    await createTemplate({
      name: data.name,
      description: data.description || undefined,
      icon: data.icon,
      category: data.category || undefined,
      content: currentNote.content,
    })
  }, [currentNote, createTemplate])

  // Handle right-click (context menu)
  const handleContextMenu = useCallback(() => {
    isRightClickRef.current = true
    // Reset after a short delay
    setTimeout(() => {
      isRightClickRef.current = false
    }, 500)
  }, [])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (aiToolbarTimerRef.current) {
        clearTimeout(aiToolbarTimerRef.current)
      }
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return 'Heading...'
          }
          return 'Type \'/\' for commands, or start writing...'
        },
      }),
      Underline,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      SlashCommand,
    ],
    content: currentNote?.content || '',
    editorProps: {
      attributes: {
        class: 'tiptap prose prose-lg max-w-none focus:outline-none',
      },
      handleDOMEvents: {
        contextmenu: () => {
          handleContextMenu()
          return false // Allow default context menu
        },
      },
      // Transform pasted plain text to normalize line endings
      transformPastedText(text) {
        return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      },
      // Clean up pasted HTML to fix spacing issues in lists
      transformPastedHTML(html) {
        return html
          // Remove empty paragraphs
          .replace(/<p>\s*<\/p>/g, '')
          // Reduce double breaks
          .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '<br>')
          // Remove p tags wrapping list item content (common cause of extra spacing)
          .replace(/(<li[^>]*>)\s*<p>/gi, '$1')
          .replace(/<\/p>\s*(<\/li>)/gi, '$1')
          // Clean up whitespace around list items
          .replace(/(<li[^>]*>)\s+/gi, '$1')
          .replace(/\s+(<\/li>)/gi, '$1')
      },
    },
    onUpdate: ({ editor }) => {
      // Don't save if we're programmatically setting content
      if (isSettingContentRef.current) return
      if (currentNoteId) {
        const content = editor.getJSON()
        debouncedUpdate(currentNoteId, content)
      }
    },
    onSelectionUpdate: ({ editor }) => {
      // Clear any pending AI toolbar timer
      if (aiToolbarTimerRef.current) {
        clearTimeout(aiToolbarTimerRef.current)
        aiToolbarTimerRef.current = null
      }

      const { from, to } = editor.state.selection
      const text = editor.state.doc.textBetween(from, to, ' ')

      if (text.length > 0) {
        // Don't show AI toolbar during right-click (context menu)
        if (isRightClickRef.current) {
          return
        }

        // Delay showing AI toolbar to avoid interfering with quick selections
        // User can still use context menu or copy/paste without the toolbar appearing
        aiToolbarTimerRef.current = setTimeout(() => {
          // Double-check selection is still valid
          const currentSelection = editor.state.selection
          const currentText = editor.state.doc.textBetween(
            currentSelection.from,
            currentSelection.to,
            ' '
          )
          if (currentText.length > 0 && !isRightClickRef.current) {
            const coords = editor.view.coordsAtPos(currentSelection.from)
            showAIToolbar({ x: coords.left, y: coords.top - 50 }, currentText)
          }
        }, 400) // 400ms delay - enough time to right-click without toolbar appearing
      } else {
        hideAIToolbar()
      }
    },
  })

  // Update editor content when note changes
  useEffect(() => {
    if (editor && currentNote) {
      const currentContent = editor.getJSON()
      if (JSON.stringify(currentContent) !== JSON.stringify(currentNote.content)) {
        // Mark that we're setting content programmatically to avoid save loop
        isSettingContentRef.current = true
        editor.commands.setContent(currentNote.content || '')
        // Reset flag after a tick to allow future user edits to save
        setTimeout(() => {
          isSettingContentRef.current = false
        }, 0)
      }
    } else if (editor && !currentNote) {
      isSettingContentRef.current = true
      editor.commands.setContent('')
      setTimeout(() => {
        isSettingContentRef.current = false
      }, 0)
    }
  }, [editor, currentNote, currentNoteId])

  if (!currentNote) {
    return (
      <div className="flex-1 flex items-center justify-center text-surface-400">
        <div className="text-center">
          <p className="text-lg mb-2">No note selected</p>
          <p className="text-sm">Select a note from the sidebar or create a new one</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-12 py-12">
          {/* Title Input with Save as Template */}
          <div className="flex items-start gap-2 mb-8">
            <input
              type="text"
              value={currentNote.title}
              onChange={(e) => updateNote(currentNote.id, { title: e.target.value })}
              placeholder="Untitled"
              className="flex-1 text-4xl font-bold bg-transparent border-none outline-none text-surface-900 dark:text-surface-100 placeholder:text-surface-300"
            />
            {isAuthenticated && currentNote.content && (
              <button
                onClick={handleSaveAsTemplate}
                title="Save as Template"
                className="p-2 mt-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
              >
                <BookTemplate size={20} />
              </button>
            )}
          </div>

          {/* Formatting Toolbar */}
          {editor && <FormattingToolbar editor={editor} />}

          {/* Editor */}
          <EditorContent
            editor={editor}
            className="min-h-[calc(100vh-300px)]"
          />
        </div>
      </div>

      {/* Save as Template Modal */}
      <SaveAsTemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSave={handleSaveTemplate}
        defaultName={currentNote.title !== 'Untitled' ? `${currentNote.title} Template` : ''}
      />
    </>
  )
}
