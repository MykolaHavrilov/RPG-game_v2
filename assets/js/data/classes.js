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
//              attrs — мінімум ВКЛАДЕНИХ гравцем очок атрибутів (без стартових,
//                      без автобонусів за рівні й без речей), напр. { str: 10, vit: 5 }
// weapons    — яку основну зброю може вдягати професія (інша заборонена)
// offHand    — що професія може тримати в лівій руці (shield, quiver, orb, knife, axe — друга сокира)
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
  // need — { attrs: {...}, weapons: [...], offHand: [...] }
  function prof(name, description, baseStats, growth, levelAttrs, changeBonus, need) {
    return { name, description, tier: 2, levelTable: "standard",
             requires: { from: ["peasant"], level: PROFESSION_LEVEL, quest: "profession", attrs: need.attrs },
             weapons: need.weapons, offHand: need.offHand,
             baseStats, growth, levelAttrs, changeBonus };
  }
  // Ліва рука: ближній бій — щит або малий кинджал; лук — лише колчан; маги — сфера або малий кинджал
  const MELEE_OFF = ["shield", "knife"];
  const MAGE_OFF = ["orb", "knife"];
  const MAGE_NEED = { attrs: { int: 15, spi: 5 }, weapons: ["staff"], offHand: MAGE_OFF };

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
      { str: 2, agi: 1, vit: 2 }, { str: 4, vit: 4 }, { attrs: { str: 10, vit: 5, agi: 5 }, weapons: ["sword", "axe"], offHand: MELEE_OFF }),
    knight: prof("Лицар", "Важка броня, меч і щит — живий мур між друзями й ворогом.",
      { hp: 320, mp: 45, attack: 30, magic: 8, defense: 24, magicDefense: 12, speed: 10, crit: 6 },
      { hp: 22, mp: 3, attack: 2.5, magic: 0.5, defense: 2.2, magicDefense: 1, speed: 0.4, crit: 0.2 },
      { str: 2, vit: 3 }, { vit: 6, str: 3 }, { attrs: { str: 10, vit: 10 }, weapons: ["sword"], offHand: MELEE_OFF }),
    berserker: prof("Берсерк", "Шалений рубака: сокира в кожній руці й жодної думки про захист.",
      { hp: 290, mp: 40, attack: 40, magic: 6, defense: 14, magicDefense: 7, speed: 13, crit: 9 },
      { hp: 18, mp: 2, attack: 3.6, magic: 0.3, defense: 1.2, magicDefense: 0.6, speed: 0.6, crit: 0.35 },
      { str: 3, agi: 1, vit: 1 }, { str: 6, agi: 2 }, { attrs: { str: 10, agi: 10 }, weapons: ["axe"], offHand: ["axe", "shield"] }),
    rogue: prof("Розбійник", "Кинджал, тінь і удар у найвразливіше місце.",
      { hp: 240, mp: 55, attack: 34, magic: 10, defense: 13, magicDefense: 9, speed: 16, crit: 12 },
      { hp: 14, mp: 4, attack: 3, magic: 0.6, defense: 1, magicDefense: 0.8, speed: 0.8, crit: 0.45 },
      { agi: 3, str: 1, int: 1 }, { agi: 6, int: 2 }, { attrs: { agi: 8, str: 10, vit: 4 }, weapons: ["dagger"], offHand: MELEE_OFF }),
    hunter: prof("Мисливець", "Лучник, що влучає здалеку, поки ворог ще біжить.",
      { hp: 240, mp: 55, attack: 36, magic: 10, defense: 13, magicDefense: 9, speed: 15, crit: 10 },
      { hp: 14, mp: 4, attack: 3.3, magic: 0.6, defense: 1, magicDefense: 0.8, speed: 0.7, crit: 0.4 },
      { agi: 3, str: 1, vit: 1 }, { agi: 5, str: 3 }, { attrs: { agi: 10, str: 5, vit: 5 }, weapons: ["bow"], offHand: ["quiver"] }),
    mage_fire: prof("Маг вогню", "Школа Вогню: найбільша шкода й підпал.",
      { hp: 220, mp: 130, attack: 12, magic: 40, defense: 11, magicDefense: 18, speed: 12, crit: 8 },
      { hp: 12, mp: 11, attack: 0.8, magic: 4, defense: 0.9, magicDefense: 1.6, speed: 0.5, crit: 0.3 },
      { int: 3, str: 1, spi: 1 }, { int: 6, str: 2 }, MAGE_NEED),
    mage_water: prof("Маг води", "Школа Води: холод, лікування і щити.",
      { hp: 230, mp: 150, attack: 12, magic: 34, defense: 12, magicDefense: 22, speed: 12, crit: 7 },
      { hp: 13, mp: 13, attack: 0.8, magic: 3.4, defense: 1, magicDefense: 2, speed: 0.5, crit: 0.25 },
      { int: 3, spi: 2 }, { int: 5, spi: 3 }, MAGE_NEED),
    mage_wind: prof("Маг вітру", "Школа Вітру: швидкі серії ударів і ухильність.",
      { hp: 210, mp: 130, attack: 12, magic: 35, defense: 10, magicDefense: 17, speed: 16, crit: 9 },
      { hp: 11, mp: 11, attack: 0.8, magic: 3.5, defense: 0.8, magicDefense: 1.5, speed: 0.8, crit: 0.35 },
      { int: 3, agi: 2 }, { int: 5, agi: 3 }, MAGE_NEED),
    mage_earth: prof("Маг землі", "Школа Землі: камінь, міцність і руйнування броні.",
      { hp: 260, mp: 125, attack: 14, magic: 34, defense: 15, magicDefense: 18, speed: 11, crit: 6 },
      { hp: 15, mp: 10, attack: 0.9, magic: 3.4, defense: 1.3, magicDefense: 1.6, speed: 0.4, crit: 0.25 },
      { int: 3, vit: 2 }, { int: 5, vit: 3 }, MAGE_NEED),
    paladin: prof("Паладин", "Воїн світла: меч, святі удари й лікування.",
      { hp: 300, mp: 80, attack: 30, magic: 22, defense: 20, magicDefense: 16, speed: 10, crit: 6 },
      { hp: 20, mp: 6, attack: 2.4, magic: 2, defense: 1.8, magicDefense: 1.4, speed: 0.4, crit: 0.2 },
      { vit: 2, spi: 2, str: 1 }, { vit: 4, spi: 4 }, { attrs: { vit: 10, str: 5, spi: 5 }, weapons: ["sword"], offHand: MELEE_OFF }),
    priest: prof("Жрець", "Служитель Храму: світло, молитви й багато мани.",
      { hp: 230, mp: 140, attack: 12, magic: 32, defense: 12, magicDefense: 22, speed: 11, crit: 6 },
      { hp: 13, mp: 12, attack: 0.8, magic: 3.2, defense: 1, magicDefense: 2, speed: 0.5, crit: 0.25 },
      { spi: 3, int: 2 }, { spi: 5, int: 3 }, { attrs: { int: 10, spi: 10 }, weapons: ["staff"], offHand: MAGE_OFF }),
    monk: prof("Монах", "Посох як продовження тіла: швидкі удари й самозцілення.",
      { hp: 270, mp: 70, attack: 32, magic: 14, defense: 16, magicDefense: 14, speed: 15, crit: 9 },
      { hp: 17, mp: 5, attack: 3, magic: 1, defense: 1.4, magicDefense: 1.2, speed: 0.7, crit: 0.35 },
      { spi: 2, agi: 2, str: 1 }, { spi: 4, agi: 4 }, { attrs: { agi: 6, spi: 4, int: 4, str: 6 }, weapons: ["staff"], offHand: MELEE_OFF })
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
  const DOLL_MAIN = {                       // ключ — weaponType (нові іконки: руків'я внизу зліва, вістря вгорі справа)
    sword:  { size: 92,  rot: -90, grip: [0.20, 0.80], fist: true },
    dagger: { size: 80,  rot: -90, grip: [0.22, 0.78], fist: true },
    axe:    { size: 92,  rot: -90, grip: [0.18, 0.84], fist: true },
    bow:    { size: 128, rot: -45, grip: [0.50, 0.50], fist: true },
    staff:  { size: 150, rot: 45,  grip: [0.60, 0.60], fist: true }
  };

  const DOLL_OFF = {                        // ключ — offType
    shield: { size: 72, rot: 0,  grip: [0.5, 0.5],  off: [4, -8] },
    quiver: { size: 84, rot: 15, grip: [0.5, 0.5],  off: [-22, -62], behind: true },
    orb:    { size: 44, rot: 0,  grip: [0.5, 0.62], off: [0, -6] },
    axe:    { size: 88, rot: 0,  grip: [0.18, 0.84], fist: true },     // друга сокира Берсерка
    knife:  { size: 66, rot: 0,  grip: [0.22, 0.78], fist: true }
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
    add("offHand", "off", off && DOLL_OFF[off.offType || off.weaponType]);
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

  // ---------- УМОВИ ПРОФЕСІЙ 2 РАНГУ ----------
  // Рахуються лише очки, які гравець ВКЛАВ сам: save.character.attrs мінус стартові атрибути
  // першої професії (без автобонусів за рівні й без речей). Порогові значення — requires.attrs.
  // Якщо герой підходить під кілька професій — гравець обирає сам (маги: стихію — теж сам).
  const ATTR_ORDER = ["str", "agi", "int", "vit", "spi"];
  function investedAttrPoints(save) {
    const ch = save.character;
    const base = getClass(ch.classHistory?.[0]?.classId || ch.classId).baseAttrs || {};
    const out = {};
    for (const k of ATTR_ORDER) out[k] = Math.max(0, (ch.attrs?.[k] || 0) - (base[k] || 0));
    return out;
  }
  // Чого бракує для професії: { str: 3, ... } (порожньо — умови виконані)
  function professionLack(save, classId) {
    const need = CLASSES[classId]?.requires?.attrs || {};
    const have = investedAttrPoints(save);
    const lack = {};
    for (const [k, v] of Object.entries(need)) if ((have[k] || 0) < v) lack[k] = v - (have[k] || 0);
    return lack;
  }
  // Професії, які видає квест «Шлях професії», і під які герой зараз підходить
  function eligibleProfessions(save) {
    return Object.keys(CLASSES).filter(id => {
      const req = CLASSES[id].requires;
      return req?.quest === "profession" && req.from.includes(save.character.classId) &&
             !Object.keys(professionLack(save, id)).length;
    });
  }
  // Сумісність: перша професія, під яку герой підходить (або null)
  function pickProfession(save) {
    return eligibleProfessions(save)[0] || null;
  }
  // Чи може професія тримати основну зброю type / річ лівої руки offType (без обмежень — Селянин)
  function classAllowsWeapon(classId, type) {
    const w = CLASSES[classId]?.weapons;
    return !w || !type || w.includes(type);
  }
  function classAllowsOffHand(classId, offType) {
    const o = CLASSES[classId]?.offHand;
    return !o || o.includes(offType);
  }

  // ---------- Свій вигляд для кожної професії ----------
  // assets/images/heroes/hero_<id>.webp — 256×256 (або більше, квадрат), герой з порожніми руками
  // у тій самій позі й масштабі, що й основа Heroes_start (кулаки — у точках HERO_HANDS).
  // Поки картинки немає — показується основа з Heroes_start.
  const HERO_SPRITE_OK = {};
  // Для яких професій уже є картинка (додати ID, коли з'явиться новий файл)
  const HERO_SPRITE_FILES = ["peasant"];
  function preloadHeroSprites() {
    if (typeof Image === "undefined") return;
    for (const id of HERO_SPRITE_FILES) {
      const img = new Image();
      img.onload = () => { HERO_SPRITE_OK[id] = true; document.dispatchEvent(new CustomEvent("rpg:hero-sprite", { detail: id })); };
      img.src = RPG.asset(`assets/images/heroes/hero_${id}.webp`);
    }
  }
  function heroBaseStyle(classId) {
    // Поки в професії немає свого вигляду — показуємо Селянина (той самий кадр і пози рук)
    if (!HERO_SPRITE_OK[classId] && HERO_SPRITE_OK[DEFAULT_CLASS]) classId = DEFAULT_CLASS;
    if (HERO_SPRITE_OK[classId]) {
      return { backgroundImage: `url("${RPG.asset(`assets/images/heroes/hero_${classId}.webp`)}")`,
               backgroundSize: "100% 100%", backgroundPosition: "0 0", backgroundRepeat: "no-repeat" };
    }
    return RPG.spriteStyle(RPG.asset(HERO_BASE.sheet + HERO_EXT), HERO_BASE.cols, HERO_BASE.rows,
                           HERO_BASE.size, HERO_BASE.gap, HERO_BASE.index);
  }

  Object.assign(RPG, { DEFAULT_CLASS, CLASSES, PROFESSION_LEVEL, getClass, heroDoll, heroFistStyle, heroSpriteStyle,
                       availableClassChanges, pickProfession,
                       investedAttrPoints, professionLack, eligibleProfessions, classAllowsWeapon, classAllowsOffHand });
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", preloadHeroSprites);
    else preloadHeroSprites();
  }
})(window.RPG);
