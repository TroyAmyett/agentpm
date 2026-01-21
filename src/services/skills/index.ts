// Skills Service
// GitHub import and skill management for AgentPM

import { supabase } from '../supabase/client'
import type {
  Skill,
  SkillMetadata,
  SkillSourceType,
  SkillBuilderMessage,
  SkillIndexEntry,
  SkillIndexSearchResult,
  SkillIndexFilters,
  SkillCategory,
  SkillAgent,
  SkillImport,
} from '@/types/agentpm'

// =============================================================================
// HELPER: Case conversion
// =============================================================================

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function toSnakeCaseKeys<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[toSnakeCase(key)] = obj[key]
    }
  }
  return result
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

function toCamelCaseKeys<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[toCamelCase(key)] = obj[key]
    }
  }
  return result as T
}

// =============================================================================
// GITHUB URL PARSING
// =============================================================================

export interface ParsedGitHubUrl {
  owner: string
  repo: string
  branch: string
  path: string
  rawUrl: string
}

/**
 * Parse a GitHub URL to extract owner, repo, branch, and path
 * Supports both blob URLs and raw URLs
 */
export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  try {
    const urlObj = new URL(url)

    // Handle raw.githubusercontent.com URLs
    if (urlObj.hostname === 'raw.githubusercontent.com') {
      const parts = urlObj.pathname.split('/').filter(Boolean)
      if (parts.length >= 3) {
        const [owner, repo, branch, ...pathParts] = parts
        return {
          owner,
          repo,
          branch,
          path: pathParts.join('/'),
          rawUrl: url,
        }
      }
    }

    // Handle github.com URLs
    if (urlObj.hostname === 'github.com') {
      const parts = urlObj.pathname.split('/').filter(Boolean)
      // Format: /owner/repo/blob/branch/path/to/file.md
      if (parts.length >= 4 && parts[2] === 'blob') {
        const [owner, repo, , branch, ...pathParts] = parts
        const path = pathParts.join('/')
        return {
          owner,
          repo,
          branch,
          path,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
        }
      }
      // Format: /owner/repo/raw/branch/path/to/file.md
      if (parts.length >= 4 && parts[2] === 'raw') {
        const [owner, repo, , branch, ...pathParts] = parts
        const path = pathParts.join('/')
        return {
          owner,
          repo,
          branch,
          path,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
        }
      }
    }

    return null
  } catch {
    return null
  }
}

// =============================================================================
// FRONTMATTER PARSING
// =============================================================================

/**
 * Parse YAML frontmatter from skill content
 */
export function parseFrontmatter(content: string): { metadata: SkillMetadata; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { metadata: {}, body: content }
  }

  const [, frontmatter, body] = match
  const metadata: SkillMetadata = {}

  // Simple YAML parsing for common fields
  const lines = frontmatter.split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()

    // Handle arrays like [tag1, tag2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1)
      const items = arrayContent.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      if (key === 'tags') {
        metadata.tags = items
      }
      continue
    }

    // Remove quotes
    value = value.replace(/^['"]|['"]$/g, '')

    switch (key) {
      case 'name':
        metadata.name = value
        break
      case 'description':
        metadata.description = value
        break
      case 'version':
        metadata.version = value
        break
      case 'author':
        metadata.author = value
        break
    }
  }

  return { metadata, body: body.trim() }
}

/**
 * Extract skill name from file path
 */
export function extractNameFromPath(path: string): string {
  const filename = path.split('/').pop() || path
  // Remove extension and convert to title case
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// =============================================================================
// GITHUB API
// =============================================================================

/**
 * Fetch raw content from GitHub
 */
export async function fetchGitHubContent(url: string): Promise<string> {
  const parsed = parseGitHubUrl(url)
  if (!parsed) {
    throw new Error('Invalid GitHub URL format')
  }

  const response = await fetch(parsed.rawUrl)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('File not found on GitHub')
    }
    throw new Error(`Failed to fetch from GitHub: ${response.statusText}`)
  }

  return response.text()
}

/**
 * Get the latest commit SHA for a file
 */
