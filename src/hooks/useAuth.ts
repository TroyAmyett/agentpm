import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useNotesStore } from '@/stores/notesStore'
import { useSyncStore } from '@/stores/syncStore'
import * as db from '@/services/supabase/database'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useAuth() {
  const { user, initialized, initialize } = useAuthStore()
  const {
    setAuthState,
    loadFromSupabase,
    migrateLocalData,
    handleRemoteNoteChange,
    handleRemoteNoteDelete,
    handleRemoteFolderChange,
    handleRemoteFolderDelete,
  } = useNotesStore()
  const { setOnline, clearQueue } = useSyncStore()

  const channelsRef = useRef<RealtimeChannel[]>([])
  const hasLoadedRef = useRef(false)

  // Initialize auth on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Set initial status
    setOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOnline])

  // Handle auth state changes and data sync
  useEffect(() => {
    if (!initialized) return

    // Cleanup previous subscriptions
    const cleanupChannels = () => {
      channelsRef.current.forEach((channel) => {
        channel.unsubscribe()
      })
      channelsRef.current = []
    }

    if (user) {
      // Prevent double loading
      if (hasLoadedRef.current) return
      hasLoadedRef.current = true

      setAuthState(user.id)

      // Load data from Supabase, then check for local data to migrate
      loadFromSupabase(user.id).then(() => {
        migrateLocalData(user.id)
      })

      // Set up real-time subscriptions
      const notesChannel = db.subscribeToNotes(
        user.id,
        handleRemoteNoteChange,
        handleRemoteNoteChange,
        handleRemoteNoteDelete
      )

      const foldersChannel = db.subscribeToFolders(
        user.id,
        handleRemoteFolderChange,
        handleRemoteFolderChange,
        handleRemoteFolderDelete
      )

      if (notesChannel) channelsRef.current.push(notesChannel)
      if (foldersChannel) channelsRef.current.push(foldersChannel)
    } else {
      hasLoadedRef.current = false
      setAuthState(null)
      clearQueue()
      cleanupChannels()
    }

    return cleanupChannels
  }, [
    user,
    initialized,
    setAuthState,
    loadFromSupabase,
    migrateLocalData,
    handleRemoteNoteChange,
    handleRemoteNoteDelete,
    handleRemoteFolderChange,
    handleRemoteFolderDelete,
    clearQueue,
  ])

  return {
    user,
    initialized,
    isAuthenticated: !!user,
  }
}
