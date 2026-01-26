// Skill Discovery Service
// Fetches trending/hot skills from skill_discovery_with_hotness view

import { supabase } from '@/services/supabase/client'
import type { DiscoveredSkill, DiscoverySortOption, DiscoverySourceType, DiscoveryStats } from '@/types/agentpm'

// Convert snake_case DB row to camelCase
function mapDbRowToDiscoveredSkill(row: Record<string, unknown>): DiscoveredSkill {
  return {
    id: row.id as string,
    githubId: row.github_id as number,
    fullName: row.full_name as string,
    name: row.name as string,
    ownerLogin: row.owner_login as string,
    ownerAvatarUrl: row.owner_avatar_url as string | null,
    description: row.description as string | null,
    htmlUrl: row.html_url as string,
    stargazersCount: row.stargazers_count as number,
    forksCount: row.forks_count as number,
    openIssuesCount: row.open_issues_count as number,
    topics: (row.topics as string[]) || [],
    defaultBranch: row.default_branch as string,
    licenseName: row.license_name as string | null,
    sourceType: row.source_type as DiscoverySourceType,
    category: row.category as string | null,
    skillMdUrl: row.skill_md_url as string | null,
    skillMdContent: row.skill_md_content as string | null,
    aiSummary: row.ai_summary as string | null,
    aiSummaryUpdatedAt: row.ai_summary_updated_at as string | null,
    githubCreatedAt: row.github_created_at as string,
    githubUpdatedAt: row.github_updated_at as string,
    githubPushedAt: row.github_pushed_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    hotnessScore: row.hotness_score as number,
    isNew: row.is_new as boolean,
    isRecentlyUpdated: row.is_recently_updated as boolean,
    isHot: row.is_hot as boolean,
  }
}

interface FetchDiscoveredSkillsOptions {
  search?: string
  sort?: DiscoverySortOption
  sourceFilter?: DiscoverySourceType | 'all'
  categoryFilter?: string | 'all'
  limit?: number
}

export async function fetchDiscoveredSkills(
  options: FetchDiscoveredSkillsOptions = {}
): Promise<DiscoveredSkill[]> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  const {
    search = '',
    sort = 'hotness',
    sourceFilter = 'all',
    categoryFilter = 'all',
    limit = 100,
  } = options

  let query = supabase
    .from('skill_discovery_with_hotness')
    .select('*')
    .limit(limit)

  // Search filter
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,description.ilike.%${search}%,owner_login.ilike.%${search}%`
    )
  }

  // Source filter
  if (sourceFilter !== 'all') {
    query = query.eq('source_type', sourceFilter)
  }

  // Category filter
  if (categoryFilter !== 'all') {
    query = query.eq('category', categoryFilter)
  }

  // Sorting
  switch (sort) {
    case 'hotness':
      query = query.order('hotness_score', { ascending: false })
      break
    case 'stars':
      query = query.order('stargazers_count', { ascending: false })
      break
    case 'recent':
      query = query.order('github_updated_at', { ascending: false })
      break
    case 'new':
      query = query.order('github_created_at', { ascending: false })
      break
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching discovered skills:', error)
    throw error
  }

  return (data || []).map(mapDbRowToDiscoveredSkill)
}

export async function fetchDiscoveryStats(): Promise<DiscoveryStats> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  const { data, error } = await supabase
    .from('skill_discovery_with_hotness')
    .select('stargazers_count, github_created_at, is_hot')

  if (error) {
    console.error('Error fetching discovery stats:', error)
    throw error
  }

  const skills = data || []
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  return {
    total: skills.length,
    totalStars: skills.reduce((sum, s) => sum + (s.stargazers_count || 0), 0),
    newThisWeek: skills.filter((s) => new Date(s.github_created_at) > weekAgo).length,
    hotCount: skills.filter((s) => s.is_hot).length,
  }
}

export async function fetchDiscoveredSkillById(id: string): Promise<DiscoveredSkill | null> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  const { data, error } = await supabase
    .from('skill_discovery_with_hotness')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    console.error('Error fetching discovered skill:', error)
    throw error
  }

  return data ? mapDbRowToDiscoveredSkill(data) : null
}

// Import a discovered skill to user's account
export async function importDiscoveredSkill(
  discoveredSkill: DiscoveredSkill,
  accountId: string,
  userId: string
): Promise<void> {
  // Use the existing import from GitHub flow
  const { importFromGitHub } = await import('./index')
  await importFromGitHub(discoveredSkill.htmlUrl, accountId, userId)
}
