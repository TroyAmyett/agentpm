import { LayoutDashboard, Flame, Rss, Users, Bookmark, Settings } from 'lucide-react'

export type RadarTab = 'dashboard' | 'whats-hot' | 'sources' | 'experts' | 'saved' | 'settings'

interface SidebarItem {
  id: RadarTab
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const sidebarItems: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'whats-hot', label: "What's Hot", icon: Flame },
  { id: 'sources', label: 'Sources', icon: Rss },
  { id: 'experts', label: 'Experts', icon: Users },
  { id: 'saved', label: 'Saved', icon: Bookmark },
]

const settingsItem: SidebarItem = { id: 'settings', label: 'Settings', icon: Settings }

interface RadarSidebarProps {
  activeTab: RadarTab
  onTabChange: (tab: RadarTab) => void
}

export function RadarSidebar({ activeTab, onTabChange }: RadarSidebarProps) {
  return (
    <div
      className="w-56 flex-shrink-0 flex flex-col h-full border-r"
      style={{
        background: 'var(--fl-color-bg-surface)',
        borderColor: 'var(--fl-color-border)',
      }}
    >
      {/* Navigation Items */}
      <nav className="flex-1 py-4 px-3">
        <div className="space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#0ea5e9] text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* Separator */}
        <div className="my-4 border-t" style={{ borderColor: 'var(--fl-color-border)' }} />

        {/* Settings */}
        <button
          onClick={() => onTabChange(settingsItem.id)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === settingsItem.id
              ? 'bg-[#0ea5e9] text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <settingsItem.icon className="w-5 h-5" />
          <span>{settingsItem.label}</span>
        </button>
      </nav>
    </div>
  )
}
