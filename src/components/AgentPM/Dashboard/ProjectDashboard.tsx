// Project Dashboard - Burndown charts, velocity, and cycle time metrics
// M7 requirement from PRD

import { useMemo, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  Target,
  Calendar,
  Activity,
  BarChart3,
  ArrowRight,
} from 'lucide-react'
import type { Task, AgentPersona, Milestone } from '@/types/agentpm'
import { useTimezoneFunctions } from '@/lib/timezone'

interface ProjectDashboardProps {
  projectId: string
  tasks: Task[]
  agents: AgentPersona[]
  milestones: Milestone[]
  projectName: string
  projectCreatedAt: string
  projectDueAt?: string
}

// Metric card color types
type MetricStatus = 'good' | 'warning' | 'critical' | 'neutral'

const statusColors: Record<MetricStatus, { bg: string; border: string; text: string }> = {
  good: { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
  warning: { bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.3)', text: '#facc15' },
  critical: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  neutral: { bg: 'rgba(14, 165, 233, 0.15)', border: 'rgba(14, 165, 233, 0.3)', text: '#0ea5e9' },
}

export function ProjectDashboard({
  tasks,
  agents,
  milestones,
  projectName,
  projectCreatedAt,
  projectDueAt,
}: ProjectDashboardProps) {
  const [burndownPeriod, setBurndownPeriod] = useState<'week' | 'month' | 'all'>('week')
  const { formatDate } = useTimezoneFunctions()

  // Calculate task statistics
  const taskStats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter(t => t.status === 'completed').length
    const inProgress = tasks.filter(t => t.status === 'in_progress').length
    const queued = tasks.filter(t => t.status === 'queued').length
    const pending = tasks.filter(t => t.status === 'pending').length
    const review = tasks.filter(t => t.status === 'review').length
    const blocked = tasks.filter(t => {
      // A task is blocked if it depends on incomplete tasks
      return t.status !== 'completed' && t.status !== 'cancelled'
    }).length - (inProgress + queued + pending + review)

    return { total, completed, inProgress, queued, pending, review, blocked: Math.max(0, blocked) }
  }, [tasks])

  // Calculate velocity (tasks completed per week over the last 4 weeks)
  const velocity = useMemo(() => {
    const now = new Date()
    const weeks: { week: string; completed: number }[] = []

    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      const completedInWeek = tasks.filter(t => {
        if (t.status !== 'completed' || !t.completedAt) return false
        const completedDate = new Date(t.completedAt)
        return completedDate >= weekStart && completedDate < weekEnd
      }).length

      weeks.push({
        week: `Week ${4 - i}`,
        completed: completedInWeek,
      })
    }

    const avgVelocity = weeks.reduce((sum, w) => sum + w.completed, 0) / 4
    const currentWeekVelocity = weeks[weeks.length - 1].completed
    const velocityTrend = currentWeekVelocity >= avgVelocity ? 'up' : 'down'

    return { weeks, average: Math.round(avgVelocity * 10) / 10, trend: velocityTrend, current: currentWeekVelocity }
  }, [tasks])

  // Calculate average cycle time (time from start to completion)
  const cycleTime = useMemo(() => {
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.startedAt && t.completedAt)

    if (completedTasks.length === 0) return { average: 0, min: 0, max: 0, trend: 'neutral' as const }

    const cycleTimes = completedTasks.map(t => {
      const start = new Date(t.startedAt!).getTime()
      const end = new Date(t.completedAt!).getTime()
      return (end - start) / (1000 * 60 * 60) // Hours
    })

    const avg = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
    const min = Math.min(...cycleTimes)
    const max = Math.max(...cycleTimes)

    // Trend: compare recent vs older cycle times
    const midpoint = Math.floor(completedTasks.length / 2)
    const recentAvg = cycleTimes.slice(midpoint).reduce((a, b) => a + b, 0) / (cycleTimes.length - midpoint) || 0
    const olderAvg = cycleTimes.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint || recentAvg
    const trend = recentAvg < olderAvg ? 'up' : recentAvg > olderAvg ? 'down' : 'neutral'

    return { average: Math.round(avg * 10) / 10, min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10, trend }
  }, [tasks])

  // Calculate burndown data
  const burndownData = useMemo(() => {
    const now = new Date()
    let startDate: Date
    let points: number

    switch (burndownPeriod) {
      case 'week':
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 7)
        points = 7
        break
      case 'month':
        startDate = new Date(now)
        startDate.setMonth(startDate.getMonth() - 1)
        points = 30
        break
      case 'all':
        startDate = new Date(projectCreatedAt)
        const daysDiff = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        points = Math.min(daysDiff, 60) // Cap at 60 points
        break
    }

    const data: { date: string; remaining: number; ideal: number }[] = []
    const totalTasks = tasks.length
    const idealBurnPerDay = totalTasks / points

    for (let i = 0; i <= points; i++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + i)

      // Count tasks remaining at this date (not completed by this date)
      const remaining = tasks.filter(t => {
        if (t.status !== 'completed') return true
        if (!t.completedAt) return true
        return new Date(t.completedAt) > date
      }).length

      data.push({
        date: formatDate(date.toISOString(), 'short'),
        remaining,
        ideal: Math.max(0, Math.round((totalTasks - idealBurnPerDay * i) * 10) / 10),
      })
    }

    return data
  }, [tasks, burndownPeriod, projectCreatedAt, formatDate])

  // Calculate team progress by assignee
  const teamProgress = useMemo(() => {
    const agentMap = new Map<string, { name: string; completed: number; inProgress: number; total: number }>()

    agents.forEach(agent => {
      agentMap.set(agent.id, { name: agent.alias, completed: 0, inProgress: 0, total: 0 })
    })

    // Add unassigned bucket
    agentMap.set('unassigned', { name: 'Unassigned', completed: 0, inProgress: 0, total: 0 })

    tasks.forEach(task => {
      const key = task.assignedTo && task.assignedToType === 'agent' ? task.assignedTo : 'unassigned'
      const stats = agentMap.get(key)
      if (stats) {
        stats.total++
        if (task.status === 'completed') stats.completed++
        if (task.status === 'in_progress') stats.inProgress++
      }
    })

    return Array.from(agentMap.values())
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [tasks, agents])

  // Milestone progress
  const milestoneProgress = useMemo(() => {
    return milestones.map(milestone => {
      const milestoneTasks = tasks.filter(t => t.milestoneId === milestone.id)
      const completed = milestoneTasks.filter(t => t.status === 'completed').length
      const total = milestoneTasks.length
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0
      const isOverdue = milestone.dueDate && new Date(milestone.dueDate) < new Date() && progress < 100

      return {
        id: milestone.id,
        name: milestone.name,
        completed,
        total,
        progress,
        dueAt: milestone.dueDate,
        isOverdue,
      }
    }).sort((a, b) => {
      // Sort by overdue first, then by due date
      if (a.isOverdue && !b.isOverdue) return -1
      if (!a.isOverdue && b.isOverdue) return 1
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      return 0
    })
  }, [tasks, milestones])

  // Determine completion status
  const completionRate = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0
  const completionStatus: MetricStatus = completionRate >= 80 ? 'good' : completionRate >= 50 ? 'warning' : 'critical'
  const velocityStatus: MetricStatus = velocity.trend === 'up' ? 'good' : 'warning'
  const cycleTimeStatus: MetricStatus = cycleTime.trend === 'up' ? 'good' : cycleTime.trend === 'down' ? 'warning' : 'neutral'

  // Render burndown chart
  const renderBurndownChart = () => {
    if (burndownData.length === 0) return null

    const maxValue = Math.max(...burndownData.map(d => Math.max(d.remaining, d.ideal)))
    const width = 400
    const height = 200
    const padding = 40
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2

    const xScale = (i: number) => padding + (i / (burndownData.length - 1)) * chartWidth
    const yScale = (v: number) => height - padding - (v / maxValue) * chartHeight

    const actualPath = burndownData.map((d, i) =>
      `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.remaining)}`
    ).join(' ')

    const idealPath = burndownData.map((d, i) =>
      `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.ideal)}`
    ).join(' ')

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[200px]">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <g key={i}>
            <line
              x1={padding}
              y1={height - padding - ratio * chartHeight}
              x2={width - padding}
              y2={height - padding - ratio * chartHeight}
              stroke="rgba(255,255,255,0.1)"
              strokeDasharray="4,4"
            />
            <text
              x={padding - 5}
              y={height - padding - ratio * chartHeight + 4}
              textAnchor="end"
              fill="var(--fl-color-text-muted)"
              fontSize="10"
            >
              {Math.round(maxValue * ratio)}
            </text>
          </g>
        ))}

        {/* Ideal line (dashed) */}
        <path
          d={idealPath}
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="2"
          strokeDasharray="6,4"
        />

        {/* Actual line */}
        <path
          d={actualPath}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="2"
        />

        {/* Fill area under actual */}
        <path
          d={`${actualPath} L ${xScale(burndownData.length - 1)} ${height - padding} L ${padding} ${height - padding} Z`}
          fill="url(#burndownGradient)"
        />

        {/* Gradient definition */}
        <defs>
          <linearGradient id="burndownGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(14, 165, 233, 0.3)" />
            <stop offset="100%" stopColor="rgba(14, 165, 233, 0)" />
          </linearGradient>
        </defs>

        {/* Data points */}
        {burndownData.map((d, i) => (
          <circle
            key={i}
            cx={xScale(i)}
            cy={yScale(d.remaining)}
            r="3"
            fill="#0ea5e9"
          />
        ))}

        {/* X axis labels */}
        {burndownData.filter((_, i) => i % Math.ceil(burndownData.length / 5) === 0 || i === burndownData.length - 1).map((d, mapIdx) => {
          const idx = burndownData.indexOf(d)
          return (
            <text
              key={mapIdx}
              x={xScale(idx)}
              y={height - 10}
              textAnchor="middle"
              fill="var(--fl-color-text-muted)"
              fontSize="10"
            >
              {d.date}
            </text>
          )
        })}
      </svg>
    )
  }

  // Render velocity chart
  const renderVelocityChart = () => {
    const maxVelocity = Math.max(...velocity.weeks.map(w => w.completed), velocity.average) || 1

    return (
      <div className="flex items-end gap-2 h-[100px]">
        {velocity.weeks.map((week, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-t-sm transition-all"
              style={{
                height: `${(week.completed / maxVelocity) * 80}px`,
                minHeight: '4px',
                background: i === velocity.weeks.length - 1 ? '#0ea5e9' : 'rgba(14, 165, 233, 0.4)',
              }}
            />
            <span className="text-xs text-surface-500">{week.completed}</span>
            <span className="text-xs text-surface-400">{week.week}</span>
          </div>
        ))}
        {/* Average line indicator */}
        <div className="absolute left-0 right-0" style={{ bottom: `${(velocity.average / maxVelocity) * 80 + 20}px` }}>
          <div className="border-t border-dashed border-yellow-500/50 relative">
            <span className="absolute right-0 -top-3 text-xs text-yellow-500">Avg: {velocity.average}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4 md:p-6" style={{ background: '#0a0a0f' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">{projectName} Dashboard</h2>
          <p className="text-sm text-surface-500 mt-1">
            Created {formatDate(projectCreatedAt, 'long')}
            {projectDueAt && ` • Due ${formatDate(projectDueAt, 'long')}`}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Completion Rate */}
        <div
          className="rounded-xl p-4"
          style={{
            background: statusColors[completionStatus].bg,
            border: `1px solid ${statusColors[completionStatus].border}`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-surface-400">Completion</span>
            <CheckCircle2 size={16} style={{ color: statusColors[completionStatus].text }} />
          </div>
          <div className="text-2xl font-semibold" style={{ color: statusColors[completionStatus].text }}>
            {completionRate}%
          </div>
          <div className="text-xs text-surface-500 mt-1">
            {taskStats.completed} of {taskStats.total} tasks
          </div>
        </div>

        {/* Velocity */}
        <div
          className="rounded-xl p-4"
          style={{
            background: statusColors[velocityStatus].bg,
            border: `1px solid ${statusColors[velocityStatus].border}`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-surface-400">Velocity</span>
            {velocity.trend === 'up' ? (
              <TrendingUp size={16} style={{ color: statusColors[velocityStatus].text }} />
            ) : (
              <TrendingDown size={16} style={{ color: statusColors[velocityStatus].text }} />
            )}
          </div>
          <div className="text-2xl font-semibold" style={{ color: statusColors[velocityStatus].text }}>
            {velocity.current}
          </div>
          <div className="text-xs text-surface-500 mt-1">
            tasks/week (avg: {velocity.average})
          </div>
        </div>

        {/* Cycle Time */}
        <div
          className="rounded-xl p-4"
          style={{
            background: statusColors[cycleTimeStatus].bg,
            border: `1px solid ${statusColors[cycleTimeStatus].border}`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-surface-400">Cycle Time</span>
            <Clock size={16} style={{ color: statusColors[cycleTimeStatus].text }} />
          </div>
          <div className="text-2xl font-semibold" style={{ color: statusColors[cycleTimeStatus].text }}>
            {cycleTime.average}h
          </div>
          <div className="text-xs text-surface-500 mt-1">
            avg completion time
          </div>
        </div>

        {/* In Progress */}
        <div
          className="rounded-xl p-4"
          style={{
            background: statusColors.neutral.bg,
            border: `1px solid ${statusColors.neutral.border}`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-surface-400">Active Work</span>
            <Activity size={16} style={{ color: statusColors.neutral.text }} />
          </div>
          <div className="text-2xl font-semibold" style={{ color: statusColors.neutral.text }}>
            {taskStats.inProgress + taskStats.review}
          </div>
          <div className="text-xs text-surface-500 mt-1">
            {taskStats.inProgress} in progress, {taskStats.review} in review
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Burndown Chart */}
        <div
          className="rounded-xl p-5"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-primary-500" />
              <h3 className="text-sm font-medium text-white">Burndown Chart</h3>
            </div>
            <div className="flex gap-1">
              {(['week', 'month', 'all'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setBurndownPeriod(period)}
                  className="px-3 py-1 rounded-md text-xs transition-colors"
                  style={{
                    background: burndownPeriod === period ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
                    color: burndownPeriod === period ? '#0ea5e9' : 'var(--fl-color-text-muted)',
                  }}
                >
                  {period === 'all' ? 'All' : period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {burndownData.length > 0 ? (
            <>
              {renderBurndownChart()}
              <div className="flex items-center justify-center gap-6 mt-4 text-xs text-surface-500">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-0.5 bg-primary-500"></span>
                  Actual
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-0.5 bg-white/30 border-dashed border-t"></span>
                  Ideal
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-surface-500">
              No data available
            </div>
          )}
        </div>

        {/* Velocity Chart */}
        <div
          className="rounded-xl p-5"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-primary-500" />
            <h3 className="text-sm font-medium text-white">Weekly Velocity</h3>
          </div>

          <div className="relative">
            {renderVelocityChart()}
          </div>

          <div className="mt-4 pt-4 border-t border-surface-700 flex items-center justify-between">
            <div className="text-xs text-surface-500">
              <span className="text-white font-medium">{velocity.average}</span> tasks/week average
            </div>
            <div className={`text-xs flex items-center gap-1 ${velocity.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
              {velocity.trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {velocity.trend === 'up' ? 'Improving' : 'Declining'}
            </div>
          </div>
        </div>
      </div>

      {/* Team Progress & Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Team Progress */}
        <div
          className="rounded-xl p-5"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Target size={18} className="text-primary-500" />
            <h3 className="text-sm font-medium text-white">Team Progress</h3>
          </div>

          <div className="space-y-3">
            {teamProgress.length > 0 ? (
              teamProgress.map((member, i) => {
                const progress = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-24 text-sm text-surface-300 truncate">{member.name}</div>
                    <div className="flex-1 h-2 bg-surface-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${progress}%`,
                          background: progress === 100 ? '#22c55e' : '#0ea5e9',
                        }}
                      />
                    </div>
                    <div className="w-20 text-xs text-surface-500 text-right">
                      {member.completed}/{member.total} ({progress}%)
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center text-surface-500 py-4">No team data available</div>
            )}
          </div>
        </div>

        {/* Milestone Progress */}
        <div
          className="rounded-xl p-5"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-primary-500" />
            <h3 className="text-sm font-medium text-white">Milestones</h3>
          </div>

          <div className="space-y-3">
            {milestoneProgress.length > 0 ? (
              milestoneProgress.map((milestone) => (
                <div
                  key={milestone.id}
                  className={`p-3 rounded-lg ${milestone.isOverdue ? 'bg-red-500/10 border border-red-500/30' : 'bg-surface-800/50'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white font-medium">{milestone.name}</span>
                    {milestone.isOverdue && (
                      <span className="text-xs text-red-400 px-2 py-0.5 bg-red-500/20 rounded-full">Overdue</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${milestone.progress}%`,
                          background: milestone.progress === 100 ? '#22c55e' : milestone.isOverdue ? '#ef4444' : '#0ea5e9',
                        }}
                      />
                    </div>
                    <span className="text-xs text-surface-400 w-16 text-right">
                      {milestone.progress}%
                    </span>
                  </div>
                  {milestone.dueAt && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-surface-500">
                      <ArrowRight size={10} />
                      Due {formatDate(milestone.dueAt, 'short')}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center text-surface-500 py-4">No milestones defined</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
