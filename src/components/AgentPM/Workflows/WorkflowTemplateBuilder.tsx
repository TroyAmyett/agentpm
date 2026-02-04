// Workflow Template Builder — Create/edit workflow templates with step editor

import { useState, useCallback } from 'react'
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Bot,
  UserCheck,
  FileOutput,
  ChevronDown,
  Clock,
} from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useSkillStore } from '@/stores/skillStore'
import type {
  AgentPersona,
  WorkflowTemplate,
  WorkflowStepDef,
  WorkflowStepType,
  GateType,
  MilestoneSchedule,
  ScheduleType,
} from '@/types/agentpm'

interface WorkflowTemplateBuilderProps {
  accountId: string
  userId: string
  agents: AgentPersona[]
  template?: WorkflowTemplate | null
  onClose: () => void
}

const STEP_TYPE_LABELS: Record<WorkflowStepType, string> = {
  agent_task: 'Agent Task',
  human_gate: 'Human Gate',
  document_output: 'Document Output',
}

const STEP_TYPE_ICONS: Record<WorkflowStepType, React.ReactNode> = {
  agent_task: <Bot size={14} />,
  human_gate: <UserCheck size={14} />,
  document_output: <FileOutput size={14} />,
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function WorkflowTemplateBuilder({
  accountId,
  userId,
  agents,
  template,
  onClose,
}: WorkflowTemplateBuilderProps) {
  const { createTemplate, updateTemplate } = useWorkflowStore()
  const { skills } = useSkillStore()
  const isEditing = !!template

  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [icon, setIcon] = useState(template?.icon || '')
  const [steps, setSteps] = useState<WorkflowStepDef[]>(
    template?.steps || [],
  )
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    template?.schedule?.type || 'none',
  )
  const [scheduleHour, setScheduleHour] = useState(template?.schedule?.hour ?? 9)
  const [scheduleDow, setScheduleDow] = useState(template?.schedule?.dayOfWeek ?? 0)
  const [scheduleDom, setScheduleDom] = useState(template?.schedule?.dayOfMonth ?? 1)
  const [saving, setSaving] = useState(false)

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: '',
        description: '',
        type: 'agent_task',
      },
    ])
  }, [])

  const updateStep = useCallback((index: number, updates: Partial<WorkflowStepDef>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s)),
    )
  }, [])

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const moveStep = useCallback((from: number, to: number) => {
    setSteps((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return
    setSaving(true)

    const schedule: MilestoneSchedule | undefined =
      scheduleType !== 'none'
        ? {
            type: scheduleType,
            hour: scheduleHour,
            dayOfWeek: scheduleType === 'weekly' ? scheduleDow : undefined,
            dayOfMonth: scheduleType === 'monthly' ? scheduleDom : undefined,
          }
        : undefined

    try {
      if (isEditing && template) {
        await updateTemplate(template.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          icon: icon.trim() || undefined,
          steps,
          schedule,
          isScheduleActive: !!schedule,
        })
      } else {
        await createTemplate({
          accountId,
          name: name.trim(),
          description: description.trim() || undefined,
          icon: icon.trim() || undefined,
          steps,
          schedule,
          isScheduleActive: !!schedule,
          createdBy: userId,
          createdByType: 'user',
        })
      }
      onClose()
    } catch (err) {
      console.error('Failed to save workflow template:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Workflows
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || steps.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-surface-300 dark:disabled:bg-surface-700 text-white text-sm font-medium transition-colors"
          >
            <Save size={16} />
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Workflow'}
          </button>
        </div>

        {/* Basic Info */}
        <div className="space-y-4 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Icon</label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="⚡"
                className="w-12 h-10 text-center text-lg rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weekly Blog Pipeline"
                className="w-full h-10 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Automated blog content pipeline with human review"
              className="w-full h-10 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
        </div>

        {/* Schedule */}
        <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-surface-500" />
            <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100">Schedule</h4>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
              className="h-9 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none"
            >
              <option value="none">No schedule</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="once">One-time</option>
            </select>

            {scheduleType !== 'none' && (
              <>
                {scheduleType === 'weekly' && (
                  <select
                    value={scheduleDow}
                    onChange={(e) => setScheduleDow(Number(e.target.value))}
                    className="h-9 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none"
                  >
                    {DAY_NAMES.map((day, i) => (
                      <option key={i} value={i}>{day}</option>
                    ))}
                  </select>
                )}

                {scheduleType === 'monthly' && (
                  <select
                    value={scheduleDom}
                    onChange={(e) => setScheduleDom(Number(e.target.value))}
                    className="h-9 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none"
                  >
                    {Array.from({ length: 28 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>Day {i + 1}</option>
                    ))}
                  </select>
                )}

                <select
                  value={scheduleHour}
                  onChange={(e) => setScheduleHour(Number(e.target.value))}
                  className="h-9 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {`${i % 12 || 12}:00 ${i < 12 ? 'AM' : 'PM'}`}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider">
            Steps ({steps.length})
          </h4>

          {steps.map((step, index) => (
            <StepEditor
              key={step.id}
              step={step}
              index={index}
              agents={agents}
              skills={skills}
              previousSteps={steps.slice(0, index)}
              onUpdate={(updates) => updateStep(index, updates)}
              onRemove={() => removeStep(index)}
              onMoveUp={index > 0 ? () => moveStep(index, index - 1) : undefined}
              onMoveDown={index < steps.length - 1 ? () => moveStep(index, index + 1) : undefined}
            />
          ))}

          <button
            onClick={addStep}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-200 dark:border-surface-700 hover:border-primary-400 dark:hover:border-primary-600 text-surface-500 hover:text-primary-600 dark:hover:text-primary-400 text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add Step
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step Editor ────────────────────────────────────────────────────────────

function StepEditor({
  step,
  index,
  agents,
  skills,
  previousSteps,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: WorkflowStepDef
  index: number
  agents: AgentPersona[]
  skills: Array<{ id: string; name: string; category?: string }>
  previousSteps: WorkflowStepDef[]
  onUpdate: (updates: Partial<WorkflowStepDef>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const [expanded, setExpanded] = useState(true)

  const stepTypeColors: Record<WorkflowStepType, string> = {
    agent_task: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    human_gate: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    document_output: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  }

  return (
    <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden">
      {/* Step Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-50 dark:bg-surface-800/50">
        <div className="flex flex-col gap-0.5 text-surface-300 dark:text-surface-600">
          {onMoveUp && (
            <button onClick={onMoveUp} className="hover:text-surface-500 transition-colors">
              <ChevronDown size={12} className="rotate-180" />
            </button>
          )}
          {onMoveDown && (
            <button onClick={onMoveDown} className="hover:text-surface-500 transition-colors">
              <ChevronDown size={12} />
            </button>
          )}
        </div>

        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-xs font-bold text-surface-600 dark:text-surface-400">
          {index + 1}
        </span>

        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${stepTypeColors[step.type]}`}>
          {STEP_TYPE_ICONS[step.type]}
          {STEP_TYPE_LABELS[step.type]}
        </span>

        <span className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate flex-1">
          {step.title || '(untitled step)'}
        </span>

        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 hover:bg-surface-200 dark:hover:bg-surface-700 rounded transition-colors"
        >
          <ChevronDown size={14} className={`text-surface-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        <button
          onClick={onRemove}
          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-surface-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Step Body */}
      {expanded && (
        <div className="p-3 space-y-3">
          {/* Step Type */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-32">
              <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Type</label>
              <select
                value={step.type}
                onChange={(e) => onUpdate({ type: e.target.value as WorkflowStepType })}
                className="w-full h-9 px-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm outline-none"
              >
                <option value="agent_task">Agent Task</option>
                <option value="human_gate">Human Gate</option>
                <option value="document_output">Document Output</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Title</label>
              <input
                value={step.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                placeholder="Step title"
                className="w-full h-9 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Description</label>
            <textarea
              value={step.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="What this step does..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none resize-none"
            />
          </div>

          {/* Agent Task Fields */}
          {step.type === 'agent_task' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Agent</label>
                <select
                  value={step.agentId || ''}
                  onChange={(e) => onUpdate({ agentId: e.target.value || undefined })}
                  className="w-full h-9 px-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm outline-none"
                >
                  <option value="">Auto-assign</option>
                  {agents
                    .filter((a) => !a.deletedAt)
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.alias} ({a.agentType})</option>
                    ))
                  }
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Skill</label>
                <select
                  value={step.skillId || ''}
                  onChange={(e) => onUpdate({ skillId: e.target.value || undefined })}
                  className="w-full h-9 px-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm outline-none"
                >
                  <option value="">None</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Agent Task Prompt */}
          {step.type === 'agent_task' && (
            <div>
              <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Prompt (instructions for agent)</label>
              <textarea
                value={step.prompt || ''}
                onChange={(e) => onUpdate({ prompt: e.target.value || undefined })}
                placeholder="Review the latest SEO/AEO trends and generate 5-10 blog post titles..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none resize-none"
              />
            </div>
          )}

          {/* Human Gate Fields */}
          {step.type === 'human_gate' && (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Gate Type</label>
                  <select
                    value={step.gateType || 'approve'}
                    onChange={(e) => onUpdate({ gateType: e.target.value as GateType })}
                    className="w-full h-9 px-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm outline-none"
                  >
                    <option value="approve">Approve / Reject</option>
                    <option value="select">Select Options</option>
                    <option value="input">Free Text Input</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Prompt (shown to human)</label>
                <input
                  value={step.gatePrompt || ''}
                  onChange={(e) => onUpdate({ gatePrompt: e.target.value || undefined })}
                  placeholder="Select the blog titles you want to develop..."
                  className="w-full h-9 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none"
                />
              </div>
              {step.gateType === 'select' && (
                <div>
                  <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">
                    Options (one per line, or leave empty to use previous step output)
                  </label>
                  <textarea
                    value={(step.gateOptions || []).join('\n')}
                    onChange={(e) =>
                      onUpdate({
                        gateOptions: e.target.value
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Option 1\nOption 2\nOption 3"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none resize-none font-mono"
                  />
                </div>
              )}
            </>
          )}

          {/* Document Output Fields */}
          {step.type === 'document_output' && (
            <div>
              <label className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-1">Document Title</label>
              <input
                value={step.documentTitle || ''}
                onChange={(e) => onUpdate({ documentTitle: e.target.value || undefined })}
                placeholder="SEO Strategy — February 2025"
                className="w-full h-9 px-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none"
              />
            </div>
          )}

          {/* Input Mapping (for steps after the first) */}
          {index > 0 && step.type === 'agent_task' && previousSteps.length > 0 && (
            <div className="pt-2 border-t border-surface-100 dark:border-surface-700">
              <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider mb-1">
                Input from previous steps
              </p>
              <p className="text-xs text-surface-500 dark:text-surface-400">
                This step will automatically receive output from the previous step.
                {previousSteps.some((s) => s.type === 'human_gate') &&
                  ' Gate responses (selections, approvals) are passed forward.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
