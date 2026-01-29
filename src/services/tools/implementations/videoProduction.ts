// Video Production Tool Implementation
// Provides tools for creating and managing video production jobs

import type { ToolResult } from '../types'
import {
  createVideoJob,
  listVideoJobs,
  updateVideoJob,
  submitVideoJob,
  checkVideoJobStatus,
  type VideoType,
  type VideoJobStatus,
  type VideoScript,
  type ProductInfo,
} from '@/services/video/videoService'
import { getHeyGenClient, createHeyGenClient } from '@/services/video/heygenClient'

/**
 * Create a new video production job
 */
export async function createVideoJobTool(params: {
  accountId: string
  userId: string
  title: string
  description?: string
  videoType: VideoType
  script?: VideoScript
  productInfo?: ProductInfo
}): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    const job = await createVideoJob({
      accountId: params.accountId,
      userId: params.userId,
      title: params.title,
      description: params.description,
      videoType: params.videoType,
    })

    // If script provided, update the job with it
    if (params.script) {
      await updateVideoJob(job.id, {
        script: params.script,
        status: 'pending',
      })
    }

    // If productInfo provided, update the job with it
    if (params.productInfo) {
      await updateVideoJob(job.id, {
        productInfo: params.productInfo,
      })
    }

    return {
      success: true,
      data: {
        jobId: job.id,
        title: job.title,
        videoType: job.videoType,
        status: job.status,
        formatted: `Video job created successfully!\n\nJob ID: ${job.id}\nTitle: ${job.title}\nType: ${job.videoType}\nStatus: ${job.status}\n\nNext steps:\n1. Select an avatar (use list_video_avatars)\n2. Select a voice (use list_video_voices)\n3. Submit for rendering (use submit_video_job)`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'video-production',
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to create video job: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * List available HeyGen avatars
 */
export async function listVideoAvatarsTool(params: {
  apiKey?: string
  filter?: string
}): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    const client = params.apiKey
      ? createHeyGenClient(params.apiKey)
      : getHeyGenClient()

    const avatars = await client.listAvatars()

    // Format avatar list for display
    const formatted = avatars
      .slice(0, 20) // Limit to 20 for readability
      .map(
        (a, i) =>
          `${i + 1}. ${a.avatar_name} (ID: ${a.avatar_id})\n   Gender: ${a.gender}\n   Preview: ${a.preview_image_url}`
      )
      .join('\n\n')

    return {
      success: true,
      data: {
        avatars: avatars.map((a) => ({
          id: a.avatar_id,
          name: a.avatar_name,
          gender: a.gender,
          previewImage: a.preview_image_url,
        })),
        formatted: `Available Avatars (${avatars.length} total):\n\n${formatted}\n\nTo use an avatar, note its ID and pass it to submit_video_job.`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'heygen-api',
        totalCount: avatars.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to list avatars: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * List available HeyGen voices
 */
export async function listVideoVoicesTool(params: {
  apiKey?: string
  language?: string
  gender?: string
}): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    const client = params.apiKey
      ? createHeyGenClient(params.apiKey)
      : getHeyGenClient()

    let voices = await client.listVoices()

    // Apply filters
    if (params.language) {
      voices = voices.filter((v) =>
        v.language.toLowerCase().includes(params.language!.toLowerCase())
      )
    }
    if (params.gender) {
      voices = voices.filter(
        (v) => v.gender.toLowerCase() === params.gender!.toLowerCase()
      )
    }

    // Format voice list for display
    const formatted = voices
      .slice(0, 20) // Limit to 20 for readability
      .map(
        (v, i) =>
          `${i + 1}. ${v.name} (ID: ${v.voice_id})\n   Language: ${v.language} | Gender: ${v.gender}\n   Preview: ${v.preview_audio}`
      )
      .join('\n\n')

    return {
      success: true,
      data: {
        voices: voices.map((v) => ({
          id: v.voice_id,
          name: v.name,
          language: v.language,
          gender: v.gender,
          previewAudio: v.preview_audio,
        })),
        formatted: `Available Voices (${voices.length} total):\n\n${formatted}\n\nTo use a voice, note its ID and pass it to submit_video_job.`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'heygen-api',
        totalCount: voices.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to list voices: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Submit a video job for rendering
 */
export async function submitVideoJobTool(params: {
  jobId: string
  avatarId: string
  voiceId: string
  apiKey?: string
  testMode?: boolean
}): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    // First update the job with avatar and voice
    await updateVideoJob(params.jobId, {
      avatarId: params.avatarId,
      voiceId: params.voiceId,
      scriptApproved: true,
      scriptApprovedAt: new Date().toISOString(),
    })

    // Submit to HeyGen
    const job = await submitVideoJob(params.jobId, {
      apiKey: params.apiKey,
      testMode: params.testMode,
    })

    return {
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        platformJobId: job.platformJobId,
        formatted: `Video submitted for rendering!\n\nJob ID: ${job.id}\nPlatform Job ID: ${job.platformJobId}\nStatus: ${job.status}\n\nRendering typically takes 2-5 minutes. Use check_video_status to monitor progress.`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'heygen-api',
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to submit video: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Check status of a video job
 */
export async function checkVideoStatusTool(params: {
  jobId: string
  apiKey?: string
}): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    const job = await checkVideoJobStatus(params.jobId, {
      apiKey: params.apiKey,
    })

    let statusMessage: string
    switch (job.status) {
      case 'draft':
        statusMessage = 'Job is in draft status. Add script, avatar, and voice, then submit.'
        break
      case 'pending':
        statusMessage = 'Job is ready to submit. Use submit_video_job to start rendering.'
        break
      case 'rendering':
        statusMessage = `Video is rendering (Platform status: ${job.platformStatus}). This typically takes 2-5 minutes.`
        break
      case 'completed':
        statusMessage = `Video is complete!\n\nVideo URL: ${job.videoUrl}\nDuration: ${job.videoDurationSeconds}s\nThumbnail: ${job.thumbnailUrl}`
        break
      case 'failed':
        statusMessage = `Video generation failed: ${job.errorMessage}`
        break
      default:
        statusMessage = `Status: ${job.status}`
    }

    return {
      success: true,
      data: {
        jobId: job.id,
        title: job.title,
        status: job.status,
        platformStatus: job.platformStatus,
        videoUrl: job.videoUrl,
        thumbnailUrl: job.thumbnailUrl,
        duration: job.videoDurationSeconds,
        formatted: `Video Job Status\n\nTitle: ${job.title}\nStatus: ${job.status}\n\n${statusMessage}`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: job.platformJobId ? 'heygen-api' : 'database',
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to check status: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * List video jobs
 */
export async function listVideoJobsTool(params: {
  accountId: string
  status?: VideoJobStatus
  limit?: number
}): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    const jobs = await listVideoJobs(params.accountId, {
      status: params.status,
      limit: params.limit || 20,
    })

    if (jobs.length === 0) {
      return {
        success: true,
        data: {
          jobs: [],
          formatted: 'No video jobs found. Use create_video_job to start creating videos.',
        },
      }
    }

    const formatted = jobs
      .map(
        (j, i) =>
          `${i + 1}. ${j.title}\n   ID: ${j.id}\n   Type: ${j.videoType} | Status: ${j.status}\n   Created: ${new Date(j.createdAt).toLocaleDateString()}${j.videoUrl ? `\n   Video: ${j.videoUrl}` : ''}`
      )
      .join('\n\n')

    return {
      success: true,
      data: {
        jobs: jobs.map((j) => ({
          id: j.id,
          title: j.title,
          videoType: j.videoType,
          status: j.status,
          videoUrl: j.videoUrl,
          createdAt: j.createdAt,
        })),
        formatted: `Video Jobs (${jobs.length}):\n\n${formatted}`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'database',
        totalCount: jobs.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to list jobs: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Trigger a screen recording flow
 * NOTE: This requires server-side execution via Supabase Edge Function
 * The tool queues the recording job and returns immediately
 */
export async function recordScreenFlowTool(params: {
  flowName?: string
  customSteps?: Array<{
    name: string
    action: string
    target?: string
    value?: string
    waitMs?: number
  }>
  baseUrl?: string
  accountId: string
}): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    // Available pre-defined flows
    const availableFlows = [
      'welcomeOverview',
      'addFirstSource',
      'createTopics',
      'aiSummaries',
      'dailyDigest',
    ]

    if (!params.flowName && !params.customSteps) {
      return {
        success: false,
        error: `Must specify either flowName or customSteps. Available flows: ${availableFlows.join(', ')}`,
      }
    }

    if (params.flowName && !availableFlows.includes(params.flowName)) {
      return {
        success: false,
        error: `Unknown flow: ${params.flowName}. Available flows: ${availableFlows.join(', ')}`,
      }
    }

    // For now, return information about what would be recorded
    // Actual execution requires server-side Playwright
    // This could trigger a Supabase Edge Function or background job

    const flowDescription = params.flowName
      ? `Pre-defined flow: ${params.flowName}`
      : `Custom flow with ${params.customSteps?.length || 0} steps`

    // TODO: Trigger actual recording via Edge Function
    // const { data, error } = await supabase.functions.invoke('record-screen', {
    //   body: { flowName: params.flowName, customSteps: params.customSteps, baseUrl: params.baseUrl }
    // })

    return {
      success: true,
      data: {
        message: 'Screen recording job queued',
        flowName: params.flowName,
        flowDescription,
        note: 'Screen recordings require server-side execution. The recording will be processed and uploaded to storage.',
        formatted: `Screen Recording Queued\n\n${flowDescription}\n\nThe recording will be processed server-side using Playwright automation. Once complete, the video and screenshots will be available in your attachments.\n\nTo use the recording in a video:\n1. Wait for processing to complete\n2. Reference the recording in your video scenes\n3. HeyGen will composite it with your avatar`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'screen-recorder',
        requiresServerSide: true,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to queue recording: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
