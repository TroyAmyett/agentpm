// Agents Page - Agent management dashboard

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Bot, Grid3X3, List } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useAccountStore } from '@/stores/accountStore'
import { useAgentStore } from '@/stores/agentStore'
import { AgentCard } from './AgentCard'
import { AgentCardCompact } from './AgentCardCompact'
import { CreateAgentModal } from './CreateAgentModal'
import { EditAgentModal } from './EditAgentModal'
import type { AgentPersona } from '@/types/agentpm'

type ViewMode = 'grid' | 'list'

export function AgentsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentPersona | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const { user } = useAuthStore()
  const { currentAccountId } = useAccountStore()
  const { agents, isLoading, pauseAgent, resumeAgent } = useAgentStore()

  const userId = user?.id || 'demo-user'
  const accountId = currentAccountId || 'demo-account-id'

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      agent.alias.toLowerCase().includes(query) ||
      agent.agentType.toLowerCase().includes(query) ||
      agent.tagline?.toLowerCase().includes(query) ||
      agent.capabilities.some((c) => c.toLowerCase().includes(query))
    )
  })

  // Sort agents by sortOrder
  const sortedAgents = [...filteredAgents].sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
  )

  // Handlers
  const handlePause = useCallback(
    async (agentId: string) => {
      await pauseAgent(agentId, userId, 'Manually paused by user')
    },
    [pauseAgent, userId]
  )

  const handleResume = useCallback(
    async (agentId: string) => {
      await resumeAgent(agentId, userId)
    },
    [resumeAgent, userId]
  )

  const handleConfigure = useCallback((agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (agent) {
      setEditingAgent(agent)
    }
  }, [agents])

  const handleAssignTask = useCallback((agentId: string) => {
    // TODO: Open create task modal with agent pre-selected
    console.log('Assign task to agent:', agentId)
  }, [])

  const handleViewHistory = useCallback((agentId: string) => {
    // TODO: Navigate to agent history view
    console.log('View history for agent:', agentId)
  }, [])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              Agents
            </h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
              Manage your AI agent personas and their capabilities
            </p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus size={20} />
            New Agent
          </button>
        </div>

        {/* Search & View Toggle */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
            />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              }`}
              title="Grid view"
            >
              <Grid3X3 size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              }`}
              title="List view"
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : sortedAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
              <Bot size={32} className="text-surface-400" />
            </div>
            <h3 className="text-lg font-medium text-surface-900 dark:text-surface-100 mb-2">
              {searchQuery ? 'No agents found' : 'No agents yet'}
            </h3>
            <p className="text-surface-500 dark:text-surface-400 mb-4 max-w-sm">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Create your first AI agent to start automating tasks'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
              >
                <Plus size={20} />
                Create Agent
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {sortedAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onAssignTask={handleAssignTask}
                  onViewHistory={handleViewHistory}
                  onConfigure={handleConfigure}
                  onPause={handlePause}
                  onResume={handleResume}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {sortedAgents.map((agent) => (
                <motion.div
                  key={agent.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <AgentCardCompact
                    agent={agent}
                    onSelect={() => handleConfigure(agent.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateAgentModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        accountId={accountId}
        userId={userId}
      />

      {editingAgent && (
        <EditAgentModal
          isOpen={!!editingAgent}
          onClose={() => setEditingAgent(null)}
          agent={editingAgent}
          userId={userId}
        />
      )}
    </div>
  )
}
