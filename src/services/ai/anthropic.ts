import { buildKnowledgeContext } from '@/services/agentpm/knowledgeService'
import type { FunnelistsTool } from '@/types/agentpm'
import { createLLMAdapter, resolveLLMConfig, type LLMMessage, type LLMContentBlock } from '@/services/llm'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
}

interface Tool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// Web search tool
const WEB_SEARCH_TOOL: Tool = {
  name: 'web_search',
  description: 'Search the web for current information. Use this when the user asks about current events, products, services, tools, or anything that requires up-to-date information from the internet. Also use when looking for specific websites, tools, or services.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find information on the web.',
      },
    },
    required: ['query'],
  },
}

// Tools for note operations
const NOTE_TOOLS: Tool[] = [
  {
    name: 'update_current_note',
    description: 'Update the content of the currently open note. Use this when the user asks you to add content, modify, or update their note.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The new content for the note. This should be the COMPLETE note content, not just the changes. Include all existing content that should be kept, plus any new or modified content.',
        },
        title: {
          type: 'string',
          description: 'Optional: New title for the note. Only include if the user wants to change the title.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'create_new_note',
    description: 'Create a new note. Use this when the user asks you to create a new note or save content as a new note.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title for the new note.',
        },
        content: {
          type: 'string',
          description: 'The content for the new note.',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'append_to_note',
    description: 'Append content to the end of the current note without replacing existing content. Use this for adding new sections, ideas, or items.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to append to the end of the note.',
        },
      },
      required: ['content'],
    },
  },
]

// Task creation tool - allows AI to create tasks in AgentPM
const TASK_TOOL: Tool = {
  name: 'create_task',
  description: 'Create a new task in AgentPM. Use this when the user asks you to create a task, add something to their to-do list, or wants to track an action item. Tasks are actionable work items that can be assigned to AI agents or humans.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The title of the task. Should be clear, action-oriented, and start with a verb (e.g., "Create blog post about AI trends").',
      },
      description: {
        type: 'string',
        description: 'Optional detailed description of what needs to be done. Include requirements, context, and acceptance criteria.',
      },
      priority: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low'],
        description: 'Task priority. Defaults to medium if not specified.',
      },
    },
    required: ['title'],
  },
}

// Callbacks for note and task operations - will be set by ChatPanel
export type NoteOperationCallbacks = {
  updateCurrentNote: (content: string, title?: string) => Promise<void>
  createNewNote: (title: string, content: string) => Promise<void>
  appendToNote: (content: string) => Promise<void>
  getCurrentNoteContent: () => string
  // Task operations
  createTask?: (task: { title: string; description?: string; priority?: string }) => Promise<{ id: string; title: string }>
}

let noteCallbacks: NoteOperationCallbacks | null = null

export function setNoteOperationCallbacks(callbacks: NoteOperationCallbacks | null) {
  noteCallbacks = callbacks
}

// Web search function
interface WebSearchResult {
  title: string
  url: string
  description: string
  age?: string
}

async function performWebSearch(query: string): Promise<WebSearchResult[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase not configured for web search')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/web-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ query, count: 8 }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Search failed' }))
    throw new Error(error.error || 'Web search failed')
  }

  const data = await response.json()
  return data.results || []
}

export const isAnthropicConfigured = () => {
  // With LLM abstraction, check if any provider is configured
  const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY || import.meta.env.VITE_OPENAI_API_KEY
  return !!envKey
}

export async function callClaude(
  messages: AnthropicMessage[],
  systemPrompt?: string
): Promise<string> {
  const resolved = await resolveLLMConfig('chat-assistant')
  if (!resolved.config) {
    throw new Error(resolved.error || 'No LLM API key configured')
  }

  const adapter = createLLMAdapter(resolved.config)

  // Convert AnthropicMessage format to LLMMessage format
  const llmMessages: LLMMessage[] = messages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : m.content.map(b => ({
      type: b.type as LLMContentBlock['type'],
      text: b.text,
      toolCallId: b.id || b.tool_use_id,
      toolName: b.name,
      toolInput: b.input,
    })),
  }))

  const response = await adapter.chat(llmMessages, {
    system: systemPrompt || 'You are a helpful AI assistant integrated into a note-taking app. Be concise and helpful.',
    maxTokens: 4096,
  })

  const textContent = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('')

  return textContent
}

