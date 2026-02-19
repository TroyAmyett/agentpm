// Agent Worker Edge Function
// Processes queued tasks from the tasks table using Claude API
// Supports content writing, image generation (Stability AI), and CMS publishing

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Agent type configurations with system prompts
const AGENT_CONFIGS: Record<string, { systemPrompt: string; maxTokens: number }> = {
  'content-writer': {
    systemPrompt: `You are Maverick, a professional content writer for Funnelists. Create high-quality, engaging blog content.

When writing blog posts, structure your output as JSON with this format:
{
  "title": "Blog post title",
  "slug": "url-friendly-slug",
  "excerpt": "A compelling 1-2 sentence summary for previews",
  "content": "Full markdown content of the blog post",
  "category": "One of: Agentforce, AI Strategy, Sales Automation, Marketing, Technology",
  "tags": ["tag1", "tag2", "tag3"],
  "seoTitle": "SEO-optimized title (60 chars max)",
  "seoDescription": "Meta description for search engines (160 chars max)",
  "imagePrompt": "A detailed prompt for generating a hero image that matches the content"
}

Focus on:
- Clear, engaging headlines
- Well-structured content with H2/H3 headings
- Actionable insights for readers
- SEO-friendly formatting
- Funnelists brand voice: professional but approachable, forward-thinking`,
    maxTokens: 4096,
  },
  'image-generator': {
    systemPrompt: `You are Pixel, an image generation specialist. Create detailed prompts for Stability AI.

When given a topic or content summary, output a JSON object:
{
  "prompt": "Detailed image generation prompt following Funnelists brand guidelines",
  "negativePrompt": "Elements to avoid in the image",
  "style": "photorealistic OR illustration OR abstract",
  "aspectRatio": "16:9 for blog headers, 1:1 for social"
}

Funnelists Brand Guidelines:
- Primary color: #0ea5e9 (cyan)
- Background: #0a0a0f (dark)
- Style: Cyberpunk dark, dramatic rim lighting, high contrast
- Avoid: gold, amber, bronze, green tints, busy patterns
- For CTA images: leave upper 40-50% empty for text overlay`,
    maxTokens: 1024,
  },
  'cms-publisher': {
    systemPrompt: `You are Atlas, a CMS publishing specialist. Your job is to prepare and validate content for publishing to the Funnelists CMS.

When given blog content, validate and format it for the CMS API:
{
  "ready": true/false,
  "issues": ["list of any issues found"],
  "postData": {
    "title": "...",
    "slug": "...",
    "rawContent": "markdown content",
    "excerpt": "...",
    "category": "...",
    "tags": [...],
    "heroImage": { "url": "...", "prompt": "..." },
    "seoTitle": "...",
    "seoDescription": "...",
    "author": "Troy Amyett"
  }
}

Validate:
- Title is compelling and under 70 characters
- Slug is URL-friendly
- Content is properly formatted markdown
- Excerpt is under 200 characters
- Category matches allowed values
- SEO fields are present and optimized`,
    maxTokens: 2048,
  },
  researcher: {
    systemPrompt: `You are Scout, a thorough researcher. Your task is to analyze information, synthesize findings, and provide well-structured research outputs.
Be objective, cite your reasoning, and organize information logically.
Provide actionable insights when relevant.`,
    maxTokens: 4096,
  },
  'qa-tester': {
    systemPrompt: `You are Sentinel, a quality guardian. Analyze content, code, or processes for:
- Quality issues and potential problems
- Inconsistencies and errors
- Improvement opportunities
- Best practice adherence

Provide constructive feedback with specific suggestions for improvement.`,
    maxTokens: 2048,
  },
  orchestrator: {
    systemPrompt: `You are Dispatch, mission control for agent coordination. Your task is to:
- Break down complex tasks into subtasks
- Determine which agent types should handle each subtask
- Create execution plans and coordinate workflows
- Monitor progress and handle dependencies

Provide structured task breakdowns with clear assignments.`,
    maxTokens: 2048,
  },
  forge: {
    systemPrompt: `You are Forge, an expert software developer agent. Your task is to implement features based on Product Requirements Documents (PRDs).

When implementing a PRD:
1. Analyze the requirements carefully
2. Plan the implementation approach
3. Write clean, well-structured code
4. Follow existing patterns in the codebase
5. Add appropriate error handling
6. Write tests when applicable

Output your implementation in this JSON format:
{
  "plan": "Brief implementation plan",
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "action": "create" | "modify" | "delete",
      "content": "Full file content for create, or diff/patch for modify",
      "description": "What this change does"
    }
  ],
  "commits": [
    {
      "message": "feat: description of change",
      "files": ["list", "of", "files"]
    }
  ],
  "testPlan": "How to verify the implementation works",
  "notes": "Any important notes for the reviewer"
}

Guidelines:
- Make atomic commits with clear, descriptive messages
- Follow existing code style and patterns
- Add appropriate error handling
- Write tests for new functionality
- Do not make changes outside the scope of the PRD`,
    maxTokens: 8000,
  },
  general: {
    systemPrompt: `You are a helpful AI assistant. Complete the requested task to the best of your ability.
Be thorough, accurate, and provide useful output.
Format your response appropriately for the task type.`,
    maxTokens: 4096,
  },
}

