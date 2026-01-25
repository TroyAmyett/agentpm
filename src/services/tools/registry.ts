// Tool Registry - Defines and manages available tools for agents
// Built-in tools are available to all accounts, custom tools can be added per-account

import type { Tool, ToolDefinition } from './types'

/**
 * Built-in tool definitions
 * These are tools that ship with the platform
 */
export const BUILT_IN_TOOLS: Tool[] = [
  {
    id: 'domain-availability',
    name: 'check_domain_availability',
    displayName: 'Domain Availability Checker',
    description: 'Check if domain names are available for registration using WHOIS lookup',
    category: 'validation',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'check_domain_availability',
      description: 'Check if one or more domain names are available for registration. Returns availability status and registration info for each domain.',
      input_schema: {
        type: 'object',
        properties: {
          domains: {
            type: 'array',
            description: 'List of domain names to check (e.g., ["example.com", "mysite.io"])',
            items: {
              type: 'string',
              description: 'A domain name to check'
            }
          }
        },
        required: ['domains']
      }
    }
  },
  {
    id: 'web-search',
    name: 'web_search',
    displayName: 'Web Search',
    description: 'Search the web for current information',
    category: 'research',
    isBuiltIn: true,
    isEnabled: true,
    requiresApiKey: true,
    apiKeyName: 'TAVILY_API_KEY',
    definition: {
      name: 'web_search',
      description: 'Search the web for current, up-to-date information. Use this when you need recent data, news, or information that may have changed since your training.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query'
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
            default: 5
          }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'url-fetch',
    name: 'fetch_url',
    displayName: 'URL Fetcher',
    description: 'Fetch and extract content from a URL',
    category: 'research',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'fetch_url',
      description: 'Fetch content from a URL and extract the main text. Useful for reading web pages, documentation, or articles.',
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch'
          },
          extract_type: {
            type: 'string',
            description: 'What to extract: "text" (main content), "html" (raw HTML), or "metadata" (title, description, etc.)',
            enum: ['text', 'html', 'metadata'],
            default: 'text'
          }
        },
        required: ['url']
      }
    }
  },
  {
    id: 'dns-lookup',
    name: 'dns_lookup',
    displayName: 'DNS Lookup',
    description: 'Look up DNS records for a domain',
    category: 'validation',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'dns_lookup',
      description: 'Look up DNS records for a domain. Useful for verifying domain configuration or checking if a domain is in use.',
      input_schema: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            description: 'The domain to look up'
          },
          record_type: {
            type: 'string',
            description: 'Type of DNS record to look up',
            enum: ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'ANY'],
            default: 'A'
          }
        },
        required: ['domain']
      }
    }
  }
]

/**
 * Get all available tools for an account
 * @param accountId - The account to get tools for
 * @param enabledOnly - Only return enabled tools
 */
export function getAvailableTools(_accountId: string, enabledOnly = true): Tool[] {
  // For now, return built-in tools
  // TODO: Merge with account-specific custom tools from database using _accountId
  const tools = [...BUILT_IN_TOOLS]

  if (enabledOnly) {
    return tools.filter(t => t.isEnabled)
  }

  return tools
}

/**
 * Get tool definitions for Claude API
 * @param tools - Tools to convert to definitions
 */
export function getToolDefinitions(tools: Tool[]): ToolDefinition[] {
  return tools.map(t => t.definition)
}

/**
 * Get a specific tool by name
 * @param name - The tool name (used in Claude API)
 */
export function getToolByName(name: string): Tool | undefined {
  return BUILT_IN_TOOLS.find(t => t.name === name)
}

/**
 * Get a specific tool by ID
 * @param id - The tool ID
 */
export function getToolById(id: string): Tool | undefined {
  return BUILT_IN_TOOLS.find(t => t.id === id)
}

/**
 * Get tools by category
 * @param category - The category to filter by
 */
export function getToolsByCategory(category: Tool['category']): Tool[] {
  return BUILT_IN_TOOLS.filter(t => t.category === category)
}
