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
  isRepoUrl?: false
}

export interface ParsedGitHubRepoUrl {
  owner: string
  repo: string
  branch?: string
  isRepoUrl: true
}

export type ParsedGitHubResult = ParsedGitHubUrl | ParsedGitHubRepoUrl

export interface RepoSkillFile {
  name: string
  path: string
  rawUrl: string
  type: 'skill' | 'readme' | 'other'
}

/**
 * Parse a GitHub URL to extract owner, repo, branch, and path
 * Supports blob URLs, raw URLs, and repo-level URLs
 */
export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  const result = parseGitHubUrlExtended(url)
  if (!result || result.isRepoUrl) return null
  return result
}

/**
 * Extended parser that also handles repo-level URLs
 */
export function parseGitHubUrlExtended(url: string): ParsedGitHubResult | null {
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
          isRepoUrl: false,
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
          isRepoUrl: false,
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
          isRepoUrl: false,
        }
      }

      // Format: /owner/repo (repo-level URL)
      if (parts.length === 2) {
        const [owner, repo] = parts
        return {
          owner,
          repo,
          isRepoUrl: true,
        }
      }

      // Format: /owner/repo/tree/branch (repo at specific branch)
      if (parts.length >= 4 && parts[2] === 'tree') {
        const [owner, repo, , branch] = parts
        return {
          owner,
          repo,
          branch,
          isRepoUrl: true,
        }
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Check if a URL points to a repo (vs a specific file)
 */
export function isRepoUrl(url: string): boolean {
  const parsed = parseGitHubUrlExtended(url)
  return parsed?.isRepoUrl === true
}

/**
 * Scan a GitHub repo for skill files (SKILL.md, README.md, or .md files in skills/ folder)
 */
export async function scanRepoForSkillFiles(
  owner: string,
  repo: string,
  branch: string = 'main'
): Promise<RepoSkillFile[]> {
  const skillFiles: RepoSkillFile[] = []

  try {
    // First, get the repo's default branch if not specified
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`)
    if (!repoResponse.ok) {
      throw new Error(`Failed to fetch repo info: ${repoResponse.statusText}`)
    }
    const repoData = await repoResponse.json()
    const defaultBranch = branch || repoData.default_branch || 'main'

    // Get the root tree
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`
    )
    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch repo tree: ${treeResponse.statusText}`)
    }
    const treeData = await treeResponse.json()

    // Process all files in the tree
    for (const item of treeData.tree || []) {
      if (item.type !== 'blob') continue

      const path = item.path as string
      const lowerPath = path.toLowerCase()

      // Check for SKILL.md in root
      if (lowerPath === 'skill.md') {
        skillFiles.push({
          name: 'SKILL.md (Root)',
          path,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${path}`,
          type: 'skill',
        })
        continue
      }

      // Check for README.md in root (fallback)
      if (lowerPath === 'readme.md') {
        skillFiles.push({
          name: 'README.md',
          path,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${path}`,
          type: 'readme',
        })
        continue
      }

      // Check for .md files in skills/ folder
      if (lowerPath.startsWith('skills/') && lowerPath.endsWith('.md')) {
        const fileName = path.split('/').pop() || path
        skillFiles.push({
          name: `skills/${fileName}`,
          path,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${path}`,
          type: 'skill',
        })
        continue
      }

      // Check for .md files in agents/ folder
      if (lowerPath.startsWith('agents/') && lowerPath.endsWith('.md')) {
        const fileName = path.split('/').pop() || path
        skillFiles.push({
          name: `agents/${fileName}`,
          path,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${path}`,
          type: 'skill',
        })
        continue
      }

      // Check for any SKILL.md in subdirectories
      if (lowerPath.endsWith('/skill.md') || lowerPath.endsWith('skill.md')) {
        const dirName = path.split('/').slice(0, -1).join('/') || 'root'
        skillFiles.push({
          name: `${dirName}/SKILL.md`,
          path,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${path}`,
          type: 'skill',
        })
      }
    }

    // Sort: SKILL.md first, then skills/, then agents/, then README
    skillFiles.sort((a, b) => {
      if (a.type === 'skill' && b.type !== 'skill') return -1
      if (a.type !== 'skill' && b.type === 'skill') return 1
      if (a.path.toLowerCase() === 'skill.md') return -1
      if (b.path.toLowerCase() === 'skill.md') return 1
      return a.path.localeCompare(b.path)
    })

    return skillFiles
  } catch (error) {
    console.error('Error scanning repo for skill files:', error)
    return []
  }
}