export async function getLatestCommitSha(
  owner: string,
  repo: string,
  path: string,
  branch: string = 'main'
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&sha=${branch}&per_page=1`
    )

    if (!response.ok) {
      console.warn('Failed to fetch commit SHA:', response.statusText)
      return null
    }

    const commits = await response.json()
    return commits[0]?.sha || null
  } catch (error) {
    console.warn('Error fetching commit SHA:', error)
    return null
  }
}

// =============================================================================
// SKILL CRUD
// =============================================================================

/**
 * Fetch all skills for an account
 */
export async function fetchSkills(accountId: string): Promise<Skill[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<Skill>(row))
}

/**
 * Fetch a single skill by ID
 */
export async function fetchSkill(id: string): Promise<Skill | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return toCamelCaseKeys<Skill>(data)
}

export interface CreateSkillInput {
  accountId: string
  userId: string
  name: string
  description?: string
  version?: string
  author?: string
  tags?: string[]
  content: string
  sourceType: SkillSourceType
  sourceUrl?: string
  sourceRepo?: string
  sourcePath?: string
  sourceBranch?: string
  sourceSha?: string
  isEnabled?: boolean
  isOrgShared?: boolean
}

/**
 * Create a new skill
 */
export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills')
    .insert(
      toSnakeCaseKeys({
        accountId: input.accountId,
        userId: input.userId,
        name: input.name,
        description: input.description || null,
        version: input.version || '1.0.0',
        author: input.author || null,
        tags: input.tags || [],
        content: input.content,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl || null,
        sourceRepo: input.sourceRepo || null,
        sourcePath: input.sourcePath || null,
        sourceBranch: input.sourceBranch || 'main',
        sourceSha: input.sourceSha || null,
        isEnabled: input.isEnabled ?? true,
        isOrgShared: input.isOrgShared ?? false,
      })
    )
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Skill>(data)
}

/**
 * Update a skill
 */
export async function updateSkill(
  id: string,
  updates: Partial<Omit<Skill, 'id' | 'accountId' | 'userId' | 'createdAt'>>
): Promise<Skill> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills')
    .update(toSnakeCaseKeys(updates as Record<string, unknown>))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Skill>(data)
}

/**
 * Soft delete a skill
 */
export async function deleteSkill(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('skills')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

// =============================================================================
// IMPORT FUNCTIONS
// =============================================================================

/**
 * Import a skill from a GitHub URL
 */
export async function importFromGitHub(
  url: string,
  accountId: string,
  userId: string
): Promise<Skill> {
  // 1. Parse the URL
  const parsed = parseGitHubUrl(url)
  if (!parsed) {
    throw new Error('Invalid GitHub URL. Please provide a valid GitHub file URL.')
  }

  // 2. Fetch the content
  const content = await fetchGitHubContent(url)

  // 3. Parse frontmatter for metadata
  const { metadata, body } = parseFrontmatter(content)

  // 4. Get latest commit SHA for version tracking
  const sha = await getLatestCommitSha(parsed.owner, parsed.repo, parsed.path, parsed.branch)

  // 5. Create the skill
  return createSkill({
    accountId,
    userId,
    name: metadata.name || extractNameFromPath(parsed.path),
    description: metadata.description,
    version: metadata.version || '1.0.0',
    author: metadata.author,
    tags: metadata.tags || [],
    content: body,
    sourceType: 'github',
    sourceUrl: url,
    sourceRepo: `${parsed.owner}/${parsed.repo}`,
    sourcePath: parsed.path,
    sourceBranch: parsed.branch,
    sourceSha: sha || undefined,
    isEnabled: true,
  })
}

/**
 * Import a skill from raw content
 */
export async function importFromRaw(
  content: string,
  accountId: string,
  userId: string,
  name?: string
): Promise<Skill> {
  // Parse frontmatter for metadata
  const { metadata, body } = parseFrontmatter(content)

  return createSkill({
    accountId,
    userId,
    name: metadata.name || name || 'Untitled Skill',
    description: metadata.description,
    version: metadata.version || '1.0.0',
    author: metadata.author,
    tags: metadata.tags || [],
    content: body,
    sourceType: 'local',
    isEnabled: true,
  })
}

// =============================================================================
// UPDATE FUNCTIONS
// =============================================================================

/**
 * Check if a GitHub-sourced skill has updates available
 */
export async function checkForUpdates(skill: Skill): Promise<boolean> {
  if (skill.sourceType !== 'github' || !skill.sourceRepo || !skill.sourcePath) {
    return false
  }

  const [owner, repo] = skill.sourceRepo.split('/')
  const currentSha = await getLatestCommitSha(owner, repo, skill.sourcePath, skill.sourceBranch)

  if (!currentSha || !skill.sourceSha) {
    return false
  }

  return currentSha !== skill.sourceSha
}

/**
 * Pull latest content from GitHub and update the skill
 */
export async function syncSkill(skill: Skill): Promise<Skill> {
  if (skill.sourceType !== 'github' || !skill.sourceUrl) {
    throw new Error('Skill is not from GitHub')
  }

  // Fetch latest content
  const content = await fetchGitHubContent(skill.sourceUrl)
  const { metadata, body } = parseFrontmatter(content)

  // Get latest commit SHA
  const parsed = parseGitHubUrl(skill.sourceUrl)
  const sha = parsed
    ? await getLatestCommitSha(parsed.owner, parsed.repo, parsed.path, parsed.branch)
    : null

  // Update the skill
  return updateSkill(skill.id, {
    content: body,
    name: metadata.name || skill.name,
    description: metadata.description || skill.description,
    version: metadata.version || skill.version,
    author: metadata.author || skill.author,
    tags: metadata.tags || skill.tags,
    sourceSha: sha || skill.sourceSha,
    lastSyncedAt: new Date().toISOString(),
  })
}

/**
 * Toggle skill enabled status
 */
export async function toggleSkillEnabled(id: string, isEnabled: boolean): Promise<Skill> {
  return updateSkill(id, { isEnabled })
}

// =============================================================================
// SKILLS BUILDER FUNCTIONS
// =============================================================================

/**
 * Fetch all official @fun/ skills
 */
export async function fetchOfficialSkills(): Promise<Skill[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('namespace', '@fun')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<Skill>(row))
}

export interface CreateBuilderSkillInput {
  accountId: string
  userId: string
  name: string
  description: string
  content: string
  forkedFrom?: string
  builderConversation: SkillBuilderMessage[]
}

/**
 * Create a skill from Skills Builder
 */
export async function createBuilderSkill(input: CreateBuilderSkillInput): Promise<Skill> {
  if (!supabase) throw new Error('Supabase not configured')

  // Parse frontmatter to extract any embedded metadata
  const { metadata } = parseFrontmatter(input.content)

  const { data, error } = await supabase
    .from('skills')
    .insert(
      toSnakeCaseKeys({
        accountId: input.accountId,
        userId: input.userId,
        name: metadata.name || input.name,
        description: metadata.description || input.description,
        version: metadata.version || '1.0.0',
        author: metadata.author || null,
        tags: metadata.tags || [],
        content: input.content,
        sourceType: 'local' as SkillSourceType,
        forkedFrom: input.forkedFrom || null,
        builderConversation: input.builderConversation,
        tier: 'free',
        isEnabled: true,
        isOrgShared: false,
      })
    )
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Skill>(data)
}

/**
 * Update a skill from Skills Builder (preserves conversation history)
 */
export async function updateBuilderSkill(
  id: string,
  input: {
    name: string
    description: string
    content: string
    builderConversation: SkillBuilderMessage[]
  }
): Promise<Skill> {
  if (!supabase) throw new Error('Supabase not configured')

  // Parse frontmatter to extract any embedded metadata
  const { metadata } = parseFrontmatter(input.content)

  const { data, error } = await supabase
    .from('skills')
    .update(
      toSnakeCaseKeys({
        name: metadata.name || input.name,
        description: metadata.description || input.description,
        version: metadata.version,
        author: metadata.author,
        tags: metadata.tags,
        content: input.content,
        builderConversation: input.builderConversation,
        updatedAt: new Date().toISOString(),
      })
    )
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Skill>(data)
}

// =============================================================================
// SKILLS INDEX FUNCTIONS (Curated Skills Discovery)
// =============================================================================

/**
 * Search the curated skills index
 */
export async function searchSkillsIndex(
  filters: SkillIndexFilters = {},
  limit: number = 20,
  offset: number = 0
): Promise<SkillIndexSearchResult[]> {
  if (!supabase) throw new Error('Supabase not configured')

  // Use the database function for full-text search
  const { data, error } = await supabase.rpc('search_skills_index', {
    search_query: filters.query || null,
    filter_category: filters.category || null,
    filter_agent: filters.agent || null,
    filter_tags: filters.tags || null,
    page_limit: limit,
    page_offset: offset,
  })

  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => toCamelCaseKeys<SkillIndexSearchResult>(row))
}

/**
 * Fetch featured skills from the index
 */
export async function fetchFeaturedSkills(): Promise<SkillIndexEntry[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills_index')
    .select('*')
    .eq('approval_status', 'approved')
    .eq('is_featured', true)
    .is('deleted_at', null)
    .order('featured_order', { ascending: true })
    .limit(10)

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<SkillIndexEntry>(row))
}

/**
 * Fetch a single skill from the index by slug
 */
export async function fetchSkillIndexBySlug(slug: string): Promise<SkillIndexEntry | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills_index')
    .select('*')
    .eq('slug', slug)
    .eq('approval_status', 'approved')
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return toCamelCaseKeys<SkillIndexEntry>(data)
}

/**
 * Fetch a single skill from the index by ID
 */
export async function fetchSkillIndexById(id: string): Promise<SkillIndexEntry | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills_index')
    .select('*')
    .eq('id', id)
    .eq('approval_status', 'approved')
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return toCamelCaseKeys<SkillIndexEntry>(data)
}

/**
 * Fetch skills by category
 */
export async function fetchSkillsByCategory(
  category: SkillCategory,
  limit: number = 20
): Promise<SkillIndexEntry[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills_index')
    .select('*')
    .eq('category', category)
    .eq('approval_status', 'approved')
    .is('deleted_at', null)
    .order('import_count', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<SkillIndexEntry>(row))
}

/**
 * Fetch skills compatible with a specific agent
 */
export async function fetchSkillsForAgent(
  agent: SkillAgent,
  limit: number = 20
): Promise<SkillIndexEntry[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills_index')
    .select('*')
    .eq('approval_status', 'approved')
    .is('deleted_at', null)
    .or(`compatible_agents.cs.{${agent}},compatible_agents.cs.{universal}`)
    .order('import_count', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<SkillIndexEntry>(row))
}

/**
 * Import a skill from the index into user's account
 */
export async function importFromIndex(
  indexEntry: SkillIndexEntry,
  accountId: string,
  userId: string
): Promise<Skill> {
  if (!supabase) throw new Error('Supabase not configured')

  // If we have a GitHub URL, fetch fresh content
  let content: string
  let sourceSha: string | undefined

  if (indexEntry.githubUrl) {
    content = await fetchGitHubContent(indexEntry.githubUrl)
    const parsed = parseGitHubUrl(indexEntry.githubUrl)
    if (parsed) {
      const sha = await getLatestCommitSha(
        parsed.owner,
        parsed.repo,
        parsed.path,
        parsed.branch
      )
      sourceSha = sha || undefined
    }
  } else if (indexEntry.rawContentUrl) {
    const response = await fetch(indexEntry.rawContentUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch skill content: ${response.statusText}`)
    }
    content = await response.text()
  } else {
    throw new Error('Skill has no content source')
  }

  // Parse frontmatter from fetched content
  const { metadata, body } = parseFrontmatter(content)

  // Create the skill in user's account
  const skill = await createSkill({
    accountId,
    userId,
    name: metadata.name || indexEntry.name,
    description: metadata.description || indexEntry.description,
    version: metadata.version || indexEntry.version,
    author: metadata.author || indexEntry.authorName,
    tags: metadata.tags || indexEntry.tags,
    content: body,
    sourceType: indexEntry.githubUrl ? 'github' : 'marketplace',
    sourceUrl: indexEntry.githubUrl || indexEntry.rawContentUrl,
    sourceRepo: indexEntry.githubOwner && indexEntry.githubRepo
      ? `${indexEntry.githubOwner}/${indexEntry.githubRepo}`
      : undefined,
    sourcePath: indexEntry.githubPath,
    sourceBranch: indexEntry.githubBranch,
    sourceSha,
    isEnabled: true,
  })

  // Track the import
  await supabase.from('skill_imports').insert({
    skills_index_id: indexEntry.id,
    skill_id: skill.id,
    account_id: accountId,
    user_id: userId,
    imported_version: indexEntry.version,
  })

  return skill
}

