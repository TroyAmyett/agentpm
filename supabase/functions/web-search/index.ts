// Web Search Edge Function
// Provides web search capabilities for the AI chat
// Uses Brave Search API for web results

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SearchRequest {
  query: string
  count?: number // Number of results to return (default 5, max 20)
}

interface BraveSearchResult {
  title: string
  url: string
  description: string
  age?: string
}

interface BraveWebSearchResponse {
  web?: {
    results: Array<{
      title: string
      url: string
      description: string
      age?: string
      extra_snippets?: string[]
    }>
  }
  query?: {
    original: string
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const braveApiKey = Deno.env.get('BRAVE_SEARCH_API_KEY')

    if (!braveApiKey) {
      // If no Brave API key, use DuckDuckGo instant answers as fallback (no API key needed)
      const body: SearchRequest = await req.json()
      const results = await searchDuckDuckGo(body.query)

      return new Response(
        JSON.stringify({
          success: true,
          query: body.query,
          results,
          source: 'duckduckgo',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request
    const body: SearchRequest = await req.json()

    if (!body.query) {
      return new Response(
        JSON.stringify({ error: 'query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const count = Math.min(body.count || 5, 20)

    // Call Brave Search API
    const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search')
    searchUrl.searchParams.set('q', body.query)
    searchUrl.searchParams.set('count', count.toString())
    searchUrl.searchParams.set('text_decorations', 'false')
    searchUrl.searchParams.set('safesearch', 'moderate')

    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': braveApiKey,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Brave Search error:', response.status, errorText)
      throw new Error(`Search API error: ${response.status}`)
    }

    const data: BraveWebSearchResponse = await response.json()

    // Transform results to a simpler format
    const results: BraveSearchResult[] = (data.web?.results || []).map(result => ({
      title: result.title,
      url: result.url,
      description: result.description,
      age: result.age,
    }))

    return new Response(
      JSON.stringify({
        success: true,
        query: data.query?.original || body.query,
        results,
        source: 'brave',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Web search error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

// DuckDuckGo fallback (uses their instant answer API - no key required)
async function searchDuckDuckGo(query: string): Promise<BraveSearchResult[]> {
  try {
    // DuckDuckGo Instant Answer API
    const url = new URL('https://api.duckduckgo.com/')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('no_redirect', '1')
    url.searchParams.set('skip_disambig', '1')

    const response = await fetch(url.toString())
    const data = await response.json()

    const results: BraveSearchResult[] = []

    // Add abstract if available
    if (data.Abstract && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        description: data.Abstract,
      })
    }

    // Add related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 60),
            url: topic.FirstURL,
            description: topic.Text,
          })
        }
      }
    }

    // If no results from instant answers, we'll need to note that
    if (results.length === 0) {
      results.push({
        title: 'No instant results available',
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        description: `Search DuckDuckGo directly for "${query}" to find more results. The instant answer API has limited coverage.`,
      })
    }

    return results
  } catch (error) {
    console.error('DuckDuckGo search error:', error)
    return [{
      title: 'Search unavailable',
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      description: 'Unable to perform search. Please try searching directly on the web.',
    }]
  }
}
