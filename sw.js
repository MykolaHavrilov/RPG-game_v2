// sw.js — service worker: гра працює офлайн і встановлюється як застосунок.
// HTML / JS / CSS: спершу мережа (щоб оновлення гри підтягувались одразу),
// а без інтернету — з кешу. Картинки: спершу кеш.
// Після великих змін можна збільшити номер версії — старий кеш видалиться.
const CACHE = "rpg-game-v29";
const PRECACHE = [
  "./",
  "./assets/css/game.css",
  "./assets/css/main.css",
  "./assets/css/theme.css",
  "./assets/fonts/alegreya-sans-400.woff",
  "./assets/fonts/alegreya-sans-700.woff",
  "./assets/fonts/cormorant.woff",
  "./assets/fonts/ruslan.woff",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/images/ENEMIES_1.webp",
  "./assets/images/Heroes_start.webp",
  "./assets/images/locations/loc_city.webp",
  "./assets/images/locations/loc_forest_cave.webp",
  "./assets/images/locations/loc_forest_path.webp",
  "./assets/images/locations/loc_home.webp",
  "./assets/images/locations/loc_tavern.webp",
  "./assets/images/locations/loc_temple.webp",
  "./assets/images/locations/loc_village_start.webp",
  "./assets/images/map/bld_city.webp",
  "./assets/images/map/bld_forest_cave.webp",
  "./assets/images/map/bld_forest_path.webp",
  "./assets/images/map/bld_home.webp",
  "./assets/images/map/bld_tavern.webp",
  "./assets/images/map/bld_temple.webp",
  "./assets/images/map/bld_village_start.webp",
  "./assets/images/map/map_world_base.webp",
  "./assets/images/map_world.webp",
  "./assets/images/ui/logo.webp",
  "./assets/images/ui/page_bg.webp",
  "./assets/images/ui/title_bg.webp",
  "./assets/images/ui/title_bg_mobile.webp",
  "./assets/img/items/accessory.webp",
  "./assets/img/items/armor.webp",
  "./assets/img/items/consumable.webp",
  "./assets/img/items/material.webp",
  "./assets/img/items/weapon_mainHand.webp",
  "./assets/img/items/weapon_offHand.webp",
  "./assets/js/battle.js",
  "./assets/js/character.js",
  "./assets/js/core.js",
  "./assets/js/data/classes.js",
  "./assets/js/data/enemies.js",
  "./assets/js/data/items.js",
  "./assets/js/data/levels.js",
  "./assets/js/data/npcs.js",
  "./assets/js/data/skills.js",
  "./assets/js/game.js",
  "./assets/js/map_layout.js",
  "./assets/js/menu.js",
  "./assets/js/party.js",
  "./assets/js/pwa.js",
  "./assets/js/quests.js",
  "./assets/js/rarity.js",
  "./assets/js/save.js",
  "./assets/js/stats.js",
  "./assets/js/ui.js",
  "./index.html",
  "./manifest.webmanifest",
  "./pages/character.html",
  "./pages/game.html",
  "./pages/inventory.html",
  "./pages/load.html",
  "./pages/maps.html",
  "./pages/new-game.html",
  "./pages/settings.html"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  if (req.destination === "image") {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
