/* Instalação com página de indisponibilidade. Não armazena cadastros nem respostas do Supabase. */
const CACHE = 'meuterreiro-offline-v2';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/icons/icon-192.png', '/icons/notification-badge-96.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('push', event => {
  let payload={title:'MeuTerreiro',body:'Você tem um novo aviso.',url:'/',tag:'meuterreiro'};
  try { payload={...payload,...event.data.json()}; } catch { /* Aviso legível mesmo sem payload. */ }
  event.waitUntil(self.registration.showNotification(String(payload.title),{
    body:String(payload.body),icon:'/icons/icon-192.png',badge:'/icons/notification-badge-96.png',tag:String(payload.tag),
    data:{url:typeof payload.url==='string'?payload.url:'/'},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const requested=new URL(event.notification.data?.url||'/',self.location.origin);
    const url=requested.origin===self.location.origin?requested.href:self.location.origin+'/';
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients) if(new URL(client.url).origin===self.location.origin){
      if(requested.origin===self.location.origin && (requested.searchParams.has('mensalidades') || requested.searchParams.has('calendario')))await client.navigate(url);
      return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('meuterreiro-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(async () => {
    const cached = await caches.match('/offline.html');
    return cached || new Response('Sem conexão. Conecte-se à internet e abra o MeuTerreiro novamente.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
