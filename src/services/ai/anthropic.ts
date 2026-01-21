const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string

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

interface AnthropicResponse {
  content: ContentBlock[]
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens'
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

// Callbacks for note operations - will be set by ChatPanel
export type NoteOperationCallbacks = {
  updateCurrentNote: (content: string, title?: string) => Promise<void>
  createNewNote: (title: string, content: string) => Promise<void>
  appendToNote: (content: string) => Promise<void>
  getCurrentNoteContent: () => string
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

export const isAnthropicConfigured = () => !!ANTHROPIC_API_KEY

export async function callClaude(
  messages: AnthropicMessage[],
  systemPrompt?: string
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt || 'You are a helpful AI assistant integrated into a note-taking app. Be concise and helpful.',
      messages,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to call Claude API')
  }

  const data: AnthropicResponse = await response.json()
  return data.content[0]?.text || ''
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
export type ChatStatusCallback = (status: 'thinking' | 'searching' | 'updating-note') => void

// Chat with notes - prioritizes the active note for context and can edit notes
export async function chatWithNotes(
  userMessage: string,
  activeNote: { title: string; content: string; id: string } | null,
  otherNotesContext: string,
  chatHistory: AnthropicMessage[],
  onStatusChange?: ChatStatusCallback
): Promise<{ response: string; noteUpdated?: boolean; noteCreated?: boolean; webSearchUsed?: boolean }> {
  let systemPrompt: string

  if (activeNote) {
    // User has a note open - focus on helping with that note
    systemPrompt = `You are an AI assistant helping the user work on their note titled "${activeNote.title}".

YOUR PRIMARY FOCUS: The user is currently working on the note below. Help them brainstorm ideas, expand on concepts, suggest features, answer questions about this content, or help in any way they need.

== CURRENT NOTE: "${activeNote.title}" ==
${activeNote.content}
== END OF CURRENT NOTE ==

${otherNotesContext ? `You also have access to their other notes for additional context if needed:\n${otherNotesContext}` : ''}

CAPABILITIES:
- You CAN search the web using the web_search tool to find current information, tools, services, products, or anything requiring up-to-date knowledge
- You CAN update the current note using the update_current_note tool
- You CAN append content to the current note using the append_to_note tool
- You CAN create new notes using the create_new_note tool
- When the user asks you to "add this", "update the note", "write this down", etc., USE THE TOOLS to actually modify the note
- For append_to_note, just include the NEW content to add - it will be appended to the existing content

WHEN TO SEARCH:
- When asked about tools, services, products, or skills in a specific domain
- When asked about current events or recent information
- When asked to find or research something on the internet
- When you don't have enough knowledge to answer accurately

Be helpful, creative, and proactive. If they ask a general question, relate it back to what they're working on when relevant. Suggest ideas, point out potential improvements, and help them develop their thoughts.`
  } else {
    // No active note - general notes assistant
    systemPrompt = `You are an AI assistant that helps users understand and work with their notes.
You have access to the user's notes for context. Answer questions based on the notes when relevant.
Be helpful, concise, and accurate. If you don't know something or it's not in the notes, say so.

CAPABILITIES:
- You CAN search the web using the web_search tool to find current information
- You CAN create new notes using the create_new_note tool if the user asks

WHEN TO SEARCH:
- When asked about tools, services, products, or skills in a specific domain
- When asked about current events or recent information
- When asked to find or research something on the internet
- When you don't have enough knowledge to answer accurately

Here are the user's notes for context:
${otherNotesContext}`
  }

  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured')
  }

  // Build tools array - always include web search
  const tools = activeNote
    ? [WEB_SEARCH_TOOL, ...NOTE_TOOLS]
    : [WEB_SEARCH_TOOL, ...NOTE_TOOLS.filter(t => t.name === 'create_new_note')]

  // Build messages array for API - this will be mutated during tool use loop
  const apiMessages: Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }> = [
    ...chatHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ]

  let textResponse = ''
  let noteUpdated = false
  let noteCreated = false
  let webSearchUsed = false
  let iterationCount = 0
  const maxIterations = 5 // Prevent infinite loops

  // Tool use loop - continue until Claude finishes or we hit max iterations
  while (iterationCount < maxIterations) {
    iterationCount++
    onStatusChange?.('thinking')

    // Call Claude with tools
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: apiMessages,
        tools,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Failed to call Claude API')
    }

    const data: AnthropicResponse = await response.json()

    // Collect tool uses and text from this response
    const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

    for (const block of data.content) {
      if (block.type === 'text' && block.text) {
        textResponse += block.text
      } else if (block.type === 'tool_use' && block.id && block.name && block.input) {
        toolUses.push({ id: block.id, name: block.name, input: block.input })
      }
    }

    // If no tool use, we're done
    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
      break
    }

    // Process tool uses and collect results
    const toolResults: ContentBlock[] = []

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
        } else {
          toolResult = `Tool ${toolUse.name} not available.`
        }
      } catch (err) {
        console.error('Tool execution error:', err)
        toolResult = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: toolResult,
      })
    }

    // Add assistant response and tool results to messages for next iteration
    apiMessages.push({
      role: 'assistant',
      content: data.content,
    })
    apiMessages.push({
      role: 'user',
      content: toolResults,
    })
  }

  // If only tool use happened, add a confirmation message
  if (!textResponse && (noteUpdated || noteCreated)) {
    if (noteUpdated) {
      textResponse = "Done! I've updated your note."
    } else if (noteCreated) {
      textResponse = "Done! I've created a new note for you."
    }
  }

  return { response: textResponse, noteUpdated, noteCreated, webSearchUsed }
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
