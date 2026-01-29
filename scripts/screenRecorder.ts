// Screen Recorder Service
// Automates UI interactions and captures screen recordings for video production
// Uses Playwright for browser automation

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright'
import { supabase } from '@/services/supabase/client'
import * as fs from 'fs'
import * as path from 'path'

// ============================================
// TYPES
// ============================================

export interface ScreenRecordingConfig {
  /** Output directory for recordings */
  outputDir: string
  /** Video resolution */
  resolution: { width: number; height: number }
  /** Whether to record video */
  recordVideo: boolean
  /** Whether to take screenshots at key points */
  takeScreenshots: boolean
  /** Slow down actions for better visibility */
  slowMo?: number
}

export interface RecordingStep {
  /** Step name for logging */
  name: string
  /** Action to perform */
  action: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'scroll'
  /** Target selector or URL */
  target?: string
  /** Value for type actions */
  value?: string
  /** Wait time in ms */
  waitMs?: number
  /** Screenshot filename */
  screenshotName?: string
}

export interface RecordingScript {
  /** Script name */
  name: string
  /** Base URL for the app */
  baseUrl: string
  /** Steps to execute */
  steps: RecordingStep[]
  /** Optional authentication */
  auth?: {
    email: string
    password: string
  }
}

export interface RecordingResult {
  success: boolean
  videoPath?: string
  screenshots: string[]
  duration: number
  error?: string
}

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: ScreenRecordingConfig = {
  outputDir: './recordings',
  resolution: { width: 1920, height: 1080 },
  recordVideo: true,
  takeScreenshots: true,
  slowMo: 100,
}

// ============================================
// SCREEN RECORDER CLASS
// ============================================

export class ScreenRecorder {
  private config: ScreenRecordingConfig
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  constructor(config: Partial<ScreenRecordingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initialize the browser
   */
  async init(): Promise<void> {
    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true })
    }

    this.browser = await chromium.launch({
      headless: true, // Run headless for automation
      slowMo: this.config.slowMo,
    })

    this.context = await this.browser.newContext({
      viewport: this.config.resolution,
      recordVideo: this.config.recordVideo
        ? {
            dir: this.config.outputDir,
            size: this.config.resolution,
          }
        : undefined,
    })

    this.page = await this.context.newPage()
  }

  /**
   * Close the browser
   */
  async close(): Promise<string | undefined> {
    let videoPath: string | undefined

    if (this.page) {
      // Get video path before closing
      const video = this.page.video()
      if (video) {
        videoPath = await video.path()
      }
      await this.page.close()
    }

    if (this.context) {
      await this.context.close()
    }

    if (this.browser) {
      await this.browser.close()
    }

    return videoPath
  }

  /**
   * Execute a recording script
   */
  async executeScript(script: RecordingScript): Promise<RecordingResult> {
    const startTime = Date.now()
    const screenshots: string[] = []

    try {
      await this.init()

      if (!this.page) {
        throw new Error('Page not initialized')
      }

      // Handle authentication if provided
      if (script.auth) {
        await this.authenticate(script.baseUrl, script.auth)
      }

      // Execute each step
      for (const step of script.steps) {
        console.log(`[ScreenRecorder] Executing step: ${step.name}`)

        const screenshotPath = await this.executeStep(step, script.baseUrl)
        if (screenshotPath) {
          screenshots.push(screenshotPath)
        }
      }

      const videoPath = await this.close()

      return {
        success: true,
        videoPath,
        screenshots,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      await this.close()
      return {
        success: false,
        screenshots,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: RecordingStep,
    baseUrl: string
  ): Promise<string | undefined> {
    if (!this.page) throw new Error('Page not initialized')

    switch (step.action) {
      case 'navigate':
        const url = step.target?.startsWith('http')
          ? step.target
          : `${baseUrl}${step.target}`
        await this.page.goto(url, { waitUntil: 'networkidle' })
        break

      case 'click':
        if (!step.target) throw new Error('Click requires target selector')
        await this.page.click(step.target)
        break

      case 'type':
        if (!step.target || !step.value) {
          throw new Error('Type requires target selector and value')
        }
        await this.page.fill(step.target, step.value)
        break

      case 'wait':
        await this.page.waitForTimeout(step.waitMs || 1000)
        break

      case 'scroll':
        if (step.target) {
          await this.page.locator(step.target).scrollIntoViewIfNeeded()
        } else {
          await this.page.evaluate(() => window.scrollBy(0, 300))
        }
        break

      case 'screenshot':
        if (this.config.takeScreenshots) {
          const filename = step.screenshotName || `screenshot-${Date.now()}.png`
          const filepath = path.join(this.config.outputDir, filename)
          await this.page.screenshot({ path: filepath, fullPage: false })
          return filepath
        }
        break
    }

    // Small delay between steps for smoother recording
    await this.page.waitForTimeout(200)
    return undefined
  }

  /**
   * Handle authentication
   */
  private async authenticate(
    baseUrl: string,
    auth: { email: string; password: string }
  ): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    // Navigate to login page
    await this.page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })

    // Fill credentials (adjust selectors for your auth UI)
    await this.page.fill('input[type="email"]', auth.email)
    await this.page.fill('input[type="password"]', auth.password)
    await this.page.click('button[type="submit"]')

    // Wait for redirect after login
    await this.page.waitForNavigation({ waitUntil: 'networkidle' })
  }
}

