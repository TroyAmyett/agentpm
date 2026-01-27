import { supabase } from './client'
import type { Note, Folder, UserTemplate } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Notes CRUD
export async function fetchNotes(userId: string): Promise<Note[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createNote(note: Omit<Note, 'id' | 'created_at' | 'updated_at'>): Promise<Note> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('notes')
    .insert(note)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('notes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteNote(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Folders CRUD
export async function fetchFolders(userId: string): Promise<Folder[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createFolder(folder: Omit<Folder, 'id' | 'created_at'>): Promise<Folder> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('folders')
    .insert(folder)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateFolder(id: string, updates: Partial<Folder>): Promise<Folder> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('folders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteFolder(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Real-time subscriptions
export function subscribeToNotes(
  userId: string,
  onInsert: (note: Note) => void,
  onUpdate: (note: Note) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (!supabase) return null

  return supabase
    .channel('notes-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notes',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onInsert(payload.new as Note)
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notes',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onUpdate(payload.new as Note)
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'notes',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onDelete((payload.old as { id: string }).id)
    )
    .subscribe()
}

export function subscribeToFolders(
  userId: string,
  onInsert: (folder: Folder) => void,
  onUpdate: (folder: Folder) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (!supabase) return null

  return supabase
    .channel('folders-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'folders',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onInsert(payload.new as Folder)
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'folders',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onUpdate(payload.new as Folder)
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'folders',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onDelete((payload.old as { id: string }).id)
    )
    .subscribe()
}

// User Templates CRUD
export async function fetchUserTemplates(userId: string): Promise<UserTemplate[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('user_templates')
    .select('*')
    .eq('user_id', userId)
    .order('is_favorite', { ascending: false })
    .order('name')

  if (error) throw error
  return data || []
}

export async function createUserTemplate(
  template: Omit<UserTemplate, 'id' | 'created_at' | 'updated_at'>
): Promise<UserTemplate> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('user_templates')
    .insert(template)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateUserTemplate(
  id: string,
  updates: Partial<UserTemplate>
): Promise<UserTemplate> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('user_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteUserTemplate(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('user_templates')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Reorder notes within a folder
export async function reorderNote(
  noteId: string,
  newPosition: number,
  folderId: string | null
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.rpc('reorder_notes_in_folder', {
    p_note_id: noteId,
    p_new_position: newPosition,
    p_folder_id: folderId,
  })

  if (error) {
    // Fallback: direct update if RPC not available
    console.warn('[Database] Reorder RPC not available, using direct update')
    await supabase
      .from('notes')
      .update({ sort_order: newPosition })
      .eq('id', noteId)
  }
}

// Reorder folders within a parent
export async function reorderFolder(
  folderId: string,
  newPosition: number,
  parentId: string | null
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.rpc('reorder_folders_in_parent', {
    p_folder_id: folderId,
    p_new_position: newPosition,
    p_parent_id: parentId,
  })

  if (error) {
    console.warn('[Database] Reorder RPC not available, using direct update')
    await supabase
      .from('folders')
      .update({ sort_order: newPosition })
      .eq('id', folderId)
  }
}
