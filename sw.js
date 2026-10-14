const CACHE="evacpilot-leitstand-v5-admin";
const ASSETS=["./","./index.html","./styles.css?v=5","./config.js?v=5","./app.js?v=5","./manifest.webmanifest?v=5","./app-icon.png?v=5","./alertline_siren_01.wav?v=5","./alertline_siren_02.wav?v=5","./alertline_siren_03.wav?v=5","./alertline_siren_04.wav?v=5","./alertline_siren_05.wav?v=5"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))));
});
