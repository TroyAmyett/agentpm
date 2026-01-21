// Blog Publisher Orchestrator Edge Function
// Orchestrates the full blog publishing workflow:
// 1. Maverick writes blog content
// 2. Pixel generates hero image
// 3. Atlas publishes to CMS
//
// Can be triggered manually or via cron for scheduled publishing

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Agent UUIDs from seed migration
const AGENTS = {
  MAVERICK: '00000000-0000-0000-0000-000000000001', // content-writer
  PIXEL: '00000000-0000-0000-0000-000000000002',    // image-generator
  DISPATCH: '00000000-0000-0000-0000-000000000005', // orchestrator
  ATLAS: '00000000-0000-0000-0000-000000000006',    // cms-publisher
}

interface BlogRequest {
  topic: string
  keywords?: string[]
  category?: string
  tone?: string
  targetLength?: 'short' | 'medium' | 'long'
  accountId: string
  projectId?: string
  autoPublish?: boolean // If true, automatically publish after generation
}

interface WorkflowTask {
  id: string
  type: 'write' | 'image' | 'publish'
  status: 'pending' | 'queued' | 'in_progress' | 'completed' | 'failed'
  taskId?: string
  output?: Record<string, unknown>
  error?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request
    const body: BlogRequest = await req.json()

    if (!body.topic || !body.accountId) {
      return new Response(
        JSON.stringify({ error: 'topic and accountId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date().toISOString()

    // Create the workflow tracking record
    const workflowId = crypto.randomUUID()
    const workflow: WorkflowTask[] = [
      { id: crypto.randomUUID(), type: 'write', status: 'pending' },
      { id: crypto.randomUUID(), type: 'image', status: 'pending' },
      { id: crypto.randomUUID(), type: 'publish', status: 'pending' },
    ]

    // Step 1: Create content writing task for Maverick
    const writeTaskDescription = `Write a blog post about: ${body.topic}

${body.keywords?.length ? `Keywords to include: ${body.keywords.join(', ')}` : ''}
${body.category ? `Category: ${body.category}` : ''}
${body.tone ? `Tone: ${body.tone}` : 'Tone: Professional but approachable'}
${body.targetLength ? `Target length: ${body.targetLength} (${body.targetLength === 'short' ? '500-800' : body.targetLength === 'medium' ? '1000-1500' : '2000+'} words)` : ''}

Output the blog post in the required JSON format with title, slug, content, excerpt, tags, SEO fields, and an imagePrompt for the hero image.`

    const { data: writeTask, error: writeError } = await supabase
      .from('tasks')
      .insert({
        account_id: body.accountId,
        project_id: body.projectId,
        title: `Write blog: ${body.topic.substring(0, 50)}...`,
        description: writeTaskDescription,
        status: 'queued',
        priority: 'high',
        assigned_to: AGENTS.MAVERICK,
        assigned_to_type: 'agent',
        input: {
          workflowId,
          workflowStep: 'write',
          topic: body.topic,
          keywords: body.keywords,
          category: body.category,
          tone: body.tone,
          targetLength: body.targetLength,
        },
        status_history: [{
          status: 'queued',
          changedAt: now,
          changedBy: AGENTS.DISPATCH,
          changedByType: 'agent',
          note: 'Blog publishing workflow initiated',
        }],
        created_by: AGENTS.DISPATCH,
        created_by_type: 'agent',
        updated_by: AGENTS.DISPATCH,
        updated_by_type: 'agent',
      })
      .select()
      .single()

    if (writeError) {
      console.error('Error creating write task:', writeError)
      throw writeError
    }

    workflow[0].taskId = writeTask.id
    workflow[0].status = 'queued'

    // Store workflow state for tracking
    const { error: workflowError } = await supabase
      .from('agent_notes')
      .insert({
        account_id: body.accountId,
        agent_id: AGENTS.DISPATCH,
        note_type: 'workflow',
        content: JSON.stringify({
          workflowId,
          type: 'blog-publish',
          request: body,
          tasks: workflow,
          status: 'in_progress',
          createdAt: now,
        }),
        is_pinned: true,
        created_by: AGENTS.DISPATCH,
        created_by_type: 'agent',
        updated_by: AGENTS.DISPATCH,
        updated_by_type: 'agent',
      })

    if (workflowError) {
      console.error('Error storing workflow:', workflowError)
      // Non-fatal - continue anyway
    }

    // Trigger the agent-worker to process the first task
    const workerUrl = `${supabaseUrl}/functions/v1/agent-worker`
    const workerResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ task_id: writeTask.id }),
    })

    const workerResult = await workerResponse.json()

    return new Response(
      JSON.stringify({
        success: true,
        workflowId,
        message: 'Blog publishing workflow started',
        writeTask: {
          id: writeTask.id,
          status: workerResult.status || 'queued',
        },
        nextSteps: [
          'Maverick will write the blog content',
          'Then Pixel will generate the hero image',
          'Finally Atlas will publish to the CMS',
        ],
        note: 'Check the task in AgentPM to monitor progress. Each step will appear in the Review column when ready.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Blog publisher error:', error)
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
