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
  MessageSquare,
  StickyNote,
  Bot,
  ChevronDown,
  Palette,
  Users,
  Layout,
  Radio,
  ExternalLink,
  Wrench,
} from 'lucide-react'

// Helper to get app URLs based on environment
function getAppUrl(app: string): string {
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  const devPorts: Record<string, number> = {
    agentpm: 3000,
    notetaker: 3000, // same as agentpm - it's the same app
    radar: 3001,
    canvas: 3002,
    leadgen: 3003,
  }

  const prodDomains: Record<string, string> = {
    agentpm: 'agentpm.funnelists.com',
    notetaker: 'notetaker.funnelists.com',
    radar: 'radar.funnelists.com',
    canvas: 'canvas.funnelists.com',
    leadgen: 'leadgen.funnelists.com',
  }

  if (isDev) {
    return `http://localhost:${devPorts[app] || 3000}`
  }

  return `https://${prodDomains[app] || 'funnelists.com'}`
}

type AppView = 'radar' | 'notes' | 'agentpm' | 'settings'

// URL hash to view mapping
const HASH_TO_VIEW: Record<string, AppView> = {
  '#radar': 'radar',
  '#notes': 'notes',
  '#notetaker': 'notes',
  '#agentpm': 'agentpm',
  '#tasks': 'agentpm',
  '#settings': 'settings',
}

const VIEW_TO_HASH: Record<AppView, string> = {
  radar: '#radar',
  notes: '#notetaker',
  agentpm: '#agentpm',
  settings: '#settings',
}

// Get initial view from URL hash
function getViewFromHash(): AppView {
  const hash = window.location.hash.toLowerCase()
  return HASH_TO_VIEW[hash] || 'agentpm'
}

interface NavItemConfig {
  id: string
  name: string
  icon: React.ReactNode
  href?: string
  comingSoon?: boolean
}

// Main nav items (shown as horizontal tabs)
const mainNavItems: NavItemConfig[] = [
  { id: 'radar', name: 'Radar', icon: <Radio size={18} /> },
  { id: 'notetaker', name: 'NoteTaker', icon: <StickyNote size={18} /> },
  { id: 'agentpm', name: 'AgentPM', icon: <Bot size={18} /> },
]

// Tools dropdown items (coming soon add-ons)
const toolsDropdownItems: NavItemConfig[] = [
  { id: 'canvas', name: 'Canvas', icon: <Palette size={18} />, href: getAppUrl('canvas'), comingSoon: true },
  { id: 'leadgen', name: 'LeadGen', icon: <Users size={18} />, href: getAppUrl('leadgen'), comingSoon: true },
]

// Horizontal Nav Component
function HorizontalNav({
  items,
  activeId,
  onItemClick
}: {
  items: NavItemConfig[]
  activeId: string
  onItemClick: (id: string) => void
}) {
  const [toolsOpen, setToolsOpen] = useState(false)

  return (
    <nav className="flex items-center gap-1">
      {items.map(item => {
        const isActive = item.id === activeId
        const isExternal = !!item.href

        if (isExternal) {
          return (
            <a
              key={item.id}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/10`}
              style={{
                color: 'var(--fl-color-text-secondary)',
              }}
            >
              {item.icon}
              <span>{item.name}</span>
              <ExternalLink size={12} className="opacity-50" />
            </a>
          )
        }

        return (
          <button
            key={item.id}
            onClick={() => onItemClick(item.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[rgba(14,165,233,0.2)] text-[#0ea5e9]'
                : 'hover:bg-white/10 text-[var(--fl-color-text-secondary)]'
            }`}
          >
            {item.icon}
            <span>{item.name}</span>
          </button>
        )
      })}

      {/* Tools Dropdown */}
      <div className="relative">
        <button
          onClick={() => setToolsOpen(!toolsOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/10"
          style={{ color: 'var(--fl-color-text-secondary)' }}
        >
          <Wrench size={16} />
          <span>Tools</span>
          <ChevronDown size={14} className={`transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
        </button>

        {toolsOpen && (
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: 350 }}
              onClick={() => setToolsOpen(false)}
            />
            <div
              className="absolute left-0 top-full mt-1 rounded-lg shadow-lg min-w-[200px] py-1"
              style={{
                zIndex: 400,
                background: 'var(--fl-color-bg-surface)',
                border: '1px solid var(--fl-color-border)'
              }}
            >
              {toolsDropdownItems.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => {
                    if (!tool.comingSoon && tool.href) {
                      window.location.href = tool.href
                    }
                    setToolsOpen(false)
                  }}
                  disabled={tool.comingSoon}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    tool.comingSoon
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-[var(--fl-color-bg-elevated)]'
                  }`}
                  style={{ color: 'var(--fl-color-text-primary)' }}
                >
                  {tool.icon}
                  <span className="flex-1 font-medium">{tool.name}</span>
                  {tool.comingSoon && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(14, 165, 233, 0.2)', color: '#0ea5e9' }}
                    >
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </nav>
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

  // Always use dark mode for Funnelists
  useEffect(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  }, [])

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

  const handleNavItemClick = (id: string) => {
    const viewMap: Record<string, AppView> = {
      'radar': 'radar',
      'notetaker': 'notes',
      'agentpm': 'agentpm',
      'settings': 'settings',
    }
    setCurrentView(viewMap[id] || 'agentpm')
  }

  // Get active nav item id from current view
  const getActiveNavId = () => {
    if (currentView === 'radar') return 'radar'
    if (currentView === 'notes') return 'notetaker'
    if (currentView === 'agentpm') return 'agentpm'
    return 'agentpm'
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
        className="grid grid-cols-[1fr_auto_1fr] items-center px-4 h-14 flex-shrink-0"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Left: Logo and Account Switcher */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--fl-color-primary)' }}>
              <Bot size={18} className="text-white" />
            </div>
            <span className="font-semibold text-lg" style={{ color: 'var(--fl-color-text-primary)' }}>AgentPM</span>
          </div>
          <AccountSwitcher />
        </div>

        {/* Center: Horizontal Navigation (truly centered) */}
        <HorizontalNav
          items={mainNavItems}
          activeId={getActiveNavId()}
          onItemClick={handleNavItemClick}
        />

        {/* Right: Actions */}
        <div className="flex items-center gap-1 justify-end">
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
          {currentView === 'radar' && (
            <iframe
              src={getAppUrl('radar')}
              className="w-full h-full border-0"
              title="Radar"
              allow="clipboard-read; clipboard-write"
            />
          )}
          {currentView === 'notes' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <BlockEditor />
            </div>
          )}
          {currentView === 'agentpm' && <AgentPMPage />}
          {currentView === 'settings' && (
            <SettingsPage onBack={() => setCurrentView('notes')} />
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
