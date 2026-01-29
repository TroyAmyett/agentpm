// Vercel Serverless Function: HeyGen Video Webhook
// Receives completion callbacks when videos finish rendering

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// HeyGen webhook payload structure
interface HeyGenWebhookPayload {
  event_type: 'avatar_video.success' | 'avatar_video.fail'
  event_data: {
    video_id: string
    url?: string
    thumbnail_url?: string
    duration?: number
    callback_id?: string
    msg?: string
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify webhook source (optional: add HMAC verification)
  // HeyGen doesn't provide HMAC, but we can verify callback_id matches our jobs

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[Video Webhook] Missing Supabase configuration')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  try {
    const payload = req.body as HeyGenWebhookPayload
    console.log('[Video Webhook] Received:', JSON.stringify(payload))

    if (!payload.event_type || !payload.event_data) {
      return res.status(400).json({ error: 'Invalid webhook payload' })
    }

    const { event_type, event_data } = payload
    const { video_id, url, thumbnail_url, duration, callback_id, msg } = event_data

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Find the job by callback_id (our job ID) or platform_job_id
    const { data: job, error: findError } = await supabase
      .from('video_jobs')
      .select('*')
      .or(`id.eq.${callback_id || 'none'},platform_job_id.eq.${video_id}`)
      .single()

    if (findError || !job) {
      console.warn('[Video Webhook] Job not found for video:', video_id, callback_id)
      // Return 200 anyway to prevent HeyGen from retrying
      return res.status(200).json({ received: true, warning: 'Job not found' })
    }

    // Update job based on event type
    if (event_type === 'avatar_video.success') {
      const { error: updateError } = await supabase
        .from('video_jobs')
        .update({
          status: 'completed',
          platform_status: 'completed',
          video_url: url,
          thumbnail_url: thumbnail_url,
          video_duration_seconds: duration,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      if (updateError) {
        console.error('[Video Webhook] Update error:', updateError)
        return res.status(500).json({ error: 'Failed to update job' })
      }

      console.log('[Video Webhook] Job completed:', job.id, url)
    } else if (event_type === 'avatar_video.fail') {
      const { error: updateError } = await supabase
        .from('video_jobs')
        .update({
          status: 'failed',
          platform_status: 'failed',
          error_message: msg || 'Video generation failed',
        })
        .eq('id', job.id)

      if (updateError) {
        console.error('[Video Webhook] Update error:', updateError)
        return res.status(500).json({ error: 'Failed to update job' })
      }

      console.log('[Video Webhook] Job failed:', job.id, msg)
    }

    return res.status(200).json({ received: true, job_id: job.id })
  } catch (error) {
    console.error('[Video Webhook] Error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
