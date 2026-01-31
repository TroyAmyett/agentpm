// OpenAI LLM Adapter - GPT API integration
// Maps universal message format to OpenAI's chat completions API

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

const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

// OpenAI raw response types
interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OpenAIChoice {
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: OpenAIToolCall[]
  }
  finish_reason: 'stop' | 'tool_calls' | 'length'
}

interface OpenAIRawResponse {
  choices: OpenAIChoice[]
  model: string
  usage?: { prompt_tokens: number; completion_tokens: number }
}

export class OpenAIAdapter implements LLMAdapter {
  readonly provider = 'openai' as const
  private config: LLMConfig

  constructor(config: LLMConfig) {
    this.config = config
  }

  async chat(messages: LLMMessage[], options: LLMChatOptions): Promise<LLMResponse> {
    // OpenAI uses system as an inline message
    const openaiMessages: unknown[] = []

    if (options.system) {
      openaiMessages.push({ role: 'system', content: options.system })
    }

    // Convert universal messages to OpenAI format
    for (const msg of messages) {
      if (msg.role === 'system') continue // Already handled
      openaiMessages.push(this.toOpenAIMessage(msg))
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: options.maxTokens || this.config.maxTokens || 8192,
      messages: openaiMessages,
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = this.formatTools(options.tools)
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...this.config.headers,
    }

    const response = await fetchWithRetry(
      this.config.baseUrl || DEFAULT_OPENAI_URL,
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
        `OpenAI API error: ${response.status}`
      )
    }

    const raw = await response.json() as OpenAIRawResponse
    return this.parseResponse(raw)
  }

  private formatTools(tools: LLMToolDefinition[]): unknown[] {
    // OpenAI wraps tools in a 'function' wrapper
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))
  }

  private parseResponse(raw: OpenAIRawResponse): LLMResponse {
    const choice = raw.choices?.[0]
    if (!choice) {
      return {
        content: [{ type: 'text', text: '' }],
        stopReason: 'end_turn',
        model: raw.model,
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    }

    const content: LLMContentBlock[] = []
    const msg = choice.message

    // Add text content if present
    if (msg.content) {
      content.push({ type: 'text', text: msg.content })
    }

    // Add tool calls if present
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        let toolInput: Record<string, unknown> = {}
        try {
          toolInput = JSON.parse(tc.function.arguments)
        } catch {
          toolInput = { _raw: tc.function.arguments }
        }
        content.push({
          type: 'tool_use',
          toolCallId: tc.id,
          toolName: tc.function.name,
          toolInput,
        })
      }
    }

    // Map finish_reason to our universal stop reasons
    let stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
    if (choice.finish_reason === 'tool_calls') {
      stopReason = 'tool_use'
    } else if (choice.finish_reason === 'length') {
      stopReason = 'max_tokens'
    } else {
      stopReason = 'end_turn'
    }

    return {
      content,
      stopReason,
      model: raw.model,
      usage: {
        inputTokens: raw.usage?.prompt_tokens || 0,
        outputTokens: raw.usage?.completion_tokens || 0,
      },
    }
  }

  /**
   * Convert a universal LLMMessage to OpenAI format
   */
  private toOpenAIMessage(msg: LLMMessage): unknown {
    // Tool result messages use role: 'tool' with tool_call_id
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: msg.content,
      }
    }

    // Handle content blocks (tool results in array form)
    if (Array.isArray(msg.content)) {
      // Check if these are tool_result blocks
      const toolResults = msg.content.filter(b => b.type === 'tool_result')
      if (toolResults.length > 0) {
        // OpenAI needs individual messages per tool result
        // For simplicity, return an array-wrapped single response
        // The caller handles this by flattening
        return toolResults.map(tr => ({
          role: 'tool',
          tool_call_id: tr.toolCallId,
          content: tr.text || '',
        }))
      }

      // Check if these are tool_use blocks (assistant message with tool calls)
      const toolUses = msg.content.filter(b => b.type === 'tool_use')
      const textBlocks = msg.content.filter(b => b.type === 'text')
      if (toolUses.length > 0) {
        return {
          role: 'assistant',
          content: textBlocks.map(b => b.text).join('') || null,
          tool_calls: toolUses.map(tu => ({
            id: tu.toolCallId,
            type: 'function',
            function: {
              name: tu.toolName,
              arguments: JSON.stringify(tu.toolInput || {}),
            },
          })),
        }
      }

      // Plain text blocks
      return {
        role: msg.role,
        content: msg.content.map(b => b.text || '').join(''),
      }
    }

    // Simple string message
    return {
      role: msg.role,
      content: msg.content,
    }
  }
}
