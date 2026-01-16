import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

export interface SyncQueueItem {
  id: string
  type: 'note' | 'folder'
  action: 'create' | 'update' | 'delete'
  entityId: string
  data: Record<string, unknown>
  timestamp: string
  retryCount: number
}

interface SyncState {
  status: SyncStatus
  lastSyncedAt: string | null
  queue: SyncQueueItem[]
  isOnline: boolean
  error: string | null

  // Actions
  setStatus: (status: SyncStatus) => void
  setError: (error: string | null) => void
  setOnline: (online: boolean) => void
  addToQueue: (item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>) => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  updateLastSynced: () => void
  incrementRetry: (id: string) => void
  getQueueForEntity: (type: 'note' | 'folder', entityId: string) => SyncQueueItem | undefined
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      status: 'synced',
      lastSyncedAt: null,
      queue: [],
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      error: null,

      setStatus: (status) => set({ status }),

      setError: (error) => set({ error, status: error ? 'error' : get().status }),

      setOnline: (online) => {
        const queue = get().queue
        set({
          isOnline: online,
          status: online
            ? queue.length > 0
              ? 'syncing'
              : 'synced'
            : 'offline',
        })
      },

      addToQueue: (item) => {
        const queueItem: SyncQueueItem = {
          ...item,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          retryCount: 0,
        }

        set((state) => {
          // If there's already a pending action for this entity, replace it
          const filteredQueue = state.queue.filter(
            (q) => !(q.type === item.type && q.entityId === item.entityId)
          )

          return {
            queue: [...filteredQueue, queueItem],
            status: 'syncing',
          }
        })
      },

      removeFromQueue: (id) => {
        set((state) => {
          const newQueue = state.queue.filter((item) => item.id !== id)
          return {
            queue: newQueue,
            status: newQueue.length === 0 ? 'synced' : 'syncing',
          }
        })
      },

      clearQueue: () => set({ queue: [], status: 'synced' }),

      updateLastSynced: () => set({ lastSyncedAt: new Date().toISOString() }),

      incrementRetry: (id) => {
        set((state) => ({
          queue: state.queue.map((item) =>
            item.id === id ? { ...item, retryCount: item.retryCount + 1 } : item
          ),
        }))
      },

      getQueueForEntity: (type, entityId) => {
        return get().queue.find((q) => q.type === type && q.entityId === entityId)
      },
    }),
    {
      name: 'ai-notetaker-sync',
      partialize: (state) => ({
        queue: state.queue,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
)
