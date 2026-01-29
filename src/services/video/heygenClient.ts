// HeyGen API Client
// Documentation: https://docs.heygen.com/reference/

const HEYGEN_API_BASE = 'https://api.heygen.com'

// ============================================
// TYPES
// ============================================

export interface HeyGenAvatar {
  avatar_id: string
  avatar_name: string
  gender: string
  preview_image_url: string
  preview_video_url: string
}

export interface HeyGenVoice {
  voice_id: string
  name: string
  language: string
  gender: string
  preview_audio: string
  support_pause: boolean
  emotion_support: boolean
}

export interface HeyGenVideoInput {
  character: {
    type: 'avatar'
    avatar_id: string
    avatar_style?: 'normal' | 'circle' | 'closeUp'
  }
  voice: {
    type: 'text'
    voice_id: string
    input_text: string
    speed?: number  // 0.5 to 1.5
    pitch?: number  // -50 to 50
  }
  background?: {
    type: 'color' | 'image' | 'video'
    value: string  // hex color, image URL, or video URL
  }
}

export interface HeyGenVideoClip {
  avatar_id: string
  voice_id: string
  input_text: string
  scale?: number
  offset?: { x: number; y: number }
  background?: {
    type: 'color' | 'image'
    value: string
  }
}

export interface HeyGenVideoRequest {
  video_inputs: HeyGenVideoInput[]
  dimension?: {
    width: number
    height: number
  }
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  test?: boolean  // Draft mode (faster, lower quality)
  caption?: boolean
  callback_id?: string  // For webhook identification
}

export interface HeyGenVideoResponse {
  error: null | string
  data: {
    video_id: string
  }
}

export interface HeyGenVideoStatus {
  error: null | string
  data: {
    video_id: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    video_url?: string
    video_url_caption?: string
    thumbnail_url?: string
    duration?: number
    gif_url?: string
    callback_id?: string
    error?: string
  }
}

export interface HeyGenListResponse<T> {
  error: null | string
  data: {
    avatars?: T[]
    voices?: T[]
    videos?: T[]
    token?: string  // Pagination token
  }
}

// ============================================
// CLIENT CLASS
// ============================================

