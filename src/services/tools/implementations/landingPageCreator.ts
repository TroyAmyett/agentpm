// Landing Page Creator Tool Implementation
// Creates landing pages in funnelists-cms via GitHub API

import type { ToolResult } from '../types'

// GitHub configuration
const GITHUB_OWNER = 'funnelists'
const GITHUB_REPO = 'funnelists-cms'
const GITHUB_BRANCH = 'main'

export interface LandingPageContent {
  meta?: {
    title?: string
    description?: string
    noIndex?: boolean
  }
  hero: {
    headline: string
    subheadline?: string
    backgroundImage?: string
    backgroundVideo?: string
    ctaText?: string
  }
  content?: {
    sections?: Array<{
      type: 'text-block' | 'feature-list' | 'testimonial' | 'video' | 'countdown' | 'image' | 'cta-banner'
      [key: string]: unknown
    }>
  }
  form?: {
    heading?: string
    description?: string
    fields: Array<{
      name: string
      type: string
      label: string
      required?: boolean
      placeholder?: string
      options?: Array<{ value: string; label: string }>
    }>
    submitText: string
    successMessage: string
    successRedirect?: string
  }
  pricing?: {
    heading?: string
    description?: string
    guarantee?: string
    tiers: Array<{
      id: string
      name: string
      price: number
      stripePriceId: string
      features: string[]
      ctaText?: string
      highlighted?: boolean
      interval?: string
      description?: string
    }>
  }
  upsell?: {
    title: string
    description?: string
    price: number
    originalPrice?: number
    stripePriceId: string
    features?: string[]
    ctaText?: string
    skipUrl?: string
    badge?: string
    interval?: string
  }
  funnel?: {
    funnelId: string
    position: number
    nextPageSlug?: string
    previousPageSlug?: string
    trackingParams?: string[]
  }
}

interface CreateLandingPageParams {
  pageType: 'lead-capture' | 'waitlist' | 'product-purchase' | 'upsell'
  slug: string
  content: LandingPageContent
  funnelId?: string
  publish?: boolean
}

/**
 * Create a landing page in funnelists-cms
 */
export async function createLandingPage(params: CreateLandingPageParams): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    // Validate required fields
    if (!params.pageType || !params.slug || !params.content) {
      return {
        success: false,
        error: 'Missing required fields: pageType, slug, and content are required',
      }
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/
    if (!slugRegex.test(params.slug)) {
      return {
        success: false,
        error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
      }
    }

    // Build the landing page JSON structure
    const landingPage = {
      slug: params.slug,
      pageType: params.pageType,
      status: params.publish ? 'published' : 'draft',
      meta: params.content.meta || {
        title: params.content.hero?.headline || params.slug,
        description: params.content.hero?.subheadline || '',
        noIndex: !params.publish,
      },
      hero: params.content.hero,
      content: params.content.content || { sections: [] },
      ...(params.content.form && { form: params.content.form }),
      ...(params.content.pricing && { pricing: params.content.pricing }),
      ...(params.content.upsell && { upsell: params.content.upsell }),
      funnel: params.content.funnel || (params.funnelId ? {
        funnelId: params.funnelId,
        position: 1,
        trackingParams: ['utm_source', 'utm_medium', 'utm_campaign'],
      } : undefined),
      createdAt: new Date().toISOString(),
      createdBy: 'agentpm-tool',
    }

    // Convert to JSON string
    const jsonContent = JSON.stringify(landingPage, null, 2)
    const filePath = `content/landing-pages/${params.slug}.json`

    // If publish is true, commit to GitHub (via server-side proxy)
    if (params.publish) {
      const commitResult = await commitToGitHub(
        filePath,
        jsonContent,
        `Add landing page: ${params.slug}`
      )

      if (!commitResult.success) {
        return {
          success: false,
          error: `Failed to publish to GitHub: ${commitResult.error}`,
          metadata: {
            executionTimeMs: Date.now() - startTime,
          },
        }
      }

      return {
        success: true,
        data: {
          message: `Landing page "${params.slug}" created and published successfully`,
          slug: params.slug,
          pageType: params.pageType,
          url: `/lp/${params.slug}`,
          status: 'published',
          commitSha: commitResult.sha,
          note: 'Vercel will automatically rebuild the site. Page should be live in 1-2 minutes.',
          formatted: `✅ Landing page created and published!

**Page Details:**
- Slug: ${params.slug}
- Type: ${params.pageType}
- URL: /lp/${params.slug}
- Status: Published

The page has been committed to GitHub and Vercel will automatically rebuild.
Your page should be live at https://funnelists.com/lp/${params.slug} within 1-2 minutes.`,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          source: 'github-api',
        },
      }
    }

    // If not publishing, just return the JSON (for review/testing)
    return {
      success: true,
      data: {
        message: `Landing page "${params.slug}" JSON generated (not published)`,
        slug: params.slug,
        pageType: params.pageType,
        status: 'draft',
        json: landingPage,
        note: 'Set publish=true to commit to GitHub and deploy to Vercel.',
        formatted: `✅ Landing page JSON generated (draft mode)

**Page Details:**
- Slug: ${params.slug}
- Type: ${params.pageType}
- Status: Draft

To publish, call this tool again with publish=true.

**Generated JSON Preview:**
\`\`\`json
${JSON.stringify(landingPage, null, 2).substring(0, 500)}...
\`\`\``,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    }

  } catch (error) {
    return {
      success: false,
      error: `Failed to create landing page: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    }
  }
}

/**
 * Commit a file to GitHub
 */
async function commitToGitHub(
  filePath: string,
  content: string,
  message: string
): Promise<{ success: boolean; sha?: string; error?: string }> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`

  try {
    // Check if file already exists (to get SHA for update) via server-side proxy
    let existingSha: string | undefined
    try {
      const getResponse = await fetch('/api/github-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl, method: 'GET' }),
      })
      if (getResponse.ok) {
        const existing = await getResponse.json()
        existingSha = existing.sha
      }
    } catch {
      // File doesn't exist, that's fine
    }

    // Create or update file via server-side proxy
    const ghBody: {
      message: string
      content: string
      branch: string
      sha?: string
    } = {
      message,
      content: btoa(content),
      branch: GITHUB_BRANCH,
    }

    if (existingSha) {
      ghBody.sha = existingSha
    }

    const response = await fetch('/api/github-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: apiUrl, method: 'PUT', body: ghBody }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`,
      }
    }

    const result = await response.json()
    return {
      success: true,
      sha: result.commit?.sha,
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
