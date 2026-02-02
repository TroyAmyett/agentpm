// Results Card — Prominent display of agent output (blog posts, research, etc.)

import { useState } from 'react'
import { Copy, Check, ExternalLink, ChevronDown, Code } from 'lucide-react'

interface ResultsCardProps {
  output: Record<string, unknown>
}

export function ResultsCard({ output }: ResultsCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const CopyBtn = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      className="p-1 hover:bg-green-200/50 dark:hover:bg-green-800/30 rounded transition-colors"
      title="Copy"
    >
      {copiedField === field ? <Check size={12} className="text-green-600" /> : <Copy size={12} className="text-surface-400" />}
    </button>
  )

  // Extract typed values
  const title = output.title ? String(output.title) : null
  const excerpt = output.excerpt ? String(output.excerpt) : null
  const imageUrl = output.imageUrl ? String(output.imageUrl) : null
  const content = output.content ? String(output.content) : null
  const result = output.result ? String(output.result) : null
  const category = output.category ? String(output.category) : null
  const seoTitle = output.seoTitle ? String(output.seoTitle) : null
  const seoDescription = output.seoDescription ? String(output.seoDescription) : null
  const tags = Array.isArray(output.tags) ? output.tags.map(t => String(t)) : []
  const siteUrl = output.siteUrl ? String(output.siteUrl) : null
  const formatted = output.formatted ? String(output.formatted) : null

  // Structured output (blog, content)
  if (title || content || result) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border border-green-200 dark:border-green-800 overflow-hidden">
        {/* Hero image */}
        {imageUrl && (
          <div className="w-full h-40 overflow-hidden">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* Title */}
          {title && (
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100 leading-tight">
                {title}
              </h3>
              <CopyBtn text={title} field="title" />
            </div>
          )}

          {/* Excerpt */}
          {excerpt && (
            <p className="text-sm text-surface-600 dark:text-surface-400 italic leading-relaxed">
              {excerpt}
            </p>
          )}

          {/* Tags & Category */}
          {(category || tags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {category && (
                <span className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
                  {category}
                </span>
              )}
              {tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 text-xs bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Content body (collapsible) */}
          {(content || result) && (
            <details className="group">
              <summary className="text-xs font-medium text-green-700 dark:text-green-400 cursor-pointer hover:underline flex items-center gap-1">
                <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                View full content
              </summary>
              <div className="mt-2 p-3 rounded-lg bg-white/60 dark:bg-surface-900/40 border border-green-100 dark:border-green-900/30 max-h-80 overflow-auto">
                <div className="flex justify-end mb-1">
                  <CopyBtn text={content || result || ''} field="content" />
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {renderMarkdown(content || result || '')}
                </div>
              </div>
            </details>
          )}

          {/* SEO (collapsible) */}
          {(seoTitle || seoDescription) && (
            <details className="group">
              <summary className="text-xs font-medium text-surface-500 dark:text-surface-400 cursor-pointer hover:text-surface-700 dark:hover:text-surface-300 flex items-center gap-1">
                <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                SEO fields
              </summary>
              <div className="mt-2 p-3 rounded-lg bg-white/60 dark:bg-surface-900/40 text-sm space-y-1.5">
                {seoTitle && (
                  <div>
                    <span className="text-xs text-surface-500">Title:</span>
                    <p className="text-surface-700 dark:text-surface-300">{seoTitle}</p>
                  </div>
                )}
                {seoDescription && (
                  <div>
                    <span className="text-xs text-surface-500">Description:</span>
                    <p className="text-surface-700 dark:text-surface-300">{seoDescription}</p>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Action bar */}
          <div className="flex items-center gap-2 pt-2 border-t border-green-200/60 dark:border-green-800/40">
            {siteUrl && (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 rounded-lg transition-colors"
              >
                <ExternalLink size={12} />
                Open on site
              </a>
            )}
            <button
              onClick={() => copyToClipboard(formatted || content || result || title || '', 'all')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 rounded-lg transition-colors"
            >
              {copiedField === 'all' ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              Copy
            </button>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 rounded-lg transition-colors ml-auto"
            >
              <Code size={12} />
              JSON
            </button>
          </div>

          {/* Raw output */}
          {showRaw && (
            <pre className="p-3 rounded-lg bg-surface-100 dark:bg-surface-900 text-xs overflow-auto max-h-40 border border-surface-200 dark:border-surface-700">
              {JSON.stringify(output, null, 2)}
            </pre>
          )}
        </div>
      </div>
    )
  }

  // Fallback: non-structured output
  return (
    <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border border-green-200 dark:border-green-800 p-4">
      <div className="flex justify-end mb-2">
        <button
          onClick={() => copyToClipboard(JSON.stringify(output, null, 2), 'raw')}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
        >
          {copiedField === 'raw' ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
          Copy
        </button>
      </div>
      <pre className="text-sm font-mono overflow-auto max-h-60 whitespace-pre-wrap text-surface-700 dark:text-surface-300">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  )
}

/** Simple markdown-to-JSX renderer */
function renderMarkdown(text: string) {
  return text
    .split(/\\n|[\n]/)
    .map((line, i) => {
      const trimmed = line.trim()
      if (!trimmed) return <br key={i} />
      if (trimmed.startsWith('### '))
        return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{trimmed.slice(4)}</h3>
      if (trimmed.startsWith('## '))
        return <h2 key={i} className="text-lg font-semibold mt-4 mb-2">{trimmed.slice(3)}</h2>
      if (trimmed.startsWith('# '))
        return <h1 key={i} className="text-xl font-bold mt-4 mb-2">{trimmed.slice(2)}</h1>
      if (trimmed.startsWith('- ') || trimmed.startsWith('* '))
        return <li key={i} className="ml-4">{trimmed.slice(2)}</li>
      if (trimmed.startsWith('**') && trimmed.endsWith('**'))
        return <p key={i} className="font-semibold">{trimmed.replace(/\*\*/g, '')}</p>
      return <p key={i} className="mb-2">{trimmed}</p>
    })
}
