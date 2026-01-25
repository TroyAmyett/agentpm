// Tool Types - Defines the structure for agent tools
// Tools are real-time capabilities that agents can invoke during task execution

/**
 * Tool parameter schema following JSON Schema format
 * Used by Claude's tool_use feature
 */
export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  enum?: string[]
  items?: ToolParameterProperty
  default?: unknown
}

export interface ToolParameters {
  type: 'object'
  properties: Record<string, ToolParameterProperty>
  required?: string[]
}

/**
 * Tool definition for Claude API
 */
export interface ToolDefinition {
  name: string
  description: string
  input_schema: ToolParameters
}

/**
 * Tool metadata and configuration
 */
export interface Tool {
  id: string
  name: string
  displayName: string
  description: string
  category: 'research' | 'validation' | 'integration' | 'utility'
  isBuiltIn: boolean
  isEnabled: boolean
  requiresApiKey?: boolean
  apiKeyName?: string
  definition: ToolDefinition
}

/**
 * Tool execution input
 */
export interface ToolInput {
  toolName: string
  parameters: Record<string, unknown>
  accountId: string
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  metadata?: {
    executionTimeMs: number
    source?: string
  }
}

/**
 * Account-level tool configuration
 */
export interface AccountToolConfig {
  accountId: string
  toolId: string
  isEnabled: boolean
  apiKey?: string // Encrypted
  customConfig?: Record<string, unknown>
}

/**
 * Tool use request from Claude API
 */
export interface ToolUseRequest {
  id: string
  type: 'tool_use'
  name: string
  input: Record<string, unknown>
}

/**
 * Tool result for Claude API
 */
export interface ToolResultMessage {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}
