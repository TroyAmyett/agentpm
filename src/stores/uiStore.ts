import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarOpen: boolean
  chatPanelOpen: boolean
  darkMode: boolean
  aiToolbarPosition: { x: number; y: number } | null
  selectedText: string
  sidebarWidth: number
  chatPanelWidth: number

  // Actions
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleChatPanel: () => void
  setChatPanelOpen: (open: boolean) => void
  toggleDarkMode: () => void
  setDarkMode: (dark: boolean) => void
  showAIToolbar: (position: { x: number; y: number }, text: string) => void
  hideAIToolbar: () => void
  setSidebarWidth: (width: number) => void
  setChatPanelWidth: (width: number) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      chatPanelOpen: true,
      darkMode: true,
      aiToolbarPosition: null,
      selectedText: '',
      sidebarWidth: 288,
      chatPanelWidth: 400,

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      toggleChatPanel: () => set((state) => ({ chatPanelOpen: !state.chatPanelOpen })),
      setChatPanelOpen: (open) => set({ chatPanelOpen: open }),

      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      setDarkMode: (dark) => set({ darkMode: dark }),

      showAIToolbar: (position, text) => set({
        aiToolbarPosition: position,
        selectedText: text
      }),
      hideAIToolbar: () => set({ aiToolbarPosition: null, selectedText: '' }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(500, width)) }),
      setChatPanelWidth: (width) => set({ chatPanelWidth: Math.max(300, Math.min(600, width)) }),
    }),
    {
      name: 'ai-notetaker-ui',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        darkMode: state.darkMode,
        sidebarWidth: state.sidebarWidth,
        chatPanelWidth: state.chatPanelWidth,
      }),
    }
  )
)