// AI writing actions
export const AI_ACTIONS = {
  continue: {
    id: 'continue',
    label: 'Continue writing',
    icon: 'pen-line',
    systemPrompt: 'Continue the following text naturally. Maintain the same style, tone, and format. Only output the continuation, not the original text.',
    userPrompt: (text: string) => `Continue this text:\n\n${text}`,
  },
  improve: {
    id: 'improve',
    label: 'Improve writing',
    icon: 'sparkles',
    systemPrompt: 'Improve the following text by making it clearer, more concise, and better written. Maintain the original meaning and tone. Only output the improved version.',
    userPrompt: (text: string) => `Improve this text:\n\n${text}`,
  },
  summarize: {
    id: 'summarize',
    label: 'Summarize',
    icon: 'list',
    systemPrompt: 'Summarize the following text into key points. Be concise and capture the main ideas.',
    userPrompt: (text: string) => `Summarize this text:\n\n${text}`,
  },
  expand: {
    id: 'expand',
    label: 'Expand',
    icon: 'expand',
    systemPrompt: 'Expand on the following text with more details, examples, and explanations. Maintain the same tone and style.',
    userPrompt: (text: string) => `Expand on this text:\n\n${text}`,
  },
  simplify: {
    id: 'simplify',
    label: 'Simplify',
    icon: 'minimize-2',
    systemPrompt: 'Simplify the following text to make it easier to understand. Use simpler words and shorter sentences.',
    userPrompt: (text: string) => `Simplify this text:\n\n${text}`,
  },
  fixGrammar: {
    id: 'fixGrammar',
    label: 'Fix grammar',
    icon: 'check',
    systemPrompt: 'Fix any grammar, spelling, or punctuation errors in the following text. Only output the corrected version.',
    userPrompt: (text: string) => `Fix grammar in this text:\n\n${text}`,
  },
  changeTone: {
    id: 'changeTone',
    label: 'Change tone',
    icon: 'message-circle',
    systemPrompt: 'Make the following text more professional and formal while maintaining the same meaning.',
    userPrompt: (text: string) => `Make this text more professional:\n\n${text}`,
  },
}

export type AIActionType = keyof typeof AI_ACTIONS

export async function performAIAction(
  actionType: AIActionType,
  text: string
): Promise<string> {
  const action = AI_ACTIONS[actionType]
  if (!action) {
    throw new Error(`Unknown AI action: ${actionType}`)
  }

  return callClaude(
    [{ role: 'user', content: action.userPrompt(text) }],
    action.systemPrompt
  )
}

// Status callback type for chat progress updates
export type ChatStatusCallback = (status: 'thinking' | 'searching' | 'updating-note' | 'creating-task') => void

// Context options for hierarchical knowledge injection
export interface ChatContextOptions {
  accountId?: string
  projectId?: string
  toolName?: FunnelistsTool
}

/**
 * Convert local Tool definitions to LLM tool format
 */
function toLLMTools(tools: Tool[]) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema as { type: 'object'; properties: Record<string, unknown>; required?: string[] },
  }))
}

