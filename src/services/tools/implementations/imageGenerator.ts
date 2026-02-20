// Image Generator Tool - Generates images using Canvas (canvas.funnelists.com)
// Primary: Canvas API (brand-aware, multiple providers, style variants)
// Fallback: Direct OpenAI DALL-E 3 (if Canvas unavailable)
// Automatically applies Funnelists brand theme

import type { ToolResult } from '../types'
import { supabase } from '@/services/supabase/client'

const CANVAS_BASE_URL = (import.meta.env.VITE_CANVAS_BASE_URL as string) || 'https://canvas.funnelists.com'
const CANVAS_API_KEY = (import.meta.env.VITE_CANVAS_API_KEY as string) || ''

type ImageSize = '1024x1024' | '1792x1024' | '1024x1792'

// Map AgentPM size strings to Canvas dimension presets
const SIZE_TO_CANVAS_DIMENSIONS: Record<ImageSize, string> = {
  '1792x1024': '16:9',
  '1024x1024': 'square',
  '1024x1792': 'portrait',
}

/**
 * Generate image using Canvas API (canvas.funnelists.com)
 * Canvas handles brand theming, provider selection, and style application
 */
async function generateWithCanvas(
  prompt: string,
  size: ImageSize,
  style: string,
  accountId: string,
  usageContext?: string
): Promise<ToolResult> {
  const dimensions = SIZE_TO_CANVAS_DIMENSIONS[size] || '16:9'

  // Determine usage context from prompt if not provided
  const context = usageContext || inferUsageContext(prompt)

  const body = {
    usage_context: context,
    dimensions: context === 'blog_hero' ? '16:9_blog' : dimensions,
    title: extractTitle(prompt),
    subject: prompt,
    mood: 'professional' as string,
    style_variant: mapStyleToVariant(style),
    brand_theme: 'funnelists',
    output_format: 'png',
    image_provider: 'openai', // Canvas routes to best provider
  }

  console.log(`[ImageGen] Calling Canvas API: ${CANVAS_BASE_URL}/api/generate`)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (CANVAS_API_KEY) {
    headers['X-API-Key'] = CANVAS_API_KEY
  }

  const response = await fetch(`${CANVAS_BASE_URL}/api/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      (errorData as Record<string, string>).error || `Canvas API error: ${response.status}`
    )
  }

  const data = await response.json() as {
    success: boolean
    image_url?: string
    metadata?: Record<string, unknown>
    error?: string
  }

  if (!data.success || !data.image_url) {
    throw new Error(data.error || 'Canvas returned no image')
  }

  // Canvas returns a data URI (base64) — upload to Supabase storage for a permanent URL
  let imageUrl = data.image_url
  let fileName = `canvas_${Date.now()}.png`
  let fileSizeKB = 0

  if (supabase && data.image_url.startsWith('data:')) {
    const uploaded = await uploadBase64ToStorage(data.image_url, accountId, fileName)
    if (uploaded.url) {
      imageUrl = uploaded.url
      fileSizeKB = uploaded.sizeKB
    }
  }

  return {
    success: true,
    data: {
      imageUrl,
      provider: 'canvas',
      canvasProvider: data.metadata?.image_provider || 'openai',
      size,
      style: data.metadata?.style_applied || style,
      fileName,
      fileSizeKB,
      formatted: `Image generated successfully via Canvas!\n\nImage URL: ${imageUrl}\n\nProvider: Canvas (${data.metadata?.image_provider || 'openai'})\nStyle: ${data.metadata?.style_applied || style}\nBrand Theme: funnelists\nSize: ${size}\n\nThe image matches Funnelists brand theme and is stored permanently.`,
    },
  }
}

/**
 * Upload a base64 data URI to Supabase storage, return signed URL
 */
async function uploadBase64ToStorage(
  dataUri: string,
  accountId: string,
  fileName: string
): Promise<{ url: string; sizeKB: number }> {
  if (!supabase) return { url: '', sizeKB: 0 }

  // Extract base64 data from data URI
  const matches = dataUri.match(/^data:image\/\w+;base64,(.+)$/)
  if (!matches) return { url: '', sizeKB: 0 }

  const b64 = matches[1]
  const binaryString = atob(b64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' })
  const sizeKB = Math.round(blob.size / 1024)

  const storagePath = `${accountId}/generated-images/${fileName}`
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(storagePath, blob, { contentType: 'image/png', upsert: true })

  if (uploadError) {
    console.warn('[ImageGen] Storage upload failed:', uploadError.message)
    return { url: '', sizeKB }
  }

  const { data: urlData } = await supabase.storage
    .from('attachments')
    .createSignedUrl(storagePath, 86400) // 24 hours

  return { url: urlData?.signedUrl || '', sizeKB }
}

/**
 * Fallback: Generate image using OpenAI DALL-E 3 directly
 */
async function generateWithDallE(
  prompt: string,
  size: ImageSize,
  style: 'natural' | 'vivid',
  accountId: string
): Promise<ToolResult> {
  // Route through server-side proxy to keep OpenAI key off the client
  const response = await fetch('/api/image-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, n: 1, size, style, response_format: 'b64_json' }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      (error as { error?: { message?: string } }).error?.message || `OpenAI API error: ${response.status}`
    )
  }

  const data = await response.json()
  const b64 = data.data?.[0]?.b64_json as string | undefined
  const revisedPrompt = data.data?.[0]?.revised_prompt as string | undefined

  if (!b64) throw new Error('No image data in response')

  const fileName = `image_${Date.now()}.png`
  const dataUri = `data:image/png;base64,${b64}`
  const uploaded = await uploadBase64ToStorage(dataUri, accountId, fileName)

  return {
    success: true,
    data: {
      imageUrl: uploaded.url || '',
      provider: 'dall-e-3',
      size,
      style,
      revisedPrompt,
      fileName,
      fileSizeKB: uploaded.sizeKB,
      formatted: uploaded.url
        ? `Image generated successfully with DALL-E 3!\n\nImage URL: ${uploaded.url}\n\nSize: ${size}\nFile: ${fileName} (${uploaded.sizeKB} KB)${revisedPrompt ? `\nRevised prompt: ${revisedPrompt}` : ''}\n\nThe image is stored permanently.`
        : `Image generated but storage upload failed.\nSize: ${size}\nFile: ${fileName} (${uploaded.sizeKB} KB)`,
    },
  }
}

/**
 * Infer usage context from prompt text
 */
function inferUsageContext(prompt: string): string {
  const lower = prompt.toLowerCase()
  if (/blog|article|post|hero/i.test(lower)) return 'blog_hero'
  if (/banner|header/i.test(lower)) return 'hero_background'
  if (/card|thumbnail|preview/i.test(lower)) return 'card_thumbnail'
  if (/og|social|share/i.test(lower)) return 'og_image'
  if (/logo|icon|badge/i.test(lower)) return 'card_thumbnail'
  return 'hero_background'
}

/**
 * Extract a short title from the prompt (first sentence or first 60 chars)
 */
function extractTitle(prompt: string): string {
  const firstSentence = prompt.split(/[.!?\n]/)[0].trim()
  return firstSentence.length > 60 ? firstSentence.slice(0, 60) + '...' : firstSentence
}

/**
 * Map style strings to Canvas style_variant values
 */
function mapStyleToVariant(style: string): string {
  switch (style?.toLowerCase()) {
    case 'natural': return 'clean_tech'
    case 'vivid': return 'gradient_mesh'
    case 'minimal': return 'minimal'
    case 'geometric': return 'geometric'
    case 'abstract': return 'abstract_tech'
    default: return 'clean_tech'
  }
}

/**
 * Generate an image from a text prompt
 * Priority: Canvas API → DALL-E 3 direct → error
 */
export async function generateImage(
  prompt: string,
  size: string | undefined,
  style: string | undefined,
  accountId: string
): Promise<ToolResult> {
  const startTime = Date.now()

  if (!prompt || prompt.trim().length === 0) {
    return { success: false, error: 'No prompt provided' }
  }

  const validSize = (['1024x1024', '1792x1024', '1024x1792'].includes(size || '')
    ? size
    : '1792x1024') as ImageSize // Default to 16:9 for blog/hero use

  const validStyle = style || 'vivid'

  try {
    // Try Canvas first (brand-aware, matches Funnelists theme)
    if (CANVAS_BASE_URL) {
      try {
        console.log(`[ImageGen] Trying Canvas API...`)
        const result = await generateWithCanvas(prompt, validSize, validStyle, accountId)
        if (result.metadata) {
          result.metadata.executionTimeMs = Date.now() - startTime
        } else {
          result.metadata = { executionTimeMs: Date.now() - startTime, source: 'canvas' }
        }
        console.log(`[ImageGen] Canvas succeeded (${Date.now() - startTime}ms)`)
        return result
      } catch (canvasErr) {
        console.warn(`[ImageGen] Canvas failed, trying fallback:`, canvasErr)
      }
    }

    // Fallback: DALL-E 3 via server-side proxy (key is server-side only)
    {
      console.log(`[ImageGen] Falling back to DALL-E 3 via proxy`)
      const dallEStyle = (validStyle === 'natural' ? 'natural' : 'vivid') as 'natural' | 'vivid'
      const result = await generateWithDallE(prompt, validSize, dallEStyle, accountId)
      if (result.metadata) {
        result.metadata.executionTimeMs = Date.now() - startTime
      } else {
        result.metadata = { executionTimeMs: Date.now() - startTime, source: 'dall-e-3' }
      }
      console.log(`[ImageGen] DALL-E 3 succeeded (${Date.now() - startTime}ms)`)
      return result
    }
  } catch (error) {
    console.error('[ImageGen] All providers failed:', error)
    return {
      success: false,
      error: `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }
}
