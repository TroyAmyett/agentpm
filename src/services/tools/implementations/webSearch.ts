// Web Search Tool — searches the web using DuckDuckGo HTML (no API key)
// Falls back to a multi-source approach if DDG is blocked

import type { ToolResult } from '../types'

interface SearchResult {
  title: string
  url: string
  snippet: string
}

/**
 * Search the web using DuckDuckGo HTML search (no API key required)
 */
export async function webSearch(
  query: string,
  maxResults = 5
): Promise<ToolResult> {
  const startTime = Date.now()

  if (!query || query.trim().length === 0) {
    return { success: false, error: 'No search query provided' }
  }

  try {
    const results = await searchDuckDuckGo(query, maxResults)

    if (results.length === 0) {
      return {
        success: true,
        data: {
          query,
          results: [],
          formatted: `No results found for "${query}". Try rephrasing the query or using fetch_url on a known URL.`,
        },
        metadata: { executionTimeMs: Date.now() - startTime, source: 'duckduckgo' },
      }
    }

    const formatted = results
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
      .join('\n\n')

    return {
      success: true,
      data: {
        query,
        results,
        resultCount: results.length,
        formatted: `Web search results for "${query}":\n\n${formatted}`,
      },
      metadata: { executionTimeMs: Date.now() - startTime, source: 'duckduckgo' },
    }
  } catch (error) {
    console.error('[WebSearch] Error:', error)
    return {
      success: false,
      error: `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}. Try using fetch_url on a specific URL instead.`,
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }
}

/**
 * Search using DuckDuckGo HTML (no API key needed)
 * Uses allorigins proxy to handle CORS in browser
 */
async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query)
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encoded}`

  // Use allorigins CORS proxy (same as fetch_url tool)
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`

  const response = await fetch(proxyUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FunnelistsAgent/1.0)',
    },
  })

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`)
  }

  const html = await response.text()
  return parseDDGResults(html, maxResults)
}

/**
 * Parse DuckDuckGo HTML results
 */
function parseDDGResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []

  // DDG HTML search results are in <div class="result"> with <a class="result__a"> and <a class="result__snippet">
  // Match result blocks
  const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
  let match

  while ((match = resultPattern.exec(html)) !== null && results.length < maxResults) {
    let url = match[1]
    const title = stripHtml(match[2]).trim()
    const snippet = stripHtml(match[3]).trim()

    if (!title || !url) continue

    // DDG wraps URLs in a redirect — extract the actual URL
    const udMatch = url.match(/uddg=([^&]+)/)
    if (udMatch) {
      url = decodeURIComponent(udMatch[1])
    }

    // Skip DDG internal links
    if (url.includes('duckduckgo.com')) continue

    results.push({ title, url, snippet })
  }

  return results
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
