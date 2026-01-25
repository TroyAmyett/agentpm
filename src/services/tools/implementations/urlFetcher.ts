// URL Fetcher Tool
// Fetches and extracts content from URLs

import type { ToolResult } from '../types'

interface FetchResult {
  url: string
  title?: string
  description?: string
  content?: string
  html?: string
  metadata?: {
    author?: string
    publishedAt?: string
    siteName?: string
  }
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Extract text content from HTML
 * Removes scripts, styles, and extracts main content
 */
function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ')

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

/**
 * Extract metadata from HTML
 */
function extractMetadata(html: string): { title?: string; description?: string; author?: string; siteName?: string } {
  const result: { title?: string; description?: string; author?: string; siteName?: string } = {}

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  if (titleMatch) {
    result.title = titleMatch[1].trim()
  }

  // Extract meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)
  if (descMatch) {
    result.description = descMatch[1].trim()
  }

  // Extract OG description if no meta description
  if (!result.description) {
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i)
    if (ogDescMatch) {
      result.description = ogDescMatch[1].trim()
    }
  }

  // Extract author
  const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']*)["']/i)
  if (authorMatch) {
    result.author = authorMatch[1].trim()
  }

  // Extract site name
  const siteMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)["']/i)
  if (siteMatch) {
    result.siteName = siteMatch[1].trim()
  }

  return result
}

/**
 * Fetch content from a URL
 */
export async function fetchUrl(
  url: string,
  extractType: 'text' | 'html' | 'metadata' = 'text'
): Promise<ToolResult> {
  const startTime = Date.now()

  if (!url) {
    return {
      success: false,
      error: 'No URL provided',
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }

  // Ensure URL has protocol
  let fullUrl = url
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    fullUrl = 'https://' + fullUrl
  }

  if (!isValidUrl(fullUrl)) {
    return {
      success: false,
      error: 'Invalid URL format',
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }

  try {
    // Use a CORS proxy for browser-based fetching
    // In production, this should go through your own backend
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(fullUrl)}`

    const response = await fetch(proxyUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
        metadata: { executionTimeMs: Date.now() - startTime },
      }
    }

    const html = await response.text()
    const metadata = extractMetadata(html)

    const result: FetchResult = {
      url: fullUrl,
      title: metadata.title,
      description: metadata.description,
    }

    switch (extractType) {
      case 'html':
        result.html = html.slice(0, 50000) // Limit size
        break
      case 'metadata':
        result.metadata = {
          author: metadata.author,
          siteName: metadata.siteName,
        }
        break
      case 'text':
      default:
        result.content = extractTextFromHtml(html).slice(0, 20000) // Limit size
        break
    }

    return {
      success: true,
      data: result,
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'web',
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }
}
