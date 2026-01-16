import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { useEffect } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { useUIStore } from '@/stores/uiStore'
import { SlashCommand } from './SlashCommand'
import { FormattingToolbar } from './FormattingToolbar'

export function BlockEditor() {
  const { currentNoteId, notes, updateNote } = useNotesStore()
  const { showAIToolbar, hideAIToolbar } = useUIStore()

  const currentNote = notes.find((n) => n.id === currentNoteId)

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
      SlashCommand,
    ],
    content: currentNote?.content || '',
    editorProps: {
      attributes: {
        class: 'tiptap prose prose-lg max-w-none focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      if (currentNoteId) {
        const content = editor.getJSON()
        updateNote(currentNoteId, { content })
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection
      const text = editor.state.doc.textBetween(from, to, ' ')

      if (text.length > 0) {
        // Get selection coordinates for AI toolbar
        const coords = editor.view.coordsAtPos(from)
        showAIToolbar({ x: coords.left, y: coords.top - 50 }, text)
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
