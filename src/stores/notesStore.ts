import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Note, Folder } from '@/types'
import type { JSONContent } from '@tiptap/react'
import * as db from '@/services/supabase/database'
import { useSyncStore } from './syncStore'

interface NotesState {
  notes: Note[]
  folders: Folder[]
  currentNoteId: string | null
  currentFolderId: string | null
  expandedFolders: Set<string>

  // Auth state
  isAuthenticated: boolean
  userId: string | null

  // Note Actions
  addNote: (note: Partial<Note>) => Promise<Note>
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  setCurrentNote: (id: string | null) => void
  getCurrentNote: () => Note | null
  moveNoteToFolder: (noteId: string, folderId: string | null) => Promise<void>

  // Folder Actions
  addFolder: (folder: Partial<Folder>) => Promise<Folder>
  updateFolder: (id: string, updates: Partial<Folder>) => Promise<void>
  deleteFolder: (id: string, deleteContents?: boolean) => Promise<void>
  setCurrentFolder: (id: string | null) => void
  toggleFolderExpanded: (id: string) => void
  moveFolderTo: (folderId: string, newParentId: string | null) => Promise<void>

  // Hierarchy helpers
  getFolderChildren: (parentId: string | null) => Folder[]
  getNotesInFolder: (folderId: string | null) => Note[]
  getFolderPath: (folderId: string) => Folder[]
  getAllDescendantNotes: (folderId: string) => Note[]
  getAllDescendantFolders: (folderId: string) => Folder[]

  searchNotes: (query: string) => Note[]

  // Sync Actions
  setAuthState: (userId: string | null) => void
  loadFromSupabase: (userId: string) => Promise<void>
  migrateLocalData: (userId: string) => Promise<void>
  handleRemoteNoteChange: (note: Note) => void
  handleRemoteNoteDelete: (id: string) => void
  handleRemoteFolderChange: (folder: Folder) => void
  handleRemoteFolderDelete: (id: string) => void
  clearLocalData: () => void
}

