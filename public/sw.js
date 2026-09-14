const CACHE_NAME='cloudie-shell-v2'
const SHELL=['/offline','/icon.svg','/icon-light-32x32.png','/icon-dark-32x32.png']
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)));self.skipWaiting()})
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));self.clients.claim()})
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;const url=new URL(request.url);if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/admin')||url.pathname.startsWith('/dashboard')||url.pathname.startsWith('/business/'))return;event.respondWith(fetch(request).catch(()=>caches.match(request).then(cached=>cached||caches.match('/offline'))))})
