// NovaCore service worker. Bump VERSION whenever the icons or this file's logic change in a way that must reach
// installed phones immediately; old caches are deleted on activate.
const VERSION="novacore-v6"; // v6: game frames / character poses cached for the gallery + Pradžia tiles
const PRECACHE=`${VERSION}-pre`, RUNTIME=`${VERSION}-rt`;
const APP=["./","./index.html","./manifest.webmanifest","./pose-samples.json","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png"];
// MediaPipe wasm/model + fonts: network first, fall back to the last good copy so the game still loads offline
const RUNTIME_HOSTS=["cdn.jsdelivr.net","storage.googleapis.com","fonts.googleapis.com","fonts.gstatic.com"];
// Vite build output: content-hashed names under /assets/ never change, so cache-first is safe.
// The current ones are read from index.html at install, so the game works offline after the first visit.
// ponytail: hashes from older deploys stay in PRECACHE (~230 KB each) until VERSION is bumped.
const isAsset=url=>url.pathname.startsWith("/assets/");
// game frames (public/scenes) + Claude Design character poses (public/chars): network first, cache the last copy,
// so the setup galleries and the Pradžia tiles still show offline after the first visit (the names are stable).
const isMedia=url=>url.pathname.startsWith("/scenes/")||url.pathname.startsWith("/chars/");
const shellAssets=()=>fetch("./",{cache:"no-store"}).then(r=>r.text()).then(html=>[...new Set([...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g)].map(m=>"./"+m[1]))]);

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(PRECACHE).then(c=>c.addAll(APP).then(shellAssets).then(a=>c.addAll(a))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==PRECACHE&&k!==RUNTIME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    if(isAsset(url)){
      e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(PRECACHE).then(c=>c.put(req,copy))}return res})));
    }
    else if(isMedia(url)){
      e.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(RUNTIME).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match(req)));
    }
    // app shell: network first so a new deploy shows up on the next open, cache when offline
    else if(req.mode==="navigate"||APP.some(p=>url.pathname.endsWith(p.replace("./","/")))){
      e.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(PRECACHE).then(c=>c.put(req,copy));return res}).catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match("./index.html"))));
    }
    return;
  }
  if(RUNTIME_HOSTS.includes(url.hostname)){
    e.respondWith(fetch(req).then(res=>{if(res.ok||res.type==="opaque"){const copy=res.clone();caches.open(RUNTIME).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match(req)));
  }
});
