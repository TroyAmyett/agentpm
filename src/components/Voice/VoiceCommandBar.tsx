import { useState, useCallback } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { VoiceInput } from './VoiceInput'

// Voice command types based on PRD
export interface ParsedVoiceCommand {
  intent: 'create_task' | 'create_note' | 'status_query' | 'run_agent' | 'switch_account' | 'unknown'
  project?: string
  taskType?: string
  title?: string
  agent?: string
  config?: Record<string, unknown>
  rawText: string
}

interface VoiceCommandBarProps {
  onCommand: (command: ParsedVoiceCommand) => void
  onError?: (error: string) => void
  projects?: { id: string; name: string }[]
  agents?: { id: string; alias: string; agentType: string }[]
  accounts?: { id: string; name: string }[]
  className?: string
}

// Simple command parser (in production, this would use Claude for NLP)
function parseVoiceCommand(
  text: string,
  projects: { id: string; name: string }[] = [],
  agents: { id: string; alias: string; agentType: string }[] = [],
  accounts: { id: string; name: string }[] = []
): ParsedVoiceCommand {
  const lowerText = text.toLowerCase()

  // Create task patterns - explicit "task" commands
  const taskPatterns = [
    /add (?:a )?task (?:to (?:the )?)?(.+?)(?:project)? (?:to |for )?(.+)/i,
    /create (?:a )?task (?:to |for )?(.+)/i,
    /new task[:\s]+(.+)/i,
  ]

  // Implicit task patterns - actions that imply a task
  const implicitTaskPatterns = [
    /(?:create|write|make) (?:a |an )?(?:blog ?post|article|post) (?:about |on |for )?(.+)/i,
    /(?:write|draft) (?:a |an )?(.+)/i,
    /(?:create|make|generate|design) (?:a |an )?(?:image|graphic|visual|logo|banner) (?:of |for |about )?(.+)/i,
    /(?:research|investigate|look into|find out about) (.+)/i,
    /(?:analyze|review|audit) (.+)/i,
  ]

  // Check explicit task patterns first
  for (const pattern of taskPatterns) {
    const match = text.match(pattern)
    if (match) {
      let projectName: string | undefined
      for (const project of projects) {
        if (lowerText.includes(project.name.toLowerCase())) {
          projectName = project.name
          break
        }
      }

      let taskType = 'generic'
      if (lowerText.includes('blog') || lowerText.includes('write') || lowerText.includes('article')) {
        taskType = 'blog_post'
      } else if (lowerText.includes('image') || lowerText.includes('visual') || lowerText.includes('graphic')) {
        taskType = 'image'
      } else if (lowerText.includes('research') || lowerText.includes('investigate')) {
        taskType = 'research'
      }

      return {
        intent: 'create_task',
        project: projectName,
        taskType,
        title: match[match.length - 1]?.trim(),
        rawText: text,
      }
    }
  }

  // Check implicit task patterns (e.g., "create a blog post about...")
  for (const pattern of implicitTaskPatterns) {
    const match = text.match(pattern)
    if (match) {
      let projectName: string | undefined
      for (const project of projects) {
        if (lowerText.includes(project.name.toLowerCase())) {
          projectName = project.name
          break
        }
      }

      let taskType = 'generic'
      if (lowerText.includes('blog') || lowerText.includes('article') || lowerText.includes('post')) {
        taskType = 'blog_post'
      } else if (lowerText.includes('image') || lowerText.includes('visual') || lowerText.includes('graphic') || lowerText.includes('logo') || lowerText.includes('banner')) {
        taskType = 'image'
      } else if (lowerText.includes('research') || lowerText.includes('investigate') || lowerText.includes('find out')) {
        taskType = 'research'
      } else if (lowerText.includes('analyze') || lowerText.includes('review') || lowerText.includes('audit')) {
        taskType = 'analysis'
      }

      // Use the full text as title for implicit commands
      return {
        intent: 'create_task',
        project: projectName,
        taskType,
        title: text.trim(),
        rawText: text,
      }
    }
  }

  // Create note patterns
  const notePatterns = [
    /new note (?:about )?(.+)/i,
    /create (?:a )?note[:\s]+(.+)/i,
    /note[:\s]+(.+)/i,
  ]

  for (const pattern of notePatterns) {
    const match = text.match(pattern)
    if (match) {
      return {
        intent: 'create_note',
        title: match[1]?.trim(),
        rawText: text,
      }
    }
  }

  // Status query patterns
  const statusPatterns = [
    /(?:what(?:'s| is) )?(?:the )?status (?:of )?(.+)/i,
    /how (?:is |are )(.+)(?: doing)?/i,
    /show (?:me )?(.+)(?:project)?/i,
  ]

  for (const pattern of statusPatterns) {
    const match = text.match(pattern)
    if (match) {
      let projectName: string | undefined
      for (const project of projects) {
        if (lowerText.includes(project.name.toLowerCase())) {
          projectName = project.name
          break
        }
      }

      return {
        intent: 'status_query',
        project: projectName,
        rawText: text,
      }
    }
  }

  // Run agent patterns
  const agentPatterns = [
    /run (?:the )?(.+?)(?:agent)?$/i,
    /start (?:the )?(.+?)(?:agent)?$/i,
    /trigger (?:the )?(.+?)(?:agent)?$/i,
  ]

  for (const pattern of agentPatterns) {
    const match = text.match(pattern)
    if (match) {
      let agentMatch: { alias: string; agentType: string } | undefined
      for (const agent of agents) {
        if (
          lowerText.includes(agent.alias.toLowerCase()) ||
          lowerText.includes(agent.agentType.toLowerCase())
        ) {
          agentMatch = agent
          break
        }
      }

      return {
        intent: 'run_agent',
        agent: agentMatch?.alias || match[1]?.trim(),
        rawText: text,
      }
    }
  }

  // Switch account patterns
  const accountPatterns = [
    /switch to (.+)/i,
    /change (?:to |account (?:to )?)(.+)/i,
  ]

  for (const pattern of accountPatterns) {
    const match = text.match(pattern)
    if (match) {
      let accountName: string | undefined
      for (const account of accounts) {
        if (lowerText.includes(account.name.toLowerCase())) {
          accountName = account.name
          break
        }
      }

      return {
        intent: 'switch_account',
        title: accountName || match[1]?.trim(),
        rawText: text,
      }
    }
  }

  // Unknown intent
  return {
    intent: 'unknown',
    rawText: text,
  }
}

export function VoiceCommandBar({
  onCommand,
  onError,
  projects = [],
  agents = [],
  accounts = [],
  className = '',
}: VoiceCommandBarProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastCommand, setLastCommand] = useState<ParsedVoiceCommand | null>(null)

  const handleTranscript = useCallback(
    async (text: string) => {
      setIsProcessing(true)

      try {
        // Parse the voice command
        const command = parseVoiceCommand(text, projects, agents, accounts)
        setLastCommand(command)

        // In production, you could send to Claude for better NLP here
        // const enhancedCommand = await parseWithClaude(text, projects, agents)

        onCommand(command)
      } catch (error) {
        onError?.(`Failed to process command: ${error}`)
      } finally {
        setIsProcessing(false)
      }
    },
    [projects, agents, accounts, onCommand, onError]
  )

  const getIntentLabel = (intent: ParsedVoiceCommand['intent']) => {
    switch (intent) {
      case 'create_task':
        return 'Create Task'
      case 'create_note':
        return 'Create Note'
      case 'status_query':
        return 'Status Query'
      case 'run_agent':
        return 'Run Agent'
      case 'switch_account':
        return 'Switch Account'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <VoiceInput
        onTranscript={handleTranscript}
        onError={onError}
        placeholder="Add a task to write a blog post about..."
      />

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--fl-color-primary)' }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Processing command...</span>
        </div>
      )}

      {/* Last command result */}
      {lastCommand && !isProcessing && (
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4" style={{ color: 'var(--fl-color-primary)' }} />
          <span style={{ color: 'var(--fl-color-text-muted)' }}>Detected:</span>
          <span className="font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
            {getIntentLabel(lastCommand.intent)}
          </span>
          {lastCommand.project && (
            <span style={{ color: 'var(--fl-color-text-muted)' }}>
              in {lastCommand.project}
            </span>
          )}
          {lastCommand.agent && (
            <span style={{ color: 'var(--fl-color-text-muted)' }}>
              ({lastCommand.agent})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default VoiceCommandBar
