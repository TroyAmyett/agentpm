// Browse Skills Modal - Search and import from curated skills index
// Agent-agnostic design: supports Claude, Gemini, GPT, Grok, etc.

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Search,
  Loader2,
  Download,
  Check,
  Star,
  Filter,
  ExternalLink,
  Sparkles,
} from 'lucide-react'
import type {
  SkillIndexEntry,
  SkillIndexSearchResult,
  SkillCategory,
  SkillAgent,
  SkillIndexFilters,
} from '@/types/agentpm'
import { SKILL_CATEGORY_INFO, SKILL_AGENT_INFO } from '@/types/agentpm'
import {
  searchSkillsIndex,
  fetchFeaturedSkills,
  importFromIndex,
  checkSkillImported,
} from '@/services/skills'

interface BrowseSkillsModalProps {
  isOpen: boolean
  onClose: () => void
  accountId: string
  userId: string
  onImportSuccess: () => void
}

export function BrowseSkillsModal({
  isOpen,
  onClose,
  accountId,
  userId,
  onImportSuccess,
}: BrowseSkillsModalProps) {
  // Search state
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<SkillCategory | ''>('')
  const [agent, setAgent] = useState<SkillAgent | ''>('')
  const [showFilters, setShowFilters] = useState(false)

  // Results state
  const [results, setResults] = useState<SkillIndexSearchResult[]>([])
  const [featuredSkills, setFeaturedSkills] = useState<SkillIndexEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Import state
  const [importingId, setImportingId] = useState<string | null>(null)
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set())

  // Selected skill for detail view
  const [selectedSkill, setSelectedSkill] = useState<SkillIndexEntry | null>(null)

  // Load featured skills on mount
  useEffect(() => {
    if (isOpen) {
      loadFeaturedSkills()
    }
  }, [isOpen])

  // Search when query or filters change
  useEffect(() => {
    if (!isOpen) return

    const timer = setTimeout(() => {
      if (query || category || agent) {
        performSearch()
      } else {
        setResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, category, agent, isOpen])

  const loadFeaturedSkills = async () => {
    try {
      const skills = await fetchFeaturedSkills()
      setFeaturedSkills(skills)
    } catch (err) {
      console.error('Failed to load featured skills:', err)
    }
  }

  const performSearch = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const filters: SkillIndexFilters = {}
      if (query) filters.query = query
      if (category) filters.category = category
      if (agent) filters.agent = agent

      const searchResults = await searchSkillsIndex(filters, 20, 0)
      setResults(searchResults)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async (skill: SkillIndexEntry) => {
    setImportingId(skill.id)
    setError(null)

    try {
      // Check if already imported
      const existing = await checkSkillImported(skill.id, accountId)
      if (existing) {
        setImportedIds((prev) => new Set([...prev, skill.id]))
        return
      }

      await importFromIndex(skill, accountId, userId)
      setImportedIds((prev) => new Set([...prev, skill.id]))
      onImportSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportingId(null)
    }
  }

  const handleClose = () => {
    setQuery('')
    setCategory('')
    setAgent('')
    setResults([])
    setSelectedSkill(null)
    setError(null)
    onClose()
  }

  const categories = Object.entries(SKILL_CATEGORY_INFO) as [SkillCategory, { label: string }][]
  const agents = Object.entries(SKILL_AGENT_INFO) as [SkillAgent, { label: string; color: string }][]

  // Skills to display (search results or featured)
  const displaySkills = results.length > 0 || query || category || agent ? results : featuredSkills

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

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[85vh] bg-white dark:bg-surface-800 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                  Browse Skills
                </h2>
                <p className="text-sm text-surface-500 mt-0.5">
                  Discover and import curated skills for any AI agent
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-surface-200 dark:border-surface-700 shrink-0">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search skills..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    showFilters || category || agent
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                      : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700'
                  }`}
                >
                  <Filter size={18} />
                  <span className="text-sm">Filters</span>
                  {(category || agent) && (
                    <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center">
                      {(category ? 1 : 0) + (agent ? 1 : 0)}
                    </span>
                  )}
                </button>
              </div>

              {/* Filter Dropdowns */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-3 mt-3">
                      {/* Category Filter */}
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-surface-500 mb-1">
                          Category
                        </label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value as SkillCategory | '')}
                          className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                          <option value="">All Categories</option>
                          {categories.map(([key, info]) => (
                            <option key={key} value={key}>
                              {info.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Agent Filter */}
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-surface-500 mb-1">
                          AI Agent
                        </label>
                        <select
                          value={agent}
                          onChange={(e) => setAgent(e.target.value as SkillAgent | '')}
                          className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                          <option value="">All Agents</option>
                          {agents.map(([key, info]) => (
                            <option key={key} value={key}>
                              {info.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Clear Filters */}
                      {(category || agent) && (
                        <button
                          onClick={() => {
                            setCategory('')
                            setAgent('')
                          }}
                          className="self-end px-3 py-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm shrink-0">
                {error}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-primary-500" />
                </div>
              ) : displaySkills.length === 0 ? (
                <div className="text-center py-12 text-surface-500">
                  {query || category || agent
                    ? 'No skills found matching your search'
                    : 'Start typing to search for skills'}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Section Header */}
                  {!query && !category && !agent && featuredSkills.length > 0 && (
                    <div className="flex items-center gap-2 text-sm font-medium text-surface-500 mb-2">
                      <Sparkles size={16} className="text-amber-500" />
                      Featured Skills
                    </div>
                  )}

                  {/* Skills Grid */}
                  {displaySkills.map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      isImporting={importingId === skill.id}
                      isImported={importedIds.has(skill.id)}
                      onImport={() => handleImport(skill)}
                      onSelect={() => setSelectedSkill(skill)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Skill Detail Drawer */}
            <AnimatePresence>
              {selectedSkill && (
                <SkillDetailDrawer
                  skill={selectedSkill}
                  isImporting={importingId === selectedSkill.id}
                  isImported={importedIds.has(selectedSkill.id)}
                  onImport={() => handleImport(selectedSkill)}
                  onClose={() => setSelectedSkill(null)}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// =============================================================================
// Skill Card Component
// =============================================================================

interface SkillCardProps {
  skill: SkillIndexEntry | SkillIndexSearchResult
  isImporting: boolean
  isImported: boolean
  onImport: () => void
  onSelect: () => void
}

function SkillCard({ skill, isImporting, isImported, onImport, onSelect }: SkillCardProps) {
  const categoryInfo = SKILL_CATEGORY_INFO[skill.category]

  return (
    <div
      onClick={onSelect}
      className="p-4 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-300 dark:hover:border-primary-700 bg-white dark:bg-surface-900 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-surface-900 dark:text-surface-100 truncate">
              {skill.name}
            </h3>
            {skill.isFeatured && (
              <Star size={14} className="text-amber-500 fill-amber-500 shrink-0" />
            )}
            {skill.authorVerified && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                Verified
              </span>
            )}
          </div>
          <p className="text-sm text-surface-600 dark:text-surface-400 mt-1 line-clamp-2">
            {skill.description}
          </p>

          {/* Metadata Row */}
          <div className="flex items-center gap-3 mt-2 text-xs text-surface-500">
            <span className="px-2 py-0.5 rounded bg-surface-100 dark:bg-surface-700">
              {categoryInfo?.label || skill.category}
            </span>
            {skill.authorName && <span>by {skill.authorName}</span>}
            <span>{skill.importCount} imports</span>
          </div>

          {/* Agent Compatibility */}
          <div className="flex items-center gap-1.5 mt-2">
            {skill.compatibleAgents.map((agentKey) => {
              const agentInfo = SKILL_AGENT_INFO[agentKey]
              return (
                <span
                  key={agentKey}
                  className="text-xs px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400"
                >
                  {agentInfo?.label || agentKey}
                </span>
              )
            })}
          </div>
        </div>

        {/* Import Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onImport()
          }}
          disabled={isImporting || isImported}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isImported
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50'
          }`}
        >
          {isImporting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Importing...
            </>
          ) : isImported ? (
            <>
              <Check size={14} />
              Imported
            </>
          ) : (
            <>
              <Download size={14} />
              Import
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Skill Detail Drawer
// =============================================================================

interface SkillDetailDrawerProps {
  skill: SkillIndexEntry
  isImporting: boolean
  isImported: boolean
  onImport: () => void
  onClose: () => void
}

function SkillDetailDrawer({
  skill,
  isImporting,
  isImported,
  onImport,
  onClose,
}: SkillDetailDrawerProps) {
  const categoryInfo = SKILL_CATEGORY_INFO[skill.category]

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="absolute inset-y-0 right-0 w-full max-w-md bg-white dark:bg-surface-800 border-l border-surface-200 dark:border-surface-700 shadow-xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
        >
          <X size={20} />
        </button>
        <button
          onClick={onImport}
          disabled={isImporting || isImported}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isImported
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50'
          }`}
        >
          {isImporting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Importing...
            </>
          ) : isImported ? (
            <>
              <Check size={16} />
              Imported
            </>
          ) : (
            <>
              <Download size={16} />
              Import Skill
            </>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Title */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-surface-900 dark:text-surface-100">
                {skill.name}
              </h2>
              {skill.isFeatured && (
                <Star size={18} className="text-amber-500 fill-amber-500" />
              )}
            </div>
            <p className="text-surface-600 dark:text-surface-400 mt-1">{skill.description}</p>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-surface-500">Category</span>
              <p className="font-medium text-surface-900 dark:text-surface-100">
                {categoryInfo?.label || skill.category}
              </p>
            </div>
            <div>
              <span className="text-surface-500">Version</span>
              <p className="font-medium text-surface-900 dark:text-surface-100">{skill.version}</p>
            </div>
            {skill.authorName && (
              <div>
                <span className="text-surface-500">Author</span>
                <p className="font-medium text-surface-900 dark:text-surface-100 flex items-center gap-1">
                  {skill.authorName}
                  {skill.authorVerified && (
                    <Check size={14} className="text-green-500" />
                  )}
                </p>
              </div>
            )}
            <div>
              <span className="text-surface-500">Imports</span>
              <p className="font-medium text-surface-900 dark:text-surface-100">
                {skill.importCount.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Agent Compatibility */}
          <div>
            <span className="text-sm text-surface-500">Compatible Agents</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {skill.compatibleAgents.map((agentKey) => {
                const agentInfo = SKILL_AGENT_INFO[agentKey]
                return (
                  <span
                    key={agentKey}
                    className="px-2.5 py-1 rounded-full bg-surface-100 dark:bg-surface-700 text-sm text-surface-700 dark:text-surface-300"
                  >
                    {agentInfo?.label || agentKey}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Required Tools */}
          {skill.requiresTools.length > 0 && (
            <div>
              <span className="text-sm text-surface-500">Requires</span>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {skill.requiresTools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-sm text-amber-700 dark:text-amber-400"
                  >
                    {tool.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {skill.tags.length > 0 && (
            <div>
              <span className="text-sm text-surface-500">Tags</span>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {skill.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-full bg-surface-100 dark:bg-surface-700 text-sm text-surface-600 dark:text-surface-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Long Description */}
          {skill.longDescription && (
            <div>
              <span className="text-sm text-surface-500">About</span>
              <p className="mt-1.5 text-surface-700 dark:text-surface-300 whitespace-pre-wrap">
                {skill.longDescription}
              </p>
            </div>
          )}

          {/* Preview */}
          {skill.previewSnippet && (
            <div>
              <span className="text-sm text-surface-500">Preview</span>
              <pre className="mt-1.5 p-3 rounded-lg bg-surface-100 dark:bg-surface-900 text-xs text-surface-700 dark:text-surface-300 overflow-x-auto whitespace-pre-wrap font-mono">
                {skill.previewSnippet}
              </pre>
            </div>
          )}

          {/* GitHub Link */}
          {skill.githubUrl && (
            <a
              href={skill.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              <ExternalLink size={14} />
              View on GitHub
            </a>
          )}
        </div>
      </div>
    </motion.div>
  )
}
