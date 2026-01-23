// Edit Agent Modal - Form for editing existing agent personas

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bot, AlertTriangle, Plus, RefreshCw } from 'lucide-react'
import { useAgentStore } from '@/stores/agentStore'
import { useAuthStore } from '@/stores/authStore'
import type { AgentPersona, AgentType, AutonomyLevel } from '@/types/agentpm'

const AGENT_TYPES: { value: AgentType | string; label: string }[] = [
  { value: 'content-writer', label: 'Content Writer' },
  { value: 'image-generator', label: 'Image Generator' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'qa-tester', label: 'QA Tester' },
  { value: 'orchestrator', label: 'Orchestrator' },
  { value: 'custom', label: 'Custom' },
]

const AUTONOMY_LEVELS: { value: AutonomyLevel; label: string; description: string }[] = [
  { value: 'supervised', label: 'Supervised', description: 'Requires approval for all actions' },
  { value: 'semi-autonomous', label: 'Semi-Autonomous', description: 'Can act independently within limits' },
  { value: 'autonomous', label: 'Autonomous', description: 'Full autonomy within defined scope' },
]

const COMMON_CAPABILITIES = [
  'web-research',
  'write-content',
  'generate-images',
  'edit-images',
  'summarize',
  'report',
  'test',
  'validate',
  'post-to-cms',
  'send-email',
  'route-tasks',
  'coordinate-agents',
  'monitor',
]

const COMMON_RESTRICTIONS = [
  'edit-production',
  'delete-records',
  'write-content',
  'publish',
  'send-email',
  'access-billing',
  'modify-users',
]

interface EditAgentModalProps {
  isOpen: boolean
  onClose: () => void
  agent: AgentPersona
  userId: string
}

