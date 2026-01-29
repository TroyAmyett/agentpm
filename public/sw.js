// AgentPM Service Worker
// Self-cleanup: clear all caches and unregister on localhost
// This fixes the stale cache issue that was serving old broken scripts

const IS_LOCALHOST = location.hostname === 'localhost' || location.hostname === '127.0.0.1'

// On install, skip waiting to activate immediately
self.addEventListener('install', () => {
  self.skipWaiting()
})

// On activate, clear ALL caches and unregister on localhost
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          console.log('[SW] Clearing cache:', name)
          return caches.delete(name)
        })
      )
    }).then(() => {
      if (IS_LOCALHOST) {
        console.log('[SW] Localhost detected, unregistering...')
        return self.registration.unregister()
      }
    }).then(() => {
      return self.clients.claim()
    })
  )
})

// No fetch interception - let everything go to network
// This prevents stale cache issues entirely
