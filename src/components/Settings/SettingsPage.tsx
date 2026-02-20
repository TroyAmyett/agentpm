// Settings Page
// Central settings for API keys, preferences, and account management

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Key, User, Bell, Shield, ArrowLeft, Building2, Wrench, Globe, DollarSign, Clock, Check, Cpu, Palette, Inbox, Workflow } from 'lucide-react'
import { ApiKeysManager } from './ApiKeysManager'
import { AccountSettings } from './AccountSettings'
import { AgentToolsSettings } from './AgentToolsSettings'
import { BrandTemplatesSettings } from './BrandTemplatesSettings'
import { ChannelsSettings } from './Channels/ChannelsSettings'
import { OrchestratorSettings } from './OrchestratorSettings'
import { ToolsManager } from '@/components/Admin/ToolsManager'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore } from '@/stores/profileStore'

type SettingsTab = 'api-keys' | 'accounts' | 'profile' | 'agent-tools' | 'brand-templates' | 'channels' | 'orchestrator' | 'notifications' | 'security' | 'admin-tools'

interface SettingsPageProps {
  onBack?: () => void
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api-keys')
  const { user } = useAuthStore()
  const { profile, fetchProfile } = useProfileStore()

  // Fetch profile on mount to get super admin status
  useEffect(() => {
    if (user?.id) {
      console.log('[Settings] Fetching profile for user:', user.id)
      fetchProfile(user.id)
    }
  }, [user?.id, fetchProfile])

  // Debug: Log profile state
  useEffect(() => {
    console.log('[Settings] Profile state:', {
      id: profile?.id,
      isSuperAdmin: profile?.isSuperAdmin,
      userId: profile?.userId
    })
  }, [profile])

  const allTabs = [
    { id: 'api-keys' as const, label: 'API Keys', icon: Key },
    { id: 'accounts' as const, label: 'Accounts', icon: Building2 },
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'agent-tools' as const, label: 'Agent Tools', icon: Cpu },
    { id: 'brand-templates' as const, label: 'Brand & Templates', icon: Palette },
    { id: 'channels' as const, label: 'Channels', icon: Inbox },
    { id: 'orchestrator' as const, label: 'Orchestrator', icon: Workflow },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'admin-tools' as const, label: 'Tools (Admin)', icon: Wrench, admin: true },
  ]

  // Filter tabs based on super admin status
  const tabs = allTabs.filter(tab => !tab.admin || profile?.isSuperAdmin)

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

            {activeTab === 'agent-tools' && (
              <AgentToolsSettings />
            )}

            {activeTab === 'brand-templates' && (
              <BrandTemplatesSettings />
            )}

            {activeTab === 'channels' && (
              <ChannelsSettings />
            )}

            {activeTab === 'orchestrator' && (
              <OrchestratorSettings />
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

// Language options
const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
]

// Currency options
const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
]

// Common timezones
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Moscow', label: 'Moscow' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Kolkata', label: 'Mumbai' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Beijing' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
  { value: 'UTC', label: 'UTC' },
]

function ProfileSettings() {
  const { user } = useAuthStore()
  const { profile, isLoading, fetchProfile, updateProfile } = useProfileStore()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    if (user?.id) {
      fetchProfile(user.id)
    }
  }, [user?.id, fetchProfile])

  const handleChange = async (field: string, value: string) => {
    setSaveStatus('saving')
    await updateProfile({ [field]: value })
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }

  const selectStyle = {
    background: '#1e293b',
    border: '1px solid var(--fl-color-border)',
    color: 'var(--fl-color-text-primary)',
  }

  const optionStyle = { background: '#1e293b', color: '#e2e8f0' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-lg font-medium flex items-center gap-2"
            style={{ color: 'var(--fl-color-text-primary)' }}
          >
            <User size={20} />
            Profile
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Manage your profile and locale preferences
          </p>
        </div>
        {saveStatus === 'saving' && (
          <span className="text-xs px-2 py-1 rounded" style={{ color: 'var(--fl-color-text-muted)' }}>
            Saving...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ color: '#22c55e' }}>
            <Check size={14} />
            Saved
          </span>
        )}
      </div>

      {/* Account Info */}
      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--fl-color-text-primary)' }}>
          Account
        </h3>
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
              className="w-full px-3 py-2 rounded-lg text-sm opacity-60"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--fl-color-border)',
                color: 'var(--fl-color-text-primary)',
              }}
            />
          </div>
          {/* Super Admin Status */}
          {profile?.isSuperAdmin && (
            <div className="flex items-center gap-2 mt-2 p-2 rounded-lg" style={{ background: 'rgba(168, 85, 247, 0.15)' }}>
              <Shield size={16} className="text-purple-400" />
              <span className="text-xs text-purple-300">Super Admin</span>
            </div>
          )}
        </div>
      </div>

      {/* Locale Settings */}
      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--fl-color-text-primary)' }}>
          Locale Preferences
        </h3>
        <div className="space-y-4">
          {/* Language */}
          <div>
            <label
              className="flex items-center gap-2 text-xs mb-1"
              style={{ color: 'var(--fl-color-text-muted)' }}
            >
              <Globe size={14} />
              Language
            </label>
            <select
              value={profile?.language || 'en'}
              onChange={(e) => handleChange('language', e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={selectStyle}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code} style={optionStyle}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* Currency */}
          <div>
            <label
              className="flex items-center gap-2 text-xs mb-1"
              style={{ color: 'var(--fl-color-text-muted)' }}
            >
              <DollarSign size={14} />
              Currency
            </label>
            <select
              value={profile?.currency || 'USD'}
              onChange={(e) => handleChange('currency', e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={selectStyle}
            >
              {CURRENCIES.map((curr) => (
                <option key={curr.code} value={curr.code} style={optionStyle}>
                  {curr.symbol} - {curr.name} ({curr.code})
                </option>
              ))}
            </select>
          </div>

          {/* Timezone */}
          <div>
            <label
              className="flex items-center gap-2 text-xs mb-1"
              style={{ color: 'var(--fl-color-text-muted)' }}
            >
              <Clock size={14} />
              Timezone
            </label>
            <select
              value={profile?.timezone || 'UTC'}
              onChange={(e) => handleChange('timezone', e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={selectStyle}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value} style={optionStyle}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
              Used for scheduling and displaying dates/times
            </p>
          </div>
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
          Personal notification preferences
        </p>
      </div>

      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--fl-color-text-primary)' }}>
          In-App Notifications
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--fl-color-text-primary)' }}>Task assignments</div>
              <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>When a task is assigned to you or your agents</div>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--fl-color-text-primary)' }}>Task completions</div>
              <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>When agents complete tasks</div>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--fl-color-text-primary)' }}>Reviews needed</div>
              <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>When tasks are ready for your review</div>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--fl-color-text-primary)' }}>Task failures</div>
              <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>When agents fail to complete tasks</div>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </div>
        </div>
      </div>

      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--fl-color-text-primary)' }}>
          External Channels
        </h3>
        <p className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
          Configure email, Slack, and Telegram notification channels in the{' '}
          <span className="text-sky-400 cursor-pointer hover:underline">Channels</span>{' '}
          settings tab.
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
