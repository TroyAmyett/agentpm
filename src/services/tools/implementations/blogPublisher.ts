// Blog Publisher Tool - Creates blog posts via the Funnelists CMS Content API
// All posts are created as drafts for human review. Only admins can publish.

import type { ToolResult } from '../types'

const CMS_BASE_URL = (import.meta.env.VITE_CMS_BASE_URL as string) || 'https://funnelists.com'

interface BlogPostParams {
  title: string
  slug: string
  content: string // Markdown body
  excerpt: string
  category: string
  seoTitle?: string
  metaDescription?: string
  heroImageUrl?: string
  heroImagePrompt?: string
  author?: string
  tags?: string[]
  pageType?: string // 'blog' | 'page' | 'landing' | 'product'
  contentFormat?: string // 'markdown' | 'html'
  publish?: boolean // IGNORED — all posts are created as drafts
}

/**
 * Create a blog post (or other page type) as a DRAFT via the CMS Content API.
 * All posts are drafts until an admin publishes them.
 */
export async function publishBlogPost(params: BlogPostParams): Promise<ToolResult> {
  const startTime = Date.now()

  // Validate required fields
  if (!params.title || !params.slug || !params.content) {
    return {
      success: false,
      error: 'Missing required fields: title, slug, and content are required',
    }
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(params.slug)) {
    return {
      success: false,
      error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
    }
  }

  try {
    // Strip duplicate H1 title from content if present
    let cleanContent = params.content.trim()
    const h1Match = cleanContent.match(/^#\s+(.+?)[\r\n]/)
    if (h1Match) {
      const h1Text = h1Match[1].trim()
      const titleNorm = params.title.toLowerCase().replace(/[^a-z0-9]/g, '')
      const h1Norm = h1Text.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (titleNorm === h1Norm || titleNorm.includes(h1Norm) || h1Norm.includes(titleNorm)) {
        cleanContent = cleanContent.slice(h1Match[0].length).trim()
      }
    }

    const pageType = params.pageType || 'blog'
    const contentFormat = params.contentFormat || 'markdown'

    // Determine the live URL based on page type
    const urlMap: Record<string, string> = {
      blog: `/insights/${params.slug}`,
      page: `/${params.slug}`,
      landing: `/lp/${params.slug}`,
    }
    const pagePath = urlMap[pageType] || `/${params.slug}`
    const siteUrl = `${CMS_BASE_URL}${pagePath}`

    // Call the CMS Content API via server-side proxy (avoids CORS)
    console.log(`[BlogPublisher] Creating ${pageType} via CMS proxy: ${params.slug}`)
    const response = await fetch('/api/cms-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: params.title,
        slug: params.slug,
        content: cleanContent,
        contentFormat,
        pageType,
        description: params.excerpt,
        category: params.category,
        tags: params.tags || [],
        featuredImage: params.heroImageUrl,
        metaTitle: params.seoTitle,
        metaDescription: params.metaDescription,
        createdBy: params.author || 'agent',
      }),
    })

    const data = await response.json().catch(() => ({ error: `HTTP ${response.status} (no JSON body)` }))

    if (!response.ok) {
      const errorDetail = typeof data === 'object'
        ? JSON.stringify(data, null, 2)
        : String(data)
      console.error(`[BlogPublisher] CMS API error (${response.status}):`, errorDetail)
      return {
        success: false,
        error: `CMS API returned ${response.status}: ${data.error || data.message || errorDetail}.\n\nCheck that the CMS API key is configured in Vercel env vars and the CMS API is accepting requests. The blog content was NOT published.`,
        metadata: { executionTimeMs: Date.now() - startTime },
      }
    }

    console.log(`[BlogPublisher] Draft created: ${params.slug}`)

    return {
      success: true,
      data: {
        slug: params.slug,
        status: 'draft',
        pageType,
        siteUrl,
        previewUrl: `${CMS_BASE_URL}/api/pages/${params.slug}/preview`,
        title: params.title,
        excerpt: params.excerpt,
        category: params.category,
        seoTitle: params.seoTitle,
        seoDescription: params.metaDescription,
        tags: params.tags,
        heroImageUrl: params.heroImageUrl,
        formatted: `Draft ${pageType} created — awaiting admin review.\n\n` +
          `Title: ${params.title}\n` +
          `Slug: ${params.slug}\n` +
          `Type: ${pageType}\n` +
          `Category: ${params.category || 'none'}\n` +
          (params.heroImageUrl ? `Hero Image: ${params.heroImageUrl}\n` : '') +
          `\nAn admin must publish this page before it goes live at ${siteUrl}`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'cms-api',
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
 * @deprecated Publishing is now admin-only via the CMS admin UI.
 * This function is kept for backwards compatibility but returns an error.
 */
export async function publishDraftPost(_slug: string): Promise<{ success: boolean; error?: string; siteUrl?: string }> {
  return {
    success: false,
    error: 'Direct publishing is no longer supported. An admin must publish pages via the CMS admin UI at /admin/pages.',
  }
}
