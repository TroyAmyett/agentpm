import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { useNotesStore } from '@/stores/notesStore'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { useSyncQueue } from '@/hooks/useSyncQueue'
import { NotesList } from '@/components/Sidebar/NotesList'
import { BlockEditor } from '@/components/Editor/BlockEditor'
import { ExportMenu } from '@/components/Editor/ExportMenu'
import { TemplateMenu } from '@/components/Editor/TemplateMenu'
import { AIToolbar } from '@/components/AI/AIToolbar'
import { ChatPanel } from '@/components/AI/ChatPanel'
import { ResizeHandle } from '@/components/ResizeHandle'
import { AuthPage } from '@/components/Auth/AuthPage'
import { UserMenu } from '@/components/Auth/UserMenu'
import { SyncStatusIndicator } from '@/components/Sync/SyncStatusIndicator'
import { AgentPMPage } from '@/components/AgentPM'
import { SettingsPage } from '@/components/Settings/SettingsPage'
import { AccountSwitcher } from '@/components/AccountSwitcher/AccountSwitcher'
import { ChangelogBadge, ChangelogDrawer, WhatsNewModal } from '@/components/Changelog'
import { ResetPasswordPage } from '@/components/Auth/ResetPasswordPage'
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
  Radio,
  ExternalLink,
  Wrench,
  FileOutput,
  ArrowRightCircle,
} from 'lucide-react'
import { GenerateDocumentModal } from '@/components/Documents'
import { PushToTaskModal } from '@/components/Notes'
import { fetchAttachments, type Attachment } from '@/services/attachments/attachmentService'

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

