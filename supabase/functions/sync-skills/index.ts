// Sync Skills Edge Function
// Fetches skills from GitHub sources and community, populates skill_discovery table

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const GITHUB_API = 'https://api.github.com'

interface GitHubRepo {
  id: number
  full_name: string
  name: string
  owner: { login: string; avatar_url: string }
  description: string | null
  html_url: string
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  topics: string[]
  default_branch: string
  license: { name: string } | null
  created_at: string
  updated_at: string
  pushed_at: string
}

interface SkillSource {
  id: string
  owner: string
  repo: string
  source_type: 'official' | 'curated' | 'popular'
  is_active: boolean
}

// Build GitHub API headers
function getGitHubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AgentPM-Skills-Monitor',
  }

  const token = Deno.env.get('GITHUB_TOKEN')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

// Fetch a single GitHub repo
async function fetchGitHubRepo(
  owner: string,
  repo: string
): Promise<GitHubRepo | null> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: getGitHubHeaders(),
    })
    if (!res.ok) {
      console.error(`Failed to fetch ${owner}/${repo}: ${res.status}`)
      return null
    }
    return res.json()
  } catch (error) {
    console.error(`Error fetching ${owner}/${repo}:`, error)
    return null
  }
}

// Search GitHub for skills
async function searchGitHubRepos(query: string): Promise<GitHubRepo[]> {
  try {
    const res = await fetch(
      `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=30`,
      { headers: getGitHubHeaders() }
    )
    if (!res.ok) {
      console.error(`Search failed for "${query}": ${res.status}`)
      return []
    }
    const data = await res.json()
    return data.items || []
  } catch (error) {
    console.error(`Error searching for "${query}":`, error)
    return []
  }
}

// Try to fetch SKILL.md from various paths
async function fetchSkillMd(
  owner: string,
  repo: string,
  branch: string
): Promise<{ content: string; url: string } | null> {
  const paths = ['SKILL.md', 'skill.md', '.claude/SKILL.md', 'README.md']

  for (const path of paths) {
    try {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
      const res = await fetch(url)
      if (res.ok) {
        const content = await res.text()
        // Only return if it looks like a skill file (has frontmatter or skill-like content)
        if (
          content.includes('---') ||
          content.toLowerCase().includes('skill') ||
          content.toLowerCase().includes('claude')
        ) {
          return { content, url }
        }
      }
    } catch {
      continue
    }
  }
  return null
}

// Map GitHub topics to our category system
function mapTopicsToCategory(topics: string[]): string {
  for (const topic of topics || []) {
    const t = topic.toLowerCase()
    if (t.includes('develop') || t.includes('code') || t.includes('programming'))
      return 'development'
    if (t.includes('write') || t.includes('document') || t.includes('content'))
      return 'writing'
    if (t.includes('analy') || t.includes('data') || t.includes('research'))
      return 'analysis'
    if (t.includes('product') || t.includes('workflow') || t.includes('automat'))
      return 'productivity'
    if (t.includes('design') || t.includes('ui') || t.includes('ux'))
      return 'design'
    if (t.includes('devops') || t.includes('deploy') || t.includes('ci'))
      return 'devops'
    if (t.includes('secur') || t.includes('auth') || t.includes('crypto'))
      return 'security'
    if (t.includes('test') || t.includes('qa') || t.includes('quality'))
      return 'testing'
    if (t.includes('integrat') || t.includes('api') || t.includes('connect'))
      return 'integration'
    if (t.includes('commun') || t.includes('chat') || t.includes('message'))
      return 'communication'
  }
  return 'other'
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const reposMap = new Map<string, GitHubRepo & { source_type: string }>()
    const stats = { sources: 0, searched: 0, upserted: 0, snapshots: 0 }

    // 1. Fetch from configured sources
    const { data: sources, error: sourcesError } = await supabase
      .from('skill_sources')
      .select('*')
      .eq('is_active', true)

    if (sourcesError) {
      console.error('Error fetching sources:', sourcesError)
    }

    for (const source of (sources as SkillSource[]) || []) {
      const repo = await fetchGitHubRepo(source.owner, source.repo)
      if (repo) {
        reposMap.set(repo.full_name, { ...repo, source_type: source.source_type })
        stats.sources++
      }

      // Update last synced timestamp
      await supabase
        .from('skill_sources')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', source.id)
    }

    // 2. Search for community skills
    const searchQueries = [
      'claude-skills in:name,description',
      'claude-code skill in:name,description',
      'topic:claude-code',
      'topic:ai-skills claude',
      'topic:llm-skills',
      'anthropic skill in:name,description',
    ]

    for (const query of searchQueries) {
      const repos = await searchGitHubRepos(query)
      for (const repo of repos) {
        if (!reposMap.has(repo.full_name)) {
          reposMap.set(repo.full_name, { ...repo, source_type: 'community' })
          stats.searched++
        }
      }
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500))
    }

    // 3. Upsert skills into skill_discovery
    const skills = Array.from(reposMap.values())

    for (const repo of skills) {
      // Try to fetch SKILL.md
      const skillMd = await fetchSkillMd(
        repo.owner.login,
        repo.name,
        repo.default_branch
      )

      const category = mapTopicsToCategory(repo.topics)

      const { error: upsertError } = await supabase.from('skill_discovery').upsert(
        {
          github_id: repo.id,
          full_name: repo.full_name,
          name: repo.name,
          owner_login: repo.owner.login,
          owner_avatar_url: repo.owner.avatar_url,
          description: repo.description,
          html_url: repo.html_url,
          stargazers_count: repo.stargazers_count,
          forks_count: repo.forks_count,
          open_issues_count: repo.open_issues_count,
          topics: repo.topics,
          default_branch: repo.default_branch,
          license_name: repo.license?.name,
          source_type: repo.source_type,
          category,
          skill_md_url: skillMd?.url || null,
          skill_md_content: skillMd?.content?.slice(0, 50000) || null, // Limit content size
          github_created_at: repo.created_at,
          github_updated_at: repo.updated_at,
          github_pushed_at: repo.pushed_at,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'github_id',
        }
      )

      if (upsertError) {
        console.error(`Error upserting ${repo.full_name}:`, upsertError)
      } else {
        stats.upserted++
      }
    }

    // 4. Capture snapshots for trending analysis
    const { data: allSkills, error: snapshotError } = await supabase
      .from('skill_discovery_with_hotness')
      .select('id, stargazers_count, forks_count, hotness_score')

    if (snapshotError) {
      console.error('Error fetching skills for snapshots:', snapshotError)
    } else if (allSkills && allSkills.length > 0) {
      const snapshots = allSkills.map((s) => ({
        skill_id: s.id,
        stargazers_count: s.stargazers_count,
        forks_count: s.forks_count,
        hotness_score: s.hotness_score,
      }))

      const { error: insertError } = await supabase
        .from('skill_snapshots')
        .insert(snapshots)

      if (insertError) {
        console.error('Error inserting snapshots:', insertError)
      } else {
        stats.snapshots = snapshots.length
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        stats,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Sync error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
