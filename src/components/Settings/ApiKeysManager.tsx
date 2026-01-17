// API Keys Manager Component
// Allows users to manage their LLM provider API keys

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { useApiKeysStore, type ApiKey } from '@/stores/apiKeysStore'
import {
  PROVIDERS,
  type Provider,
  validateApiKeyFormat,
  detectProvider,
} from '@/services/encryption'

interface ApiKeysManagerProps {
  userId: string
}

export function ApiKeysManager({ userId }: ApiKeysManagerProps) {
  const { keys, isLoading, error, fetchKeys, addKey, removeKey, clearError } =
    useApiKeysStore()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newKeyValue, setNewKeyValue] = useState('')
  const [newKeyProvider, setNewKeyProvider] = useState<Provider>('openai')
  const [showNewKey, setShowNewKey] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    fetchKeys(userId)
  }, [userId, fetchKeys])

  const handleAddKey = async () => {
    if (!newKeyValue.trim()) return

    const provider = detectProvider(newKeyValue) as Provider
    if (!validateApiKeyFormat(newKeyValue, provider)) {
      // Still allow adding, but warn
      console.warn('API key format may be invalid')
    }

    await addKey(userId, newKeyValue, newKeyProvider)
    setNewKeyValue('')
    setShowAddForm(false)
    setShowNewKey(false)
  }

  const handleDeleteKey = async (keyId: string) => {
    await removeKey(keyId)
    setDeleteConfirm(null)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-lg font-medium flex items-center gap-2"
            style={{ color: 'var(--fl-color-text-primary)' }}
          >
            <Key size={20} />
            API Keys
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Manage your LLM provider API keys. Keys are encrypted at rest.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: 'var(--fl-color-primary)' }}
        >
          <Plus size={16} />
          Add Key
        </button>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-3 rounded-lg"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
            }}
          >
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
            <button
              onClick={clearError}
              className="ml-auto text-xs underline hover:no-underline"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Key Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="p-4 rounded-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--fl-color-border)',
              }}
            >
              <h3
                className="text-sm font-medium mb-4"
                style={{ color: 'var(--fl-color-text-primary)' }}
              >
                Add New API Key
              </h3>

              <div className="space-y-4">
                {/* Provider Select */}
                <div>
                  <label
                    className="block text-xs mb-1"
                    style={{ color: 'var(--fl-color-text-muted)' }}
                  >
                    Provider
                  </label>
                  <select
                    value={newKeyProvider}
                    onChange={(e) => setNewKeyProvider(e.target.value as Provider)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: 'var(--fl-color-bg-elevated, #1a1a24)',
                      border: '1px solid var(--fl-color-border)',
                      color: 'var(--fl-color-text-primary)',
                    }}
                  >
                    {Object.entries(PROVIDERS).map(([key, { name, icon }]) => (
                      <option
                        key={key}
                        value={key}
                        style={{
                          background: 'var(--fl-color-bg-elevated, #1a1a24)',
                          color: 'var(--fl-color-text-primary, #e5e5e5)',
                        }}
                      >
                        {icon} {name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* API Key Input */}
                <div>
                  <label
                    className="block text-xs mb-1"
                    style={{ color: 'var(--fl-color-text-muted)' }}
                  >
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showNewKey ? 'text' : 'password'}
                      value={newKeyValue}
                      onChange={(e) => setNewKeyValue(e.target.value)}
                      placeholder={PROVIDERS[newKeyProvider].placeholder || 'Enter API key'}
                      className="w-full px-3 py-2 pr-10 rounded-lg text-sm font-mono"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--fl-color-border)',
                        color: 'var(--fl-color-text-primary)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewKey(!showNewKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--fl-color-text-muted)' }}
                    >
                      {showNewKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Security Notice */}
                <div
                  className="flex items-start gap-2 p-3 rounded-lg text-xs"
                  style={{
                    background: 'rgba(14, 165, 233, 0.1)',
                    border: '1px solid rgba(14, 165, 233, 0.2)',
                    color: 'var(--fl-color-text-secondary)',
                  }}
                >
                  <Shield size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#0ea5e9' }} />
                  <span>
                    Your API key will be encrypted using AES-256-GCM before being stored.
                    We never store your key in plain text.
                  </span>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowAddForm(false)
                      setNewKeyValue('')
                      setShowNewKey(false)
                    }}
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--fl-color-text-secondary)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddKey}
                    disabled={!newKeyValue.trim() || isLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                    style={{ background: 'var(--fl-color-primary)' }}
                  >
                    {isLoading ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    Save Key
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keys List */}
      <div className="space-y-3">
        {isLoading && keys.length === 0 ? (
          <div
            className="flex items-center justify-center py-8"
            style={{ color: 'var(--fl-color-text-muted)' }}
          >
            <RefreshCw size={20} className="animate-spin mr-2" />
            Loading keys...
          </div>
        ) : keys.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-8"
            style={{ color: 'var(--fl-color-text-muted)' }}
          >
            <Key size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No API keys configured</p>
            <p className="text-xs mt-1">Add your first API key to get started</p>
          </div>
        ) : (
          <AnimatePresence>
            {keys.map((key) => (
              <ApiKeyCard
                key={key.id}
                apiKey={key}
                onDelete={() => setDeleteConfirm(key.id)}
                formatDate={formatDate}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="p-6 rounded-xl max-w-sm w-full mx-4"
              style={{
                background: 'var(--fl-color-bg-surface)',
                border: '1px solid var(--fl-color-border)',
              }}
            >
              <h3
                className="text-lg font-medium mb-2"
                style={{ color: 'var(--fl-color-text-primary)' }}
              >
                Delete API Key?
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--fl-color-text-muted)' }}>
                This action cannot be undone. Any tools using this key will stop working.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--fl-color-text-secondary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteKey(deleteConfirm)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: '#ef4444' }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Individual API Key Card
function ApiKeyCard({
  apiKey,
  onDelete,
  formatDate,
}: {
  apiKey: ApiKey
  onDelete: () => void
  formatDate: (date?: string) => string
}) {
  const provider = PROVIDERS[apiKey.provider] || PROVIDERS.custom

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-4 p-4 rounded-xl"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--fl-color-border)',
      }}
    >
      {/* Provider Icon */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
        style={{
          background: 'rgba(14, 165, 233, 0.15)',
          border: '1px solid rgba(14, 165, 233, 0.3)',
        }}
      >
        {provider.icon}
      </div>

      {/* Key Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-medium text-sm"
            style={{ color: 'var(--fl-color-text-primary)' }}
          >
            {apiKey.providerName || provider.name}
          </span>
          {apiKey.isValid ? (
            <span
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                background: 'rgba(34, 197, 94, 0.2)',
                color: '#22c55e',
              }}
            >
              Valid
            </span>
          ) : (
            <span
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
              }}
            >
              Invalid
            </span>
          )}
        </div>
        <div
          className="text-xs mt-1 font-mono"
          style={{ color: 'var(--fl-color-text-muted)' }}
        >
          {apiKey.keyHint}
        </div>
      </div>

      {/* Stats */}
      <div className="text-right hidden sm:block">
        <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
          Used {apiKey.usageCount} times
        </div>
        <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
          Last used: {formatDate(apiKey.lastUsedAt)}
        </div>
      </div>

      {/* Delete Button */}
      <button
        onClick={onDelete}
        className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
        style={{ color: 'var(--fl-color-text-muted)' }}
        title="Delete key"
      >
        <Trash2 size={16} />
      </button>
    </motion.div>
  )
}

export default ApiKeysManager
