// Tools Manager Component (Admin)
// Allows platform admins to register and manage OAuth tools

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wrench,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  RefreshCw,
  Copy,
  ExternalLink,
  Shield,
  Power,
  PowerOff,
} from 'lucide-react'
import {
  fetchTools,
  createTool,
  updateTool,
  deactivateTool,
  deleteTool,
  regenerateClientSecret,
  type ToolRegistration,
  type CreateToolInput,
} from '@/services/identity/tools'

export function ToolsManager() {
  const [tools, setTools] = useState<ToolRegistration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [newClientSecret, setNewClientSecret] = useState<{ toolId: string; secret: string } | null>(null)

  useEffect(() => {
    loadTools()
  }, [])

  const loadTools = async () => {
    try {
      setIsLoading(true)
      const data = await fetchTools()
      setTools(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteTool = async (toolId: string) => {
    try {
      await deleteTool(toolId)
      setTools(tools.filter((t) => t.id !== toolId))
      setDeleteConfirm(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tool')
    }
  }

  const handleToggleActive = async (tool: ToolRegistration) => {
    try {
      if (tool.isActive) {
        await deactivateTool(tool.id)
      } else {
        await updateTool(tool.id, { isActive: true })
      }
      loadTools()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tool')
    }
  }

  const handleRegenerateSecret = async (toolId: string) => {
    try {
      const secret = await regenerateClientSecret(toolId)
      setNewClientSecret({ toolId, secret })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate secret')
    }
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
            <Wrench size={20} />
            Registered Tools
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Manage OAuth2 tool integrations for SSO.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: 'var(--fl-color-primary)' }}
        >
          <Plus size={16} />
          Register Tool
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
              onClick={() => setError(null)}
              className="ml-auto text-xs underline hover:no-underline"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Client Secret Display */}
      <AnimatePresence>
        {newClientSecret && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-lg"
            style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
          >
            <div className="flex items-start gap-3">
              <Shield size={20} className="mt-0.5 text-green-500" />
              <div className="flex-1">
                <h4 className="font-medium text-green-500 mb-1">New Client Secret Generated</h4>
                <p className="text-sm text-green-400/80 mb-2">
                  Copy this secret now. It will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-black/20 rounded font-mono text-sm text-green-400">
                    {newClientSecret.secret}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newClientSecret.secret)
                    }}
                    className="p-2 rounded hover:bg-green-500/10"
                    title="Copy to clipboard"
                  >
                    <Copy size={16} className="text-green-500" />
                  </button>
                </div>
              </div>
              <button
                onClick={() => setNewClientSecret(null)}
                className="text-green-500 hover:text-green-400"
              >
                &times;
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Tool Form */}
      <AnimatePresence>
        {showAddForm && (
          <AddToolForm
            onSuccess={(tool) => {
              setTools([...tools, tool])
              setShowAddForm(false)
              setNewClientSecret({ toolId: tool.id, secret: (tool as { clientSecret: string }).clientSecret })
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </AnimatePresence>

      {/* Tools List */}
      <div className="space-y-3">
        {isLoading ? (
          <div
            className="flex items-center justify-center py-8"
            style={{ color: 'var(--fl-color-text-muted)' }}
          >
            <RefreshCw size={20} className="animate-spin mr-2" />
            Loading tools...
          </div>
        ) : tools.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-8"
            style={{ color: 'var(--fl-color-text-muted)' }}
          >
            <Wrench size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No tools registered</p>
            <p className="text-xs mt-1">Register your first tool to enable SSO</p>
          </div>
        ) : (
          <AnimatePresence>
            {tools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onDelete={() => setDeleteConfirm(tool.id)}
                onToggleActive={() => handleToggleActive(tool)}
                onRegenerateSecret={() => handleRegenerateSecret(tool.id)}
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
                Delete Tool?
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--fl-color-text-muted)' }}>
                This will revoke all active tokens and permanently delete this tool registration.
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
                  onClick={() => handleDeleteTool(deleteConfirm)}
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

// Add Tool Form
function AddToolForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: (tool: ToolRegistration & { clientSecret: string }) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<CreateToolInput>({
    name: '',
    description: '',
    baseUrl: '',
    callbackUrl: '',
    iconUrl: '',
    requiredProviders: [],
    scopes: [],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scopeInput, setScopeInput] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.baseUrl || !formData.callbackUrl) {
      setError('Name, Base URL, and Callback URL are required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const tool = await createTool(formData)
      onSuccess(tool)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register tool')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addScope = () => {
    if (scopeInput.trim() && !formData.scopes?.includes(scopeInput.trim())) {
      setFormData({
        ...formData,
        scopes: [...(formData.scopes || []), scopeInput.trim()],
      })
      setScopeInput('')
    }
  }

  const removeScope = (scope: string) => {
    setFormData({
      ...formData,
      scopes: formData.scopes?.filter((s) => s !== scope),
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <form
        onSubmit={handleSubmit}
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
          Register New Tool
        </h3>

        {error && (
          <div className="mb-4 p-2 rounded text-sm bg-red-500/10 text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
              Tool Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., LeadGen"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--fl-color-border)',
                color: 'var(--fl-color-text-primary)',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the tool"
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--fl-color-border)',
                color: 'var(--fl-color-text-primary)',
              }}
            />
          </div>

          {/* URLs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
                Base URL *
              </label>
              <input
                type="url"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="https://app.example.com"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--fl-color-border)',
                  color: 'var(--fl-color-text-primary)',
                }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
                Callback URL *
              </label>
              <input
                type="url"
                value={formData.callbackUrl}
                onChange={(e) => setFormData({ ...formData, callbackUrl: e.target.value })}
                placeholder="https://app.example.com/auth/callback"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--fl-color-border)',
                  color: 'var(--fl-color-text-primary)',
                }}
              />
            </div>
          </div>

          {/* Icon URL */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
              Icon URL
            </label>
            <input
              type="url"
              value={formData.iconUrl}
              onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value })}
              placeholder="https://example.com/icon.png"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--fl-color-border)',
                color: 'var(--fl-color-text-primary)',
              }}
            />
          </div>

          {/* Scopes */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
              Scopes
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={scopeInput}
                onChange={(e) => setScopeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addScope()
                  }
                }}
                placeholder="e.g., read:leads"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--fl-color-border)',
                  color: 'var(--fl-color-text-primary)',
                }}
              />
              <button
                type="button"
                onClick={addScope}
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'rgba(14, 165, 233, 0.2)',
                  color: '#0ea5e9',
                }}
              >
                Add
              </button>
            </div>
            {formData.scopes && formData.scopes.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="px-2 py-1 rounded text-xs flex items-center gap-1"
                    style={{
                      background: 'rgba(14, 165, 233, 0.15)',
                      color: '#0ea5e9',
                    }}
                  >
                    {scope}
                    <button
                      type="button"
                      onClick={() => removeScope(scope)}
                      className="hover:text-red-400"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--fl-color-text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--fl-color-primary)' }}
            >
              {isSubmitting ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Register Tool
            </button>
          </div>
        </div>
      </form>
    </motion.div>
  )
}

