// Vercel Serverless Function: GitHub API proxy
// Keeps GitHub token server-side only (never in browser bundle)
// Used by landing page creator to commit files to funnelists-cms repo

import type { VercelRequest, VercelResponse } from '@vercel/node'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GitHub token not configured on server' })
  }

  const { url, method, body } = req.body || {}

  if (!url) {
    return res.status(400).json({ error: 'Missing url' })
  }

  // Security: only allow GitHub API URLs
  if (!url.startsWith('https://api.github.com/')) {
    return res.status(400).json({ error: 'Only GitHub API URLs are allowed' })
  }

  try {
    const response = await fetch(url, {
      method: method || 'GET',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    return res.status(response.status).json(data)
  } catch (err) {
    console.error('[GitHub Proxy] Error:', err)
    return res.status(502).json({
      error: `GitHub proxy failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }
}
