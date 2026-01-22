// Project Card - Displays a project summary

import { FolderKanban, GitBranch, Calendar, CheckCircle2 } from 'lucide-react'
import type { Project } from '@/types/agentpm'

interface ProjectCardProps {
  project: Project
  onClick: () => void
  isSelected?: boolean
}

export function ProjectCard({ project, onClick, isSelected }: ProjectCardProps) {
  const progress = project.stats?.progress || 0
  const completedTasks = project.stats?.completedTasks || 0
  const totalTasks = project.stats?.totalTasks || 0

  const statusColors = {
    active: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    on_hold: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    completed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    cancelled: 'bg-surface-100 dark:bg-surface-700 text-surface-500',
  }

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-300 dark:hover:border-primary-700'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <FolderKanban className="text-primary-600 dark:text-primary-400" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-surface-900 dark:text-surface-100">
              {project.name}
            </h3>
            {project.description && (
              <p className="text-sm text-surface-500 line-clamp-1">
                {project.description}
              </p>
            )}
          </div>
        </div>
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[project.status]}`}>
          {project.status.replace('_', ' ')}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-surface-500">
        <div className="flex items-center gap-1">
          <CheckCircle2 size={14} />
          <span>{completedTasks}/{totalTasks} tasks</span>
        </div>
        {project.repositoryUrl && (
          <div className="flex items-center gap-1">
            <GitBranch size={14} />
            <span>{project.baseBranch}</span>
          </div>
        )}
        {project.targetDate && (
          <div className="flex items-center gap-1">
            <Calendar size={14} />
            <span>{new Date(project.targetDate).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
