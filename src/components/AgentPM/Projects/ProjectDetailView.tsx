// Project Detail View - Shows project details, tasks, milestones, knowledge

import { useState } from 'react'
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
} from 'lucide-react'
import type { Project } from '@/types/agentpm'
import { useTimezoneFunctions } from '@/lib/timezone'

type TabId = 'overview' | 'tasks' | 'milestones' | 'knowledge' | 'settings'

interface ProjectDetailViewProps {
  project: Project
  onBack: () => void
}

export function ProjectDetailView({ project, onBack }: ProjectDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const { formatDate } = useTimezoneFunctions()

  const progress = project.stats?.progress || 0
  const completedTasks = project.stats?.completedTasks || 0
  const totalTasks = project.stats?.totalTasks || 0

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: <FolderKanban size={16} /> },
    { id: 'tasks' as const, label: 'Tasks', icon: <ListTodo size={16} /> },
    { id: 'milestones' as const, label: 'Milestones', icon: <Target size={16} /> },
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Tasks
              </h2>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus size={14} />
                Add Task
              </button>
            </div>
            <div className="text-center py-16 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
              <ListTodo size={48} className="mx-auto mb-4 text-surface-300 dark:text-surface-600" />
              <p className="text-surface-500">No tasks in this project yet</p>
              <p className="text-sm text-surface-400 mt-1">
                Create tasks or extract them from PRD notes
              </p>
            </div>
          </div>
        )}

        {activeTab === 'milestones' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Milestones
              </h2>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus size={14} />
                Add Milestone
              </button>
            </div>
            <div className="text-center py-16 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
              <Target size={48} className="mx-auto mb-4 text-surface-300 dark:text-surface-600" />
              <p className="text-surface-500">No milestones defined yet</p>
              <p className="text-sm text-surface-400 mt-1">
                Create milestones to organize tasks into phases
              </p>
            </div>
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Project Knowledge
              </h2>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus size={14} />
                Add Knowledge
              </button>
            </div>
            <div className="text-center py-16 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
              <BookOpen size={48} className="mx-auto mb-4 text-surface-300 dark:text-surface-600" />
              <p className="text-surface-500">No knowledge entries yet</p>
              <p className="text-sm text-surface-400 mt-1">
                Add facts, decisions, and context that AI agents can use
              </p>
            </div>
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
                  defaultValue={project.name}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Description
                </label>
                <textarea
                  defaultValue={project.description}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Status
                </label>
                <select
                  defaultValue={project.status}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
                <button className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