interface Task {
  id: string
  title: string
  description: string | null
  account_id: string
  assigned_to: string | null
  assigned_to_type: 'user' | 'agent' | null
  status: string
  priority: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  status_history: Array<{
    status: string
    changedAt: string
    changedBy: string
    changedByType: string
    note?: string
  }>
}

// Generate image using Stability AI
async function generateImage(
  prompt: string,
  negativePrompt?: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const stabilityApiKey = Deno.env.get('STABILITY_API_KEY')

  if (!stabilityApiKey) {
    return { success: false, error: 'STABILITY_API_KEY not configured' }
  }

  try {
    // Use Stability AI's text-to-image endpoint
    const response = await fetch(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stabilityApiKey}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          text_prompts: [
            { text: prompt, weight: 1 },
            ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : []),
          ],
          cfg_scale: 7,
          height: 576,
          width: 1024,
          samples: 1,
          steps: 30,
          style_preset: 'photographic',
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Stability AI error:', errorText)
      return { success: false, error: `Stability AI error: ${response.status}` }
    }

    const data = await response.json()

    if (!data.artifacts || data.artifacts.length === 0) {
      return { success: false, error: 'No image generated' }
    }

    // Return base64 image - in production, upload to storage
    const base64Image = data.artifacts[0].base64

    // For now, return as data URL. In production, upload to Supabase Storage
    const imageUrl = `data:image/png;base64,${base64Image}`

    return { success: true, imageUrl }
  } catch (error) {
    console.error('Error generating image:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating image',
    }
  }
}

// Upload image to Supabase Storage and return public URL
async function uploadImageToStorage(
  supabase: ReturnType<typeof createClient>,
  base64Data: string,
  fileName: string
): Promise<{ success: boolean; publicUrl?: string; storagePath?: string; error?: string }> {
  try {
    // Remove data URL prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '')

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Content)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const storagePath = `hero/${fileName}.png`

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('blog-images')
      .upload(storagePath, bytes, {
        contentType: 'image/png',
        upsert: true,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return { success: false, error: error.message }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('blog-images')
      .getPublicUrl(storagePath)

    return { success: true, publicUrl: urlData.publicUrl, storagePath }
  } catch (error) {
    console.error('Error uploading image:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error uploading image',
    }
  }
}

// Delete image from Supabase Storage after successful CMS publish
async function cleanupStorageImage(
  supabase: ReturnType<typeof createClient>,
  storagePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.storage
      .from('blog-images')
      .remove([storagePath])

    if (error) {
      console.error('Storage cleanup error:', error)
      return { success: false, error: error.message }
    }

    console.log(`Cleaned up storage image: ${storagePath}`)
    return { success: true }
  } catch (error) {
    console.error('Error cleaning up storage:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error cleaning up storage',
    }
  }
}

