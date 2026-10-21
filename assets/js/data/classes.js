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
  const PROFESSION_LEVEL = 15;      // з якого рівня Селянина доступний квест «Шлях професії»

  // Професія 2 рангу: перехід лише з Селянина через квест (data → quests.js → PROFESSION)
  function prof(name, description, baseStats, growth, levelAttrs, changeBonus) {
    return { name, description, tier: 2, levelTable: "standard",
             requires: { from: ["peasant"], level: PROFESSION_LEVEL, quest: "profession" },
             baseStats, growth, levelAttrs, changeBonus };
  }

  const CLASSES = {
    peasant: {
      name: "Селянин",
      description: "Звичайний мешканець села, що вирушив назустріч пригодам. Вміє потроху все: меч, кинджал, сокиру, лук і посох.",
      tier: 1,
      levelTable: "standard",
      baseStats: { hp: 100, mp: 30, attack: 5, magic: 2, defense: 3, magicDefense: 1, speed: 5, crit: 5 },
      growth:    { hp: 12,  mp: 4,  attack: 2, magic: 1, defense: 1, magicDefense: 0.5, speed: 0.5, crit: 0.2 },
      baseAttrs: { str: 1, agi: 1, int: 1, vit: 1, spi: 1 },
      levelAttrs: { str: 1, agi: 1, int: 1, vit: 1, spi: 1 },   // +1 до кожного з 5 атрибутів за рівень автоматично
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
    },

    // ---------- ПРОФЕСІЇ 2 РАНГУ (з 15 рівня Селянина, через квест «Шлях професії») ----------
    // Яку саме професію отримає гравець — вирішують ПРИХОВАНІ критерії (pickProfession нижче):
    // найбільший і другий за величиною атрибут, вкладений самим гравцем (save.character.attrs).
    warrior: prof("Воїн", "Надійний боєць з мечем або сокирою.",
      { hp: 280, mp: 50, attack: 34, magic: 8, defense: 18, magicDefense: 9, speed: 12, crit: 7 },
      { hp: 18, mp: 3, attack: 3, magic: 0.5, defense: 1.6, magicDefense: 0.8, speed: 0.5, crit: 0.25 },
      { str: 2, agi: 1, vit: 2 }, { str: 4, vit: 4 }),
    knight: prof("Лицар", "Важка броня, меч і щит — живий мур між друзями й ворогом.",
      { hp: 320, mp: 45, attack: 30, magic: 8, defense: 24, magicDefense: 12, speed: 10, crit: 6 },
      { hp: 22, mp: 3, attack: 2.5, magic: 0.5, defense: 2.2, magicDefense: 1, speed: 0.4, crit: 0.2 },
      { str: 2, vit: 3 }, { vit: 6, str: 3 }),
    berserker: prof("Берсерк", "Шалений рубака з сокирою, що забуває про захист.",
      { hp: 290, mp: 40, attack: 40, magic: 6, defense: 14, magicDefense: 7, speed: 13, crit: 9 },
      { hp: 18, mp: 2, attack: 3.6, magic: 0.3, defense: 1.2, magicDefense: 0.6, speed: 0.6, crit: 0.35 },
      { str: 3, agi: 1, vit: 1 }, { str: 6, agi: 2 }),
    rogue: prof("Розбійник", "Кинджал, тінь і удар у найвразливіше місце.",
      { hp: 240, mp: 55, attack: 34, magic: 10, defense: 13, magicDefense: 9, speed: 16, crit: 12 },
      { hp: 14, mp: 4, attack: 3, magic: 0.6, defense: 1, magicDefense: 0.8, speed: 0.8, crit: 0.45 },
      { agi: 3, str: 1, int: 1 }, { agi: 6, int: 2 }),
    hunter: prof("Мисливець", "Лучник, що влучає здалеку, поки ворог ще біжить.",
      { hp: 240, mp: 55, attack: 36, magic: 10, defense: 13, magicDefense: 9, speed: 15, crit: 10 },
      { hp: 14, mp: 4, attack: 3.3, magic: 0.6, defense: 1, magicDefense: 0.8, speed: 0.7, crit: 0.4 },
      { agi: 3, str: 1, vit: 1 }, { agi: 5, str: 3 }),
    mage_fire: prof("Маг вогню", "Школа Вогню: найбільша шкода й підпал.",
      { hp: 220, mp: 130, attack: 12, magic: 40, defense: 11, magicDefense: 18, speed: 12, crit: 8 },
      { hp: 12, mp: 11, attack: 0.8, magic: 4, defense: 0.9, magicDefense: 1.6, speed: 0.5, crit: 0.3 },
      { int: 3, str: 1, spi: 1 }, { int: 6, str: 2 }),
    mage_water: prof("Маг води", "Школа Води: холод, лікування і щити.",
      { hp: 230, mp: 150, attack: 12, magic: 34, defense: 12, magicDefense: 22, speed: 12, crit: 7 },
      { hp: 13, mp: 13, attack: 0.8, magic: 3.4, defense: 1, magicDefense: 2, speed: 0.5, crit: 0.25 },
      { int: 3, spi: 2 }, { int: 5, spi: 3 }),
    mage_wind: prof("Маг вітру", "Школа Вітру: швидкі серії ударів і ухильність.",
      { hp: 210, mp: 130, attack: 12, magic: 35, defense: 10, magicDefense: 17, speed: 16, crit: 9 },
      { hp: 11, mp: 11, attack: 0.8, magic: 3.5, defense: 0.8, magicDefense: 1.5, speed: 0.8, crit: 0.35 },
      { int: 3, agi: 2 }, { int: 5, agi: 3 }),
    mage_earth: prof("Маг землі", "Школа Землі: камінь, міцність і руйнування броні.",
      { hp: 260, mp: 125, attack: 14, magic: 34, defense: 15, magicDefense: 18, speed: 11, crit: 6 },
      { hp: 15, mp: 10, attack: 0.9, magic: 3.4, defense: 1.3, magicDefense: 1.6, speed: 0.4, crit: 0.25 },
      { int: 3, vit: 2 }, { int: 5, vit: 3 }),
    paladin: prof("Паладин", "Воїн світла: меч, святі удари й лікування.",
      { hp: 300, mp: 80, attack: 30, magic: 22, defense: 20, magicDefense: 16, speed: 10, crit: 6 },
      { hp: 20, mp: 6, attack: 2.4, magic: 2, defense: 1.8, magicDefense: 1.4, speed: 0.4, crit: 0.2 },
      { vit: 2, spi: 2, str: 1 }, { vit: 4, spi: 4 }),
    priest: prof("Жрець", "Служитель Храму: світло, молитви й багато мани.",
      { hp: 230, mp: 140, attack: 12, magic: 32, defense: 12, magicDefense: 22, speed: 11, crit: 6 },
      { hp: 13, mp: 12, attack: 0.8, magic: 3.2, defense: 1, magicDefense: 2, speed: 0.5, crit: 0.25 },
      { spi: 3, int: 2 }, { spi: 5, int: 3 }),
    monk: prof("Монах", "Посох як продовження тіла: швидкі удари й самозцілення.",
      { hp: 270, mp: 70, attack: 32, magic: 14, defense: 16, magicDefense: 14, speed: 15, crit: 9 },
      { hp: 17, mp: 5, attack: 3, magic: 1, defense: 1.4, magicDefense: 1.2, speed: 0.7, crit: 0.35 },
      { spi: 2, agi: 2, str: 1 }, { spi: 4, agi: 4 })
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
    const base = heroBaseStyle(save.character?.classId);
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
  function heroSpriteStyle(classId) {
    return heroBaseStyle(classId);
  }

  // Список професій, на які персонаж може перейти зараз «вручну».
  // Професії з requires.quest видаються лише квестом (pickProfession).
  function availableClassChanges(currentClassId, currentLevel) {
    return Object.keys(CLASSES).filter(id => {
      const req = CLASSES[id].requires;
      if (!req || req.quest) return false;
      return req.from.includes(currentClassId) && currentLevel >= req.level;
    });
  }

  // ---------- ПРИХОВАНІ КРИТЕРІЇ ПРОФЕСІЇ ----------
  // Беруться атрибути, які гравець вкладав сам (save.character.attrs; без речей і без
  // автоматичних бонусів за рівні). Головний атрибут — найбільший, другий — наступний.
  // При рівності порядок: Сила, Спритність, Інтелект, Витривалість, Дух.
  //   Сила:         + Витривалість → Лицар, + Спритність → Берсерк, інакше → Воїн
  //   Спритність:   + Інтелект або Дух → Розбійник, інакше → Мисливець
  //   Інтелект:     + Сила → Маг вогню, + Спритність → Маг вітру,
  //                 + Витривалість → Маг землі, + Дух → Маг води
  //   Витривалість: + Дух → Паладин, + Сила → Лицар, інакше → Воїн
  //   Дух:          + Інтелект або Витривалість → Жрець, інакше → Монах
  //   Якщо гравець майже нічого не вкладав (перевага головного < 3 очок над рештою) → Воїн.
  const ATTR_ORDER = ["str", "agi", "int", "vit", "spi"];
  function pickProfession(save) {
    const a = save.character.attrs || {};
    const sorted = ATTR_ORDER.slice().sort((x, y) => (a[y] || 0) - (a[x] || 0) || ATTR_ORDER.indexOf(x) - ATTR_ORDER.indexOf(y));
    const [p, s2, s3] = sorted;
    if ((a[p] || 0) - (a[s3] || 0) < 3) return "warrior";
    const map = {
      str: { vit: "knight", agi: "berserker" },
      agi: { int: "rogue", spi: "rogue" },
      int: { str: "mage_fire", agi: "mage_wind", vit: "mage_earth", spi: "mage_water" },
      vit: { spi: "paladin", str: "knight" },
      spi: { int: "priest", vit: "priest" }
    };
    const fallback = { str: "warrior", agi: "hunter", int: "mage_water", vit: "warrior", spi: "monk" };
    return (map[p] && map[p][s2]) || fallback[p];
  }

  // ---------- Свій вигляд для кожної професії ----------
  // assets/images/heroes/hero_<id>.webp — 256×256 (або більше, квадрат), герой з порожніми руками
  // у тій самій позі й масштабі, що й основа Heroes_start (кулаки — у точках HERO_HANDS).
  // Поки картинки немає — показується основа з Heroes_start.
  const HERO_SPRITE_OK = {};
  function preloadHeroSprites() {
    if (typeof Image === "undefined") return;
    for (const id of Object.keys(CLASSES)) {
      const img = new Image();
      img.onload = () => { HERO_SPRITE_OK[id] = true; document.dispatchEvent(new CustomEvent("rpg:hero-sprite", { detail: id })); };
      img.src = RPG.asset(`assets/images/heroes/hero_${id}.webp`);
    }
  }
  function heroBaseStyle(classId) {
    if (HERO_SPRITE_OK[classId]) {
      return { backgroundImage: `url("${RPG.asset(`assets/images/heroes/hero_${classId}.webp`)}")`,
               backgroundSize: "100% 100%", backgroundPosition: "0 0", backgroundRepeat: "no-repeat" };
    }
    return RPG.spriteStyle(RPG.asset(HERO_BASE.sheet + HERO_EXT), HERO_BASE.cols, HERO_BASE.rows,
                           HERO_BASE.size, HERO_BASE.gap, HERO_BASE.index);
  }

  Object.assign(RPG, { DEFAULT_CLASS, CLASSES, PROFESSION_LEVEL, getClass, heroDoll, heroFistStyle, heroSpriteStyle,
                       availableClassChanges, pickProfession });
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", preloadHeroSprites);
    else preloadHeroSprites();
  }
})(window.RPG);