// ============================================
// PRE-DEFINED RADAR RECORDING SCRIPTS
// ============================================

export const RADAR_SCRIPTS: Record<string, RecordingScript> = {
  // Script for "Adding Your First Source" video
  addFirstSource: {
    name: 'Adding Your First Source',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to dashboard', action: 'navigate', target: '/dashboard' },
      { name: 'Wait for load', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot dashboard', action: 'screenshot', screenshotName: 'dashboard.png' },
      { name: 'Click add source button', action: 'click', target: '[data-testid="add-source-btn"]' },
      { name: 'Wait for modal', action: 'wait', waitMs: 500 },
      { name: 'Screenshot add modal', action: 'screenshot', screenshotName: 'add-source-modal.png' },
      { name: 'Type source URL', action: 'type', target: 'input[name="url"]', value: 'https://techcrunch.com/feed/' },
      { name: 'Wait', action: 'wait', waitMs: 500 },
      { name: 'Screenshot with URL', action: 'screenshot', screenshotName: 'source-url-entered.png' },
      { name: 'Click add', action: 'click', target: '[data-testid="confirm-add-source"]' },
      { name: 'Wait for confirmation', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot success', action: 'screenshot', screenshotName: 'source-added.png' },
    ],
  },

  // Script for "Creating Topics" video
  createTopics: {
    name: 'Creating Topics',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to topics', action: 'navigate', target: '/topics' },
      { name: 'Wait for load', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot topics page', action: 'screenshot', screenshotName: 'topics-page.png' },
      { name: 'Click add topic', action: 'click', target: '[data-testid="add-topic-btn"]' },
      { name: 'Wait for modal', action: 'wait', waitMs: 500 },
      { name: 'Type topic name', action: 'type', target: 'input[name="name"]', value: 'AI in Sales' },
      { name: 'Wait', action: 'wait', waitMs: 300 },
      { name: 'Type keywords', action: 'type', target: 'input[name="keywords"]', value: 'artificial intelligence, machine learning, sales automation, GPT' },
      { name: 'Screenshot topic form', action: 'screenshot', screenshotName: 'topic-form.png' },
      { name: 'Click save', action: 'click', target: '[data-testid="save-topic"]' },
      { name: 'Wait for save', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot topic created', action: 'screenshot', screenshotName: 'topic-created.png' },
    ],
  },

  // Script for "AI Summaries" video
  aiSummaries: {
    name: 'AI Summaries Explained',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to feed', action: 'navigate', target: '/feed' },
      { name: 'Wait for load', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot feed', action: 'screenshot', screenshotName: 'feed-view.png' },
      { name: 'Hover over article', action: 'click', target: '.article-card:first-child' },
      { name: 'Wait for expand', action: 'wait', waitMs: 500 },
      { name: 'Screenshot expanded', action: 'screenshot', screenshotName: 'article-expanded.png' },
      { name: 'Click show summary', action: 'click', target: '[data-testid="show-summary"]' },
      { name: 'Wait for AI', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot summary', action: 'screenshot', screenshotName: 'ai-summary.png' },
    ],
  },

  // Script for "Welcome to Radar" video (dashboard overview)
  welcomeOverview: {
    name: 'Welcome to Radar',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to dashboard', action: 'navigate', target: '/dashboard' },
      { name: 'Wait for load', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot dashboard', action: 'screenshot', screenshotName: 'welcome-dashboard.png' },
      { name: 'Scroll to sources', action: 'scroll', target: '#sources-section' },
      { name: 'Wait', action: 'wait', waitMs: 500 },
      { name: 'Screenshot sources', action: 'screenshot', screenshotName: 'sources-section.png' },
      { name: 'Scroll to topics', action: 'scroll', target: '#topics-section' },
      { name: 'Wait', action: 'wait', waitMs: 500 },
      { name: 'Screenshot topics', action: 'screenshot', screenshotName: 'topics-section.png' },
      { name: 'Navigate to feed', action: 'navigate', target: '/feed' },
      { name: 'Wait', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot feed', action: 'screenshot', screenshotName: 'feed-overview.png' },
    ],
  },

  // Script for "Daily Digest" video
  dailyDigest: {
    name: 'Setting Up Daily Digest',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to settings', action: 'navigate', target: '/settings' },
      { name: 'Wait for load', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot settings', action: 'screenshot', screenshotName: 'settings-page.png' },
      { name: 'Click digest tab', action: 'click', target: '[data-testid="digest-tab"]' },
      { name: 'Wait', action: 'wait', waitMs: 500 },
      { name: 'Screenshot digest settings', action: 'screenshot', screenshotName: 'digest-settings.png' },
      { name: 'Toggle digest on', action: 'click', target: '[data-testid="digest-toggle"]' },
      { name: 'Wait', action: 'wait', waitMs: 300 },
      { name: 'Select time', action: 'click', target: '[data-testid="digest-time"]' },
      { name: 'Wait', action: 'wait', waitMs: 300 },
      { name: 'Screenshot time picker', action: 'screenshot', screenshotName: 'digest-time-picker.png' },
      { name: 'Select 7 AM', action: 'click', target: '[data-value="07:00"]' },
      { name: 'Wait', action: 'wait', waitMs: 300 },
      { name: 'Click save', action: 'click', target: '[data-testid="save-settings"]' },
      { name: 'Wait for save', action: 'wait', waitMs: 1000 },
      { name: 'Screenshot saved', action: 'screenshot', screenshotName: 'digest-configured.png' },
    ],
  },
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Record a specific Radar flow
 */
export async function recordRadarFlow(
  flowName: keyof typeof RADAR_SCRIPTS,
  auth?: { email: string; password: string },
  outputDir?: string
): Promise<RecordingResult> {
  const script = RADAR_SCRIPTS[flowName]
  if (!script) {
    return {
      success: false,
      screenshots: [],
      duration: 0,
      error: `Unknown flow: ${flowName}`,
    }
  }

  // Add auth if provided
  const scriptWithAuth = auth ? { ...script, auth } : script

  const recorder = new ScreenRecorder({
    outputDir: outputDir || `./recordings/${flowName}`,
  })

  return recorder.executeScript(scriptWithAuth)
}

/**
 * Upload recording to Supabase storage
 */
export async function uploadRecording(
  filePath: string,
  accountId: string
): Promise<string | null> {
  if (!supabase) return null

  const fileName = path.basename(filePath)
  const storagePath = `video-recordings/${accountId}/${Date.now()}-${fileName}`

  const fileBuffer = fs.readFileSync(filePath)

  const { error } = await supabase.storage
    .from('attachments')
    .upload(storagePath, fileBuffer, {
      contentType: filePath.endsWith('.mp4') ? 'video/mp4' : 'image/png',
    })

  if (error) {
    console.error('[ScreenRecorder] Upload error:', error)
    return null
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('attachments')
    .getPublicUrl(storagePath)

  return urlData.publicUrl
}