// Tool Card
function ToolCard({
  tool,
  onDelete,
  onToggleActive,
  onRegenerateSecret,
}: {
  tool: ToolRegistration
  onDelete: () => void
  onToggleActive: () => void
  onRegenerateSecret: () => void
}) {
  const [showClientId, setShowClientId] = useState(false)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-4 rounded-xl"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--fl-color-border)',
        opacity: tool.isActive ? 1 : 0.6,
      }}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{
            background: tool.iconUrl ? 'transparent' : 'rgba(14, 165, 233, 0.15)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
          }}
        >
          {tool.iconUrl ? (
            <img src={tool.iconUrl} alt={tool.name} className="w-8 h-8 rounded" />
          ) : (
            <Wrench size={24} className="text-cyan-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="font-medium"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              {tool.name}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-xs ${
                tool.isActive
                  ? 'bg-green-500/20 text-green-500'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {tool.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          {tool.description && (
            <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
              {tool.description}
            </p>
          )}

          <div className="flex items-center gap-4 mt-2">
            <a
              href={tool.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs flex items-center gap-1 hover:underline"
              style={{ color: 'var(--fl-color-text-muted)' }}
            >
              <ExternalLink size={12} />
              {tool.baseUrl}
            </a>
          </div>

          {/* Client ID */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
              Client ID:
            </span>
            <code className="text-xs font-mono px-2 py-0.5 rounded bg-black/20" style={{ color: 'var(--fl-color-text-secondary)' }}>
              {showClientId ? tool.clientId : '••••••••-••••-••••-••••-••••••••'}
            </code>
            <button
              onClick={() => setShowClientId(!showClientId)}
              className="p-1 rounded hover:bg-white/10"
              style={{ color: 'var(--fl-color-text-muted)' }}
            >
              {showClientId ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(tool.clientId)}
              className="p-1 rounded hover:bg-white/10"
              style={{ color: 'var(--fl-color-text-muted)' }}
              title="Copy"
            >
              <Copy size={14} />
            </button>
          </div>

          {/* Scopes */}
          {tool.scopes && tool.scopes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tool.scopes.map((scope) => (
                <span
                  key={scope}
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{
                    background: 'rgba(14, 165, 233, 0.1)',
                    color: '#0ea5e9',
                  }}
                >
                  {scope}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRegenerateSecret}
            className="p-2 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: 'var(--fl-color-text-muted)' }}
            title="Regenerate Secret"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={onToggleActive}
            className="p-2 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: tool.isActive ? '#22c55e' : 'var(--fl-color-text-muted)' }}
            title={tool.isActive ? 'Deactivate' : 'Activate'}
          >
            {tool.isActive ? <Power size={16} /> : <PowerOff size={16} />}
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
            style={{ color: 'var(--fl-color-text-muted)' }}
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default ToolsManager