export function EditAgentModal({
  isOpen,
  onClose,
  agent,
  userId,
}: EditAgentModalProps) {
  const [alias, setAlias] = useState(agent.alias)
  const [agentType, setAgentType] = useState<AgentType | string>(
    AGENT_TYPES.some((t) => t.value === agent.agentType) ? agent.agentType : 'custom'
  )
  const [customType, setCustomType] = useState(
    AGENT_TYPES.some((t) => t.value === agent.agentType) ? '' : agent.agentType
  )
  const [tagline, setTagline] = useState(agent.tagline || '')
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(agent.autonomyLevel)
  const [capabilities, setCapabilities] = useState<string[]>(agent.capabilities)
  const [restrictions, setRestrictions] = useState<string[]>(agent.restrictions)
  const [isActive, setIsActive] = useState(agent.isActive)
  const [showOnDashboard, setShowOnDashboard] = useState(agent.showOnDashboard)
  const [newCapability, setNewCapability] = useState('')
  const [newRestriction, setNewRestriction] = useState('')
  const [reportsToId, setReportsToId] = useState<string>(
    agent.reportsTo?.type === 'agent' ? agent.reportsTo.id : 'user'
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { user } = useAuthStore()
  const { agents, updateAgent, resetAgentHealth } = useAgentStore()

  // Get other agents that this agent could report to (excluding itself)
  const availableManagers = agents.filter((a) => a.id !== agent.id)

  // Reset form when agent changes
  useEffect(() => {
    setAlias(agent.alias)
    setAgentType(AGENT_TYPES.some((t) => t.value === agent.agentType) ? agent.agentType : 'custom')
    setCustomType(AGENT_TYPES.some((t) => t.value === agent.agentType) ? '' : agent.agentType)
    setTagline(agent.tagline || '')
    setAutonomyLevel(agent.autonomyLevel)
    setCapabilities(agent.capabilities)
    setRestrictions(agent.restrictions)
    setIsActive(agent.isActive)
    setShowOnDashboard(agent.showOnDashboard)
    setReportsToId(agent.reportsTo?.type === 'agent' ? agent.reportsTo.id : 'user')
  }, [agent])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!alias.trim()) {
      setError('Agent name is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const finalAgentType = agentType === 'custom' ? customType : agentType

      // Build reportsTo object
      let reportsTo: AgentPersona['reportsTo'] = undefined
      if (reportsToId === 'user') {
        // Reports directly to human
        reportsTo = {
          id: userId,
          type: 'user',
          name: user?.email?.split('@')[0] || 'You',
        }
      } else {
        // Reports to another agent
        const managerAgent = availableManagers.find((a) => a.id === reportsToId)
        if (managerAgent) {
          reportsTo = {
            id: managerAgent.id,
            type: 'agent',
            name: managerAgent.alias,
          }
        }
      }

      const updates = {
        agentType: finalAgentType,
        alias: alias.trim(),
        tagline: tagline.trim() || undefined,
        capabilities,
        restrictions,
        autonomyLevel,
        isActive,
        showOnDashboard,
        reportsTo,
        updatedBy: userId,
        updatedByType: 'user' as const,
      }

      console.log('Updating agent:', agent.id, updates)
      await updateAgent(agent.id, updates)
      console.log('Agent updated successfully')

      onClose()
    } catch (err) {
      console.error('Failed to update agent:', err)
      setError(err instanceof Error ? err.message : 'Failed to update agent')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetHealth = async () => {
    try {
      await resetAgentHealth(agent.id, userId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset agent health')
    }
  }

  const toggleCapability = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    )
  }

  const toggleRestriction = (res: string) => {
    setRestrictions((prev) =>
      prev.includes(res) ? prev.filter((r) => r !== res) : [...prev, res]
    )
  }

  const addCustomCapability = () => {
    if (newCapability.trim() && !capabilities.includes(newCapability.trim())) {
      setCapabilities((prev) => [...prev, newCapability.trim()])
      setNewCapability('')
    }
  }

  const addCustomRestriction = () => {
    if (newRestriction.trim() && !restrictions.includes(newRestriction.trim())) {
      setRestrictions((prev) => [...prev, newRestriction.trim()])
      setNewRestriction('')
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-surface-800 rounded-xl shadow-xl flex flex-col pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  {agent.avatar ? (
                    <img
                      src={agent.avatar}
                      alt={agent.alias}
                      className="w-full h-full rounded-lg object-cover"
                    />
                  ) : (
                    <Bot className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                    Edit Agent
                  </h2>
                  <p className="text-sm text-surface-500">
                    {agent.alias} &middot; {agent.agentType}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !alias.trim()}
                  className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-auto">
              <div className="p-4 space-y-6">
                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                    <AlertTriangle size={16} />
                    {error}
                  </div>
                )}

                {/* Health Status */}
                {agent.healthStatus !== 'healthy' && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">
                        Agent Health: {agent.healthStatus}
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        Consecutive failures: {agent.consecutiveFailures} / {agent.maxConsecutiveFailures}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetHealth}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-900/60 transition-colors text-sm"
                    >
                      <RefreshCw size={14} />
                      Reset Health
                    </button>
                  </div>
                )}

                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 uppercase tracking-wider">
                    Basic Information
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={alias}
                        onChange={(e) => setAlias(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                        Type
                      </label>
                      <select
                        value={agentType}
                        onChange={(e) => setAgentType(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {AGENT_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {agentType === 'custom' && (
                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                        Custom Type Name
                      </label>
                      <input
                        type="text"
                        value={customType}
                        onChange={(e) => setCustomType(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      Tagline
                    </label>
                    <input
                      type="text"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Settings */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 uppercase tracking-wider">
                    Settings
                  </h3>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div>
                        <p className="font-medium text-surface-900 dark:text-surface-100">Active</p>
                        <p className="text-sm text-surface-500">Agent can receive and process tasks</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showOnDashboard}
                        onChange={(e) => setShowOnDashboard(e.target.checked)}
                        className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div>
                        <p className="font-medium text-surface-900 dark:text-surface-100">Show on Dashboard</p>
                        <p className="text-sm text-surface-500">Display agent on the main dashboard</p>
                      </div>
                    </label>
                  </div>

                  {/* Reports To - Compact dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      Reports To
                    </label>
                    <select
                      value={reportsToId}
                      onChange={(e) => setReportsToId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="user">
                        {user?.email?.split('@')[0] || 'You'} (Human)
                      </option>
                      {availableManagers.map((managerAgent) => (
                        <option key={managerAgent.id} value={managerAgent.id}>
                          {managerAgent.alias} ({managerAgent.agentType})
                          {managerAgent.agentType === 'orchestrator' && ' - Recommended'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Autonomy */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 uppercase tracking-wider">
                    Autonomy Level
                  </h3>

                  <div className="grid grid-cols-3 gap-3">
                    {AUTONOMY_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        type="button"
                        onClick={() => setAutonomyLevel(level.value)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          autonomyLevel === level.value
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
                        }`}
                      >
                        <p className={`font-medium text-sm ${
                          autonomyLevel === level.value
                            ? 'text-primary-700 dark:text-primary-300'
                            : 'text-surface-900 dark:text-surface-100'
                        }`}>
                          {level.label}
                        </p>
                        <p className="text-xs text-surface-500 mt-0.5">
                          {level.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Capabilities */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 uppercase tracking-wider">
                    Capabilities
                  </h3>

                  <div className="flex flex-wrap gap-2">
                    {COMMON_CAPABILITIES.map((cap) => (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => toggleCapability(cap)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                          capabilities.includes(cap)
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                            : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 border border-transparent hover:border-surface-300 dark:hover:border-surface-600'
                        }`}
                      >
                        {cap}
                      </button>
                    ))}
                    {/* Show custom capabilities that aren't in the common list */}
                    {capabilities
                      .filter((c) => !COMMON_CAPABILITIES.includes(c))
                      .map((cap) => (
                        <button
                          key={cap}
                          type="button"
                          onClick={() => toggleCapability(cap)}
                          className="px-3 py-1.5 rounded-full text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700"
                        >
                          {cap}
                        </button>
                      ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCapability}
                      onChange={(e) => setNewCapability(e.target.value)}
                      placeholder="Add custom capability..."
                      className="flex-1 px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomCapability())}
                    />
                    <button
                      type="button"
                      onClick={addCustomCapability}
                      className="px-3 py-2 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {/* Restrictions */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 uppercase tracking-wider">
                    Restrictions
                  </h3>

                  <div className="flex flex-wrap gap-2">
                    {COMMON_RESTRICTIONS.map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => toggleRestriction(res)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                          restrictions.includes(res)
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
                            : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 border border-transparent hover:border-surface-300 dark:hover:border-surface-600'
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                    {/* Show custom restrictions that aren't in the common list */}
                    {restrictions
                      .filter((r) => !COMMON_RESTRICTIONS.includes(r))
                      .map((res) => (
                        <button
                          key={res}
                          type="button"
                          onClick={() => toggleRestriction(res)}
                          className="px-3 py-1.5 rounded-full text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700"
                        >
                          {res}
                        </button>
                      ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRestriction}
                      onChange={(e) => setNewRestriction(e.target.value)}
                      placeholder="Add custom restriction..."
                      className="flex-1 px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomRestriction())}
                    />
                    <button
                      type="button"
                      onClick={addCustomRestriction}
                      className="px-3 py-2 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-surface-200 dark:border-surface-700 flex-shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !alias.trim()}
                  className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
