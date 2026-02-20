// Orchestrator Settings — Trust levels, hard limits, model strategy, behavior flags
// Phase 1B: Account owner can configure Atlas orchestrator

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Workflow,
  Shield,
  Gauge,
  Brain,
  Settings2,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Activity,
  RefreshCw,
} from 'lucide-react'
import { useOrchestratorStore } from '@/stores/orchestratorStore'
import { useAccountStore } from '@/stores/accountStore'
import type { OrchestratorConfig, GuardrailCategory } from '@/types/agentpm'

type SubTab = 'trust' | 'limits' | 'models' | 'behavior' | 'audit'

const SUB_TABS: Array<{ id: SubTab; label: string; icon: typeof Shield }> = [
  { id: 'trust', label: 'Trust Levels', icon: Shield },
  { id: 'limits', label: 'Hard Limits', icon: Gauge },
  { id: 'models', label: 'Models', icon: Brain },
  { id: 'behavior', label: 'Behavior', icon: Settings2 },
  { id: 'audit', label: 'Audit Log', icon: Activity },
]

// Trust level labels and colors
const TRUST_LEVELS = [
  { level: 0, label: 'Supervised', color: '#ef4444', description: 'All actions require human approval' },
  { level: 1, label: 'Guided', color: '#f59e0b', description: 'Low-risk actions auto-approved' },
  { level: 2, label: 'Trusted', color: '#22c55e', description: 'Most actions auto-approved' },
  { level: 3, label: 'Autonomous', color: '#0ea5e9', description: 'Full autonomy (use with caution)' },
]

const TRUST_CATEGORIES: Array<{ key: GuardrailCategory; label: string; description: string; configKey: keyof OrchestratorConfig }> = [
  { key: 'task_execution', label: 'Task Execution', description: 'Creating, assigning, and completing tasks', configKey: 'trustTaskExecution' },
  { key: 'decomposition', label: 'Decomposition', description: 'Breaking tasks into subtasks', configKey: 'trustDecomposition' },
  { key: 'skill_creation', label: 'Skill Creation', description: 'Creating new reusable skills', configKey: 'trustSkillCreation' },
  { key: 'tool_usage', label: 'Tool Usage', description: 'Using tools and integrations', configKey: 'trustToolUsage' },
  { key: 'content_publishing', label: 'Content Publishing', description: 'Publishing blog posts, landing pages', configKey: 'trustContentPublishing' },
  { key: 'external_actions', label: 'External Actions', description: 'Executing on external runtimes (OpenClaw)', configKey: 'trustExternalActions' },
  { key: 'spending', label: 'Spending', description: 'Actions that cost money (API calls, ads)', configKey: 'trustSpending' },
  { key: 'agent_creation', label: 'Agent Creation', description: 'Creating new agent personas', configKey: 'trustAgentCreation' },
]

