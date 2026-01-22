// AgentPM Page - Main page combining all AgentPM features

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ListTodo,
  GitBranch,
  Bell,
  Settings,
  Plus,
  FileText,
  Bot,
  Hammer,
  FolderKanban,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useAgentStore } from '@/stores/agentStore'
import { useTaskStore } from '@/stores/taskStore'
import { useProjectStore } from '@/stores/projectStore'
import { useAccountStore } from '@/stores/accountStore'
import { useUIStore } from '@/stores/uiStore'
import { useSkillStore } from '@/stores/skillStore'
import { useExecutionStore } from '@/stores/executionStore'
import { AgentDashboard } from './Dashboard'
import { TaskList, TaskDetail, DependencyGraph } from './Tasks'
import { CreateTaskModal, AssignAgentModal, EditTaskModal, AgentDetailModal } from './Modals'
import { ReviewCard } from './Reviews'
import { OrgChart } from './OrgChart'
import { KanbanView } from './Kanban'
import { ViewSwitcher } from './ViewSwitcher'
import { SkillsPage } from './Skills'
import { AgentsPage } from './Agents'
import { ProjectsPage } from './Projects'
import { AccountSwitcher } from '@/components/AccountSwitcher'
import { VoiceCommandBar, type ParsedVoiceCommand } from '@/components/Voice'
import { ForgeTaskModal } from './Forge'
import { routeTask } from '@/services/agents/dispatcher'
import type { Task, TaskStatus, AgentPersona, ForgeTaskInput } from '@/types/agentpm'

type TabId = 'dashboard' | 'projects' | 'tasks' | 'agents' | 'org-chart' | 'reviews' | 'skills' | 'forge'

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'projects', label: 'Projects', icon: <FolderKanban size={18} /> },
  { id: 'tasks', label: 'Tasks', icon: <ListTodo size={18} /> },
  { id: 'forge', label: 'Forge', icon: <Hammer size={18} /> },
  { id: 'agents', label: 'Agents', icon: <Bot size={18} /> },
  { id: 'org-chart', label: 'Org Chart', icon: <GitBranch size={18} /> },
  { id: 'reviews', label: 'Reviews', icon: <Bell size={18} /> },
  { id: 'skills', label: 'Skills', icon: <FileText size={18} /> },
]

