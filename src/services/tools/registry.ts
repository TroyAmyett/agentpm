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
  },
  {
    id: 'create-landing-page',
    name: 'create_landing_page',
    displayName: 'Create Landing Page',
    description: 'Create a landing page in funnelists-cms for marketing campaigns',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'create_landing_page',
      description: 'Create a landing page in funnelists-cms. Supports lead capture forms, waitlist signups, product purchase pages with Stripe, and upsell pages. Pages can be linked into funnels.',
      input_schema: {
        type: 'object',
        properties: {
          pageType: {
            type: 'string',
            description: 'Type of landing page to create',
            enum: ['lead-capture', 'waitlist', 'product-purchase', 'upsell']
          },
          slug: {
            type: 'string',
            description: 'URL slug for the page (e.g., "agentforce-webinar")'
          },
          content: {
            type: 'object',
            description: 'Landing page content including hero, sections, form/pricing, and funnel config'
          },
          funnelId: {
            type: 'string',
            description: 'Optional funnel ID to link this page to a sales funnel sequence'
          },
          publish: {
            type: 'boolean',
            description: 'If true, immediately publish to CMS via GitHub (triggers Vercel build)'
          }
        },
        required: ['pageType', 'slug', 'content']
      }
    }
  },
  // ============================================
  // BLOG PUBLISHING
  // ============================================
  {
    id: 'publish-blog-post',
    name: 'publish_blog_post',
    displayName: 'Publish Blog Post',
    description: 'Publish a blog post to the funnelists.com website via GitHub/Vercel',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    requiresApiKey: true,
    apiKeyName: 'GITHUB_TOKEN',
    definition: {
      name: 'publish_blog_post',
      description: 'Publish a blog post to funnelists.com. Creates a markdown file with frontmatter and commits it to the CMS repository. If a hero image URL is provided, the image is downloaded and committed alongside the post. Vercel automatically rebuilds the site after the commit.',
      input_schema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Blog post title',
          },
          slug: {
            type: 'string',
            description: 'URL slug in kebab-case (e.g., "how-to-use-agentforce")',
          },
          content: {
            type: 'string',
            description: 'Blog post body in Markdown format. Use ## for headings, bullet points for lists, **bold** for emphasis. Do NOT include the title as an H1 heading - the title is rendered separately from frontmatter.',
          },
          excerpt: {
            type: 'string',
            description: 'Brief summary for preview cards, 150-160 characters',
          },
          category: {
            type: 'string',
            description: 'Blog category (e.g., "AI", "Salesforce", "Product Updates", "Guides")',
          },
          seoTitle: {
            type: 'string',
            description: 'SEO-optimized page title, 50-60 characters. REQUIRED for good search rankings.',
          },
          metaDescription: {
            type: 'string',
            description: 'SEO meta description, 150-160 characters. REQUIRED for good search rankings.',
          },
          heroImageUrl: {
            type: 'string',
            description: 'URL of the hero image to include with the post. Use generate_image tool first to create one.',
          },
          heroImagePrompt: {
            type: 'string',
            description: 'The prompt used to generate the hero image (for metadata)',
          },
          tags: {
            type: 'array',
            description: 'Tags for the post',
            items: { type: 'string' },
          },
          publish: {
            type: 'boolean',
            description: 'If true, publish immediately. If false, save as draft for review. Defaults to false (draft).',
            default: false,
          },
        },
        required: ['title', 'slug', 'content', 'excerpt', 'category'],
      },
    },
  },
  // ============================================
  // IMAGE GENERATION
  // ============================================
  {
    id: 'generate-image',
    name: 'generate_image',
    displayName: 'Generate Image',
    description: 'Generate images from text prompts using AI (DALL-E 3 or Pollinations)',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'generate_image',
      description: 'Generate an image from a text description. Creates logos, illustrations, banners, product images, social media graphics, and more. The image is stored permanently and a download URL is returned.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed description of the image to generate. Be specific about style, colors, composition, and subject matter.',
          },
          size: {
            type: 'string',
            description: 'Image dimensions',
            enum: ['1024x1024', '1792x1024', '1024x1792'],
            default: '1024x1024',
          },
          style: {
            type: 'string',
            description: 'Image style: "vivid" for dramatic/artistic, "natural" for realistic/photographic',
            enum: ['vivid', 'natural'],
            default: 'vivid',
          },
        },
        required: ['prompt'],
      },
    },
  },
  // ============================================
  // VIDEO PRODUCTION TOOLS
  // ============================================
  {
    id: 'create-video-job',
    name: 'create_video_job',
    displayName: 'Create Video Job',
    description: 'Create a new video production job for training, onboarding, or marketing videos',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'create_video_job',
      description: 'Create a new video production job. This sets up a video to be generated with script, avatar, and voice settings. The job must be submitted separately after script approval.',
      input_schema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Title of the video (e.g., "Welcome to Radar")'
          },
          description: {
            type: 'string',
            description: 'Brief description of what the video covers'
          },
          videoType: {
            type: 'string',
            description: 'Type of video to create',
            enum: ['onboarding', 'feature_demo', 'how_to', 'quick_tip', 'training', 'marketing']
          },
          script: {
            type: 'object',
            description: 'Video script with sections',
            properties: {
              title: { type: 'string' },
              totalDurationSec: { type: 'number' },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Section name (e.g., "Introduction")' },
                    content: { type: 'string', description: 'Script text for avatar to speak' },
                    durationSec: { type: 'number', description: 'Estimated duration in seconds' },
                    onScreenText: { type: 'string', description: 'Optional text overlay' }
                  },
                  required: ['name', 'content', 'durationSec']
                }
              }
            },
            required: ['title', 'sections']
          },
          productInfo: {
            type: 'object',
            description: 'Analyzed product/content information',
            properties: {
              productName: { type: 'string' },
              keyFeatures: { type: 'array', items: { type: 'string' } },
              targetAudience: { type: 'string' },
              useCases: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        required: ['title', 'videoType']
      }
    }
  },
  {
    id: 'list-video-avatars',
    name: 'list_video_avatars',
    displayName: 'List Video Avatars',
    description: 'List available AI avatars for video production',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    requiresApiKey: true,
    apiKeyName: 'HEYGEN_API_KEY',
    definition: {
      name: 'list_video_avatars',
      description: 'List available AI avatars from HeyGen. Returns avatar IDs, names, genders, and preview images. Use this to help users select an appropriate avatar for their video.',
      input_schema: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            description: 'Optional filter by gender or style',
            enum: ['all', 'male', 'female', 'professional', 'casual']
          }
        }
      }
    }
  },
  {
    id: 'list-video-voices',
    name: 'list_video_voices',
    displayName: 'List Video Voices',
    description: 'List available AI voices for video production',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    requiresApiKey: true,
    apiKeyName: 'HEYGEN_API_KEY',
    definition: {
      name: 'list_video_voices',
      description: 'List available AI voices from HeyGen. Returns voice IDs, names, languages, and preview audio links. Use this to help users select an appropriate voice for their video.',
      input_schema: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            description: 'Filter by language (e.g., "en", "es", "fr")'
          },
          gender: {
            type: 'string',
            description: 'Filter by gender',
            enum: ['male', 'female']
          }
        }
      }
    }
  },
  {
    id: 'submit-video-job',
    name: 'submit_video_job',
    displayName: 'Submit Video for Generation',
    description: 'Submit an approved video job to HeyGen for rendering',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    requiresApiKey: true,
    apiKeyName: 'HEYGEN_API_KEY',
    definition: {
      name: 'submit_video_job',
      description: 'Submit a video job to HeyGen for rendering. The job must have an approved script, selected avatar, and selected voice. Returns immediately - video renders asynchronously.',
      input_schema: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The video job ID to submit'
          },
          avatarId: {
            type: 'string',
            description: 'HeyGen avatar ID to use (from list_video_avatars)'
          },
          voiceId: {
            type: 'string',
            description: 'HeyGen voice ID to use (from list_video_voices)'
          },
          testMode: {
            type: 'boolean',
            description: 'If true, generates a draft quality video faster (useful for previewing)'
          }
        },
        required: ['jobId', 'avatarId', 'voiceId']
      }
    }
  },
  {
    id: 'check-video-status',
    name: 'check_video_status',
    displayName: 'Check Video Status',
    description: 'Check the rendering status of a video job',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    requiresApiKey: true,
    apiKeyName: 'HEYGEN_API_KEY',
    definition: {
      name: 'check_video_status',
      description: 'Check the status of a video that is being rendered. Returns status (pending, processing, completed, failed) and the video URL when complete.',
      input_schema: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The video job ID to check'
          }
        },
        required: ['jobId']
      }
    }
  },
  {
    id: 'list-video-jobs',
    name: 'list_video_jobs',
    displayName: 'List Video Jobs',
    description: 'List video production jobs for the account',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'list_video_jobs',
      description: 'List video production jobs. Can filter by status. Returns job details including title, type, status, and video URL if completed.',
      input_schema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filter by job status',
            enum: ['draft', 'analyzing', 'scripting', 'pending', 'rendering', 'completed', 'failed']
          },
          limit: {
            type: 'number',
            description: 'Maximum number of jobs to return (default: 20)'
          }
        }
      }
    }
  },
  // ============================================
  // AGENT COLLABORATION TOOLS
  // ============================================
  {
    id: 'create-skill',
    name: 'create_skill',
    displayName: 'Create Skill',
    description: 'Create a new reusable skill that agents can use for future tasks',
    category: 'utility',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'create_skill',
      description: 'Create a new reusable skill (prompt template) that any agent can use for future tasks. Use this when you discover a repeatable pattern or workflow worth saving. The skill content should be a well-structured prompt template in Markdown.',
      input_schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short name for the skill (e.g., "SEO Blog Post Writer")',
          },
          description: {
            type: 'string',
            description: 'Brief description of what this skill does',
          },
          content: {
            type: 'string',
            description: 'The skill content — a detailed prompt template in Markdown format. Use {{placeholders}} for dynamic inputs.',
          },
          category: {
            type: 'string',
            description: 'Skill category',
            enum: ['development', 'writing', 'analysis', 'productivity', 'design', 'devops', 'security', 'data', 'communication', 'integration', 'testing', 'other'],
          },
          tags: {
            type: 'array',
            description: 'Tags for searchability',
            items: { type: 'string' },
          },
        },
        required: ['name', 'content', 'category'],
      },
    },
  },
  {
    id: 'send-message',
    name: 'send_message',
    displayName: 'Send Message',
    description: 'Send a message to another agent or user (A2A messaging)',
    category: 'utility',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'send_message',
      description: 'Send a message to another agent or user. Use this for coordination, status updates, requesting help, or sharing results. Supports threading via sessionId.',
      input_schema: {
        type: 'object',
        properties: {
          toId: {
            type: 'string',
            description: 'ID of the recipient agent or user',
          },
          toType: {
            type: 'string',
            description: 'Whether the recipient is an agent or user',
            enum: ['agent', 'user'],
          },
          messageType: {
            type: 'string',
            description: 'Type of message',
            enum: ['request', 'response', 'alert', 'status'],
          },
          subject: {
            type: 'string',
            description: 'Optional short subject line',
          },
          content: {
            type: 'string',
            description: 'The message content',
          },
          sessionId: {
            type: 'string',
            description: 'Optional session/thread ID for threaded conversations',
          },
          inReplyTo: {
            type: 'string',
            description: 'Optional message ID this is replying to',
          },
        },
        required: ['toId', 'toType', 'messageType', 'content'],
      },
    },
  },
  {
    id: 'read-messages',
    name: 'read_messages',
    displayName: 'Read Messages',
    description: 'Read messages sent to this agent (A2A inbox)',
    category: 'utility',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'read_messages',
      description: 'Read messages from your inbox. Returns recent messages sent to you by other agents or users. Messages are automatically marked as read.',
      input_schema: {
        type: 'object',
        properties: {
          unreadOnly: {
            type: 'boolean',
            description: 'Only return unread messages (default: true)',
            default: true,
          },
          limit: {
            type: 'number',
            description: 'Max messages to return (default: 10)',
            default: 10,
          },
          sessionId: {
            type: 'string',
            description: 'Filter by conversation thread',
          },
          messageType: {
            type: 'string',
            description: 'Filter by message type',
            enum: ['request', 'response', 'broadcast', 'alert', 'status'],
          },
        },
      },
    },
  },
  // ============================================
  // OPENCLAW INTEGRATION
  // ============================================
  {
    id: 'execute-openclaw',
    name: 'execute_openclaw',
    displayName: 'Execute OpenClaw Agent',
    description: 'Delegate a task to an external OpenClaw agent runtime for autonomous execution',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'execute_openclaw',
      description: 'Send a task to an always-on OpenClaw agent runtime running on a VPS. Use this for marketing automation, lead generation, social media engagement, web research with browser automation, and other long-running tasks that benefit from persistent execution. The OpenClaw agent processes the task autonomously and can report results back via webhook.',
      input_schema: {
        type: 'object',
        properties: {
          agent_name: {
            type: 'string',
            description: 'The OpenClaw agent to route the task to (e.g., "LeadGen", "SocialMedia", "Research")',
          },
          task: {
            type: 'string',
            description: 'Detailed task description for the OpenClaw agent to execute',
          },
          context: {
            type: 'object',
            description: 'Optional context data to pass along (e.g., lead criteria, search parameters)',
          },
          callback_task_id: {
            type: 'string',
            description: 'Optional AgentPM task ID to update when OpenClaw completes the work',
          },
        },
        required: ['task'],
      },
    },
  },
  {
    id: 'record-screen-flow',
    name: 'record_screen_flow',
    displayName: 'Record Screen Flow',
    description: 'Automate and record a UI flow for video production',
    category: 'integration',
    isBuiltIn: true,
    isEnabled: true,
    definition: {
      name: 'record_screen_flow',
      description: 'Record an automated UI flow using Playwright. Returns screenshots and video recording. Available flows for Radar: welcomeOverview, addFirstSource, createTopics, aiSummaries, dailyDigest.',
      input_schema: {
        type: 'object',
        properties: {
          flowName: {
            type: 'string',
            description: 'Name of the pre-defined flow to record',
            enum: ['welcomeOverview', 'addFirstSource', 'createTopics', 'aiSummaries', 'dailyDigest']
          },
          customSteps: {
            type: 'array',
            description: 'Custom steps for a custom flow (alternative to flowName)',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Step name' },
                action: { type: 'string', enum: ['navigate', 'click', 'type', 'wait', 'screenshot', 'scroll'] },
                target: { type: 'string', description: 'Selector or URL' },
                value: { type: 'string', description: 'Value for type action' },
                waitMs: { type: 'number', description: 'Wait time in ms' }
              },
              required: ['name', 'action']
            }
          },
          baseUrl: {
            type: 'string',
            description: 'Base URL for custom flows (default: https://radar.funnelists.com)'
          }
        }
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
