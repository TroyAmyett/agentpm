import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, RefreshCw, Rss, Bookmark, Users, Plus, Trash2, Pencil, ExternalLink, Youtube, Twitter, Flame, Save, Palette, Mail, Clock, Settings } from 'lucide-react'
import type { Topic, Source, Advisor, ContentItemWithInteraction, ContentType, DeepDiveAnalysis } from '@/types/radar'
import * as radarService from '@/services/radar'
import type { DigestPreferences } from '@/services/radar/radarService'
import { CardStream } from './CardStream'
import { TopicFilter } from './TopicFilter'
import { ContentTypeFilter } from './ContentTypeFilter'
import { DeepDiveModal, AddSourceModal } from './modals'
import { RadarSidebar, type RadarTab } from './RadarSidebar'
import { formatDistanceToNow } from 'date-fns'

const iconOptions = ['bot', 'sparkles', 'link', 'users', 'play', 'globe', 'code', 'database']
const colorOptions = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']

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

  // Settings - Topics
  const [newTopicName, setNewTopicName] = useState('')
  const [newTopicColor, setNewTopicColor] = useState('#0ea5e9')
  const [newTopicIcon, setNewTopicIcon] = useState('sparkles')
  const [isAddingTopic, setIsAddingTopic] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [isUpdatingTopic, setIsUpdatingTopic] = useState(false)

  // Settings - Digest Preferences
  const [digestPrefs, setDigestPrefs] = useState<DigestPreferences>({
    digest_enabled: true,
    digest_frequency: 'daily',
    digest_time: '06:00',
    digest_timezone: 'America/New_York',
    digest_topics: [],
    email_address: null,
  })
  const [isSavingPrefs, setIsSavingPrefs] = useState(false)
  const [prefsSaved, setPrefsSaved] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)

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

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const [topicsData, prefsData] = await Promise.all([
        radarService.fetchTopics(),
        radarService.fetchPreferences(),
      ])
      setTopics(topicsData)
      if (prefsData) {
        setDigestPrefs({
          digest_enabled: prefsData.digest_enabled ?? true,
          digest_frequency: prefsData.digest_frequency || 'daily',
          digest_time: prefsData.digest_time?.substring(0, 5) || '06:00',
          digest_timezone: prefsData.digest_timezone || 'America/New_York',
          digest_topics: prefsData.digest_topics || [],
          email_address: prefsData.email_address || null,
        })
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      setSettingsLoading(false)
    }
  }, [])

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
    } else if (activeTab === 'settings') {
      fetchSettings()
    }
  }, [activeTab, fetchData, fetchSources, fetchSavedItems, fetchSettings])

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

  // Topic management
  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTopicName.trim()) return

    setIsAddingTopic(true)
    try {
      const newTopic = await radarService.createTopic({
        name: newTopicName,
        color: newTopicColor,
        icon: newTopicIcon,
      })
      if (newTopic) {
        setTopics((prev) => [...prev, newTopic])
        setNewTopicName('')
      }
    } catch (error) {
      console.error('Failed to add topic:', error)
    } finally {
      setIsAddingTopic(false)
    }
  }

  const handleEditTopic = (topic: Topic) => {
    setEditingTopic(topic)
    setEditName(topic.name)
    setEditColor(topic.color || '#0ea5e9')
    setEditIcon(topic.icon || 'sparkles')
  }

  const handleUpdateTopic = async () => {
    if (!editingTopic || !editName.trim()) return

    setIsUpdatingTopic(true)
    try {
      const updatedTopic = await radarService.updateTopic(editingTopic.id, {
        name: editName,
        color: editColor,
        icon: editIcon,
      })
      if (updatedTopic) {
        setTopics((prev) =>
          prev.map((t) => (t.id === updatedTopic.id ? updatedTopic : t))
        )
        setEditingTopic(null)
      }
    } catch (error) {
      console.error('Failed to update topic:', error)
    } finally {
      setIsUpdatingTopic(false)
    }
  }

  const handleDeleteTopic = async (topicId: string) => {
    if (!confirm('Are you sure you want to delete this topic? This will unlink all associated content.')) {
      return
    }

    try {
      await radarService.deleteTopic(topicId)
      setTopics((prev) => prev.filter((t) => t.id !== topicId))
    } catch (error) {
      console.error('Failed to delete topic:', error)
    }
  }

  // Digest preferences
  const handleSaveDigestPrefs = async () => {
    setIsSavingPrefs(true)
    setPrefsSaved(false)
    try {
      await radarService.savePreferences({
        ...digestPrefs,
        digest_time: digestPrefs.digest_time + ':00',
      })
      setPrefsSaved(true)
      setTimeout(() => setPrefsSaved(false), 3000)
    } catch (error) {
      console.error('Failed to save preferences:', error)
    } finally {
      setIsSavingPrefs(false)
    }
  }

  const toggleTopicInDigest = (topicSlug: string) => {
    setDigestPrefs((prev) => ({
      ...prev,
      digest_topics: prev.digest_topics.includes(topicSlug)
        ? prev.digest_topics.filter((t) => t !== topicSlug)
        : [...prev.digest_topics, topicSlug],
    }))
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

  return (
    <div className="flex h-full" style={{ background: 'var(--fl-color-bg-base)' }}>
      {/* Sidebar */}
      <RadarSidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Content Header - Actions bar */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b"
          style={{ borderColor: 'var(--fl-color-border)', background: 'var(--fl-color-bg-surface)' }}
        >
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

          {/* Action buttons based on current tab */}
          <div className="flex items-center gap-2">
            {(activeTab === 'dashboard' || activeTab === 'whats-hot') && (
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
        </div>

        {/* Content Area */}
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

          {/* What's Hot */}
          {activeTab === 'whats-hot' && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold flex items-center gap-2">
                  <Flame className="w-6 h-6 text-orange-500" />
                  What's Hot
                </h1>
                <p className="text-white/60 mt-1">
                  Trending content and most engaging items from your sources
                </p>
              </div>

              <div className="mb-6">
                <ContentTypeFilter
                  selectedTypes={selectedTypes}
                  onToggleType={handleToggleType}
                  onToggleAll={handleToggleAllTypes}
                />
              </div>

              {/* Show most liked/saved content sorted by engagement */}
              <CardStream
                items={filteredItems.slice().sort((a, b) => {
                  const aScore = (a.interaction?.is_liked ? 1 : 0) + (a.interaction?.is_saved ? 1 : 0)
                  const bScore = (b.interaction?.is_liked ? 1 : 0) + (b.interaction?.is_saved ? 1 : 0)
                  return bScore - aScore
                })}
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

          {/* Settings */}
          {activeTab === 'settings' && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Settings</h1>
                <p className="text-white/60 mt-1">Manage your topics and preferences</p>
              </div>

              <div className="max-w-2xl">
                {/* Topics Section */}
                <section className="radar-glass-card p-6 mb-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-[#0ea5e9]/20">
                      <Palette className="w-5 h-5 text-[#0ea5e9]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Topics</h2>
                      <p className="text-white/60 text-sm">
                        Organize your content with custom topics
                      </p>
                    </div>
                  </div>

                  {/* Add Topic Form */}
                  <form onSubmit={handleAddTopic} className="mb-6 p-4 rounded-lg bg-white/5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm text-white/60 mb-2">Name</label>
                        <input
                          type="text"
                          value={newTopicName}
                          onChange={(e) => setNewTopicName(e.target.value)}
                          placeholder="Topic name"
                          className="radar-glass-input w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-white/60 mb-2">Color</label>
                        <div className="flex gap-2 flex-wrap">
                          {colorOptions.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setNewTopicColor(color)}
                              className={`w-8 h-8 rounded-full transition-transform ${
                                newTopicColor === color ? 'scale-110 ring-2 ring-white' : ''
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm text-white/60 mb-2">Icon</label>
                        <select
                          value={newTopicIcon}
                          onChange={(e) => setNewTopicIcon(e.target.value)}
                          className="radar-glass-input w-full"
                        >
                          {iconOptions.map((icon) => (
                            <option key={icon} value={icon}>
                              {icon}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isAddingTopic || !newTopicName.trim()}
                      className="radar-glass-button flex items-center gap-2 bg-[#0ea5e9] hover:bg-[#0ea5e9]/80 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{isAddingTopic ? 'Adding...' : 'Add Topic'}</span>
                    </button>
                  </form>

                  {/* Topics List */}
                  {settingsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {topics.map((topic) => (
                        <div key={topic.id}>
                          {editingTopic?.id === topic.id ? (
                            // Edit Mode
                            <div className="p-4 rounded-lg bg-white/10 border border-[#0ea5e9]/50">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                  <label className="block text-sm text-white/60 mb-2">Name</label>
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="radar-glass-input w-full"
                                  />
                                </div>

                                <div>
                                  <label className="block text-sm text-white/60 mb-2">Color</label>
                                  <div className="flex gap-2 flex-wrap">
                                    {colorOptions.map((color) => (
                                      <button
                                        key={color}
                                        type="button"
                                        onClick={() => setEditColor(color)}
                                        className={`w-8 h-8 rounded-full transition-transform ${
                                          editColor === color ? 'scale-110 ring-2 ring-white' : ''
                                        }`}
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-sm text-white/60 mb-2">Icon</label>
                                  <select
                                    value={editIcon}
                                    onChange={(e) => setEditIcon(e.target.value)}
                                    className="radar-glass-input w-full"
                                  >
                                    {iconOptions.map((icon) => (
                                      <option key={icon} value={icon}>
                                        {icon}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={handleUpdateTopic}
                                  disabled={isUpdatingTopic || !editName.trim()}
                                  className="px-4 py-2 bg-[#0ea5e9] text-white rounded-lg hover:bg-[#0ea5e9]/80 disabled:opacity-50"
                                >
                                  {isUpdatingTopic ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={() => setEditingTopic(null)}
                                  className="px-4 py-2 radar-glass-button"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            // View Mode
                            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 group hover:bg-white/10 transition-colors">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: topic.color || '#0ea5e9' }}
                                />
                                <span className="font-medium">{topic.name}</span>
                                {topic.is_default && (
                                  <span className="text-xs text-white/40 px-2 py-0.5 rounded bg-white/10">
                                    Default
                                  </span>
                                )}
                              </div>

                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleEditTopic(topic)}
                                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
                                  title="Edit topic"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTopic(topic.id)}
                                  className="p-2 rounded-lg hover:bg-red-500/20 text-white/60 hover:text-red-400"
                                  title="Delete topic"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Email Digest Section */}
                <section className="radar-glass-card p-6 mb-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-purple-500/20">
                      <Mail className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Email Digests</h2>
                      <p className="text-white/60 text-sm">
                        Get daily or weekly summaries delivered to your inbox
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Enable/Disable */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <div>
                        <p className="font-medium">Enable Email Digests</p>
                        <p className="text-white/60 text-sm">
                          Receive curated content summaries by email
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={digestPrefs.digest_enabled}
                          onChange={(e) =>
                            setDigestPrefs((p) => ({ ...p, digest_enabled: e.target.checked }))
                          }
                        />
                        <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0ea5e9]"></div>
                      </label>
                    </div>

                    {digestPrefs.digest_enabled && (
                      <>
                        {/* Email Address */}
                        <div className="p-4 rounded-lg bg-white/5">
                          <label className="block text-sm font-medium mb-2">Email Address</label>
                          <input
                            type="email"
                            value={digestPrefs.email_address || ''}
                            onChange={(e) =>
                              setDigestPrefs((p) => ({ ...p, email_address: e.target.value }))
                            }
                            placeholder="your@email.com"
                            className="radar-glass-input w-full"
                          />
                        </div>

                        {/* Frequency */}
                        <div className="p-4 rounded-lg bg-white/5">
                          <label className="block text-sm font-medium mb-2">Frequency</label>
                          <div className="flex gap-2">
                            {(['daily', 'weekly', 'both'] as const).map((freq) => (
                              <button
                                key={freq}
                                type="button"
                                onClick={() => setDigestPrefs((p) => ({ ...p, digest_frequency: freq }))}
                                className={`flex-1 py-2 px-4 rounded-lg transition-all ${
                                  digestPrefs.digest_frequency === freq
                                    ? 'bg-[#0ea5e9] text-white'
                                    : 'radar-glass-button text-white/70'
                                }`}
                              >
                                {freq.charAt(0).toUpperCase() + freq.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Time */}
                        <div className="p-4 rounded-lg bg-white/5">
                          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Delivery Time
                          </label>
                          <input
                            type="time"
                            value={digestPrefs.digest_time}
                            onChange={(e) =>
                              setDigestPrefs((p) => ({ ...p, digest_time: e.target.value }))
                            }
                            className="radar-glass-input w-full"
                          />
                          <p className="text-white/40 text-xs mt-2">
                            Timezone: {digestPrefs.digest_timezone}
                          </p>
                        </div>

                        {/* Topics to Include */}
                        <div className="p-4 rounded-lg bg-white/5">
                          <label className="block text-sm font-medium mb-2">
                            Topics to Include (leave empty for all)
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {topics.map((topic) => (
                              <button
                                key={topic.id}
                                type="button"
                                onClick={() => toggleTopicInDigest(topic.slug)}
                                className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                                  digestPrefs.digest_topics.includes(topic.slug)
                                    ? 'text-white'
                                    : 'bg-white/10 text-white/60'
                                }`}
                                style={{
                                  backgroundColor: digestPrefs.digest_topics.includes(topic.slug)
                                    ? topic.color || '#0ea5e9'
                                    : undefined,
                                }}
                              >
                                {topic.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Save Button */}
                    <button
                      onClick={handleSaveDigestPrefs}
                      disabled={isSavingPrefs}
                      className="w-full py-3 bg-[#0ea5e9] text-white rounded-lg font-medium hover:bg-[#0ea5e9]/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {isSavingPrefs ? 'Saving...' : prefsSaved ? 'Saved!' : 'Save Digest Preferences'}
                    </button>
                  </div>
                </section>

                {/* Preferences Section */}
                <section className="radar-glass-card p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-[#0ea5e9]/20">
                      <Settings className="w-5 h-5 text-[#0ea5e9]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Preferences</h2>
                      <p className="text-white/60 text-sm">
                        Customize your experience
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <div>
                        <p className="font-medium">Auto-refresh feeds</p>
                        <p className="text-white/60 text-sm">
                          Automatically fetch new content periodically
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0ea5e9]"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                      <div>
                        <p className="font-medium">Show read items</p>
                        <p className="text-white/60 text-sm">
                          Display items you've already viewed
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0ea5e9]"></div>
                      </label>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
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