// =============================================================================
// FRONTMATTER PARSING
// =============================================================================

/**
 * Parse YAML frontmatter from skill content
 * Handles single-line values, multiline (| and >), and quoted strings
 */
export function parseFrontmatter(content: string): { metadata: SkillMetadata; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { metadata: {}, body: content }
  }

  const [, frontmatter, body] = match
  const metadata: SkillMetadata = {}

  // Parse YAML with support for multiline values
  const lines = frontmatter.split('\n')
  let currentKey: string | null = null
  let currentValue: string[] = []
  let multilineStyle: '|' | '>' | null = null

  const saveCurrentField = () => {
    if (currentKey && currentValue.length > 0) {
      let value = multilineStyle === '>'
        ? currentValue.join(' ').trim() // Folded style: join with spaces
        : currentValue.join('\n').trim() // Literal style or single line

      // Remove surrounding quotes if present
      value = value.replace(/^['"]|['"]$/g, '')

      // Case-insensitive key matching
      const keyLower = currentKey.toLowerCase()
      switch (keyLower) {
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
        case 'category':
          // Normalize category to lowercase to match SkillCategory type
          metadata.category = value.toLowerCase() as SkillCategory
          break
        case 'tags':
          // Handle array syntax [tag1, tag2] or parse from multiline
          if (value.startsWith('[') && value.endsWith(']')) {
            const arrayContent = value.slice(1, -1)
            metadata.tags = arrayContent.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          }
          break
      }
    }
    currentKey = null
    currentValue = []
    multilineStyle = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if this is a new key (not indented, has colon)
    const keyMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/)

    if (keyMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
      // Save previous field
      saveCurrentField()

      currentKey = keyMatch[1]
      const valueAfterColon = keyMatch[2].trim()

      // Check for multiline indicators
      if (valueAfterColon === '|' || valueAfterColon === '|+' || valueAfterColon === '|-') {
        multilineStyle = '|'
      } else if (valueAfterColon === '>' || valueAfterColon === '>+' || valueAfterColon === '>-') {
        multilineStyle = '>'
      } else if (valueAfterColon) {
        // Single line value
        currentValue.push(valueAfterColon)
      }
      // If empty after colon but not multiline indicator, check next lines for indented content
    } else if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
      // Indented continuation line
      currentValue.push(line.trim())
    }
  }

  // Save the last field
  saveCurrentField()

  return { metadata, body: body.trim() }
}

/**
 * Extract a description from the body content as a fallback
 * Looks for the first non-heading, non-code paragraph
 */
function extractDescriptionFromBody(body: string): string | undefined {
  const lines = body.split('\n')
  let paragraph = ''

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip empty lines, headings, code blocks, horizontal rules
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('---') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (paragraph) break // End of paragraph
      continue
    }
    paragraph += (paragraph ? ' ' : '') + trimmed
    if (paragraph.length > 200) break
  }

  // Truncate if too long
  if (paragraph.length > 200) {
    paragraph = paragraph.slice(0, 197) + '...'
  }

  return paragraph || undefined
}

/**
 * Infer category from tags and/or description
 * Used as a fallback when no explicit category is provided
 */
