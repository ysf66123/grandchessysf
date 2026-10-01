const CACHE='gm-engine-18-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);if(url.origin!==self.location.origin||req.method!=='GET')return;
 e.respondWith((async()=>{
  const engine=/\/vendor\/stockfish-18-lite(?:-single)?\.(?:js|wasm)$/.test(url.pathname);
  const cache=engine?await caches.open(CACHE):null;
  let response=cache?await cache.match(req):null;
  if(!response){response=await fetch(req);if(cache&&response.ok)await cache.put(req,response.clone());}
  if(response.status===0)return response;
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy','same-origin');
  headers.set('Cross-Origin-Embedder-Policy','credentialless');
  headers.set('Cross-Origin-Resource-Policy','same-origin');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 })());
});
