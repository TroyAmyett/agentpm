import { useState, useCallback } from 'react'
import { X, Loader2, Link, Youtube, Rss, Twitter, CheckCircle2, AlertCircle } from 'lucide-react'
import { Topic } from '@/types/radar'
import { lookupSourceUrl } from '@/services/radar'

interface SourceInfo {
  type: 'youtube' | 'rss' | 'twitter'
  name: string
  url: string
  imageUrl?: string
  description?: string
  channelId?: string
  username?: string
  feedUrl?: string
  subscriberCount?: number
}

interface AddSourceModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (source: {
    name: string
    type: 'rss' | 'youtube' | 'twitter'
    url: string
    channel_id?: string
    username?: string
    topic_id?: string
    image_url?: string
    description?: string
  }) => void
  topics: Topic[]
}

function formatSubscribers(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M subscribers`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K subscribers`
  }
  return `${count} subscribers`
}

const typeIcons = {
  youtube: Youtube,
  rss: Rss,
  twitter: Twitter,
}

const typeLabels = {
  youtube: 'YouTube Channel',
  rss: 'RSS Feed',
  twitter: 'X / Twitter',
}

const typeColors = {
  youtube: 'text-red-400',
  rss: 'text-orange-400',
  twitter: 'text-blue-400',
}

export function AddSourceModal({
  isOpen,
  onClose,
  onAdd,
  topics,
}: AddSourceModalProps) {
  const [inputUrl, setInputUrl] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null)
  const [topicId, setTopicId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editedName, setEditedName] = useState('')

  const resetForm = useCallback(() => {
    setInputUrl('')
    setIsLookingUp(false)
    setLookupError('')
    setSourceInfo(null)
    setTopicId('')
    setEditedName('')
  }, [])

  const lookupUrl = useCallback(async () => {
    if (!inputUrl.trim()) return

    setIsLookingUp(true)
    setLookupError('')
    setSourceInfo(null)

    try {
      const data = await lookupSourceUrl(inputUrl.trim())
      setSourceInfo(data)
      setEditedName(data.name)
    } catch (error) {
      console.error('Lookup error:', error)
      setLookupError(error instanceof Error ? error.message : 'Could not identify source from URL')
    } finally {
      setIsLookingUp(false)
    }
  }, [inputUrl])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLookingUp && inputUrl.trim()) {
      e.preventDefault()
      lookupUrl()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sourceInfo) return

    setIsSubmitting(true)

    try {
      await onAdd({
        name: editedName || sourceInfo.name,
        type: sourceInfo.type,
        url: sourceInfo.feedUrl || sourceInfo.url,
        channel_id: sourceInfo.channelId,
        username: sourceInfo.username,
        topic_id: topicId || undefined,
        image_url: sourceInfo.imageUrl,
        description: sourceInfo.description,
      })

      resetForm()
      onClose()
    } catch (error) {
      console.error('Failed to add source:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  const TypeIcon = sourceInfo ? typeIcons[sourceInfo.type] : Link

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative radar-glass-card w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-white/50"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-semibold mb-2">Add New Source</h2>
        <p className="text-sm text-white/50 mb-6">
          Paste any YouTube, Twitter/X, or blog URL
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL Input */}
          <div>
            <label className="block text-sm text-white/60 mb-2">URL</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => {
                    setInputUrl(e.target.value)
                    setSourceInfo(null)
                    setLookupError('')
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="https://youtube.com/@channel or blog URL"
                  className="radar-glass-input w-full pl-10"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={lookupUrl}
                disabled={!inputUrl.trim() || isLookingUp}
                className="px-4 py-2 bg-[#0ea5e9] hover:bg-[#0ea5e9]/80 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                {isLookingUp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Lookup'
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {lookupError && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{lookupError}</p>
            </div>
          )}

          {/* Source Preview */}
          {sourceInfo && (
            <div className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-4">
              {/* Detected type badge */}
              <div className="flex items-center gap-2">
                <TypeIcon className={`w-5 h-5 ${typeColors[sourceInfo.type]}`} />
                <span className={`text-sm font-medium ${typeColors[sourceInfo.type]}`}>
                  {typeLabels[sourceInfo.type]}
                </span>
                {sourceInfo.type === 'twitter' ? (
                  <span className="ml-auto px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                    Coming Soon
                  </span>
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />
                )}
              </div>

              {/* Twitter/X limitation warning */}
              {sourceInfo.type === 'twitter' && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-sm text-yellow-400">
                    X/Twitter API requires a paid subscription ($100/month). Posts won&apos;t be fetched automatically yet.
                  </p>
                </div>
              )}

              {/* Source info */}
              <div className="flex gap-4">
                {sourceInfo.imageUrl && (
                  <img
                    src={sourceInfo.imageUrl}
                    alt={sourceInfo.name}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="w-full bg-transparent border-b border-white/20 focus:border-[#0ea5e9] outline-none font-semibold text-lg pb-1 mb-1"
                    placeholder="Source name"
                  />
                  {sourceInfo.subscriberCount && sourceInfo.subscriberCount > 0 && (
                    <p className="text-sm text-white/50">
                      {formatSubscribers(sourceInfo.subscriberCount)}
                    </p>
                  )}
                  {sourceInfo.description && (
                    <p className="text-sm text-white/40 line-clamp-2 mt-1">
                      {sourceInfo.description}
                    </p>
                  )}
                </div>
              </div>

              {sourceInfo.channelId && (
                <p className="text-xs text-white/30 font-mono">
                  Channel ID: {sourceInfo.channelId}
                </p>
              )}

              {sourceInfo.feedUrl && sourceInfo.feedUrl !== sourceInfo.url && (
                <p className="text-xs text-white/30 truncate">
                  Feed: {sourceInfo.feedUrl}
                </p>
              )}
            </div>
          )}

          {/* Topic selector */}
          {sourceInfo && (
            <div>
              <label className="block text-sm text-white/60 mb-2">Topic (optional)</label>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className="radar-glass-input w-full"
              >
                <option value="">No specific topic</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Submit button */}
          {sourceInfo && (
            <button
              type="submit"
              disabled={isSubmitting || !editedName.trim()}
              className="w-full py-3 bg-[#0ea5e9] text-white rounded-lg font-medium hover:bg-[#0ea5e9]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <TypeIcon className="w-4 h-4" />
                  Add {typeLabels[sourceInfo.type]}
                </>
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
