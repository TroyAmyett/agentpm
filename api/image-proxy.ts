// Vercel Serverless Function: DALL-E 3 image generation proxy
// Keeps OpenAI API key server-side only

import type { VercelRequest, VercelResponse } from '@vercel/node'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured on server' })
  }

  const { prompt, n, size, style, response_format } = req.body || {}

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' })
  }

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: n || 1,
        size: size || '1792x1024',
        style: style || 'vivid',
        response_format: response_format || 'b64_json',
      }),
    })

    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    return res.status(response.status).json(data)
  } catch (err) {
    console.error('[Image Proxy] Error:', err)
    return res.status(502).json({
      error: `Image proxy failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }
}
