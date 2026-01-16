const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
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

// Chat with notes
export async function chatWithNotes(
  userMessage: string,
  notesContext: string,
  chatHistory: AnthropicMessage[]
): Promise<string> {
  const systemPrompt = `You are an AI assistant that helps users understand and work with their notes.
You have access to the user's notes for context. Answer questions based on the notes when relevant.
Be helpful, concise, and accurate. If you don't know something or it's not in the notes, say so.

Here are the user's notes for context:
${notesContext}`

  const messages: AnthropicMessage[] = [
    ...chatHistory,
    { role: 'user', content: userMessage },
  ]

  return callClaude(messages, systemPrompt)
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
