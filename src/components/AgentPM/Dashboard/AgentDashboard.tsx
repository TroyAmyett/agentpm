// Agent Dashboard - Main dashboard with agent grid and task overview

import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  Grid,
  List,
  Plus,
  RefreshCw,
  Search,
  Bot,
  ListTodo,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { useAgentStore } from '@/stores/agentStore'
import { useTaskStore, selectTaskCounts } from '@/stores/taskStore'
import { AgentCard, AgentCardCompact } from '../Agents'

type ViewMode = 'grid' | 'list'

interface AgentDashboardProps {
  accountId: string
  userId: string
  onCreateTask?: () => void
}

export function AgentDashboard({ accountId, userId, onCreateTask }: AgentDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  const {
    agents,
    isLoading: agentsLoading,
    fetchAgents,
    pauseAgent,
    resumeAgent,
    subscribeToAgents,
  } = useAgentStore()

  const { isLoading: tasksLoading, fetchTasks, subscribeToTasks } = useTaskStore()
  const taskCounts = selectTaskCounts(useTaskStore.getState())

  // Fetch data on mount
  useEffect(() => {
    fetchAgents(accountId)
    fetchTasks(accountId)
  }, [accountId, fetchAgents, fetchTasks])

  // Subscribe to realtime updates
  useEffect(() => {
    const unsubAgents = subscribeToAgents(accountId)
    const unsubTasks = subscribeToTasks(accountId)

    return () => {
      unsubAgents()
      unsubTasks()
    }
  }, [accountId, subscribeToAgents, subscribeToTasks])

  // Filter agents by search
  const filteredAgents = agents.filter(
    (agent) =>
      agent.showOnDashboard &&
      (agent.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.agentType.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const handlePauseAgent = async (agentId: string) => {
    try {
      await pauseAgent(agentId, userId, 'Manually paused by user')
    } catch (err) {
      console.error('Failed to pause agent:', err)
    }
  }

  const handleResumeAgent = async (agentId: string) => {
    try {
      await resumeAgent(agentId, userId)
    } catch (err) {
      console.error('Failed to resume agent:', err)
    }
  }

  const handleRefresh = () => {
    fetchAgents(accountId)
    fetchTasks(accountId)
  }

  const isLoading = agentsLoading || tasksLoading

  return (
    <div className="flex flex-col h-full bg-surface-50 dark:bg-surface-900">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
              Agent Dashboard
            </h1>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              Manage your AI agents and tasks
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={onCreateTask}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors"
            >
              <Plus size={20} />
              New Task
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-5 gap-4">
          <StatCard
            icon={<Bot size={20} />}
            label="Active Agents"
            value={agents.filter((a) => a.isActive && !a.pausedAt).length}
            color="primary"
          />
          <StatCard
            icon={<ListTodo size={20} />}
            label="Queued Tasks"
            value={taskCounts.queued}
            color="blue"
          />
          <StatCard
            icon={<Clock size={20} />}
            label="In Progress"
            value={taskCounts.inProgress}
            color="yellow"
          />
          <StatCard
            icon={<CheckCircle2 size={20} />}
            label="Completed"
            value={taskCounts.completed}
            color="green"
          />
          <StatCard
            icon={<AlertCircle size={20} />}
            label="Pending Review"
            value={taskCounts.review}
            color="orange"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 py-3 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
            />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-100 dark:bg-surface-700">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-surface-600 shadow-sm'
                  : 'hover:bg-surface-200 dark:hover:bg-surface-600'
              }`}
              title="Grid View"
            >
              <Grid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-surface-600 shadow-sm'
                  : 'hover:bg-surface-200 dark:hover:bg-surface-600'
              }`}
              title="List View"
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading && filteredAgents.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={32} className="animate-spin text-surface-400" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-surface-500">
            <Bot size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">No agents found</p>
            <p className="text-sm">
              {searchQuery ? 'Try a different search term' : 'Create your first agent to get started'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredAgents.map((agent) => (
                <AgentCardCompact
                  key={agent.id}
                  agent={agent}
                  selected={selectedAgentId === agent.id}
                  onSelect={setSelectedAgentId}
                  onAssignTask={(id) => console.log('Assign task to:', id)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl">
            <AnimatePresence mode="popLayout">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onAssignTask={(id) => console.log('Assign task to:', id)}
                  onViewHistory={(id) => console.log('View history:', id)}
                  onConfigure={(id) => console.log('Configure:', id)}
                  onPause={handlePauseAgent}
                  onResume={handleResumeAgent}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

// Stat Card Component
interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
  color: 'primary' | 'blue' | 'yellow' | 'green' | 'orange'
}

const colorClasses = {
  primary: 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400',
  blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
  green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50">
      <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">{value}</p>
        <p className="text-xs text-surface-500 dark:text-surface-400">{label}</p>
      </div>
    </div>
  )
}
