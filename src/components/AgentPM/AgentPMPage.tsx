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
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useAgentStore } from '@/stores/agentStore'
import { useTaskStore } from '@/stores/taskStore'
import { useProjectStore } from '@/stores/projectStore'
import { useAccountStore } from '@/stores/accountStore'
import { AgentDashboard } from './Dashboard'
import { TaskList, TaskDetail } from './Tasks'
import { CreateTaskModal, AssignAgentModal, EditTaskModal, AgentDetailModal } from './Modals'
import { ReviewCard } from './Reviews'
import { OrgChart } from './OrgChart'
import { AccountSwitcher } from '@/components/AccountSwitcher'
import { VoiceCommandBar, type ParsedVoiceCommand } from '@/components/Voice'
import type { Task, TaskStatus, AgentPersona } from '@/types/agentpm'

type TabId = 'dashboard' | 'tasks' | 'org-chart' | 'reviews'

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'tasks', label: 'Tasks', icon: <ListTodo size={18} /> },
  { id: 'org-chart', label: 'Org Chart', icon: <GitBranch size={18} /> },
  { id: 'reviews', label: 'Reviews', icon: <Bell size={18} /> },
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

  const { user } = useAuthStore()
  const { accounts, currentAccountId, currentAccount, fetchAccounts } = useAccountStore()
  const { agents, fetchAgents, subscribeToAgents, pauseAgent, resumeAgent, resetAgentHealth } = useAgentStore()
  const { projects, fetchProjects } = useProjectStore()
  const {
    tasks,
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

  // Fetch data on mount and when account changes
  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  useEffect(() => {
    if (accountId) {
      fetchAgents(accountId)
      fetchTasks(accountId)
      fetchProjects(accountId)
    }
  }, [accountId, fetchAgents, fetchTasks, fetchProjects])

  // Subscribe to realtime updates
  useEffect(() => {
    const unsubAgents = subscribeToAgents(accountId)
    const unsubTasks = subscribeToTasks(accountId)

    return () => {
      unsubAgents()
      unsubTasks()
    }
  }, [accountId, subscribeToAgents, subscribeToTasks])

  // Handle task creation
  const handleCreateTask = useCallback(
    async (taskData: {
      title: string
      description?: string
      priority: Task['priority']
      dueAt?: string
      assignedTo?: string
      assignedToType?: 'user' | 'agent'
      projectId?: string
    }) => {
      await createTask({
        ...taskData,
        accountId,
        status: taskData.assignedTo && taskData.assignedToType === 'agent' ? 'queued' : 'pending',
        createdBy: userId,
        createdByType: 'user',
        updatedBy: userId,
        updatedByType: 'user',
      } as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>)
    },
    [accountId, userId, createTask]
  )

  // Handle status update
  const handleUpdateStatus = useCallback(
    async (taskId: string, status: TaskStatus, note?: string) => {
      await updateTaskStatus(taskId, status, userId, note)
    },
    [userId, updateTaskStatus]
  )

  // Handle agent assignment
  const handleAssignAgent = useCallback(
    async (agentId: string) => {
      if (!assignAgentTask) return
      await assignTask(assignAgentTask.id, agentId, 'agent', userId)
      // Also update status to queued if it was pending
      if (assignAgentTask.status === 'pending') {
        await updateTaskStatus(assignAgentTask.id, 'queued', userId, 'Agent assigned')
      }
      setAssignAgentTask(null)
    },
    [assignAgentTask, assignTask, updateTaskStatus, userId]
  )

  // Handle task deletion
  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      await deleteTask(taskId, userId)
      setSelectedTaskId(null)
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

        {activeTab === 'tasks' && (
          <div className="flex h-full">
            {/* Task List */}
            <div className="w-96 flex-shrink-0 bg-white dark:bg-surface-800 border-r border-surface-200 dark:border-surface-700">
              <TaskList
                tasks={tasks}
                agents={agentNameMap}
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
                    onClose={() => setSelectedTaskId(null)}
                    onUpdateStatus={handleUpdateStatus}
                    onDelete={() => handleDeleteTask(selectedTask.id)}
                    onEdit={() => setEditingTask(selectedTask)}
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
        defaultAgentId={preselectedAgentId}
        defaultTitle={voiceTaskTitle}
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
