// Per-Agent Queue Manager — Unit Tests
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  canAcceptTask,
  reserveSlot,
  releaseSlot,
  getAgentQueueStats,
  getAllQueueStats,
  configFromPersona,
} from './agentQueue'

describe('agentQueue', () => {
  // Use unique agent IDs per test to avoid shared state
  let agentCounter = 0
  function uniqueAgentId() {
    return `agent-queue-test-${++agentCounter}-${Date.now()}`
  }

  describe('canAcceptTask', () => {
    it('allows task for new agent (no existing queue)', () => {
      const result = canAcceptTask(uniqueAgentId())
      expect(result.allowed).toBe(true)
    })

    it('rejects task when at concurrency limit', () => {
      const agentId = uniqueAgentId()
      const config = { maxConcurrent: 1 }

      reserveSlot(agentId, 'task-1', config)
      const result = canAcceptTask(agentId, config)

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('capacity')
    })

    it('allows task after releasing a slot', () => {
      const agentId = uniqueAgentId()
      const config = { maxConcurrent: 1 }

      reserveSlot(agentId, 'task-a', config)
      releaseSlot(agentId, 'task-a')

      const result = canAcceptTask(agentId, config)
      expect(result.allowed).toBe(true)
    })
  })

  describe('reserveSlot + releaseSlot', () => {
    it('reserves and releases slots correctly', () => {
      const agentId = uniqueAgentId()
      const config = { maxConcurrent: 2 }

      expect(reserveSlot(agentId, 'task-r1', config)).toBe(true)
      expect(reserveSlot(agentId, 'task-r2', config)).toBe(true)
      expect(reserveSlot(agentId, 'task-r3', config)).toBe(false) // at capacity

      releaseSlot(agentId, 'task-r1')
      expect(reserveSlot(agentId, 'task-r4', config)).toBe(true)
    })

    it('tracks hourly count', () => {
      const agentId = uniqueAgentId()
      const config = { maxConcurrent: 10, maxPerHour: 3 }

      reserveSlot(agentId, 'h1', config)
      releaseSlot(agentId, 'h1')
      reserveSlot(agentId, 'h2', config)
      releaseSlot(agentId, 'h2')
      reserveSlot(agentId, 'h3', config)
      releaseSlot(agentId, 'h3')

      // 4th should be blocked by hourly limit
      const result = canAcceptTask(agentId, config)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Hourly rate limit')
    })
  })

  describe('getAgentQueueStats', () => {
    it('returns zero stats for unknown agent', () => {
      const stats = getAgentQueueStats('unknown-agent-xyz')
      expect(stats.runningCount).toBe(0)
      expect(stats.runningTaskIds).toEqual([])
      expect(stats.hourlyCount).toBe(0)
    })

    it('reflects running tasks', () => {
      const agentId = uniqueAgentId()
      reserveSlot(agentId, 'stat-t1', { maxConcurrent: 5 })
      reserveSlot(agentId, 'stat-t2', { maxConcurrent: 5 })

      const stats = getAgentQueueStats(agentId)
      expect(stats.runningCount).toBe(2)
      expect(stats.runningTaskIds).toContain('stat-t1')
      expect(stats.runningTaskIds).toContain('stat-t2')
      expect(stats.hourlyCount).toBe(2)

      releaseSlot(agentId, 'stat-t1')
      releaseSlot(agentId, 'stat-t2')
    })
  })

  describe('getAllQueueStats', () => {
    it('returns stats for all tracked agents', () => {
      const a1 = uniqueAgentId()
      const a2 = uniqueAgentId()
      reserveSlot(a1, 'all-1', { maxConcurrent: 5 })
      reserveSlot(a2, 'all-2', { maxConcurrent: 5 })

      const allStats = getAllQueueStats()
      const ids = allStats.map(s => s.agentId)
      expect(ids).toContain(a1)
      expect(ids).toContain(a2)

      releaseSlot(a1, 'all-1')
      releaseSlot(a2, 'all-2')
    })
  })

  describe('configFromPersona', () => {
    it('uses defaults when fields not set', () => {
      const config = configFromPersona({})
      expect(config.maxConcurrent).toBe(2) // default
      expect(config.maxPerHour).toBeUndefined()
    })

    it('uses persona values when set', () => {
      const config = configFromPersona({
        maxConcurrentTasks: 5,
        maxActionsPerHour: 50,
      })
      expect(config.maxConcurrent).toBe(5)
      expect(config.maxPerHour).toBe(50)
    })
  })
})
