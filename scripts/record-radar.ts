#!/usr/bin/env npx ts-node
/**
 * Radar Screen Recording CLI
 *
 * Records automated UI flows for video production using Playwright.
 *
 * Usage:
 *   npx ts-node scripts/record-radar.ts --flow=welcomeOverview
 *   npx ts-node scripts/record-radar.ts --flow=addFirstSource --email=test@example.com --password=secret
 *   npx ts-node scripts/record-radar.ts --list
 *   npx ts-node scripts/record-radar.ts --all
 *
 * Options:
 *   --flow=<name>     Flow to record (welcomeOverview, addFirstSource, createTopics, aiSummaries, dailyDigest)
 *   --email=<email>   Login email (optional, for authenticated flows)
 *   --password=<pw>   Login password (optional, for authenticated flows)
 *   --output=<dir>    Output directory (default: ./recordings)
 *   --headed          Run browser in headed mode (visible window)
 *   --list            List available flows
 *   --all             Record all flows sequentially
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

// ============================================
// TYPES
// ============================================

interface RecordingStep {
  name: string
  action: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'scroll'
  target?: string
  value?: string
  waitMs?: number
  screenshotName?: string
}

interface RecordingScript {
  name: string
  description: string
  baseUrl: string
  steps: RecordingStep[]
}

interface RecordingResult {
  success: boolean
  flowName: string
  videoPath?: string
  screenshots: string[]
  duration: number
  error?: string
}

// ============================================
// RADAR RECORDING FLOWS
// ============================================

const RADAR_FLOWS: Record<string, RecordingScript> = {
  welcomeOverview: {
    name: 'Welcome to Radar',
    description: 'Overview of the Radar dashboard and main features',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to dashboard', action: 'navigate', target: '/dashboard' },
      { name: 'Wait for load', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot dashboard', action: 'screenshot', screenshotName: '01-dashboard.png' },
      { name: 'Scroll to sources', action: 'scroll', target: '#sources-section' },
      { name: 'Wait', action: 'wait', waitMs: 800 },
      { name: 'Screenshot sources', action: 'screenshot', screenshotName: '02-sources-section.png' },
      { name: 'Scroll to topics', action: 'scroll', target: '#topics-section' },
      { name: 'Wait', action: 'wait', waitMs: 800 },
      { name: 'Screenshot topics', action: 'screenshot', screenshotName: '03-topics-section.png' },
      { name: 'Navigate to feed', action: 'navigate', target: '/feed' },
      { name: 'Wait for feed', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot feed', action: 'screenshot', screenshotName: '04-feed-overview.png' },
    ],
  },

  addFirstSource: {
    name: 'Adding Your First Source',
    description: 'How to add an RSS feed or news source to monitor',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to sources', action: 'navigate', target: '/sources' },
      { name: 'Wait for load', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot sources page', action: 'screenshot', screenshotName: '01-sources-page.png' },
      { name: 'Click add source', action: 'click', target: '[data-testid="add-source-btn"], button:has-text("Add Source")' },
      { name: 'Wait for modal', action: 'wait', waitMs: 600 },
      { name: 'Screenshot modal', action: 'screenshot', screenshotName: '02-add-source-modal.png' },
      { name: 'Type URL', action: 'type', target: 'input[name="url"], input[placeholder*="URL"]', value: 'https://techcrunch.com/feed/' },
      { name: 'Wait', action: 'wait', waitMs: 500 },
      { name: 'Screenshot with URL', action: 'screenshot', screenshotName: '03-url-entered.png' },
      { name: 'Click confirm', action: 'click', target: '[data-testid="confirm-add-source"], button:has-text("Add"), button[type="submit"]' },
      { name: 'Wait for add', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot success', action: 'screenshot', screenshotName: '04-source-added.png' },
    ],
  },

  createTopics: {
    name: 'Creating Topics',
    description: 'How to create topics to filter and organize your content',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to topics', action: 'navigate', target: '/topics' },
      { name: 'Wait for load', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot topics page', action: 'screenshot', screenshotName: '01-topics-page.png' },
      { name: 'Click add topic', action: 'click', target: '[data-testid="add-topic-btn"], button:has-text("Add Topic"), button:has-text("Create Topic")' },
      { name: 'Wait for modal', action: 'wait', waitMs: 600 },
      { name: 'Screenshot modal', action: 'screenshot', screenshotName: '02-add-topic-modal.png' },
      { name: 'Type name', action: 'type', target: 'input[name="name"], input[placeholder*="name"]', value: 'AI in Sales' },
      { name: 'Wait', action: 'wait', waitMs: 400 },
      { name: 'Type keywords', action: 'type', target: 'input[name="keywords"], textarea[name="keywords"], input[placeholder*="keyword"]', value: 'artificial intelligence, machine learning, sales automation, GPT, LLM' },
      { name: 'Wait', action: 'wait', waitMs: 400 },
      { name: 'Screenshot form filled', action: 'screenshot', screenshotName: '03-topic-form.png' },
      { name: 'Click save', action: 'click', target: '[data-testid="save-topic"], button:has-text("Save"), button:has-text("Create"), button[type="submit"]' },
      { name: 'Wait for save', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot created', action: 'screenshot', screenshotName: '04-topic-created.png' },
    ],
  },

  aiSummaries: {
    name: 'AI Summaries',
    description: 'How AI-powered summaries help you quickly understand articles',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to feed', action: 'navigate', target: '/feed' },
      { name: 'Wait for load', action: 'wait', waitMs: 2500 },
      { name: 'Screenshot feed', action: 'screenshot', screenshotName: '01-feed-view.png' },
      { name: 'Click first article', action: 'click', target: '.article-card:first-child, [data-testid="article-item"]:first-child, article:first-child' },
      { name: 'Wait for expand', action: 'wait', waitMs: 800 },
      { name: 'Screenshot expanded', action: 'screenshot', screenshotName: '02-article-expanded.png' },
      { name: 'Click summary', action: 'click', target: '[data-testid="show-summary"], button:has-text("Summary"), button:has-text("Summarize")' },
      { name: 'Wait for AI', action: 'wait', waitMs: 3000 },
      { name: 'Screenshot summary', action: 'screenshot', screenshotName: '03-ai-summary.png' },
    ],
  },

  dailyDigest: {
    name: 'Daily Digest Setup',
    description: 'How to configure your daily email digest with curated content',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to settings', action: 'navigate', target: '/settings' },
      { name: 'Wait for load', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot settings', action: 'screenshot', screenshotName: '01-settings-page.png' },
      { name: 'Click digest tab', action: 'click', target: '[data-testid="digest-tab"], button:has-text("Digest"), [role="tab"]:has-text("Digest")' },
      { name: 'Wait', action: 'wait', waitMs: 600 },
      { name: 'Screenshot digest', action: 'screenshot', screenshotName: '02-digest-settings.png' },
      { name: 'Toggle on', action: 'click', target: '[data-testid="digest-toggle"], input[type="checkbox"], [role="switch"]' },
      { name: 'Wait', action: 'wait', waitMs: 400 },
      { name: 'Click time picker', action: 'click', target: '[data-testid="digest-time"], select, input[type="time"]' },
      { name: 'Wait', action: 'wait', waitMs: 400 },
      { name: 'Screenshot time', action: 'screenshot', screenshotName: '03-time-picker.png' },
      { name: 'Click save', action: 'click', target: '[data-testid="save-settings"], button:has-text("Save")' },
      { name: 'Wait for save', action: 'wait', waitMs: 1500 },
      { name: 'Screenshot saved', action: 'screenshot', screenshotName: '04-digest-configured.png' },
    ],
  },
}

// ============================================
// SCREEN RECORDER
// ============================================

class RadarRecorder {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private outputDir: string
  private headed: boolean
  private auth?: { email: string; password: string }

  constructor(options: {
    outputDir: string
    headed?: boolean
    auth?: { email: string; password: string }
  }) {
    this.outputDir = options.outputDir
    this.headed = options.headed ?? false
    this.auth = options.auth
  }

  async init(flowName: string): Promise<void> {
    const flowDir = path.join(this.outputDir, flowName)

    // Create output directory
    if (!fs.existsSync(flowDir)) {
      fs.mkdirSync(flowDir, { recursive: true })
    }

    console.log(`\n  Browser: Launching ${this.headed ? 'headed' : 'headless'} Chromium...`)

    this.browser = await chromium.launch({
      headless: !this.headed,
      slowMo: 50,
    })

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: flowDir,
        size: { width: 1920, height: 1080 },
      },
    })

    this.page = await this.context.newPage()
    console.log(`  Browser: Ready`)
  }

  async close(): Promise<string | undefined> {
    let videoPath: string | undefined

    if (this.page) {
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

  async authenticate(baseUrl: string): Promise<void> {
    if (!this.page || !this.auth) return

    console.log(`  Auth: Logging in as ${this.auth.email}...`)

    await this.page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
    await this.page.fill('input[type="email"]', this.auth.email)
    await this.page.fill('input[type="password"]', this.auth.password)
    await this.page.click('button[type="submit"]')
    await this.page.waitForNavigation({ waitUntil: 'networkidle' })

    console.log(`  Auth: Logged in successfully`)
  }

  async record(flowName: string): Promise<RecordingResult> {
    const flow = RADAR_FLOWS[flowName]
    if (!flow) {
      return {
        success: false,
        flowName,
        screenshots: [],
        duration: 0,
        error: `Unknown flow: ${flowName}`,
      }
    }

    const startTime = Date.now()
    const screenshots: string[] = []
    const flowDir = path.join(this.outputDir, flowName)

    try {
      await this.init(flowName)

      if (!this.page) {
        throw new Error('Page not initialized')
      }

      // Authenticate if credentials provided
      if (this.auth) {
        await this.authenticate(flow.baseUrl)
      }

      console.log(`\n  Recording: ${flow.name}`)
      console.log(`  Steps: ${flow.steps.length} total\n`)

      // Execute steps
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i]
        const stepNum = String(i + 1).padStart(2, '0')

        process.stdout.write(`  [${stepNum}/${flow.steps.length}] ${step.name}...`)

        try {
          const result = await this.executeStep(step, flow.baseUrl, flowDir)
          if (result) {
            screenshots.push(result)
          }
          console.log(' done')
        } catch (stepError) {
          console.log(` FAILED: ${stepError instanceof Error ? stepError.message : 'Unknown error'}`)
          // Continue with other steps
        }
      }

      const videoPath = await this.close()
      const duration = Date.now() - startTime

      // Rename video file to something meaningful
      if (videoPath && fs.existsSync(videoPath)) {
        const newVideoPath = path.join(flowDir, `${flowName}-recording.webm`)
        fs.renameSync(videoPath, newVideoPath)

        console.log(`\n  Video saved: ${newVideoPath}`)
        console.log(`  Screenshots: ${screenshots.length} captured`)
        console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`)

        return {
          success: true,
          flowName,
          videoPath: newVideoPath,
          screenshots,
          duration,
        }
      }

      return {
        success: true,
        flowName,
        screenshots,
        duration,
      }
    } catch (error) {
      await this.close()
      return {
        success: false,
        flowName,
        screenshots,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  private async executeStep(
    step: RecordingStep,
    baseUrl: string,
    flowDir: string
  ): Promise<string | undefined> {
    if (!this.page) throw new Error('Page not initialized')

    switch (step.action) {
      case 'navigate': {
        const url = step.target?.startsWith('http')
          ? step.target
          : `${baseUrl}${step.target}`
        await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
        break
      }

      case 'click': {
        if (!step.target) throw new Error('Click requires target')
        // Try multiple selectors (comma-separated)
        const selectors = step.target.split(', ')
        let clicked = false
        for (const selector of selectors) {
          try {
            await this.page.click(selector.trim(), { timeout: 5000 })
            clicked = true
            break
          } catch {
            // Try next selector
          }
        }
        if (!clicked) {
          throw new Error(`Could not find clickable element: ${step.target}`)
        }
        break
      }

      case 'type': {
        if (!step.target || !step.value) {
          throw new Error('Type requires target and value')
        }
        // Try multiple selectors
        const selectors = step.target.split(', ')
        let typed = false
        for (const selector of selectors) {
          try {
            await this.page.fill(selector.trim(), step.value, { timeout: 5000 })
            typed = true
            break
          } catch {
            // Try next selector
          }
        }
        if (!typed) {
          throw new Error(`Could not find input element: ${step.target}`)
        }
        break
      }

      case 'wait': {
        await this.page.waitForTimeout(step.waitMs || 1000)
        break
      }

      case 'scroll': {
        if (step.target) {
          try {
            await this.page.locator(step.target).scrollIntoViewIfNeeded({ timeout: 3000 })
          } catch {
            // Fallback to regular scroll
            await this.page.evaluate(() => window.scrollBy(0, 400))
          }
        } else {
          await this.page.evaluate(() => window.scrollBy(0, 400))
        }
        break
      }

      case 'screenshot': {
        const filename = step.screenshotName || `screenshot-${Date.now()}.png`
        const filepath = path.join(flowDir, filename)
        await this.page.screenshot({ path: filepath, fullPage: false })
        return filepath
      }
    }

    // Small delay between steps
    await this.page.waitForTimeout(150)
    return undefined
  }
}

// ============================================
// CLI
// ============================================

function parseArgs(): {
  flow?: string
  email?: string
  password?: string
  output: string
  headed: boolean
  list: boolean
  all: boolean
} {
  const args = process.argv.slice(2)
  const result = {
    flow: undefined as string | undefined,
    email: undefined as string | undefined,
    password: undefined as string | undefined,
    output: './recordings',
    headed: false,
    list: false,
    all: false,
  }

  for (const arg of args) {
    if (arg.startsWith('--flow=')) {
      result.flow = arg.replace('--flow=', '')
    } else if (arg.startsWith('--email=')) {
      result.email = arg.replace('--email=', '')
    } else if (arg.startsWith('--password=')) {
      result.password = arg.replace('--password=', '')
    } else if (arg.startsWith('--output=')) {
      result.output = arg.replace('--output=', '')
    } else if (arg === '--headed') {
      result.headed = true
    } else if (arg === '--list') {
      result.list = true
    } else if (arg === '--all') {
      result.all = true
    }
  }

  return result
}

function printHelp(): void {
  console.log(`
Radar Screen Recording CLI
===========================

Records automated UI flows for video production.

Usage:
  npx ts-node scripts/record-radar.ts --flow=<name> [options]

Available Flows:
`)

  for (const [name, flow] of Object.entries(RADAR_FLOWS)) {
    console.log(`  ${name.padEnd(20)} ${flow.description}`)
  }

  console.log(`
Options:
  --flow=<name>       Flow to record (required unless --list or --all)
  --email=<email>     Login email for authenticated flows
  --password=<pw>     Login password for authenticated flows
  --output=<dir>      Output directory (default: ./recordings)
  --headed            Show browser window during recording
  --list              List available flows
  --all               Record all flows

Examples:
  npx ts-node scripts/record-radar.ts --list
  npx ts-node scripts/record-radar.ts --flow=welcomeOverview
  npx ts-node scripts/record-radar.ts --flow=addFirstSource --headed
  npx ts-node scripts/record-radar.ts --all --email=demo@radar.com --password=demo123
`)
}

async function main(): Promise<void> {
  const args = parseArgs()

  // List flows
  if (args.list) {
    console.log('\nAvailable Recording Flows:')
    console.log('==========================\n')
    for (const [name, flow] of Object.entries(RADAR_FLOWS)) {
      console.log(`  ${name}`)
      console.log(`    Name: ${flow.name}`)
      console.log(`    Description: ${flow.description}`)
      console.log(`    Steps: ${flow.steps.length}`)
      console.log()
    }
    return
  }

  // Validate args
  if (!args.flow && !args.all) {
    printHelp()
    process.exit(1)
  }

  // Setup auth if provided
  const auth = args.email && args.password
    ? { email: args.email, password: args.password }
    : undefined

  // Record flows
  const flowsToRecord = args.all
    ? Object.keys(RADAR_FLOWS)
    : [args.flow!]

  console.log('\n========================================')
  console.log('  Radar Screen Recorder')
  console.log('========================================')
  console.log(`\n  Output: ${path.resolve(args.output)}`)
  console.log(`  Flows: ${flowsToRecord.join(', ')}`)
  if (auth) {
    console.log(`  Auth: ${auth.email}`)
  }
  console.log()

  const results: RecordingResult[] = []

  for (const flowName of flowsToRecord) {
    console.log(`\n----------------------------------------`)
    console.log(`  Flow: ${flowName}`)
    console.log(`----------------------------------------`)

    const recorder = new RadarRecorder({
      outputDir: args.output,
      headed: args.headed,
      auth,
    })

    const result = await recorder.record(flowName)
    results.push(result)

    if (!result.success) {
      console.log(`\n  ERROR: ${result.error}`)
    }
  }

  // Summary
  console.log('\n========================================')
  console.log('  Recording Summary')
  console.log('========================================\n')

  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)

  console.log(`  Total: ${results.length}`)
  console.log(`  Successful: ${successful.length}`)
  console.log(`  Failed: ${failed.length}`)

  if (successful.length > 0) {
    console.log('\n  Completed recordings:')
    for (const r of successful) {
      console.log(`    - ${r.flowName}: ${r.screenshots.length} screenshots, ${(r.duration / 1000).toFixed(1)}s`)
      if (r.videoPath) {
        console.log(`      Video: ${r.videoPath}`)
      }
    }
  }

  if (failed.length > 0) {
    console.log('\n  Failed recordings:')
    for (const r of failed) {
      console.log(`    - ${r.flowName}: ${r.error}`)
    }
    process.exit(1)
  }

  console.log('\nDone!\n')
}

// Run
main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
