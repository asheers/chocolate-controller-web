// App-shell cache only. Never touches MIDI or localStorage.
importScripts('version.js');
// TEST and LIVE share the asheers.github.io origin (and its CacheStorage), so caches are keyed by scope.
const PREFIX='chocolate:'+self.registration.scope+':',CACHE=PREFIX+self.CHOCOLATE_BUILD.version;
const SHELL=['./','index.html','style.css','version.js','manifest.webmanifest','app.js','model.js','storage.js','catalogue.js','zip-reader.js','patch-picker.js','midi.js','icons/live-192.png','icons/live-512.png','icons/test-192.png','icons/test-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key))))));
// A new version waits until the user chooses to reload, so it never swaps mid-performance.
self.addEventListener('message',event=>{if(event.data==='activate')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||!request.url.startsWith(self.registration.scope))return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(request,{ignoreSearch:request.mode==='navigate'})).then(hit=>hit||fetch(request)));
});
