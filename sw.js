// --- NOTIFICACIONES PUSH (Firebase Cloud Messaging) ---
// Copia AQUÍ, tal cual, los mismos valores de FIREBASE_CONFIG que pusiste en app.js.
// Si dejas los valores de ejemplo, el service worker sigue funcionando para el modo
// offline normal; simplemente no llegarán notificaciones con la app cerrada.
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
const FIREBASE_CONFIG = {
  apiKey: 'PEGA_TU_API_KEY_DE_FIREBASE',
  authDomain: 'tu-proyecto.firebaseapp.com',
  projectId: 'tu-proyecto',
  storageBucket: 'tu-proyecto.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx'
};
if (FIREBASE_CONFIG.apiKey.indexOf('PEGA_') !== 0) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    const messaging = firebase.messaging();
    // Mensaje recibido con la app CERRADA o en segundo plano: muestra la notificación del sistema.
    messaging.onBackgroundMessage(payload => {
      const n = payload.notification || {};
      self.registration.showNotification(n.title || 'Envases Retornables', {
        body: n.body || '',
        tag: (payload.data && payload.data.cliente_id) || (payload.data && payload.data.tipo) || undefined,
        data: payload.data || {}
      });
    });
  } catch (e) { /* FIREBASE_CONFIG aún no configurado o inválido: se ignora */ }
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow('./');
  }));
});

// --- CACHÉ OFFLINE (igual que antes) ---
// Se sube la versión del caché porque este archivo cambió: fuerza a los celulares
// a descargar la versión nueva de sw.js en vez de seguir usando la vieja en caché.
const CACHE='envases-v2';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
])));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
    const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;
  }).catch(()=>cached)));
});
