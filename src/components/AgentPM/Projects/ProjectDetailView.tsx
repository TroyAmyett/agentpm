// Project Detail View - Shows project details, tasks, milestones, knowledge

import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  FolderKanban,
  ListTodo,
  Target,
  BookOpen,
  Settings,
  GitBranch,
  Calendar,
  CheckCircle2,
  Link2,
  Plus,
  Loader2,
  X,
  Pencil,
  Trash2,
  MoreVertical,
  Search,
} from 'lucide-react'
import type { Project, Task } from '@/types/agentpm'
import { useTimezoneFunctions } from '@/lib/timezone'
import { useProjectStore } from '@/stores/projectStore'
import { useTaskStore } from '@/stores/taskStore'
import { useAgentStore } from '@/stores/agentStore'
import { useSkillStore } from '@/stores/skillStore'
import { useMilestoneStore } from '@/stores/milestoneStore'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useAccountStore } from '@/stores/accountStore'
import { useAuthStore } from '@/stores/authStore'
import { CreateTaskModal } from '../Modals/CreateTaskModal'
import { CreateMilestoneModal } from '../Modals/CreateMilestoneModal'
import { CreateKnowledgeModal } from '../Modals/CreateKnowledgeModal'
import type { MilestoneStatus, KnowledgeType, Milestone, KnowledgeEntry } from '@/types/agentpm'

type TabId = 'overview' | 'tasks' | 'milestones' | 'knowledge' | 'settings'

interface ProjectDetailViewProps {
  project: Project
  onBack: () => void
  onSelectTask?: (taskId: string) => void
}

