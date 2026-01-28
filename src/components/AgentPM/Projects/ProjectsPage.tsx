// Projects Page - List and manage Project Spaces

import { useState, useEffect, useCallback } from 'react'
import { Plus, FolderKanban, Search, Filter } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useAccountStore } from '@/stores/accountStore'
import { useAuthStore } from '@/stores/authStore'
import { useTaskStore } from '@/stores/taskStore'
import { useAgentStore } from '@/stores/agentStore'
import { useSkillStore } from '@/stores/skillStore'
import { ProjectCard } from './ProjectCard'
import { CreateProjectModal } from './CreateProjectModal'
import { ProjectDetailView } from './ProjectDetailView'
import { TaskDetail } from '../Tasks/TaskDetail'
import type { Project, TaskPriority } from '@/types/agentpm'

export function ProjectsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<Project['status'] | 'all'>('all')

  const { user } = useAuthStore()
  const { currentAccountId } = useAccountStore()
  const { projects, fetchProjects, createProject } = useProjectStore()
  const { tasks, updateTaskStatus, deleteTask } = useTaskStore()
  const { agents } = useAgentStore()
  const { skills } = useSkillStore()

  const userId = user?.id || 'demo-user'
  const accountId = currentAccountId || 'demo-account-id'

  // Fetch projects on mount
  useEffect(() => {
    if (accountId) {
      fetchProjects(accountId)
    }
  }, [accountId, fetchProjects])

  // Handle project creation
  const handleCreateProject = useCallback(
    async (projectData: {
      name: string
      description?: string
      repositoryUrl?: string
      repositoryPath?: string
      baseBranch: string
      testCommand?: string
      buildCommand?: string
      defaultPriority: TaskPriority
      startDate?: string
      targetDate?: string
    }) => {
      await createProject({
        ...projectData,
        accountId,
        status: 'active',
        createdBy: userId,
        createdByType: 'user',
        updatedBy: userId,
        updatedByType: 'user',
      })
    },
    [accountId, userId, createProject]
  )

  // Filter projects
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      !searchQuery ||
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === 'all' || project.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const selectedProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)
    : null

  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId)
    : null

  // If a project is selected, show detail view (with optional task panel)
  if (selectedProject) {
    return (
      <div className="h-full flex">
        <div className={`flex-1 ${selectedTask ? 'w-1/2' : 'w-full'} transition-all`}>
          <ProjectDetailView
            project={selectedProject}
            onBack={() => {
              setSelectedProjectId(null)
              setSelectedTaskId(null)
            }}
            onSelectTask={(taskId) => setSelectedTaskId(taskId)}
          />
        </div>
        {selectedTask && (
          <div className="w-1/2 border-l border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-auto">
            <TaskDetail
              task={selectedTask}
              agent={selectedTask.assignedTo ? agents.find(a => a.id === selectedTask.assignedTo) : undefined}
              skill={selectedTask.skillId ? skills.find(s => s.id === selectedTask.skillId) : undefined}
              allTasks={tasks}
              accountId={accountId}
              userId={userId}
              onClose={() => setSelectedTaskId(null)}
              onUpdateStatus={async (taskId, status, note) => {
                await updateTaskStatus(taskId, status, userId, note)
              }}
              onDelete={async (taskId) => {
                if (window.confirm('Are you sure you want to delete this task?')) {
                  await deleteTask(taskId, userId)
                  setSelectedTaskId(null)
                }
              }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <FolderKanban className="text-primary-600 dark:text-primary-400" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                Projects
              </h1>
              <p className="text-surface-500">
                Manage your project spaces, tasks, and knowledge
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            New Project
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-surface-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Project['status'] | 'all')}
              className="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16">
            <FolderKanban size={64} className="mx-auto mb-4 text-surface-300 dark:text-surface-600" />
            <h3 className="text-lg font-medium text-surface-900 dark:text-surface-100 mb-2">
              {searchQuery || statusFilter !== 'all' ? 'No projects found' : 'No projects yet'}
            </h3>
            <p className="text-surface-500 mb-6 max-w-md mx-auto">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first project to organize tasks, track progress, and manage knowledge'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
              >
                <Plus size={16} />
                Create Your First Project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => setSelectedProjectId(project.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <CreateProjectModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateProject}
      />
    </div>
  )
}
