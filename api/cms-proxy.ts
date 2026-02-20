// Vercel Serverless Function: Proxy blog publishing to Funnelists CMS
// Avoids CORS — browser calls this route, server calls funnelists.com/api/pages

import type { VercelRequest, VercelResponse } from '@vercel/node'

const CMS_BASE_URL = process.env.VITE_CMS_BASE_URL || 'https://funnelists.com'
const CMS_API_KEY = process.env.VITE_CMS_AGENT_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!CMS_API_KEY) {
    return res.status(500).json({ error: 'CMS API key not configured on server' })
  }

  try {
    const response = await fetch(`${CMS_BASE_URL}/api/pages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CMS-API-Key': CMS_API_KEY,
      },
      body: JSON.stringify(req.body),
    })

    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))

    return res.status(response.status).json(data)
  } catch (error) {
    console.error('[CMS Proxy] Error:', error)
    return res.status(502).json({
      error: `CMS proxy failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}
