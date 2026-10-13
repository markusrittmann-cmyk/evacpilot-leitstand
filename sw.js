const CACHE="evacpilot-leitstand-v4";
const ASSETS=["./","./index.html","./styles.css?v=4","./config.js","./app.js?v=4","./manifest.webmanifest?v=4","./app-icon.png?v=4"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))));
});