// Chat with notes - focuses on the active note with hierarchical knowledge context
export async function chatWithNotes(
  userMessage: string,
  activeNote: { title: string; content: string; id: string } | null,
  _otherNotesContext: string, // Deprecated - kept for API compatibility but not used
  chatHistory: AnthropicMessage[],
  onStatusChange?: ChatStatusCallback,
  contextOptions?: ChatContextOptions
): Promise<{ response: string; noteUpdated?: boolean; noteCreated?: boolean; webSearchUsed?: boolean; taskCreated?: boolean }> {
  // Build hierarchical knowledge context
  let knowledgeContext = ''
  if (contextOptions?.accountId) {
    try {
      knowledgeContext = await buildKnowledgeContext({
        accountId: contextOptions.accountId,
        projectId: contextOptions.projectId,
        toolName: contextOptions.toolName || 'agentpm',
        includeSystemKnowledge: true,
      })
    } catch (error) {
      console.warn('[chatWithNotes] Failed to build knowledge context:', error)
    }
  }

  let systemPrompt: string

  // Base knowledge section (always included if available)
  const knowledgeSection = knowledgeContext
    ? `\n\n=== KNOWLEDGE BASE ===\nThe following knowledge will help you understand the system and context:\n\n${knowledgeContext}\n=== END KNOWLEDGE BASE ===\n\n`
    : ''

  if (activeNote) {
    systemPrompt = `You are an AI assistant in AgentPM, helping the user work on their note titled "${activeNote.title}".
${knowledgeSection}
YOUR PRIMARY FOCUS: The user is currently working on the note below. Help them brainstorm ideas, expand on concepts, suggest features, answer questions about this content, or help in any way they need.

== CURRENT NOTE: "${activeNote.title}" ==
${activeNote.content}
== END OF CURRENT NOTE ==

CAPABILITIES:
- You CAN search the web using the web_search tool to find current information, tools, services, products, or anything requiring up-to-date knowledge
- You CAN update the current note using the update_current_note tool
- You CAN append content to the current note using the append_to_note tool
- You CAN create new notes using the create_new_note tool
- You CAN create tasks using the create_task tool when the user wants to track action items
- When the user asks you to "add this", "update the note", "write this down", etc., USE THE TOOLS to actually modify the note
- For append_to_note, just include the NEW content to add - it will be appended to the existing content
- When the user asks to "create a task", "add to my to-do list", "track this", etc., use the create_task tool

WHEN TO SEARCH:
- When asked about tools, services, products, or skills in a specific domain
- When asked about current events or recent information
- When asked to find or research something on the internet
- When you don't have enough knowledge to answer accurately

WHEN TO CREATE TASKS:
- When the user explicitly asks to create a task or to-do item
- When discussing action items that need to be tracked
- When the user says "let's do this" or "we should do this" about a specific action

Be helpful, creative, and proactive. If they ask a general question, relate it back to what they're working on when relevant. Suggest ideas, point out potential improvements, and help them develop their thoughts.`
  } else {
    systemPrompt = `You are an AI assistant in AgentPM. The user doesn't have a note open right now.
${knowledgeSection}
Be helpful, concise, and accurate.

CAPABILITIES:
- You CAN search the web using the web_search tool to find current information
- You CAN create new notes using the create_new_note tool if the user asks
- You CAN create tasks using the create_task tool when the user wants to track action items

WHEN TO SEARCH:
- When asked about tools, services, products, or skills in a specific domain
- When asked about current events or recent information
- When asked to find or research something on the internet
- When you don't have enough knowledge to answer accurately

WHEN TO CREATE TASKS:
- When the user explicitly asks to create a task or to-do item
- When discussing action items that need to be tracked

To help with a specific note, ask the user to open it first.`
  }

  // Resolve LLM config
  const resolved = await resolveLLMConfig('chat-assistant')
  if (!resolved.config) {
    throw new Error(resolved.error || 'No LLM API key configured')
  }

  const adapter = createLLMAdapter(resolved.config)

  // Build tools array - always include web search and task creation
  const localTools = activeNote
    ? [WEB_SEARCH_TOOL, TASK_TOOL, ...NOTE_TOOLS]
    : [WEB_SEARCH_TOOL, TASK_TOOL, ...NOTE_TOOLS.filter(t => t.name === 'create_new_note')]

  const llmTools = toLLMTools(localTools)

  // Build messages array for API
  const apiMessages: LLMMessage[] = [
    ...chatHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : m.content.map((b: ContentBlock) => ({
        type: b.type as LLMContentBlock['type'],
        text: b.text || b.content,
        toolCallId: b.id || b.tool_use_id,
        toolName: b.name,
        toolInput: b.input,
        isError: false,
      })),
    })),
    { role: 'user' as const, content: userMessage },
  ]

  let textResponse = ''
  let noteUpdated = false
  let noteCreated = false
  let webSearchUsed = false
  let taskCreated = false
  let iterationCount = 0
  const maxIterations = 5

  // Tool use loop
  while (iterationCount < maxIterations) {
    iterationCount++
    onStatusChange?.('thinking')

    const response = await adapter.chat(apiMessages, {
      system: systemPrompt,
      tools: llmTools,
      maxTokens: 4096,
    })

    // Collect tool uses and text from this response
    const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        textResponse += block.text
      } else if (block.type === 'tool_use' && block.toolCallId && block.toolName && block.toolInput) {
        toolUses.push({ id: block.toolCallId, name: block.toolName, input: block.toolInput })
      }
    }

    // If no tool use, we're done
    if (response.stopReason !== 'tool_use' || toolUses.length === 0) {
      break
    }

    // Process tool uses and collect results
    const toolResults: LLMContentBlock[] = []

    for (const toolUse of toolUses) {
      let toolResult = ''

      try {
        if (toolUse.name === 'web_search') {
          const query = toolUse.input.query as string
          webSearchUsed = true
          onStatusChange?.('searching')
          const searchResults = await performWebSearch(query)

          if (searchResults.length > 0) {
            toolResult = `Search results for "${query}":\n\n` +
              searchResults.map((r, i) =>
                `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}${r.age ? ` (${r.age})` : ''}`
              ).join('\n\n')
          } else {
            toolResult = `No results found for "${query}". Try a different search query.`
          }
        } else if (toolUse.name === 'update_current_note' && noteCallbacks) {
          onStatusChange?.('updating-note')
          const content = toolUse.input.content as string
          const title = toolUse.input.title as string | undefined
          await noteCallbacks.updateCurrentNote(content, title)
          noteUpdated = true
          toolResult = 'Note updated successfully.'
        } else if (toolUse.name === 'create_new_note' && noteCallbacks) {
          onStatusChange?.('updating-note')
          const title = toolUse.input.title as string
          const content = toolUse.input.content as string
          await noteCallbacks.createNewNote(title, content)
          noteCreated = true
          toolResult = `New note "${title}" created successfully.`
        } else if (toolUse.name === 'append_to_note' && noteCallbacks) {
          onStatusChange?.('updating-note')
          const content = toolUse.input.content as string
          await noteCallbacks.appendToNote(content)
          noteUpdated = true
          toolResult = 'Content appended to note successfully.'
        } else if (toolUse.name === 'create_task' && noteCallbacks?.createTask) {
          onStatusChange?.('creating-task')
          const taskData = {
            title: toolUse.input.title as string,
            description: toolUse.input.description as string | undefined,
            priority: toolUse.input.priority as string | undefined,
          }
          const createdTask = await noteCallbacks.createTask(taskData)
          taskCreated = true
          toolResult = `Task "${createdTask.title}" created successfully (ID: ${createdTask.id}).`
        } else if (toolUse.name === 'create_task' && !noteCallbacks?.createTask) {
          toolResult = 'Task creation is not available in this context. The task tool requires proper callbacks to be set up.'
        } else {
          toolResult = `Tool ${toolUse.name} not available.`
        }
      } catch (err) {
        console.error('Tool execution error:', err)
        toolResult = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      }

      toolResults.push({
        type: 'tool_result',
        toolCallId: toolUse.id,
        text: toolResult,
      })
    }

    // Add assistant response and tool results to messages for next iteration
    apiMessages.push({
      role: 'assistant',
      content: response.content,
    })
    apiMessages.push({
      role: 'user',
      content: toolResults,
    })
  }

  // If only tool use happened, add a confirmation message
  if (!textResponse && (noteUpdated || noteCreated || taskCreated)) {
    const actions: string[] = []
    if (noteUpdated) actions.push('updated your note')
    if (noteCreated) actions.push('created a new note')
    if (taskCreated) actions.push('created a task')

    if (actions.length > 0) {
      textResponse = `Done! I've ${actions.join(' and ')}.`
    }
  }

  return { response: textResponse, noteUpdated, noteCreated, webSearchUsed, taskCreated }
}

// Tag suggestions
export async function suggestTags(noteContent: string): Promise<string[]> {
  const systemPrompt = `You are a tag suggestion system. Given note content, suggest 3-5 relevant tags.
Output ONLY a JSON array of strings, nothing else. Example: ["work", "ideas", "project-alpha"]`

  const result = await callClaude(
    [{ role: 'user', content: `Suggest tags for this note:\n\n${noteContent}` }],
    systemPrompt
  )

  try {
    return JSON.parse(result)
  } catch {
    return []
  }
}
