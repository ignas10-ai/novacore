// NovaCore service worker. Bump VERSION whenever index.html or the icons change in a way that must reach
// installed phones immediately; old caches are deleted on activate.
const VERSION="novacore-v1";
const PRECACHE=`${VERSION}-pre`, RUNTIME=`${VERSION}-rt`;
const APP=["./","./index.html","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png"];
// MediaPipe wasm/model + fonts: network first, fall back to the last good copy so the game still loads offline
const RUNTIME_HOSTS=["cdn.jsdelivr.net","storage.googleapis.com","fonts.googleapis.com","fonts.gstatic.com"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(PRECACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==PRECACHE&&k!==RUNTIME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    // app shell: network first so a new deploy shows up on the next open, cache when offline
    if(req.mode==="navigate"||APP.some(p=>url.pathname.endsWith(p.replace("./","/")))){
      e.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(PRECACHE).then(c=>c.put(req,copy));return res}).catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match("./index.html"))));
    }
    return;
  }
  if(RUNTIME_HOSTS.includes(url.hostname)){
    e.respondWith(fetch(req).then(res=>{if(res.ok||res.type==="opaque"){const copy=res.clone();caches.open(RUNTIME).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match(req)));
  }
});
