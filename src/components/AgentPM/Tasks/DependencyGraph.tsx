// Dependency Graph - Visual network view of task dependencies

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import type { Task, TaskDependency } from '@/types/agentpm'
import * as db from '@/services/agentpm/database'

interface DependencyGraphProps {
  tasks: Task[]
  accountId: string
  onTaskClick?: (taskId: string) => void
}

interface GraphNode {
  id: string
  task: Task
  x: number
  y: number
  dependencies: string[]
  dependents: string[]
}

interface GraphEdge {
  from: string
  to: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
}

const NODE_WIDTH = 180
const NODE_HEIGHT = 60
const HORIZONTAL_SPACING = 250
const VERTICAL_SPACING = 100

export function DependencyGraph({ tasks, accountId, onTaskClick }: DependencyGraphProps) {
  const [dependencies, setDependencies] = useState<TaskDependency[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 50, y: 50 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Fetch all dependencies
  useEffect(() => {
    async function loadDependencies() {
      setIsLoading(true)
      try {
        // Fetch dependencies for all tasks
        const allDeps: TaskDependency[] = []
        for (const task of tasks) {
          const deps = await db.fetchTaskDependencies(task.id)
          allDeps.push(...deps)
        }
        setDependencies(allDeps)
      } catch (err) {
        console.error('Failed to load dependencies:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadDependencies()
  }, [tasks])

  // Build graph data
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []

    // Create dependency and dependent maps
    const dependencyMap = new Map<string, string[]>()
    const dependentMap = new Map<string, string[]>()

    for (const dep of dependencies) {
      // Dependencies: taskId depends on dependsOnTaskId
      if (!dependencyMap.has(dep.taskId)) {
        dependencyMap.set(dep.taskId, [])
      }
      dependencyMap.get(dep.taskId)!.push(dep.dependsOnTaskId)

      // Dependents: dependsOnTaskId is depended upon by taskId
      if (!dependentMap.has(dep.dependsOnTaskId)) {
        dependentMap.set(dep.dependsOnTaskId, [])
      }
      dependentMap.get(dep.dependsOnTaskId)!.push(dep.taskId)

      // Create edge
      edges.push({
        from: dep.dependsOnTaskId,
        to: dep.taskId,
        type: dep.dependencyType,
      })
    }

    // Create nodes for tasks that have dependencies or dependents
    const relevantTaskIds = new Set<string>()
    for (const dep of dependencies) {
      relevantTaskIds.add(dep.taskId)
      relevantTaskIds.add(dep.dependsOnTaskId)
    }

    // If no dependencies, show all tasks
    const tasksToShow = relevantTaskIds.size > 0
      ? tasks.filter((t) => relevantTaskIds.has(t.id))
      : tasks

    // Topological sort to determine levels
    const levels = new Map<string, number>()
    const visited = new Set<string>()

    function calculateLevel(taskId: string): number {
      if (visited.has(taskId)) {
        return levels.get(taskId) || 0
      }
      visited.add(taskId)

      const deps = dependencyMap.get(taskId) || []
      let maxDepLevel = -1
      for (const depId of deps) {
        maxDepLevel = Math.max(maxDepLevel, calculateLevel(depId))
      }

      const level = maxDepLevel + 1
      levels.set(taskId, level)
      return level
    }

    for (const task of tasksToShow) {
      calculateLevel(task.id)
    }

    // Group by level
    const levelGroups = new Map<number, Task[]>()
    for (const task of tasksToShow) {
      const level = levels.get(task.id) || 0
      if (!levelGroups.has(level)) {
        levelGroups.set(level, [])
      }
      levelGroups.get(level)!.push(task)
    }

    // Position nodes
    const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b)
    for (const level of sortedLevels) {
      const tasksAtLevel = levelGroups.get(level)!
      const startY = -(tasksAtLevel.length - 1) * VERTICAL_SPACING / 2

      tasksAtLevel.forEach((task, index) => {
        nodeMap.set(task.id, {
          id: task.id,
          task,
          x: level * HORIZONTAL_SPACING,
          y: startY + index * VERTICAL_SPACING,
          dependencies: dependencyMap.get(task.id) || [],
          dependents: dependentMap.get(task.id) || [],
        })
      })
    }

    return { nodes: Array.from(nodeMap.values()), edges }
  }, [tasks, dependencies])

  // Get status color
  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 dark:bg-green-900/30 border-green-500'
      case 'in_progress':
        return 'bg-blue-100 dark:bg-blue-900/30 border-blue-500'
      case 'review':
        return 'bg-orange-100 dark:bg-orange-900/30 border-orange-500'
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 border-red-500'
      case 'queued':
        return 'bg-purple-100 dark:bg-purple-900/30 border-purple-500'
      case 'cancelled':
        return 'bg-surface-200 dark:bg-surface-700 border-surface-400'
      default:
        return 'bg-surface-100 dark:bg-surface-800 border-surface-300'
    }
  }

  // Get status icon
  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={14} className="text-green-600" />
      case 'in_progress':
        return <Clock size={14} className="text-blue-600" />
      case 'review':
        return <AlertCircle size={14} className="text-orange-600" />
      case 'failed':
        return <XCircle size={14} className="text-red-600" />
      default:
        return <Clock size={14} className="text-surface-500" />
    }
  }

  // Check if a node is blocked
  const isBlocked = (node: GraphNode) => {
    return node.dependencies.some((depId) => {
      const depTask = tasks.find((t) => t.id === depId)
      return depTask && !['completed', 'cancelled'].includes(depTask.status)
    })
  }

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.2, 2))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.2, 0.4))
  const handleResetView = () => {
    setZoom(1)
    setPan({ x: 50, y: 50 })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  // Calculate SVG viewBox based on nodes
  const minX = Math.min(...nodes.map((n) => n.x)) - 50
  const maxX = Math.max(...nodes.map((n) => n.x)) + NODE_WIDTH + 50
  const minY = Math.min(...nodes.map((n) => n.y)) - 50
  const maxY = Math.max(...nodes.map((n) => n.y)) + NODE_HEIGHT + 50

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-50 dark:bg-surface-900">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-white dark:bg-surface-800 rounded-lg shadow-lg border border-surface-200 dark:border-surface-700 p-1">
        <button
          onClick={handleZoomIn}
          className="p-2 rounded hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400"
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <span className="px-2 text-sm text-surface-600 dark:text-surface-400">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={handleZoomOut}
          className="p-2 rounded hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400"
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
        <div className="w-px h-6 bg-surface-200 dark:bg-surface-700" />
        <button
          onClick={handleResetView}
          className="p-2 rounded hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400"
          title="Reset View"
        >
          <Maximize2 size={18} />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-white dark:bg-surface-800 rounded-lg shadow-lg border border-surface-200 dark:border-surface-700 p-3">
        <h4 className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-2">Legend</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-surface-600 dark:text-surface-400">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-surface-600 dark:text-surface-400">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-orange-500" />
            <span className="text-surface-600 dark:text-surface-400">Review</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-surface-400" />
            <span className="text-surface-600 dark:text-surface-400">Pending</span>
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-surface-200 dark:border-surface-700">
            <AlertTriangle size={12} className="text-yellow-500" />
            <span className="text-surface-600 dark:text-surface-400">Blocked</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-white dark:bg-surface-800 rounded-lg shadow-lg border border-surface-200 dark:border-surface-700 px-3 py-2">
          <span className="text-sm text-surface-600 dark:text-surface-400">
            {nodes.length} tasks • {edges.length} dependencies
          </span>
        </div>
      </div>

      {/* Graph Canvas */}
      <div
        className="h-full w-full cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          className="h-full w-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Edges */}
          <g>
            {edges.map((edge, index) => {
              const fromNode = nodes.find((n) => n.id === edge.from)
              const toNode = nodes.find((n) => n.id === edge.to)
              if (!fromNode || !toNode) return null

              const fromX = fromNode.x + NODE_WIDTH
              const fromY = fromNode.y + NODE_HEIGHT / 2
              const toX = toNode.x
              const toY = toNode.y + NODE_HEIGHT / 2

              // Bezier curve
              const midX = (fromX + toX) / 2

              const fromTask = tasks.find((t) => t.id === edge.from)
              const isComplete = fromTask?.status === 'completed'

              return (
                <g key={index}>
                  <path
                    d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                    fill="none"
                    stroke={isComplete ? '#22c55e' : '#94a3b8'}
                    strokeWidth={2}
                    strokeDasharray={isComplete ? 'none' : '5,5'}
                    markerEnd="url(#arrowhead)"
                  />
                  {/* Dependency type label */}
                  <text
                    x={midX}
                    y={(fromY + toY) / 2 - 5}
                    textAnchor="middle"
                    className="text-xs fill-surface-500"
                  >
                    {edge.type}
                  </text>
                </g>
              )
            })}
          </g>

          {/* Arrowhead marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="#94a3b8"
              />
            </marker>
          </defs>

          {/* Nodes */}
          <g>
            {nodes.map((node) => {
              const blocked = isBlocked(node)

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer"
                  onClick={() => onTaskClick?.(node.id)}
                >
                  {/* Node background */}
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={8}
                    className={`fill-white dark:fill-surface-800 stroke-2 ${
                      node.task.status === 'completed'
                        ? 'stroke-green-500'
                        : node.task.status === 'in_progress'
                          ? 'stroke-blue-500'
                          : node.task.status === 'review'
                            ? 'stroke-orange-500'
                            : node.task.status === 'failed'
                              ? 'stroke-red-500'
                              : 'stroke-surface-300 dark:stroke-surface-600'
                    }`}
                  />

                  {/* Task title */}
                  <text
                    x={10}
                    y={25}
                    className="text-sm fill-surface-900 dark:fill-surface-100 font-medium"
                  >
                    {node.task.title.length > 20
                      ? node.task.title.slice(0, 18) + '...'
                      : node.task.title}
                  </text>

                  {/* Status */}
                  <text
                    x={10}
                    y={45}
                    className="text-xs fill-surface-500"
                  >
                    {node.task.status.replace('_', ' ')}
                  </text>

                  {/* Blocked indicator */}
                  {blocked && (
                    <g transform={`translate(${NODE_WIDTH - 25}, 5)`}>
                      <rect
                        width={20}
                        height={20}
                        rx={4}
                        className="fill-yellow-100 dark:fill-yellow-900/30"
                      />
                      <text
                        x={10}
                        y={14}
                        textAnchor="middle"
                        className="text-xs fill-yellow-600"
                      >
                        !
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Move size={48} className="mx-auto mb-4 text-surface-400" />
            <h3 className="text-lg font-medium text-surface-900 dark:text-surface-100 mb-2">
              No dependencies to display
            </h3>
            <p className="text-surface-500">
              Add dependencies between tasks to see them visualized here
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
