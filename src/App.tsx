import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { useNotesStore } from '@/stores/notesStore'
import { useAuth } from '@/hooks/useAuth'
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
import { AppHeader, ToolSwitcher, Button, Panel, type Tool } from '@funnelists/ui'
import { Loader2 } from 'lucide-react'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  MessageSquare,
  StickyNote,
  Bot,
} from 'lucide-react'

type AppView = 'notes' | 'agentpm'

const tools: Tool[] = [
  { id: 'notetaker', name: 'NoteTaker', icon: <StickyNote size={18} />, description: 'AI-powered note taking' },
  { id: 'agentpm', name: 'AgentPM', icon: <Bot size={18} />, description: 'Project management with AI agents' },
]

function App() {
  const { initialized, isAuthenticated } = useAuth()
  useSyncQueue()

  const [currentView, setCurrentView] = useState<AppView>('notes')

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
  const { notes, addNote } = useNotesStore()

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
      <div className="h-screen flex items-center justify-center bg-white dark:bg-surface-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-primary-500" />
          <p className="text-surface-500">Loading...</p>
        </div>
      </div>
    )
  }

  // Show auth page if not authenticated
  if (!isAuthenticated) {
    return <AuthPage />
  }

  const handleToolChange = (toolId: string) => {
    // Map tool IDs to view names
    const viewMap: Record<string, AppView> = {
      'notetaker': 'notes',
      'agentpm': 'agentpm'
    }
    setCurrentView(viewMap[toolId] || 'notes')
  }

  const handleSettingsClick = () => {
    toggleDarkMode()
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--fl-color-bg-base)', color: 'var(--fl-color-text-primary)', paddingTop: '56px' }}>
      {/* AppHeader - Standard Funnelists design */}
      <AppHeader
        logo={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--fl-color-primary)' }}>
              <StickyNote size={18} className="text-white" />
            </div>
            <span className="font-semibold text-lg" style={{ color: 'var(--fl-color-text-primary)' }}>NoteTaker</span>
          </div>
        }
        toolSwitcher={
          <ToolSwitcher
            tools={tools}
            activeTool={currentView === 'notes' ? 'notetaker' : 'agentpm'}
            onToolChange={handleToolChange}
          />
        }
        settingsButton={
          <div className="flex items-center" style={{ gap: 'var(--fl-spacing-sm)' }}>
            {currentView === 'notes' && (
              <>
                <Button
                  variant="icon"
                  size="sm"
                  onClick={toggleSidebar}
                  title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                >
                  {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                </Button>
                <TemplateMenu />
                <ExportMenu />
                <Button
                  variant="icon"
                  size="sm"
                  onClick={toggleChatPanel}
                  title="Chat with notes"
                  className={chatPanelOpen ? 'fl-button--active' : ''}
                >
                  <MessageSquare size={18} />
                </Button>
              </>
            )}
            <SyncStatusIndicator />
            <Button
              variant="icon"
              size="sm"
              onClick={handleSettingsClick}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
          </div>
        }
        userMenu={<UserMenu />}
      />

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
          {currentView === 'notes' ? (
            <Panel noPadding className="flex-1 overflow-hidden" style={{ borderRadius: 0 }}>
              <BlockEditor />
            </Panel>
          ) : (
            <AgentPMPage />
          )}
        </main>

        {/* Chat Panel - inline in flex layout for notes view */}
        {currentView === 'notes' && <ChatPanel />}
      </div>

      {/* AI Toolbar (floating) - only for notes view */}
      {currentView === 'notes' && (
        <AIToolbar onInsert={handleAIInsert} onReplace={handleAIReplace} />
      )}
    </div>
  )
}

export default App
