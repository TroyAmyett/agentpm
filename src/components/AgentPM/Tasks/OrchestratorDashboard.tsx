// Orchestrator Dashboard — Active orchestrations, decomposition trees, status, cost
// Phase 1B: Troy's UAT tool for monitoring Atlas

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Workflow,
  ChevronRight,
  ChevronDown,
  Bot,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle,
  FileText,
  Zap,
} from 'lucide-react'
import type { Task, AgentPersona } from '@/types/agentpm'
import { TaskStatusBadge } from './TaskStatusBadge'
import { TaskPriorityBadge } from './TaskPriorityBadge'

interface OrchestratorDashboardProps {
  tasks: Task[]
  agents?: AgentPersona[]
  onTaskClick?: (taskId: string) => void
}

interface TreeNode {
  task: Task
  children: TreeNode[]
  agent?: AgentPersona
}

export function OrchestratorDashboard({ tasks, agents = [], onTaskClick }: OrchestratorDashboardProps) {
  const agentMap = useMemo(() => {
    const map = new Map<string, AgentPersona>()
    agents.forEach(a => map.set(a.id, a))
    return map
  }, [agents])

  // Build tree: find root tasks that are orchestrated (have subtasks)
  const { trees, stats } = useMemo(() => {
    const taskMap = new Map<string, Task>()
    tasks.forEach(t => taskMap.set(t.id, t))

    // Find all parent IDs that have children
    const parentIds = new Set<string>()
    tasks.forEach(t => {
      if (t.parentTaskId) parentIds.add(t.parentTaskId)
    })

    // Root orchestrated tasks = tasks that have children (are parents) OR are in review with a plan
    const rootTasks = tasks.filter(t => {
      if (t.parentTaskId) return false // not a root
      // Has children, or is in review with an orchestrator plan
      const hasChildren = parentIds.has(t.id)
      const output = t.output as Record<string, unknown> | undefined
      const hasPlan = output?.plan !== undefined
      return hasChildren || hasPlan
    })

    function buildNode(task: Task): TreeNode {
      const children = tasks
        .filter(t => t.parentTaskId === task.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map(buildNode)

      return {
        task,
        children,
        agent: task.assignedTo ? agentMap.get(task.assignedTo) : undefined,
      }
    }

    const builtTrees = rootTasks
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(buildNode)

    // Compute stats
    let totalActive = 0
    let totalCompleted = 0
    let totalFailed = 0
    let totalPending = 0

    function countStats(node: TreeNode) {
      const s = node.task.status
      if (s === 'in_progress' || s === 'queued') totalActive++
      else if (s === 'completed') totalCompleted++
      else if (s === 'failed' || s === 'cancelled') totalFailed++
      else totalPending++
      node.children.forEach(countStats)
    }
    builtTrees.forEach(countStats)

    return {
      trees: builtTrees,
      stats: { totalActive, totalCompleted, totalFailed, totalPending, totalTrees: builtTrees.length },
    }
  }, [tasks, agentMap])

  if (trees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Workflow size={48} className="mb-4 opacity-30" style={{ color: 'var(--fl-color-text-muted)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-secondary)' }}>
          No orchestrations yet
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
          Assign a task to Atlas or enable auto-routing to see orchestration trees here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {/* Stats row */}
      <div className="flex gap-3">
        <StatCard icon={<Workflow size={14} />} label="Orchestrations" value={stats.totalTrees} color="#0ea5e9" />
        <StatCard icon={<Zap size={14} />} label="Active" value={stats.totalActive} color="#f59e0b" />
        <StatCard icon={<CheckCircle2 size={14} />} label="Completed" value={stats.totalCompleted} color="#22c55e" />
        <StatCard icon={<XCircle size={14} />} label="Failed" value={stats.totalFailed} color="#ef4444" />
      </div>

      {/* Tree list */}
      <div className="space-y-3">
        {trees.map(tree => (
          <OrchestrationTree key={tree.task.id} node={tree} onTaskClick={onTaskClick} depth={0} />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// STAT CARD
// ============================================================================

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1"
      style={{ background: `${color}10`, border: `1px solid ${color}20` }}
    >
      <span style={{ color }}>{icon}</span>
      <div>
        <p className="text-lg font-bold leading-none" style={{ color }}>{value}</p>
        <p className="text-[10px]" style={{ color: 'var(--fl-color-text-muted)' }}>{label}</p>
      </div>
    </div>
  )
}

// ============================================================================
// ORCHESTRATION TREE
// ============================================================================

function OrchestrationTree({
  node,
  onTaskClick,
  depth,
}: {
  node: TreeNode
  onTaskClick?: (taskId: string) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(depth === 0) // auto-expand root
  const hasChildren = node.children.length > 0
  const isRoot = depth === 0

  // Status icon
  const statusIcon = (() => {
    switch (node.task.status) {
      case 'completed': return <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
      case 'in_progress': return <Loader2 size={14} className="animate-spin" style={{ color: '#0ea5e9' }} />
      case 'queued': return <Clock size={14} style={{ color: '#f59e0b' }} />
      case 'failed': case 'cancelled': return <XCircle size={14} style={{ color: '#ef4444' }} />
      case 'review': return <FileText size={14} style={{ color: '#8b5cf6' }} />
      default: return <AlertCircle size={14} style={{ color: 'var(--fl-color-text-muted)' }} />
    }
  })()

  // Compute cost for this node's tree
  const treeCost = useMemo(() => {
    let cost = 0
    function sum(n: TreeNode) {
      const output = n.task.output as Record<string, unknown> | undefined
      const meta = output?.metadata as Record<string, unknown> | undefined
      if (meta?.totalCost) cost += meta.totalCost as number
      n.children.forEach(sum)
    }
    sum(node)
    return cost
  }, [node])

  const childCompletedCount = node.children.filter(c => c.task.status === 'completed').length

  return (
    <div
      className={isRoot ? 'rounded-xl overflow-hidden' : ''}
      style={isRoot ? { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' } : undefined}
    >
      {/* Node row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-white/5"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded)
          else onTaskClick?.(node.task.id)
        }}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            className="flex-shrink-0 p-0.5"
          >
            {expanded ? <ChevronDown size={14} style={{ color: 'var(--fl-color-text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--fl-color-text-muted)' }} />}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}

        {/* Status icon */}
        {statusIcon}

        {/* Title */}
        <button
          onClick={(e) => { e.stopPropagation(); onTaskClick?.(node.task.id) }}
          className={`text-sm text-left truncate flex-1 min-w-0 hover:underline ${isRoot ? 'font-medium' : ''}`}
          style={{ color: 'var(--fl-color-text-primary)' }}
        >
          {node.task.title}
        </button>

        {/* Agent badge */}
        {node.agent && (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}
          >
            <Bot size={10} />
            {node.agent.alias}
          </span>
        )}

        {/* Status badge */}
        <TaskStatusBadge status={node.task.status} size="sm" />

        {/* Priority badge */}
        <TaskPriorityBadge priority={node.task.priority} size="sm" />

        {/* Progress for root */}
        {isRoot && hasChildren && (
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--fl-color-text-muted)' }}>
            {childCompletedCount}/{node.children.length}
          </span>
        )}

        {/* Cost */}
        {isRoot && treeCost > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] flex-shrink-0" style={{ color: '#22c55e' }}>
            <DollarSign size={10} />
            {(treeCost / 100).toFixed(2)}
          </span>
        )}
      </div>

      {/* Children */}
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {node.children.map(child => (
              <OrchestrationTree
                key={child.task.id}
                node={child}
                onTaskClick={onTaskClick}
                depth={depth + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
