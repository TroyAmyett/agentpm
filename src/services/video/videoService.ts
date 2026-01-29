// Video Production Service
// Orchestrates video creation workflow from content to finished video

import { supabase } from '@/services/supabase/client'
import { createHeyGenClient, getHeyGenClient } from './heygenClient'

// ============================================
// TYPES
// ============================================

export type VideoJobStatus =
  | 'draft'
  | 'analyzing'
  | 'scripting'
  | 'scene_planning'
  | 'pending'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type VideoType =
  | 'onboarding'
  | 'feature_demo'
  | 'how_to'
  | 'quick_tip'
  | 'training'
  | 'marketing'

export type VideoPlatform = 'heygen' | 'synthesia' | 'colossyan'

export interface ProductInfo {
  productName: string
  keyFeatures: string[]
  targetAudience: string
  useCases: string[]
  terminology: Record<string, string>
}

export interface VideoScript {
  title: string
  totalDurationSec: number
  sections: Array<{
    name: string
    content: string
    durationSec: number
    onScreenText?: string
  }>
}

export interface VideoScene {
  sceneNumber: number
  startTimeSec: number
  endTimeSec: number
  durationSec: number
  scriptText: string
  onScreenText?: string
  backgroundType: string
  backgroundColor: string
  avatarPosition: string
  avatarAction: string
  screenRecordingUrl?: string
  elements: Array<{
    type: string
    content: string
    position: string
    style?: Record<string, string>
  }>
}

export interface VideoJob {
  id: string
  accountId: string
  createdBy: string | null
  title: string
  description: string | null
  videoType: VideoType
  status: VideoJobStatus

  // Input
  inputType: string | null
  inputContent: string | null
  inputAttachmentId: string | null
  inputUrl: string | null

  // Generated content
  productInfo: ProductInfo | null
  script: VideoScript | null
  scriptApproved: boolean
  scriptApprovedAt: string | null
  scenes: VideoScene[] | null

  // Platform
  platform: VideoPlatform
  templateId: string | null
  platformJobId: string | null
  platformStatus: string | null

  // Avatar & Voice
  avatarId: string | null
  voiceId: string | null

  // Output
  videoUrl: string | null
  videoDurationSeconds: number | null
  thumbnailUrl: string | null
  captionsUrl: string | null

  // Tracking
  estimatedCredits: number | null
  actualCredits: number | null
  errorMessage: string | null

  // Timestamps
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  completedAt: string | null
}

export interface VideoTemplate {
  id: string
  accountId: string
  createdBy: string | null
  name: string
  description: string | null
  videoType: VideoType
  platform: VideoPlatform
  platformTemplateId: string | null
  avatarId: string | null
  avatarName: string | null
  voiceId: string | null
  voiceName: string | null
  voiceSettings: {
    accent: string
    pace: string
    emotion: string
  }
  backgroundType: string
  backgroundValue: string
  logoPosition: string
  resolution: string
  aspectRatio: string
  captionsEnabled: boolean
  variables: Array<{ name: string; description: string; default: string }>
  introClipUrl: string | null
  outroClipUrl: string | null
  isDefault: boolean
  isShared: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateVideoJobInput {
  accountId: string
  userId: string
  title: string
  description?: string
  videoType: VideoType
  inputType?: 'text' | 'url' | 'document' | 'attachment'
  inputContent?: string
  inputUrl?: string
  inputAttachmentId?: string
  templateId?: string
  avatarId?: string
  voiceId?: string
  platform?: VideoPlatform
  relatedTaskId?: string
  relatedProjectId?: string
  relatedNoteId?: string
}

// ============================================
// DATABASE HELPERS
// ============================================

function mapDbToVideoJob(row: Record<string, unknown>): VideoJob {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    createdBy: row.created_by as string | null,
    title: row.title as string,
    description: row.description as string | null,
    videoType: row.video_type as VideoType,
    status: row.status as VideoJobStatus,
    inputType: row.input_type as string | null,
    inputContent: row.input_content as string | null,
    inputAttachmentId: row.input_attachment_id as string | null,
    inputUrl: row.input_url as string | null,
    productInfo: row.product_info as ProductInfo | null,
    script: row.script as VideoScript | null,
    scriptApproved: row.script_approved as boolean,
    scriptApprovedAt: row.script_approved_at as string | null,
    scenes: row.scenes as VideoScene[] | null,
    platform: row.platform as VideoPlatform,
    templateId: row.template_id as string | null,
    platformJobId: row.platform_job_id as string | null,
    platformStatus: row.platform_status as string | null,
    avatarId: row.avatar_id as string | null,
    voiceId: row.voice_id as string | null,
    videoUrl: row.video_url as string | null,
    videoDurationSeconds: row.video_duration_seconds as number | null,
    thumbnailUrl: row.thumbnail_url as string | null,
    captionsUrl: row.captions_url as string | null,
    estimatedCredits: row.estimated_credits as number | null,
    actualCredits: row.actual_credits as number | null,
    errorMessage: row.error_message as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    submittedAt: row.submitted_at as string | null,
    completedAt: row.completed_at as string | null,
  }
}

