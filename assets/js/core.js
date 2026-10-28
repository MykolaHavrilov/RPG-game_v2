// ============================================================
// core.js — спільний простір імен RPG та допоміжні функції.
// Підключається ПЕРШИМ на кожній сторінці.
//
// Усі файли гри — звичайні скрипти (не модулі), тому гра працює
// і при відкритті HTML подвійним кліком, і через Live Server.
// Кожен файл додає свої функції в об'єкт window.RPG.
// ============================================================

window.RPG = window.RPG || {};

(function (RPG) {
  // Корінь гри (папка з index.html) — рахується від цього файлу,
  // тому шляхи правильні і з index.html, і з pages/*.html
  const src = document.currentScript ? document.currentScript.src : location.href;
  RPG.ROOT = new URL("../../", src).href;

  RPG.asset = function (path) {
    return RPG.ROOT + path;
  };

  RPG.randInt = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  // ---------- Глобальні налаштування (не залежать від сейву) ----------
  const SETTINGS_KEY = "rpg_settings";
  const DEFAULT_SETTINGS = { battleView: "stepByStep", volume: 70, musicVolume: 60, sfxVolume: 80, muted: false };

  RPG.getSettings = function () {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  };

  RPG.setSettings = function (patch) {
    const next = Object.assign(RPG.getSettings(), patch);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  };

  // ---------- Автозілля (сторінка «Налаштування» → «Автозілля», character.js → autoPotion) ----------
  // Зберігається на пристрої разом з іншими налаштуваннями (localStorage), у сейв НЕ потрапляє,
  // тож діє для всіх збережень на цьому пристрої.
  //   hp / mp: on — увімкнено; below — пити, коли нижче below% (5…95);
  //            upTo — пити, поки не стане upTo% або більше (≥ below, до 100);
  //            size — "auto" | "small" | "medium" | "large"; fallback — якщо обраного розміру немає, брати інший;
  //            maxPer — не більше стількох зілль цього виду за одну перевірку для одного героя (1…20);
  //            magic — дозволити Чарівне зілля (лише коли звичайних цього виду немає).
  //   Усі параметри — окремо для здоров'я (hp) і мани (mp).
  const AUTO_POTION_DEFAULTS = {
    hp: { on: false, below: 40, upTo: 80, size: "auto", fallback: true, maxPer: 10, magic: false },
    mp: { on: false, below: 40, upTo: 80, size: "auto", fallback: true, maxPer: 10, magic: false }
  };
  const clampInt = (v, min, max, def) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  // Налаштування автозілля з перевіркою меж (збережене могло бути неповним чи зіпсованим)
  RPG.getAutoPotion = function () {
    const raw = RPG.getSettings().autoPotion || {};
    const side = key => {
      const d = AUTO_POTION_DEFAULTS[key], r = raw[key] || {};
      const below = clampInt(r.below, 5, 95, d.below);
      return {
        on: !!r.on,
        below,
        upTo: clampInt(r.upTo, below, 100, Math.max(below, d.upTo)),
        size: ["auto", "small", "medium", "large"].includes(r.size) ? r.size : d.size,
        fallback: r.fallback !== undefined ? !!r.fallback : d.fallback,
        // (ранні налаштування мали maxPer / magic спільні — беруться як стартові для обох)
        maxPer: clampInt(r.maxPer !== undefined ? r.maxPer : raw.maxPer, 1, 20, d.maxPer),
        magic: r.magic !== undefined ? !!r.magic : !!raw.magic
      };
    };
    return { hp: side("hp"), mp: side("mp") };
  };
  RPG.AUTO_POTION_DEFAULTS = AUTO_POTION_DEFAULTS;
})(window.RPG);
