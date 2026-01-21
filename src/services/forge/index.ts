// Forge Service - Developer Agent for PRD Execution
// Uses Claude Code CLI to transform PRDs into working code

import type {
  ForgeTaskInput,
  ForgeTaskOutput,
  ForgeSession,
  ForgeExecutionStatus,
  ForgeCommit,
  ForgeFileChange,
  ForgeActionType,
  AgentAction,
} from '@/types/agentpm'
import { supabase } from '@/services/supabase/client'
import * as db from '@/services/agentpm/database'

// =============================================================================
// FORGE SESSION MANAGEMENT
// =============================================================================

/**
 * Create a new Forge session for PRD execution
 */
export async function createForgeSession(
  taskId: string,
  agentId: string,
  accountId: string,
  input: ForgeTaskInput,
  userId: string
): Promise<ForgeSession> {
  const session: ForgeSession = {
    id: crypto.randomUUID(),
    taskId,
    agentId,
    accountId,
    input,
    status: 'initializing',
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    createdBy: userId,
    createdByType: 'user',
  }

  // Store session in database
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }
  const { error } = await supabase
    .from('forge_sessions')
    .insert(forgeSessionToDb(session))

  if (error) {
    console.error('Failed to create forge session:', error)
    throw new Error(`Failed to create forge session: ${error.message}`)
  }

  return session
}

/**
 * Update Forge session status and progress
 */
export async function updateForgeSession(
  sessionId: string,
  updates: Partial<Pick<ForgeSession, 'status' | 'currentStep' | 'progress' | 'output' | 'error' | 'errorStep' | 'completedAt' | 'claudeCodeSessionId'>>
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }
  const { error } = await supabase
    .from('forge_sessions')
    .update({
      ...forgeSessionUpdatesToDb(updates),
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (error) {
    console.error('Failed to update forge session:', error)
    throw new Error(`Failed to update forge session: ${error.message}`)
  }
}

/**
 * Get Forge session by ID
 */
export async function getForgeSession(sessionId: string): Promise<ForgeSession | null> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }
  const { data, error } = await supabase
    .from('forge_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to get forge session: ${error.message}`)
  }

  return forgeSessionFromDb(data)
}

/**
 * Get active Forge session for a task
 */
