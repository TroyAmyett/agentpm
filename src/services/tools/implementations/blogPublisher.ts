// Blog Publisher Tool - Publishes blog posts to funnelists-cms via GitHub API
// Commits markdown + hero image to GitHub, triggers Vercel rebuild

import type { ToolResult } from '../types'

const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN as string || ''
const GITHUB_OWNER = (import.meta.env.VITE_CMS_GITHUB_OWNER as string) || 'troyamyett'
const GITHUB_REPO = (import.meta.env.VITE_CMS_GITHUB_REPO as string) || 'funnelists-cms'
const GITHUB_BRANCH = (import.meta.env.VITE_CMS_GITHUB_BRANCH as string) || 'master'

interface BlogPostParams {
  title: string
  slug: string
  content: string // Markdown body
  excerpt: string
  category: string
  seoTitle?: string
  metaDescription?: string
  heroImageUrl?: string // URL of hero image to download and commit
  heroImagePrompt?: string // Prompt used to generate the image
  author?: string
  tags?: string[]
  publish?: boolean // true = published, false = draft
}

/**
 * Build YAML frontmatter for the blog post
 */
function buildFrontmatter(params: BlogPostParams, heroImagePath?: string): string {
  const date = new Date().toISOString().split('T')[0]

  const lines: string[] = ['---']

  lines.push(`title: "${escapeYaml(params.title)}"`)
  lines.push(`date: ${date}`)
  lines.push(`author: ${params.author || 'Troy Amyett'}`)
  lines.push(`category: ${params.category}`)
  lines.push(`status: ${params.publish ? 'published' : 'draft'}`)
  lines.push(`featured: false`)
  lines.push(`excerpt: "${escapeYaml(params.excerpt)}"`)

  if (params.seoTitle) {
    lines.push(`seoTitle: "${escapeYaml(params.seoTitle)}"`)
  }
  if (params.metaDescription) {
    lines.push(`seoDescription: "${escapeYaml(params.metaDescription)}"`)
  }

  if (params.tags && params.tags.length > 0) {
    lines.push(`tags:`)
    for (const tag of params.tags) {
      lines.push(`  - ${tag}`)
    }
  } else {
    lines.push(`tags: []`)
  }

  if (heroImagePath) {
    lines.push(`heroImage:`)
    lines.push(`  url: "${heroImagePath}"`)
    if (params.heroImagePrompt) {
      lines.push(`  prompt: "${escapeYaml(params.heroImagePrompt)}"`)
    }
    lines.push(`  generatedAt: "${date}"`)
  }

  lines.push(`generation:`)
  lines.push(`  generatedBy: agent`)
  lines.push(`  generatedAt: "${date}"`)
  lines.push(`  version: 1`)

  lines.push('---')
  return lines.join('\n')
}

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, ' ')
}

/**
 * Commit a file to GitHub (create or update)
 */
