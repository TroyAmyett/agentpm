// Radar types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Topic {
  id: string
  account_id: string
  name: string
  slug: string
  color: string | null
  icon: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface Source {
  id: string
  account_id: string
  topic_id: string | null
  name: string
  type: 'rss' | 'youtube' | 'twitter'
  url: string
  channel_id: string | null
  username: string | null
  image_url: string | null
  description: string | null
  is_active: boolean
  last_fetched_at: string | null
  created_at: string
  updated_at: string
}

export interface Advisor {
  id: string
  account_id: string
  topic_id: string | null
  name: string
  platform: 'twitter' | 'linkedin' | 'youtube'
  username: string
  avatar_url: string | null
  bio: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ContentItem {
  id: string
  account_id: string
  source_id: string | null
  advisor_id: string | null
  topic_id: string | null
  type: 'article' | 'video' | 'tweet' | 'post'
  title: string
  summary: string | null
  content: string | null
  url: string
  thumbnail_url: string | null
  author: string | null
  published_at: string | null
  duration: number | null
  external_id: string | null
  metadata: Json | null
  created_at: string
  updated_at: string
}

export interface ContentInteraction {
  id: string
  account_id: string
  content_item_id: string
  is_liked: boolean
  is_saved: boolean
  notes: string | null
  read_at: string | null
  created_at: string
  updated_at: string
}

export interface ContentItemWithInteraction extends ContentItem {
  interaction?: ContentInteraction | null
  topic?: Topic | null
  source?: Source | null
  advisor?: Advisor | null
}

export interface DeepDiveAnalysis {
  summary: string
  keyPoints: string[]
  sentiment: number
  sentimentLabel: string
  actionItems: string[]
  relatedTopics: string[]
  implications: string
  recommendations: string[]
}

export type ContentType = 'video' | 'article' | 'post' | 'tweet'
