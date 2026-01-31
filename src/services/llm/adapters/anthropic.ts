// Anthropic LLM Adapter - Claude API integration
// Extracts all Anthropic-specific fetch/format logic into a single place

import type {
  LLMAdapter,
  LLMMessage,
  LLMContentBlock,
  LLMToolDefinition,
  LLMResponse,
  LLMConfig,
  LLMChatOptions,
} from '../types'
import { fetchWithRetry } from '../../agents/apiRetry'

const DEFAULT_ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Anthropic raw response types
interface AnthropicContentBlock {
  type: 'text' | 'tool_use'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

interface AnthropicRawResponse {
  content: AnthropicContentBlock[]
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens'
  model: string
  usage?: { input_tokens: number; output_tokens: number }
}

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = 'anthropic' as const
  private config: LLMConfig

  constructor(config: LLMConfig) {
    this.config = config
  }

  async chat(messages: LLMMessage[], options: LLMChatOptions): Promise<LLMResponse> {
    // Separate system message (Anthropic uses a separate 'system' field)
    const systemPrompt = options.system || ''

    // Convert universal messages to Anthropic format
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => this.toAnthropicMessage(m))

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: options.maxTokens || this.config.maxTokens || 8192,
      system: systemPrompt,
      messages: anthropicMessages,
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = this.formatTools(options.tools)
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      ...this.config.headers,
    }

    // Browser-only header for direct Anthropic access
    if (typeof window !== 'undefined') {
      headers['anthropic-dangerous-direct-browser-access'] = 'true'
    }

    const response = await fetchWithRetry(
      this.config.baseUrl || DEFAULT_ANTHROPIC_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        (error as { error?: { message?: string } }).error?.message ||
        `Anthropic API error: ${response.status}`
      )
    }

    const raw = await response.json() as AnthropicRawResponse
    return this.parseResponse(raw)
  }

  private formatTools(tools: LLMToolDefinition[]): unknown[] {
    // Anthropic uses 'input_schema' instead of 'parameters'
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))
  }

  private parseResponse(raw: AnthropicRawResponse): LLMResponse {
    const content: LLMContentBlock[] = (raw.content || []).map(block => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text || '' }
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          toolCallId: block.id,
          toolName: block.name,
          toolInput: block.input,
        }
      }
      return { type: 'text' as const, text: '' }
    })

    return {
      content,
      stopReason: raw.stop_reason === 'end_turn' ? 'end_turn'
                : raw.stop_reason === 'tool_use' ? 'tool_use'
                : 'max_tokens',
      model: raw.model,
      usage: {
        inputTokens: raw.usage?.input_tokens || 0,
        outputTokens: raw.usage?.output_tokens || 0,
      },
    }
  }

  /**
   * Convert a universal LLMMessage to Anthropic's message format
   */
  private toAnthropicMessage(msg: LLMMessage): { role: string; content: unknown } {
    // String content - simple message
    if (typeof msg.content === 'string') {
      return {
        role: msg.role === 'tool' ? 'user' : msg.role,
        content: msg.content,
      }
    }

    // Content blocks array - convert each block
    const blocks = msg.content.map(block => {
      if (block.type === 'tool_result') {
        return {
          type: 'tool_result',
          tool_use_id: block.toolCallId,
          content: block.text || '',
          is_error: block.isError || false,
        }
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: block.toolCallId,
          name: block.toolName,
          input: block.toolInput,
        }
      }
      return { type: 'text', text: block.text || '' }
    })

    return {
      role: msg.role === 'tool' ? 'user' : msg.role,
      content: blocks,
    }
  }
}
