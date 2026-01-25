// Agent Tools Settings
// View and configure tools available for agent task execution

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Wrench,
  Globe,
  Search,
  Link2,
  Server,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react'
import { BUILT_IN_TOOLS, type Tool } from '@/services/tools'

const categoryIcons: Record<string, React.ReactNode> = {
  research: <Search size={16} />,
  validation: <Check size={16} />,
  integration: <Link2 size={16} />,
  utility: <Wrench size={16} />,
}

const categoryLabels: Record<string, string> = {
  research: 'Research',
  validation: 'Validation',
  integration: 'Integration',
  utility: 'Utility',
}

export function AgentToolsSettings() {
  const [expandedTool, setExpandedTool] = useState<string | null>(null)

  const tools = BUILT_IN_TOOLS

  // Group by category
  const toolsByCategory = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = []
    }
    acc[tool.category].push(tool)
    return acc
  }, {} as Record<string, Tool[]>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2
          className="text-lg font-medium flex items-center gap-2"
          style={{ color: 'var(--fl-color-text-primary)' }}
        >
          <Wrench size={20} />
          Agent Tools
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
          Real-time tools that agents can use during task execution
        </p>
      </div>

      {/* Info Banner */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl"
        style={{
          background: 'rgba(14, 165, 233, 0.1)',
          border: '1px solid rgba(14, 165, 233, 0.3)',
        }}
      >
        <Info size={20} className="text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm" style={{ color: 'var(--fl-color-text-secondary)' }}>
            Agents automatically use these tools when they need real-time data. For example,
            when asked to find available domain names, the agent will use the domain availability
            checker to verify domains are actually available before recommending them.
          </p>
        </div>
      </div>

      {/* Tools by Category */}
      {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
        <div key={category} className="space-y-3">
          <h3
            className="text-sm font-medium flex items-center gap-2"
            style={{ color: 'var(--fl-color-text-secondary)' }}
          >
            {categoryIcons[category]}
            {categoryLabels[category]} Tools
          </h3>

          <div className="space-y-2">
            {categoryTools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                isExpanded={expandedTool === tool.id}
                onToggle={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Status Summary */}
      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
            Tools Status
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <Check size={14} />
              {tools.filter(t => t.isEnabled).length} Active
            </span>
            {tools.filter(t => !t.isEnabled).length > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-gray-400">
                <X size={14} />
                {tools.filter(t => !t.isEnabled).length} Disabled
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolCard({
  tool,
  isExpanded,
  onToggle,
}: {
  tool: Tool
  isExpanded: boolean
  onToggle: () => void
}) {
  const getToolIcon = () => {
    switch (tool.name) {
      case 'check_domain_availability':
        return <Globe size={18} className="text-cyan-400" />
      case 'web_search':
        return <Search size={18} className="text-cyan-400" />
      case 'fetch_url':
        return <Link2 size={18} className="text-cyan-400" />
      case 'dns_lookup':
        return <Server size={18} className="text-cyan-400" />
      default:
        return <Wrench size={18} className="text-cyan-400" />
    }
  }

  return (
    <motion.div
      layout
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--fl-color-border)',
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{
            background: 'rgba(14, 165, 233, 0.15)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
          }}
        >
          {getToolIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="font-medium"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              {tool.displayName}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-xs ${
                tool.isEnabled
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {tool.isEnabled ? 'Active' : 'Disabled'}
            </span>
            {tool.requiresApiKey && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">
                Requires API Key
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--fl-color-text-muted)' }}>
            {tool.description}
          </p>
        </div>

        {isExpanded ? (
          <ChevronUp size={18} style={{ color: 'var(--fl-color-text-muted)' }} />
        ) : (
          <ChevronDown size={18} style={{ color: 'var(--fl-color-text-muted)' }} />
        )}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 pb-4 pt-0"
        >
          <div className="border-t pt-4" style={{ borderColor: 'var(--fl-color-border)' }}>
            {/* Tool Name */}
            <div className="mb-3">
              <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                Tool Name (API)
              </span>
              <code
                className="block mt-1 px-3 py-2 rounded-lg text-sm font-mono"
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: 'var(--fl-color-text-secondary)',
                }}
              >
                {tool.name}
              </code>
            </div>

            {/* Description */}
            <div className="mb-3">
              <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                Description (shown to AI)
              </span>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--fl-color-text-secondary)' }}
              >
                {tool.definition.description}
              </p>
            </div>

            {/* Parameters */}
            <div>
              <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                Parameters
              </span>
              <div className="mt-2 space-y-2">
                {Object.entries(tool.definition.input_schema.properties).map(([paramName, param]) => (
                  <div
                    key={paramName}
                    className="flex items-start gap-2 p-2 rounded-lg"
                    style={{ background: 'rgba(0, 0, 0, 0.1)' }}
                  >
                    <code
                      className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(14, 165, 233, 0.2)', color: '#0ea5e9' }}
                    >
                      {paramName}
                    </code>
                    <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                      {param.type}
                      {tool.definition.input_schema.required?.includes(paramName) && (
                        <span className="text-red-400 ml-1">*</span>
                      )}
                    </span>
                    <span className="text-xs flex-1" style={{ color: 'var(--fl-color-text-secondary)' }}>
                      {param.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* API Key Note */}
            {tool.requiresApiKey && (
              <div
                className="mt-4 p-3 rounded-lg flex items-start gap-2"
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                <Info size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  This tool requires an API key ({tool.apiKeyName}). Configure it in API Keys settings to enable.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

export default AgentToolsSettings