function inferCategoryFromTags(tags?: string[], description?: string): SkillCategory | undefined {
  if (!tags?.length && !description) return undefined

  // Combine tags and description words for matching
  const searchText = [
    ...(tags || []).map(t => t.toLowerCase()),
    ...(description || '').toLowerCase().split(/\s+/)
  ].join(' ')

  // Category inference rules (order matters - more specific first)
  const categoryPatterns: Array<{ category: SkillCategory; patterns: string[] }> = [
    { category: 'integration', patterns: ['salesforce', 'hubspot', 'api', 'integration', 'crm', 'connector', 'zapier', 'webhook'] },
    { category: 'devops', patterns: ['devops', 'ci/cd', 'ci-cd', 'docker', 'kubernetes', 'infrastructure', 'deploy', 'terraform', 'aws', 'azure', 'gcp'] },
    { category: 'security', patterns: ['security', 'audit', 'vulnerability', 'penetration', 'pentest', 'secure', 'authentication', 'authorization'] },
    { category: 'data', patterns: ['data', 'etl', 'pipeline', 'database', 'sql', 'analytics', 'warehouse', 'transformation'] },
    { category: 'development', patterns: ['code', 'coding', 'development', 'programming', 'debugging', 'refactor', 'software', 'engineering', 'typescript', 'javascript', 'python', 'react', 'vue', 'angular'] },
    { category: 'design', patterns: ['design', 'ui', 'ux', 'figma', 'sketch', 'wireframe', 'prototype', 'visual', 'layout'] },
    { category: 'analysis', patterns: ['analysis', 'research', 'analyze', 'investigate', 'insight', 'report', 'metrics', 'kpi'] },
    { category: 'communication', patterns: ['email', 'presentation', 'meeting', 'communication', 'messaging', 'slack', 'teams'] },
    { category: 'productivity', patterns: ['productivity', 'planning', 'task', 'organize', 'workflow', 'automation', 'efficiency'] },
    { category: 'writing', patterns: ['writing', 'content', 'documentation', 'copywriting', 'blog', 'article', 'humanize', 'humanizer', 'text', 'prose', 'edit', 'editing', 'rewrite'] },
  ]

  for (const { category, patterns } of categoryPatterns) {
    for (const pattern of patterns) {
      if (searchText.includes(pattern)) {
        return category
      }
    }
  }

  return undefined
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
  category?: SkillCategory
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
        category: input.category || null,
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

export interface ImportFromRepoResult {
  type: 'single' | 'multiple' | 'none'
  skill?: Skill
  skillFiles?: RepoSkillFile[]
  owner?: string
  repo?: string
  branch?: string
}

/**
 * Import a skill from a GitHub URL (file or repo)
 * If it's a repo URL, returns the list of available skill files for user selection
 */
export async function importFromGitHub(
  url: string,
  accountId: string,
  userId: string
): Promise<Skill> {
  // 1. Parse the URL (extended to handle repo URLs)
  const parsed = parseGitHubUrlExtended(url)
  if (!parsed) {
    throw new Error('Invalid GitHub URL. Please provide a valid GitHub URL.')
  }

  // 2. If it's a repo URL, try to find SKILL.md in root first
  if (parsed.isRepoUrl) {
    const branch = parsed.branch || 'main'
    const skillMdUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/SKILL.md`

    try {
      const response = await fetch(skillMdUrl)
      if (response.ok) {
        // Found SKILL.md in root, import it
        return importFromGitHubFile(
          skillMdUrl,
          parsed.owner,
          parsed.repo,
          'SKILL.md',
          branch,
          accountId,
          userId
        )
      }
    } catch {
      // SKILL.md not found, fall through
    }

    // No SKILL.md found - throw error with repo info for caller to handle
    const error = new Error('REPO_NEEDS_SELECTION') as Error & {
      repoInfo: { owner: string; repo: string; branch: string }
    }
    error.repoInfo = { owner: parsed.owner, repo: parsed.repo, branch }
    throw error
  }

  // 3. It's a file URL, import directly
  return importFromGitHubFile(
    parsed.rawUrl,
    parsed.owner,
    parsed.repo,
    parsed.path,
    parsed.branch,
    accountId,
    userId
  )
}

/**
 * Import a skill from a specific GitHub file URL
 */
export async function importFromGitHubFile(
  rawUrl: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
  accountId: string,
  userId: string
): Promise<Skill> {
  // 1. Fetch the content
  const response = await fetch(rawUrl)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('File not found on GitHub')
    }
    throw new Error(`Failed to fetch from GitHub: ${response.statusText}`)
  }
  const content = await response.text()

  // 2. Parse frontmatter for metadata
  const { metadata, body } = parseFrontmatter(content)

  // 3. Get latest commit SHA for version tracking
  const sha = await getLatestCommitSha(owner, repo, path, branch)

  // 4. Determine description and category (with fallbacks)
  const description = metadata.description || extractDescriptionFromBody(body)
  const category = metadata.category || inferCategoryFromTags(metadata.tags, description)

  // 5. Create the skill
  return createSkill({
    accountId,
    userId,
    name: metadata.name || extractNameFromPath(path),
    description,
    version: metadata.version || '1.0.0',
    author: metadata.author,
    tags: metadata.tags || [],
    category,
    content: body,
    sourceType: 'github',
    sourceUrl: `https://github.com/${owner}/${repo}/blob/${branch}/${path}`,
    sourceRepo: `${owner}/${repo}`,
    sourcePath: path,
    sourceBranch: branch,
    sourceSha: sha || undefined,
    isEnabled: true,
  })
}

/**
 * Try to import from a repo URL, returning skill files if multiple found
 */