export function ProjectDetailView({ project, onBack, onSelectTask }: ProjectDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [showCreateMilestoneModal, setShowCreateMilestoneModal] = useState(false)
  const [showCreateKnowledgeModal, setShowCreateKnowledgeModal] = useState(false)
  const [milestoneFilter, setMilestoneFilter] = useState<string | null>(null)
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('all')
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('all')
  const [taskSearchQuery, setTaskSearchQuery] = useState('')
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null)
  const [milestoneMenuOpen, setMilestoneMenuOpen] = useState<string | null>(null)
  const [knowledgeMenuOpen, setKnowledgeMenuOpen] = useState<string | null>(null)
  const { formatDate } = useTimezoneFunctions()
  const { updateProject } = useProjectStore()
  const { getTasksByProject, createTask } = useTaskStore()
  const { agents } = useAgentStore()
  const { skills } = useSkillStore()
  const { fetchMilestones, getMilestonesByProject, createMilestone, updateMilestone, deleteMilestone } = useMilestoneStore()
  const { fetchKnowledge, getKnowledgeByProject, createKnowledge, updateKnowledge, deleteKnowledge } = useKnowledgeStore()
  const { currentAccount } = useAccountStore()
  const { user } = useAuthStore()

  const account = currentAccount()
  const hasValidAccount = account && !account.id?.startsWith('default-')

  // Fetch milestones and knowledge when project changes
  useEffect(() => {
    fetchMilestones(project.id)
    fetchKnowledge(project.id)
  }, [project.id, fetchMilestones, fetchKnowledge])

  // Get tasks, milestones, and knowledge for this project
  const projectTasks = getTasksByProject(project.id)
  const projectMilestones = getMilestonesByProject(project.id)
  const projectKnowledge = getKnowledgeByProject(project.id)

  // Calculate real progress from tasks
  const completedTasksCount = projectTasks.filter(t => t.status === 'completed').length
  const totalTasksCount = projectTasks.length
  const calculatedProgress = totalTasksCount > 0
    ? Math.round((completedTasksCount / totalTasksCount) * 100)
    : 0

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    name: project.name,
    description: project.description || '',
    status: project.status,
    repositoryUrl: project.repositoryUrl || '',
    repositoryPath: project.repositoryPath || '',
    baseBranch: project.baseBranch || 'main',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleSaveSettings = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      await updateProject(project.id, {
        name: settingsForm.name,
        description: settingsForm.description,
        status: settingsForm.status,
        repositoryUrl: settingsForm.repositoryUrl || undefined,
        repositoryPath: settingsForm.repositoryPath || undefined,
        baseBranch: settingsForm.baseBranch || 'main',
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (error) {
      console.error('Failed to save project:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateTask = async (taskData: {
    title: string
    description?: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    dueAt?: string
    assignedTo?: string
    assignedToType?: 'user' | 'agent'
    projectId?: string
    skillId?: string
    milestoneId?: string
    status?: string
  }) => {
    if (!account?.id) return

    await createTask({
      accountId: account.id,
      projectId: project.id,
      title: taskData.title,
      description: taskData.description,
      priority: taskData.priority,
      dueAt: taskData.dueAt,
      assignedTo: taskData.assignedTo,
      assignedToType: taskData.assignedToType,
      skillId: taskData.skillId,
      milestoneId: taskData.milestoneId,
      status: (taskData.status as Task['status']) || 'pending',
      createdBy: user?.id || 'unknown',
      createdByType: 'user',
      updatedBy: user?.id || 'unknown',
      updatedByType: 'user',
    })
  }

  const handleCreateMilestone = async (milestoneData: {
    name: string
    description?: string
    status: MilestoneStatus
    dueDate?: string
    sortOrder: number
  }) => {
    if (!account?.id) return

    await createMilestone({
      accountId: account.id,
      projectId: project.id,
      name: milestoneData.name,
      description: milestoneData.description,
      status: milestoneData.status,
      dueDate: milestoneData.dueDate,
      sortOrder: milestoneData.sortOrder,
      createdBy: user?.id || 'unknown',
      createdByType: 'user',
      updatedBy: user?.id || 'unknown',
      updatedByType: 'user',
    })
  }

  const handleCreateKnowledge = async (entryData: {
    knowledgeType: KnowledgeType
    content: string
    isVerified: boolean
  }) => {
    if (!account?.id) return

    await createKnowledge({
      accountId: account.id,
      projectId: project.id,
      knowledgeType: entryData.knowledgeType,
      content: entryData.content,
      isVerified: entryData.isVerified,
      createdBy: user?.id || 'unknown',
      createdByType: 'user',
      updatedBy: user?.id || 'unknown',
      updatedByType: 'user',
    })
  }

  const handleUpdateMilestone = async (id: string, updates: Partial<Milestone>) => {
    await updateMilestone(id, {
      ...updates,
      updatedBy: user?.id || 'unknown',
      updatedByType: 'user',
    })
  }

  const handleDeleteMilestone = async (id: string) => {
    if (!user?.id) return
    if (!window.confirm('Are you sure you want to delete this task list?')) return
    await deleteMilestone(id, user.id)
  }

  const handleUpdateKnowledge = async (id: string, updates: Partial<KnowledgeEntry>) => {
    await updateKnowledge(id, {
      ...updates,
      updatedBy: user?.id || 'unknown',
      updatedByType: 'user',
    })
  }

  const handleDeleteKnowledge = async (id: string) => {
    if (!user?.id) return
    if (!window.confirm('Are you sure you want to delete this knowledge entry?')) return
    await deleteKnowledge(id, user.id)
  }

  // Use calculated progress from actual tasks (fallback to stats for backwards compat)
  const progress = totalTasksCount > 0 ? calculatedProgress : (project.stats?.progress || 0)
  const completedTasks = totalTasksCount > 0 ? completedTasksCount : (project.stats?.completedTasks || 0)
  const totalTasks = totalTasksCount > 0 ? totalTasksCount : (project.stats?.totalTasks || 0)

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: <FolderKanban size={16} /> },
    { id: 'tasks' as const, label: 'Tasks', icon: <ListTodo size={16} /> },
    { id: 'milestones' as const, label: 'Task Lists', icon: <Target size={16} /> },
    { id: 'knowledge' as const, label: 'Knowledge', icon: <BookOpen size={16} /> },
    { id: 'settings' as const, label: 'Settings', icon: <Settings size={16} /> },
  ]

  return (
    <div className="h-full flex flex-col bg-surface-50 dark:bg-surface-900">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <div className="p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
                  {project.name}
                </h1>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    project.status === 'active'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : project.status === 'on_hold'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                        : project.status === 'completed'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-surface-100 dark:bg-surface-700 text-surface-500'
                  }`}
                >
                  {project.status.replace('_', ' ')}
                </span>
              </div>
              {project.description && (
                <p className="text-sm text-surface-500 mt-1">{project.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center px-4 border-t border-surface-200 dark:border-surface-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'overview' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Progress Card */}
            <div className="bg-white dark:bg-surface-800 rounded-xl p-6 border border-surface-200 dark:border-surface-700">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
                Progress
              </h2>
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-surface-600 dark:text-surface-400 mb-2">
                  <span>{progress}% Complete</span>
                  <span>{completedTasks} of {totalTasks} tasks</span>
                </div>
                <div className="h-3 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-surface-50 dark:bg-surface-900 rounded-lg">
                  <div className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                    {totalTasks}
                  </div>
                  <div className="text-xs text-surface-500">Total Tasks</div>
                </div>
                <div className="text-center p-3 bg-surface-50 dark:bg-surface-900 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {completedTasks}
                  </div>
                  <div className="text-xs text-surface-500">Completed</div>
                </div>
                <div className="text-center p-3 bg-surface-50 dark:bg-surface-900 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {totalTasks - completedTasks}
                  </div>
                  <div className="text-xs text-surface-500">Remaining</div>
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-6">
              {/* Dates */}
              <div className="bg-white dark:bg-surface-800 rounded-xl p-6 border border-surface-200 dark:border-surface-700">
                <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wide mb-4">
                  Timeline
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Calendar size={18} className="text-surface-400" />
                    <div>
                      <div className="text-xs text-surface-500">Start Date</div>
                      <div className="text-sm font-medium text-surface-900 dark:text-surface-100">
                        {project.startDate
                          ? formatDate(project.startDate, 'medium')
                          : 'Not set'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Target size={18} className="text-surface-400" />
                    <div>
                      <div className="text-xs text-surface-500">Target Date</div>
                      <div className="text-sm font-medium text-surface-900 dark:text-surface-100">
                        {project.targetDate
                          ? formatDate(project.targetDate, 'medium')
                          : 'Not set'}
                      </div>
                    </div>
                  </div>
                  {project.completedDate && (
                    <div className="flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-green-500" />
                      <div>
                        <div className="text-xs text-surface-500">Completed</div>
                        <div className="text-sm font-medium text-surface-900 dark:text-surface-100">
                          {formatDate(project.completedDate, 'medium')}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Repository */}
              <div className="bg-white dark:bg-surface-800 rounded-xl p-6 border border-surface-200 dark:border-surface-700">
                <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wide mb-4">
                  Repository
                </h3>
                {project.repositoryUrl || project.repositoryPath ? (
                  <div className="space-y-3">
                    {project.repositoryUrl && (
                      <div className="flex items-center gap-3">
                        <Link2 size={18} className="text-surface-400" />
                        <div>
                          <div className="text-xs text-surface-500">Remote URL</div>
                          <a
                            href={project.repositoryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                          >
                            {project.repositoryUrl}
                          </a>
                        </div>
                      </div>
                    )}
                    {project.repositoryPath && (
                      <div className="flex items-center gap-3">
                        <FolderKanban size={18} className="text-surface-400" />
                        <div>
                          <div className="text-xs text-surface-500">Local Path</div>
                          <div className="text-sm font-medium text-surface-900 dark:text-surface-100 font-mono">
                            {project.repositoryPath}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <GitBranch size={18} className="text-surface-400" />
                      <div>
                        <div className="text-xs text-surface-500">Base Branch</div>
                        <div className="text-sm font-medium text-surface-900 dark:text-surface-100">
                          {project.baseBranch}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-surface-500">
                    <GitBranch size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No repository configured</p>
                    <button className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline">
                      Add repository settings
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Linked Items */}
            <div className="bg-white dark:bg-surface-800 rounded-xl p-6 border border-surface-200 dark:border-surface-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wide">
                  Linked Folders & Notes
                </h3>
                <button className="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
                  <Plus size={14} />
                  Link Items
                </button>
              </div>
              <div className="text-center py-8 text-surface-500">
                <Link2 size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No items linked yet</p>
                <p className="text-xs mt-1">Link folders or notes to include them in this project</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="max-w-4xl mx-auto">
            {/* Header with title and add button */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Tasks
              </h2>
              <button
                onClick={() => setShowCreateTaskModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus size={14} />
                Add Task
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Status filter */}
              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
              </select>

              {/* Priority filter */}
              <select
                value={taskPriorityFilter}
                onChange={(e) => setTaskPriorityFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Priority</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              {/* Milestone filter badge */}
              {milestoneFilter && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-sm">
                  <Target size={14} />
                  <span>{projectMilestones.find(m => m.id === milestoneFilter)?.name || 'Task List'}</span>
                  <button
                    onClick={() => setMilestoneFilter(null)}
                    className="hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-full p-0.5"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Clear all filters */}
              {(taskSearchQuery || taskStatusFilter !== 'all' || taskPriorityFilter !== 'all' || milestoneFilter) && (
                <button
                  onClick={() => {
                    setTaskSearchQuery('')
                    setTaskStatusFilter('all')
                    setTaskPriorityFilter('all')
                    setMilestoneFilter(null)
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
                >
                  <X size={14} />
                  Clear filters
                </button>
              )}
            </div>

            {(() => {
              // Apply all filters
              let filteredTasks = projectTasks

              // Milestone filter
              if (milestoneFilter) {
                filteredTasks = filteredTasks.filter(t => t.milestoneId === milestoneFilter)
              }

              // Status filter
              if (taskStatusFilter !== 'all') {
                filteredTasks = filteredTasks.filter(t => t.status === taskStatusFilter)
              }

              // Priority filter
              if (taskPriorityFilter !== 'all') {
                filteredTasks = filteredTasks.filter(t => t.priority === taskPriorityFilter)
              }

              // Search filter
              if (taskSearchQuery.trim()) {
                const query = taskSearchQuery.toLowerCase()
                filteredTasks = filteredTasks.filter(t =>
                  t.title.toLowerCase().includes(query) ||
                  t.description?.toLowerCase().includes(query)
                )
              }

              const hasActiveFilters = milestoneFilter || taskStatusFilter !== 'all' || taskPriorityFilter !== 'all' || taskSearchQuery

              if (filteredTasks.length === 0) {
                return (
                  <div className="text-center py-16 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
                    <ListTodo size={48} className="mx-auto mb-4 text-surface-300 dark:text-surface-600" />
                    <p className="text-surface-500">
                      {hasActiveFilters ? 'No tasks match your filters' : 'No tasks in this project yet'}
                    </p>
                    <p className="text-sm text-surface-400 mt-1">
                      {hasActiveFilters
                        ? 'Try adjusting your filters or search query'
                        : 'Create tasks or extract them from PRD notes'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={() => {
                          setTaskSearchQuery('')
                          setTaskStatusFilter('all')
                          setTaskPriorityFilter('all')
                          setMilestoneFilter(null)
                        }}
                        className="mt-4 text-sm text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                )
              }

              return (
                <>
                  {/* Results count */}
                  <div className="text-sm text-surface-500 mb-2">
                    {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
                    {hasActiveFilters && ` (of ${projectTasks.length} total)`}
                  </div>
                  <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 divide-y divide-surface-200 dark:divide-surface-700">
                    {filteredTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask?.(task.id)}
                      className="p-4 hover:bg-surface-50 dark:hover:bg-surface-750 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${
                          task.status === 'completed' ? 'bg-green-500' :
                          task.status === 'in_progress' ? 'bg-blue-500' :
                          task.status === 'pending' ? 'bg-yellow-500' :
                          'bg-surface-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-surface-900 dark:text-surface-100 truncate">
                            {task.title}
                          </h3>
                          {task.description && (
                            <p className="text-sm text-surface-500 mt-0.5 line-clamp-1">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-surface-400">
                            <span className={`px-1.5 py-0.5 rounded ${
                              task.priority === 'critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                              task.priority === 'high' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                              task.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                              'bg-surface-100 dark:bg-surface-700 text-surface-500'
                            }`}>
                              {task.priority}
                            </span>
                            <span className="capitalize">{task.status.replace('_', ' ')}</span>
                            {task.dueAt && (
                              <span>Due {formatDate(task.dueAt, 'short')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {activeTab === 'milestones' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Task Lists ({projectMilestones.length})
              </h2>
              <button
                onClick={() => setShowCreateMilestoneModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus size={14} />
                Add Task List
              </button>
            </div>
            {projectMilestones.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
                <Target size={48} className="mx-auto mb-4 text-surface-300 dark:text-surface-600" />
                <p className="text-surface-500">No task lists defined yet</p>
                <p className="text-sm text-surface-400 mt-1">
                  Create task lists to organize tasks into milestones or sprints
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {projectMilestones.map((milestone) => {
                  const milestoneTasks = projectTasks.filter(t => t.milestoneId === milestone.id)
                  const completedCount = milestoneTasks.filter(t => t.status === 'completed').length
                  const milestoneProgress = milestoneTasks.length > 0
                    ? Math.round((completedCount / milestoneTasks.length) * 100)
                    : 0

                  return (
                    <div
                      key={milestone.id}
                      className="bg-white dark:bg-surface-800 rounded-xl p-5 border border-surface-200 dark:border-surface-700"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                            milestone.status === 'completed' ? 'bg-green-500' :
                            milestone.status === 'in_progress' ? 'bg-blue-500' :
                            'bg-surface-300 dark:bg-surface-600'
                          }`} />
                          <div>
                            <h3 className="font-semibold text-surface-900 dark:text-surface-100">
                              {milestone.name}
                            </h3>
                            {milestone.description && (
                              <p className="text-sm text-surface-500 mt-0.5">{milestone.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            milestone.status === 'completed'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                              : milestone.status === 'in_progress'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                : 'bg-surface-100 dark:bg-surface-700 text-surface-500'
                          }`}>
                            {milestone.status.replace('_', ' ')}
                          </span>
                          {/* Actions dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setMilestoneMenuOpen(milestoneMenuOpen === milestone.id ? null : milestone.id)}
                              className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {milestoneMenuOpen === milestone.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setMilestoneMenuOpen(null)}
                                />
                                <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-surface-700 rounded-lg shadow-lg border border-surface-200 dark:border-surface-600 py-1 z-20">
                                  <button
                                    onClick={() => {
                                      setEditingMilestoneId(milestone.id)
                                      setShowCreateMilestoneModal(true)
                                      setMilestoneMenuOpen(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-600"
                                  >
                                    <Pencil size={14} />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleDeleteMilestone(milestone.id)
                                      setMilestoneMenuOpen(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  >
                                    <Trash2 size={14} />
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
                          <span>{milestoneProgress}% complete</span>
                          <span>{completedCount} of {milestoneTasks.length} tasks</span>
                        </div>
                        <div className="h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full transition-all"
                            style={{ width: `${milestoneProgress}%` }}
                          />
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between text-xs text-surface-400">
                        {milestone.dueDate ? (
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            Due {formatDate(milestone.dueDate, 'short')}
                          </span>
                        ) : (
                          <span>No due date</span>
                        )}
                        <button
                          onClick={() => {
                            setMilestoneFilter(milestone.id)
                            setActiveTab('tasks')
                          }}
                          className="text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          View tasks
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Project Knowledge ({projectKnowledge.length})
              </h2>
              <button
                onClick={() => setShowCreateKnowledgeModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus size={14} />
                Add Entry
              </button>
            </div>

            {/* Linked Folder */}
            <div className="bg-white dark:bg-surface-800 rounded-xl p-6 border border-surface-200 dark:border-surface-700">
              <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wide mb-4">
                Knowledge Source
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Docs Folder Path
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settingsForm.repositoryPath ? `${settingsForm.repositoryPath}/docs` : ''}
                      placeholder="C:\dev\myproject\docs or linked from repo path"
                      disabled
                      className="flex-1 px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 text-surface-600 dark:text-surface-400 text-sm font-mono"
                    />
                    <button
                      disabled
                      className="px-4 py-2 bg-surface-200 dark:bg-surface-700 text-surface-500 text-sm font-medium rounded-lg cursor-not-allowed"
                      title="Sync feature coming soon"
                    >
                      Sync
                    </button>
                  </div>
                  <p className="text-xs text-surface-400 mt-1">
                    Set the repository path in Settings to auto-link docs folder. Sync feature coming soon.
                  </p>
                </div>
              </div>
            </div>

            {/* Knowledge Entries */}
            {projectKnowledge.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
                <BookOpen size={48} className="mx-auto mb-4 text-surface-300 dark:text-surface-600" />
                <p className="text-surface-500">No knowledge entries yet</p>
                <p className="text-sm text-surface-400 mt-1">
                  Add facts, decisions, and context that AI agents can use
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 divide-y divide-surface-200 dark:divide-surface-700">
                {projectKnowledge.map((entry) => (
                  <div key={entry.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        entry.knowledgeType === 'fact' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                        entry.knowledgeType === 'decision' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                        entry.knowledgeType === 'constraint' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                        entry.knowledgeType === 'reference' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                        'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                      }`}>
                        {entry.knowledgeType === 'fact' && <span className="text-xs font-bold">F</span>}
                        {entry.knowledgeType === 'decision' && <span className="text-xs font-bold">D</span>}
                        {entry.knowledgeType === 'constraint' && <span className="text-xs font-bold">C</span>}
                        {entry.knowledgeType === 'reference' && <span className="text-xs font-bold">R</span>}
                        {entry.knowledgeType === 'glossary' && <span className="text-xs font-bold">G</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              entry.knowledgeType === 'fact' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                              entry.knowledgeType === 'decision' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                              entry.knowledgeType === 'constraint' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                              entry.knowledgeType === 'reference' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                              'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                            }`}>
                              {entry.knowledgeType}
                            </span>
                            {entry.isVerified && (
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <CheckCircle2 size={12} />
                                Verified
                              </span>
                            )}
                          </div>
                          {/* Actions dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setKnowledgeMenuOpen(knowledgeMenuOpen === entry.id ? null : entry.id)}
                              className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {knowledgeMenuOpen === entry.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setKnowledgeMenuOpen(null)}
                                />
                                <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-surface-700 rounded-lg shadow-lg border border-surface-200 dark:border-surface-600 py-1 z-20">
                                  <button
                                    onClick={() => {
                                      setEditingKnowledgeId(entry.id)
                                      setShowCreateKnowledgeModal(true)
                                      setKnowledgeMenuOpen(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-600"
                                  >
                                    <Pencil size={14} />
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleDeleteKnowledge(entry.id)
                                      setKnowledgeMenuOpen(null)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  >
                                    <Trash2 size={14} />
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="text-surface-900 dark:text-surface-100">{entry.content}</p>
                        <div className="text-xs text-surface-400 mt-2">
                          Added {formatDate(entry.createdAt, 'medium')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-6">
              Project Settings
            </h2>
            <div className="bg-white dark:bg-surface-800 rounded-xl p-6 border border-surface-200 dark:border-surface-700 space-y-6">
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Description
                </label>
                <textarea
                  value={settingsForm.description}
                  onChange={(e) => setSettingsForm({ ...settingsForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Status
                </label>
                <select
                  value={settingsForm.status}
                  onChange={(e) => setSettingsForm({ ...settingsForm, status: e.target.value as Project['status'] })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Repository Settings */}
              <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
                <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wide mb-4">
                  Repository
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      GitHub URL
                    </label>
                    <input
                      type="url"
                      value={settingsForm.repositoryUrl}
                      onChange={(e) => setSettingsForm({ ...settingsForm, repositoryUrl: e.target.value })}
                      placeholder="https://github.com/username/repo"
                      className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      Local Directory Path
                    </label>
                    <input
                      type="text"
                      value={settingsForm.repositoryPath}
                      onChange={(e) => setSettingsForm({ ...settingsForm, repositoryPath: e.target.value })}
                      placeholder="C:\dev\myproject or /home/user/myproject"
                      className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      Base Branch
                    </label>
                    <input
                      type="text"
                      value={settingsForm.baseBranch}
                      onChange={(e) => setSettingsForm({ ...settingsForm, baseBranch: e.target.value })}
                      placeholder="main"
                      className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-surface-200 dark:border-surface-700 flex items-center gap-3">
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {isSaving && <Loader2 size={14} className="animate-spin" />}
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                {saveSuccess && (
                  <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 size={14} />
                    Saved!
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={showCreateTaskModal}
        onClose={() => setShowCreateTaskModal(false)}
        onSubmit={handleCreateTask}
        agents={agents}
        skills={skills}
        milestones={projectMilestones}
        projectId={project.id}
        currentUserId={user?.id}
        currentUserName={user?.user_metadata?.name || user?.email}
        hasValidAccount={hasValidAccount ?? undefined}
      />

      {/* Create/Edit Milestone Modal */}
      <CreateMilestoneModal
        isOpen={showCreateMilestoneModal}
        onClose={() => {
          setShowCreateMilestoneModal(false)
          setEditingMilestoneId(null)
        }}
        onSubmit={handleCreateMilestone}
        onUpdate={handleUpdateMilestone}
        existingMilestonesCount={projectMilestones.length}
        editingMilestone={editingMilestoneId ? projectMilestones.find(m => m.id === editingMilestoneId) : null}
      />

      {/* Create/Edit Knowledge Modal */}
      <CreateKnowledgeModal
        isOpen={showCreateKnowledgeModal}
        onClose={() => {
          setShowCreateKnowledgeModal(false)
          setEditingKnowledgeId(null)
        }}
        onSubmit={handleCreateKnowledge}
        onUpdate={handleUpdateKnowledge}
        editingEntry={editingKnowledgeId ? projectKnowledge.find(k => k.id === editingKnowledgeId) : null}
      />
    </div>
  )
}