export class HeyGenClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${HEYGEN_API_BASE}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HeyGen API error (${response.status}): ${errorText}`)
    }

    return response.json()
  }

  // ============================================
  // AVATARS
  // ============================================

  /**
   * List all available avatars
   */
  async listAvatars(): Promise<HeyGenAvatar[]> {
    const response = await this.request<HeyGenListResponse<HeyGenAvatar>>(
      '/v2/avatars'
    )
    return response.data.avatars || []
  }

  // ============================================
  // VOICES
  // ============================================

  /**
   * List all available voices
   */
  async listVoices(): Promise<HeyGenVoice[]> {
    const response = await this.request<HeyGenListResponse<HeyGenVoice>>(
      '/v2/voices'
    )
    return response.data.voices || []
  }

  // ============================================
  // VIDEO GENERATION
  // ============================================

  /**
   * Generate a video from avatar and script
   * Returns the video_id to poll for completion
   */
  async generateVideo(request: HeyGenVideoRequest): Promise<string> {
    const response = await this.request<HeyGenVideoResponse>(
      '/v2/video/generate',
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    )

    if (response.error) {
      throw new Error(`HeyGen generation error: ${response.error}`)
    }

    return response.data.video_id
  }

  /**
   * Generate a simple single-scene video
   * Convenience method for basic video creation
   */
  async generateSimpleVideo(params: {
    avatarId: string
    voiceId: string
    script: string
    backgroundColor?: string
    aspectRatio?: '16:9' | '9:16' | '1:1'
    testMode?: boolean
    captions?: boolean
    callbackId?: string
  }): Promise<string> {
    const request: HeyGenVideoRequest = {
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: params.avatarId,
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            voice_id: params.voiceId,
            input_text: params.script,
          },
          background: params.backgroundColor
            ? {
                type: 'color',
                value: params.backgroundColor,
              }
            : undefined,
        },
      ],
      aspect_ratio: params.aspectRatio || '16:9',
      test: params.testMode || false,
      caption: params.captions !== false,
      callback_id: params.callbackId,
    }

    return this.generateVideo(request)
  }

  /**
   * Generate a multi-scene video
   * Each scene can have different scripts and settings
   */
  async generateMultiSceneVideo(params: {
    scenes: Array<{
      avatarId: string
      voiceId: string
      script: string
      backgroundColor?: string
    }>
    aspectRatio?: '16:9' | '9:16' | '1:1'
    testMode?: boolean
    captions?: boolean
    callbackId?: string
  }): Promise<string> {
    const videoInputs: HeyGenVideoInput[] = params.scenes.map((scene) => ({
      character: {
        type: 'avatar',
        avatar_id: scene.avatarId,
        avatar_style: 'normal',
      },
      voice: {
        type: 'text',
        voice_id: scene.voiceId,
        input_text: scene.script,
      },
      background: scene.backgroundColor
        ? {
            type: 'color',
            value: scene.backgroundColor,
          }
        : undefined,
    }))

    const request: HeyGenVideoRequest = {
      video_inputs: videoInputs,
      aspect_ratio: params.aspectRatio || '16:9',
      test: params.testMode || false,
      caption: params.captions !== false,
      callback_id: params.callbackId,
    }

    return this.generateVideo(request)
  }

  /**
   * Check the status of a video generation job
   */
  async getVideoStatus(videoId: string): Promise<HeyGenVideoStatus['data']> {
    const response = await this.request<HeyGenVideoStatus>(
      `/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`
    )

    if (response.error) {
      throw new Error(`HeyGen status error: ${response.error}`)
    }

    return response.data
  }

  /**
   * Poll for video completion
   * Returns the video URL when ready
   */
  async waitForVideo(
    videoId: string,
    options: {
      maxAttempts?: number
      pollIntervalMs?: number
      onProgress?: (status: string) => void
    } = {}
  ): Promise<HeyGenVideoStatus['data']> {
    const maxAttempts = options.maxAttempts || 60  // 5 minutes with 5s interval
    const pollIntervalMs = options.pollIntervalMs || 5000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getVideoStatus(videoId)

      options.onProgress?.(status.status)

      if (status.status === 'completed') {
        return status
      }

      if (status.status === 'failed') {
        throw new Error(`Video generation failed: ${status.error || 'Unknown error'}`)
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error('Video generation timed out')
  }

  /**
   * List generated videos
   */
  async listVideos(limit: number = 100): Promise<HeyGenVideoStatus['data'][]> {
    const response = await this.request<HeyGenListResponse<HeyGenVideoStatus['data']>>(
      `/v1/video.list?limit=${limit}`
    )
    return response.data.videos || []
  }

  /**
   * Delete a video
   */
  async deleteVideo(videoId: string): Promise<void> {
    await this.request(`/v1/video.delete?video_id=${encodeURIComponent(videoId)}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // STREAMING AVATAR (Interactive)
  // ============================================

  /**
   * Create a streaming avatar session
   * For real-time interactive avatars
   */
  async createStreamingSession(params: {
    avatarId: string
    voiceId: string
    quality?: 'low' | 'medium' | 'high'
  }): Promise<{ session_id: string; access_token: string }> {
    const response = await this.request<{
      error: null | string
      data: { session_id: string; access_token: string }
    }>('/v1/streaming.new', {
      method: 'POST',
      body: JSON.stringify({
        avatar_id: params.avatarId,
        voice_id: params.voiceId,
        quality: params.quality || 'high',
      }),
    })

    if (response.error) {
      throw new Error(`Streaming session error: ${response.error}`)
    }

    return response.data
  }

  /**
   * Close a streaming avatar session
   */
  async closeStreamingSession(sessionId: string): Promise<void> {
    await this.request('/v1/streaming.stop', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    })
  }

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Get remaining API credits
   */
  async getCredits(): Promise<{ remaining_quota: number; used_quota: number }> {
    const response = await this.request<{
      error: null | string
      data: { remaining_quota: number; used_quota: number }
    }>('/v1/user/remaining_quota')

    if (response.error) {
      throw new Error(`Credits check error: ${response.error}`)
    }

    return response.data
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

let clientInstance: HeyGenClient | null = null

/**
 * Get or create HeyGen client instance
 * Uses VITE_HEYGEN_API_KEY environment variable
 */
export function getHeyGenClient(): HeyGenClient {
  if (clientInstance) {
    return clientInstance
  }

  const apiKey = import.meta.env.VITE_HEYGEN_API_KEY
  if (!apiKey) {
    throw new Error('VITE_HEYGEN_API_KEY environment variable not configured')
  }

  clientInstance = new HeyGenClient(apiKey)
  return clientInstance
}

/**
 * Create a new HeyGen client with a specific API key
 * Useful for per-user API keys (BYOK)
 */
export function createHeyGenClient(apiKey: string): HeyGenClient {
  return new HeyGenClient(apiKey)
}
