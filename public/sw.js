// tdlove service worker: cache tài nguyên tĩnh, trang offline dự phòng, thông báo đẩy
const V = 'tdlove-v1', SHELL = ['/offline.html', '/icons/icon-192.png']
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())) })

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url)
  if (r.method !== 'GET' || u.origin !== location.origin) return          // Supabase và các domain ngoài đi thẳng ra mạng
  if (u.pathname.startsWith('/_next/static/') || u.pathname.startsWith('/icons/')) {   // file có hash: cache trước
    e.respondWith(caches.match(r).then(h => h || fetch(r).then(n => { const c = n.clone(); caches.open(V).then(x => x.put(r, c)); return n })))
  } else if (r.mode === 'navigate') {                                       // trang: mạng trước, mất mạng thì hiện trang offline
    e.respondWith(fetch(r).catch(() => caches.match('/offline.html')))
  }
})

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {} } catch { }
  e.waitUntil(self.registration.showNotification(d.title || 'tdlove', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag || d.kind || 'tdlove', renotify: true,
    requireInteraction: d.kind === 'call', vibrate: d.kind === 'call' ? [400, 200, 400, 200, 400] : [200, 100, 200], data: { url: d.url || '/' },
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) { c.navigate && c.navigate(url); return c.focus() }
    return self.clients.openWindow(url)
  }))
})
