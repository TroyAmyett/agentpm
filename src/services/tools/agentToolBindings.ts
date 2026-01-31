// Agent-Tool Bindings - Maps agent types to their allowed tools
// Each agent type gets only the tools relevant to its role

import type { AgentPersona } from '@/types/agentpm'

/**
 * Default tool sets per agent type
 * If an agent has explicit `tools` on its persona, those take precedence
 */
export const DEFAULT_AGENT_TOOLS: Record<string, string[]> = {
  'content-writer': [
    'web_search',
    'fetch_url',
    'publish_blog_post',
    'generate_image',
    'create_landing_page',
  ],
  'image-generator': [
    'generate_image',
  ],
  'researcher': [
    'web_search',
    'fetch_url',
    'dns_lookup',
    'check_domain_availability',
  ],
  'qa-tester': [
    'web_search',
    'fetch_url',
  ],
  'orchestrator': [],  // Orchestrator coordinates, doesn't execute tools
  'forge': [
    'web_search',
    'fetch_url',
  ],
}

/**
 * Get the list of tool names an agent is allowed to use
 * Returns empty array if the agent has no tool bindings (meaning: allow all tools for backward compat)
 */
export function getToolsForAgent(agent: AgentPersona): string[] {
  // If agent has explicit tools defined, use those
  if (agent.tools && agent.tools.length > 0) {
    return agent.tools
  }

  // Fall back to defaults for the agent type
  return DEFAULT_AGENT_TOOLS[agent.agentType] || []
}
