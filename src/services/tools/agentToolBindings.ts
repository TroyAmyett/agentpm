// Agent-Tool Bindings - Maps agent types to their allowed tools
// Each agent type gets only the tools relevant to its role

import type { AgentPersona } from '@/types/agentpm'

/**
 * Default tool sets per agent type
 * If an agent has explicit `tools` on its persona, those take precedence
 */
// Collaboration tools available to all agent types
const COLLAB_TOOLS = ['send_message', 'read_messages']

export const DEFAULT_AGENT_TOOLS: Record<string, string[]> = {
  'content-writer': [
    'web_search',
    'fetch_url',
    'fetch_google_doc',
    'publish_blog_post',
    'generate_image',
    'create_landing_page',
    'create_skill',
    'execute_openclaw',
    ...COLLAB_TOOLS,
  ],
  'image-generator': [
    'generate_image',
    ...COLLAB_TOOLS,
  ],
  'researcher': [
    'web_search',
    'fetch_url',
    'fetch_google_doc',
    'dns_lookup',
    'check_domain_availability',
    'create_skill',
    'execute_openclaw',
    ...COLLAB_TOOLS,
  ],
  'qa-tester': [
    'web_search',
    'fetch_url',
    'fetch_google_doc',
    ...COLLAB_TOOLS,
  ],
  'orchestrator': [
    // Orchestration tools
    'create_task',
    'list_tasks',
    'get_task_result',
    'assign_task',
    'update_task_status',
    'preview_plan',
    'cancel_tree',
    // Integration tools
    'fetch_google_doc',
    'create_skill',
    'execute_openclaw',
    ...COLLAB_TOOLS,
  ],
  'forge': [
    'web_search',
    'fetch_url',
    'fetch_google_doc',
    'create_skill',
    'execute_openclaw',
    ...COLLAB_TOOLS,
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
