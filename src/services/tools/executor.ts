// Tool Executor - Executes tool calls from Claude API
// Dispatches to appropriate tool implementation and formats results

import type { ToolResult, ToolUseRequest, ToolResultMessage } from './types'
import { getToolByName } from './registry'
import { checkDomainAvailability } from './implementations/domainChecker'
import { fetchUrl } from './implementations/urlFetcher'
import { dnsLookup } from './implementations/dnsLookup'
import { createLandingPage, type LandingPageContent } from './implementations/landingPageCreator'
import {
  createVideoJobTool,
  listVideoAvatarsTool,
  listVideoVoicesTool,
  submitVideoJobTool,
  checkVideoStatusTool,
  listVideoJobsTool,
  recordScreenFlowTool,
} from './implementations/videoProduction'
import { generateImage } from './implementations/imageGenerator'
import { publishBlogPost } from './implementations/blogPublisher'
import { createSkillTool, sendMessageTool, readMessagesTool } from './implementations/agentCollaboration'
import { executeOpenClawTool } from './implementations/openclawTools'
import { webSearch } from './implementations/webSearch'
import { fetchGoogleDocTool } from './implementations/googleDriveTools'
import type { VideoType, VideoJobStatus, VideoScript, ProductInfo } from '@/services/video/videoService'

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
        const query = parameters.query as string
        const maxResults = (parameters.max_results as number) || 5
        return await webSearch(query, maxResults)
      }

      case 'create_landing_page': {
        const pageType = parameters.pageType as 'lead-capture' | 'waitlist' | 'product-purchase' | 'upsell'
        const slug = parameters.slug as string
        const content = parameters.content as LandingPageContent
        const funnelId = parameters.funnelId as string | undefined
        const publish = parameters.publish as boolean | undefined
        return await createLandingPage({ pageType, slug, content, funnelId, publish })
      }

      // ============================================
      // BLOG PUBLISHING
      // ============================================

      case 'publish_blog_post': {
        return await publishBlogPost({
          title: parameters.title as string,
          slug: parameters.slug as string,
          content: parameters.content as string,
          excerpt: parameters.excerpt as string,
          category: parameters.category as string,
          pageType: parameters.pageType as string | undefined,
          contentFormat: parameters.contentFormat as string | undefined,
          seoTitle: parameters.seoTitle as string | undefined,
          metaDescription: parameters.metaDescription as string | undefined,
          heroImageUrl: parameters.heroImageUrl as string | undefined,
          tags: parameters.tags as string[] | undefined,
        })
      }

      // ============================================
      // IMAGE GENERATION
      // ============================================

      case 'generate_image': {
        const prompt = parameters.prompt as string
        const size = parameters.size as string | undefined
        const style = parameters.style as string | undefined
        return await generateImage(prompt, size, style, _accountId)
      }

      // ============================================
      // VIDEO PRODUCTION TOOLS
      // ============================================

      case 'create_video_job': {
        // Note: accountId and userId need to be passed from executor context
        // For now, use placeholders - the actual implementation will get these from auth context
        return await createVideoJobTool({
          accountId: _accountId,
          userId: parameters.userId as string || 'system',
          title: parameters.title as string,
          description: parameters.description as string | undefined,
          videoType: parameters.videoType as VideoType,
          script: parameters.script as VideoScript | undefined,
          productInfo: parameters.productInfo as ProductInfo | undefined,
        })
      }

      case 'list_video_avatars': {
        return await listVideoAvatarsTool({
          apiKey: parameters.apiKey as string | undefined,
          filter: parameters.filter as string | undefined,
        })
      }

      case 'list_video_voices': {
        return await listVideoVoicesTool({
          apiKey: parameters.apiKey as string | undefined,
          language: parameters.language as string | undefined,
          gender: parameters.gender as string | undefined,
        })
      }

      case 'submit_video_job': {
        return await submitVideoJobTool({
          jobId: parameters.jobId as string,
          avatarId: parameters.avatarId as string,
          voiceId: parameters.voiceId as string,
          apiKey: parameters.apiKey as string | undefined,
          testMode: parameters.testMode as boolean | undefined,
        })
      }

      case 'check_video_status': {
        return await checkVideoStatusTool({
          jobId: parameters.jobId as string,
          apiKey: parameters.apiKey as string | undefined,
        })
      }

      case 'list_video_jobs': {
        return await listVideoJobsTool({
          accountId: _accountId,
          status: parameters.status as VideoJobStatus | undefined,
          limit: parameters.limit as number | undefined,
        })
      }

      // ============================================
      // AGENT COLLABORATION TOOLS
      // ============================================

      case 'create_skill': {
        return await createSkillTool({
          name: parameters.name as string,
          description: parameters.description as string | undefined,
          content: parameters.content as string,
          category: parameters.category as string,
          tags: parameters.tags as string[] | undefined,
          accountId: _accountId,
          agentId: parameters._agentId as string | undefined,
        })
      }

      case 'send_message': {
        return await sendMessageTool({
          toId: parameters.toId as string,
          toType: parameters.toType as 'agent' | 'user',
          messageType: parameters.messageType as string,
          subject: parameters.subject as string | undefined,
          content: parameters.content as string,
          sessionId: parameters.sessionId as string | undefined,
          inReplyTo: parameters.inReplyTo as string | undefined,
          accountId: _accountId,
          fromId: parameters._agentId as string || 'unknown',
          fromType: 'agent',
        })
      }

      case 'read_messages': {
        return await readMessagesTool({
          unreadOnly: parameters.unreadOnly as boolean | undefined,
          limit: parameters.limit as number | undefined,
          sessionId: parameters.sessionId as string | undefined,
          messageType: parameters.messageType as string | undefined,
          accountId: _accountId,
          recipientId: parameters._agentId as string || 'unknown',
          recipientType: 'agent',
        })
      }

      // ============================================
      // OPENCLAW INTEGRATION
      // ============================================

      case 'execute_openclaw': {
        return await executeOpenClawTool({
          agent_name: parameters.agent_name as string | undefined,
          task: parameters.task as string,
          context: parameters.context as Record<string, unknown> | undefined,
          callback_task_id: parameters.callback_task_id as string | undefined,
          accountId: _accountId,
        })
      }

      // ============================================
      // GOOGLE DRIVE SSOT
      // ============================================

      case 'fetch_google_doc': {
        return await fetchGoogleDocTool({
          file_id: parameters.file_id as string | undefined,
          path: parameters.path as string | undefined,
          query: parameters.query as string | undefined,
          list_folder: parameters.list_folder as string | undefined,
        })
      }

      case 'record_screen_flow': {
        return await recordScreenFlowTool({
          flowName: parameters.flowName as string | undefined,
          customSteps: parameters.customSteps as Array<{
            name: string
            action: string
            target?: string
            value?: string
            waitMs?: number
          }> | undefined,
          baseUrl: parameters.baseUrl as string | undefined,
          accountId: _accountId,
        })
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
