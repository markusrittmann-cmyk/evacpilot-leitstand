const CACHE="evacpilot-leitstand-v7-i18n";
const ASSETS=["./","./index.html","./styles.css?v=7","./config.js?v=7","./app.js?v=7","./manifest.webmanifest?v=7","./app-icon.png?v=7","./alertline_siren_01.wav?v=7","./alertline_siren_02.wav?v=7","./alertline_siren_03.wav?v=7","./alertline_siren_04.wav?v=7","./alertline_siren_05.wav?v=7"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))));
});
