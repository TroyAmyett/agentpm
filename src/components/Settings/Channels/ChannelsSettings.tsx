// Channels Settings — Intake & Notification Channel Configuration
// Manages inbound task creation channels (email, Slack, Telegram, webhooks)
// and outbound notification channels for task status updates

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Inbox,
  Mail,
  MessageSquare,
  Send,
  Webhook,
  Key,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Bell,
  Activity,
  ExternalLink,
} from 'lucide-react'
import { useIntakeStore } from '@/stores/intakeStore'
import { useAccountStore } from '@/stores/accountStore'
import type {
  IntakeChannel,
  IntakeChannelType,
  NotificationChannel,
  NotificationChannelType,
  NotificationEvent,
} from '@/types/agentpm'

// ─── Channel Type Config ────────────────────────────────────────────────────

const INTAKE_CHANNEL_TYPES: Array<{
  type: IntakeChannelType
  label: string
  description: string
  icon: typeof Mail
  color: string
}> = [
  {
    type: 'email',
    label: 'Email',
    description: 'Forward emails to create tasks — like Asana email intake',
    icon: Mail,
    color: '#3b82f6',
  },
  {
    type: 'slack',
    label: 'Slack',
    description: 'Create tasks from Slack messages and slash commands',
    icon: MessageSquare,
    color: '#e01e5a',
  },
  {
    type: 'telegram',
    label: 'Telegram',
    description: 'Send messages to a Telegram bot to create tasks',
    icon: Send,
    color: '#0088cc',
  },
  {
    type: 'webhook',
    label: 'Webhook',
    description: 'Receive tasks from any system via HTTP webhook',
    icon: Webhook,
    color: '#8b5cf6',
  },
  {
    type: 'api',
    label: 'API Key',
    description: 'Create tasks programmatically with an API key',
    icon: Key,
    color: '#f59e0b',
  },
]

const NOTIFICATION_CHANNEL_TYPES: Array<{
  type: NotificationChannelType
  label: string
  description: string
  icon: typeof Mail
  color: string
}> = [
  { type: 'email', label: 'Email', description: 'Email notifications', icon: Mail, color: '#3b82f6' },
  { type: 'slack', label: 'Slack', description: 'Slack channel notifications', icon: MessageSquare, color: '#e01e5a' },
  { type: 'telegram', label: 'Telegram', description: 'Telegram bot notifications', icon: Send, color: '#0088cc' },
  { type: 'webhook', label: 'Webhook', description: 'Webhook notifications', icon: Webhook, color: '#8b5cf6' },
  { type: 'in_app', label: 'In-App', description: 'In-app notifications', icon: Bell, color: '#22c55e' },
]

const NOTIFICATION_EVENTS: Array<{ value: NotificationEvent; label: string; emoji: string }> = [
  { value: 'queued', label: 'Queued', emoji: '📥' },
  { value: 'in_progress', label: 'In Progress', emoji: '⚙️' },
  { value: 'review', label: 'Ready for Review', emoji: '👀' },
  { value: 'completed', label: 'Completed', emoji: '✅' },
  { value: 'failed', label: 'Failed', emoji: '❌' },
  { value: 'cancelled', label: 'Cancelled', emoji: '🚫' },
]

// ─── Sub-tab type ───────────────────────────────────────────────────────────

type ChannelsSubTab = 'intake' | 'notifications' | 'activity'

// ─── Main Component ─────────────────────────────────────────────────────────

