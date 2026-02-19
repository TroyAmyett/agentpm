// AgentPM Skills API — REST endpoint for external tools (Claw, CLI agents, etc.)
// GET  /skills-api              → List skills (paginated)
// GET  /skills-api?slug=foo     → Get skill by slug
// GET  /skills-api?id=uuid      → Get skill by ID
// GET  /skills-api?search=kw    → Search skills by name/tags
// GET  /skills-api?category=x   → Filter by category
// POST /skills-api              → Create new skill

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyApiKey, hasScope, type ApiKeyContext } from '../_shared/auth.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CreateSkillRequest {
  name: string
  description?: string
  content: string
  category?: string
  tags?: string[]
  version?: string
  author?: string
  requiredTools?: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    result[camelKey] = value
  }
  return result
}

function jsonResponse(
  data: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ─── Auth ───────────────────────────────────────────────────────────────────

async function authenticate(
  supabase: ReturnType<typeof createClient>,
  req: Request
): Promise<{ ctx: ApiKeyContext } | { error: Response }> {
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  // Strategy 1: Service-to-service (internal edge functions)
  if (authHeader === `Bearer ${serviceRoleKey}` && serviceRoleKey) {
    // Service role has full access — need accountId from query param
    const url = new URL(req.url)
    const accountId = url.searchParams.get('account_id')
    if (!accountId) {
      return { error: jsonResponse({ success: false, error: 'Service role requires account_id param' }, 400) }
    }
    return { ctx: { accountId, scopes: ['skill:read', 'skill:create'] } }
  }

  // Strategy 2: API key
  const apiKeyCtx = await verifyApiKey(supabase, authHeader)
  if (apiKeyCtx) {
    return { ctx: apiKeyCtx }
  }

  // Strategy 3: Supabase JWT (UI-initiated)
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) {
      const { data: userAccount } = await supabase
        .from('user_accounts')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (userAccount) {
        return {
          ctx: {
            accountId: userAccount.account_id,
            scopes: ['skill:read', 'skill:create'], // Authenticated users get full skill access
          },
        }
      }
    }
  }

  return { error: jsonResponse({ success: false, error: 'Unauthorized' }, 401) }
}

// ─── GET Handlers ───────────────────────────────────────────────────────────

async function handleGet(
  supabase: ReturnType<typeof createClient>,
  ctx: ApiKeyContext,
  url: URL
): Promise<Response> {
  if (!hasScope(ctx, 'skill:read')) {
    return jsonResponse({ success: false, error: 'API key lacks skill:read scope' }, 403)
  }

  const id = url.searchParams.get('id')
  const slug = url.searchParams.get('slug')
  const search = url.searchParams.get('search')
  const category = url.searchParams.get('category')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  // ── Get by ID ──
  if (id) {
    const { data, error } = await supabase
      .from('skills')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .is('deleted_at', null)
      .single()

    if (error || !data) {
      return jsonResponse({ success: false, error: 'Skill not found' }, 404)
    }

    return jsonResponse({ success: true, data: snakeToCamel(data) })
  }

  // ── Get by slug ──
  if (slug) {
    const { data, error } = await supabase
      .from('skills')
      .select('*')
      .eq('slug', slug)
      .eq('account_id', ctx.accountId)
      .is('deleted_at', null)
      .single()

    if (error || !data) {
      return jsonResponse({ success: false, error: 'Skill not found' }, 404)
    }

    return jsonResponse({ success: true, data: snakeToCamel(data) })
  }

  // ── Search / List / Filter ──
  let query = supabase
    .from('skills')
    .select('*', { count: 'exact' })
    .eq('account_id', ctx.accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category) {
    query = query.eq('category', category)
  }

  if (search) {
    // Search in name, description, and tags
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Failed to fetch skills:', error)
    return jsonResponse({ success: false, error: `Query failed: ${error.message}` }, 500)
  }

  return jsonResponse({
    success: true,
    data: (data || []).map(snakeToCamel),
    count: count || 0,
    pagination: { limit, offset },
  })
}

// ─── POST Handler ───────────────────────────────────────────────────────────

async function handlePost(
  supabase: ReturnType<typeof createClient>,
  ctx: ApiKeyContext,
  req: Request
): Promise<Response> {
  if (!hasScope(ctx, 'skill:create')) {
    return jsonResponse({ success: false, error: 'API key lacks skill:create scope' }, 403)
  }

  let body: CreateSkillRequest
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  // Validate required fields
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return jsonResponse({ success: false, error: 'name is required' }, 400)
  }
  if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
    return jsonResponse({ success: false, error: 'content is required' }, 400)
  }

  const slug = generateSlug(body.name)

  // Check for duplicate slug within account
  const { data: existing } = await supabase
    .from('skills')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('slug', slug)
    .is('deleted_at', null)
    .single()

  if (existing) {
    return jsonResponse({ success: false, error: `Skill with slug "${slug}" already exists` }, 409)
  }

  const insertData: Record<string, unknown> = {
    account_id: ctx.accountId,
    name: body.name.trim(),
    slug,
    description: body.description || null,
    content: body.content,
    category: body.category || 'other',
    tags: body.tags || [],
    version: body.version || '1.0.0',
    author: body.author || null,
    source_type: 'local',
    is_enabled: true,
    is_org_shared: true,
    required_tools: body.requiredTools || [],
    input_schema: body.inputSchema || null,
    output_schema: body.outputSchema || null,
  }

  // If API key is agent-scoped, track which agent created it
  if (ctx.agentId) {
    insertData.created_by_agent_id = ctx.agentId
  }

  const { data, error } = await supabase
    .from('skills')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.error('Failed to create skill:', error)
    return jsonResponse({ success: false, error: `Failed to create skill: ${error.message}` }, 500)
  }

  return jsonResponse({
    success: true,
    data: snakeToCamel(data),
    action: 'skill_created',
  }, 201)
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authResult = await authenticate(supabase, req)
    if ('error' in authResult) {
      return authResult.error
    }
    const ctx = authResult.ctx

    const url = new URL(req.url)

    if (req.method === 'GET') {
      return await handleGet(supabase, ctx, url)
    }

    return await handlePost(supabase, ctx, req)
  } catch (error) {
    console.error('Skills API error:', error)
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, 500)
  }
})
