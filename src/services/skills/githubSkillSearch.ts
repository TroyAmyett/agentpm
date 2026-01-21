// GitHub Skill Search Service
// Searches known skill repositories for SKILL.md files

export interface GitHubSkillResult {
  name: string
  description: string
  content: string
  repo: string
  path: string
  url: string
  stars?: number
}

// Known skill repositories to search
const SKILL_REPOS = [
  { owner: 'obra', repo: 'superpowers', description: 'Claude superpowers collection' },
  { owner: 'anthropics', repo: 'skills', description: 'Official Anthropic skills' },
  { owner: 'ComposioHQ', repo: 'awesome-claude-skills', description: 'Community curated skills' },
  { owner: 'VoltAgent', repo: 'awesome-claude-skills', description: 'VoltAgent skill collection' },
  { owner: 'alirezarezvani', repo: 'claude-skills', description: 'Community skills' },
]

// Cache for search results (expires after 5 minutes)
interface CacheEntry {
  results: GitHubSkillResult[]
  timestamp: number
}

const searchCache = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Search GitHub for skills matching the query
 * Uses GitHub's code search API to find SKILL.md files
 */
export async function searchGitHubSkills(query: string): Promise<GitHubSkillResult[]> {
  if (!query.trim()) return []

  // Check cache first
  const cacheKey = query.toLowerCase()
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results
  }

  const results: GitHubSkillResult[] = []

  // Search each repo for matching skills
  for (const { owner, repo } of SKILL_REPOS) {
    try {
      // Search for SKILL.md files in the repo
      // Using GitHub search API (no auth needed for public repos, but rate limited)
      const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(query)}+filename:SKILL.md+repo:${owner}/${repo}`

      const response = await fetch(searchUrl, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          // Note: Without auth, rate limit is 10 requests/minute
        },
      })

      if (response.status === 403) {
        // Rate limited - skip this repo
        console.warn(`GitHub rate limited for ${owner}/${repo}`)
        continue
      }

      if (!response.ok) continue

      const data = await response.json()

      // Process search results
      for (const item of (data.items || []).slice(0, 3)) {
        try {
          // Fetch the actual file content
          const contentResponse = await fetch(item.url, {
            headers: {
              Accept: 'application/vnd.github.v3+json',
            },
          })

          if (!contentResponse.ok) continue

          const contentData = await contentResponse.json()
          const content = atob(contentData.content) // Base64 decode

          // Parse frontmatter to get name and description
          const parsed = parseSkillFrontmatter(content)

          results.push({
            name: parsed.name || item.name.replace('.md', '').replace('SKILL', ''),
            description: parsed.description || '',
            content,
            repo: `${owner}/${repo}`,
            path: item.path,
            url: item.html_url,
          })
        } catch (err) {
          console.error(`Error fetching skill content from ${owner}/${repo}:`, err)
        }
      }
    } catch (err) {
      console.error(`Error searching ${owner}/${repo}:`, err)
    }
  }

  // Cache results
  searchCache.set(cacheKey, { results, timestamp: Date.now() })

  return results
}

/**
 * Get all skills from a specific repo (for browsing)
 */
export async function getRepoSkills(owner: string, repo: string): Promise<GitHubSkillResult[]> {
  const cacheKey = `repo:${owner}/${repo}`
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results
  }

  const results: GitHubSkillResult[] = []

  try {
    // Get repo tree to find all SKILL.md files
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`

    const response = await fetch(treeUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      console.error(`Failed to fetch repo tree: ${response.status}`)
      return []
    }

    const data = await response.json()

    // Find all SKILL.md files
    const skillFiles = (data.tree || []).filter(
      (item: { path: string; type: string }) =>
        item.type === 'blob' && item.path.endsWith('SKILL.md')
    )

    // Fetch content for each skill (limit to 10 to avoid rate limits)
    for (const file of skillFiles.slice(0, 10)) {
      try {
        const contentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`
        const contentResponse = await fetch(contentUrl, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
          },
        })

        if (!contentResponse.ok) continue

        const contentData = await contentResponse.json()
        const content = atob(contentData.content)

        const parsed = parseSkillFrontmatter(content)

        results.push({
          name: parsed.name || file.path.split('/').slice(-2, -1)[0] || 'skill',
          description: parsed.description || '',
          content,
          repo: `${owner}/${repo}`,
          path: file.path,
          url: contentData.html_url,
        })
      } catch (err) {
        console.error(`Error fetching ${file.path}:`, err)
      }
    }

    // Get repo stars
    try {
      const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      })
      if (repoResponse.ok) {
        const repoData = await repoResponse.json()
        results.forEach((r) => (r.stars = repoData.stargazers_count))
      }
    } catch {
      // Stars are optional, ignore errors
    }

    // Cache results
    searchCache.set(cacheKey, { results, timestamp: Date.now() })
  } catch (err) {
    console.error(`Error getting skills from ${owner}/${repo}:`, err)
  }

  return results
}

/**
 * Parse skill frontmatter to extract name and description
 */
function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return {}

  const frontmatter = frontmatterMatch[1]
  let name: string | undefined
  let description: string | undefined

  const nameMatch = frontmatter.match(/name:\s*["']?([^"'\n]+)["']?/)
  if (nameMatch) name = nameMatch[1].trim()

  const descMatch = frontmatter.match(/description:\s*["']?([^"'\n]+)["']?/)
  if (descMatch) description = descMatch[1].trim()

  return { name, description }
}

/**
 * Get list of available skill repositories
 */
export function getSkillRepositories() {
  return SKILL_REPOS
}
