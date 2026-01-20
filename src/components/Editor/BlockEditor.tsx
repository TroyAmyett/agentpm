import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useEffect, useRef, useCallback } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { useUIStore } from '@/stores/uiStore'
import { SlashCommand } from './SlashCommand'
import { FormattingToolbar } from './FormattingToolbar'

export function BlockEditor() {
  const { currentNoteId, notes, updateNote } = useNotesStore()
  const { showAIToolbar, hideAIToolbar } = useUIStore()

  const currentNote = notes.find((n) => n.id === currentNoteId)

  // Track right-click to prevent AI toolbar during context menu
  const isRightClickRef = useRef(false)
  // Timer for delayed AI toolbar show
  const aiToolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      if (currentNoteId) {
        const content = editor.getJSON()
        updateNote(currentNoteId, { content })
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
        editor.commands.setContent(currentNote.content || '')
      }
    } else if (editor && !currentNote) {
      editor.commands.setContent('')
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
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-12 py-12">
        {/* Title Input */}
        <input
          type="text"
          value={currentNote.title}
          onChange={(e) => updateNote(currentNote.id, { title: e.target.value })}
          placeholder="Untitled"
          className="w-full text-4xl font-bold bg-transparent border-none outline-none mb-8 text-surface-900 dark:text-surface-100 placeholder:text-surface-300"
        />

        {/* Formatting Toolbar */}
        {editor && <FormattingToolbar editor={editor} />}

        {/* Editor */}
        <EditorContent
          editor={editor}
          className="min-h-[calc(100vh-300px)]"
        />
      </div>
    </div>
  )
}