const generateId = () => crypto.randomUUID()

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: [],
      folders: [],
      currentNoteId: null,
      currentFolderId: null,
      expandedFolders: new Set<string>(),
      isAuthenticated: false,
      userId: null,

      // Auth state management
      setAuthState: (userId) => {
        set({
          isAuthenticated: !!userId,
          userId,
        })
      },

      // Load data from Supabase
      loadFromSupabase: async (userId) => {
        try {
          useSyncStore.getState().setStatus('syncing')
          const [notes, folders] = await Promise.all([
            db.fetchNotes(userId),
            db.fetchFolders(userId),
          ])
          set({
            notes,
            folders,
            currentNoteId: notes[0]?.id || null,
          })
          useSyncStore.getState().setStatus('synced')
          useSyncStore.getState().updateLastSynced()
        } catch (error) {
          console.error('Failed to load from Supabase:', error)
          useSyncStore.getState().setError(
            error instanceof Error ? error.message : 'Failed to load data'
          )
        }
      },

      // Migrate local data to Supabase
      migrateLocalData: async (userId) => {
        const { notes, folders } = get()

        // Find notes/folders with 'local-user' user_id
        const localNotes = notes.filter((n) => n.user_id === 'local-user')
        const localFolders = folders.filter((f) => f.user_id === 'local-user')

        if (localNotes.length === 0 && localFolders.length === 0) return

        try {
          useSyncStore.getState().setStatus('syncing')

          // Migrate folders first (notes reference them)
          const folderIdMap = new Map<string, string>()

          // Sort folders by depth to ensure parents are created before children
          const sortedFolders = [...localFolders].sort((a, b) => {
            const depthA = get().getFolderPath(a.id).length
            const depthB = get().getFolderPath(b.id).length
            return depthA - depthB
          })

          for (const folder of sortedFolders) {
            const newFolder = await db.createFolder({
              user_id: userId,
              name: folder.name,
              parent_id: folder.parent_id ? folderIdMap.get(folder.parent_id) || null : null,
            })
            folderIdMap.set(folder.id, newFolder.id)
          }

          // Migrate notes
          for (const note of localNotes) {
            await db.createNote({
              user_id: userId,
              title: note.title,
              content: note.content,
              folder_id: note.folder_id ? folderIdMap.get(note.folder_id) || null : null,
              entity_type: note.entity_type || null,
              entity_id: note.entity_id || null,
            })
          }

          // Clear local storage data after successful migration
          localStorage.removeItem('ai-notetaker-storage')

          // Reload from Supabase
          await get().loadFromSupabase(userId)
        } catch (error) {
          console.error('Failed to migrate local data:', error)
          useSyncStore.getState().setError(
            error instanceof Error ? error.message : 'Failed to migrate data'
          )
        }
      },

      // Handle remote changes (last-write-wins)
      handleRemoteNoteChange: (remoteNote) => {
        set((state) => {
          const localNote = state.notes.find((n) => n.id === remoteNote.id)

          // If no local note or remote is newer, use remote
          if (!localNote || new Date(remoteNote.updated_at) > new Date(localNote.updated_at)) {
            return {
              notes: localNote
                ? state.notes.map((n) => (n.id === remoteNote.id ? remoteNote : n))
                : [...state.notes, remoteNote],
            }
          }

          // Local is newer, keep local
          return state
        })
      },

      handleRemoteNoteDelete: (id) => {
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
          currentNoteId: state.currentNoteId === id ? state.notes[0]?.id || null : state.currentNoteId,
        }))
      },

      handleRemoteFolderChange: (remoteFolder) => {
        set((state) => {
          const localFolder = state.folders.find((f) => f.id === remoteFolder.id)
          return {
            folders: localFolder
              ? state.folders.map((f) => (f.id === remoteFolder.id ? remoteFolder : f))
              : [...state.folders, remoteFolder],
          }
        })
      },

      handleRemoteFolderDelete: (id) => {
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
          currentFolderId: state.currentFolderId === id ? null : state.currentFolderId,
        }))
      },

      clearLocalData: () => {
        set({
          notes: [],
          folders: [],
          currentNoteId: null,
          currentFolderId: null,
          expandedFolders: new Set(),
        })
      },

      // Note Actions
      addNote: async (noteData) => {
        const { currentFolderId, isAuthenticated, userId } = get()
        const syncStore = useSyncStore.getState()

        const newNote: Note = {
          id: generateId(),
          user_id: userId || 'local-user',
          title: noteData.title || 'Untitled',
          content: noteData.content || null,
          folder_id: noteData.folder_id ?? currentFolderId,
          entity_type: noteData.entity_type || null,
          entity_id: noteData.entity_id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        // Optimistic update
        set((state) => ({
          notes: [newNote, ...state.notes],
          currentNoteId: newNote.id,
        }))

        // Sync to Supabase if authenticated
        if (isAuthenticated && userId) {
          if (syncStore.isOnline) {
            try {
              const serverNote = await db.createNote({
                user_id: userId,
                title: newNote.title,
                content: newNote.content,
                folder_id: newNote.folder_id,
                entity_type: newNote.entity_type,
                entity_id: newNote.entity_id,
              })
              // Update with server-generated ID
              set((state) => ({
                notes: state.notes.map((n) => (n.id === newNote.id ? serverNote : n)),
                currentNoteId: serverNote.id,
              }))
              return serverNote
            } catch (error) {
              console.error('Failed to create note on server:', error)
              syncStore.addToQueue({
                type: 'note',
                action: 'create',
                entityId: newNote.id,
                data: newNote as unknown as Record<string, unknown>,
              })
            }
          } else {
            syncStore.addToQueue({
              type: 'note',
              action: 'create',
              entityId: newNote.id,
              data: newNote as unknown as Record<string, unknown>,
            })
          }
        }

        return newNote
      },

      updateNote: async (id, updates) => {
        const { isAuthenticated, userId } = get()
        const syncStore = useSyncStore.getState()

        // Optimistic update
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === id
              ? { ...note, ...updates, updated_at: new Date().toISOString() }
              : note
          ),
        }))

        // Sync to Supabase if authenticated
        if (isAuthenticated && userId) {
          if (syncStore.isOnline) {
            try {
              await db.updateNote(id, updates)
            } catch (error) {
              console.error('Failed to update note on server:', error)
              syncStore.addToQueue({
                type: 'note',
                action: 'update',
                entityId: id,
                data: { id, ...updates },
              })
            }
          } else {
            syncStore.addToQueue({
              type: 'note',
              action: 'update',
              entityId: id,
              data: { id, ...updates },
            })
          }
        }
      },

      deleteNote: async (id) => {
        const { isAuthenticated, userId } = get()
        const syncStore = useSyncStore.getState()

        // Optimistic update
        set((state) => {
          const newNotes = state.notes.filter((note) => note.id !== id)
          const newCurrentId = state.currentNoteId === id
            ? newNotes[0]?.id || null
            : state.currentNoteId
          return { notes: newNotes, currentNoteId: newCurrentId }
        })

        // Sync to Supabase if authenticated
        if (isAuthenticated && userId) {
          if (syncStore.isOnline) {
            try {
              await db.deleteNote(id)
            } catch (error) {
              console.error('Failed to delete note on server:', error)
              syncStore.addToQueue({
                type: 'note',
                action: 'delete',
                entityId: id,
                data: { id },
              })
            }
          } else {
            syncStore.addToQueue({
              type: 'note',
              action: 'delete',
              entityId: id,
              data: { id },
            })
          }
        }
      },

      setCurrentNote: (id) => {
        set({ currentNoteId: id })
      },

      getCurrentNote: () => {
        const { notes, currentNoteId } = get()
        return notes.find((n) => n.id === currentNoteId) || null
      },

      moveNoteToFolder: async (noteId, folderId) => {
        await get().updateNote(noteId, { folder_id: folderId })
      },

      // Folder Actions
      addFolder: async (folderData) => {
        const { currentFolderId, isAuthenticated, userId } = get()
        const syncStore = useSyncStore.getState()

        const newFolder: Folder = {
          id: generateId(),
          user_id: userId || 'local-user',
          name: folderData.name || 'New Folder',
          parent_id: folderData.parent_id ?? currentFolderId,
          created_at: new Date().toISOString(),
        }

        // Optimistic update
        set((state) => ({
          folders: [newFolder, ...state.folders],
          expandedFolders: new Set([...state.expandedFolders, newFolder.parent_id || '']),
        }))

        // Sync to Supabase if authenticated
        if (isAuthenticated && userId) {
          if (syncStore.isOnline) {
            try {
              const serverFolder = await db.createFolder({
                user_id: userId,
                name: newFolder.name,
                parent_id: newFolder.parent_id,
              })
              set((state) => ({
                folders: state.folders.map((f) => (f.id === newFolder.id ? serverFolder : f)),
              }))
              return serverFolder
            } catch (error) {
              console.error('Failed to create folder on server:', error)
              syncStore.addToQueue({
                type: 'folder',
                action: 'create',
                entityId: newFolder.id,
                data: newFolder as unknown as Record<string, unknown>,
              })
            }
          } else {
            syncStore.addToQueue({
              type: 'folder',
              action: 'create',
              entityId: newFolder.id,
              data: newFolder as unknown as Record<string, unknown>,
            })
          }
        }

        return newFolder
      },

      updateFolder: async (id, updates) => {
        const { isAuthenticated, userId } = get()
        const syncStore = useSyncStore.getState()

        // Optimistic update
        set((state) => ({
          folders: state.folders.map((folder) =>
            folder.id === id ? { ...folder, ...updates } : folder
          ),
        }))

        // Sync to Supabase if authenticated
        if (isAuthenticated && userId) {
          if (syncStore.isOnline) {
            try {
              await db.updateFolder(id, updates)
            } catch (error) {
              console.error('Failed to update folder on server:', error)
              syncStore.addToQueue({
                type: 'folder',
                action: 'update',
                entityId: id,
                data: { id, ...updates },
              })
            }
          } else {
            syncStore.addToQueue({
              type: 'folder',
              action: 'update',
              entityId: id,
              data: { id, ...updates },
            })
          }
        }
      },

      deleteFolder: async (id, deleteContents = false) => {
        const { getAllDescendantFolders, getAllDescendantNotes, isAuthenticated, userId } = get()
        const syncStore = useSyncStore.getState()
        const descendantFolders = getAllDescendantFolders(id)
        const descendantFolderIds = new Set([id, ...descendantFolders.map((f) => f.id)])
        const descendantNotes = deleteContents ? getAllDescendantNotes(id) : []

        // Optimistic update
        set((state) => {
          let newNotes = state.notes

          if (deleteContents) {
            newNotes = state.notes.filter((note) => !descendantFolderIds.has(note.folder_id || ''))
          } else {
            newNotes = state.notes.map((note) =>
              descendantFolderIds.has(note.folder_id || '') ? { ...note, folder_id: null } : note
            )
          }

          return {
            folders: state.folders.filter((folder) => !descendantFolderIds.has(folder.id)),
            notes: newNotes,
            currentFolderId: descendantFolderIds.has(state.currentFolderId || '') ? null : state.currentFolderId,
          }
        })

        // Sync to Supabase if authenticated
        if (isAuthenticated && userId) {
          if (syncStore.isOnline) {
            try {
              // Delete descendant notes if needed
              if (deleteContents) {
                for (const note of descendantNotes) {
                  await db.deleteNote(note.id)
                }
              } else {
                // Move notes to root
                for (const note of get().notes.filter((n) => descendantFolderIds.has(n.folder_id || ''))) {
                  await db.updateNote(note.id, { folder_id: null })
                }
              }

              // Delete folders (children first)
              const sortedFolders = [...descendantFolders].reverse()
              for (const folder of sortedFolders) {
                await db.deleteFolder(folder.id)
              }
              await db.deleteFolder(id)
            } catch (error) {
              console.error('Failed to delete folder on server:', error)
              syncStore.addToQueue({
                type: 'folder',
                action: 'delete',
                entityId: id,
                data: { id, deleteContents },
              })
            }
          } else {
            syncStore.addToQueue({
              type: 'folder',
              action: 'delete',
              entityId: id,
              data: { id, deleteContents },
            })
          }
        }
      },

      setCurrentFolder: (id) => {
        set({ currentFolderId: id })
      },

      toggleFolderExpanded: (id) => {
        set((state) => {
          const newExpanded = new Set(state.expandedFolders)
          if (newExpanded.has(id)) {
            newExpanded.delete(id)
          } else {
            newExpanded.add(id)
          }
          return { expandedFolders: newExpanded }
        })
      },

      moveFolderTo: async (folderId, newParentId) => {
        // Prevent moving folder into itself or its descendants
        const { getAllDescendantFolders } = get()
        const descendants = getAllDescendantFolders(folderId)
        const descendantIds = new Set(descendants.map((f) => f.id))

        if (newParentId && (newParentId === folderId || descendantIds.has(newParentId))) {
          return // Invalid move
        }

        await get().updateFolder(folderId, { parent_id: newParentId })
      },

      // Hierarchy helpers
      getFolderChildren: (parentId) => {
        const { folders } = get()
        return folders
          .filter((f) => f.parent_id === parentId)
          .sort((a, b) => a.name.localeCompare(b.name))
      },

      getNotesInFolder: (folderId) => {
        const { notes } = get()
        return notes
          .filter((n) => n.folder_id === folderId)
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      },

      getFolderPath: (folderId) => {
        const { folders } = get()
        const path: Folder[] = []
        let currentId: string | null = folderId

        while (currentId) {
          const folder = folders.find((f) => f.id === currentId)
          if (folder) {
            path.unshift(folder)
            currentId = folder.parent_id
          } else {
            break
          }
        }

        return path
      },

      getAllDescendantNotes: (folderId) => {
        const { notes, getAllDescendantFolders } = get()
        const descendantFolders = getAllDescendantFolders(folderId)
        const folderIds = new Set([folderId, ...descendantFolders.map((f) => f.id)])
        return notes.filter((n) => folderIds.has(n.folder_id || ''))
      },

      getAllDescendantFolders: (folderId) => {
        const { folders } = get()
        const result: Folder[] = []
        const queue = [folderId]

        while (queue.length > 0) {
          const parentId = queue.shift()!
          const children = folders.filter((f) => f.parent_id === parentId)
          result.push(...children)
          queue.push(...children.map((f) => f.id))
        }

        return result
      },

      searchNotes: (query) => {
        const { notes } = get()
        const lowerQuery = query.toLowerCase()
        return notes.filter((note) => {
          const titleMatch = note.title.toLowerCase().includes(lowerQuery)
          const contentText = extractTextFromContent(note.content)
          const contentMatch = contentText.toLowerCase().includes(lowerQuery)
          return titleMatch || contentMatch
        })
      },
    }),
    {
      name: 'ai-notetaker-storage',
      partialize: (state) => ({
        notes: state.notes,
        folders: state.folders,
        currentNoteId: state.currentNoteId,
        currentFolderId: state.currentFolderId,
        expandedFolders: Array.from(state.expandedFolders),
      }),
      merge: (persisted: unknown, current) => {
        const persistedState = persisted as {
          notes?: Note[]
          folders?: Folder[]
          currentNoteId?: string | null
          currentFolderId?: string | null
          expandedFolders?: string[]
        } | null

        return {
          ...current,
          ...persistedState,
          expandedFolders: new Set(persistedState?.expandedFolders || []),
        }
      },
    }
  )
)

// Helper to extract text from Tiptap JSON content
function extractTextFromContent(content: JSONContent | null): string {
  if (!content) return ''

  let text = ''

  function traverse(node: JSONContent) {
    if (node.text) {
      text += node.text + ' '
    }
    if (node.content) {
      node.content.forEach(traverse)
    }
  }

  traverse(content)
  return text.trim()
}

// Export helper for getting all notes text (for AI context)
export function getAllNotesText(): string {
  const { notes } = useNotesStore.getState()
  return notes
    .map((note) => {
      const content = extractTextFromContent(note.content)
      return `## ${note.title}\n${content}`
    })
    .join('\n\n---\n\n')
}
