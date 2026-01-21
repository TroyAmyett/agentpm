// Claude Code CLI Runner
// Executes Claude Code CLI commands for PRD implementation

import type { ForgeTaskInput, ForgeCommit, ForgeFileChange, ForgeTestResults } from '@/types/agentpm'

// NOTE: This service is designed to run in an Electron or Node.js environment
// where we can spawn child processes. In a browser-only environment,
// this would need to communicate with a backend service.

export interface ClaudeCodeConfig {
  // Path to the claude-code CLI binary (if not in PATH)
  cliPath?: string
  // API key for Claude (usually from environment)
  apiKey?: string
  // Model to use (defaults to claude-sonnet-4-20250514)
  model?: string
  // Max tokens for responses
  maxTokens?: number
  // Whether to run in verbose mode
  verbose?: boolean
}

export interface ClaudeCodeResult {
  success: boolean
  output: string
  commits: ForgeCommit[]
  filesChanged: ForgeFileChange[]
  testResults?: ForgeTestResults
  tokensUsed: number
  cost: number // in cents
  error?: string
}

/**
 * Build the Claude Code prompt from a PRD
 */
export function buildClaudeCodePrompt(input: ForgeTaskInput): string {
  const parts: string[] = []

  // Main instruction
  parts.push('You are implementing a PRD (Product Requirements Document). Your task is to:')
  parts.push('')
  parts.push('1. Read and understand the PRD below')
  parts.push('2. Analyze the existing codebase')
  parts.push('3. Implement the required changes')
  parts.push('4. Create meaningful commits with clear messages')
  parts.push('5. Run tests if requested')
  parts.push('')

  // PRD content
  parts.push('## PRD')
  parts.push('')
  parts.push(input.prdContent)
  parts.push('')

  // Repository context
  parts.push('## Repository')
  parts.push('')
  parts.push(`- Path: ${input.repositoryPath}`)
  parts.push(`- Base branch: ${input.baseBranch}`)
  if (input.targetBranch) {
    parts.push(`- Target branch: ${input.targetBranch}`)
  }
  parts.push('')

  // Additional context
  if (input.codebaseContext) {
    parts.push('## Codebase Context')
    parts.push('')
    parts.push(input.codebaseContext)
    parts.push('')
  }

  // Relevant files
  if (input.relevantFiles && input.relevantFiles.length > 0) {
    parts.push('## Focus Files')
    parts.push('')
    parts.push('Pay special attention to these files:')
    input.relevantFiles.forEach((file) => parts.push(`- ${file}`))
    parts.push('')
  }

  // Execution settings
  parts.push('## Execution Settings')
  parts.push('')
  parts.push(`- Auto commit: ${input.autoCommit ? 'Yes' : 'No'}`)
  parts.push(`- Run tests: ${input.runTests ? 'Yes' : 'No'}`)
  if (input.testCommand) {
    parts.push(`- Test command: ${input.testCommand}`)
  }
  parts.push('')

  // Guidelines
  parts.push('## Guidelines')
  parts.push('')
  parts.push('- Make atomic commits with clear, descriptive messages')
  parts.push('- Follow existing code style and patterns in the codebase')
  parts.push('- Add appropriate error handling')
  parts.push('- Write tests for new functionality if the project has a test suite')
  parts.push('- Do not make changes outside the scope of the PRD')
  parts.push('')

  return parts.join('\n')
}

/**
 * Build the CLI command to execute
 */
export function buildClaudeCodeCommand(
  _prompt: string,
  workingDir: string,
  config: ClaudeCodeConfig = {}
): string[] {
  const args: string[] = []

  // Base command
  const cli = config.cliPath || 'claude'
  args.push(cli)

  // Working directory
  args.push('--cwd', workingDir)

  // Model selection
  if (config.model) {
    args.push('--model', config.model)
  }

  // Max tokens
  if (config.maxTokens) {
    args.push('--max-tokens', config.maxTokens.toString())
  }

  // Verbose mode
  if (config.verbose) {
    args.push('--verbose')
  }

  // The prompt will be piped to stdin
  args.push('--print') // Print output to stdout

  return args
}

/**
 * Parse Claude Code output to extract commits and file changes
 */