async function commitToGitHub(
  filePath: string,
  contentBase64: string,
  message: string
): Promise<{ success: boolean; sha?: string; error?: string }> {
  if (!GITHUB_TOKEN) {
    return { success: false, error: 'VITE_GITHUB_TOKEN not configured. Add a GitHub Personal Access Token with repo write permissions.' }
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`

  try {
    // Check if file exists (need SHA for updates)
    let existingSha: string | undefined
    try {
      const getResponse = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
      if (getResponse.ok) {
        const existing = await getResponse.json()
        existingSha = existing.sha
      }
    } catch {
      // File doesn't exist - fine
    }

    const body: Record<string, string> = {
      message,
      content: contentBase64,
      branch: GITHUB_BRANCH,
    }
    if (existingSha) {
      body.sha = existingSha
    }

    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, error: errorData.message || `HTTP ${response.status}` }
    }

    const result = await response.json()
    return { success: true, sha: result.commit?.sha }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Download an image and return base64
 */
async function downloadImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    // Convert to base64 in chunks to avoid call stack overflow
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }

    return {
      base64: btoa(binary),
      mimeType: blob.type || 'image/png',
    }
  } catch (error) {
    console.warn('[BlogPublisher] Image download failed:', error)
    return null
  }
}

/**
 * Publish a blog post to funnelists-cms
 */
export async function publishBlogPost(params: BlogPostParams): Promise<ToolResult> {
  const startTime = Date.now()

  // Validate required fields
  if (!params.title || !params.slug || !params.content || !params.excerpt || !params.category) {
    return {
      success: false,
      error: 'Missing required fields: title, slug, content, excerpt, and category are required',
    }
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(params.slug)) {
    return {
      success: false,
      error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
    }
  }

  if (!GITHUB_TOKEN) {
    return {
      success: false,
      error: 'VITE_GITHUB_TOKEN not configured. Add a GitHub Personal Access Token with repo write permissions to your .env.local file.',
    }
  }

  try {
    let heroImagePath: string | undefined

    // Step 1: If hero image URL provided, download and commit image
    if (params.heroImageUrl) {
      console.log(`[BlogPublisher] Downloading hero image...`)
      const imageData = await downloadImageAsBase64(params.heroImageUrl)

      if (imageData) {
        const ext = imageData.mimeType.includes('png') ? 'png' : 'jpg'
        const imageFilePath = `public/images/blog/${params.slug}-hero.${ext}`
        heroImagePath = `/images/blog/${params.slug}-hero.${ext}`

        console.log(`[BlogPublisher] Committing hero image: ${imageFilePath}`)
        const imageCommit = await commitToGitHub(
          imageFilePath,
          imageData.base64,
          `Add hero image for: ${params.title}`
        )

        if (!imageCommit.success) {
          console.warn(`[BlogPublisher] Hero image commit failed: ${imageCommit.error}`)
          // Continue without image - don't fail the whole post
        }
      } else {
        console.warn('[BlogPublisher] Could not download hero image, continuing without it')
      }
    }

    // Step 2: Build the markdown content with frontmatter
    const frontmatter = buildFrontmatter(params, heroImagePath)
    const fullContent = `${frontmatter}\n\n${params.content}`
    const postPath = `content/blog/${params.slug}.md`

    // Base64 encode the markdown content
    const contentBase64 = btoa(unescape(encodeURIComponent(fullContent)))

    console.log(`[BlogPublisher] Committing post: ${postPath}`)
    const postCommit = await commitToGitHub(
      postPath,
      contentBase64,
      `Add ${params.publish ? '' : 'draft '}blog post: ${params.title}`
    )

    if (!postCommit.success) {
      return {
        success: false,
        error: `Failed to commit blog post: ${postCommit.error}`,
        metadata: { executionTimeMs: Date.now() - startTime },
      }
    }

    const siteUrl = `https://funnelists.com/blog/${params.slug}`
    const status = params.publish ? 'published' : 'draft'

    console.log(`[BlogPublisher] Blog post ${status}: ${siteUrl}`)

    return {
      success: true,
      data: {
        slug: params.slug,
        status,
        siteUrl,
        postPath,
        heroImagePath,
        commitSha: postCommit.sha,
        formatted: `Blog post ${status} successfully!\n\n` +
          `Title: ${params.title}\n` +
          `Slug: ${params.slug}\n` +
          `Category: ${params.category}\n` +
          `Status: ${status}\n` +
          `URL: ${siteUrl}\n` +
          (heroImagePath ? `Hero Image: ${heroImagePath}\n` : '') +
          `\nThe post has been committed to GitHub. Vercel will automatically rebuild the site.\n` +
          `The post should be live at ${siteUrl} within 1-2 minutes.`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'github-api',
      },
    }
  } catch (error) {
    console.error('[BlogPublisher] Error:', error)
    return {
      success: false,
      error: `Blog publishing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }
}
