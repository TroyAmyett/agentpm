import { useState } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { performAIAction, AI_ACTIONS, isAnthropicConfigured, type AIActionType } from '@/services/ai/anthropic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  PenLine,
  ListCollapse,
  Expand,
  Minimize2,
  Check,
  MessageCircle,
  Loader2,
  X,
} from 'lucide-react'

interface AIToolbarProps {
  onInsert: (text: string) => void
  onReplace: (text: string) => void
}

const actionIcons: Record<AIActionType, React.ReactNode> = {
  continue: <PenLine size={16} />,
  improve: <Sparkles size={16} />,
  summarize: <ListCollapse size={16} />,
  expand: <Expand size={16} />,
  simplify: <Minimize2 size={16} />,
  fixGrammar: <Check size={16} />,
  changeTone: <MessageCircle size={16} />,
}

export function AIToolbar({ onInsert, onReplace }: AIToolbarProps) {
  const { aiToolbarPosition, selectedText, hideAIToolbar } = useUIStore()
  const [loading, setLoading] = useState<AIActionType | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAction = async (actionType: AIActionType) => {
    if (!isAnthropicConfigured()) {
      setError('Please configure your Anthropic API key in the environment variables.')
      return
    }

    setLoading(actionType)
    setError(null)
    setResult(null)

    try {
      const response = await performAIAction(actionType, selectedText)
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI request failed')
    } finally {
      setLoading(null)
    }
  }

  const handleInsert = () => {
    if (result) {
      onInsert('\n\n' + result)
      resetAndClose()
    }
  }

  const handleReplace = () => {
    if (result) {
      onReplace(result)
      resetAndClose()
    }
  }

  const resetAndClose = () => {
    setResult(null)
    setError(null)
    hideAIToolbar()
  }

  if (!aiToolbarPosition || !selectedText) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="fixed z-50 bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden"
        style={{
          left: Math.min(aiToolbarPosition.x, window.innerWidth - 400),
          top: Math.max(aiToolbarPosition.y, 60),
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/30 dark:to-purple-900/30 border-b border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary-500" />
            <span className="text-sm font-medium">AI Assistant</span>
          </div>
          <button
            onClick={resetAndClose}
            className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Actions */}
        {!result && !error && (
          <div className="p-2 grid grid-cols-2 gap-1 max-w-[320px]">
            {(Object.keys(AI_ACTIONS) as AIActionType[]).map((actionType) => (
              <button
                key={actionType}
                onClick={() => handleAction(actionType)}
                disabled={loading !== null}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors disabled:opacity-50"
              >
                {loading === actionType ? (
                  <Loader2 size={16} className="animate-spin text-primary-500" />
                ) : (
                  <span className="text-surface-500">{actionIcons[actionType]}</span>
                )}
                <span>{AI_ACTIONS[actionType].label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 max-w-[400px]">
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Try again
            </button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="max-w-[400px]">
            <div className="p-3 max-h-[200px] overflow-y-auto">
              <p className="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap">
                {result}
              </p>
            </div>
            <div className="flex items-center gap-2 p-3 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
              <button
                onClick={handleReplace}
                className="flex-1 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Replace
              </button>
              <button
                onClick={handleInsert}
                className="flex-1 px-3 py-2 bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 rounded-lg text-sm font-medium transition-colors"
              >
                Insert below
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
