// Skills Builder Modal - AI-assisted skill creation
// Chat interface for creating and customizing skills

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Send,
  Sparkles,
  Loader2,
  User,
  Bot,
  AlertCircle,
  Play,
  Save,
  Search,
  Copy,
  GitFork,
} from 'lucide-react'
import { callClaude, isAnthropicConfigured } from '@/services/ai/anthropic'
import type { Skill, SkillBuilderMessage } from '@/types/agentpm'

interface SkillsBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (skill: { name: string; description: string; content: string; forkedFrom?: string; builderConversation: SkillBuilderMessage[] }) => Promise<void>
  officialSkills?: Skill[] // @fun/ skills for discovery
  editingSkill?: Skill | null // Skill being edited (for "Edit" flow)
  baseSkill?: Skill | null // Skill being customized (for "Customize" flow)
}

interface SearchResult {
  skill: Skill
  relevance: number
}

// System prompt for the skill builder AI
const SKILL_BUILDER_SYSTEM_PROMPT = `You are a Skills Builder assistant that helps users create custom AI skills for their workflow.

A skill is a set of instructions that guides Claude to complete a specific task. Good skills include:
- Clear description of when to use the skill
- Step-by-step instructions
- Expected output format
- Examples when helpful

Your job is to:
1. Understand what the user wants to accomplish
2. Ask 2-3 clarifying questions if needed
3. Generate a complete skill in markdown format

When generating a skill, use this structure:
\`\`\`markdown
---
name: skill-slug
description: One-line description
version: 1.0.0
tags: [tag1, tag2]
---

# Skill Name

## When to Use This Skill

- Use case 1
- Use case 2

## Instructions

Step-by-step instructions for Claude...

## Output Format

Description of expected output...

## Examples (optional)

### Example 1
Input: ...
Output: ...
\`\`\`

Be conversational but efficient. Help users quickly get to a working skill.`

