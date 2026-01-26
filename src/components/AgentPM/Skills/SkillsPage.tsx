// Skills Page - Main skills management dashboard

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Plus, FileText, Search, Filter, Sparkles, ChevronRight, Crown } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useAccountStore } from '@/stores/accountStore'
import { useSkillStore } from '@/stores/skillStore'
import { SkillCard } from './SkillCard'
import { SkillDetailView } from './SkillDetailView'
import { ImportSkillModal } from './ImportSkillModal'
import { SkillsBuilderModal } from './SkillsBuilderModal'
import { BrowseSkillsModal } from './BrowseSkillsModal'
import type { Skill, SkillSourceType, SkillBuilderMessage, SkillCategory } from '@/types/agentpm'
import { SKILL_CATEGORY_INFO } from '@/types/agentpm'

type FilterSource = 'all' | SkillSourceType
type FilterCategory = 'all' | SkillCategory

export function SkillsPage() {
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isBrowseOpen, setIsBrowseOpen] = useState(false)
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [builderBaseSkill, setBuilderBaseSkill] = useState<Skill | null>(null)
  const [builderEditSkill, setBuilderEditSkill] = useState<Skill | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSource, setFilterSource] = useState<FilterSource>('all')
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all')
  const [showAllOfficialSkills, setShowAllOfficialSkills] = useState(false)

  const { user } = useAuthStore()
  const { currentAccountId } = useAccountStore()
  const {
    skills,
    officialSkills,
    isLoading,
    error,
    fetchSkills,
    fetchOfficialSkills,
    importFromGitHub,
    importFromRaw,
    createFromBuilder,
    updateFromBuilder,
    toggleEnabled,
    checkForUpdates,
    syncSkill,
    deleteSkill,
    clearError,
  } = useSkillStore()

  const userId = user?.id || 'demo-user'
  const accountId = currentAccountId || 'demo-account-id'

  // Fetch skills on mount and when account changes
  useEffect(() => {
    if (accountId && !accountId.startsWith('default-') && !accountId.startsWith('demo-')) {
      fetchSkills(accountId)
    }
    // Also fetch official skills for the builder
    fetchOfficialSkills()
  }, [accountId, fetchSkills, fetchOfficialSkills])

  // Filter skills
  const filteredSkills = skills.filter((skill) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesName = skill.name.toLowerCase().includes(query)
      const matchesDesc = skill.description?.toLowerCase().includes(query)
      const matchesTags = skill.tags?.some((t) => t.toLowerCase().includes(query))
      if (!matchesName && !matchesDesc && !matchesTags) {
        return false
      }
    }

    // Source filter
    if (filterSource !== 'all' && skill.sourceType !== filterSource) {
      return false
    }

    // Category filter
    if (filterCategory !== 'all' && skill.category !== filterCategory) {
      return false
    }

    return true
  })

  // Get categories that have skills (for showing only relevant tabs)
  const categoriesWithSkills = [...new Set(skills.map(s => s.category).filter(Boolean))] as SkillCategory[]

  // Handlers
  const handleImportGitHub = useCallback(
    async (url: string) => {
      await importFromGitHub(url, accountId, userId)
    },
    [accountId, userId, importFromGitHub]
  )

  const handleImportRaw = useCallback(
    async (content: string, name?: string) => {
      await importFromRaw(content, accountId, userId, name)
    },
    [accountId, userId, importFromRaw]
  )

  const handleToggleEnabled = useCallback(
    async (skill: Skill, enabled: boolean) => {
      await toggleEnabled(skill.id, enabled)
      if (selectedSkill?.id === skill.id) {
        setSelectedSkill({ ...skill, isEnabled: enabled })
      }
    },
    [toggleEnabled, selectedSkill]
  )

  const handleCheckUpdates = useCallback(
    async (skill: Skill) => {
      return checkForUpdates(skill)
    },
    [checkForUpdates]
  )

  const handleSync = useCallback(
    async (skill: Skill) => {
      await syncSkill(skill)
      // Refresh selected skill
      const updated = useSkillStore.getState().getSkill(skill.id)
      if (updated) setSelectedSkill(updated)
    },
    [syncSkill]
  )

  const handleDelete = useCallback(
    async (skill: Skill) => {
      await deleteSkill(skill.id)
      setSelectedSkill(null)
    },
    [deleteSkill]
  )

  // Skills Builder handlers
  const handleOpenBuilder = useCallback(() => {
    setBuilderBaseSkill(null)
    setBuilderEditSkill(null)
    setIsBuilderOpen(true)
  }, [])

  const handleCustomizeSkill = useCallback((skill: Skill) => {
    setBuilderBaseSkill(skill)
    setBuilderEditSkill(null)
    setSelectedSkill(null) // Close detail view if open
    setIsBuilderOpen(true)
  }, [])

  const handleEditSkillWithBuilder = useCallback((skill: Skill) => {
    setBuilderBaseSkill(null)
    setBuilderEditSkill(skill)
    setSelectedSkill(null) // Close detail view if open
    setIsBuilderOpen(true)
  }, [])

  const handleCloseBuilder = useCallback(() => {
    setIsBuilderOpen(false)
    setBuilderBaseSkill(null)
    setBuilderEditSkill(null)
  }, [])

  const handleSaveFromBuilder = useCallback(
    async (skillData: {
      name: string
      description: string
      content: string
      category?: SkillCategory
      forkedFrom?: string
      builderConversation: SkillBuilderMessage[]
    }) => {
      if (builderEditSkill) {
        // Update existing skill
        await updateFromBuilder(builderEditSkill.id, {
          name: skillData.name,
          description: skillData.description,
          content: skillData.content,
          category: skillData.category,
          builderConversation: skillData.builderConversation,
        })
      } else {
        // Create new skill
        await createFromBuilder(accountId, userId, skillData)
      }
    },
    [accountId, userId, createFromBuilder, updateFromBuilder, builderEditSkill]
  )

  // Check if skill is official (@fun/ namespace)
  const isOfficialSkill = (skill: Skill) => skill.namespace === '@fun'

  // Show detail view if a skill is selected
  if (selectedSkill) {
    return (
      <SkillDetailView
        skill={selectedSkill}
        onBack={() => setSelectedSkill(null)}
        onToggleEnabled={(enabled) => handleToggleEnabled(selectedSkill, enabled)}
        onCheckUpdates={() => handleCheckUpdates(selectedSkill)}
        onSync={() => handleSync(selectedSkill)}
        onDelete={() => handleDelete(selectedSkill)}
        onEditWithAI={handleEditSkillWithBuilder}
        onCustomize={handleCustomizeSkill}
      />
    )
  }

  return (
    <div className="h-full flex flex-col bg-surface-50 dark:bg-surface-900">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-100">
              Skills
            </h1>
            <p className="text-sm text-surface-600 dark:text-surface-400">
              Import and manage Claude Code skills for your projects
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenBuilder}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white font-medium rounded-lg transition-all shadow-sm"
            >
              <Sparkles size={18} />
              New Skill
            </button>
            <button
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 font-medium rounded-lg transition-colors"
            >
              <Plus size={18} />
              Import
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Source Filter */}
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-surface-500" />
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as FilterSource)}
              className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Sources</option>
              <option value="github">GitHub</option>
              <option value="local">Local</option>
              <option value="marketplace">Marketplace</option>
            </select>
          </div>
        </div>

        {/* Category Filter Tabs */}
        {(categoriesWithSkills.length > 0 || skills.length > 0) && (
          <div className="flex items-center gap-2 pt-4 overflow-x-auto">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filterCategory === 'all'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600'
              }`}
            >
              All Categories
            </button>
            {(Object.keys(SKILL_CATEGORY_INFO) as SkillCategory[])
              .filter(cat => cat !== 'other' || categoriesWithSkills.includes('other'))
              .map((category) => (
                <button
                  key={category}
                  onClick={() => setFilterCategory(category)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    filterCategory === category
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600'
                  }`}
                >
                  {SKILL_CATEGORY_INFO[category].label}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-sm underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Official Skills Section */}
        {officialSkills.length > 0 && !searchQuery && filterSource === 'all' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-r from-primary-500 to-purple-500">
                  <Crown size={16} className="text-white" />
                </div>
                <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                  Official Skills
                </h2>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                  @fun
                </span>
              </div>
              {officialSkills.length > 4 && (
                <button
                  onClick={() => setShowAllOfficialSkills(!showAllOfficialSkills)}
                  className="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                >
                  {showAllOfficialSkills ? 'Show less' : `View all ${officialSkills.length}`}
                  <ChevronRight size={16} className={`transition-transform ${showAllOfficialSkills ? 'rotate-90' : ''}`} />
                </button>
              )}
            </div>
            <p className="text-sm text-surface-600 dark:text-surface-400 mb-4">
              Curated skills by Funnelists. Customize any skill to make it your own.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {(showAllOfficialSkills ? officialSkills : officialSkills.slice(0, 4)).map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onClick={() => setSelectedSkill(skill)}
                  onToggleEnabled={() => {}} // Official skills can't be toggled
                  onCustomize={handleCustomizeSkill}
                  isOfficial={true}
                />
              ))}
            </div>
          </div>
        )}

        {/* Your Skills Section Header */}
        {skills.length > 0 && !searchQuery && filterSource === 'all' && officialSkills.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              Your Skills
            </h2>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400">
              {skills.length}
            </span>
          </div>
        )}

        {/* Loading */}
        {isLoading && skills.length === 0 && (
          <div className="flex items-center justify-center py-12 text-surface-500">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p>Loading skills...</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredSkills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-surface-500">
            <FileText size={48} className="mb-4 opacity-50" />
            {skills.length === 0 ? (
              <>
                <p className="text-lg font-medium mb-2">No skills yet</p>
                <p className="text-sm mb-4">
                  Create a custom skill with AI or import from GitHub
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleOpenBuilder}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white font-medium rounded-lg transition-all"
                  >
                    <Sparkles size={18} />
                    Create with AI
                  </button>
                  <button
                    onClick={() => setIsImportOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 font-medium rounded-lg transition-colors"
                  >
                    <Plus size={18} />
                    Import
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-medium mb-2">No matching skills</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </>
            )}
          </div>
        )}

        {/* Skills Grid */}
        {filteredSkills.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onClick={() => setSelectedSkill(skill)}
                  onToggleEnabled={(enabled) => handleToggleEnabled(skill, enabled)}
                  onCustomize={handleCustomizeSkill}
                  onEditWithAI={handleEditSkillWithBuilder}
                  isOfficial={isOfficialSkill(skill)}
                />
              ))}
            </AnimatePresence>

            {/* Add Skill Card */}
            <button
              onClick={() => setIsImportOpen(true)}
              className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-surface-300 dark:border-surface-600 hover:border-primary-400 dark:hover:border-primary-600 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors min-h-[180px]"
            >
              <Plus size={32} className="text-surface-400 mb-2" />
              <span className="text-sm font-medium text-surface-600 dark:text-surface-400">
                Add Skill
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Import Modal */}
      <ImportSkillModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportGitHub={handleImportGitHub}
        onImportRaw={handleImportRaw}
        accountId={accountId}
        userId={userId}
        onOpenBrowse={() => setIsBrowseOpen(true)}
      />

      {/* Browse Skills Modal */}
      <BrowseSkillsModal
        isOpen={isBrowseOpen}
        onClose={() => setIsBrowseOpen(false)}
        accountId={accountId}
        userId={userId}
        onImportSuccess={() => {
          fetchSkills(accountId)
          setIsBrowseOpen(false)
        }}
      />

      {/* Skills Builder Modal */}
      <SkillsBuilderModal
        isOpen={isBuilderOpen}
        onClose={handleCloseBuilder}
        onSave={handleSaveFromBuilder}
        officialSkills={officialSkills}
        editingSkill={builderEditSkill}
        baseSkill={builderBaseSkill}
      />
    </div>
  )
}
