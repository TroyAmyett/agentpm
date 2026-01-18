// Radar service - direct Supabase queries for Radar functionality

import { supabase } from '@/services/supabase/client'
import type {
  Topic,
  Source,
  Advisor,
  ContentItemWithInteraction,
} from '@/types/radar'

// Get account ID from the account store
function getAccountId(): string {
  // Import dynamically to avoid circular deps
  const { useAccountStore } = require('@/stores/accountStore')
  return useAccountStore.getState().currentAccountId || 'default-account'
}

// Topics
export async function fetchTopics(): Promise<Topic[]> {
  if (!supabase) return []

  const accountId = getAccountId()
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('account_id', accountId)
    .order('name')

  if (error) {
    console.error('Error fetching topics:', error)
    return []
  }

  return data || []
}

export async function createTopic(topic: { name: string; color?: string; icon?: string }): Promise<Topic | null> {
  if (!supabase) return null

  const accountId = getAccountId()
  const { data, error } = await supabase
    .from('topics')
    .insert({
      account_id: accountId,
      name: topic.name,
      slug: topic.name.toLowerCase().replace(/\s+/g, '-'),
      color: topic.color,
      icon: topic.icon,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating topic:', error)
    return null
  }

  return data
}

// Sources
export async function fetchSources(): Promise<Source[]> {
  if (!supabase) return []

  const accountId = getAccountId()
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching sources:', error)
    return []
  }

  return data || []
}

