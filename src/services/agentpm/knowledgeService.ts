// Knowledge Service - Fetches hierarchical knowledge for AI context
// Levels: Global (system_knowledge) → Account → Team → Project

import { supabase } from '@/services/supabase/client'
import type { SystemKnowledge, KnowledgeEntry, FunnelistsTool } from '@/types/agentpm'

// Convert snake_case to camelCase for a single object
function toCamelCaseKeys<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    result[camelKey] = obj[key]
  }
  return result
}

/**
 * Fetch global system knowledge for a specific tool
 */
export async function fetchSystemKnowledge(
  toolName: FunnelistsTool = 'agentpm'
): Promise<SystemKnowledge[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('system_knowledge')
    .select('*')
    .eq('is_active', true)
    .or(`tool_name.is.null,tool_name.eq.${toolName}`)
    .order('priority', { ascending: true })
    .order('category')
    .order('created_at')

  if (error) throw error
  return (data || []).map(row => toCamelCaseKeys(row) as unknown as SystemKnowledge)
}

/**
 * Fetch account-level knowledge entries
 */
export async function fetchAccountKnowledge(
  accountId: string
): Promise<KnowledgeEntry[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('knowledge_entries')
    .select('*')
    .eq('account_id', accountId)
    .eq('scope', 'account')
    .is('deleted_at', null)
    .eq('is_verified', true)
    .order('knowledge_type')
    .order('created_at')

  if (error) throw error
  return (data || []).map(row => toCamelCaseKeys(row) as unknown as KnowledgeEntry)
}

/**
 * Fetch project-level knowledge entries
 */
export async function fetchProjectKnowledge(
  projectId: string
): Promise<KnowledgeEntry[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('knowledge_entries')
    .select('*')
    .eq('project_id', projectId)
    .eq('scope', 'project')
    .is('deleted_at', null)
    .eq('is_verified', true)
    .order('knowledge_type')
    .order('created_at')

  if (error) throw error
  return (data || []).map(row => toCamelCaseKeys(row) as unknown as KnowledgeEntry)
}

/**
 * Build hierarchical knowledge context string for AI prompts
 * Includes: System → Account → Project knowledge
 */
export async function buildKnowledgeContext(options: {
  accountId?: string
  projectId?: string
  toolName?: FunnelistsTool
  includeSystemKnowledge?: boolean
}): Promise<string> {
  const {
    accountId,
    projectId,
    toolName = 'agentpm',
    includeSystemKnowledge = true,
  } = options

  const sections: string[] = []

  try {
    // 1. GLOBAL LEVEL: System knowledge
    if (includeSystemKnowledge) {
      const systemKnowledge = await fetchSystemKnowledge(toolName)
      if (systemKnowledge.length > 0) {
        sections.push('## SYSTEM KNOWLEDGE')
        sections.push('This is how the Funnelists platform works:\n')

        for (const entry of systemKnowledge) {
          sections.push(`### ${entry.title}`)
          sections.push(entry.content)
          sections.push('')
        }
      }
    }

    // 2. ACCOUNT LEVEL: Organization-wide knowledge
    if (accountId) {
      const accountKnowledge = await fetchAccountKnowledge(accountId)
      if (accountKnowledge.length > 0) {
        sections.push('\n## ACCOUNT KNOWLEDGE')
        sections.push('Knowledge specific to this organization:\n')

        let currentType = ''
        for (const entry of accountKnowledge) {
          if (entry.knowledgeType !== currentType) {
            currentType = entry.knowledgeType
            sections.push(`### ${capitalizeFirst(currentType)}s`)
          }
          sections.push(`- ${entry.content}`)
        }
        sections.push('')
      }
    }

    // 3. PROJECT LEVEL: Project-specific knowledge
    if (projectId) {
      const projectKnowledge = await fetchProjectKnowledge(projectId)
      if (projectKnowledge.length > 0) {
        sections.push('\n## PROJECT KNOWLEDGE')
        sections.push('Knowledge specific to this project:\n')

        let currentType = ''
        for (const entry of projectKnowledge) {
          if (entry.knowledgeType !== currentType) {
            currentType = entry.knowledgeType
            sections.push(`### ${capitalizeFirst(currentType)}s`)
          }
          sections.push(`- ${entry.content}`)
        }
        sections.push('')
      }
    }
  } catch (error) {
    console.error('[KnowledgeService] Error building knowledge context:', error)
    // Return empty string on error - don't break the chat
  }

  return sections.join('\n')
}

/**
 * Get a condensed summary of available knowledge (for token efficiency)
 */
export async function getKnowledgeSummary(options: {
  accountId?: string
  projectId?: string
  toolName?: FunnelistsTool
}): Promise<{ systemCount: number; accountCount: number; projectCount: number }> {
  const { accountId, projectId, toolName = 'agentpm' } = options

  let systemCount = 0
  let accountCount = 0
  let projectCount = 0

  try {
    if (supabase) {
      // Count system knowledge
      const { count: sysCount } = await supabase
        .from('system_knowledge')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .or(`tool_name.is.null,tool_name.eq.${toolName}`)

      systemCount = sysCount || 0

      // Count account knowledge
      if (accountId) {
        const { count: accCount } = await supabase
          .from('knowledge_entries')
          .select('*', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .eq('scope', 'account')
          .is('deleted_at', null)

        accountCount = accCount || 0
      }

      // Count project knowledge
      if (projectId) {
        const { count: projCount } = await supabase
          .from('knowledge_entries')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('scope', 'project')
          .is('deleted_at', null)

        projectCount = projCount || 0
      }
    }
  } catch (error) {
    console.error('[KnowledgeService] Error getting knowledge summary:', error)
  }

  return { systemCount, accountCount, projectCount }
}

// Helper
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