export function ChannelsSettings() {
  const [subTab, setSubTab] = useState<ChannelsSubTab>('intake')
  const [showAddIntake, setShowAddIntake] = useState(false)
  const [showAddNotification, setShowAddNotification] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { currentAccountId } = useAccountStore()
  const {
    intakeChannels,
    notificationChannels,
    intakeLog,
    notificationLog,
    loading,
    error,
    fetchIntakeChannels,
    fetchNotificationChannels,
    fetchIntakeLog,
    fetchNotificationLog,
    createIntakeChannel,
    updateIntakeChannel,
    deleteIntakeChannel,
    toggleIntakeChannel,
    createNotificationChannel,
    updateNotificationChannel,
    deleteNotificationChannel,
    toggleNotificationChannel,
    generateEmailAddress,
    generateWebhookSlug,
    clearError,
  } = useIntakeStore()

  useEffect(() => {
    if (currentAccountId) {
      fetchIntakeChannels(currentAccountId)
      fetchNotificationChannels(currentAccountId)
    }
  }, [currentAccountId, fetchIntakeChannels, fetchNotificationChannels])

  useEffect(() => {
    if (currentAccountId && subTab === 'activity') {
      fetchIntakeLog(currentAccountId, 20)
      fetchNotificationLog(currentAccountId, 20)
    }
  }, [currentAccountId, subTab, fetchIntakeLog, fetchNotificationLog])

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  // ── Add Intake Channel ──────────────────────────────────────────────
  const handleAddIntakeChannel = async (type: IntakeChannelType) => {
    if (!currentAccountId) return

    const typeConfig = INTAKE_CHANNEL_TYPES.find(t => t.type === type)
    const config: Record<string, unknown> = {}
    let channelAddress: string | undefined
    let webhookSlug: string | undefined

    if (type === 'email') {
      channelAddress = generateEmailAddress(currentAccountId)
      config.address = channelAddress
      config.domain = 'inbound.agentpm.app'
    } else if (type === 'webhook') {
      webhookSlug = generateWebhookSlug()
      config.secret_hash = generateWebhookSlug() // Generate a secret too
    }

    await createIntakeChannel({
      accountId: currentAccountId,
      channelType: type,
      name: `${typeConfig?.label || type} Intake`,
      config,
      channelAddress,
      webhookSlug,
      defaultPriority: 'medium',
      defaultStatus: 'pending',
      autoParse: true,
      autoAssign: false,
      autoExecute: false,
    })

    setShowAddIntake(false)
  }

  // ── Add Notification Channel ────────────────────────────────────────
  const handleAddNotificationChannel = async (type: NotificationChannelType) => {
    if (!currentAccountId) return

    const typeConfig = NOTIFICATION_CHANNEL_TYPES.find(t => t.type === type)

    await createNotificationChannel({
      accountId: currentAccountId,
      channelType: type,
      name: `${typeConfig?.label || type} Notifications`,
      notifyOn: ['completed', 'failed', 'review'],
    })

    setShowAddNotification(false)
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2
          className="text-lg font-medium flex items-center gap-2"
          style={{ color: 'var(--fl-color-text-primary)' }}
        >
          <Inbox size={20} />
          Channels
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
          Configure how tasks come in and how you get notified
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="p-3 rounded-lg text-sm flex items-center justify-between"
          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
        >
          {error}
          <button onClick={clearError} className="text-xs underline ml-4">Dismiss</button>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
        {([
          { id: 'intake' as const, label: 'Intake', icon: Inbox, count: intakeChannels.length },
          { id: 'notifications' as const, label: 'Notifications', icon: Bell, count: notificationChannels.length },
          { id: 'activity' as const, label: 'Activity', icon: Activity },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              background: subTab === tab.id ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
              color: subTab === tab.id ? '#0ea5e9' : 'var(--fl-color-text-secondary)',
            }}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.count !== undefined && (
              <span className="text-xs opacity-60">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={subTab}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15 }}
        >
          {subTab === 'intake' && (
            <IntakeChannelsPanel
              channels={intakeChannels}
              loading={loading}
              showAdd={showAddIntake}
              setShowAdd={setShowAddIntake}
              onAdd={handleAddIntakeChannel}
              onToggle={toggleIntakeChannel}
              onDelete={deleteIntakeChannel}
              onUpdate={updateIntakeChannel}
              onCopy={copyToClipboard}
              copiedId={copiedId}
              supabaseUrl={supabaseUrl}
            />
          )}

          {subTab === 'notifications' && (
            <NotificationChannelsPanel
              channels={notificationChannels}
              loading={loading}
              showAdd={showAddNotification}
              setShowAdd={setShowAddNotification}
              onAdd={handleAddNotificationChannel}
              onToggle={toggleNotificationChannel}
              onDelete={deleteNotificationChannel}
              onUpdate={updateNotificationChannel}
            />
          )}

          {subTab === 'activity' && (
            <ActivityPanel
              intakeLog={intakeLog}
              notificationLog={notificationLog}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ─── Intake Channels Panel ──────────────────────────────────────────────────

function IntakeChannelsPanel({
  channels,
  loading,
  showAdd,
  setShowAdd,
  onAdd,
  onToggle,
  onDelete,
  onUpdate,
  onCopy,
  copiedId,
  supabaseUrl,
}: {
  channels: IntakeChannel[]
  loading: boolean
  showAdd: boolean
  setShowAdd: (v: boolean) => void
  onAdd: (type: IntakeChannelType) => void
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<IntakeChannel>) => void
  onCopy: (text: string, id: string) => void
  copiedId: string | null
  supabaseUrl: string
}) {
  return (
    <div className="space-y-4">
      {/* Add Channel Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: '#6366f1' }}
        >
          <Plus size={16} />
          Add Intake Channel
        </button>
      </div>

      {/* Add Channel Picker */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="p-4 rounded-xl space-y-3"
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                Choose a channel type:
              </p>
              <div className="grid grid-cols-1 gap-2">
                {INTAKE_CHANNEL_TYPES.map(ct => (
                  <button
                    key={ct.type}
                    onClick={() => onAdd(ct.type)}
                    className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                    style={{ border: '1px solid var(--fl-color-border)' }}
                  >
                    <div className="p-2 rounded-lg" style={{ background: `${ct.color}20` }}>
                      <ct.icon size={18} style={{ color: ct.color }} />
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                        {ct.label}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                        {ct.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Channel List */}
      {channels.length === 0 && !loading && (
        <div
          className="p-8 rounded-xl text-center"
          style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
        >
          <Inbox size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-secondary)' }}>
            No intake channels configured
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Add an email, Slack, Telegram, or webhook channel to start receiving tasks
          </p>
        </div>
      )}

      {channels.map(channel => {
        const typeConfig = INTAKE_CHANNEL_TYPES.find(t => t.type === channel.channelType)
        const Icon = typeConfig?.icon || Inbox

        return (
          <IntakeChannelCard
            key={channel.id}
            channel={channel}
            Icon={Icon}
            color={typeConfig?.color || '#666'}
            onToggle={onToggle}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onCopy={onCopy}
            copiedId={copiedId}
            supabaseUrl={supabaseUrl}
          />
        )
      })}
    </div>
  )
}

// ─── Intake Channel Card ────────────────────────────────────────────────────

function IntakeChannelCard({
  channel,
  Icon,
  color,
  onToggle,
  onDelete,
  onUpdate,
  onCopy,
  copiedId,
  supabaseUrl,
}: {
  channel: IntakeChannel
  Icon: typeof Mail
  color: string
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<IntakeChannel>) => void
  onCopy: (text: string, id: string) => void
  copiedId: string | null
  supabaseUrl: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [savedField, setSavedField] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)

  const handleConfigSave = (field: string, value: string) => {
    onUpdate(channel.id, {
      config: { ...(channel.config || {}), [field]: value }
    } as Partial<IntakeChannel>)
    setSavedField(field)
    setTimeout(() => setSavedField(null), 2000)
  }

  // Build the endpoint URL for display
  let endpointUrl = ''
  if (channel.channelType === 'email') {
    endpointUrl = channel.channelAddress || ''
  } else if (channel.channelType === 'webhook') {
    endpointUrl = `${supabaseUrl}/functions/v1/intake-task/${channel.webhookSlug}`
  } else if (channel.channelType === 'slack') {
    endpointUrl = `${supabaseUrl}/functions/v1/intake-slack`
  } else if (channel.channelType === 'telegram') {
    endpointUrl = `${supabaseUrl}/functions/v1/intake-telegram`
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${channel.isActive ? 'var(--fl-color-border)' : 'rgba(255,255,255,0.03)'}`,
        opacity: channel.isActive ? 1 : 0.6,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="p-2 rounded-lg" style={{ background: `${color}20` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
              {channel.name}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: channel.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: channel.isActive ? '#22c55e' : '#ef4444',
              }}
            >
              {channel.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {endpointUrl && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs font-mono truncate" style={{ color: 'var(--fl-color-text-muted)' }}>
                {endpointUrl}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onCopy(endpointUrl, channel.id) }}
                className="p-1 rounded hover:bg-[var(--fl-color-bg-elevated)] flex-shrink-0"
              >
                {copiedId === channel.id ? (
                  <Check size={12} style={{ color: '#22c55e' }} />
                ) : (
                  <Copy size={12} style={{ color: 'var(--fl-color-text-muted)' }} />
                )}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
            {channel.totalTasksCreated} tasks
          </span>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>

      {/* Expanded Settings */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 space-y-4"
              style={{ borderTop: '1px solid var(--fl-color-border)' }}
            >
              <div className="pt-4 space-y-3">
                {/* Bot Token — shown for Telegram and Slack channels */}
                {(channel.channelType === 'telegram' || channel.channelType === 'slack') && (
                  <div className="space-y-3 p-3 rounded-lg" style={{ background: 'rgba(0,136,204,0.1)', border: '1px solid rgba(0,136,204,0.25)' }}>
                    <div className="text-xs font-semibold" style={{ color: '#0ea5e9' }}>
                      {channel.channelType === 'telegram' ? 'Telegram Bot Setup' : 'Slack Bot Setup'}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                          Bot Token{channel.channelType === 'telegram' ? ' (from @BotFather)' : ''}:
                        </label>
                        {savedField === 'bot_token_enc' && (
                          <span className="text-xs font-medium" style={{ color: '#22c55e' }}>Saved</span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showToken ? 'text' : 'password'}
                          placeholder={channel.channelType === 'telegram' ? '123456789:ABCdefGHIjklMNO...' : 'xoxb-...'}
                          defaultValue={(channel.config as Record<string, unknown>)?.bot_token_enc as string || ''}
                          onBlur={(e) => {
                            if (e.target.value) handleConfigSave('bot_token_enc', e.target.value)
                          }}
                          className="w-full px-3 py-2 pr-16 rounded-lg text-sm"
                          style={{
                            background: '#1e293b',
                            border: '1px solid var(--fl-color-border)',
                            color: 'var(--fl-color-text-primary)',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded"
                          style={{ color: 'var(--fl-color-text-muted)' }}
                        >
                          {showToken ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
                        Paste your token and click away to save
                      </div>
                    </div>
                    {channel.channelType === 'telegram' && !!(channel.config as Record<string, unknown>)?.bot_token_enc && (
                      <>
                        <button
                          onClick={() => {
                            const token = (channel.config as Record<string, unknown>).bot_token_enc as string
                            const webhookUrl = `${supabaseUrl}/functions/v1/intake-telegram`
                            window.open(
                              `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
                              '_blank'
                            )
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          style={{
                            background: '#0088cc',
                            color: '#fff',
                          }}
                        >
                          <ExternalLink size={14} />
                          Register Webhook with Telegram
                        </button>
                        <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                          Opens Telegram API in a new tab. You should see <span style={{ color: '#22c55e' }}>&quot;ok&quot;: true</span>. Then message your bot to connect.
                        </div>
                      </>
                    )}
                    {channel.channelType === 'telegram' && (
                      <div>
                        <label className="text-xs mb-1 block" style={{ color: 'var(--fl-color-text-muted)' }}>
                          Chat ID:
                        </label>
                        {(channel.config as Record<string, unknown>)?.chat_id ? (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: '#1e293b', border: '1px solid var(--fl-color-border)' }}>
                            <span style={{ color: '#22c55e' }}>{(channel.config as Record<string, unknown>).chat_id as string}</span>
                            <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>(linked)</span>
                          </div>
                        ) : (
                          <div className="px-3 py-2 rounded-lg text-sm" style={{ background: '#1e293b', border: '1px solid var(--fl-color-border)', color: 'var(--fl-color-text-muted)' }}>
                            Pending — message your bot to link automatically
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* AI Parsing Options */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--fl-color-text-primary)' }}>AI Auto-Parse</div>
                    <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                      Use AI to extract title, description, and priority
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={channel.autoParse}
                    onChange={(v) => onUpdate(channel.id, { autoParse: v } as Partial<IntakeChannel>)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--fl-color-text-primary)' }}>Auto-Assign Agent</div>
                    <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                      Automatically assign to the best-fit agent
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={channel.autoAssign}
                    onChange={(v) => onUpdate(channel.id, { autoAssign: v } as Partial<IntakeChannel>)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--fl-color-text-primary)' }}>Auto-Execute</div>
                    <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                      Automatically queue for agent execution
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={channel.autoExecute}
                    onChange={(v) => onUpdate(channel.id, { autoExecute: v } as Partial<IntakeChannel>)}
                  />
                </div>

                {/* Default Priority */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--fl-color-text-muted)' }}>
                    Default Priority
                  </label>
                  <select
                    value={channel.defaultPriority}
                    onChange={(e) => onUpdate(channel.id, {
                      defaultPriority: e.target.value as IntakeChannel['defaultPriority']
                    })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: '#1e293b',
                      border: '1px solid var(--fl-color-border)',
                      color: 'var(--fl-color-text-primary)',
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--fl-color-border)' }}>
                  <button
                    onClick={() => onToggle(channel.id, !channel.isActive)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                    style={{ color: channel.isActive ? '#ef4444' : '#22c55e' }}
                  >
                    {channel.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                    {channel.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this intake channel? This cannot be undone.')) {
                        onDelete(channel.id)
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                    style={{ color: '#ef4444' }}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Notification Channels Panel ────────────────────────────────────────────

function NotificationChannelsPanel({
  channels,
  loading,
  showAdd,
  setShowAdd,
  onAdd,
  onToggle,
  onDelete,
  onUpdate,
}: {
  channels: NotificationChannel[]
  loading: boolean
  showAdd: boolean
  setShowAdd: (v: boolean) => void
  onAdd: (type: NotificationChannelType) => void
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<NotificationChannel>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: '#6366f1' }}
        >
          <Plus size={16} />
          Add Notification Channel
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="p-4 rounded-xl space-y-3"
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                Choose a notification channel:
              </p>
              <div className="grid grid-cols-1 gap-2">
                {NOTIFICATION_CHANNEL_TYPES.map(ct => (
                  <button
                    key={ct.type}
                    onClick={() => onAdd(ct.type)}
                    className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                    style={{ border: '1px solid var(--fl-color-border)' }}
                  >
                    <div className="p-2 rounded-lg" style={{ background: `${ct.color}20` }}>
                      <ct.icon size={18} style={{ color: ct.color }} />
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>{ct.label}</div>
                      <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>{ct.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {channels.length === 0 && !loading && (
        <div
          className="p-8 rounded-xl text-center"
          style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
        >
          <Bell size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-secondary)' }}>
            No notification channels configured
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Add a channel to receive task status updates via email, Slack, or Telegram
          </p>
        </div>
      )}

      {channels.map(channel => {
        const typeConfig = NOTIFICATION_CHANNEL_TYPES.find(t => t.type === channel.channelType)
        const Icon = typeConfig?.icon || Bell

        return (
          <NotificationChannelCard
            key={channel.id}
            channel={channel}
            Icon={Icon}
            color={typeConfig?.color || '#666'}
            onToggle={onToggle}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        )
      })}
    </div>
  )
}

// ─── Notification Channel Card ──────────────────────────────────────────────

function NotificationChannelCard({
  channel,
  Icon,
  color,
  onToggle,
  onDelete,
  onUpdate,
}: {
  channel: NotificationChannel
  Icon: typeof Bell
  color: string
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<NotificationChannel>) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const toggleEvent = (event: NotificationEvent) => {
    const current = channel.notifyOn || []
    const updated = current.includes(event)
      ? current.filter(e => e !== event)
      : [...current, event]
    onUpdate(channel.id, { notifyOn: updated })
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${channel.isActive ? 'var(--fl-color-border)' : 'rgba(255,255,255,0.03)'}`,
        opacity: channel.isActive ? 1 : 0.6,
      }}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="p-2 rounded-lg" style={{ background: `${color}20` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
              {channel.name}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: channel.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: channel.isActive ? '#22c55e' : '#ef4444',
              }}
            >
              {channel.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--fl-color-text-muted)' }}>
            Notifies on: {(channel.notifyOn || []).join(', ') || 'nothing'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
            {channel.totalSent} sent
          </span>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid var(--fl-color-border)' }}>
              <div className="pt-4">
                <label className="text-xs mb-2 block" style={{ color: 'var(--fl-color-text-muted)' }}>
                  Notify on these events:
                </label>
                <div className="flex flex-wrap gap-2">
                  {NOTIFICATION_EVENTS.map(evt => {
                    const isSelected = (channel.notifyOn || []).includes(evt.value)
                    return (
                      <button
                        key={evt.value}
                        onClick={() => toggleEvent(evt.value)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{
                          background: isSelected ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          color: isSelected ? '#0ea5e9' : 'var(--fl-color-text-muted)',
                          border: `1px solid ${isSelected ? 'rgba(14, 165, 233, 0.3)' : 'var(--fl-color-border)'}`,
                        }}
                      >
                        {evt.emoji} {evt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Channel-specific config input */}
              {channel.channelType === 'email' && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--fl-color-text-muted)' }}>
                    Send notifications to:
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    defaultValue={(channel.config as Record<string, unknown>).to_address as string || ''}
                    onBlur={(e) => onUpdate(channel.id, {
                      config: { ...channel.config, to_address: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: '#1e293b',
                      border: '1px solid var(--fl-color-border)',
                      color: 'var(--fl-color-text-primary)',
                    }}
                  />
                </div>
              )}

              {channel.channelType === 'slack' && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--fl-color-text-muted)' }}>
                    Slack Webhook URL:
                  </label>
                  <input
                    type="url"
                    placeholder="https://hooks.slack.com/services/..."
                    defaultValue={(channel.config as Record<string, unknown>).webhook_url as string || ''}
                    onBlur={(e) => onUpdate(channel.id, {
                      config: { ...channel.config, webhook_url: e.target.value }
                    })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: '#1e293b',
                      border: '1px solid var(--fl-color-border)',
                      color: 'var(--fl-color-text-primary)',
                    }}
                  />
                </div>
              )}

              {channel.channelType === 'telegram' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--fl-color-text-muted)' }}>
                      Bot Token:
                    </label>
                    <input
                      type="password"
                      placeholder="123456789:ABCdefGHIjklMNO..."
                      defaultValue={(channel.config as Record<string, unknown>).bot_token_enc as string || ''}
                      onBlur={(e) => onUpdate(channel.id, {
                        config: { ...channel.config, bot_token_enc: e.target.value }
                      })}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        background: '#1e293b',
                        border: '1px solid var(--fl-color-border)',
                        color: 'var(--fl-color-text-primary)',
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--fl-color-text-muted)' }}>
                      Chat ID:
                    </label>
                    <input
                      type="text"
                      placeholder="-1001234567890"
                      defaultValue={(channel.config as Record<string, unknown>).chat_id as string || ''}
                      onBlur={(e) => onUpdate(channel.id, {
                        config: { ...channel.config, chat_id: e.target.value }
                      })}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        background: '#1e293b',
                        border: '1px solid var(--fl-color-border)',
                        color: 'var(--fl-color-text-primary)',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--fl-color-border)' }}>
                <button
                  onClick={() => onToggle(channel.id, !channel.isActive)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                  style={{ color: channel.isActive ? '#ef4444' : '#22c55e' }}
                >
                  {channel.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                  {channel.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this notification channel?')) {
                      onDelete(channel.id)
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Activity Panel ─────────────────────────────────────────────────────────

function ActivityPanel({
  intakeLog,
  notificationLog,
}: {
  intakeLog: import('@/types/agentpm').IntakeLogEntry[]
  notificationLog: import('@/types/agentpm').NotificationLogEntry[]
}) {
  const statusColor: Record<string, string> = {
    received: '#3b82f6',
    parsing: '#f59e0b',
    parsed: '#8b5cf6',
    task_created: '#22c55e',
    failed: '#ef4444',
    rejected: '#ef4444',
    duplicate: '#f59e0b',
    pending: '#f59e0b',
    sending: '#3b82f6',
    sent: '#22c55e',
    delivered: '#22c55e',
  }

  return (
    <div className="space-y-6">
      {/* Intake Log */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--fl-color-text-primary)' }}>
          <Inbox size={16} />
          Recent Intake
        </h3>
        {intakeLog.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>No intake activity yet</p>
        ) : (
          <div className="space-y-2">
            {intakeLog.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: statusColor[entry.status] || '#666' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: 'var(--fl-color-text-primary)' }}>
                    {entry.parsedTitle || entry.rawSubject || 'Untitled'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                    {entry.sourceType} from {entry.senderName || entry.senderAddress || 'unknown'}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: `${statusColor[entry.status]}15`, color: statusColor[entry.status] }}
                  >
                    {entry.status}
                  </span>
                  <div className="text-xs mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
                    {new Date(entry.receivedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notification Log */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--fl-color-text-primary)' }}>
          <Bell size={16} />
          Recent Notifications
        </h3>
        {notificationLog.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>No notifications sent yet</p>
        ) : (
          <div className="space-y-2">
            {notificationLog.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: statusColor[entry.status] || '#666' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: 'var(--fl-color-text-primary)' }}>
                    {entry.subject || entry.eventType}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                    {entry.previousStatus} → {entry.newStatus}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: `${statusColor[entry.status]}15`, color: statusColor[entry.status] }}
                  >
                    {entry.status}
                  </span>
                  <div className="text-xs mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Toggle Switch Component ────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-10 h-5 rounded-full transition-colors"
      style={{ background: checked ? '#6366f1' : 'rgba(255, 255, 255, 0.1)' }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
        style={{ left: checked ? '22px' : '2px' }}
      />
    </button>
  )
}
