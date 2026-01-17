// Settings Page
// Central settings for API keys, preferences, and account management

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Key, User, Bell, Shield, ArrowLeft, Building2, Wrench } from 'lucide-react'
import { ApiKeysManager } from './ApiKeysManager'
import { AccountSettings } from './AccountSettings'
import { ToolsManager } from '@/components/Admin/ToolsManager'
import { useAuthStore } from '@/stores/authStore'

type SettingsTab = 'api-keys' | 'accounts' | 'profile' | 'notifications' | 'security' | 'admin-tools'

interface SettingsPageProps {
  onBack?: () => void
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api-keys')
  const { user } = useAuthStore()

  const tabs = [
    { id: 'api-keys' as const, label: 'API Keys', icon: Key },
    { id: 'accounts' as const, label: 'Accounts', icon: Building2 },
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'admin-tools' as const, label: 'Tools (Admin)', icon: Wrench, admin: true },
  ]

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: 'var(--fl-color-bg-base)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-4 border-b"
        style={{ borderColor: 'var(--fl-color-border)' }}
      >
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
            style={{ color: 'var(--fl-color-text-secondary)' }}
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <h1
          className="text-xl font-medium"
          style={{ color: 'var(--fl-color-text-primary)' }}
        >
          Settings
        </h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <nav
          className="w-56 flex-shrink-0 p-4 border-r overflow-y-auto"
          style={{ borderColor: 'var(--fl-color-border)' }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1 ${
                  isActive ? '' : 'hover:bg-[var(--fl-color-bg-elevated)]'
                }`}
                style={{
                  background: isActive ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                  color: isActive ? '#0ea5e9' : 'var(--fl-color-text-secondary)',
                }}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            )
          })}
        </nav>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-3xl"
          >
            {activeTab === 'api-keys' && user && (
              <ApiKeysManager userId={user.id} />
            )}

            {activeTab === 'accounts' && (
              <AccountSettings />
            )}

            {activeTab === 'profile' && (
              <ProfileSettings />
            )}

            {activeTab === 'notifications' && (
              <NotificationSettings />
            )}

            {activeTab === 'security' && (
              <SecuritySettings />
            )}

            {activeTab === 'admin-tools' && (
              <ToolsManager />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// Placeholder components for other settings
function ProfileSettings() {
  const { user } = useAuthStore()

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-lg font-medium flex items-center gap-2"
          style={{ color: 'var(--fl-color-text-primary)' }}
        >
          <User size={20} />
          Profile
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
          Manage your profile information
        </p>
      </div>

      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <div className="space-y-4">
          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: 'var(--fl-color-text-muted)' }}
            >
              Email
            </label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--fl-color-border)',
                color: 'var(--fl-color-text-primary)',
              }}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
            More profile options coming soon.
          </p>
        </div>
      </div>
    </div>
  )
}

function NotificationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-lg font-medium flex items-center gap-2"
          style={{ color: 'var(--fl-color-text-primary)' }}
        >
          <Bell size={20} />
          Notifications
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
          Configure how you receive notifications
        </p>
      </div>

      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
          Notification settings coming soon.
        </p>
      </div>
    </div>
  )
}

function SecuritySettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-lg font-medium flex items-center gap-2"
          style={{ color: 'var(--fl-color-text-primary)' }}
        >
          <Shield size={20} />
          Security
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
          Manage your security settings
        </p>
      </div>

      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
          Security settings (2FA, sessions, etc.) coming soon.
        </p>
      </div>
    </div>
  )
}

export default SettingsPage
