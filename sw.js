const CACHE_NAME = 'math-slicer-v1.1';

const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'style.css',
  'game.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'star.png',
  'trophy.png',
  'bg.jpg',
  'Gemini_Generated_Image_2fczl92fczl92fcz.jpeg',
  'ninja.mp3',
  'freesound_community-knife-slice-41231.mp3',
  // Meyveler ve Bıçak
  'wired-flat-1843-pineapple.svg',
  'doodle-color-576-peach.svg',
  'wired-flat-578-strawberry.svg',
  'wired-flat-543-apple.svg',
  'wired-flat-577-banana.svg',
  'wired-flat-1600-knife.svg',
  // Menü ve Buton İkonları
  'wired-flat-2152-multiply-hover-multiply.jpg',
  'wired-flat-2152-multiply-hover-multiply.webp',
  'system-solid-4014-calculator-simple-hover-pinch.webp',
  'wired-flat-476-gamepad-hover-pinch.jpg',
  'wired-flat-476-gamepad-hover-pinch.webp',
  'wired-outline-1308-hand-touch-pad-hover-pinch.jpg',
  'wired-outline-1308-hand-touch-pad-hover-pinch.webp',
  'wired-outline-3241-podium-star-first-hover-pinch.webp',
  'wired-outline-3242-podium-star-second-hover-pinch.webp',
  'wired-outline-3243-podium-star-third-hover-pinch.webp',
  'wired-flat-37-check-hover-pinch.webp',
  'wired-flat-38-cross-hover-pinch.webp',
  'wired-flat-468-bomb-in-reveal.webp',
  'wired-flat-3542-shopping-basket-groceries-hover-pinch.jpg',
  'wired-flat-3542-shopping-basket-groceries-hover-pinch.webp'
];

// Service Worker Kurulumu (Install)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Güvenli önbellekleme: bir dosya bulunamazsa tüm kurulumun çökmesini engeller
      await Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Önbelleğe alınamadı:', url, err);
          })
        )
      );
    })
  );
});

// Service Worker Aktivasyonu (Activate) - Eski önbellekleri temizler
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// İstekleri Yakalama (Fetch Strategy: Cache-First with Network Fallback)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== 'basic'
          ) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // Çevrimdışı ve HTML isteği ise index.html döndür
          if (event.request.mode === 'navigate') {
            return caches.match('./') || caches.match('index.html');
          }
        });
    })
  );
});
