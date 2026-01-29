// Vercel Serverless Function: Proxy attachment for external viewers
// Allows Microsoft Office Online viewer to access Supabase-stored files

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing attachment ID' })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[Attachment Proxy] Missing Supabase configuration')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  try {
    // Create Supabase client with service role (server-side only)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch attachment metadata from database
    const { data: attachment, error: dbError } = await supabase
      .from('attachments')
      .select('*')
      .eq('id', id)
      .single()

    if (dbError || !attachment) {
      console.error('[Attachment Proxy] Attachment not found:', dbError)
      return res.status(404).json({ error: 'Attachment not found' })
    }

    // Download file from storage
    const { data: fileData, error: storageError } = await supabase.storage
      .from('attachments')
      .download(attachment.storage_path)

    if (storageError || !fileData) {
      console.error('[Attachment Proxy] Storage error:', storageError)
      return res.status(500).json({ error: 'Failed to fetch file' })
    }

    // Convert Blob to Buffer
    const buffer = Buffer.from(await fileData.arrayBuffer())

    // Set appropriate headers
    res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream')
    res.setHeader('Content-Length', buffer.length)
    res.setHeader('Content-Disposition', `inline; filename="${attachment.file_name}"`)

    // Cache for 1 hour (Office viewer may make multiple requests)
    res.setHeader('Cache-Control', 'private, max-age=3600')

    // Allow CORS for Office viewer
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    // Send the file
    return res.status(200).send(buffer)

  } catch (error) {
    console.error('[Attachment Proxy] Error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
