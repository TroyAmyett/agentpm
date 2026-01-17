// Agent Dashboard - Enhanced dashboard with charts and metrics
// Design reference: packages/ui/references/dashboard-reference.jsx

import { useState, useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Grid,
  List,
  Plus,
  RefreshCw,
  Search,
  Bot,
  TrendingUp,
  TrendingDown,
  Play,
  BarChart3,
  Settings,
  Palette,
  Database,
  FileText,
  Code,
} from 'lucide-react'
import { useAgentStore } from '@/stores/agentStore'
import { useTaskStore, selectTaskCounts } from '@/stores/taskStore'
import { AgentCard } from '../Agents'

type ViewMode = 'grid' | 'list'

interface AgentDashboardProps {
  accountId: string
  userId: string
  onCreateTask?: () => void
}

// Color mapping for KPI states
type KpiStatus = 'good' | 'warning' | 'critical' | 'neutral'

const kpiColors: Record<KpiStatus, { bg: string; border: string; text: string }> = {
  good: { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
  warning: { bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.3)', text: '#facc15' },
  critical: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  neutral: { bg: 'rgba(14, 165, 233, 0.15)', border: 'rgba(14, 165, 233, 0.3)', text: '#0ea5e9' },
}

// Agent type icons
const agentIcons: Record<string, React.ElementType> = {
  canvas: Palette,
  data: Database,
  content: FileText,
  dev: Code,
  default: Bot,
}

// Agent type colors
const agentColors: Record<string, string> = {
  canvas: '#0ea5e9',
  data: '#22c55e',
  content: '#8b5cf6',
  dev: '#14b8a6',
  default: '#0ea5e9',
}

export function AgentDashboard({ accountId, userId, onCreateTask }: AgentDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [chartPeriod, setChartPeriod] = useState<'day' | 'week' | 'month'>('day')

  const {
    agents,
    isLoading: agentsLoading,
    fetchAgents,
    pauseAgent,
    resumeAgent,
    subscribeToAgents,
  } = useAgentStore()

  const { tasks, isLoading: tasksLoading, fetchTasks, subscribeToTasks } = useTaskStore()
  const taskCounts = selectTaskCounts(useTaskStore.getState())

  // Calculate stats with trends
  const stats = useMemo(() => {
    const activeAgents = agents.filter((a) => a.isActive && !a.pausedAt).length
    const totalAgents = agents.length
    const completedToday = tasks.filter(t => {
      const today = new Date()
      const taskDate = new Date(t.updatedAt)
      return t.status === 'completed' &&
        taskDate.toDateString() === today.toDateString()
    }).length

    return [
      {
        label: 'Active Agents',
        value: activeAgents.toString(),
        change: `/${totalAgents}`,
        trend: 'up' as const,
        color: 'cyan',
        kpiStatus: (activeAgents > 0 ? 'good' : 'warning') as KpiStatus
      },
      {
        label: 'Tasks Completed',
        value: taskCounts.completed.toString(),
        change: `+${completedToday} today`,
        trend: 'up' as const,
        color: 'green',
        kpiStatus: 'good' as KpiStatus
      },
      {
        label: 'In Progress',
        value: taskCounts.inProgress.toString(),
        change: `${taskCounts.queued} queued`,
        trend: 'up' as const,
        color: 'yellow',
        kpiStatus: (taskCounts.inProgress > 5 ? 'warning' : 'good') as KpiStatus
      },
      {
        label: 'Pending Review',
        value: taskCounts.review.toString(),
        change: 'needs attention',
        trend: taskCounts.review > 0 ? 'down' : 'up' as const,
        color: 'orange',
        kpiStatus: (taskCounts.review > 3 ? 'critical' : taskCounts.review > 0 ? 'warning' : 'good') as KpiStatus
      },
    ]
  }, [agents, tasks, taskCounts])

  // Generate sparkline data (simulated for now)
  const sparklineData = useMemo(() => [30, 45, 35, 50, 65, 55, 70, 60, 75, 85, 70, 90], [])

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

  // Calculate task distribution for donut chart
  const taskDistribution = useMemo(() => {
    const total = taskCounts.completed + taskCounts.inProgress + taskCounts.queued + taskCounts.review
    if (total === 0) return []
    return [
      { label: 'Completed', value: taskCounts.completed, color: '#22c55e', percent: Math.round((taskCounts.completed / total) * 100) },
      { label: 'In Progress', value: taskCounts.inProgress, color: '#0ea5e9', percent: Math.round((taskCounts.inProgress / total) * 100) },
      { label: 'Queued', value: taskCounts.queued, color: '#8b5cf6', percent: Math.round((taskCounts.queued / total) * 100) },
      { label: 'Review', value: taskCounts.review, color: '#f59e0b', percent: Math.round((taskCounts.review / total) * 100) },
    ]
  }, [taskCounts])

  return (
    <div
      className="flex flex-col h-full overflow-auto"
      style={{
        background: 'var(--fl-color-bg-base)',
      }}
    >
      {/* Background gradient */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 20% 30%, rgba(14, 165, 233, 0.05) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 70%, rgba(20, 184, 166, 0.03) 0%, transparent 50%)
          `,
          zIndex: 0,
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto w-full p-6">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
              AgentPM Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
              Manage your AI agents and tasks
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-sm font-normal transition-colors"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--fl-color-text-primary)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <RefreshCw size={16} className={`inline mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onCreateTask}
              className="px-5 py-2 rounded-lg text-sm font-normal text-white transition-colors"
              style={{ background: '#0ea5e9' }}
            >
              <Plus size={16} className="inline mr-2" />
              New Task
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {stats.map((stat, i) => {
            const kpi = stat.kpiStatus ? kpiColors[stat.kpiStatus] : kpiColors.neutral
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl p-5"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
                    {stat.label}
                  </span>
                  {stat.kpiStatus && (
                    <span style={{ color: kpi.text, fontSize: '10px' }}>●</span>
                  )}
                </div>
                <div
                  className="text-3xl font-medium mb-3"
                  style={{ color: kpi.text }}
                >
                  {stat.value}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs font-medium"
                    style={{ color: stat.trend === 'up' ? '#22c55e' : '#ef4444' }}
                  >
                    {stat.trend === 'up' ? <TrendingUp size={12} className="inline" /> : <TrendingDown size={12} className="inline" />}
                    {' '}{stat.change}
                  </span>
                </div>
                {/* Sparkline */}
                <div className="flex items-end gap-[3px] h-[30px]">
                  {sparklineData.map((val, j) => (
                    <div
                      key={j}
                      className="flex-1 rounded-sm min-w-[4px]"
                      style={{
                        height: `${val}%`,
                        backgroundColor: `${kpi.text}99`,
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Activity Chart */}
          <div
            className="col-span-2 rounded-xl p-5"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                Agent Activity
              </h3>
              <div className="flex gap-1">
                {(['day', 'week', 'month'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setChartPeriod(period)}
                    className="px-3 py-1.5 rounded-md text-xs transition-colors"
                    style={{
                      background: chartPeriod === period ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
                      color: chartPeriod === period ? '#0ea5e9' : 'var(--fl-color-text-muted)',
                    }}
                  >
                    {period.charAt(0).toUpperCase() + period.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <svg viewBox="0 0 400 150" className="w-full h-[150px]">
                <defs>
                  <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(14, 165, 233, 0.4)" />
                    <stop offset="100%" stopColor="rgba(14, 165, 233, 0)" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                {[0, 1, 2, 3].map((i) => (
                  <line
                    key={i}
                    x1="0" y1={i * 50} x2="400" y2={i * 50}
                    stroke="rgba(255,255,255,0.05)"
                  />
                ))}
                {/* Area */}
                <path
                  d="M 0 120 L 40 100 L 80 110 L 120 80 L 160 90 L 200 60 L 240 70 L 280 40 L 320 50 L 360 30 L 400 45 L 400 150 L 0 150 Z"
                  fill="url(#chartGradient)"
                />
                {/* Line */}
                <path
                  d="M 0 120 L 40 100 L 80 110 L 120 80 L 160 90 L 200 60 L 240 70 L 280 40 L 320 50 L 360 30 L 400 45"
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="2"
                />
                {/* Dots */}
                {[[0,120], [40,100], [80,110], [120,80], [160,90], [200,60], [240,70], [280,40], [320,50], [360,30], [400,45]].map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="4" fill="#0ea5e9" />
                ))}
              </svg>
              <div className="flex justify-between mt-2">
                {['6am', '9am', '12pm', '3pm', '6pm', '9pm'].map((t, i) => (
                  <span key={i} className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>{t}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Task Distribution */}
          <div
            className="rounded-xl p-5"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--fl-color-text-primary)' }}>
              Task Distribution
            </h3>
            <div className="flex items-center gap-5">
              <svg viewBox="0 0 120 120" className="w-[120px] h-[120px]">
                {/* Background circle */}
                <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" />
                {/* Segments */}
                {taskDistribution.length > 0 && (
                  <>
                    <circle cx="60" cy="60" r="45" fill="none" stroke="#22c55e" strokeWidth="12"
                      strokeDasharray={`${taskDistribution[0]?.percent * 2.83 || 0} 283`} strokeDashoffset="0"
                      transform="rotate(-90 60 60)" />
                    <circle cx="60" cy="60" r="45" fill="none" stroke="#0ea5e9" strokeWidth="12"
                      strokeDasharray={`${taskDistribution[1]?.percent * 2.83 || 0} 283`}
                      strokeDashoffset={`-${taskDistribution[0]?.percent * 2.83 || 0}`}
                      transform="rotate(-90 60 60)" />
                    <circle cx="60" cy="60" r="45" fill="none" stroke="#8b5cf6" strokeWidth="12"
                      strokeDasharray={`${taskDistribution[2]?.percent * 2.83 || 0} 283`}
                      strokeDashoffset={`-${(taskDistribution[0]?.percent || 0 + taskDistribution[1]?.percent || 0) * 2.83}`}
                      transform="rotate(-90 60 60)" />
                    <circle cx="60" cy="60" r="45" fill="none" stroke="#f59e0b" strokeWidth="12"
                      strokeDasharray={`${taskDistribution[3]?.percent * 2.83 || 0} 283`}
                      strokeDashoffset={`-${((taskDistribution[0]?.percent || 0) + (taskDistribution[1]?.percent || 0) + (taskDistribution[2]?.percent || 0)) * 2.83}`}
                      transform="rotate(-90 60 60)" />
                  </>
                )}
                {/* Center text */}
                <text x="60" y="55" textAnchor="middle" fill="var(--fl-color-text-primary)" fontSize="18" fontWeight="600">
                  {taskCounts.completed + taskCounts.inProgress + taskCounts.queued + taskCounts.review}
                </text>
                <text x="60" y="72" textAnchor="middle" fill="var(--fl-color-text-muted)" fontSize="10">
                  Total Tasks
                </text>
              </svg>
              <div className="flex flex-col gap-2">
                {taskDistribution.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label} ({item.percent}%)
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Agents Section */}
        <div
          className="rounded-xl p-5 mb-6"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
              Active Agents
            </h3>
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--fl-color-text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-1.5 rounded-lg text-sm w-48"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--fl-color-text-primary)',
                  }}
                />
              </div>
              {/* View Toggle */}
              <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                <button
                  onClick={() => setViewMode('grid')}
                  className="p-1.5 rounded-md transition-colors"
                  style={{
                    background: viewMode === 'grid' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    color: 'var(--fl-color-text-secondary)',
                  }}
                >
                  <Grid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className="p-1.5 rounded-md transition-colors"
                  style={{
                    background: viewMode === 'list' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    color: 'var(--fl-color-text-secondary)',
                  }}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Agent Grid/List */}
          {isLoading && filteredAgents.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--fl-color-text-muted)' }} />
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32" style={{ color: 'var(--fl-color-text-muted)' }}>
              <Bot size={32} className="mb-2 opacity-50" />
              <p className="text-sm">No agents found</p>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-4 gap-3' : 'space-y-3'}>
              <AnimatePresence mode="popLayout">
                {filteredAgents.map((agent) => {
                  const IconComponent = agentIcons[agent.agentType.toLowerCase()] || agentIcons.default
                  const color = agentColors[agent.agentType.toLowerCase()] || agentColors.default
                  const isRunning = agent.isActive && !agent.pausedAt

                  return viewMode === 'grid' ? (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                      style={{
                        background: selectedAgentId === agent.id ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      }}
                      onClick={() => setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id)}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{
                          background: `${color}15`,
                          border: `1px solid ${color}30`
                        }}
                      >
                        <IconComponent size={20} color={color} strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-normal truncate" style={{ color: 'var(--fl-color-text-primary)' }}>
                          {agent.alias}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                          {agent.stats?.tasksCompleted || 0} tasks
                        </p>
                      </div>
                      <div
                        className="px-2 py-1 rounded-full text-xs flex items-center gap-1.5"
                        style={{
                          background: isRunning ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                          color: isRunning ? '#22c55e' : 'var(--fl-color-text-muted)',
                        }}
                      >
                        {isRunning && (
                          <span
                            className="w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ background: '#22c55e' }}
                          />
                        )}
                        {isRunning ? 'active' : 'idle'}
                      </div>
                    </motion.div>
                  ) : (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onAssignTask={(id) => console.log('Assign task to:', id)}
                      onViewHistory={(id) => console.log('View history:', id)}
                      onConfigure={(id) => console.log('Configure:', id)}
                      onPause={handlePauseAgent}
                      onResume={handleResumeAgent}
                    />
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={onCreateTask}
            className="flex items-center gap-4 p-5 rounded-xl text-left transition-all hover:scale-[1.02]"
            style={{
              background: 'rgba(14, 165, 233, 0.1)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(14, 165, 233, 0.2)',
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: 'rgba(14, 165, 233, 0.15)',
                border: '1px solid rgba(14, 165, 233, 0.25)'
              }}
            >
              <Play size={24} color="#0ea5e9" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                Launch Task
              </p>
              <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                Start a new AI agent task
              </p>
            </div>
          </button>

          <button
            className="flex items-center gap-4 p-5 rounded-xl text-left transition-all hover:scale-[1.02]"
            style={{
              background: 'rgba(14, 165, 233, 0.1)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(14, 165, 233, 0.2)',
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: 'rgba(14, 165, 233, 0.15)',
                border: '1px solid rgba(14, 165, 233, 0.25)'
              }}
            >
              <BarChart3 size={24} color="#0ea5e9" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                View Analytics
              </p>
              <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                Performance metrics
              </p>
            </div>
          </button>

          <button
            className="flex items-center gap-4 p-5 rounded-xl text-left transition-all hover:scale-[1.02]"
            style={{
              background: 'rgba(14, 165, 233, 0.1)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(14, 165, 233, 0.2)',
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: 'rgba(14, 165, 233, 0.15)',
                border: '1px solid rgba(14, 165, 233, 0.25)'
              }}
            >
              <Settings size={24} color="#0ea5e9" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                Settings
              </p>
              <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                Configure your agents
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
