// Per-Agent Queue Manager — isolated concurrency control per agent
// Each agent gets its own queue with independent concurrency limits,
// preventing one busy agent from blocking others.

export interface AgentQueueConfig {
  maxConcurrent: number   // Max tasks running simultaneously for this agent
  maxPerHour?: number     // Rate limit (from agent persona)
}

interface QueueEntry {
  agentId: string
  running: Set<string>        // taskIds currently executing
  hourlyCount: number         // tasks started in current hour window
  hourWindowStart: number     // timestamp of current hour window
}

// In-memory per-agent queue state
const agentQueues = new Map<string, QueueEntry>()

/** Default concurrency if not specified on agent persona */
const DEFAULT_MAX_CONCURRENT = 2

/**
 * Get or create queue entry for an agent
 */
function getQueue(agentId: string): QueueEntry {
  let entry = agentQueues.get(agentId)
  if (!entry) {
    entry = {
      agentId,
      running: new Set(),
      hourlyCount: 0,
      hourWindowStart: Date.now(),
    }
    agentQueues.set(agentId, entry)
  }
  return entry
}

/**
 * Reset hourly window if an hour has elapsed
 */
function maybeResetHourWindow(entry: QueueEntry): void {
  const elapsed = Date.now() - entry.hourWindowStart
  if (elapsed >= 3_600_000) {
    entry.hourlyCount = 0
    entry.hourWindowStart = Date.now()
  }
}

/**
 * Check if an agent can accept a new task right now.
 * Returns { allowed, reason } — reason explains why if not allowed.
 */
export function canAcceptTask(
  agentId: string,
  config?: AgentQueueConfig
): { allowed: boolean; reason?: string } {
  const queue = getQueue(agentId)
  const maxConcurrent = config?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT

  // Check concurrency limit
  if (queue.running.size >= maxConcurrent) {
    return {
      allowed: false,
      reason: `Agent at capacity (${queue.running.size}/${maxConcurrent} concurrent tasks)`,
    }
  }

  // Check hourly rate limit
  if (config?.maxPerHour) {
    maybeResetHourWindow(queue)
    if (queue.hourlyCount >= config.maxPerHour) {
      return {
        allowed: false,
        reason: `Hourly rate limit reached (${queue.hourlyCount}/${config.maxPerHour})`,
      }
    }
  }

  return { allowed: true }
}

/**
 * Reserve a slot for a task. Call this before starting execution.
 * Returns false if the slot couldn't be reserved (over capacity).
 */
export function reserveSlot(
  agentId: string,
  taskId: string,
  config?: AgentQueueConfig
): boolean {
  const { allowed } = canAcceptTask(agentId, config)
  if (!allowed) return false

  const queue = getQueue(agentId)
  queue.running.add(taskId)
  queue.hourlyCount++
  return true
}

/**
 * Release a slot after task completes (success or failure).
 */
export function releaseSlot(agentId: string, taskId: string): void {
  const queue = agentQueues.get(agentId)
  if (queue) {
    queue.running.delete(taskId)
  }
}

/**
 * Get current queue stats for an agent (for monitoring/UI).
 */
export function getAgentQueueStats(agentId: string): {
  runningCount: number
  runningTaskIds: string[]
  hourlyCount: number
} {
  const queue = agentQueues.get(agentId)
  if (!queue) {
    return { runningCount: 0, runningTaskIds: [], hourlyCount: 0 }
  }
  maybeResetHourWindow(queue)
  return {
    runningCount: queue.running.size,
    runningTaskIds: [...queue.running],
    hourlyCount: queue.hourlyCount,
  }
}

/**
 * Get stats for all agents (for dashboard monitoring).
 */
export function getAllQueueStats(): Array<{
  agentId: string
  runningCount: number
  hourlyCount: number
}> {
  const stats: Array<{ agentId: string; runningCount: number; hourlyCount: number }> = []
  for (const [agentId, queue] of agentQueues) {
    maybeResetHourWindow(queue)
    stats.push({
      agentId,
      runningCount: queue.running.size,
      hourlyCount: queue.hourlyCount,
    })
  }
  return stats
}

/**
 * Derive AgentQueueConfig from an agent persona.
 */
export function configFromPersona(agent: {
  maxActionsPerHour?: number
  maxConcurrentTasks?: number
}): AgentQueueConfig {
  return {
    maxConcurrent: agent.maxConcurrentTasks ?? DEFAULT_MAX_CONCURRENT,
    maxPerHour: agent.maxActionsPerHour,
  }
}
