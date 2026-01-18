import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, RefreshCw, Rss, Bookmark, Users, Plus, Trash2, Pencil, ExternalLink, Youtube, Twitter } from 'lucide-react'
import type { Topic, Source, Advisor, ContentItemWithInteraction, ContentType, DeepDiveAnalysis } from '@/types/radar'
import * as radarService from '@/services/radar'
import { CardStream } from './CardStream'
import { TopicFilter } from './TopicFilter'
import { ContentTypeFilter } from './ContentTypeFilter'
import { DeepDiveModal, AddSourceModal } from './modals'
import { formatDistanceToNow } from 'date-fns'

// Tabs
type RadarTab = 'dashboard' | 'sources' | 'experts' | 'saved' | 'settings'

interface RadarPageProps {
  onCreateTask?: (title: string, description: string) => void
  onSaveToNotes?: (title: string, content: string) => void
}

const ALL_CONTENT_TYPES: ContentType[] = ['video', 'article']

export function RadarPage({ onCreateTask, onSaveToNotes }: RadarPageProps) {
  const [activeTab, setActiveTab] = useState<RadarTab>('dashboard')
  const [topics, setTopics] = useState<Topic[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [advisors, setAdvisors] = useState<Advisor[]>([])
  const [items, setItems] = useState<ContentItemWithInteraction[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(ALL_CONTENT_TYPES)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Modals
  const [deepDiveOpen, setDeepDiveOpen] = useState(false)
  const [deepDiveLoading, setDeepDiveLoading] = useState(false)
  const [deepDiveItem, setDeepDiveItem] = useState<ContentItemWithInteraction | null>(null)
  const [deepDiveAnalysis, setDeepDiveAnalysis] = useState<DeepDiveAnalysis | null>(null)
  const [addSourceOpen, setAddSourceOpen] = useState(false)

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [topicsData, contentData, advisorsData] = await Promise.all([
        radarService.fetchTopics(),
        radarService.fetchContent({ topicSlug: selectedTopic || undefined, search: searchQuery || undefined }),
        radarService.fetchAdvisors(),
      ])
      setTopics(topicsData)
      setItems(contentData)
      setAdvisors(advisorsData)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [selectedTopic, searchQuery])

  const fetchSources = useCallback(async () => {
    try {
      const [sourcesData, topicsData] = await Promise.all([
        radarService.fetchSources(),
        radarService.fetchTopics(),
      ])
      setSources(sourcesData)
      setTopics(topicsData)
    } catch (error) {
      console.error('Failed to fetch sources:', error)
    }
  }, [])

  const fetchSavedItems = useCallback(async () => {
    setIsLoading(true)
    try {
      const savedData = await radarService.fetchContent({ savedOnly: true, search: searchQuery || undefined })
      setItems(savedData)
    } catch (error) {
      console.error('Failed to fetch saved items:', error)
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery])

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchData()
    } else if (activeTab === 'sources') {
      fetchSources()
    } else if (activeTab === 'saved') {
      fetchSavedItems()
    } else if (activeTab === 'experts') {
      radarService.fetchAdvisors().then(setAdvisors)
      radarService.fetchTopics().then(setTopics)
    }
  }, [activeTab, fetchData, fetchSources, fetchSavedItems])

  // Content type filter
  const filteredItems = useMemo(() => {
    if (selectedTypes.length === ALL_CONTENT_TYPES.length) {
      return items
    }
    return items.filter((item) => {
      const itemType = item.type === 'tweet' ? 'post' : item.type
      return selectedTypes.includes(itemType as ContentType)
    })
  }, [items, selectedTypes])

  const handleToggleType = (type: ContentType) => {
    setSelectedTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev
        return prev.filter((t) => t !== type)
      }
      return [...prev, type]
    })
  }

  const handleToggleAllTypes = () => {
    if (selectedTypes.length === ALL_CONTENT_TYPES.length) {
      setSelectedTypes([ALL_CONTENT_TYPES[0]])
    } else {
      setSelectedTypes([...ALL_CONTENT_TYPES])
    }
  }

  const handleRefreshFeeds = async () => {
    setIsRefreshing(true)
    try {
      await radarService.refreshFeeds()
      await fetchData()
    } catch (error) {
      console.error('Failed to refresh feeds:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Interactions
  const handleLike = async (id: string) => {
    await radarService.toggleLike(id)
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              interaction: {
                ...item.interaction,
                id: item.interaction?.id || '',
                account_id: item.interaction?.account_id || '',
                content_item_id: id,
                is_liked: !item.interaction?.is_liked,
                is_saved: item.interaction?.is_saved || false,
                notes: item.interaction?.notes || null,
                read_at: item.interaction?.read_at || null,
                created_at: item.interaction?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            }
          : item
      )
    )
  }

  const handleSave = async (id: string) => {
    await radarService.toggleSave(id)
    if (activeTab === 'saved') {
      // Remove from list when unsaving
      setItems((prev) => prev.filter((item) => item.id !== id))
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                interaction: {
                  ...item.interaction,
                  id: item.interaction?.id || '',
                  account_id: item.interaction?.account_id || '',
                  content_item_id: id,
                  is_liked: item.interaction?.is_liked || false,
                  is_saved: !item.interaction?.is_saved,
                  notes: item.interaction?.notes || null,
                  read_at: item.interaction?.read_at || null,
                  created_at: item.interaction?.created_at || new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              }
            : item
        )
      )
    }
  }

  const handleAddNote = async (id: string, note: string) => {
    await radarService.addNote(id, note)
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              interaction: {
                ...item.interaction,
                id: item.interaction?.id || '',
                account_id: item.interaction?.account_id || '',
                content_item_id: id,
                is_liked: item.interaction?.is_liked || false,
                is_saved: item.interaction?.is_saved || false,
                notes: note,
                read_at: item.interaction?.read_at || null,
                created_at: item.interaction?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            }
          : item
      )
    )
  }

  const handleDismiss = async (id: string) => {
    await radarService.deleteContent(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleDeepDive = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return

    setDeepDiveItem(item)
    setDeepDiveOpen(true)
    setDeepDiveLoading(true)
    setDeepDiveAnalysis(null)

    try {
      const analysis = await radarService.getDeepDiveAnalysis(id)
      setDeepDiveAnalysis(analysis)
    } catch (error) {
      console.error('Failed to get deep dive:', error)
    } finally {
      setDeepDiveLoading(false)
    }
  }

  const handleCreateTask = (item: ContentItemWithInteraction) => {
    onCreateTask?.(`Research: ${item.title}`, item.summary || '')
  }

  const handleSaveToNotes = (item: ContentItemWithInteraction) => {
    onSaveToNotes?.(item.title, item.summary || item.content || '')
  }

  // Source management
  const handleAddSource = async (source: {
    name: string
    type: 'rss' | 'youtube' | 'twitter'
    url: string
    channel_id?: string
    username?: string
    topic_id?: string
    image_url?: string
    description?: string
  }) => {
    const newSource = await radarService.createSource(source)
    if (newSource) {
      setSources((prev) => [newSource, ...prev])
      // Trigger feed fetch for the new source
      await radarService.refreshFeeds(newSource.id)
    }
  }

  const handleDeleteSource = async (id: string) => {
    if (!confirm('Are you sure you want to delete this source?')) return
    await radarService.deleteSource(id)
    setSources((prev) => prev.filter((s) => s.id !== id))
  }

  const handleRefreshSource = async (source: Source) => {
    await radarService.refreshFeeds(source.id)
    await fetchSources()
  }

  // Expert management
  const handleDeleteAdvisor = async (id: string) => {
    if (!confirm('Are you sure you want to unfollow this expert?')) return
    await radarService.deleteAdvisor(id)
    setAdvisors((prev) => prev.filter((a) => a.id !== id))
  }

  const typeIcons: Record<string, React.ComponentType<any>> = { rss: Rss, youtube: Youtube, twitter: Twitter }
  const typeColors: Record<string, string> = { rss: '#f97316', youtube: '#ef4444', twitter: '#3b82f6' }
  const platformIcons: Record<string, React.ComponentType<any>> = { twitter: Twitter, youtube: Youtube }
  const platformColors: Record<string, string> = { twitter: '#3b82f6', linkedin: '#0077b5', youtube: '#ef4444' }
  const platformUrls: Record<string, (u: string) => string> = {
    twitter: (u) => `https://x.com/${u}`,
    linkedin: (u) => `https://linkedin.com/in/${u}`,
    youtube: (u) => `https://youtube.com/@${u}`,
  }

  const tabs = [
    { id: 'dashboard' as RadarTab, label: 'Dashboard', icon: Rss },
    { id: 'sources' as RadarTab, label: 'Sources', icon: Rss },
    { id: 'experts' as RadarTab, label: 'Experts', icon: Users },
    { id: 'saved' as RadarTab, label: 'Saved', icon: Bookmark },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--fl-color-bg-base)' }}>
      {/* Header */}
      <div className="flex-shrink-0 border-b" style={{ borderColor: 'var(--fl-color-border)', background: 'var(--fl-color-bg-surface)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                placeholder="Search content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="radar-glass-input pl-10 w-64"
              />
            </div>
          </div>

          {activeTab === 'dashboard' && (
            <button
              onClick={handleRefreshFeeds}
              disabled={isRefreshing}
              className="radar-glass-button flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}

          {activeTab === 'sources' && (
            <button
              onClick={() => setAddSourceOpen(true)}
              className="radar-glass-button flex items-center gap-2 bg-[#0ea5e9] hover:bg-[#0ea5e9]/80"
            >
              <Plus className="w-4 h-4" />
              <span>Add Source</span>
            </button>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex items-center px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#0ea5e9] text-[#0ea5e9]'
                  : 'border-transparent text-white/60 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Dashboard */}
        {activeTab === 'dashboard' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <TopicFilter
                topics={topics}
                selectedTopic={selectedTopic}
                onSelectTopic={setSelectedTopic}
              />
            </div>

            <div className="mb-6">
              <ContentTypeFilter
                selectedTypes={selectedTypes}
                onToggleType={handleToggleType}
                onToggleAll={handleToggleAllTypes}
              />
            </div>

            <CardStream
              items={filteredItems}
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              onLike={handleLike}
              onSave={handleSave}
              onAddNote={handleAddNote}
              onDeepDive={handleDeepDive}
              onDismiss={handleDismiss}
              onCreateTask={handleCreateTask}
              onSaveToNotes={handleSaveToNotes}
            />
          </>
        )}

        {/* Sources */}
        {activeTab === 'sources' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">Sources</h1>
              <p className="text-white/60 mt-1">
                Manage your RSS feeds, YouTube channels, and X accounts
              </p>
            </div>

            {sources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/40">
                <Rss className="w-16 h-16 mb-4" />
                <p className="text-lg">No sources yet</p>
                <p className="text-sm mt-1">Add RSS feeds, YouTube channels, or X accounts to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sources.map((source) => {
                  const Icon = typeIcons[source.type] || Rss
                  return (
                    <div key={source.id} className="radar-glass-card p-4 group">
                      <div className="flex items-start gap-3">
                        {source.image_url ? (
                          <img
                            src={source.image_url}
                            alt={source.name}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className="p-2 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: `${typeColors[source.type]}20` }}
                          >
                            <Icon className="w-5 h-5" style={{ color: typeColors[source.type] }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{source.name}</h3>
                          <p className="text-white/40 text-sm truncate">
                            {source.type === 'twitter' ? `@${source.username}` : source.url}
                          </p>
                        </div>
                        <button
                          onClick={() => {/* TODO: edit */}}
                          className="p-2 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>

                      {source.last_fetched_at && (
                        <p className="text-white/30 text-xs mt-3">
                          Last fetched {formatDistanceToNow(new Date(source.last_fetched_at), { addSuffix: true })}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                        <button
                          onClick={() => handleRefreshSource(source)}
                          className="flex-1 radar-glass-button flex items-center justify-center gap-2 text-sm"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span>Refresh</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSource(source.id)}
                          className="p-2 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Experts */}
        {activeTab === 'experts' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">Experts</h1>
              <p className="text-white/60 mt-1">
                Follow thought leaders and industry experts
              </p>
            </div>

            {advisors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/40">
                <Users className="w-16 h-16 mb-4" />
                <p className="text-lg">No experts yet</p>
                <p className="text-sm mt-1">Follow thought leaders on X, LinkedIn, or YouTube</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {advisors.map((advisor) => {
                  const Icon = platformIcons[advisor.platform] || Users
                  const profileUrl = platformUrls[advisor.platform]?.(advisor.username)

                  return (
                    <div key={advisor.id} className="radar-glass-card p-4">
                      <div className="flex items-start gap-3">
                        {advisor.avatar_url ? (
                          <img
                            src={advisor.avatar_url}
                            alt={advisor.name}
                            className="w-14 h-14 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-[#0ea5e9]/20 flex items-center justify-center">
                            <span className="text-[#0ea5e9] font-semibold text-xl">
                              {advisor.name?.charAt(0) || '?'}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{advisor.name}</h3>
                          <div className="flex items-center gap-1 text-white/40">
                            <Icon className="w-4 h-4" style={{ color: platformColors[advisor.platform] }} />
                            <span className="text-sm">@{advisor.username}</span>
                          </div>
                        </div>
                      </div>

                      {advisor.bio && (
                        <p className="text-white/60 text-sm mt-3 line-clamp-2">{advisor.bio}</p>
                      )}

                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                        <a
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 radar-glass-button flex items-center justify-center gap-2 text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>View Profile</span>
                        </a>
                        <button
                          onClick={() => handleDeleteAdvisor(advisor.id)}
                          className="p-2 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Saved */}
        {activeTab === 'saved' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">Saved Items</h1>
              <p className="text-white/60 mt-1">
                Your bookmarked articles, videos, and posts
              </p>
            </div>

            {!isLoading && items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/40">
                <Bookmark className="w-16 h-16 mb-4" />
                <p className="text-lg">No saved items yet</p>
                <p className="text-sm mt-1">Save content from the dashboard to access it later</p>
              </div>
            ) : (
              <CardStream
                items={items}
                isLoading={isLoading}
                onLike={handleLike}
                onSave={handleSave}
                onAddNote={handleAddNote}
                onCreateTask={handleCreateTask}
                onSaveToNotes={handleSaveToNotes}
              />
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <DeepDiveModal
        isOpen={deepDiveOpen}
        onClose={() => setDeepDiveOpen(false)}
        title={deepDiveItem?.title || ''}
        analysis={deepDiveAnalysis}
        isLoading={deepDiveLoading}
      />

      <AddSourceModal
        isOpen={addSourceOpen}
        onClose={() => setAddSourceOpen(false)}
        onAdd={handleAddSource}
        topics={topics}
      />
    </div>
  )
}