export async function getActiveSessionForTask(taskId: string): Promise<ForgeSession | null> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }
  const { data, error } = await supabase
    .from('forge_sessions')
    .select('*')
    .eq('task_id', taskId)
    .not('status', 'in', '("completed","failed")')
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to get active session: ${error.message}`)
  }

  return forgeSessionFromDb(data)
}

// =============================================================================
// FORGE ACTION LOGGING
// =============================================================================

/**
 * Log a Forge action for audit trail
 */
export async function logForgeAction(
  agentId: string,
  taskId: string,
  actionType: ForgeActionType,
  action: string,
  details: {
    target?: string
    reasoning?: string
    result?: unknown
    error?: string
    executionTimeMs?: number
    tokensUsed?: number
    cost?: number
  }
): Promise<void> {
  const agentAction: Omit<AgentAction, 'id' | 'createdAt' | 'updatedAt'> = {
    agentId,
    taskId,
    action,
    actionType,
    target: details.target,
    status: details.error ? 'failed' : 'success',
    result: details.result,
    error: details.error,
    reasoning: details.reasoning,
    executionTimeMs: details.executionTimeMs,
    tokensUsed: details.tokensUsed,
    cost: details.cost,
    accountId: '', // Will be filled by database
    createdBy: agentId,
    createdByType: 'agent',
    updatedBy: agentId,
    updatedByType: 'agent',
  }

  await db.createAgentAction(agentAction as Parameters<typeof db.createAgentAction>[0])
}

// =============================================================================
// PRD EXECUTION
// =============================================================================

/**
 * Execute a PRD using Claude Code CLI
 * This is the main entry point for Forge agent execution
 */
export async function executePrd(
  session: ForgeSession,
  onProgress?: (status: ForgeExecutionStatus, step: string, progress: number) => void
): Promise<ForgeTaskOutput> {
  const { input } = session
  const startTime = Date.now()

  try {
    // Update status: analyzing
    await updateForgeSession(session.id, {
      status: 'analyzing',
      currentStep: 'Analyzing PRD requirements',
      progress: 10,
    })
    onProgress?.('analyzing', 'Analyzing PRD requirements', 10)

    // Generate branch name if not provided
    const branchName = input.targetBranch || generateBranchName(input.prdContent)

    // Initialize output
    const output: ForgeTaskOutput = {
      branchName,
      commits: [],
      filesChanged: [],
      summary: '',
    }

    // Update status: implementing
    await updateForgeSession(session.id, {
      status: 'implementing',
      currentStep: 'Implementing changes with Claude Code',
      progress: 30,
      output,
    })
    onProgress?.('implementing', 'Implementing changes with Claude Code', 30)

    // Execute Claude Code CLI
    // This will be the actual integration point
    const claudeCodeResult = await executeClaudeCode(session, branchName)

    // Update output with results
    output.commits = claudeCodeResult.commits
    output.filesChanged = claudeCodeResult.filesChanged
    output.totalTokensUsed = claudeCodeResult.tokensUsed
    output.totalCost = claudeCodeResult.cost

    // Run tests if configured
    if (input.runTests) {
      await updateForgeSession(session.id, {
        status: 'testing',
        currentStep: 'Running tests',
        progress: 70,
        output,
      })
      onProgress?.('testing', 'Running tests', 70)

      output.testResults = await runTests(session, input.testCommand)
    }

    // Commit changes if auto-commit is enabled
    if (input.autoCommit && output.commits.length === 0) {
      await updateForgeSession(session.id, {
        status: 'committing',
        currentStep: 'Committing changes',
        progress: 80,
        output,
      })
      onProgress?.('committing', 'Committing changes', 80)
    }

    // Push and create PR if configured
    if (input.createPullRequest) {
      await updateForgeSession(session.id, {
        status: 'creating-pr',
        currentStep: 'Creating pull request',
        progress: 90,
        output,
      })
      onProgress?.('creating-pr', 'Creating pull request', 90)

      // This would be awaiting approval in semi-autonomous mode
      await updateForgeSession(session.id, {
        status: 'awaiting-approval',
        currentStep: 'Awaiting approval to push and create PR',
        progress: 95,
        output,
      })
      onProgress?.('awaiting-approval', 'Awaiting approval to push and create PR', 95)
    }

    // Generate summary
    output.summary = generateExecutionSummary(output)
    output.executionTimeMs = Date.now() - startTime

    // Mark as completed
    await updateForgeSession(session.id, {
      status: 'completed',
      currentStep: 'Completed',
      progress: 100,
      output,
      completedAt: new Date().toISOString(),
    })
    onProgress?.('completed', 'Completed', 100)

    return output
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    await updateForgeSession(session.id, {
      status: 'failed',
      error: errorMessage,
      errorStep: session.currentStep,
      completedAt: new Date().toISOString(),
    })
    onProgress?.('failed', errorMessage, session.progress || 0)

    throw error
  }
}

/**
 * Execute Claude Code CLI against the codebase
 * This is the core integration with Claude Code
 */
async function executeClaudeCode(
  session: ForgeSession,
  branchName: string
): Promise<{
  commits: ForgeCommit[]
  filesChanged: ForgeFileChange[]
  tokensUsed: number
  cost: number
}> {
  const { input } = session

  // Log the action
  await logForgeAction(
    session.agentId,
    session.taskId,
    'claude-code-execute',
    `Execute Claude Code for branch: ${branchName}`,
    {
      target: input.repositoryPath,
      reasoning: 'Implementing PRD requirements using Claude Code CLI',
    }
  )

  // TODO: Actual Claude Code CLI integration
  // For now, return mock data
  // In production, this would:
  // 1. Spawn claude-code process with the PRD as prompt
  // 2. Monitor output for commits, file changes
  // 3. Capture token usage and costs

  // Mock implementation for UI development
  const mockCommit: ForgeCommit = {
    sha: crypto.randomUUID().slice(0, 7),
    message: 'feat: implement PRD requirements',
    filesChanged: ['src/example.ts'],
    timestamp: new Date().toISOString(),
  }

  const mockFileChange: ForgeFileChange = {
    path: 'src/example.ts',
    changeType: 'modified',
    additions: 50,
    deletions: 10,
  }

  return {
    commits: [mockCommit],
    filesChanged: [mockFileChange],
    tokensUsed: 15000,
    cost: 45, // cents
  }
}

/**
 * Run tests in the repository
 */
async function runTests(
  session: ForgeSession,
  testCommand?: string
): Promise<ForgeTaskOutput['testResults']> {
  await logForgeAction(
    session.agentId,
    session.taskId,
    'run-tests',
    `Running tests: ${testCommand || 'npm test'}`,
    {
      target: session.input.repositoryPath,
      reasoning: 'Verifying implementation with automated tests',
    }
  )

  // TODO: Actually run tests
  // For now, return mock data
  return {
    passed: true,
    totalTests: 42,
    passedTests: 42,
    failedTests: 0,
    skippedTests: 0,
  }
}

// =============================================================================
// APPROVAL WORKFLOW
// =============================================================================

/**
 * Approve push and PR creation for a session awaiting approval
 */
export async function approvePushAndPr(
  sessionId: string,
  approvedBy: string
): Promise<ForgeTaskOutput['pullRequest']> {
  const session = await getForgeSession(sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  if (session.status !== 'awaiting-approval') {
    throw new Error('Session is not awaiting approval')
  }

  await logForgeAction(
    session.agentId,
    session.taskId,
    'push',
    `Push approved by ${approvedBy}`,
    {
      target: session.input.repositoryUrl,
      reasoning: 'Human approved push to remote',
    }
  )

  // TODO: Actually push and create PR
  const pr: ForgeTaskOutput['pullRequest'] = {
    number: Math.floor(Math.random() * 1000),
    url: `${session.input.repositoryUrl}/pull/${Math.floor(Math.random() * 1000)}`,
    title: `feat: ${session.output?.branchName || 'implementation'}`,
    body: session.output?.summary || '',
    createdAt: new Date().toISOString(),
    headBranch: session.output?.branchName || '',
    baseBranch: session.input.baseBranch,
  }

  await updateForgeSession(sessionId, {
    status: 'completed',
    currentStep: 'PR created',
    progress: 100,
    output: {
      ...session.output,
      pullRequest: pr,
    },
    completedAt: new Date().toISOString(),
  })

  return pr
}

/**
 * Reject push/PR and keep changes local
 */
export async function rejectPushAndPr(
  sessionId: string,
  rejectedBy: string,
  reason: string
): Promise<void> {
  const session = await getForgeSession(sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  await logForgeAction(
    session.agentId,
    session.taskId,
    'push',
    `Push rejected by ${rejectedBy}: ${reason}`,
    {
      reasoning: 'Human rejected push to remote',
      error: reason,
    }
  )

  // Mark as completed but without PR
  await updateForgeSession(sessionId, {
    status: 'completed',
    currentStep: 'Completed (local only)',
    progress: 100,
    completedAt: new Date().toISOString(),
  })
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Generate a branch name from PRD content
 */
function generateBranchName(prdContent: string): string {
  // Extract first line or heading
  const firstLine = prdContent.split('\n')[0]
    .replace(/^#*\s*/, '') // Remove markdown headers
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .slice(0, 50) // Limit length

  const timestamp = Date.now().toString(36)
  return `forge/${firstLine || 'feature'}-${timestamp}`
}

/**
 * Generate execution summary
 */
function generateExecutionSummary(output: ForgeTaskOutput): string {
  const parts: string[] = []

  parts.push(`Branch: ${output.branchName}`)
  parts.push(`Commits: ${output.commits.length}`)
  parts.push(`Files changed: ${output.filesChanged.length}`)

  if (output.testResults) {
    parts.push(`Tests: ${output.testResults.passedTests}/${output.testResults.totalTests} passed`)
  }

  if (output.pullRequest) {
    parts.push(`PR: #${output.pullRequest.number}`)
  }

  return parts.join(' | ')
}

