// Blog Publisher Tool - Commits blog posts as DRAFTS to funnelists-cms via GitHub API
// All posts are created as drafts for human review. Use publishDraftPost() to go live.

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
  publish?: boolean // IGNORED — all posts are created as drafts for review
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
  lines.push(`status: draft`)
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
 * Create a blog post as a DRAFT in funnelists-cms.
 * All posts are drafts until explicitly published via publishDraftPost().
 */
export async function publishBlogPost(params: BlogPostParams): Promise<ToolResult> {
  const startTime = Date.now()

  // Force draft — never auto-publish
  params.publish = false

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
    // Strip duplicate H1 title from content if present (title is in frontmatter)
    let cleanContent = params.content.trim()
    const h1Match = cleanContent.match(/^#\s+(.+?)[\r\n]/)
    if (h1Match) {
      // Remove the H1 if it matches or closely matches the title
      const h1Text = h1Match[1].trim()
      const titleNorm = params.title.toLowerCase().replace(/[^a-z0-9]/g, '')
      const h1Norm = h1Text.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (titleNorm === h1Norm || titleNorm.includes(h1Norm) || h1Norm.includes(titleNorm)) {
        cleanContent = cleanContent.slice(h1Match[0].length).trim()
      }
    }

    const frontmatter = buildFrontmatter(params, heroImagePath)
    const fullContent = `${frontmatter}\n\n${cleanContent}`
    const postPath = `content/blog/${params.slug}.md`

    // Base64 encode the markdown content
    const contentBase64 = btoa(unescape(encodeURIComponent(fullContent)))

    console.log(`[BlogPublisher] Committing draft post: ${postPath}`)
    const postCommit = await commitToGitHub(
      postPath,
      contentBase64,
      `Add draft blog post: ${params.title}`
    )

    if (!postCommit.success) {
      return {
        success: false,
        error: `Failed to commit blog post: ${postCommit.error}`,
        metadata: { executionTimeMs: Date.now() - startTime },
      }
    }

    const siteUrl = `https://funnelists.com/insights/${params.slug}`
    const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${postPath}`

    console.log(`[BlogPublisher] Draft committed: ${githubUrl}`)

    return {
      success: true,
      data: {
        slug: params.slug,
        status: 'draft',
        siteUrl,
        githubUrl,
        postPath,
        heroImagePath,
        commitSha: postCommit.sha,
        title: params.title,
        excerpt: params.excerpt,
        category: params.category,
        seoTitle: params.seoTitle,
        seoDescription: params.metaDescription,
        tags: params.tags,
        content: params.content,
        formatted: `Draft blog post created — awaiting review.\n\n` +
          `Title: ${params.title}\n` +
          `Slug: ${params.slug}\n` +
          `Category: ${params.category}\n` +
          (heroImagePath ? `Hero Image: ${heroImagePath}\n` : '') +
          `\nReview the content above and click "Publish" when ready.\n` +
          `The post will go live at ${siteUrl} after publishing.`,
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

/**
 * Publish a draft blog post by changing its frontmatter status from 'draft' to 'published'.
 * Fetches the existing file from GitHub, updates the status line, and commits.
 */
export async function publishDraftPost(slug: string): Promise<{ success: boolean; error?: string; siteUrl?: string }> {
  if (!GITHUB_TOKEN) {
    return { success: false, error: 'VITE_GITHUB_TOKEN not configured.' }
  }

  const filePath = `content/blog/${slug}.md`
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`

  try {
    // Fetch the current file
    const getResponse = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!getResponse.ok) {
      return { success: false, error: `Draft not found: ${slug}` }
    }

    const fileData = await getResponse.json()
    const existingContent = atob(fileData.content.replace(/\n/g, ''))

    // Change status: draft → status: published in frontmatter
    const updatedContent = existingContent.replace(
      /^status:\s*draft\s*$/m,
      'status: published'
    )

    if (updatedContent === existingContent) {
      // Already published or no status line found
      const isPublished = /^status:\s*published\s*$/m.test(existingContent)
      if (isPublished) {
        return { success: true, siteUrl: `https://funnelists.com/insights/${slug}` }
      }
      return { success: false, error: 'Could not find draft status in frontmatter' }
    }

    // Commit the updated file
    const contentBase64 = btoa(unescape(encodeURIComponent(updatedContent)))
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Publish blog post: ${slug}`,
        content: contentBase64,
        sha: fileData.sha,
        branch: GITHUB_BRANCH,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, error: errorData.message || `HTTP ${response.status}` }
    }

    console.log(`[BlogPublisher] Published: ${slug}`)
    return { success: true, siteUrl: `https://funnelists.com/insights/${slug}` }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