export async function importFromRepoUrl(
  url: string,
  accountId: string,
  userId: string
): Promise<ImportFromRepoResult> {
  const parsed = parseGitHubUrlExtended(url)
  if (!parsed) {
    throw new Error('Invalid GitHub URL')
  }

  if (!parsed.isRepoUrl) {
    // It's a file URL, import directly
    const skill = await importFromGitHub(url, accountId, userId)
    return { type: 'single', skill }
  }

  // It's a repo URL - scan for skill files
  const branch = parsed.branch || 'main'
  const skillFiles = await scanRepoForSkillFiles(parsed.owner, parsed.repo, branch)

  if (skillFiles.length === 0) {
    return { type: 'none', owner: parsed.owner, repo: parsed.repo, branch }
  }

  // If there's exactly one SKILL.md in root, import it automatically
  const rootSkillMd = skillFiles.find(
    (f) => f.path.toLowerCase() === 'skill.md' && f.type === 'skill'
  )
  if (rootSkillMd && skillFiles.filter((f) => f.type === 'skill').length === 1) {
    const skill = await importFromGitHubFile(
      rootSkillMd.rawUrl,
      parsed.owner,
      parsed.repo,
      rootSkillMd.path,
      branch,
      accountId,
      userId
    )
    return { type: 'single', skill }
  }

  // Multiple skill files found - return them for user selection
  return {
    type: 'multiple',
    skillFiles,
    owner: parsed.owner,
    repo: parsed.repo,
    branch,
  }
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

  // Determine description and category (with fallbacks)
  const description = metadata.description || extractDescriptionFromBody(body)
  const category = metadata.category || inferCategoryFromTags(metadata.tags, description)

  return createSkill({
    accountId,
    userId,
    name: metadata.name || name || 'Untitled Skill',
    description,
    version: metadata.version || '1.0.0',
    author: metadata.author,
    tags: metadata.tags || [],
    category,
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
    category: metadata.category || skill.category,
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
  category?: SkillCategory
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
        category: metadata.category || input.category || null,
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
    category?: SkillCategory
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
        category: metadata.category || input.category,
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
    category: metadata.category || indexEntry.category,
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

// =============================================================================
// SKILL USAGE TRACKING
// =============================================================================

export interface SkillUsageInput {
  accountId: string
  skillId: string
  taskId?: string
  agentId?: string
  userId: string
  success: boolean
  errorMessage?: string
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
  modelUsed?: string
  toolsUsed?: Array<{ name: string; success: boolean }>
}

export interface SkillUsageRecord {
  id: string
  accountId: string
  skillId: string
  taskId?: string
  agentId?: string
  userId: string
  executedAt: string
  success: boolean
  errorMessage?: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  modelUsed?: string
  toolsUsed: Array<{ name: string; success: boolean }>
  createdAt: string
}

export interface SkillUsageStats {
  skillId: string
  accountId: string
  skillName: string
  totalUses: number
  successfulUses: number
  failedUses: number
  successRate: number
  totalTokens: number
  totalDurationMs: number
  lastUsedAt?: string
  firstUsedAt?: string
}

/**
 * Record a skill usage event
 */
export async function recordSkillUsage(input: SkillUsageInput): Promise<SkillUsageRecord> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skill_usage')
    .insert(
      toSnakeCaseKeys({
        accountId: input.accountId,
        skillId: input.skillId,
        taskId: input.taskId || null,
        agentId: input.agentId || null,
        userId: input.userId,
        success: input.success,
        errorMessage: input.errorMessage || null,
        inputTokens: input.inputTokens || 0,
        outputTokens: input.outputTokens || 0,
        durationMs: input.durationMs || 0,
        modelUsed: input.modelUsed || null,
        toolsUsed: input.toolsUsed || [],
      })
    )
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<SkillUsageRecord>(data)
}

/**
 * Fetch usage stats for all skills in an account
 */
export async function fetchSkillUsageStats(accountId: string): Promise<SkillUsageStats[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skill_usage_stats')
    .select('*')
    .eq('account_id', accountId)
    .order('total_uses', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<SkillUsageStats>(row))
}

/**
 * Fetch usage stats for a specific skill
 */
export async function fetchSkillUsageStatsById(skillId: string): Promise<SkillUsageStats | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skill_usage_stats')
    .select('*')
    .eq('skill_id', skillId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return toCamelCaseKeys<SkillUsageStats>(data)
}

/**
 * Fetch recent usage history for a skill
 */
export async function fetchSkillUsageHistory(
  skillId: string,
  limit: number = 50
): Promise<SkillUsageRecord[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('skill_usage')
    .select('*')
    .eq('skill_id', skillId)
    .order('executed_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<SkillUsageRecord>(row))
}
