// LLM Provider Abstraction - Universal types for multi-provider support
// Normalizes message format, tool calls, and responses across providers

export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'groq' | 'mistral' | 'together'

export interface LLMConfig {
  provider: LLMProvider
  model: string
  apiKey: string
  baseUrl?: string              // Override for proxies / Azure
  maxTokens?: number            // Default per-request
  temperature?: number
  headers?: Record<string, string>  // Extra headers
}

// Universal message format (superset of Anthropic + OpenAI)
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | LLMContentBlock[]
  toolCallId?: string           // For tool result messages
}

export interface LLMContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  toolCallId?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  isError?: boolean
}

// Universal tool definition (maps to both Anthropic and OpenAI formats)
export interface LLMToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// Universal response
export interface LLMResponse {
  content: LLMContentBlock[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

// Chat options
export interface LLMChatOptions {
  system?: string
  tools?: LLMToolDefinition[]
  maxTokens?: number
  temperature?: number
}

// The adapter interface every provider must implement
export interface LLMAdapter {
  readonly provider: LLMProvider

  chat(messages: LLMMessage[], options: LLMChatOptions): Promise<LLMResponse>
}
