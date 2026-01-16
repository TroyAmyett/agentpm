import { useEffect, useRef } from 'react'
import { useSyncStore } from '@/stores/syncStore'
import { useAuthStore } from '@/stores/authStore'
import * as db from '@/services/supabase/database'
import type { Note, Folder } from '@/types'

const MAX_RETRIES = 3
const RETRY_DELAY = 5000

export function useSyncQueue() {
  const { queue, removeFromQueue, incrementRetry, isOnline, setStatus, updateLastSynced } = useSyncStore()
  const { user } = useAuthStore()
  const processingRef = useRef(false)

  useEffect(() => {
    if (!user || !isOnline || queue.length === 0 || processingRef.current) return

    const processQueue = async () => {
      processingRef.current = true
      setStatus('syncing')

      for (const item of [...queue]) {
        if (item.retryCount >= MAX_RETRIES) {
          console.warn(`Removing item ${item.id} after ${MAX_RETRIES} retries`)
          removeFromQueue(item.id)
          continue
        }

        try {
          if (item.type === 'note') {
            if (item.action === 'create') {
              const noteData = item.data as unknown as Note
              await db.createNote({
                user_id: user.id,
                title: noteData.title,
                content: noteData.content,
                folder_id: noteData.folder_id,
                entity_type: noteData.entity_type,
                entity_id: noteData.entity_id,
              })
            } else if (item.action === 'update') {
              const { id, ...updates } = item.data as { id: string } & Partial<Note>
              await db.updateNote(id, updates)
            } else if (item.action === 'delete') {
              await db.deleteNote(item.data.id as string)
            }
          } else if (item.type === 'folder') {
            if (item.action === 'create') {
              const folderData = item.data as unknown as Folder
              await db.createFolder({
                user_id: user.id,
                name: folderData.name,
                parent_id: folderData.parent_id,
              })
            } else if (item.action === 'update') {
              const { id, ...updates } = item.data as { id: string } & Partial<Folder>
              await db.updateFolder(id, updates)
            } else if (item.action === 'delete') {
              await db.deleteFolder(item.data.id as string)
            }
          }

          removeFromQueue(item.id)
        } catch (error) {
          console.error(`Failed to process queue item ${item.id}:`, error)
          incrementRetry(item.id)
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
        }
      }

      updateLastSynced()
      processingRef.current = false
    }

    processQueue()
  }, [queue, isOnline, user, removeFromQueue, incrementRetry, setStatus, updateLastSynced])
}
