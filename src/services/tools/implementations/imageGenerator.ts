// Image Generator Tool - Generates images using AI
// Supports OpenAI DALL-E 3 (with API key) or Pollinations (free fallback)
// Automatically injects brand context (colors, style) when available

import type { ToolResult } from '../types'
import { supabase } from '@/services/supabase/client'
import { useBrandStore } from '@/stores/brandStore'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string

type ImageSize = '1024x1024' | '1792x1024' | '1024x1792'

/**
 * Enhance prompt with brand context (colors, transparent bg preference)
 */
function enhancePromptWithBrand(prompt: string): string {
  const brandConfig = useBrandStore.getState().brandConfig
  const colors = brandConfig?.brandConfig?.colors

  const brandHints: string[] = []

  if (colors) {
    const colorList = [
      colors.primary && `primary: ${colors.primary}`,
      colors.secondary && `secondary: ${colors.secondary}`,
      colors.accent && `accent: ${colors.accent}`,
    ].filter(Boolean)
    if (colorList.length > 0) {
      brandHints.push(`Use these brand colors: ${colorList.join(', ')}`)
    }
  }

  // Always prefer clean/transparent backgrounds for logos and icons
  const isLogoOrIcon = /logo|icon|badge|emblem|symbol|mark/i.test(prompt)
  if (isLogoOrIcon) {
    brandHints.push('Use a clean, solid-color or transparent background (NOT black). Keep the design simple and scalable.')
  }

  if (brandHints.length === 0) return prompt

  return `${prompt}\n\nBrand guidelines: ${brandHints.join('. ')}`
}

/**
 * Generate image using OpenAI DALL-E 3 and upload to Supabase storage
 */
async function generateWithDallE(
  prompt: string,
  size: ImageSize,
  style: 'natural' | 'vivid',
  accountId: string
): Promise<ToolResult> {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      style,
      response_format: 'b64_json',
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      error.error?.message || `OpenAI API error: ${response.status}`
    )
  }

  const data = await response.json()
  const b64 = data.data?.[0]?.b64_json as string | undefined
  const revisedPrompt = data.data?.[0]?.revised_prompt as string | undefined

  if (!b64) {
    throw new Error('No image data in response')
  }

  // Upload base64 data to Supabase storage
  const timestamp = Date.now()
  const fileName = `image_${timestamp}.png`
  let imageUrl = ''

  if (supabase) {
    const storagePath = `${accountId}/generated-images/${fileName}`

    // Decode base64 to binary for upload
    const binaryString = atob(b64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' })
    const fileSizeKB = Math.round(blob.size / 1024)

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, blob, {
        contentType: 'image/png',
        upsert: true,
      })

    if (!uploadError) {
      const { data: urlData } = await supabase.storage
        .from('attachments')
        .createSignedUrl(storagePath, 86400) // 24 hours

      if (urlData?.signedUrl) {
        imageUrl = urlData.signedUrl
      }
    } else {
      console.warn('[ImageGen] Storage upload failed:', uploadError.message)
    }

    return {
      success: true,
      data: {
        imageUrl,
        provider: 'dall-e-3',
        size,
        style,
        revisedPrompt,
        fileName,
        fileSizeKB,
        formatted: imageUrl
          ? `Image generated successfully with DALL-E 3!\n\nImage URL: ${imageUrl}\n\nSize: ${size}\nFile: ${fileName} (${fileSizeKB} KB)${revisedPrompt ? `\nRevised prompt: ${revisedPrompt}` : ''}\n\nThe image is stored permanently.`
          : `Image generated but storage upload failed.\nSize: ${size}\nFile: ${fileName} (${fileSizeKB} KB)`,
      },
    }
  }

  // No Supabase - can't store, return error
  throw new Error('Image generated but no storage available to save it')
}

/**
 * Generate image using Pollinations.ai (free, no API key required)
 * Returns a permanent URL directly - no need to download/re-upload
 */
function generateWithPollinations(
  prompt: string,
  size: ImageSize
): ToolResult {
  const [width, height] = size.split('x').map(Number)
  const seed = Math.floor(Math.random() * 1000000)
  const encodedPrompt = encodeURIComponent(prompt)

  // Pollinations URLs are deterministic and permanent
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`

  return {
    success: true,
    data: {
      imageUrl,
      provider: 'pollinations',
      model: 'flux',
      size,
      seed,
      formatted: `Image generated successfully!\n\nImage URL: ${imageUrl}\n\nProvider: Pollinations (Flux model)\nSize: ${size}\nSeed: ${seed}\n\nThe image URL is permanent. Note: First load may take a few seconds as the image generates on-demand.`,
    },
  }
}

/**
 * Generate an image from a text prompt
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
    : '1024x1024') as ImageSize

  const validStyle = (style === 'natural' ? 'natural' : 'vivid') as 'natural' | 'vivid'

  const provider = OPENAI_API_KEY ? 'dall-e-3' : 'pollinations'

  // Enhance prompt with brand colors and style guidelines
  const enhancedPrompt = enhancePromptWithBrand(prompt)

  try {
    console.log(`[ImageGen] Generating with ${provider}: "${enhancedPrompt.slice(0, 100)}..."`)

    let result: ToolResult

    if (OPENAI_API_KEY) {
      result = await generateWithDallE(enhancedPrompt, validSize, validStyle, accountId)
    } else {
      result = generateWithPollinations(enhancedPrompt, validSize)
    }

    // Add execution time
    if (result.metadata) {
      result.metadata.executionTimeMs = Date.now() - startTime
    } else {
      result.metadata = { executionTimeMs: Date.now() - startTime, source: provider }
    }

    console.log(`[ImageGen] Done (${Date.now() - startTime}ms)`)
    return result
  } catch (error) {
    console.error('[ImageGen] Generation failed:', error)
    return {
      success: false,
      error: `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }
}
