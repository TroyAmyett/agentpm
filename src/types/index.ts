import type { JSONContent } from '@tiptap/react'

export type EntityType = 'account' | 'contact' | 'project' | 'milestone' | 'task'

export interface Note {
  id: string
  user_id: string
  title: string
  content: JSONContent | null
  folder_id: string | null
  entity_type: EntityType | null
  entity_id: string | null
  sort_order?: number
  created_at: string
  updated_at: string
}

export interface Folder {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  sort_order?: number
  created_at: string
}

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string | null
}

export interface NoteTag {
  note_id: string
  tag_id: string
}

export interface NoteEmbedding {
  id: string
  note_id: string
  chunk_text: string
  embedding: number[]
  created_at: string
}

export interface User {
  id: string
  email: string
  created_at: string
}

// AI types
export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AIAction {
  id: string
  label: string
  icon: string
  prompt: string
}

// User Templates
export interface UserTemplate {
  id: string
  user_id: string
  name: string
  description: string | null
  icon: string
  category: string | null
  content: JSONContent
  is_favorite: boolean
  created_at: string
  updated_at: string
}

// UI State types
export interface UIState {
  sidebarOpen: boolean
  chatPanelOpen: boolean
  darkMode: boolean
  currentNoteId: string | null
}