export function OrchestratorSettings() {
  const [subTab, setSubTab] = useState<SubTab>('trust')
  const { currentAccountId } = useAccountStore()
  const {
    config,
    loading,
    error,
    auditLog,
    auditLogTotal,
    auditLoading,
    fetchConfig,
    updateConfig,
    fetchAuditLog,
    clearError,
  } = useOrchestratorStore()

  useEffect(() => {
    if (currentAccountId) {
      fetchConfig(currentAccountId)
    }
  }, [currentAccountId, fetchConfig])

  useEffect(() => {
    if (currentAccountId && subTab === 'audit') {
      fetchAuditLog(currentAccountId)
    }
  }, [currentAccountId, subTab, fetchAuditLog])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw size={20} className="animate-spin" style={{ color: '#0ea5e9' }} />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--fl-color-text-primary)' }}>
            <Workflow size={20} style={{ color: '#0ea5e9' }} />
            Orchestrator
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-secondary)' }}>
            No orchestrator configuration found for this account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--fl-color-text-primary)' }}>
          <Workflow size={20} style={{ color: '#0ea5e9' }} />
          Orchestrator
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-secondary)' }}>
          Configure Atlas trust levels, hard limits, and behavior.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
        >
          <AlertTriangle size={16} />
          {error}
          <button onClick={clearError} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: subTab === tab.id ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
              color: subTab === tab.id ? '#0ea5e9' : 'var(--fl-color-text-secondary)',
            }}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={subTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {subTab === 'trust' && (
            <TrustLevelsPanel config={config} onUpdate={updateConfig} />
          )}
          {subTab === 'limits' && (
            <HardLimitsPanel config={config} onUpdate={updateConfig} />
          )}
          {subTab === 'models' && (
            <ModelStrategyPanel config={config} onUpdate={updateConfig} />
          )}
          {subTab === 'behavior' && (
            <BehaviorPanel config={config} onUpdate={updateConfig} />
          )}
          {subTab === 'audit' && (
            <AuditLogPanel
              entries={auditLog}
              total={auditLogTotal}
              loading={auditLoading}
              onRefresh={() => currentAccountId && fetchAuditLog(currentAccountId)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// TRUST LEVELS PANEL
// ============================================================================

function TrustLevelsPanel({
  config,
  onUpdate,
}: {
  config: OrchestratorConfig
  onUpdate: (updates: Partial<OrchestratorConfig>) => Promise<void>
}) {
  const [confirmRaise, setConfirmRaise] = useState<{ category: string; level: number } | null>(null)

  const handleTrustChange = (configKey: keyof OrchestratorConfig, currentLevel: number, newLevel: number, categoryLabel: string) => {
    // Require confirmation when raising trust levels
    if (newLevel > currentLevel) {
      setConfirmRaise({ category: categoryLabel, level: newLevel })
      // Apply after a brief confirmation display
      setTimeout(() => setConfirmRaise(null), 2000)
    }
    onUpdate({ [configKey]: newLevel })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
        Set how much autonomy Atlas has in each category. Level 0 requires human approval for everything.
      </p>

      {/* Confirmation toast */}
      {confirmRaise && (
        <div
          className="flex items-center gap-2 p-2 rounded-lg text-xs"
          style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}
        >
          <AlertTriangle size={14} />
          Trust raised for {confirmRaise.category} to level {confirmRaise.level}
        </div>
      )}

      {TRUST_CATEGORIES.map(cat => {
        const currentLevel = (config[cat.configKey] as number) || 0
        return (
          <div
            key={cat.key}
            className="p-4 rounded-xl"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                  {cat.label}
                </p>
                <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                  {cat.description}
                </p>
              </div>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: `${TRUST_LEVELS[currentLevel].color}20`,
                  color: TRUST_LEVELS[currentLevel].color,
                }}
              >
                {TRUST_LEVELS[currentLevel].label}
              </span>
            </div>
            <div className="flex gap-1">
              {TRUST_LEVELS.map(tl => (
                <button
                  key={tl.level}
                  onClick={() => handleTrustChange(cat.configKey, currentLevel, tl.level, cat.label)}
                  className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: currentLevel === tl.level ? `${tl.color}25` : 'rgba(255,255,255,0.03)',
                    color: currentLevel === tl.level ? tl.color : 'var(--fl-color-text-muted)',
                    border: currentLevel === tl.level ? `1px solid ${tl.color}40` : '1px solid transparent',
                  }}
                  title={tl.description}
                >
                  {tl.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// HARD LIMITS PANEL
// ============================================================================

function HardLimitsPanel({
  config,
  onUpdate,
}: {
  config: OrchestratorConfig
  onUpdate: (updates: Partial<OrchestratorConfig>) => Promise<void>
}) {
  const [saved, setSaved] = useState<string | null>(null)

  const handleSave = (key: keyof OrchestratorConfig, value: number) => {
    onUpdate({ [key]: value })
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  const limits: Array<{ key: keyof OrchestratorConfig; label: string; description: string; min: number; max: number }> = [
    { key: 'maxSubtasksPerParent', label: 'Max Subtasks per Parent', description: 'Maximum number of subtasks a single parent task can have', min: 1, max: 50 },
    { key: 'maxTotalActiveTasks', label: 'Max Active Tasks', description: 'Maximum total tasks in queued/in_progress/review across the account', min: 1, max: 200 },
    { key: 'maxCostPerTaskCents', label: 'Max Cost per Task (cents)', description: 'Maximum API cost for a single task execution', min: 1, max: 10000 },
    { key: 'maxConcurrentAgents', label: 'Max Concurrent Agents', description: 'Maximum agents executing simultaneously', min: 1, max: 20 },
    { key: 'maxRetriesPerSubtask', label: 'Max Retries per Subtask', description: 'Number of retry attempts before marking a subtask as failed', min: 0, max: 10 },
    { key: 'monthlySpendBudgetCents', label: 'Monthly Budget (cents)', description: 'Monthly spending cap. 0 = no auto-spend', min: 0, max: 1000000 },
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
        Hard ceilings that cannot be overridden by the orchestrator. These are safety guardrails.
      </p>

      {limits.map(limit => {
        const currentValue = (config[limit.key] as number) || 0
        return (
          <div
            key={limit.key}
            className="p-4 rounded-xl"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                {limit.label}
              </p>
              {saved === limit.key && (
                <span className="flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
                  <Check size={12} /> Saved
                </span>
              )}
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--fl-color-text-muted)' }}>
              {limit.description}
            </p>
            <input
              type="number"
              defaultValue={currentValue}
              min={limit.min}
              max={limit.max}
              onBlur={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= limit.min && val <= limit.max && val !== currentValue) {
                  handleSave(limit.key, val)
                }
              }}
              className="w-32 px-3 py-1.5 rounded-lg text-sm"
              style={{
                background: '#1e293b',
                border: '1px solid var(--fl-color-border)',
                color: 'var(--fl-color-text-primary)',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// MODEL STRATEGY PANEL
// ============================================================================

const MODEL_OPTIONS = ['haiku', 'sonnet', 'opus']

function ModelStrategyPanel({
  config,
  onUpdate,
}: {
  config: OrchestratorConfig
  onUpdate: (updates: Partial<OrchestratorConfig>) => Promise<void>
}) {
  const [saved, setSaved] = useState<string | null>(null)

  const models: Array<{ key: keyof OrchestratorConfig; label: string; description: string }> = [
    { key: 'modelTriage', label: 'Triage', description: 'Initial task classification (~$0.001/task)' },
    { key: 'modelDecomposition', label: 'Decomposition', description: 'Breaking tasks into subtasks' },
    { key: 'modelReview', label: 'Review', description: 'Evaluating completed work' },
    { key: 'modelPostMortem', label: 'Post-Mortem', description: 'Analyzing execution outcomes' },
    { key: 'modelSkillGeneration', label: 'Skill Generation', description: 'Creating new reusable skills' },
  ]

  const handleModelChange = (key: keyof OrchestratorConfig, value: string) => {
    onUpdate({ [key]: value })
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
        Choose which LLM model to use for each cognitive task. Haiku is cheapest, Opus is most capable.
      </p>

      {models.map(model => {
        const currentValue = (config[model.key] as string) || 'sonnet'
        return (
          <div
            key={model.key}
            className="p-4 rounded-xl"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
          >
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                  {model.label}
                </p>
                <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                  {model.description}
                </p>
              </div>
              {saved === model.key && (
                <span className="flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
                  <Check size={12} /> Saved
                </span>
              )}
            </div>
            <div className="flex gap-1 mt-2">
              {MODEL_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => handleModelChange(model.key, opt)}
                  className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all capitalize"
                  style={{
                    background: currentValue === opt ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255,255,255,0.03)',
                    color: currentValue === opt ? '#0ea5e9' : 'var(--fl-color-text-muted)',
                    border: currentValue === opt ? '1px solid rgba(14, 165, 233, 0.3)' : '1px solid transparent',
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// BEHAVIOR PANEL
// ============================================================================

function BehaviorPanel({
  config,
  onUpdate,
}: {
  config: OrchestratorConfig
  onUpdate: (updates: Partial<OrchestratorConfig>) => Promise<void>
}) {
  const toggles: Array<{ key: keyof OrchestratorConfig; label: string; description: string }> = [
    { key: 'dryRunDefault', label: 'Dry Run by Default', description: 'Always preview plans before executing' },
    { key: 'autoRouteRootTasks', label: 'Auto-Route Root Tasks', description: 'Automatically assign unassigned tasks to Atlas' },
    { key: 'autoRetryOnFailure', label: 'Auto-Retry on Failure', description: 'Automatically retry failed subtasks' },
    { key: 'notifyOnCompletion', label: 'Notify on Completion', description: 'Send notification when orchestrated tasks complete' },
    { key: 'postMortemEnabled', label: 'Post-Mortem Enabled', description: 'Run post-mortem analysis after task completion' },
    { key: 'postMortemParentOnly', label: 'Post-Mortem Parent Only', description: 'Only run post-mortem on parent tasks, not subtasks' },
    { key: 'autoDecompose', label: 'Auto-Decompose', description: 'Automatically break down complex tasks without approval' },
  ]

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
        Control Atlas behavior. Toggle switches take effect immediately.
      </p>

      {toggles.map(toggle => {
        const isOn = !!(config[toggle.key] as boolean)
        return (
          <div
            key={toggle.key}
            className="flex items-center justify-between p-4 rounded-xl"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                {toggle.label}
              </p>
              <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                {toggle.description}
              </p>
            </div>
            <button
              onClick={() => onUpdate({ [toggle.key]: !isOn })}
              className="relative w-10 h-5 rounded-full transition-colors"
              style={{
                background: isOn ? '#0ea5e9' : 'rgba(255, 255, 255, 0.1)',
              }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ left: isOn ? '22px' : '2px' }}
              />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// AUDIT LOG PANEL
// ============================================================================

function AuditLogPanel({
  entries,
  total,
  loading,
  onRefresh,
}: {
  entries: import('@/types/agentpm').GuardrailAuditEntry[]
  total: number
  loading: boolean
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const decisionColors: Record<string, string> = {
    approved: '#22c55e',
    denied: '#ef4444',
    escalated: '#f59e0b',
    exception: '#8b5cf6',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
          {total} guardrail decisions recorded
        </p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
          style={{ color: '#0ea5e9' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--fl-color-text-muted)' }}>
          No guardrail decisions yet. They will appear here as Atlas processes tasks.
        </p>
      ) : (
        <div className="space-y-1">
          {entries.map(entry => (
            <div
              key={entry.id}
              className="rounded-lg overflow-hidden"
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--fl-color-border)' }}
            >
              <button
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                className="w-full flex items-center gap-2 p-3 text-left"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: decisionColors[entry.decision] || '#6b7280' }}
                />
                <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--fl-color-text-primary)' }}>
                  {entry.action}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                  background: `${decisionColors[entry.decision]}20`,
                  color: decisionColors[entry.decision],
                }}>
                  {entry.decision}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--fl-color-text-muted)' }}>
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
                {expanded === entry.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>

              <AnimatePresence>
                {expanded === entry.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-1 text-xs" style={{ color: 'var(--fl-color-text-secondary)', borderTop: '1px solid var(--fl-color-border)' }}>
                      <div className="pt-2">
                        <span style={{ color: 'var(--fl-color-text-muted)' }}>Category:</span> {entry.category}
                      </div>
                      <div>
                        <span style={{ color: 'var(--fl-color-text-muted)' }}>Trust Required:</span> {entry.trustLevelRequired} | <span style={{ color: 'var(--fl-color-text-muted)' }}>Current:</span> {entry.trustLevelCurrent}
                      </div>
                      <div>
                        <span style={{ color: 'var(--fl-color-text-muted)' }}>Decided by:</span> {entry.decidedBy}
                      </div>
                      {entry.rationale && (
                        <div>
                          <span style={{ color: 'var(--fl-color-text-muted)' }}>Rationale:</span> {entry.rationale}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
