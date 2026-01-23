import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { getCurrentNoteContext, useNotesStore } from '@/stores/notesStore'
import { chatWithNotes, isAnthropicConfigured, setNoteOperationCallbacks, type ChatStatusCallback } from '@/services/ai/anthropic'
import { motion, AnimatePresence } from 'framer-motion'
import { ResizeHandle } from '@/components/ResizeHandle'
import type { JSONContent } from '@tiptap/react'
import {
  X,
  Send,
  Sparkles,
  Loader2,
  User,
  Bot,
  AlertCircle,
  FileText,
  PenLine,
  Globe,
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export function ChatPanel() {
  const { chatPanelOpen, setChatPanelOpen, chatPanelWidth, setChatPanelWidth } = useUIStore()
  const { updateNote, addNote, currentNoteId, notes } = useNotesStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeNoteTitle, setActiveNoteTitle] = useState<string | null>(null)
  const [chatStatus, setChatStatus] = useState<'thinking' | 'searching' | 'updating-note'>('thinking')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Update active note title and clear chat when note changes
  const prevNoteIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (chatPanelOpen) {
      const { currentNote } = getCurrentNoteContext()
      setActiveNoteTitle(currentNote?.title || null)

      // Clear chat history when switching to a different note
      if (prevNoteIdRef.current !== null && prevNoteIdRef.current !== currentNoteId) {
        setMessages([])
        setError(null)
      }
      prevNoteIdRef.current = currentNoteId
    }
  }, [chatPanelOpen, currentNoteId])

  // Set up note operation callbacks for AI
  useEffect(() => {
    setNoteOperationCallbacks({
      updateCurrentNote: async (content: string, title?: string) => {
        if (!currentNoteId) throw new Error('No note selected')
        const currentNote = notes.find(n => n.id === currentNoteId)
        if (!currentNote) throw new Error('Note not found')

        // Convert plain text content to Tiptap JSON format
        const jsonContent = {
          type: 'doc',
          content: content.split('\n').map(line => ({
            type: 'paragraph',
            content: line ? [{ type: 'text', text: line }] : [],
          })),
        }

        await updateNote(currentNoteId, {
          content: jsonContent,
          ...(title ? { title } : {}),
        })
      },
      createNewNote: async (title: string, content: string) => {
        const jsonContent = {
          type: 'doc',
          content: content.split('\n').map(line => ({
            type: 'paragraph',
            content: line ? [{ type: 'text', text: line }] : [],
          })),
        }
        await addNote({ title, content: jsonContent })
      },
      appendToNote: async (content: string) => {
        if (!currentNoteId) throw new Error('No note selected')
        const currentNote = notes.find(n => n.id === currentNoteId)
        if (!currentNote) throw new Error('Note not found')

        // Get existing content and append new content
        const existingContent = currentNote.content as JSONContent
        const newParagraphs: JSONContent[] = content.split('\n').map(line => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        }))

        const updatedContent: JSONContent = {
          ...existingContent,
          content: [...(existingContent.content || []), ...newParagraphs],
        }

        await updateNote(currentNoteId, { content: updatedContent })
      },
      getCurrentNoteContent: () => {
        const { currentNote } = getCurrentNoteContext()
        return currentNote?.content || ''
      },
    })

    return () => {
      setNoteOperationCallbacks(null)
    }
  }, [currentNoteId, notes, updateNote, addNote])

  const handleResize = useCallback((delta: number) => {
    setChatPanelWidth(chatPanelWidth + delta)
  }, [chatPanelWidth, setChatPanelWidth])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (chatPanelOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [chatPanelOpen])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    if (!isAnthropicConfigured()) {
      setError('Please configure your Anthropic API key to use the chat feature.')
      return
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setError(null)
    setLoading(true)
    setChatStatus('thinking')

    try {
      const { currentNote, otherNotes } = getCurrentNoteContext()
      const chatHistory = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const handleStatusChange: ChatStatusCallback = (status) => {
        setChatStatus(status)
      }

      const result = await chatWithNotes(userMessage.content, currentNote, otherNotes, chatHistory, handleStatusChange)

      // Build response content with indicator if applicable
      let content = result.response
      if (result.webSearchUsed) {
        content = `🌐 ${content}`
      }
      if (result.noteUpdated) {
        content = `✏️ ${content}`
      } else if (result.noteCreated) {
        content = `📝 ${content}`
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Refresh the active note title in case it changed
      if (result.noteUpdated || result.noteCreated) {
        const { currentNote: updatedNote } = getCurrentNoteContext()
        setActiveNoteTitle(updatedNote?.title || null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <AnimatePresence>
      {chatPanelOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: chatPanelWidth, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="flex-shrink-0 border-l border-surface-200 dark:border-surface-700 flex flex-col overflow-hidden h-full"
          style={{ background: 'var(--fl-color-bg-elevated)', width: chatPanelWidth }}
        >
          <ResizeHandle side="left" onResize={handleResize} />
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-900/40">
                <Sparkles size={18} className="text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h2 className="font-semibold text-surface-900 dark:text-surface-100">
                  {activeNoteTitle ? 'Note Assistant' : 'AI Chat'}
                </h2>
                {activeNoteTitle ? (
                  <div className="flex items-center gap-1 text-xs text-surface-500">
                    <FileText size={12} />
                    <span className="truncate max-w-[150px]">{activeNoteTitle}</span>
                  </div>
                ) : (
                  <p className="text-xs text-surface-500">
                    General assistant with web search
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setChatPanelOpen(false)}
              className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary-100 to-purple-100 dark:from-primary-900/30 dark:to-purple-900/30 flex items-center justify-center">
                  <Bot size={32} className="text-primary-500" />
                </div>
                {activeNoteTitle ? (
                  <>
                    <h3 className="font-medium text-surface-900 dark:text-surface-100 mb-2">
                      Let's work on "{activeNoteTitle}"
                    </h3>
                    <p className="text-sm text-surface-500 max-w-[250px] mx-auto">
                      I can brainstorm ideas, suggest features, search the web, and update your note directly. Just ask!
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-3 text-xs">
                      <span className="flex items-center gap-1 text-primary-600 dark:text-primary-400">
                        <PenLine size={12} />
                        <span>Can edit</span>
                      </span>
                      <span className="text-surface-400">•</span>
                      <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <Globe size={12} />
                        <span>Web search</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="font-medium text-surface-900 dark:text-surface-100 mb-2">
                      General Assistant
                    </h3>
                    <p className="text-sm text-surface-500 max-w-[250px] mx-auto">
                      Ask me anything! I can search the web and create new notes for you.
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-3 text-xs">
                      <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <Globe size={12} />
                        <span>Web search</span>
                      </span>
                      <span className="text-surface-400">•</span>
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <FileText size={12} />
                        <span>Create notes</span>
                      </span>
                    </div>
                    <p className="text-xs text-surface-400 mt-2">
                      Open a note to get note-specific help
                    </p>
                  </>
                )}
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center">
                    <Bot size={16} className="text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    message.role === 'user'
                      ? 'bg-primary-500 text-white rounded-tr-sm'
                      : 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100 rounded-tl-sm'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center">
                    <User size={16} className="text-surface-600 dark:text-surface-400" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center">
                  <Bot size={16} className="text-white" />
                </div>
                <div className="bg-surface-100 dark:bg-surface-800 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-2">
                    {chatStatus === 'searching' ? (
                      <>
                        <Globe size={16} className="text-blue-500 animate-pulse" />
                        <span className="text-sm text-surface-500">Searching the web...</span>
                      </>
                    ) : chatStatus === 'updating-note' ? (
                      <>
                        <PenLine size={16} className="text-green-500 animate-pulse" />
                        <span className="text-sm text-surface-500">Updating note...</span>
                      </>
                    ) : (
                      <>
                        <Loader2 size={16} className="animate-spin text-primary-500" />
                        <span className="text-sm text-surface-500">Thinking...</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
                <AlertCircle size={16} />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div ref={messagesEndRef} />

            {/* Spacer to push input up when few messages */}
            <div className="flex-1 min-h-0" />

            {/* Input - inside scrollable area */}
            <div className="sticky bottom-0 pt-4 -mx-4 px-4 pb-0" style={{ background: 'var(--fl-color-bg-elevated)' }}>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your notes..."
                  rows={1}
                  className="flex-1 px-4 py-2.5 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                  style={{ maxHeight: '120px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="p-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-surface-300 dark:disabled:bg-surface-600 text-white rounded-xl transition-colors disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