function mapDbToVideoTemplate(row: Record<string, unknown>): VideoTemplate {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    createdBy: row.created_by as string | null,
    name: row.name as string,
    description: row.description as string | null,
    videoType: row.video_type as VideoType,
    platform: row.platform as VideoPlatform,
    platformTemplateId: row.platform_template_id as string | null,
    avatarId: row.avatar_id as string | null,
    avatarName: row.avatar_name as string | null,
    voiceId: row.voice_id as string | null,
    voiceName: row.voice_name as string | null,
    voiceSettings: row.voice_settings as VideoTemplate['voiceSettings'],
    backgroundType: row.background_type as string,
    backgroundValue: row.background_value as string,
    logoPosition: row.logo_position as string,
    resolution: row.resolution as string,
    aspectRatio: row.aspect_ratio as string,
    captionsEnabled: row.captions_enabled as boolean,
    variables: row.variables as VideoTemplate['variables'],
    introClipUrl: row.intro_clip_url as string | null,
    outroClipUrl: row.outro_clip_url as string | null,
    isDefault: row.is_default as boolean,
    isShared: row.is_shared as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// ============================================
// VIDEO JOB CRUD
// ============================================

/**
 * Create a new video job
 */
export async function createVideoJob(input: CreateVideoJobInput): Promise<VideoJob> {
  if (!supabase) throw new Error('Supabase not initialized')

  const { data, error } = await supabase
    .from('video_jobs')
    .insert({
      account_id: input.accountId,
      created_by: input.userId,
      title: input.title,
      description: input.description,
      video_type: input.videoType,
      input_type: input.inputType,
      input_content: input.inputContent,
      input_url: input.inputUrl,
      input_attachment_id: input.inputAttachmentId,
      template_id: input.templateId,
      avatar_id: input.avatarId,
      voice_id: input.voiceId,
      platform: input.platform || 'heygen',
      related_task_id: input.relatedTaskId,
      related_project_id: input.relatedProjectId,
      related_note_id: input.relatedNoteId,
      status: 'draft',
    })
    .select()
    .single()

  if (error) throw error
  return mapDbToVideoJob(data)
}

/**
 * Get a video job by ID
 */
export async function getVideoJob(id: string): Promise<VideoJob | null> {
  if (!supabase) throw new Error('Supabase not initialized')

  const { data, error } = await supabase
    .from('video_jobs')
    .select()
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  return mapDbToVideoJob(data)
}

/**
 * List video jobs for an account
 */
export async function listVideoJobs(
  accountId: string,
  options?: {
    status?: VideoJobStatus
    limit?: number
    offset?: number
  }
): Promise<VideoJob[]> {
  if (!supabase) throw new Error('Supabase not initialized')

  let query = supabase
    .from('video_jobs')
    .select()
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (options?.status) {
    query = query.eq('status', options.status)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) throw error
  return (data || []).map(mapDbToVideoJob)
}

/**
 * Update a video job
 */
export async function updateVideoJob(
  id: string,
  updates: Partial<{
    title: string
    description: string
    status: VideoJobStatus
    productInfo: ProductInfo
    script: VideoScript
    scriptApproved: boolean
    scriptApprovedAt: string
    scenes: VideoScene[]
    templateId: string
    avatarId: string
    voiceId: string
    platformJobId: string
    platformStatus: string
    platformResponse: Record<string, unknown>
    videoUrl: string
    videoDurationSeconds: number
    thumbnailUrl: string
    captionsUrl: string
    estimatedCredits: number
    actualCredits: number
    errorMessage: string
    submittedAt: string
    completedAt: string
  }>
): Promise<VideoJob> {
  if (!supabase) throw new Error('Supabase not initialized')

  const dbUpdates: Record<string, unknown> = {}
  if (updates.title !== undefined) dbUpdates.title = updates.title
  if (updates.description !== undefined) dbUpdates.description = updates.description
  if (updates.status !== undefined) dbUpdates.status = updates.status
  if (updates.productInfo !== undefined) dbUpdates.product_info = updates.productInfo
  if (updates.script !== undefined) dbUpdates.script = updates.script
  if (updates.scriptApproved !== undefined) dbUpdates.script_approved = updates.scriptApproved
  if (updates.scriptApprovedAt !== undefined) dbUpdates.script_approved_at = updates.scriptApprovedAt
  if (updates.scenes !== undefined) dbUpdates.scenes = updates.scenes
  if (updates.templateId !== undefined) dbUpdates.template_id = updates.templateId
  if (updates.avatarId !== undefined) dbUpdates.avatar_id = updates.avatarId
  if (updates.voiceId !== undefined) dbUpdates.voice_id = updates.voiceId
  if (updates.platformJobId !== undefined) dbUpdates.platform_job_id = updates.platformJobId
  if (updates.platformStatus !== undefined) dbUpdates.platform_status = updates.platformStatus
  if (updates.platformResponse !== undefined) dbUpdates.platform_response = updates.platformResponse
  if (updates.videoUrl !== undefined) dbUpdates.video_url = updates.videoUrl
  if (updates.videoDurationSeconds !== undefined) dbUpdates.video_duration_seconds = updates.videoDurationSeconds
  if (updates.thumbnailUrl !== undefined) dbUpdates.thumbnail_url = updates.thumbnailUrl
  if (updates.captionsUrl !== undefined) dbUpdates.captions_url = updates.captionsUrl
  if (updates.estimatedCredits !== undefined) dbUpdates.estimated_credits = updates.estimatedCredits
  if (updates.actualCredits !== undefined) dbUpdates.actual_credits = updates.actualCredits
  if (updates.errorMessage !== undefined) dbUpdates.error_message = updates.errorMessage
  if (updates.submittedAt !== undefined) dbUpdates.submitted_at = updates.submittedAt
  if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt

  const { data, error } = await supabase
    .from('video_jobs')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return mapDbToVideoJob(data)
}

/**
 * Delete a video job
 */
export async function deleteVideoJob(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized')

  const { error } = await supabase.from('video_jobs').delete().eq('id', id)
  if (error) throw error
}

// ============================================
// VIDEO TEMPLATE CRUD
// ============================================

/**
 * Create a video template
 */
export async function createVideoTemplate(input: {
  accountId: string
  userId: string
  name: string
  description?: string
  videoType: VideoType
  platform: VideoPlatform
  avatarId?: string
  avatarName?: string
  voiceId?: string
  voiceName?: string
  voiceSettings?: VideoTemplate['voiceSettings']
  backgroundType?: string
  backgroundValue?: string
  logoPosition?: string
  resolution?: string
  aspectRatio?: string
  captionsEnabled?: boolean
  isDefault?: boolean
}): Promise<VideoTemplate> {
  if (!supabase) throw new Error('Supabase not initialized')

  const { data, error } = await supabase
    .from('video_templates')
    .insert({
      account_id: input.accountId,
      created_by: input.userId,
      name: input.name,
      description: input.description,
      video_type: input.videoType,
      platform: input.platform,
      avatar_id: input.avatarId,
      avatar_name: input.avatarName,
      voice_id: input.voiceId,
      voice_name: input.voiceName,
      voice_settings: input.voiceSettings,
      background_type: input.backgroundType,
      background_value: input.backgroundValue,
      logo_position: input.logoPosition,
      resolution: input.resolution,
      aspect_ratio: input.aspectRatio,
      captions_enabled: input.captionsEnabled,
      is_default: input.isDefault,
    })
    .select()
    .single()

  if (error) throw error
  return mapDbToVideoTemplate(data)
}

/**
 * List video templates for an account
 */
export async function listVideoTemplates(accountId: string): Promise<VideoTemplate[]> {
  if (!supabase) throw new Error('Supabase not initialized')

  const { data, error } = await supabase
    .from('video_templates')
    .select()
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(mapDbToVideoTemplate)
}

/**
 * Get default template for a video type
 */
export async function getDefaultTemplate(
  accountId: string,
  videoType: VideoType
): Promise<VideoTemplate | null> {
  if (!supabase) throw new Error('Supabase not initialized')

  const { data, error } = await supabase
    .from('video_templates')
    .select()
    .eq('account_id', accountId)
    .eq('video_type', videoType)
    .eq('is_default', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return mapDbToVideoTemplate(data)
}

// ============================================
// VIDEO GENERATION WORKFLOW
// ============================================

/**
 * Submit a video job to HeyGen for rendering
 */
export async function submitVideoJob(
  jobId: string,
  options?: { apiKey?: string; testMode?: boolean }
): Promise<VideoJob> {
  const job = await getVideoJob(jobId)
  if (!job) throw new Error('Video job not found')

  if (!job.script || !job.scriptApproved) {
    throw new Error('Script must be approved before submitting')
  }

  if (!job.avatarId || !job.voiceId) {
    throw new Error('Avatar and voice must be selected')
  }

  // Get HeyGen client
  const client = options?.apiKey
    ? createHeyGenClient(options.apiKey)
    : getHeyGenClient()

  // Convert script sections to HeyGen scenes
  const scenes = job.script.sections.map((section) => ({
    avatarId: job.avatarId!,
    voiceId: job.voiceId!,
    script: section.content,
    backgroundColor: '#0a0a0f', // Dark background from brand
  }))

  // Submit to HeyGen
  await updateVideoJob(jobId, {
    status: 'rendering',
    submittedAt: new Date().toISOString(),
  })

  try {
    const platformJobId = await client.generateMultiSceneVideo({
      scenes,
      aspectRatio: '16:9',
      testMode: options?.testMode || false,
      captions: true,
      callbackId: jobId, // Use our job ID for webhook matching
    })

    return updateVideoJob(jobId, {
      platformJobId,
      platformStatus: 'pending',
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await updateVideoJob(jobId, {
      status: 'failed',
      errorMessage,
    })
    throw error
  }
}

/**
 * Check status of a rendering video job
 */
export async function checkVideoJobStatus(
  jobId: string,
  options?: { apiKey?: string }
): Promise<VideoJob> {
  const job = await getVideoJob(jobId)
  if (!job) throw new Error('Video job not found')
  if (!job.platformJobId) throw new Error('Job not submitted to platform')

  const client = options?.apiKey
    ? createHeyGenClient(options.apiKey)
    : getHeyGenClient()

  const status = await client.getVideoStatus(job.platformJobId)

  const updates: Parameters<typeof updateVideoJob>[1] = {
    platformStatus: status.status,
  }

  if (status.status === 'completed') {
    updates.status = 'completed'
    updates.videoUrl = status.video_url
    updates.thumbnailUrl = status.thumbnail_url
    updates.videoDurationSeconds = status.duration
    updates.captionsUrl = status.video_url_caption
    updates.completedAt = new Date().toISOString()
  } else if (status.status === 'failed') {
    updates.status = 'failed'
    updates.errorMessage = status.error || 'Video generation failed'
  }

  return updateVideoJob(jobId, updates)
}

/**
 * Process webhook callback from HeyGen
 */
export async function processVideoWebhook(payload: {
  event_type: string
  video_id: string
  status: string
  video_url?: string
  thumbnail_url?: string
  duration?: number
  callback_id?: string
  error?: string
}): Promise<VideoJob | null> {
  // Find job by callback_id (our job ID) or platform_job_id
  if (!supabase) throw new Error('Supabase not initialized')

  const { data, error } = await supabase
    .from('video_jobs')
    .select()
    .or(`id.eq.${payload.callback_id},platform_job_id.eq.${payload.video_id}`)
    .single()

  if (error || !data) {
    console.warn('[VideoService] Webhook for unknown job:', payload)
    return null
  }

  const updates: Parameters<typeof updateVideoJob>[1] = {
    platformStatus: payload.status,
  }

  if (payload.status === 'completed' || payload.event_type === 'video.completed') {
    updates.status = 'completed'
    updates.videoUrl = payload.video_url
    updates.thumbnailUrl = payload.thumbnail_url
    updates.videoDurationSeconds = payload.duration
    updates.completedAt = new Date().toISOString()
  } else if (payload.status === 'failed' || payload.event_type === 'video.failed') {
    updates.status = 'failed'
    updates.errorMessage = payload.error || 'Video generation failed'
  }

  return updateVideoJob(data.id, updates)
}

// ============================================
// EXPORTS
// ============================================

export {
  HeyGenClient,
  getHeyGenClient,
  createHeyGenClient,
} from './heygenClient'