export function AgentPMPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [assignAgentTask, setAssignAgentTask] = useState<Task | null>(null)
  const [preselectedAgentId, setPreselectedAgentId] = useState<string | undefined>(undefined)
  const [selectedAgent, setSelectedAgent] = useState<AgentPersona | null>(null)
  const [voiceTaskTitle, setVoiceTaskTitle] = useState<string>('')
  const [isForgeTaskOpen, setIsForgeTaskOpen] = useState(false)

  const { user } = useAuthStore()
  const { accounts, currentAccountId, currentAccount, fetchAccounts, initializeUserAccounts } = useAccountStore()
  const { agents, fetchAgents, subscribeToAgents, pauseAgent, resumeAgent, resetAgentHealth } = useAgentStore()
  const { projects, fetchProjects } = useProjectStore()
  const { taskViewMode, setTaskViewMode } = useUIStore()
  const { skills, fetchSkills } = useSkillStore()
  const { runTask, isExecuting } = useExecutionStore()
  const {
    tasks,
    blockedTasks,
    fetchTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    assignTask,
    deleteTask,
    subscribeToTasks,
    getTask,
    getPendingReviewTasks,
  } = useTaskStore()

  const userId = user?.id || 'demo-user'
  const accountId = currentAccountId || 'demo-account-id'
  const account = currentAccount()

  // Create agent name map
  const agentNameMap = new Map<string, string>(
    agents.map((a) => [a.id, a.alias])
  )

  // Initialize user accounts on mount (creates default account if needed)
  useEffect(() => {
    if (user) {
      // User is authenticated - ensure they have an account
      initializeUserAccounts()
    } else {
      // Not authenticated - use default accounts
      fetchAccounts()
    }
  }, [user, fetchAccounts, initializeUserAccounts])

  useEffect(() => {
    if (accountId) {
      fetchAgents(accountId)
      fetchTasks(accountId)
      fetchProjects(accountId)
      fetchSkills(accountId)
    }
  }, [accountId, fetchAgents, fetchTasks, fetchProjects, fetchSkills])

  // Subscribe to realtime updates
  useEffect(() => {
    const unsubAgents = subscribeToAgents(accountId)
    const unsubTasks = subscribeToTasks(accountId)

    return () => {
      unsubAgents()
      unsubTasks()
    }
  }, [accountId, subscribeToAgents, subscribeToTasks])

  // Queue watcher - auto-process queued tasks with assigned agents
  useEffect(() => {
    if (isExecuting) return // Don't process while already executing

    // Find the first queued task with an assigned agent
    const queuedTask = tasks.find(
      (t) => t.status === 'queued' && t.assignedTo && t.assignedToType === 'agent'
    )

    if (queuedTask) {
      const agent = agents.find((a) => a.id === queuedTask.assignedTo)
      if (agent) {
        const skill = queuedTask.skillId
          ? skills.find((s) => s.id === queuedTask.skillId)
          : undefined

        // Start execution
        updateTaskStatus(queuedTask.id, 'in_progress', userId, 'Auto-started from queue')
          .then(() => {
            runTask(queuedTask, agent, skill, accountId, userId)
          })
          .catch((err) => console.error('Failed to start queued task:', err))
      }
    }
  }, [tasks, agents, skills, isExecuting, updateTaskStatus, runTask, accountId, userId])

  // Handle task creation - new tasks go to Inbox (draft) by default
  const handleCreateTask = useCallback(
    async (taskData: {
      title: string
      description?: string
      priority: Task['priority']
      dueAt?: string
      assignedTo?: string
      assignedToType?: 'user' | 'agent'
      projectId?: string
      skillId?: string
      input?: ForgeTaskInput
    }) => {
      // New tasks start in draft (Inbox) - no auto-routing on create
      // Auto-routing happens when moved to 'pending' (Ready column)
      await createTask({
        ...taskData,
        accountId,
        status: 'draft', // Safe zone - no automation until moved to Ready
        createdBy: userId,
        createdByType: 'user',
        updatedBy: userId,
        updatedByType: 'user',
      } as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>)
    },
    [accountId, userId, createTask]
  )

  // Handle Forge task creation
  const handleCreateForgeTask = useCallback(
    async (taskData: {
      title: string
      description?: string
      priority: Task['priority']
      assignedTo: string
      assignedToType: 'agent'
      projectId?: string
      input: ForgeTaskInput
    }) => {
      await createTask({
        title: taskData.title,
        description: taskData.description,
        priority: taskData.priority,
        assignedTo: taskData.assignedTo,
        assignedToType: taskData.assignedToType,
        projectId: taskData.projectId,
        input: taskData.input as unknown as Record<string, unknown>,
        accountId,
        status: 'queued', // Forge tasks start as queued
        createdBy: userId,
        createdByType: 'user',
        updatedBy: userId,
        updatedByType: 'user',
      } as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>)
    },
    [accountId, userId, createTask]
  )

  // Handle status update - auto-route when moving to Ready, auto-execute when queued
  const handleUpdateStatus = useCallback(
    async (taskId: string, status: TaskStatus, note?: string) => {
      const task = getTask(taskId)
      if (!task) return

      // SMART ROUTING: When moving to 'pending' (Ready column), auto-route to best agent
      if (status === 'pending' && (!task.assignedTo || task.assignedToType !== 'agent')) {
        const routingDecision = await routeTask({ task, agents })
        if (routingDecision) {
          console.log(`Dispatch routed task to ${routingDecision.agentAlias}: ${routingDecision.reasoning}`)
          // Assign agent and move directly to queued
          await assignTask(taskId, routingDecision.agentId, 'agent', userId)
          await updateTaskStatus(taskId, 'queued', userId, `Dispatch assigned to ${routingDecision.agentAlias}`)
          // The queue watcher will pick it up
          return
        }
      }

      // Normal status update
      await updateTaskStatus(taskId, status, userId, note)

      // Auto-execute when task is queued or in_progress and assigned to an agent
      if ((status === 'queued' || status === 'in_progress') && !isExecuting) {
        const updatedTask = getTask(taskId)
        if (updatedTask?.assignedTo && updatedTask.assignedToType === 'agent') {
          const agent = agents.find((a) => a.id === updatedTask.assignedTo)
          const skill = updatedTask.skillId ? skills.find((s) => s.id === updatedTask.skillId) : undefined
          if (agent) {
            // Move to in_progress first, then run
            if (status === 'queued') {
              await updateTaskStatus(taskId, 'in_progress', userId, 'Auto-started from queue')
            }
            runTask(updatedTask, agent, skill, accountId, userId)
          }
        }
      }
    },
    [userId, updateTaskStatus, isExecuting, getTask, agents, skills, runTask, accountId, assignTask]
  )

  // Handle agent assignment - auto-execute immediately
  const handleAssignAgent = useCallback(
    async (agentId: string) => {
      if (!assignAgentTask) return
      await assignTask(assignAgentTask.id, agentId, 'agent', userId)

      const agent = agents.find((a) => a.id === agentId)
      if (!agent || isExecuting) {
        setAssignAgentTask(null)
        return
      }

      // Move to in_progress and execute immediately
      await updateTaskStatus(assignAgentTask.id, 'in_progress', userId, 'Agent assigned - auto-starting')

      const skill = assignAgentTask.skillId
        ? skills.find((s) => s.id === assignAgentTask.skillId)
        : undefined
      const updatedTask = { ...assignAgentTask, assignedTo: agentId, assignedToType: 'agent' as const }
      runTask(updatedTask, agent, skill, accountId, userId)

      setAssignAgentTask(null)
    },
    [assignAgentTask, assignTask, updateTaskStatus, userId, agents, isExecuting, skills, runTask, accountId]
  )

  // Handle task deletion
  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      try {
        await deleteTask(taskId, userId)
        setSelectedTaskId(null)
      } catch (err) {
        console.error('Failed to delete task:', err)
        alert('Failed to delete task. Please try again.')
      }
    },
    [deleteTask, userId]
  )

  // Handle task edit
  const handleEditTask = useCallback(
    async (taskId: string, updates: {
      title: string
      description?: string
      priority: Task['priority']
      dueAt?: string
    }) => {
      await updateTask(taskId, {
        ...updates,
        updatedBy: userId,
        updatedByType: 'user',
      })
      setEditingTask(null)
    },
    [updateTask, userId]
  )

  // Handle agent pause
  const handlePauseAgent = useCallback(
    async (agentId: string) => {
      await pauseAgent(agentId, userId, 'Paused by user')
    },
    [pauseAgent, userId]
  )

  // Handle agent resume
  const handleResumeAgent = useCallback(
    async (agentId: string) => {
      await resumeAgent(agentId, userId)
    },
    [resumeAgent, userId]
  )

  // Handle agent health reset
  const handleResetAgentHealth = useCallback(
    async (agentId: string) => {
      await resetAgentHealth(agentId, userId)
    },
    [resetAgentHealth, userId]
  )

  const selectedTask = selectedTaskId ? getTask(selectedTaskId) : null
  const selectedTaskAgent = selectedTask?.assignedTo
    ? agents.find((a) => a.id === selectedTask.assignedTo)
    : undefined
  const selectedTaskSkill = selectedTask?.skillId
    ? skills.find((s) => s.id === selectedTask.skillId)
    : undefined

  const pendingReviews = getPendingReviewTasks()

  // Handle voice commands
  const handleVoiceCommand = useCallback(
    (command: ParsedVoiceCommand) => {
      switch (command.intent) {
        case 'create_task':
          setVoiceTaskTitle(command.title || command.rawText)
          setIsCreateTaskOpen(true)
          break
        case 'create_note':
          // TODO: Switch to notes view and create note
          console.log('Create note:', command.title)
          break
        case 'status_query':
          // TODO: Show project status
          console.log('Status query:', command.project)
          break
        case 'run_agent':
          // TODO: Trigger agent manually
          console.log('Run agent:', command.agent)
          break
        case 'switch_account':
          // Find and switch to account
          const targetAccount = accounts.find(
            (a) => a.name.toLowerCase() === command.title?.toLowerCase()
          )
          if (targetAccount) {
            useAccountStore.getState().selectAccount(targetAccount.id)
          }
          break
        default:
          // Unknown intent - could show raw text in a note
          console.log('Unknown command:', command.rawText)
      }
    },
    [accounts]
  )

  return (
    <div className="flex flex-col h-full bg-surface-50 dark:bg-surface-900">
      {/* Header with Account Switcher */}
      <div className="flex-shrink-0 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: Account Switcher */}
          <div className="flex items-center gap-4">
            <AccountSwitcher />
            <span className="text-sm text-surface-500">
              {account?.config?.specialInstructions && (
                <span className="italic">{account.config.specialInstructions.slice(0, 50)}...</span>
              )}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateTaskOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              New Task
            </button>
            <button className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors">
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center px-4">
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
              {tab.id === 'reviews' && pendingReviews.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                  {pendingReviews.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'dashboard' && (
          <AgentDashboard
            accountId={accountId}
            userId={userId}
            onCreateTask={() => setIsCreateTaskOpen(true)}
          />
        )}

        {activeTab === 'projects' && <ProjectsPage />}

        {activeTab === 'tasks' && (
          <div className="flex flex-col h-full">
            {/* View Switcher Bar */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
              <span className="text-sm font-medium text-surface-600 dark:text-surface-400">
                {tasks.length} tasks
              </span>
              <ViewSwitcher
                currentView={taskViewMode}
                onViewChange={(view) => setTaskViewMode(view)}
              />
            </div>

            {/* Content based on view mode */}
            <div className="flex-1 overflow-hidden">
              {taskViewMode === 'kanban' && (
                <KanbanView
                  tasks={tasks}
                  agents={agentNameMap}
                  onTaskClick={setSelectedTaskId}
                  onAddTask={() => {
                    setIsCreateTaskOpen(true)
                  }}
                  onStatusChange={(taskId, status) => handleUpdateStatus(taskId, status)}
                />
              )}

              {(taskViewMode === 'list' || taskViewMode === 'agent-tasks') && (
                <div className="flex h-full">
                  {/* Task List */}
                  <div className="w-96 flex-shrink-0 bg-white dark:bg-surface-800 border-r border-surface-200 dark:border-surface-700">
                    <TaskList
                      tasks={tasks}
                      agents={agentNameMap}
                      blockedTasks={blockedTasks}
                      selectedTaskId={selectedTaskId}
                      onSelectTask={setSelectedTaskId}
                      onCreateTask={() => setIsCreateTaskOpen(true)}
                    />
                  </div>

                  {/* Task Detail */}
                  <div className="flex-1">
                    <AnimatePresence mode="wait">
                      {selectedTask ? (
                        <TaskDetail
                          key={selectedTask.id}
                          task={selectedTask}
                          agent={selectedTaskAgent}
                          skill={selectedTaskSkill}
                          allTasks={tasks}
                          accountId={accountId}
                          userId={userId}
                          onClose={() => setSelectedTaskId(null)}
                          onUpdateStatus={handleUpdateStatus}
                          onDelete={() => handleDeleteTask(selectedTask.id)}
                          onEdit={() => setEditingTask(selectedTask)}
                          onDependencyChange={() => fetchTasks(accountId)}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-surface-500">
                          <div className="text-center">
                            <ListTodo size={48} className="mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium">Select a task</p>
                            <p className="text-sm">Choose a task from the list to view details</p>
                          </div>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {taskViewMode === 'graph' && (
                <DependencyGraph
                  tasks={tasks}
                  onTaskClick={setSelectedTaskId}
                />
              )}
            </div>

            {/* Task Detail Sidebar for Kanban View */}
            {taskViewMode === 'kanban' && selectedTask && (
              <div className="fixed inset-y-0 right-0 w-[480px] bg-white dark:bg-surface-800 border-l border-surface-200 dark:border-surface-700 shadow-xl z-40">
                <TaskDetail
                  task={selectedTask}
                  agent={selectedTaskAgent}
                  skill={selectedTaskSkill}
                  allTasks={tasks}
                  accountId={accountId}
                  userId={userId}
                  onClose={() => setSelectedTaskId(null)}
                  onUpdateStatus={handleUpdateStatus}
                  onDelete={() => handleDeleteTask(selectedTask.id)}
                  onEdit={() => setEditingTask(selectedTask)}
                  onDependencyChange={() => fetchTasks(accountId)}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'org-chart' && (
          <div className="h-full overflow-auto bg-white dark:bg-surface-800">
            <OrgChart
              agents={agents}
              currentUserId={userId}
              currentUserName={user?.email?.split('@')[0] || 'You'}
              onAgentClick={(agentId) => {
                const agent = agents.find(a => a.id === agentId)
                if (agent) setSelectedAgent(agent)
              }}
              onAssignTask={(agentId) => {
                setPreselectedAgentId(agentId)
                setIsCreateTaskOpen(true)
              }}
            />
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="h-full overflow-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
                Pending Reviews ({pendingReviews.length})
              </h2>

              {pendingReviews.length === 0 ? (
                <div className="text-center py-12 text-surface-500">
                  <Bell size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No pending reviews</p>
                  <p className="text-sm">All agent work has been reviewed</p>
                </div>
              ) : (
                pendingReviews.map((task) => (
                  <ReviewCard
                    key={task.id}
                    review={{
                      id: `review-${task.id}`,
                      taskId: task.id,
                      agentId: task.assignedTo!,
                      status: 'pending',
                      accountId,
                      createdAt: task.updatedAt,
                      createdBy: task.assignedTo!,
                      createdByType: 'agent',
                      updatedAt: task.updatedAt,
                      updatedBy: task.assignedTo!,
                      updatedByType: 'agent',
                    }}
                    task={task}
                    agent={agents.find((a) => a.id === task.assignedTo)}
                    onClick={() => {
                      setSelectedTaskId(task.id)
                      setActiveTab('tasks')
                    }}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'agents' && <AgentsPage />}

        {activeTab === 'forge' && (
          <div className="h-full overflow-auto p-6">
            <div className="max-w-4xl mx-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <Hammer className="text-orange-500" size={24} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                      Forge
                    </h1>
                    <p className="text-surface-500">
                      Transform PRDs into working code with AI
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsForgeTaskOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Plus size={16} />
                  New Forge Task
                </button>
              </div>

              {/* Forge Tasks */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-surface-700 dark:text-surface-300">
                  Recent Forge Tasks
                </h2>
                {tasks.filter((t) => {
                  const forgeAgent = agents.find((a) => a.agentType === 'forge')
                  return forgeAgent && t.assignedTo === forgeAgent.id
                }).length === 0 ? (
                  <div className="text-center py-12 bg-surface-100 dark:bg-surface-800 rounded-xl border-2 border-dashed border-surface-300 dark:border-surface-600">
                    <Hammer size={48} className="mx-auto mb-4 text-surface-400" />
                    <p className="text-lg font-medium text-surface-600 dark:text-surface-400">
                      No Forge tasks yet
                    </p>
                    <p className="text-sm text-surface-500 mt-1 mb-4">
                      Create a task to start implementing PRDs with AI
                    </p>
                    <button
                      onClick={() => setIsForgeTaskOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
                    >
                      <Plus size={16} />
                      Create Forge Task
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tasks
                      .filter((t) => {
                        const forgeAgent = agents.find((a) => a.agentType === 'forge')
                        return forgeAgent && t.assignedTo === forgeAgent.id
                      })
                      .map((task) => (
                        <div
                          key={task.id}
                          onClick={() => {
                            setSelectedTaskId(task.id)
                            setActiveTab('tasks')
                          }}
                          className="p-4 bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-orange-500 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium text-surface-900 dark:text-surface-100">
                                {task.title}
                              </h3>
                              <p className="text-sm text-surface-500 mt-1">
                                {task.description?.slice(0, 100)}...
                              </p>
                            </div>
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                task.status === 'completed'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                  : task.status === 'in_progress'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : task.status === 'failed'
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                      : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400'
                              }`}
                            >
                              {task.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Getting Started */}
              <div className="mt-8 p-6 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-3">
                  How Forge Works
                </h3>
                <ol className="space-y-2 text-sm text-orange-700 dark:text-orange-400">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                    <span>Write a PRD (Product Requirements Document) describing what you want to build</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                    <span>Point Forge to your repository and configure branch settings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                    <span>Forge uses Claude Code to implement the PRD, running tests along the way</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                    <span>Review the changes and approve the pull request when ready</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'skills' && <SkillsPage />}
      </div>

      {/* Modals */}
      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => {
          setIsCreateTaskOpen(false)
          setPreselectedAgentId(undefined)
          setVoiceTaskTitle('')
        }}
        onSubmit={handleCreateTask}
        agents={agents}
        skills={skills}
        defaultAgentId={preselectedAgentId}
        defaultTitle={voiceTaskTitle}
        currentUserId={userId}
        currentUserName={user?.email?.split('@')[0] || 'Me'}
      />

      {editingTask && (
        <EditTaskModal
          isOpen={true}
          onClose={() => setEditingTask(null)}
          onSubmit={(updates) => handleEditTask(editingTask.id, updates)}
          task={editingTask}
        />
      )}

      {assignAgentTask && (
        <AssignAgentModal
          isOpen={true}
          onClose={() => setAssignAgentTask(null)}
          onAssign={handleAssignAgent}
          task={assignAgentTask}
          agents={agents}
        />
      )}

      {selectedAgent && (
        <AgentDetailModal
          isOpen={true}
          onClose={() => setSelectedAgent(null)}
          agent={selectedAgent}
          onPause={handlePauseAgent}
          onResume={handleResumeAgent}
          onResetHealth={handleResetAgentHealth}
          onAssignTask={(agentId) => {
            setSelectedAgent(null)
            setPreselectedAgentId(agentId)
            setIsCreateTaskOpen(true)
          }}
        />
      )}

      <ForgeTaskModal
        isOpen={isForgeTaskOpen}
        onClose={() => setIsForgeTaskOpen(false)}
        onSubmit={handleCreateForgeTask}
        agents={agents}
        projectId={undefined}
      />

      {/* Voice Command Bar - Fixed at bottom */}
      <div className="flex-shrink-0 bg-white dark:bg-surface-800 border-t border-surface-200 dark:border-surface-700 p-4">
        <VoiceCommandBar
          onCommand={handleVoiceCommand}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          agents={agents.map((a) => ({ id: a.id, alias: a.alias, agentType: a.agentType }))}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        />
      </div>
    </div>
  )
}
