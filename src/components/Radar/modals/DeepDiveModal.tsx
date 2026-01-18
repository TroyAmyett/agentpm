import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  Tag,
  Lightbulb,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { DeepDiveAnalysis } from '@/types/radar'

interface DeepDiveModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  analysis: DeepDiveAnalysis | null
  isLoading: boolean
}

function getSentimentColor(sentiment: number): string {
  if (sentiment >= 0.3) return '#10b981'
  if (sentiment <= -0.3) return '#ef4444'
  return '#f59e0b'
}

function getSentimentIcon(sentiment: number) {
  if (sentiment >= 0.3) return TrendingUp
  if (sentiment <= -0.3) return TrendingDown
  return Minus
}

export function DeepDiveModal({
  isOpen,
  onClose,
  title,
  analysis,
  isLoading,
}: DeepDiveModalProps) {
  if (!isOpen) return null

  const SentimentIcon = analysis ? getSentimentIcon(analysis.sentiment) : Minus
  const sentimentColor = analysis ? getSentimentColor(analysis.sentiment) : '#f59e0b'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative radar-glass-card w-full max-w-2xl mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-white/50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <span className="text-[#0ea5e9] text-sm font-medium">Deep Dive Analysis</span>
          <h2 className="text-xl font-semibold mt-1 pr-8">{title}</h2>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 text-[#0ea5e9] animate-spin mb-4" />
            <p className="text-white/60">Analyzing content with AI...</p>
          </div>
        ) : analysis ? (
          <div className="space-y-6">
            {/* Summary */}
            <section>
              <h3 className="text-sm font-medium text-white/60 mb-2">Summary</h3>
              <p className="text-white/90 leading-relaxed">{analysis.summary}</p>
            </section>

            {/* Sentiment */}
            <section>
              <h3 className="text-sm font-medium text-white/60 mb-2">Sentiment</h3>
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${sentimentColor}20` }}
                >
                  <SentimentIcon className="w-5 h-5" style={{ color: sentimentColor }} />
                </div>
                <div>
                  <span className="font-medium" style={{ color: sentimentColor }}>
                    {analysis.sentimentLabel}
                  </span>
                  <div className="w-32 h-2 bg-white/10 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${((analysis.sentiment + 1) / 2) * 100}%`,
                        backgroundColor: sentimentColor,
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Key Points */}
            <section>
              <h3 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Key Points
              </h3>
              <ul className="space-y-2">
                {analysis.keyPoints.map((point, index) => (
                  <li key={index} className="flex items-start gap-2 text-white/80">
                    <span className="text-[#0ea5e9] mt-1">&#8226;</span>
                    {point}
                  </li>
                ))}
              </ul>
            </section>

            {/* Implications */}
            <section>
              <h3 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Implications
              </h3>
              <p className="text-white/80">{analysis.implications}</p>
            </section>

            {/* Action Items */}
            {analysis.actionItems.length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  Action Items
                </h3>
                <ul className="space-y-2">
                  {analysis.actionItems.map((item, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-2 text-white/80 bg-white/5 rounded-lg p-3"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#0ea5e9]/20 text-[#0ea5e9] text-xs flex items-center justify-center">
                        {index + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Recommendations */}
            {analysis.recommendations.length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-white/60 mb-2">Recommendations</h3>
                <ul className="space-y-2">
                  {analysis.recommendations.map((rec, index) => (
                    <li
                      key={index}
                      className="text-white/80 pl-4 border-l-2 border-[#0ea5e9]/50"
                    >
                      {rec}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Related Topics */}
            {analysis.relatedTopics.length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Related Topics
                </h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.relatedTopics.map((topic, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-white/10 rounded-full text-sm text-white/70"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <p className="text-white/60 text-center py-8">
            Failed to load analysis. Please try again.
          </p>
        )}
      </div>
    </div>
  )
}