// Get initial view from URL hash (supports sub-paths like #agentpm/tasks)
function getViewFromHash(): AppView {
  const hash = window.location.hash.toLowerCase()
  // Direct match first
  if (HASH_TO_VIEW[hash]) return HASH_TO_VIEW[hash]
  // Prefix match for sub-paths (e.g., #agentpm/tasks → agentpm)
  for (const [key, view] of Object.entries(HASH_TO_VIEW)) {
    if (hash.startsWith(key + '/')) return view
  }
  return 'agentpm'
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
  { id: 'notetaker', name: 'Plans', icon: <StickyNote size={18} /> },
  { id: 'agentpm', name: 'Agents', icon: <Bot size={18} /> },
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
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? 'bg-primary-500/15 text-primary-400 shadow-glow-sm'
                : 'hover:bg-white/[0.06] text-[var(--fl-color-text-secondary)]'
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
  const { session } = useAuthStore()

  // Detect password recovery flow from URL pathname
  // Supabase redirects here with recovery tokens in the URL hash
  if (window.location.pathname === '/reset-password') {
    return <ResetPasswordPage />
  }
  useSyncQueue()

  const [currentView, setCurrentView] = useState<AppView>(getViewFromHash)
  const [showGenerateDocModal, setShowGenerateDocModal] = useState(false)
  const [showPushToTaskModal, setShowPushToTaskModal] = useState(false)
  const [noteAttachments, setNoteAttachments] = useState<Attachment[]>([])

  const {
    sidebarOpen,
    toggleSidebar,
    toggleChatPanel,
    chatPanelOpen,
    sidebarWidth,
    setSidebarWidth,
  } = useUIStore()

  // Generate Radar URL with session token for SSO
  // Pass tokens via URL hash (fragment) to avoid server logging
  const radarUrl = useMemo(() => {
    const baseUrl = getAppUrl('radar')
    if (session?.access_token && session?.refresh_token) {
      // Encode tokens and pass via hash for cross-subdomain SSO
      const params = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: String(session.expires_at || ''),
      })
      return `${baseUrl}#sso=${btoa(params.toString())}`
    }
    return baseUrl
  }, [session])
  const { notes, addNote, currentNoteId } = useNotesStore()
  const currentNote = notes.find(n => n.id === currentNoteId)

  const handleSidebarResize = useCallback((delta: number) => {
    // side="right" inverts delta, so we subtract to compensate:
    // drag right → raw +5 → adjusted -5 → width - (-5) = wider ✓
    setSidebarWidth(sidebarWidth - delta)
  }, [sidebarWidth, setSidebarWidth])

  // Always use dark mode for Funnelists
  useEffect(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  }, [])

  // Sync URL hash with current view (preserve sub-paths like #agentpm/tasks)
  useEffect(() => {
    const currentHash = window.location.hash
    const prefix = VIEW_TO_HASH[currentView]
    // Don't overwrite sub-paths (e.g., don't replace #agentpm/tasks with #agentpm)
    if (currentHash !== prefix && !currentHash.startsWith(prefix + '/')) {
      window.history.pushState(null, '', prefix)
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
        title: 'Welcome to AgentPM',
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Welcome to AgentPM' }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: "Your AI-powered project management companion. Here's what you can do:",
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
                          text: 'Create projects and break them down into tasks for AI agents to execute',
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
                          text: 'Use the Plans tab to draft and organize your ideas with AI assistance',
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
                          text: 'Monitor agent progress and review execution logs in the Agents view',
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
                  text: 'Get started by creating your first project!',
                },
              ],
            },
          ],
        },
      })
    }
  }, [initialized, isAuthenticated, notes.length, addNote])

  // Fetch attachments when current note changes (for Push to Task)
  useEffect(() => {
    if (!currentNoteId) {
      setNoteAttachments([])
      return
    }

    let mounted = true

    async function loadAttachments() {
      try {
        const attachments = await fetchAttachments('note', currentNoteId!)
        if (mounted) {
          setNoteAttachments(attachments)
        }
      } catch (error) {
        console.error('[App] Failed to load note attachments:', error)
      }
    }

    loadAttachments()

    return () => {
      mounted = false
    }
  }, [currentNoteId])

  // Callback to refresh attachments after upload
  const handleAttachmentChange = useCallback(() => {
    if (currentNoteId) {
      fetchAttachments('note', currentNoteId).then(setNoteAttachments).catch(console.error)
    }
  }, [currentNoteId])

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

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--fl-color-bg-base)', color: 'var(--fl-color-text-primary)' }}>
      {/* Header */}
      <header
        className="fl-app-header grid grid-cols-[1fr_auto_1fr] items-center px-4 h-14 flex-shrink-0 glass-header"
      >
        {/* Left: Logo, Account Switcher, and Note Title (when in notes view) */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary-500 to-accent-600">
              <Bot size={18} className="text-white" />
            </div>
            <span className="font-semibold text-lg" style={{ color: 'var(--fl-color-text-primary)' }}>Agents</span>
          </div>
          <AccountSwitcher />
          {currentView === 'notes' && currentNote && (
            <>
              <div className="w-px h-6 bg-white/10" />
              <input
                type="text"
                value={currentNote.title}
                onChange={(e) => {
                  const { updateNote } = useNotesStore.getState()
                  updateNote(currentNote.id, { title: e.target.value })
                }}
                placeholder="Untitled"
                className="bg-transparent border-none outline-none text-lg font-medium max-w-[300px] truncate"
                style={{ color: 'var(--fl-color-text-primary)' }}
              />
            </>
          )}
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
                <>
                  <button
                    onClick={() => setShowGenerateDocModal(true)}
                    title="Generate Document"
                    className="p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                    style={{ color: 'var(--fl-color-text-secondary)' }}
                  >
                    <FileOutput size={18} />
                  </button>
                  <button
                    onClick={() => setShowPushToTaskModal(true)}
                    title="Push to Task"
                    className="p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                    style={{ color: 'var(--fl-color-text-secondary)' }}
                  >
                    <ArrowRightCircle size={18} />
                  </button>
                </>
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
          <ChangelogBadge />
          <UserMenu />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - only show for notes view */}
        {currentView === 'notes' && (
          <aside
            className={`transition-all duration-300 flex-shrink-0 relative ${!sidebarOpen ? 'overflow-hidden' : ''}`}
            style={{
              width: sidebarOpen ? sidebarWidth : 0,
              borderRight: sidebarOpen ? '1px solid var(--fl-color-border)' : 'none',
              background: 'var(--fl-color-bg-elevated)'
            }}
          >
            <div className="h-full overflow-hidden" style={{ width: sidebarWidth }}>
              <NotesList />
            </div>
            {sidebarOpen && <ResizeHandle side="right" onResize={handleSidebarResize} />}
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {currentView === 'radar' && (
            <iframe
              src={radarUrl}
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

      {/* Generate Document Modal */}
      {currentNote && (
        <GenerateDocumentModal
          isOpen={showGenerateDocModal}
          onClose={() => setShowGenerateDocModal(false)}
          noteId={currentNote.id}
          noteTitle={currentNote.title}
          noteContent={currentNote.content || { type: 'doc', content: [] }}
          onGenerated={handleAttachmentChange}
        />
      )}

      {/* Push to Task Modal */}
      {currentNote && (
        <PushToTaskModal
          isOpen={showPushToTaskModal}
          onClose={() => setShowPushToTaskModal(false)}
          note={currentNote}
          attachments={noteAttachments}
          onTaskCreated={() => {
            setShowPushToTaskModal(false)
            handleAttachmentChange()
          }}
        />
      )}

      {/* Changelog */}
      <ChangelogDrawer />
      <WhatsNewModal />
    </div>
  )
}

export default App
