import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { useNotesStore } from '@/stores/notesStore'
import { useAuth } from '@/hooks/useAuth'
import { useSyncQueue } from '@/hooks/useSyncQueue'
import { NotesList } from '@/components/Sidebar/NotesList'
import { BlockEditor } from '@/components/Editor/BlockEditor'
import { ExportMenu } from '@/components/Editor/ExportMenu'
import { TemplateMenu } from '@/components/Editor/TemplateMenu'
import { SaveAsTemplateModal } from '@/components/Editor/SaveAsTemplateModal'
import { useTemplatesStore } from '@/stores/templatesStore'
import { AIToolbar } from '@/components/AI/AIToolbar'
import { ChatPanel } from '@/components/AI/ChatPanel'
import { ResizeHandle } from '@/components/ResizeHandle'
import { AuthPage } from '@/components/Auth/AuthPage'
import { UserMenu } from '@/components/Auth/UserMenu'
import { SyncStatusIndicator } from '@/components/Sync/SyncStatusIndicator'
import { AgentPMPage } from '@/components/AgentPM'
import { SettingsPage } from '@/components/Settings/SettingsPage'
import { AccountSwitcher } from '@/components/AccountSwitcher/AccountSwitcher'
// AcceptInvitation component available at: @/components/Auth/AcceptInvitation
import { Loader2 } from 'lucide-react'
import {
  PanelLeftOpen,
  Moon,
  Sun,
  MessageSquare,
  StickyNote,
  Bot,
  ChevronDown,
  Palette,
  Users,
  Settings,
  Layout,
} from 'lucide-react'

// Helper to get app URLs based on environment
function getAppUrl(app: string): string {
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  const devPorts: Record<string, number> = {
    agentpm: 3000,
    notetaker: 3000, // same as agentpm - it's the same app
    canvas: 3003,
    leadgen: 3004,
  }

  const prodDomains: Record<string, string> = {
    agentpm: 'agentpm.funnelists.com',
    notetaker: 'notetaker.funnelists.com',
    canvas: 'canvas.funnelists.com',
    leadgen: 'leadgen.funnelists.com',
  }

  if (isDev) {
    return `http://localhost:${devPorts[app] || 3000}`
  }

  return `https://${prodDomains[app] || 'funnelists.com'}`
}

type AppView = 'notes' | 'agentpm' | 'canvas' | 'leadgen' | 'settings'

// URL hash to view mapping
const HASH_TO_VIEW: Record<string, AppView> = {
  '#notes': 'notes',
  '#notetaker': 'notes',
  '#agentpm': 'agentpm',
  '#tasks': 'agentpm',
  '#canvas': 'canvas',
  '#leadgen': 'leadgen',
  '#settings': 'settings',
}

const VIEW_TO_HASH: Record<AppView, string> = {
  notes: '#notetaker',
  agentpm: '#agentpm',
  canvas: '#canvas',
  leadgen: '#leadgen',
  settings: '#settings',
}

// Get initial view from URL hash
function getViewFromHash(): AppView {
  const hash = window.location.hash.toLowerCase()
  return HASH_TO_VIEW[hash] || 'agentpm'
}

interface Tool {
  id: string
  name: string
  icon: React.ReactNode
  description?: string
  href?: string
  comingSoon?: boolean
}

const tools: Tool[] = [
  { id: 'agentpm', name: 'AgentPM', icon: <Bot size={18} />, description: 'AI project management' },
  { id: 'notetaker', name: 'NoteTaker', icon: <StickyNote size={18} />, description: 'Brainstorming & ideation' },
  { id: 'canvas', name: 'Canvas', icon: <Palette size={18} />, description: 'AI design & visuals', href: getAppUrl('canvas'), comingSoon: true },
  { id: 'leadgen', name: 'LeadGen', icon: <Users size={18} />, description: 'Lead generation & enrichment', href: getAppUrl('leadgen') },
]

