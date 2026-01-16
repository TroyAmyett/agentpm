// Org Chart - Visual hierarchy of agents

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { User, Bot, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { AgentPersona } from '@/types/agentpm'
import { AgentStatusBadge } from '../Agents/AgentStatusBadge'

interface OrgChartProps {
  agents: AgentPersona[]
  currentUserId?: string
  currentUserName?: string
  onAgentClick?: (agentId: string) => void
  onAssignTask?: (agentId: string) => void
}

interface OrgNode {
  id: string
  type: 'user' | 'agent'
  name: string
  title?: string
  avatar?: string
  agent?: AgentPersona
  children: OrgNode[]
}

export function OrgChart({
  agents,
  currentUserId,
  currentUserName = 'You',
  onAgentClick,
  onAssignTask,
}: OrgChartProps) {
  // Build org tree from agents
  const orgTree = useMemo(() => {
    // Root is the current user
    const root: OrgNode = {
      id: currentUserId || 'user',
      type: 'user',
      name: currentUserName,
      title: 'Human Owner',
      children: [],
    }

    // Map agents by their reportsTo
    const agentsByReportsTo = new Map<string, AgentPersona[]>()

    agents
      .filter((a) => a.showInOrgChart)
      .forEach((agent) => {
        const reportsToId = agent.reportsTo?.id || root.id
        if (!agentsByReportsTo.has(reportsToId)) {
          agentsByReportsTo.set(reportsToId, [])
        }
        agentsByReportsTo.get(reportsToId)!.push(agent)
      })

    // Build tree recursively
    const buildChildren = (parentId: string): OrgNode[] => {
      const childAgents = agentsByReportsTo.get(parentId) || []
      return childAgents
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((agent) => ({
          id: agent.id,
          type: 'agent' as const,
          name: agent.alias,
          title: agent.agentType,
          avatar: agent.avatar,
          agent,
          children: buildChildren(agent.id),
        }))
    }

    root.children = buildChildren(root.id)

    return root
  }, [agents, currentUserId, currentUserName])

  return (
    <div className="p-6 overflow-auto">
      <OrgNodeComponent
        node={orgTree}
        level={0}
        onAgentClick={onAgentClick}
        onAssignTask={onAssignTask}
      />
    </div>
  )
}

// Individual Node Component
interface OrgNodeComponentProps {
  node: OrgNode
  level: number
  onAgentClick?: (agentId: string) => void
  onAssignTask?: (agentId: string) => void
}

function OrgNodeComponent({ node, level, onAgentClick, onAssignTask }: OrgNodeComponentProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0

  return (
    <div className="flex flex-col items-center">
      {/* Node Card */}
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative flex flex-col items-center ${level > 0 ? 'pt-6' : ''}`}
      >
        {/* Connector Line from Parent */}
        {level > 0 && (
          <div className="absolute top-0 left-1/2 w-px h-6 bg-surface-300 dark:bg-surface-600 -translate-x-1/2" />
        )}

        {/* Card */}
        <div
          onClick={() => node.type === 'agent' && onAgentClick?.(node.id)}
          className={`relative bg-white dark:bg-surface-800 rounded-xl border shadow-sm p-4 min-w-[180px] ${
            node.type === 'agent'
              ? 'border-surface-200 dark:border-surface-700 cursor-pointer hover:shadow-md hover:border-primary-300 dark:hover:border-primary-700 transition-all'
              : 'border-primary-200 dark:border-primary-800'
          }`}
        >
          {/* Avatar */}
          <div className="flex justify-center mb-3">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center ${
                node.type === 'user'
                  ? 'bg-primary-100 dark:bg-primary-900/30'
                  : 'bg-surface-100 dark:bg-surface-700'
              }`}
            >
              {node.avatar ? (
                <img
                  src={node.avatar}
                  alt={node.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : node.type === 'user' ? (
                <User className="w-7 h-7 text-primary-600 dark:text-primary-400" />
              ) : (
                <Bot className="w-7 h-7 text-surface-500 dark:text-surface-400" />
              )}
            </div>
          </div>

          {/* Info */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h3 className="font-semibold text-surface-900 dark:text-surface-100">{node.name}</h3>
              {node.agent && (
                <AgentStatusBadge
                  status={node.agent.healthStatus}
                  paused={!!node.agent.pausedAt}
                  size="sm"
                />
              )}
            </div>
            {node.title && (
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 capitalize">
                {node.title.replace('-', ' ')}
              </p>
            )}
          </div>

          {/* Assign Task Button (for agents) */}
          {node.type === 'agent' && node.agent?.isActive && !node.agent?.pausedAt && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAssignTask?.(node.id)
              }}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-600 dark:text-surface-400 text-xs font-medium transition-colors"
            >
              <Plus size={14} />
              Assign Task
            </button>
          )}

          {/* Expand/Collapse Toggle */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 flex items-center justify-center text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors z-10"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>
      </motion.div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="relative pt-6">
          {/* Horizontal connector line */}
          {node.children.length > 1 && (
            <div
              className="absolute top-6 bg-surface-300 dark:bg-surface-600 h-px"
              style={{
                left: '50%',
                width: `calc(${(node.children.length - 1) * 200}px)`,
                transform: 'translateX(-50%)',
              }}
            />
          )}

          {/* Vertical connector to horizontal line */}
          <div className="absolute top-0 left-1/2 w-px h-6 bg-surface-300 dark:bg-surface-600 -translate-x-1/2" />

          {/* Child nodes */}
          <div className="flex gap-8 justify-center">
            {node.children.map((child) => (
              <OrgNodeComponent
                key={child.id}
                node={child}
                level={level + 1}
                onAgentClick={onAgentClick}
                onAssignTask={onAssignTask}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