export function SkillsBuilderModal({
  isOpen,
  onClose,
  onSave,
  officialSkills = [],
  editingSkill,
  baseSkill,
}: SkillsBuilderModalProps) {
  // Chat state
  const [messages, setMessages] = useState<SkillBuilderMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Preview state
  const [skillPreview, setSkillPreview] = useState<{
    name: string
    description: string
    content: string
  } | null>(null)

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedBase, setSelectedBase] = useState<Skill | null>(baseSkill || null)

  // Test state
  const [testInput, setTestInput] = useState('')
  const [testOutput, setTestOutput] = useState('')
  const [testing, setTesting] = useState(false)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Initialize with editing skill or base skill
  useEffect(() => {
    if (isOpen) {
      if (editingSkill) {
        // Restore conversation if editing
        setMessages(editingSkill.builderConversation || [])
        setSkillPreview({
          name: editingSkill.name,
          description: editingSkill.description || '',
          content: editingSkill.content,
        })
      } else if (baseSkill) {
        // Start with customization prompt
        setSelectedBase(baseSkill)
        setMessages([
          {
            role: 'assistant',
            content: `I see you want to customize the **${baseSkill.name}** skill. What changes would you like to make?\n\nCommon customizations:\n- Adapt it for your specific tools/workflow\n- Change the output format\n- Add or remove steps\n- Focus on specific use cases`,
          },
        ])
        setSkillPreview({
          name: `my-${baseSkill.name}`,
          description: baseSkill.description || '',
          content: baseSkill.content,
        })
      } else {
        // Fresh start
        setMessages([
          {
            role: 'assistant',
            content: `Welcome to Skills Builder! 🛠️\n\nI'll help you create a custom skill. What would you like your skill to do?\n\nFor example:\n- "Help me write technical documentation"\n- "Create meeting notes with action items"\n- "Generate social media posts from content"`,
          },
        ])
      }

      // Focus input after modal opens
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, editingSkill, baseSkill])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Search for relevant official skills
  const searchSkills = useCallback(
    (query: string) => {
      if (!query.trim() || officialSkills.length === 0) {
        setSearchResults([])
        return
      }

      const queryLower = query.toLowerCase()
      const results: SearchResult[] = officialSkills
        .map((skill) => {
          let relevance = 0
          const nameLower = skill.name.toLowerCase()
          const descLower = (skill.description || '').toLowerCase()

          // Name match is most relevant
          if (nameLower.includes(queryLower)) relevance += 3
          // Description match
          if (descLower.includes(queryLower)) relevance += 2
          // Tag match
          if (skill.tags.some((tag) => tag.toLowerCase().includes(queryLower))) relevance += 1

          return { skill, relevance }
        })
        .filter((r) => r.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 3)

      setSearchResults(results)
    },
    [officialSkills]
  )

  // Parse skill from AI response
  const parseSkillFromResponse = (response: string): { name: string; description: string; content: string } | null => {
    // Look for markdown code block with frontmatter
    const codeBlockMatch = response.match(/```(?:markdown)?\s*\n(---[\s\S]*?)```/i)
    if (codeBlockMatch) {
      const skillContent = codeBlockMatch[1]

      // Parse frontmatter
      const frontmatterMatch = skillContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
      if (frontmatterMatch) {
        const [, frontmatter] = frontmatterMatch
        let name = 'custom-skill'
        let description = ''

        // Extract name and description from frontmatter
        const nameMatch = frontmatter.match(/name:\s*(.+)/)
        if (nameMatch) name = nameMatch[1].trim()

        const descMatch = frontmatter.match(/description:\s*(.+)/)
        if (descMatch) description = descMatch[1].trim()

        return {
          name,
          description,
          content: skillContent,
        }
      }
    }

    return null
  }

  // Handle sending a message
  const handleSend = async () => {
    if (!input.trim() || loading) return

    if (!isAnthropicConfigured()) {
      setError('Please configure your Anthropic API key to use Skills Builder.')
      return
    }

    const userMessage: SkillBuilderMessage = {
      role: 'user',
      content: input.trim(),
    }

    // Search for relevant skills on first user message
    if (messages.length === 1) {
      searchSkills(input.trim())
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setError(null)
    setLoading(true)

    try {
      // Build context for AI
      let systemPrompt = SKILL_BUILDER_SYSTEM_PROMPT

      // Add base skill context if customizing
      if (selectedBase) {
        systemPrompt += `\n\nThe user is customizing this existing skill:\n\`\`\`\n${selectedBase.content}\n\`\`\`\n\nHelp them modify it based on their requests. Output the full updated skill when making changes.`
      }

      const chatHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const response = await callClaude(
        [...chatHistory, { role: 'user', content: userMessage.content }],
        systemPrompt
      )

      const assistantMessage: SkillBuilderMessage = {
        role: 'assistant',
        content: response,
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Try to extract skill from response
      const parsedSkill = parseSkillFromResponse(response)
      if (parsedSkill) {
        setSkillPreview(parsedSkill)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response')
    } finally {
      setLoading(false)
    }
  }

  // Handle using a skill as base
  const handleUseAsBase = (skill: Skill) => {
    setSelectedBase(skill)
    setSearchResults([])
    setSkillPreview({
      name: `my-${skill.name}`,
      description: skill.description || '',
      content: skill.content,
    })
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `Great choice! I've loaded **${skill.name}** as a starting point. What would you like to customize?`,
      },
    ])
  }

  // Test the skill
  const handleTest = async () => {
    if (!testInput.trim() || !skillPreview || testing) return

    if (!isAnthropicConfigured()) {
      setError('Please configure your Anthropic API key to test skills.')
      return
    }

    setTesting(true)
    setTestOutput('')
    setError(null)

    try {
      const response = await callClaude(
        [{ role: 'user', content: testInput.trim() }],
        skillPreview.content
      )
      setTestOutput(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test skill')
    } finally {
      setTesting(false)
    }
  }

  // Save the skill
  const handleSave = async () => {
    if (!skillPreview) return

    try {
      await onSave({
        name: skillPreview.name,
        description: skillPreview.description,
        content: skillPreview.content,
        forkedFrom: selectedBase?.id,
        builderConversation: messages,
      })
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skill')
    }
  }

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Close and reset
  const handleClose = () => {
    setMessages([])
    setInput('')
    setError(null)
    setSkillPreview(null)
    setSearchResults([])
    setSelectedBase(null)
    setTestInput('')
    setTestOutput('')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Modal Container - Flexbox centering */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-5xl h-[80vh] bg-white dark:bg-surface-800 rounded-xl shadow-xl flex flex-col overflow-hidden pointer-events-auto">
              {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700 bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40">
                  <Sparkles size={20} className="text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                    Skills Builder
                  </h2>
                  <p className="text-sm text-surface-500">
                    {editingSkill
                      ? `Editing: ${editingSkill.name}`
                      : selectedBase
                      ? `Customizing: ${selectedBase.name}`
                      : 'Create a custom skill with AI'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content - Two panels */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Panel - Chat */}
              <div className="flex-1 flex flex-col border-r border-surface-200 dark:border-surface-700">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex gap-3 ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center">
                          <Bot size={16} className="text-white" />
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                          message.role === 'user'
                            ? 'bg-primary-500 text-white rounded-tr-sm'
                            : 'bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-surface-100 rounded-tl-sm'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === 'user' && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-200 dark:bg-surface-600 flex items-center justify-center">
                          <User size={16} className="text-surface-600 dark:text-surface-400" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="bg-surface-50 dark:bg-surface-700/50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400 mb-3">
                        <Search size={14} />
                        <span>Found similar skills:</span>
                      </div>
                      <div className="space-y-2">
                        {searchResults.map(({ skill }) => (
                          <div
                            key={skill.id}
                            className="flex items-center justify-between p-3 bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-600"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-surface-900 dark:text-surface-100">
                                @fun/{skill.name}
                              </div>
                              <div className="text-xs text-surface-500 truncate">
                                {skill.description}
                              </div>
                            </div>
                            <button
                              onClick={() => handleUseAsBase(skill)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                            >
                              <GitFork size={14} />
                              Use as Base
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setSearchResults([])}
                        className="text-xs text-surface-500 hover:text-surface-700 mt-2"
                      >
                        Start from scratch instead
                      </button>
                    </div>
                  )}

                  {/* Loading */}
                  {loading && (
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center">
                        <Bot size={16} className="text-white" />
                      </div>
                      <div className="bg-surface-100 dark:bg-surface-700 rounded-2xl rounded-tl-sm px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin text-primary-500" />
                          <span className="text-sm text-surface-500">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
                      <AlertCircle size={16} />
                      <p className="text-sm">{error}</p>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t border-surface-200 dark:border-surface-700">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe what you want your skill to do..."
                      rows={2}
                      className="flex-1 px-4 py-2.5 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || loading}
                      className="p-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-surface-300 dark:disabled:bg-surface-600 text-white rounded-xl transition-colors disabled:cursor-not-allowed"
                    >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Panel - Preview */}
              <div className="w-96 flex flex-col bg-surface-50 dark:bg-surface-900">
                <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-700">
                  <h3 className="font-medium text-surface-900 dark:text-surface-100">Preview</h3>
                </div>

                {skillPreview ? (
                  <>
                    {/* Skill Preview */}
                    <div className="flex-1 overflow-y-auto p-4">
                      <div className="space-y-4">
                        {/* Name & Description */}
                        <div>
                          <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1">
                            Name
                          </label>
                          <input
                            type="text"
                            value={skillPreview.name}
                            onChange={(e) =>
                              setSkillPreview({ ...skillPreview, name: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={skillPreview.description}
                            onChange={(e) =>
                              setSkillPreview({ ...skillPreview, description: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>

                        {/* Content Preview */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider">
                              Content
                            </label>
                            <button
                              onClick={() => navigator.clipboard.writeText(skillPreview.content)}
                              className="text-xs text-surface-500 hover:text-primary-500 flex items-center gap-1"
                            >
                              <Copy size={12} />
                              Copy
                            </button>
                          </div>
                          <pre className="w-full p-3 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {skillPreview.content}
                          </pre>
                        </div>

                        {/* Test Section */}
                        <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
                          <h4 className="font-medium text-sm text-surface-900 dark:text-surface-100 mb-2">
                            Test Your Skill
                          </h4>
                          <textarea
                            value={testInput}
                            onChange={(e) => setTestInput(e.target.value)}
                            placeholder="Enter a test prompt..."
                            rows={2}
                            className="w-full px-3 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2"
                          />
                          <button
                            onClick={handleTest}
                            disabled={!testInput.trim() || testing}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {testing ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Play size={14} />
                            )}
                            Run Test
                          </button>

                          {testOutput && (
                            <div className="mt-3">
                              <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1">
                                Output
                              </label>
                              <pre className="w-full p-3 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                                {testOutput}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="p-4 border-t border-surface-200 dark:border-surface-700">
                      <button
                        onClick={handleSave}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
                      >
                        <Save size={16} />
                        Save Skill
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center p-6">
                    <div>
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                        <Sparkles size={24} className="text-surface-400" />
                      </div>
                      <p className="text-sm text-surface-500">
                        Your skill preview will appear here as you create it.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
