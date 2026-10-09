/* Instalação com página de indisponibilidade. Não armazena cadastros nem respostas do Supabase. */
const CACHE = 'meuterreiro-offline-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('meuterreiro-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cached = await caches.match('/offline.html');
    return cached || new Response('Sem conexão. Conecte-se à internet e abra o MeuTerreiro novamente.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
