// Tool Executor - Executes tool calls from Claude API
// Dispatches to appropriate tool implementation and formats results

import type { ToolResult, ToolUseRequest, ToolResultMessage } from './types'
import { getToolByName } from './registry'
import { checkDomainAvailability } from './implementations/domainChecker'
import { fetchUrl } from './implementations/urlFetcher'
import { dnsLookup } from './implementations/dnsLookup'

/**
 * Execute a tool by name with given parameters
 */
export async function executeTool(
  toolName: string,
  parameters: Record<string, unknown>,
  _accountId: string // Reserved for future account-level tool config
): Promise<ToolResult> {
  const tool = getToolByName(toolName)

  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
    }
  }

  if (!tool.isEnabled) {
    return {
      success: false,
      error: `Tool ${toolName} is disabled`,
    }
  }

  // TODO: Check account-level tool configuration
  // TODO: Check if API key is configured for tools that require it

  try {
    switch (toolName) {
      case 'check_domain_availability': {
        const domains = parameters.domains as string[]
        return await checkDomainAvailability(domains)
      }

      case 'fetch_url': {
        const url = parameters.url as string
        const extractType = (parameters.extract_type as 'text' | 'html' | 'metadata') || 'text'
        return await fetchUrl(url, extractType)
      }

      case 'dns_lookup': {
        const domain = parameters.domain as string
        const recordType = (parameters.record_type as string) || 'A'
        return await dnsLookup(domain, recordType)
      }

      case 'web_search': {
        // TODO: Implement web search with Tavily or similar
        return {
          success: false,
          error: 'Web search requires API key configuration',
        }
      }

      default:
        return {
          success: false,
          error: `Tool ${toolName} is not implemented`,
        }
    }
  } catch (error) {
    return {
      success: false,
      error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Process a tool use request from Claude API
 * Returns a tool result message to send back to Claude
 */
export async function processToolUse(
  toolUse: ToolUseRequest,
  accountId: string
): Promise<ToolResultMessage> {
  console.log(`[Tool] Executing ${toolUse.name} with params:`, toolUse.input)

  const result = await executeTool(toolUse.name, toolUse.input, accountId)

  console.log(`[Tool] ${toolUse.name} result:`, result.success ? 'success' : result.error)

  // Format the result for Claude
  let content: string
  if (result.success && result.data) {
    // Format based on data type
    if (typeof result.data === 'string') {
      content = result.data
    } else if (typeof result.data === 'object' && 'formatted' in result.data) {
      // Use pre-formatted output if available
      content = (result.data as { formatted: string }).formatted
    } else {
      // Format as JSON for complex data
      content = JSON.stringify(result.data, null, 2)
    }
  } else {
    content = result.error || 'Tool execution failed'
  }

  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content,
    is_error: !result.success,
  }
}

/**
 * Process multiple tool uses in parallel
 */
export async function processToolUses(
  toolUses: ToolUseRequest[],
  accountId: string
): Promise<ToolResultMessage[]> {
  return Promise.all(
    toolUses.map(toolUse => processToolUse(toolUse, accountId))
  )
}
