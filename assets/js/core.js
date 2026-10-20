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
  const DEFAULT_SETTINGS = { battleView: "stepByStep", volume: 70 };

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
})(window.RPG);
