// pwa.js — реєструє service worker (sw.js у корені гри).
// Працює лише коли гра відкрита через http(s): GitHub Pages, локальний сервер.
// При відкритті з файлу (подвійний клік по index.html) просто нічого не робить.
(function () {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const swUrl = new URL('../../sw.js', document.currentScript.src);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl).catch(err => console.warn('SW:', err));
  });
})();