export function parseClaudeCodeOutput(output: string): {
  commits: ForgeCommit[]
  filesChanged: ForgeFileChange[]
  testResults?: ForgeTestResults
} {
  const commits: ForgeCommit[] = []
  const filesChanged: ForgeFileChange[] = []
  let testResults: ForgeTestResults | undefined

  // Parse commit information from output
  // Look for patterns like "Created commit: abc1234 - message"
  const commitRegex = /(?:Created commit|Committed|commit)\s*:?\s*([a-f0-9]{7,40})\s*[-:]\s*(.+)/gi
  let match: RegExpExecArray | null

  while ((match = commitRegex.exec(output)) !== null) {
    commits.push({
      sha: match[1].slice(0, 7),
      message: match[2].trim(),
      filesChanged: [], // Would need more parsing to get specific files per commit
      timestamp: new Date().toISOString(),
    })
  }

  // Parse file changes
  // Look for patterns like "Modified: src/file.ts" or "Created: src/new.ts"
  const fileChangeRegex = /(Created|Modified|Deleted|Added|Renamed)\s*:?\s*([^\n]+)/gi

  while ((match = fileChangeRegex.exec(output)) !== null) {
    const changeTypeRaw = match[1].toLowerCase()
    const mappedType: 'added' | 'modified' | 'deleted' | 'renamed' =
      changeTypeRaw === 'created' ? 'added' :
      changeTypeRaw === 'added' ? 'added' :
      changeTypeRaw === 'deleted' ? 'deleted' :
      changeTypeRaw === 'renamed' ? 'renamed' :
      'modified'

    filesChanged.push({
      path: match[2].trim(),
      changeType: mappedType,
      additions: 0, // Would need git diff to get actual numbers
      deletions: 0,
    })
  }

  // Parse test results
  // Look for patterns like "Tests: 42 passed, 0 failed"
  const testRegex = /Tests?:?\s*(\d+)\s*(?:passed|pass)[,\s]+(\d+)\s*(?:failed|fail)/i
  const testMatch = testRegex.exec(output)

  if (testMatch) {
    testResults = {
      passed: parseInt(testMatch[2]) === 0,
      totalTests: parseInt(testMatch[1]) + parseInt(testMatch[2]),
      passedTests: parseInt(testMatch[1]),
      failedTests: parseInt(testMatch[2]),
      skippedTests: 0,
    }
  }

  return { commits, filesChanged, testResults }
}

/**
 * Estimate token count from text
 * Rough estimate: ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Calculate cost in cents based on tokens
 * Claude Sonnet pricing (as of 2025): ~$3 per 1M input tokens, ~$15 per 1M output tokens
 */
export function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 300 // $3 = 300 cents
  const outputCost = (outputTokens / 1_000_000) * 1500 // $15 = 1500 cents
  return Math.ceil(inputCost + outputCost)
}

/**
 * Main function to run Claude Code
 * This is a mock implementation for browser environments.
 * In a real implementation, this would either:
 * 1. Spawn a child process (Node.js/Electron)
 * 2. Call a backend API that runs Claude Code
 * 3. Use the Claude Code SDK directly
 */
export async function runClaudeCode(
  input: ForgeTaskInput,
  _config: ClaudeCodeConfig = {},
  onProgress?: (message: string) => void
): Promise<ClaudeCodeResult> {
  const prompt = buildClaudeCodePrompt(input)
  const inputTokens = estimateTokens(prompt)

  onProgress?.('Building Claude Code prompt...')

  // In a browser environment, we would call a backend API
  // For now, we simulate the execution
  onProgress?.('Starting Claude Code execution...')

  // Simulate execution time
  await new Promise((resolve) => setTimeout(resolve, 2000))

  onProgress?.('Analyzing codebase...')
  await new Promise((resolve) => setTimeout(resolve, 1500))

  onProgress?.('Implementing changes...')
  await new Promise((resolve) => setTimeout(resolve, 3000))

  // Generate mock results
  const mockOutput = `
Analyzed PRD and codebase structure.
Created branch: forge/feature-${Date.now().toString(36)}
Modified: src/components/NewFeature.tsx
Created: src/utils/newHelper.ts
Modified: src/types/index.ts
Created commit: abc1234 - feat: implement new feature from PRD
Tests: 15 passed, 0 failed
Ready for review.
`

  const { commits, filesChanged, testResults } = parseClaudeCodeOutput(mockOutput)

  // Add some realistic mock data if parsing didn't find much
  if (commits.length === 0) {
    commits.push({
      sha: crypto.randomUUID().slice(0, 7),
      message: 'feat: implement PRD requirements',
      filesChanged: filesChanged.map((f) => f.path),
      timestamp: new Date().toISOString(),
    })
  }

  if (filesChanged.length === 0) {
    filesChanged.push(
      { path: 'src/components/NewFeature.tsx', changeType: 'added', additions: 120, deletions: 0 },
      { path: 'src/utils/helpers.ts', changeType: 'modified', additions: 25, deletions: 5 },
      { path: 'src/types/index.ts', changeType: 'modified', additions: 15, deletions: 0 }
    )
  }

  const outputTokens = estimateTokens(mockOutput) + estimateTokens(JSON.stringify(filesChanged))
  const cost = calculateCost(inputTokens, outputTokens)

  onProgress?.('Execution complete!')

  return {
    success: true,
    output: mockOutput,
    commits,
    filesChanged,
    testResults: testResults || (input.runTests ? {
      passed: true,
      totalTests: 15,
      passedTests: 15,
      failedTests: 0,
      skippedTests: 0,
    } : undefined),
    tokensUsed: inputTokens + outputTokens,
    cost,
  }
}

/**
 * Check if Claude Code CLI is available
 * Returns version string if available, null otherwise
 */
export async function checkClaudeCodeAvailable(): Promise<string | null> {
  // In a browser environment, we would call a backend API
  // For now, return a mock version
  return '1.0.0'
}

// Types are already exported above via `export interface`