export async function createSource(source: {
  name: string
  type: 'rss' | 'youtube' | 'twitter'
  url: string
  channel_id?: string
  username?: string
  topic_id?: string
  image_url?: string
  description?: string
}): Promise<Source | null> {
  if (!supabase) return null

  const accountId = getAccountId()
  const { data, error } = await supabase
    .from('sources')
    .insert({
      account_id: accountId,
      ...source,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating source:', error)
    return null
  }

  return data
}

export async function updateSource(id: string, updates: Partial<Source>): Promise<Source | null> {
  if (!supabase) return null

  const accountId = getAccountId()
  const { data, error } = await supabase
    .from('sources')
    .update(updates)
    .eq('id', id)
    .eq('account_id', accountId)
    .select()
    .single()

  if (error) {
    console.error('Error updating source:', error)
    return null
  }

  return data
}

export async function deleteSource(id: string): Promise<boolean> {
  if (!supabase) return false

  const accountId = getAccountId()
  const { error } = await supabase
    .from('sources')
    .delete()
    .eq('id', id)
    .eq('account_id', accountId)

  if (error) {
    console.error('Error deleting source:', error)
    return false
  }

  return true
}

// Advisors (Experts)
export async function fetchAdvisors(): Promise<Advisor[]> {
  if (!supabase) return []

  const accountId = getAccountId()
  const { data, error } = await supabase
    .from('advisors')
    .select('*')
    .eq('account_id', accountId)
    .order('name')

  if (error) {
    console.error('Error fetching advisors:', error)
    return []
  }

  return data || []
}

export async function createAdvisor(advisor: {
  name: string
  platform: 'twitter' | 'linkedin' | 'youtube'
  username: string
  avatar_url?: string
  bio?: string
  topic_id?: string
}): Promise<Advisor | null> {
  if (!supabase) return null

  const accountId = getAccountId()
  const { data, error } = await supabase
    .from('advisors')
    .insert({
      account_id: accountId,
      ...advisor,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating advisor:', error)
    return null
  }

  return data
}

export async function updateAdvisor(id: string, updates: Partial<Advisor>): Promise<Advisor | null> {
  if (!supabase) return null

  const accountId = getAccountId()
  const { data, error } = await supabase
    .from('advisors')
    .update(updates)
    .eq('id', id)
    .eq('account_id', accountId)
    .select()
    .single()

  if (error) {
    console.error('Error updating advisor:', error)
    return null
  }

  return data
}

export async function deleteAdvisor(id: string): Promise<boolean> {
  if (!supabase) return false

  const accountId = getAccountId()
  const { error } = await supabase
    .from('advisors')
    .delete()
    .eq('id', id)
    .eq('account_id', accountId)

  if (error) {
    console.error('Error deleting advisor:', error)
    return false
  }

  return true
}

// Content
export async function fetchContent(options?: {
  topicSlug?: string
  search?: string
  savedOnly?: boolean
  limit?: number
  offset?: number
}): Promise<ContentItemWithInteraction[]> {
  if (!supabase) return []

  const accountId = getAccountId()
  const limit = options?.limit || 50
  const offset = options?.offset || 0

  let query = supabase
    .from('content_items')
    .select(`
      *,
      topic:topics(*),
      source:sources(*),
      advisor:advisors(*),
      interaction:content_interactions(*)
    `)
    .eq('account_id', accountId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (options?.topicSlug) {
    // First get the topic ID
    const { data: topic } = await supabase
      .from('topics')
      .select('id')
      .eq('account_id', accountId)
      .eq('slug', options.topicSlug)
      .single()

    if (topic) {
      query = query.eq('topic_id', topic.id)
    }
  }

  if (options?.search) {
    query = query.or(`title.ilike.%${options.search}%,summary.ilike.%${options.search}%,content.ilike.%${options.search}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching content:', error)
    return []
  }

  // Transform data to include interaction as a single object
  let transformedData = (data || []).map((item) => ({
    ...item,
    interaction: Array.isArray(item.interaction)
      ? item.interaction[0] || null
      : item.interaction,
  }))

  // Filter by saved if needed
  if (options?.savedOnly) {
    transformedData = transformedData.filter(
      (item) => item.interaction?.is_saved
    )
  }

  return transformedData
}

export async function deleteContent(id: string): Promise<boolean> {
  if (!supabase) return false

  const accountId = getAccountId()
  const { error } = await supabase
    .from('content_items')
    .delete()
    .eq('id', id)
    .eq('account_id', accountId)

  if (error) {
    console.error('Error deleting content:', error)
    return false
  }

  return true
}

// Interactions
export async function toggleLike(contentItemId: string): Promise<boolean> {
  if (!supabase) return false

  const accountId = getAccountId()

  // Check if interaction exists
  const { data: existing } = await supabase
    .from('content_interactions')
    .select('*')
    .eq('account_id', accountId)
    .eq('content_item_id', contentItemId)
    .single()

  if (existing) {
    // Toggle like
    const { error } = await supabase
      .from('content_interactions')
      .update({ is_liked: !existing.is_liked, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) {
      console.error('Error toggling like:', error)
      return false
    }
  } else {
    // Create new interaction with like
    const { error } = await supabase
      .from('content_interactions')
      .insert({
        account_id: accountId,
        content_item_id: contentItemId,
        is_liked: true,
        is_saved: false,
      })

    if (error) {
      console.error('Error creating like interaction:', error)
      return false
    }
  }

  return true
}

export async function toggleSave(contentItemId: string): Promise<boolean> {
  if (!supabase) return false

  const accountId = getAccountId()

  // Check if interaction exists
  const { data: existing } = await supabase
    .from('content_interactions')
    .select('*')
    .eq('account_id', accountId)
    .eq('content_item_id', contentItemId)
    .single()

  if (existing) {
    // Toggle save
    const { error } = await supabase
      .from('content_interactions')
      .update({ is_saved: !existing.is_saved, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) {
      console.error('Error toggling save:', error)
      return false
    }
  } else {
    // Create new interaction with save
    const { error } = await supabase
      .from('content_interactions')
      .insert({
        account_id: accountId,
        content_item_id: contentItemId,
        is_liked: false,
        is_saved: true,
      })

    if (error) {
      console.error('Error creating save interaction:', error)
      return false
    }
  }

  return true
}

export async function addNote(contentItemId: string, note: string): Promise<boolean> {
  if (!supabase) return false

  const accountId = getAccountId()

  // Check if interaction exists
  const { data: existing } = await supabase
    .from('content_interactions')
    .select('*')
    .eq('account_id', accountId)
    .eq('content_item_id', contentItemId)
    .single()

  if (existing) {
    // Update note
    const { error } = await supabase
      .from('content_interactions')
      .update({ notes: note, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) {
      console.error('Error updating note:', error)
      return false
    }
  } else {
    // Create new interaction with note
    const { error } = await supabase
      .from('content_interactions')
      .insert({
        account_id: accountId,
        content_item_id: contentItemId,
        is_liked: false,
        is_saved: false,
        notes: note,
      })

    if (error) {
      console.error('Error creating note interaction:', error)
      return false
    }
  }

  return true
}

// Fetch feeds (triggers background fetch from sources)
export async function refreshFeeds(sourceId?: string): Promise<boolean> {
  // In the embedded version, we'll call the Radar backend API
  // For now, just return true as this requires the Radar server
  console.log('Feed refresh requested', sourceId ? `for source ${sourceId}` : 'for all sources')

  try {
    const baseUrl = import.meta.env.VITE_RADAR_API_URL || 'https://radar.funnelists.com'

    // Fetch RSS feeds
    await fetch(`${baseUrl}/api/fetch-feeds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sourceId ? { source_id: sourceId } : {}),
      credentials: 'include',
    })

    // Fetch YouTube videos
    await fetch(`${baseUrl}/api/fetch-youtube`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sourceId ? { source_id: sourceId } : {}),
      credentials: 'include',
    })

    return true
  } catch (error) {
    console.error('Error refreshing feeds:', error)
    return false
  }
}

// Deep dive analysis
export async function getDeepDiveAnalysis(contentItemId: string): Promise<any> {
  try {
    const baseUrl = import.meta.env.VITE_RADAR_API_URL || 'https://radar.funnelists.com'

    const res = await fetch(`${baseUrl}/api/deep-dive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_item_id: contentItemId }),
      credentials: 'include',
    })

    if (!res.ok) {
      throw new Error('Failed to get deep dive analysis')
    }

    return await res.json()
  } catch (error) {
    console.error('Error getting deep dive:', error)
    return null
  }
}

// Source lookup
export async function lookupSourceUrl(url: string): Promise<any> {
  try {
    const baseUrl = import.meta.env.VITE_RADAR_API_URL || 'https://radar.funnelists.com'

    const res = await fetch(`${baseUrl}/api/sources/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      credentials: 'include',
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to lookup source')
    }

    return await res.json()
  } catch (error) {
    console.error('Error looking up source:', error)
    throw error
  }
}