// =============================================================================
// DATABASE TRANSFORMATIONS
// =============================================================================

function forgeSessionToDb(session: ForgeSession): Record<string, unknown> {
  return {
    id: session.id,
    task_id: session.taskId,
    agent_id: session.agentId,
    account_id: session.accountId,
    input: session.input,
    status: session.status,
    current_step: session.currentStep,
    progress: session.progress,
    output: session.output,
    claude_code_session_id: session.claudeCodeSessionId,
    claude_code_output_path: session.claudeCodeOutputPath,
    error: session.error,
    error_step: session.errorStep,
    started_at: session.startedAt,
    completed_at: session.completedAt,
    last_activity_at: session.lastActivityAt,
    created_by: session.createdBy,
    created_by_type: session.createdByType,
  }
}

function forgeSessionUpdatesToDb(updates: Partial<ForgeSession>): Record<string, unknown> {
  const dbUpdates: Record<string, unknown> = {}

  if (updates.status !== undefined) dbUpdates.status = updates.status
  if (updates.currentStep !== undefined) dbUpdates.current_step = updates.currentStep
  if (updates.progress !== undefined) dbUpdates.progress = updates.progress
  if (updates.output !== undefined) dbUpdates.output = updates.output
  if (updates.claudeCodeSessionId !== undefined) dbUpdates.claude_code_session_id = updates.claudeCodeSessionId
  if (updates.error !== undefined) dbUpdates.error = updates.error
  if (updates.errorStep !== undefined) dbUpdates.error_step = updates.errorStep
  if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt

  return dbUpdates
}

function forgeSessionFromDb(data: Record<string, unknown>): ForgeSession {
  return {
    id: data.id as string,
    taskId: data.task_id as string,
    agentId: data.agent_id as string,
    accountId: data.account_id as string,
    input: data.input as ForgeTaskInput,
    status: data.status as ForgeExecutionStatus,
    currentStep: data.current_step as string | undefined,
    progress: data.progress as number | undefined,
    output: data.output as Partial<ForgeTaskOutput> | undefined,
    claudeCodeSessionId: data.claude_code_session_id as string | undefined,
    claudeCodeOutputPath: data.claude_code_output_path as string | undefined,
    error: data.error as string | undefined,
    errorStep: data.error_step as string | undefined,
    startedAt: data.started_at as string,
    completedAt: data.completed_at as string | undefined,
    lastActivityAt: data.last_activity_at as string,
    createdBy: data.created_by as string,
    createdByType: data.created_by_type as 'user' | 'agent',
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export type { ForgeTaskInput, ForgeTaskOutput, ForgeSession, ForgeExecutionStatus }
