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
  action: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'scroll' | 'evaluate'
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
      // Dashboard is the root route
      { name: 'Navigate to dashboard', action: 'navigate', target: '/' },
      { name: 'Wait for content load', action: 'wait', waitMs: 3000 },
      { name: 'Screenshot dashboard', action: 'screenshot', screenshotName: '01-dashboard-overview.png' },
      // Show topic filter bar
      { name: 'Screenshot topic filters', action: 'screenshot', screenshotName: '02-topic-filters.png' },
      // Scroll down to show content cards
      { name: 'Scroll to content', action: 'scroll' },
      { name: 'Wait', action: 'wait', waitMs: 800 },
      { name: 'Screenshot content cards', action: 'screenshot', screenshotName: '03-content-cards.png' },
      // Navigate to Sources page
      { name: 'Navigate to sources', action: 'navigate', target: '/sources' },
      { name: 'Wait for sources', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot sources', action: 'screenshot', screenshotName: '04-sources-page.png' },
      // Navigate to Settings to show topics
      { name: 'Navigate to settings', action: 'navigate', target: '/settings' },
      { name: 'Wait for settings', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot settings/topics', action: 'screenshot', screenshotName: '05-settings-topics.png' },
      // Back to dashboard
      { name: 'Navigate back to dashboard', action: 'navigate', target: '/' },
      { name: 'Wait for load', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot final dashboard', action: 'screenshot', screenshotName: '06-dashboard-final.png' },
    ],
  },

  addFirstSource: {
    name: 'Adding Your First Source',
    description: 'How to add an RSS feed or news source to monitor',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to sources', action: 'navigate', target: '/sources' },
      { name: 'Wait for load', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot sources page', action: 'screenshot', screenshotName: '01-sources-page.png' },
      // "Add Source" button contains a <span>Add Source</span>
      { name: 'Click add source', action: 'click', target: 'button:has-text("Add Source")' },
      { name: 'Wait for modal', action: 'wait', waitMs: 800 },
      { name: 'Screenshot add source modal', action: 'screenshot', screenshotName: '02-add-source-modal.png' },
      // URL input has specific placeholder
      { name: 'Type RSS URL', action: 'type', target: 'input[placeholder*="Paste URL"]', value: 'https://techcrunch.com/feed/' },
      { name: 'Wait', action: 'wait', waitMs: 500 },
      { name: 'Screenshot URL entered', action: 'screenshot', screenshotName: '03-url-entered.png' },
      // Click Lookup to detect source type
      { name: 'Click lookup', action: 'click', target: 'button:has-text("Lookup")' },
      { name: 'Wait for lookup', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot source detected', action: 'screenshot', screenshotName: '04-source-detected.png' },
      // Select a topic from the dropdown
      { name: 'Select topic', action: 'click', target: 'select.glass-input' },
      { name: 'Wait', action: 'wait', waitMs: 400 },
      { name: 'Screenshot topic selected', action: 'screenshot', screenshotName: '05-topic-selected.png' },
      // Submit - button text is "Add RSS Feed" for RSS sources
      { name: 'Click add', action: 'click', target: 'button:has-text("Add RSS Feed"), button:has-text("Add YouTube"), button[type="submit"]' },
      { name: 'Wait for add', action: 'wait', waitMs: 2500 },
      { name: 'Screenshot source added', action: 'screenshot', screenshotName: '06-source-added.png' },
    ],
  },

  createTopics: {
    name: 'Creating Topics',
    description: 'How to create topics to filter and organize your content',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      // Topics are managed on the Settings page
      { name: 'Navigate to settings', action: 'navigate', target: '/settings' },
      { name: 'Wait for load', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot settings page', action: 'screenshot', screenshotName: '01-settings-topics.png' },
      // Topic name input has placeholder "Topic name"
      { name: 'Type topic name', action: 'type', target: 'input[placeholder="Topic name"]', value: 'AI in Sales' },
      { name: 'Wait for auto-icon', action: 'wait', waitMs: 600 },
      { name: 'Screenshot name entered', action: 'screenshot', screenshotName: '02-topic-name.png' },
      // Click a color button (purple = 2nd in the color row)
      { name: 'Click color', action: 'evaluate', value: "document.querySelectorAll('button.rounded-full[style]')[1].click()" },
      { name: 'Wait', action: 'wait', waitMs: 400 },
      { name: 'Screenshot color selected', action: 'screenshot', screenshotName: '03-color-selected.png' },
      // Submit with "Add Topic" button
      { name: 'Click add topic', action: 'click', target: 'button:has-text("Add Topic")' },
      { name: 'Wait for save', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot topic created', action: 'screenshot', screenshotName: '04-topic-created.png' },
    ],
  },

  aiSummaries: {
    name: 'AI Deep Dive Analysis',
    description: 'How AI-powered analysis helps you quickly understand articles',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      // Content is on the main dashboard
      { name: 'Navigate to dashboard', action: 'navigate', target: '/' },
      { name: 'Wait for content load', action: 'wait', waitMs: 3000 },
      { name: 'Screenshot content feed', action: 'screenshot', screenshotName: '01-content-feed.png' },
      // Deep Dive button has title="Deep Dive Analysis" (Sparkles icon)
      { name: 'Click deep dive', action: 'click', target: 'button[title="Deep Dive Analysis"]' },
      { name: 'Wait for modal', action: 'wait', waitMs: 1000 },
      { name: 'Screenshot loading', action: 'screenshot', screenshotName: '02-deep-dive-loading.png' },
      // Wait for AI analysis to complete
      { name: 'Wait for AI analysis', action: 'wait', waitMs: 8000 },
      { name: 'Screenshot analysis result', action: 'screenshot', screenshotName: '03-deep-dive-analysis.png' },
      // Scroll down in modal to show more sections
      { name: 'Scroll modal', action: 'scroll', target: '.glass-card.max-w-2xl' },
      { name: 'Wait', action: 'wait', waitMs: 800 },
      { name: 'Screenshot analysis continued', action: 'screenshot', screenshotName: '04-deep-dive-sections.png' },
    ],
  },

  dailyDigest: {
    name: 'Daily Digest Setup',
    description: 'How to configure your daily email digest with curated content',
    baseUrl: 'https://radar.funnelists.com',
    steps: [
      { name: 'Navigate to settings', action: 'navigate', target: '/settings' },
      { name: 'Wait for load', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot settings page', action: 'screenshot', screenshotName: '01-settings-page.png' },
      // Scroll to Email Digests section
      { name: 'Scroll to digest section', action: 'scroll', target: 'text=Email Digests' },
      { name: 'Wait', action: 'wait', waitMs: 600 },
      { name: 'Screenshot digest disabled', action: 'screenshot', screenshotName: '02-digest-disabled.png' },
      // Toggle enable - click the label wrapping the sr-only checkbox
      { name: 'Toggle digest on', action: 'click', target: 'label:has(input.sr-only)' },
      { name: 'Wait for controls', action: 'wait', waitMs: 800 },
      { name: 'Screenshot digest enabled', action: 'screenshot', screenshotName: '03-digest-enabled.png' },
      // Click "Daily" frequency button
      { name: 'Click daily frequency', action: 'click', target: 'button:has-text("Daily")' },
      { name: 'Wait', action: 'wait', waitMs: 400 },
      { name: 'Screenshot frequency', action: 'screenshot', screenshotName: '04-frequency-daily.png' },
      // Set delivery time
      { name: 'Set delivery time', action: 'type', target: 'input[type="time"]', value: '07:00' },
      { name: 'Wait', action: 'wait', waitMs: 400 },
      { name: 'Screenshot time set', action: 'screenshot', screenshotName: '05-time-set.png' },
      // Save digest preferences
      { name: 'Click save', action: 'click', target: 'button:has-text("Save Digest Preferences")' },
      { name: 'Wait for save', action: 'wait', waitMs: 2000 },
      { name: 'Screenshot saved', action: 'screenshot', screenshotName: '06-digest-saved.png' },
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

    await this.page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 30000 })
    // Radar login: input#email, input#password, button with "Sign in"
    await this.page.fill('input#email', this.auth.email)
    await this.page.fill('input#password', this.auth.password)
    await this.page.click('button:has-text("Sign in")')
    // Wait for redirect away from login page
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })
    // Wait for page to stabilize
    await this.page.waitForTimeout(2000)

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

      case 'evaluate': {
        if (!step.value) throw new Error('Evaluate requires value (JS code)')
        await this.page.evaluate(step.value)
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
