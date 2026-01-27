import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { getCurrentNoteContext, useNotesStore } from '@/stores/notesStore'
import { useAccountStore } from '@/stores/accountStore'
import { useAuthStore } from '@/stores/authStore'
import { useTaskStore } from '@/stores/taskStore'
import { chatWithNotes, isAnthropicConfigured, setNoteOperationCallbacks, type ChatStatusCallback, type ChatContextOptions } from '@/services/ai/anthropic'
import { motion, AnimatePresence } from 'framer-motion'
import { ResizeHandle } from '@/components/ResizeHandle'
import type { JSONContent } from '@tiptap/react'
import {
  X,
  Send,
  Loader2,
  User,
  Bot,
  AlertCircle,
  FileText,
  PenLine,
  Globe,
  Mic,
  MicOff,
  CheckSquare,
} from 'lucide-react'

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event & { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// Store chat history per note (in-memory, persists while app is open)
const chatHistoryByNote = new Map<string | null, Message[]>()

export function ChatPanel() {
  const { chatPanelOpen, setChatPanelOpen, chatPanelWidth, setChatPanelWidth } = useUIStore()
  const { updateNote, addNote, currentNoteId, notes } = useNotesStore()
  const { currentAccountId } = useAccountStore()
  const { user } = useAuthStore()
  const { createTask } = useTaskStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeNoteTitle, setActiveNoteTitle] = useState<string | null>(null)
  const [chatStatus, setChatStatus] = useState<'thinking' | 'searching' | 'updating-note' | 'creating-task'>('thinking')
  const [isRecording, setIsRecording] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Track previous note ID for history management
  const prevNoteIdRef = useRef<string | null>(null)

  // Save messages to history when they change
  useEffect(() => {
    if (currentNoteId !== undefined) {
      chatHistoryByNote.set(currentNoteId, messages)
    }
  }, [messages, currentNoteId])

  // Load/restore chat history when note changes
  useEffect(() => {
    if (chatPanelOpen) {
      const { currentNote } = getCurrentNoteContext()
      setActiveNoteTitle(currentNote?.title || null)

      // When switching notes, restore that note's chat history
      if (prevNoteIdRef.current !== currentNoteId) {
        const savedHistory = chatHistoryByNote.get(currentNoteId) || []
        setMessages(savedHistory)
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
      // Task creation callback
      createTask: async (taskData: { title: string; description?: string; priority?: string }) => {
        if (!currentAccountId) throw new Error('No account selected')
        const userId = user?.id || 'unknown'

        const task = await createTask({
          title: taskData.title,
          description: taskData.description,
          priority: (taskData.priority as 'critical' | 'high' | 'medium' | 'low') || 'medium',
          accountId: currentAccountId,
          status: 'draft',
          createdBy: userId,
          createdByType: 'user',
          updatedBy: userId,
          updatedByType: 'user',
        })

        return { id: task.id, title: task.title }
      },
    })

    return () => {
      setNoteOperationCallbacks(null)
    }
  }, [currentNoteId, notes, updateNote, addNote, currentAccountId, createTask, user])

  // Check for speech recognition support
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    setSpeechSupported(!!SpeechRecognitionAPI)
  }, [])

  const toggleRecording = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) return

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop()
      setIsRecording(false)
      return
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        }
      }

      if (finalTranscript) {
        setInput(prev => prev + finalTranscript)
      }
    }

    recognition.onerror = (event: Event & { error: string }) => {
      console.error('Speech recognition error:', event.error)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }, [isRecording])

  const handleResize = useCallback((delta: number) => {
    // For a panel on the right side, dragging left (negative delta) should increase width
    setChatPanelWidth(chatPanelWidth - delta)
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

      // Build context options for hierarchical knowledge injection
      const contextOptions: ChatContextOptions = {
        accountId: currentAccountId || undefined,
        projectId: undefined, // TODO: Add project context when in project view
        toolName: 'agentpm',
      }

      const result = await chatWithNotes(userMessage.content, currentNote, otherNotes, chatHistory, handleStatusChange, contextOptions)

      // Build response content with indicator if applicable
      let content = result.response
      if (result.webSearchUsed) {
        content = `🌐 ${content}`
      }
      if (result.taskCreated) {
        content = `✅ ${content}`
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
      if (result.noteUpdated || result.noteCreated || result.taskCreated) {
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
          {/* Header - Sticky */}
          <div className="flex-shrink-0 sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                <Bot size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-surface-900 dark:text-surface-100 text-sm">
                  {activeNoteTitle ? 'Note Assistant' : 'AI Chat'}
                </h2>
                {activeNoteTitle ? (
                  <div className="flex items-center gap-1 text-xs text-surface-500">
                    <FileText size={10} className="flex-shrink-0" />
                    <span className="truncate">{activeNoteTitle}</span>
                  </div>
                ) : (
                  <p className="text-xs text-surface-500">
                    Web search enabled
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activeNoteTitle && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary-100 dark:bg-primary-900/40 text-xs text-primary-600 dark:text-primary-400">
                  <PenLine size={10} />
                  <span>Can edit</span>
                </div>
              )}
              <button
                onClick={() => setChatPanelOpen(false)}
                className="p-2 rounded-lg hover:bg-surface-200/50 dark:hover:bg-surface-700/50 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-surface-500 max-w-[240px] mx-auto">
                  {activeNoteTitle
                    ? `Ask me to brainstorm ideas, create tasks, search the web, or update "${activeNoteTitle}" directly.`
                    : 'Ask me anything! I can search the web, create notes, and track tasks for you.'
                  }
                </p>
                <div className="flex items-center justify-center gap-3 mt-3 text-xs flex-wrap">
                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <Globe size={12} />
                    <span>Web search</span>
                  </span>
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <FileText size={12} />
                    <span>{activeNoteTitle ? 'Edit note' : 'Create notes'}</span>
                  </span>
                  <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                    <CheckSquare size={12} />
                    <span>Create tasks</span>
                  </span>
                </div>
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
                    ) : chatStatus === 'creating-task' ? (
                      <>
                        <CheckSquare size={16} className="text-purple-500 animate-pulse" />
                        <span className="text-sm text-surface-500">Creating task...</span>
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
                  onChange={(e) => {
                    setInput(e.target.value)
                    // Auto-resize textarea
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your notes..."
                  rows={4}
                  className="flex-1 pl-4 pr-4 py-2.5 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                  style={{ minHeight: '100px', maxHeight: '200px', paddingLeft: '16px' }}
                />
                <div className="flex flex-col gap-2">
                  {speechSupported && (
                    <button
                      onClick={toggleRecording}
                      disabled={loading}
                      className={`p-2.5 rounded-xl transition-colors ${
                        isRecording
                          ? 'bg-red-500 hover:bg-red-600 text-white'
                          : 'bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-600 dark:text-surface-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={isRecording ? 'Stop recording' : 'Voice input'}
                    >
                      {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                  )}
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