// Publish to CMS
async function publishToCMS(
  postData: Record<string, unknown>
): Promise<{ success: boolean; post?: Record<string, unknown>; error?: string }> {
  const cmsEndpoint = Deno.env.get('CMS_ENDPOINT') || 'https://funnelists.com'
  const cmsApiKey = Deno.env.get('CMS_AGENT_API_KEY')

  if (!cmsApiKey) {
    return { success: false, error: 'CMS_AGENT_API_KEY not configured' }
  }

  try {
    const response = await fetch(`${cmsEndpoint}/api/pages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CMS-API-Key': cmsApiKey,
      },
      body: JSON.stringify(postData),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      return {
        success: false,
        error: errorData.error || `CMS error: ${response.status}`
      }
    }

    const result = await response.json()
    return { success: true, post: result.post }
  } catch (error) {
    console.error('Error publishing to CMS:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error publishing to CMS',
    }
  }
}

async function processTask(
  anthropic: Anthropic,
  supabase: ReturnType<typeof createClient>,
  task: Task,
  agentType: string
): Promise<{ success: boolean; result?: string; output?: Record<string, unknown>; error?: string }> {
  const config = AGENT_CONFIGS[agentType] || AGENT_CONFIGS.general

  try {
    // Build the user message from task title and description
    let userMessage = `Task: ${task.title}`
    if (task.description) {
      userMessage += `\n\nDescription:\n${task.description}`
    }
    if (task.input) {
      userMessage += `\n\nAdditional context:\n${JSON.stringify(task.input, null, 2)}`
    }

    // Call Claude for content generation/planning
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: config.maxTokens,
      system: config.systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    })

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return { success: false, error: 'No text response from Claude' }
    }

    let resultText = textContent.text
    let outputData: Record<string, unknown> = {}

    // Handle agent-specific post-processing
    if (agentType === 'image-generator') {
      // Parse the prompt from Claude's response and generate actual image
      try {
        const promptData = JSON.parse(resultText)
        const imageResult = await generateImage(
          promptData.prompt,
          promptData.negativePrompt
        )

        if (imageResult.success && imageResult.imageUrl) {
          // Upload to storage if it's base64
          if (imageResult.imageUrl.startsWith('data:')) {
            const fileName = `blog-${Date.now()}`
            const uploadResult = await uploadImageToStorage(
              supabase,
              imageResult.imageUrl,
              fileName
            )

            if (uploadResult.success) {
              outputData = {
                ...promptData,
                imageUrl: uploadResult.publicUrl,
                storagePath: uploadResult.storagePath, // Track for cleanup after CMS publish
                generatedAt: new Date().toISOString(),
              }
              resultText = `Image generated successfully!\n\nURL: ${uploadResult.publicUrl}\n\nPrompt used: ${promptData.prompt}`
            } else {
              // Fall back to base64 URL if upload fails
              outputData = {
                ...promptData,
                imageUrl: imageResult.imageUrl,
                generatedAt: new Date().toISOString(),
                uploadError: uploadResult.error,
              }
              resultText = `Image generated (upload pending).\n\nPrompt used: ${promptData.prompt}`
            }
          } else {
            outputData = {
              ...promptData,
              imageUrl: imageResult.imageUrl,
              generatedAt: new Date().toISOString(),
            }
          }
        } else {
          return { success: false, error: imageResult.error || 'Failed to generate image' }
        }
      } catch (parseError) {
        // If Claude didn't return JSON, just use the text as the prompt
        const imageResult = await generateImage(resultText)
        if (imageResult.success && imageResult.imageUrl) {
          outputData = {
            prompt: resultText,
            imageUrl: imageResult.imageUrl,
            generatedAt: new Date().toISOString(),
          }
        } else {
          return { success: false, error: imageResult.error || 'Failed to generate image' }
        }
      }
    } else if (agentType === 'cms-publisher') {
      // Parse and publish to CMS
      try {
        const publishData = JSON.parse(resultText)
        if (publishData.ready && publishData.postData) {
          const publishResult = await publishToCMS(publishData.postData)
          if (publishResult.success) {
            // Clean up Supabase Storage images after successful CMS publish
            // The CMS now has the image, so we can delete our temporary copy
            const cleanedUpImages: string[] = []
            const cleanupErrors: string[] = []

            // Check for storagePath in the task input (passed from previous workflow step)
            const inputStoragePath = task.input?.storagePath as string | undefined
            if (inputStoragePath) {
              const cleanup = await cleanupStorageImage(supabase, inputStoragePath)
              if (cleanup.success) {
                cleanedUpImages.push(inputStoragePath)
              } else {
                cleanupErrors.push(`${inputStoragePath}: ${cleanup.error}`)
              }
            }

            // Also check heroImage storagePath if present
            const heroStoragePath = publishData.postData?.heroImage?.storagePath as string | undefined
            if (heroStoragePath && heroStoragePath !== inputStoragePath) {
              const cleanup = await cleanupStorageImage(supabase, heroStoragePath)
              if (cleanup.success) {
                cleanedUpImages.push(heroStoragePath)
              } else {
                cleanupErrors.push(`${heroStoragePath}: ${cleanup.error}`)
              }
            }

            outputData = {
              published: true,
              post: publishResult.post,
              publishedAt: new Date().toISOString(),
              storageCleanup: {
                cleaned: cleanedUpImages,
                errors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
              },
            }
            resultText = `Successfully published to CMS!\n\nPost: ${publishData.postData.title}\nSlug: ${publishData.postData.slug}`
            if (cleanedUpImages.length > 0) {
              resultText += `\n\nCleaned up ${cleanedUpImages.length} temporary image(s) from storage.`
            }
          } else {
            return { success: false, error: publishResult.error }
          }
        } else {
          outputData = {
            ready: false,
            issues: publishData.issues || ['Content not ready for publishing'],
          }
          resultText = `Content validation issues:\n${(publishData.issues || []).join('\n')}`
        }
      } catch (parseError) {
        return { success: false, error: 'Failed to parse CMS publish data' }
      }
    } else if (agentType === 'content-writer') {
      // Parse blog content output
      try {
        const blogData = JSON.parse(resultText)
        outputData = blogData
      } catch {
        // If not JSON, store as raw content
        outputData = { content: resultText }
      }
    } else if (agentType === 'forge') {
      // Parse Forge implementation output
      try {
        const forgeData = JSON.parse(resultText)

        // Generate branch name
        const branchName = (task.input as Record<string, unknown>)?.targetBranch as string ||
          `forge/feature-${Date.now().toString(36)}`

        // Build structured output
        outputData = {
          branchName,
          implementation: forgeData,
          plan: forgeData.plan,
          files: forgeData.files || [],
          commits: (forgeData.commits || []).map((c: { message: string; files?: string[] }) => ({
            sha: crypto.randomUUID().slice(0, 7),
            message: c.message,
            filesChanged: c.files || [],
            timestamp: new Date().toISOString(),
          })),
          filesChanged: (forgeData.files || []).map((f: { path: string; action: string }) => ({
            path: f.path,
            changeType: f.action === 'create' ? 'added' :
                       f.action === 'delete' ? 'deleted' : 'modified',
            additions: 0,
            deletions: 0,
          })),
          testPlan: forgeData.testPlan,
          notes: forgeData.notes,
          summary: `Implementation plan: ${forgeData.plan}`,
          totalTokensUsed: response.usage.input_tokens + response.usage.output_tokens,
          totalCost: Math.ceil(
            (response.usage.input_tokens / 1_000_000) * 300 +
            (response.usage.output_tokens / 1_000_000) * 1500
          ),
          generatedAt: new Date().toISOString(),
        }

        resultText = `Forge Implementation Generated\n\nPlan: ${forgeData.plan}\n\nFiles to modify: ${(forgeData.files || []).length}\nCommits planned: ${(forgeData.commits || []).length}`

        // Create Forge session record
        await supabase.from('forge_sessions').insert({
          id: crypto.randomUUID(),
          task_id: task.id,
          agent_id: task.assigned_to,
          account_id: task.account_id,
          input: task.input,
          status: 'awaiting-approval',
          current_step: 'Awaiting approval to apply changes',
          progress: 95,
          output: outputData,
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          created_by: task.assigned_to,
          created_by_type: 'agent',
        }).catch((err: Error) => {
          console.warn('Could not create forge_sessions record:', err.message)
          // Non-fatal - continue even if sessions table doesn't exist
        })
      } catch (parseError) {
        // If not valid JSON, treat as raw implementation notes
        outputData = {
          rawImplementation: resultText,
          generatedAt: new Date().toISOString(),
        }
      }
    }

    return { success: true, result: resultText, output: outputData }
  } catch (error) {
    console.error('Error calling Claude API:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calling Claude API',
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!

    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    // Parse request body for optional task_id parameter
    let specificTaskId: string | null = null
    try {
      const body = await req.json()
      specificTaskId = body.task_id || null
    } catch {
      // No body or invalid JSON is fine - we'll process any pending task
    }

    // Fetch queued tasks from the main tasks table
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('status', 'queued')
      .eq('assigned_to_type', 'agent')
      .is('deleted_at', null)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)

    if (specificTaskId) {
      query = supabase
        .from('tasks')
        .select('*')
        .eq('id', specificTaskId)
        .single()
    }

    const { data: tasks, error: fetchError } = specificTaskId
      ? await query
      : await query

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching tasks:', fetchError)
      throw fetchError
    }

    // Handle no tasks
    const taskList = specificTaskId ? (tasks ? [tasks] : []) : (tasks || [])
    if (taskList.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No queued tasks', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const task = taskList[0] as Task
    console.log(`Processing task ${task.id}: ${task.title}`)

    // Get the agent persona to determine agent type
    let agentType = 'general'
    if (task.assigned_to) {
      const { data: agent } = await supabase
        .from('agent_personas')
        .select('agent_type, alias')
        .eq('id', task.assigned_to)
        .single()

      if (agent) {
        agentType = agent.agent_type
        console.log(`Task assigned to ${agent.alias} (${agentType})`)
      }
    }

    // Mark task as in_progress
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'in_progress',
        started_at: now,
        status_history: [
          ...(task.status_history || []),
          {
            status: 'in_progress',
            changedAt: now,
            changedBy: task.assigned_to || 'agent-worker',
            changedByType: 'agent',
            note: 'Processing started by agent worker',
          },
        ],
        updated_by: task.assigned_to || 'agent-worker',
        updated_by_type: 'agent',
      })
      .eq('id', task.id)

    if (updateError) {
      console.error('Error updating task status:', updateError)
      throw updateError
    }

    // Process the task
    const result = await processTask(anthropic, supabase, task, agentType)

    if (result.success) {
      // Mark as review (pending human approval)
      const completedAt = new Date().toISOString()
      await supabase
        .from('tasks')
        .update({
          status: 'review',
          completed_at: completedAt,
          output: {
            ...(task.output || {}),
            ...(result.output || {}),
            result: result.result,
            completedAt,
            processedBy: agentType,
          },
          status_history: [
            ...(task.status_history || []),
            {
              status: 'in_progress',
              changedAt: now,
              changedBy: task.assigned_to || 'agent-worker',
              changedByType: 'agent',
              note: 'Processing started',
            },
            {
              status: 'review',
              changedAt: completedAt,
              changedBy: task.assigned_to || 'agent-worker',
              changedByType: 'agent',
              note: 'Task completed, awaiting review',
            },
          ],
          updated_by: task.assigned_to || 'agent-worker',
          updated_by_type: 'agent',
        })
        .eq('id', task.id)

      console.log(`Task ${task.id} completed successfully`)

      return new Response(
        JSON.stringify({
          message: 'Task processed successfully',
          task_id: task.id,
          status: 'review',
          agent_type: agentType,
          output: result.output,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Handle failure
      const failedAt = new Date().toISOString()
      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          error: {
            message: result.error,
            occurredAt: failedAt,
          },
          status_history: [
            ...(task.status_history || []),
            {
              status: 'in_progress',
              changedAt: now,
              changedBy: task.assigned_to || 'agent-worker',
              changedByType: 'agent',
              note: 'Processing started',
            },
            {
              status: 'failed',
              changedAt: failedAt,
              changedBy: task.assigned_to || 'agent-worker',
              changedByType: 'agent',
              note: `Task failed: ${result.error}`,
            },
          ],
          updated_by: task.assigned_to || 'agent-worker',
          updated_by_type: 'agent',
        })
        .eq('id', task.id)

      console.log(`Task ${task.id} failed: ${result.error}`)

      return new Response(
        JSON.stringify({
          message: 'Task processing failed',
          task_id: task.id,
          status: 'failed',
          error: result.error,
        }),
        {
          status: 200, // Return 200 even for task failures - the function itself worked
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
