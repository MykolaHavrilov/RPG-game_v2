// ============================================================
// ПРОФЕСІЇ ПЕРСОНАЖА
// baseStats  — бойові характеристики на 1 рівні цієї професії
// growth     — скільки додається за КОЖЕН новий рівень
// baseAttrs  — стартові атрибути (Сила, Спритність, Інтелект,
//              Витривалість, Дух) — див. stats.js
// levelAttrs — СТАЛІ бонуси атрибутів за КОЖЕН новий рівень у цій професії
//              (додаються автоматично, окрім 3 вільних очок на вибір)
// changeBonus — разовий бонус атрибутів, коли персонаж ПЕРЕХОДИТЬ на цю професію.
//              Вищі професії мають більші levelAttrs і changeBonus.
//              Бонуси, здобуті в попередніх професіях, лишаються назавжди.
// levelTable — яку таблицю досвіду використовує (levels.js)
// tier       — ранг професії: 1 — стартова, 2 — перша зміна і т.д.
// requires   — умови, щоб отримати цю професію:
//              from  — з яких професій можна перейти
//              level — мінімальний рівень у попередній професії
//
// Підсумкові характеристики = baseStats + growth × (рівень − 1)
//                            + бонуси атрибутів + вдягнені речі
//
// При зміні професії рівень і досвід професії скидаються,
// а характеристики рахуються вже з нової професії.
// ============================================================