// Inline ToolSwitcher component
function ToolSwitcher({ tools, activeTool, onToolChange }: { tools: Tool[]; activeTool: string; onToolChange: (id: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const active = tools.find(t => t.id === activeTool) || tools[0]

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
        style={{ color: 'var(--fl-color-text-primary)' }}
      >
        {active.icon}
        <span className="font-medium">{active.name}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 350 }} onClick={() => setIsOpen(false)} />
          <div
            className="absolute left-0 top-full mt-1 rounded-lg shadow-lg min-w-[220px]"
            style={{ zIndex: 400, background: 'var(--fl-color-bg-surface)', border: '1px solid var(--fl-color-border)' }}
          >
            {tools.map(tool => (
              <button
                key={tool.id}
                onClick={() => {
                  if (tool.comingSoon) return
                  if (tool.href) {
                    window.location.href = tool.href
                  } else {
                    onToolChange(tool.id)
                  }
                  setIsOpen(false)
                }}
                disabled={tool.comingSoon}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  tool.comingSoon
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-[var(--fl-color-bg-elevated)]'
                } ${tool.id === activeTool ? 'bg-[var(--fl-color-bg-elevated)]' : ''}`}
                style={{ color: 'var(--fl-color-text-primary)' }}
              >
                {tool.icon}
                <div className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {tool.name}
                    {tool.comingSoon && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(14, 165, 233, 0.2)', color: '#0ea5e9' }}
                      >
                        Soon
                      </span>
                    )}
                  </div>
                  {tool.description && (
                    <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                      {tool.description}
                    </div>
                  )}
                </div>
              </button>
            ))}
            {/* Settings Divider */}
            <div className="border-t my-1" style={{ borderColor: 'var(--fl-color-border)' }} />
            <button
              onClick={() => { onToolChange('settings'); setIsOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              <Settings size={18} />
              <div>
                <div className="font-medium">Settings</div>
                <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>API keys & preferences</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Coming Soon Placeholder Component
function ComingSoonPlaceholder({
  name,
  description,
  onBack,
}: {
  name: string
  description: string
  onBack: () => void
}) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center p-8"
      style={{ background: 'var(--fl-color-bg-base)' }}
    >
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{
          background: 'rgba(14, 165, 233, 0.15)',
          border: '1px solid rgba(14, 165, 233, 0.3)',
        }}
      >
        {name === 'Canvas' ? <Palette size={40} color="#0ea5e9" /> : <Users size={40} color="#0ea5e9" />}
      </div>
      <h2
        className="text-2xl font-medium mb-2"
        style={{ color: 'var(--fl-color-text-primary)' }}
      >
        {name}
      </h2>
      <p
        className="text-center max-w-md mb-6"
        style={{ color: 'var(--fl-color-text-muted)' }}
      >
        {description}
      </p>
      <span
        className="px-4 py-2 rounded-full text-sm font-medium mb-6"
        style={{
          background: 'rgba(14, 165, 233, 0.15)',
          color: '#0ea5e9',
        }}
      >
        Coming Soon
      </span>
      <button
        onClick={onBack}
        className="px-4 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
        style={{ color: 'var(--fl-color-text-secondary)' }}
      >
        ← Back to AgentPM
      </button>
    </div>
  )
}

function App() {
  const { initialized, isAuthenticated } = useAuth()
  useSyncQueue()

  const [currentView, setCurrentView] = useState<AppView>(getViewFromHash)
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)

  const {
    sidebarOpen,
    toggleSidebar,
    darkMode,
    toggleDarkMode,
    toggleChatPanel,
    chatPanelOpen,
    sidebarWidth,
    setSidebarWidth,
  } = useUIStore()
  const { notes, addNote, currentNoteId } = useNotesStore()
  const { createTemplate } = useTemplatesStore()
  const currentNote = notes.find(n => n.id === currentNoteId)

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth(sidebarWidth + delta)
  }, [sidebarWidth, setSidebarWidth])

  // Apply theme class to html
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
    }
  }, [darkMode])

  // Sync URL hash with current view
  useEffect(() => {
    const newHash = VIEW_TO_HASH[currentView]
    if (window.location.hash !== newHash) {
      window.history.pushState(null, '', newHash)
    }
  }, [currentView])

  // Handle browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const view = getViewFromHash()
      setCurrentView(view)
    }

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [])

  // Create initial note if none exist and not authenticated
  useEffect(() => {
    if (initialized && !isAuthenticated && notes.length === 0) {
      addNote({
        title: 'Welcome to AI Notetaker',
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Welcome to AI Notetaker' }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: "Your intelligent note-taking companion. Here's what you can do:",
                },
              ],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: "Type '/' to open the command menu and add different block types",
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Select text to see AI-powered options like rewrite, expand, or summarize',
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Click the chat icon to ask questions about your notes',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Start writing and let AI help you along the way!',
                },
              ],
            },
          ],
        },
      })
    }
  }, [initialized, isAuthenticated, notes.length, addNote])

  // Placeholder functions for AI toolbar - will connect to editor
  const handleAIInsert = (text: string) => {
    console.log('Insert:', text)
  }

  const handleAIReplace = (text: string) => {
    console.log('Replace:', text)
  }

  // Show loading screen while initializing
  if (!initialized) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--fl-color-bg-base)' }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--fl-color-primary)' }} />
          <p style={{ color: 'var(--fl-color-text-muted)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  // Show auth page if not authenticated
  if (!isAuthenticated) {
    return <AuthPage />
  }

  const handleToolChange = (toolId: string) => {
    const viewMap: Record<string, AppView> = {
      'notetaker': 'notes',
      'agentpm': 'agentpm',
      'canvas': 'canvas',
      'leadgen': 'leadgen',
      'settings': 'settings',
    }
    setCurrentView(viewMap[toolId] || 'notes')
  }

  // Handler for saving current note as a template
  const handleSaveAsTemplate = async (data: {
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
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--fl-color-bg-base)', color: 'var(--fl-color-text-primary)' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 h-14 flex-shrink-0"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Left: Logo, Account Switcher, and Tool Switcher */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--fl-color-primary)' }}>
              <Bot size={18} className="text-white" />
            </div>
            <span className="font-semibold text-lg" style={{ color: 'var(--fl-color-text-primary)' }}>AgentPM</span>
          </div>
          <AccountSwitcher compact />
          <ToolSwitcher
            tools={tools}
            activeTool={currentView === 'notes' ? 'notetaker' : currentView === 'settings' ? 'agentpm' : currentView}
            onToolChange={handleToolChange}
          />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {currentView === 'notes' && (
            <>
              {/* Only show open sidebar button when sidebar is closed */}
              {!sidebarOpen && (
                <button
                  onClick={toggleSidebar}
                  title="Open sidebar"
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                  style={{ color: 'var(--fl-color-text-secondary)' }}
                >
                  <PanelLeftOpen size={18} />
                </button>
              )}
              <TemplateMenu />
              <ExportMenu />
              {currentNote?.content && (
                <button
                  onClick={() => setShowSaveTemplateModal(true)}
                  title="Save as template"
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                  style={{ color: 'var(--fl-color-text-secondary)' }}
                >
                  <Layout size={18} />
                </button>
              )}
              <button
                onClick={toggleChatPanel}
                title="Chat with notes"
                className={`p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)] ${chatPanelOpen ? 'bg-[var(--fl-color-bg-elevated)]' : ''}`}
                style={{ color: 'var(--fl-color-text-secondary)' }}
              >
                <MessageSquare size={18} />
              </button>
            </>
          )}
          <SyncStatusIndicator />
          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
            style={{ color: 'var(--fl-color-text-secondary)' }}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <UserMenu />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - only show for notes view */}
        {currentView === 'notes' && (
          <aside
            className="transition-all duration-300 overflow-hidden flex-shrink-0 relative"
            style={{
              width: sidebarOpen ? sidebarWidth : 0,
              borderRight: sidebarOpen ? '1px solid var(--fl-color-border)' : 'none',
              background: 'var(--fl-color-bg-elevated)'
            }}
          >
            <div className="h-full" style={{ width: sidebarWidth }}>
              <NotesList />
            </div>
            {sidebarOpen && <ResizeHandle side="left" onResize={handleSidebarResize} />}
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {currentView === 'notes' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <BlockEditor />
            </div>
          )}
          {currentView === 'agentpm' && <AgentPMPage />}
          {currentView === 'settings' && (
            <SettingsPage onBack={() => setCurrentView('notes')} />
          )}
          {(currentView === 'canvas' || currentView === 'leadgen') && (
            <ComingSoonPlaceholder
              name={currentView === 'canvas' ? 'Canvas' : 'LeadGen'}
              description={
                currentView === 'canvas'
                  ? 'AI-powered design and visual creation tools'
                  : 'AI lead generation and outreach automation'
              }
              onBack={() => setCurrentView('notes')}
            />
          )}
        </main>

        {/* Chat Panel - inline in flex layout for notes view */}
        {currentView === 'notes' && <ChatPanel />}
      </div>

      {/* AI Toolbar (floating) - only for notes view */}
      {currentView === 'notes' && (
        <AIToolbar onInsert={handleAIInsert} onReplace={handleAIReplace} />
      )}

      {/* Save as Template Modal */}
      <SaveAsTemplateModal
        isOpen={showSaveTemplateModal}
        onClose={() => setShowSaveTemplateModal(false)}
        onSave={handleSaveAsTemplate}
        defaultName={currentNote?.title !== 'Untitled' ? `${currentNote?.title} Template` : ''}
      />
    </div>
  )
}

export default App
