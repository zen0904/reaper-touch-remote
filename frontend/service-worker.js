const CACHE="rtr-v25";
const ASSETS=["/","/styles.css?v=25","/app.js?v=25","/control-physics.js","/rack-navigation.js","/plugin-profiles.js","/native-pointer.js","/manifest.webmanifest","/icons/icon-192.svg","/icons/icon-512.svg"];

self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener("activate",event=>event.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
])));
self.addEventListener("fetch",event=>{
  if(event.request.url.includes("/ws")||event.request.url.includes("/capture/")||event.request.url.includes("/api/"))return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request)));
});
