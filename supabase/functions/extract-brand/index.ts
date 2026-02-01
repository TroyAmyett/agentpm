// Brand Extraction Edge Function
// Fetches a website and uses AI to extract brand assets (logo, colors, company info)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExtractBrandRequest {
  url: string
  accountId: string
}

interface DetectedLogo {
  url: string
  type: 'primary' | 'secondary' | 'favicon'
  width?: number
  height?: number
  uploadedUrl?: string
}

interface DetectedColor {
  hex: string
  usage: 'primary' | 'secondary' | 'accent' | 'background' | 'text'
  source: 'css' | 'logo' | 'meta' | 'image'
}

interface BrandExtractionResult {
  companyName: string
  tagline?: string
  suggestedPrefix: string
  logos: DetectedLogo[]
  colors: DetectedColor[]
  fonts: string[]
  confidence: number
  sourceUrl: string
  extractedAt: string
  websiteHasDarkBackground?: boolean
  logoDesignedForDarkBackground?: boolean
}

interface ParsedPageData {
  title: string
  description: string
  ogData: Record<string, string>
  logos: Array<{ url: string; type: string; alt?: string }>
  cssColors: string[]
  favicons: string[]
  fonts: string[]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: ExtractBrandRequest = await req.json()

    if (!body.url || !body.accountId) {
      return new Response(
        JSON.stringify({ error: 'url and accountId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Normalize URL
    let url = body.url.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }

    console.log('[extract-brand] Fetching website:', url)

    // 1. Fetch the website HTML
    const html = await fetchWebsite(url)

    // 2. Parse page data (meta tags, logos, colors)
    const pageData = parsePageData(html, url)
    console.log('[extract-brand] Parsed page data:', {
      title: pageData.title,
      logoCount: pageData.logos.length,
      colorCount: pageData.cssColors.length,
    })

    // 3. Use Claude to analyze and extract brand info
    const brandResult = await analyzeWithClaude(pageData, url)
    console.log('[extract-brand] Claude analysis complete:', {
      companyName: brandResult.companyName,
      confidence: brandResult.confidence,
    })

    // 4. Download and upload logos to Supabase Storage
    const uploadedLogos = await uploadLogos(
      brandResult.logos,
      body.accountId,
      url,
      brandResult.logoDesignedForDarkBackground || false
    )
    console.log('[extract-brand] Uploaded logos:', uploadedLogos.length)

    // 5. Build final result
    const result: BrandExtractionResult = {
      ...brandResult,
      logos: uploadedLogos,
      sourceUrl: url,
      extractedAt: new Date().toISOString(),
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[extract-brand] Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================================================
// FETCH WEBSITE
// ============================================================================

async function fetchWebsite(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FunnelistsBrandBot/1.0; +https://funnelists.com)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

// ============================================================================
// PARSE PAGE DATA
// ============================================================================

function parsePageData(html: string, baseUrl: string): ParsedPageData {
  const result: ParsedPageData = {
    title: '',
    description: '',
    ogData: {},
    logos: [],
    cssColors: [],
    favicons: [],
    fonts: [],
  }

  // Parse base URL for resolving relative URLs
  const base = new URL(baseUrl)

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    result.title = decodeHtmlEntities(titleMatch[1].trim())
  }

  // Extract meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  if (descMatch) {
    result.description = decodeHtmlEntities(descMatch[1].trim())
  }

  // Extract Open Graph data
  const ogMatches = html.matchAll(/<meta[^>]+property=["'](og:[^"']+)["'][^>]+content=["']([^"']+)["']/gi)
  for (const match of ogMatches) {
    result.ogData[match[1]] = decodeHtmlEntities(match[2])
  }
  // Also check reverse order
  const ogMatchesReverse = html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](og:[^"']+)["']/gi)
  for (const match of ogMatchesReverse) {
    result.ogData[match[2]] = decodeHtmlEntities(match[1])
  }

  // Extract favicons
  const faviconMatches = html.matchAll(/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["']/gi)
  for (const match of faviconMatches) {
    const faviconUrl = resolveUrl(match[1], base)
    if (faviconUrl) {
      result.favicons.push(faviconUrl)
    }
  }

  // Extract potential logo images
  // Look for images with "logo" in src, alt, class, or id
  const imgMatches = html.matchAll(/<img[^>]+(?:src|alt|class|id)[^>]*>/gi)
  for (const match of imgMatches) {
    const imgTag = match[0].toLowerCase()
    if (imgTag.includes('logo') || imgTag.includes('brand')) {
      const srcMatch = imgTag.match(/src=["']([^"']+)["']/i)
      const altMatch = imgTag.match(/alt=["']([^"']+)["']/i)
      if (srcMatch) {
        const logoUrl = resolveUrl(srcMatch[1], base)
        if (logoUrl && !logoUrl.includes('data:')) {
          result.logos.push({
            url: logoUrl,
            type: 'image',
            alt: altMatch ? altMatch[1] : undefined,
          })
        }
      }
    }
  }

  // Check for SVG logos in the HTML
  const svgLogoMatch = html.match(/<(?:a[^>]+class=["'][^"']*logo[^"']*["'][^>]*>[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?<\/a>|header[^>]*>[\s\S]*?<svg[\s\S]{0,2000}?<\/svg>)/i)
  if (svgLogoMatch) {
    // Found an inline SVG that might be the logo
    result.logos.push({
      url: 'inline-svg',
      type: 'svg',
    })
  }

  // Extract CSS colors (hex codes)
  const colorMatches = html.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)
  const colorSet = new Set<string>()
  for (const match of colorMatches) {
    const hex = match[1].length === 3
      ? match[1].split('').map(c => c + c).join('')
      : match[1]
    colorSet.add('#' + hex.toLowerCase())
  }
  result.cssColors = Array.from(colorSet).slice(0, 20) // Limit to 20 colors

  // Extract font families
  const fontMatches = html.matchAll(/font-family:\s*["']?([^;"']+)/gi)
  const fontSet = new Set<string>()
  for (const match of fontMatches) {
    const fonts = match[1].split(',').map(f => f.trim().replace(/["']/g, ''))
    fonts.forEach(f => {
      if (f && !f.includes('inherit') && !f.includes('sans-serif') && !f.includes('serif')) {
        fontSet.add(f)
      }
    })
  }
  result.fonts = Array.from(fontSet).slice(0, 5)

  // Add OG image as potential logo
  if (result.ogData['og:image']) {
    const ogImageUrl = resolveUrl(result.ogData['og:image'], base)
    if (ogImageUrl) {
      result.logos.push({
        url: ogImageUrl,
        type: 'og-image',
      })
    }
  }

  return result
}

function resolveUrl(url: string, base: URL): string | null {
  try {
    if (url.startsWith('//')) {
      return base.protocol + url
    }
    if (url.startsWith('/')) {
      return base.origin + url
    }
    if (url.startsWith('http')) {
      return url
    }
    return new URL(url, base.origin).toString()
  } catch {
    return null
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

// ============================================================================
// CLAUDE ANALYSIS
// ============================================================================

async function analyzeWithClaude(pageData: ParsedPageData, url: string): Promise<Omit<BrandExtractionResult, 'sourceUrl' | 'extractedAt'>> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')

  if (!anthropicApiKey) {
    console.warn('[extract-brand] No ANTHROPIC_API_KEY, using fallback extraction')
    return fallbackExtraction(pageData, url)
  }

  const prompt = `Analyze this website data and extract brand information. Return ONLY valid JSON, no explanation.

Website URL: ${url}
Page Title: ${pageData.title}
Meta Description: ${pageData.description}
Open Graph Data: ${JSON.stringify(pageData.ogData)}
Potential Logo URLs: ${JSON.stringify(pageData.logos.map(l => ({ url: l.url, alt: l.alt })))}
Favicon URLs: ${JSON.stringify(pageData.favicons)}
CSS Colors Found: ${JSON.stringify(pageData.cssColors)}
Fonts Found: ${JSON.stringify(pageData.fonts)}

Extract and return as JSON:
{
  "companyName": "the company/brand name",
  "tagline": "short tagline/slogan (5 words MAX, null if not found)",
  "suggestedPrefix": "3-4 letter uppercase prefix for document numbers (e.g., company name abbreviation)",
  "logos": [
    { "url": "full URL to logo", "type": "primary" | "secondary" | "favicon" }
  ],
  "colors": [
    { "hex": "#XXXXXX", "usage": "primary" | "secondary" | "accent", "source": "css" | "logo" }
  ],
  "fonts": ["font names found"],
  "confidence": 0.0-1.0,
  "websiteHasDarkBackground": true | false,
  "logoDesignedForDarkBackground": true | false
}

CRITICAL COLOR RULES:
- NEVER use pure white (#ffffff, #fff) or pure black (#000000, #000) as primary or secondary brand colors
- If the CSS colors are mostly black/white/gray, the ACTUAL brand colors are likely IN THE LOGO itself
- Look at the logo URL/filename for color hints (e.g., "logo-blue.svg")
- Common brand colors are vibrant: blues, greens, oranges, reds, purples - not black or white
- If you see a dark website with white text, the brand color is NOT white - look deeper at accent colors, buttons, links
- Primary color = the main brand identity color (often used in buttons, headers, links)
- Secondary color = supporting color (often used for hover states, secondary buttons)
- Accent color = highlight color (often used for alerts, badges, call-to-actions)

Other Rules:
- companyName: Extract from title, OG data, or domain. Remove suffixes like "Inc", "LLC", "| Home", etc.
- tagline: MUST be 5 words or fewer. If the original is longer, condense it to capture the essence.
- suggestedPrefix: Create from company name initials or first 3-4 letters. Uppercase.
- logos: Pick the best logo URL. Classify as primary (main logo), secondary (alternate), or favicon.
- websiteHasDarkBackground: true if the main site background is dark/black
- logoDesignedForDarkBackground: true if the logo appears to be white/light colored (designed to show on dark backgrounds)
- confidence: Rate how confident you are in the extraction (0.0-1.0).

Return ONLY the JSON object.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[extract-brand] Claude API error:', response.status, errorText)
      return fallbackExtraction(pageData, url)
    }

    const data = await response.json()
    const text = data.content?.[0]?.type === 'text' ? data.content[0].text : ''

    // Parse JSON from response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[extract-brand] Could not parse JSON from Claude response')
      return fallbackExtraction(pageData, url)
    }

    const result = JSON.parse(jsonMatch[0])

    // Validate and clean colors - reject pure black/white
    const validatedColors = (result.colors || [])
      .map((c: { hex: string; usage: string; source: string }) => ({
        hex: c.hex?.toLowerCase(),
        usage: c.usage as 'primary' | 'secondary' | 'accent',
        source: (c.source || 'css') as 'css' | 'meta' | 'logo' | 'image',
      }))
      .filter((c: { hex: string }) => {
        // Filter out pure black and white
        const pureBlackWhite = ['#000000', '#000', '#ffffff', '#fff', '#fefefe', '#010101']
        return !pureBlackWhite.includes(c.hex)
      })

    // Ensure we have at least some colors
    const finalColors = validatedColors.length >= 2 ? validatedColors : [
      { hex: '#0ea5e9', usage: 'primary' as const, source: 'css' as const },
      { hex: '#64748b', usage: 'secondary' as const, source: 'css' as const },
      ...validatedColors.filter((c: { usage: string }) => c.usage === 'accent'),
    ]

    // Truncate tagline to 5 words if needed
    let tagline = result.tagline || undefined
    if (tagline) {
      const words = tagline.split(/\s+/)
      if (words.length > 5) {
        tagline = words.slice(0, 5).join(' ')
      }
    }

    return {
      companyName: result.companyName || '',
      tagline,
      suggestedPrefix: (result.suggestedPrefix || '').toUpperCase().slice(0, 5),
      logos: (result.logos || []).map((l: { url: string; type: string }) => ({
        url: l.url,
        type: l.type as 'primary' | 'secondary' | 'favicon',
      })),
      colors: finalColors,
      fonts: result.fonts || [],
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      websiteHasDarkBackground: result.websiteHasDarkBackground === true,
      logoDesignedForDarkBackground: result.logoDesignedForDarkBackground === true,
    }
  } catch (error) {
    console.error('[extract-brand] Claude analysis failed:', error)
    return fallbackExtraction(pageData, url)
  }
}

function fallbackExtraction(pageData: ParsedPageData, url: string): Omit<BrandExtractionResult, 'sourceUrl' | 'extractedAt'> {
  // Extract company name from title or domain
  let companyName = ''
  if (pageData.ogData['og:site_name']) {
    companyName = pageData.ogData['og:site_name']
  } else if (pageData.title) {
    // Remove common suffixes
    companyName = pageData.title
      .split(/[|\-–—]/)[0]
      .replace(/\s*(Home|Welcome|Official|Site).*$/i, '')
      .trim()
  }
  if (!companyName) {
    try {
      const hostname = new URL(url).hostname
      companyName = hostname.replace(/^www\./, '').split('.')[0]
      companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1)
    } catch {
      companyName = 'Unknown'
    }
  }

  // Generate prefix from company name
  const words = companyName.split(/\s+/)
  let suggestedPrefix = ''
  if (words.length >= 2) {
    suggestedPrefix = words.map(w => w[0]).join('').toUpperCase().slice(0, 4)
  } else {
    suggestedPrefix = companyName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4)
  }

  // Get logos
  const logos: DetectedLogo[] = []
  if (pageData.logos.length > 0) {
    logos.push({ url: pageData.logos[0].url, type: 'primary' })
  }
  if (pageData.favicons.length > 0) {
    logos.push({ url: pageData.favicons[0], type: 'favicon' })
  }

  // Get colors (just use first 3)
  const colors: DetectedColor[] = pageData.cssColors.slice(0, 3).map((hex, i) => ({
    hex,
    usage: i === 0 ? 'primary' : i === 1 ? 'secondary' : 'accent',
    source: 'css' as const,
  }))

  return {
    companyName,
    tagline: pageData.description?.slice(0, 100) || undefined,
    suggestedPrefix: suggestedPrefix || 'DOC',
    logos,
    colors: colors.length > 0 ? colors : [
      { hex: '#0ea5e9', usage: 'primary', source: 'css' },
      { hex: '#64748b', usage: 'secondary', source: 'css' },
    ],
    fonts: pageData.fonts,
    confidence: 0.3,
  }
}

// ============================================================================
// UPLOAD LOGOS
// ============================================================================

async function uploadLogos(
  logos: DetectedLogo[],
  accountId: string,
  sourceUrl: string,
  createInvertedVersion: boolean
): Promise<DetectedLogo[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[extract-brand] Missing Supabase credentials, skipping logo upload')
    return logos
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const uploadedLogos: DetectedLogo[] = []
  const base = new URL(sourceUrl)

  for (const logo of logos) {
    // Skip inline SVGs and data URLs
    if (logo.url === 'inline-svg' || logo.url.startsWith('data:')) {
      continue
    }

    try {
      // Resolve relative URLs
      const logoUrl = logo.url.startsWith('http') ? logo.url : resolveUrl(logo.url, base)
      if (!logoUrl) continue

      // Fetch the image
      const imageResponse = await fetch(logoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FunnelistsBrandBot/1.0)',
        },
      })

      if (!imageResponse.ok) {
        console.warn('[extract-brand] Failed to fetch logo:', logoUrl, imageResponse.status)
        continue
      }

      const contentType = imageResponse.headers.get('content-type') || 'image/png'
      const imageBuffer = await imageResponse.arrayBuffer()

      // Determine file extension
      let ext = 'png'
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg'
      else if (contentType.includes('svg')) ext = 'svg'
      else if (contentType.includes('webp')) ext = 'webp'
      else if (contentType.includes('gif')) ext = 'gif'
      else if (contentType.includes('ico')) ext = 'ico'

      const storagePath = `${accountId}/logos/${logo.type}.${ext}`

      // Upload original to storage
      const { error: uploadError } = await supabase.storage
        .from('brands')
        .upload(storagePath, new Uint8Array(imageBuffer), {
          contentType,
          upsert: true,
        })

      if (uploadError) {
        console.warn('[extract-brand] Failed to upload logo:', uploadError.message)
        continue
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('brands').getPublicUrl(storagePath)

      uploadedLogos.push({
        ...logo,
        uploadedUrl: urlData.publicUrl,
      })

      console.log('[extract-brand] Uploaded logo:', logo.type, urlData.publicUrl)

      // Create inverted version if requested (for primary logos only, PNG format)
      if (createInvertedVersion && logo.type === 'primary' && (ext === 'png' || ext === 'webp')) {
        try {
          const invertedBuffer = await invertLogoColors(new Uint8Array(imageBuffer))
          if (invertedBuffer) {
            const invertedPath = `${accountId}/logos/secondary.png`

            const { error: invertError } = await supabase.storage
              .from('brands')
              .upload(invertedPath, invertedBuffer, {
                contentType: 'image/png',
                upsert: true,
              })

            if (!invertError) {
              const { data: invertedUrlData } = supabase.storage.from('brands').getPublicUrl(invertedPath)

              uploadedLogos.push({
                url: logoUrl,
                type: 'secondary',
                uploadedUrl: invertedUrlData.publicUrl,
              })

              console.log('[extract-brand] Created inverted logo:', invertedUrlData.publicUrl)
            } else {
              console.warn('[extract-brand] Failed to upload inverted logo:', invertError.message)
            }
          }
        } catch (invertErr) {
          console.warn('[extract-brand] Failed to invert logo:', invertErr)
        }
      }
    } catch (error) {
      console.warn('[extract-brand] Error uploading logo:', logo.url, error)
    }
  }

  // Return original logos with uploaded URLs where available
  return logos.map(logo => {
    const uploaded = uploadedLogos.find(u => u.type === logo.type)
    return uploaded || logo
  }).concat(
    // Add secondary logo if it was created
    uploadedLogos.filter(l => l.type === 'secondary' && !logos.some(orig => orig.type === 'secondary'))
  )
}

// ============================================================================
// LOGO COLOR INVERSION
// ============================================================================

/**
 * Inverts the colors of a logo image while preserving transparency.
 * White becomes black, black becomes white - useful for creating
 * light-background versions of dark-background logos.
 */
async function invertLogoColors(imageBuffer: Uint8Array): Promise<Uint8Array | null> {
  try {
    // Decode the image
    const image = await Image.decode(imageBuffer)

    // Iterate through each pixel and invert colors (preserve alpha)
    for (let x = 0; x < image.width; x++) {
      for (let y = 0; y < image.height; y++) {
        const pixel = image.getPixelAt(x + 1, y + 1) // imagescript uses 1-based indexing

        // Extract RGBA components
        const r = (pixel >> 24) & 0xff
        const g = (pixel >> 16) & 0xff
        const b = (pixel >> 8) & 0xff
        const a = pixel & 0xff

        // Invert RGB, keep alpha unchanged
        const invertedR = 255 - r
        const invertedG = 255 - g
        const invertedB = 255 - b

        // Reconstruct pixel with inverted colors
        const invertedPixel = (invertedR << 24) | (invertedG << 16) | (invertedB << 8) | a
        image.setPixelAt(x + 1, y + 1, invertedPixel)
      }
    }

    // Encode back to PNG
    return await image.encode()
  } catch (error) {
    console.error('[extract-brand] Error inverting logo colors:', error)
    return null
  }
}