/**
 * Check if a skill from the index has been imported by the user
 */
export async function checkSkillImported(
  indexId: string,
  accountId: string
): Promise<SkillImport | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skill_imports')
    .select('*')
    .eq('skills_index_id', indexId)
    .eq('account_id', accountId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return toCamelCaseKeys<SkillImport>(data)
}

/**
 * Fetch all skills the user has imported from the index
 */
export async function fetchUserImports(accountId: string): Promise<SkillImport[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skill_imports')
    .select('*')
    .eq('account_id', accountId)
    .order('imported_at', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<SkillImport>(row))
}

/**
 * Get all unique categories with counts
 */
export async function fetchCategoryCounts(): Promise<Array<{ category: SkillCategory; count: number }>> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills_index')
    .select('category')
    .eq('approval_status', 'approved')
    .is('deleted_at', null)

  if (error) throw error

  // Count categories manually (Supabase doesn't support GROUP BY easily in client)
  const counts = (data || []).reduce((acc: Record<string, number>, row) => {
    acc[row.category] = (acc[row.category] || 0) + 1
    return acc
  }, {})

  return Object.entries(counts).map(([category, count]) => ({
    category: category as SkillCategory,
    count,
  }))
}

/**
 * Get popular tags from the index
 */
export async function fetchPopularTags(limit: number = 20): Promise<Array<{ tag: string; count: number }>> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skills_index')
    .select('tags')
    .eq('approval_status', 'approved')
    .is('deleted_at', null)

  if (error) throw error

  // Flatten and count tags
  const tagCounts = (data || []).reduce((acc: Record<string, number>, row) => {
    for (const tag of row.tags || []) {
      acc[tag] = (acc[tag] || 0) + 1
    }
    return acc
  }, {})

  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