(function (RPG) {
  const DEFAULT_CLASS = "peasant";

  const CLASSES = {
    peasant: {
      name: "Рекрут",
      description: "Звичайний мешканець села, що вирушив назустріч пригодам.",
      tier: 1,
      levelTable: "standard",
      baseStats: { hp: 100, mp: 30, attack: 5, magic: 2, defense: 3, magicDefense: 1, speed: 5, crit: 5 },
      growth:    { hp: 12,  mp: 4,  attack: 2, magic: 1, defense: 1, magicDefense: 0.5, speed: 0.5, crit: 0.2 },
      baseAttrs: { str: 1, agi: 1, int: 1, vit: 1, spi: 1 },
      levelAttrs: { str: 1, agi: 1, vit: 1 },   // +3 атрибути за рівень автоматично
      startItems: [
        { id: "sword_t1", equip: true },
        { id: "linen_chest", equip: true },
        { id: "linen_legs", equip: true },
        { id: "shield_t1", qty: 1 },       // лежить в інвентарі — можна вдягнути
        { id: "linen_feet", qty: 1 },      // лежить в інвентарі — можна вдягнути
        { id: "potion_hp_small", qty: 3 },
        { id: "potion_mp_small", qty: 1 }
      ],
      startGold: 50,
      startLocation: "home"
    }

    // ---------- Майбутні професії (розкоментуй, коли будеш готовий) ----------
    // knight: {
    //   name: "Рицар",
    //   description: "Важка броня і надійний меч.",
    //   tier: 2,
    //   levelTable: "standard",
    //   requires: { from: ["peasant"], level: 10 },
    //   baseStats: { hp: 220, mp: 40, attack: 18, magic: 4, defense: 15, magicDefense: 6, speed: 8, crit: 6 },
    //   growth:    { hp: 20,  mp: 3,  attack: 3,  magic: 0.5, defense: 2, magicDefense: 1, speed: 0.5, crit: 0.2 },
    //   levelAttrs:  { str: 2, agi: 1, vit: 2 },   // +5 за рівень
    //   changeBonus: { str: 5, vit: 5 }
    // },
    // mage: {
    //   name: "Маг",
    //   description: "Сила заклинань замість сили м'язів.",
    //   tier: 2,
    //   levelTable: "standard",
    //   requires: { from: ["peasant"], level: 10 },
    //   baseStats: { hp: 140, mp: 120, attack: 6, magic: 22, defense: 6, magicDefense: 14, speed: 9, crit: 7 },
    //   growth:    { hp: 10,  mp: 10,  attack: 1, magic: 4,  defense: 1, magicDefense: 2, speed: 0.5, crit: 0.3 },
    //   levelAttrs:  { int: 3, spi: 2 },   // +5 за рівень
    //   changeBonus: { int: 6, spi: 4 }
    // },
    // archer: {
    //   name: "Лучник",
    //   description: "Швидкий і влучний.",
    //   tier: 2,
    //   levelTable: "standard",
    //   requires: { from: ["peasant"], level: 10 },
    //   baseStats: { hp: 170, mp: 50, attack: 15, magic: 5, defense: 9, magicDefense: 6, speed: 15, crit: 12 },
    //   growth:    { hp: 14,  mp: 4,  attack: 3,  magic: 0.5, defense: 1, magicDefense: 1, speed: 1, crit: 0.5 },
    //   levelAttrs:  { str: 1, agi: 3, vit: 1 },   // +5 за рівень
    //   changeBonus: { agi: 6, str: 2, vit: 2 }
    // }
  };

  function getClass(id) {
    return CLASSES[id] || CLASSES[DEFAULT_CLASS];
  }

  // ---------- ВИГЛЯД ГЕРОЯ: «ПАПЕРОВА ЛЯЛЬКА» ----------
  // Основа — герой з порожніми руками (кадр 0 листа Heroes_start, 256×256).
  // Поверх у кисті кладуться іконки зброї з листів предметів (data/items.js),
  // а над руків'ям ще раз малюється кулак — ніби герой тримає річ.
  // Усі координати — у пікселях кадру 256×256:
  //   HERO_HANDS — центри кулаків (main — права рука героя, на картинці зліва).
  //   size  — розмір іконки (сторона квадрата), rot — поворот за годинниковою, градуси,
  //   grip  — точка хвату в іконці (частки 0…1 від її сторони), off — зсув від кулака,
  //   behind: true — річ за спиною (колчан), fist: true — домалювати кулак поверх.
  const HERO_EXT = ".webp";
  const HERO_BASE = { sheet: "assets/images/Heroes_start", cols: 3, rows: 2, size: 256, gap: 2, index: 0 };
  const HERO_HANDS = { main: [82, 130], off: [168, 131] };
  const HERO_FIST_R = 13;
  const DOLL_MAIN = {                       // ключ — weaponType
    sword:  { size: 96,  rot: 90,  grip: [0.22, 0.78], fist: true },
    dagger: { size: 74,  rot: 90,  grip: [0.22, 0.78], fist: true },
    axe:    { size: 96,  rot: 90,  grip: [0.22, 0.85], fist: true },
    bow:    { size: 124, rot: -40, grip: [0.26, 0.66], fist: true },
    staff:  { size: 150, rot: -32, grip: [0.30, 0.70], fist: true }
  };
  const DOLL_OFF = {                        // ключ — offType
    shield: { size: 72, rot: 0,  grip: [0.5, 0.5],  off: [4, -8] },
    quiver: { size: 84, rot: 15, grip: [0.5, 0.5],  off: [-22, -62], behind: true },
    orb:    { size: 44, rot: 0,  grip: [0.5, 0.62], off: [0, -6] },
    knife:  { size: 62, rot: 90, grip: [0.22, 0.78], fist: true }
  };

  const pct = v => `${(v / 256) * 100}%`;

  // Опис шарів героя: { base, layers: [{ ref, behind, style, fist }], fists: [[x, y]] }
  function heroDoll(save) {
    const eq = save.equipment || {};
    const base = RPG.spriteStyle(RPG.asset(HERO_BASE.sheet + HERO_EXT), HERO_BASE.cols, HERO_BASE.rows,
                                 HERO_BASE.size, HERO_BASE.gap, HERO_BASE.index);
    const layers = [];
    const fists = [];
    const add = (slot, hand, cfg) => {
      const ref = eq[slot];
      const icon = ref && RPG.itemIconStyle(RPG.refId(ref));
      if (!cfg || !icon) return;
      const [hx, hy] = HERO_HANDS[hand];
      const [dx, dy] = cfg.off || [0, 0];
      const [gx, gy] = cfg.grip;
      layers.push({
        ref, behind: !!cfg.behind,
        style: Object.assign({}, icon, {
          left: pct(hx + dx - gx * cfg.size),
          top: pct(hy + dy - gy * cfg.size),
          width: pct(cfg.size),
          height: pct(cfg.size),
          transformOrigin: `${gx * 100}% ${gy * 100}%`,
          transform: `rotate(${cfg.rot}deg)`
        })
      });
      if (cfg.fist && !cfg.behind) fists.push([hx, hy]);
    };
    const main = RPG.ITEMS[RPG.refId(eq.mainHand)];
    const off = RPG.ITEMS[RPG.refId(eq.offHand)];
    add("offHand", "off", off && DOLL_OFF[off.offType]);
    add("mainHand", "main", main && DOLL_MAIN[main.weaponType]);
    return { base, layers, fists };
  }

  // Кулак поверх руків'я: копія основи, обрізана колом навколо кисті
  function heroFistStyle(base, x, y) {
    return Object.assign({}, base, { clipPath: `circle(${pct(HERO_FIST_R)} at ${pct(x)} ${pct(y)})` });
  }

  // CSS-стиль основи (герой з порожніми руками) — для простих місць без шарів
  function heroSpriteStyle() {
    return RPG.spriteStyle(RPG.asset(HERO_BASE.sheet + HERO_EXT), HERO_BASE.cols, HERO_BASE.rows,
                           HERO_BASE.size, HERO_BASE.gap, HERO_BASE.index);
  }

  // Список професій, на які персонаж може перейти зараз
  // Повертає масив ID, напр. ["knight", "mage", "archer"]
  function availableClassChanges(currentClassId, currentLevel) {
    return Object.keys(CLASSES).filter(id => {
      const req = CLASSES[id].requires;
      if (!req) return false;
      return req.from.includes(currentClassId) && currentLevel >= req.level;
    });
  }

  Object.assign(RPG, { DEFAULT_CLASS, CLASSES, getClass, heroDoll, heroFistStyle, heroSpriteStyle, availableClassChanges });
})(window.RPG);
