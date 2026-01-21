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

// Chat with notes - prioritizes the active note for context and can edit notes
export async function chatWithNotes(
  userMessage: string,
  activeNote: { title: string; content: string; id: string } | null,
  otherNotesContext: string,
  chatHistory: AnthropicMessage[]
): Promise<{ response: string; noteUpdated?: boolean; noteCreated?: boolean }> {
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
- You CAN update the current note using the update_current_note tool
- You CAN append content to the current note using the append_to_note tool
- You CAN create new notes using the create_new_note tool
- When the user asks you to "add this", "update the note", "write this down", etc., USE THE TOOLS to actually modify the note
- For append_to_note, just include the NEW content to add - it will be appended to the existing content

Be helpful, creative, and proactive. If they ask a general question, relate it back to what they're working on when relevant. Suggest ideas, point out potential improvements, and help them develop their thoughts.`
  } else {
    // No active note - general notes assistant
    systemPrompt = `You are an AI assistant that helps users understand and work with their notes.
You have access to the user's notes for context. Answer questions based on the notes when relevant.
Be helpful, concise, and accurate. If you don't know something or it's not in the notes, say so.

You CAN create new notes using the create_new_note tool if the user asks.

Here are the user's notes for context:
${otherNotesContext}`
  }

  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured')
  }

  // Build messages array for API
  const apiMessages = [
    ...chatHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ]

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
      tools: activeNote ? NOTE_TOOLS : NOTE_TOOLS.filter(t => t.name === 'create_new_note'),
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to call Claude API')
  }

  const data: AnthropicResponse = await response.json()

  let textResponse = ''
  let noteUpdated = false
  let noteCreated = false

  // Process response content
  for (const block of data.content) {
    if (block.type === 'text' && block.text) {
      textResponse += block.text
    } else if (block.type === 'tool_use' && noteCallbacks) {
      // Handle tool calls
      try {
        if (block.name === 'update_current_note' && block.input) {
          const content = block.input.content as string
          const title = block.input.title as string | undefined
          await noteCallbacks.updateCurrentNote(content, title)
          noteUpdated = true
        } else if (block.name === 'create_new_note' && block.input) {
          const title = block.input.title as string
          const content = block.input.content as string
          await noteCallbacks.createNewNote(title, content)
          noteCreated = true
        } else if (block.name === 'append_to_note' && block.input) {
          const content = block.input.content as string
          await noteCallbacks.appendToNote(content)
          noteUpdated = true
        }
      } catch (err) {
        console.error('Tool execution error:', err)
        textResponse += `\n\n(Note: I tried to update the note but encountered an error: ${err instanceof Error ? err.message : 'Unknown error'})`
      }
    }
  }

  // If only tool use happened, add a confirmation message
  if (!textResponse && (noteUpdated || noteCreated)) {
    if (noteUpdated) {
      textResponse = "Done! I've updated your note."
    } else if (noteCreated) {
      textResponse = "Done! I've created a new note for you."
    }
  }

  return { response: textResponse, noteUpdated, noteCreated }
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
