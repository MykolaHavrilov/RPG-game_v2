// ============================================================
// rarity.js — РІДКІСТЬ ЗБРОЇ ТА БРОНІ
//
// Рідкість мають зброя, щити, броня, каблучки та амулети.
// У каблучок/амулетів «основа» — усі їхні власні бонуси (зламана: ×0.7, без додаткових).
// 1 broken    — сірі, «Зламана»:   лише атака/захист (×0.7)
// 2 common    — білі, «Звичайна»:  атака/захист + власні бонуси речі
//                                    (з бою: може додатися 1 атрибут і 1 другорядна)
// 3 magic     — сині, «Магічна»:   ×1.15; 1 атрибут більшого значення
//                                    АБО 2 атрибути + 1 другорядна
// 4 epic      — фіолетові, «Епічна»: ×1.3; 2 випадкові атрибути + 2–3 другорядні
// 5 legendary — помаранчеві, «Легендарна»: ×1.5; 2–3 атрибути + 3–4 другорядні,
//                                    крит/ухилення/швидкість можуть перевищити ліміт
//
// Однакові бонуси, що випали двічі, складаються.
//
// Предмет у сейві (інвентар, скриня, екіпірування):
//   { id: "sword_iron", qty: 1, r: "magic", aff: { str: 2, crit: 1 } }
//   r   — рідкість, aff — випадкові бонуси (для common з магазину — немає)
//
// Шанси випадіння + прихований лічильник удачі: save.lootLuck
//   на кожні 200 білих речей — 30–40 синіх, 10–15 фіолетових і мінімум 1 легендарна.
//   Після легендарної лічильник легендарних починається спочатку, але
//   базовий мізерний шанс діє завжди (тож 2–3 легендарні підряд можливі).
//
// Підключається ПІСЛЯ items.js і stats.js, ДО save.js і character.js.
// ============================================================

(function (RPG) {
  const RARITY_ORDER = ["broken", "common", "magic", "epic", "legendary"];

  const RARITIES = {
    broken:    { level: 1, name: "Зламана",    color: "#9a9a9a", coreMult: 0.7,  priceMult: 0.4 },
    common:    { level: 2, name: "Звичайна",   color: "#e8e8e8", coreMult: 1.0,  priceMult: 1 },
    magic:     { level: 3, name: "Магічна",    color: "#4f8dff", coreMult: 1.15, priceMult: 2.5 },
    epic:      { level: 4, name: "Епічна",     color: "#b265ff", coreMult: 1.3,  priceMult: 6 },
    legendary: { level: 5, name: "Легендарна", color: "#ff9d2e", coreMult: 1.5,  priceMult: 20 }
  };

  // Базові шанси (відносні ваги) для кожної речі, що випала з ворога
  // ≈ 50% / 40% / 7% / 2,5% / 0,1% — на 200 білих ≈ 35 синіх, 12 фіолетових, 1 легендарна
  const DROP_WEIGHTS = { broken: 50, common: 40, magic: 7, epic: 2.5, legendary: 0.1 };

  // Прихований лічильник
  const LUCK = {
    window: 200,          // вікно — 200 білих речей
    magic: [30, 40],      // скільки синіх має бути у вікні
    epic: [10, 15],       // скільки фіолетових
    legendaryEvery: 200   // гарантована легендарна не пізніше ніж через 200 білих
  };

  // Які предмети мають рідкість
  const RARITY_TYPES = ["weapon", "shield", "offhand", "armor", "accessory"];

  // «Параметри атаки/захисту» — те, що лишається навіть у зламаної речі
  const CORE_KEYS = {
    weapon: ["attack", "magic"],
    shield: ["defense", "blockPhys"],
    armor:  ["defense"],
    offhand: "all",    // колчан / сфера / малий кинджал: усі власні бонуси — основа
    accessory: "all"   // каблучки/амулети/сережки: усі їхні власні бонуси — основа речі
  };
  // Відсоткові та дробові характеристики округлюємо до десятих
  const DECIMAL_KEYS = ["crit", "dodge", "blockPhys", "blockMag", "hpRegen", "mpRegen"];

  // Основні характеристики (атрибути) і другорядні
  const ATTR_KEYS = ["str", "agi", "int", "vit", "spi"];
  const SECONDARY = {
    // [мін, макс] для рівнів сили бонусу 1..4; scale — чи росте з рівнем речі
    hp:           { tiers: [[5, 8], [10, 15], [15, 25], [25, 40]], scale: true },
    mp:           { tiers: [[4, 6], [8, 12], [12, 20], [20, 30]], scale: true },
    magicDefense: { tiers: [[1, 2], [2, 3], [3, 5], [5, 8]], scale: true },
    crit:         { tiers: [[1, 1], [1, 2], [2, 3], [3, 5]] },
    dodge:        { tiers: [[1, 1], [1, 2], [2, 3], [3, 5]] },
    speed:        { tiers: [[1, 1], [1, 2], [2, 3], [3, 4]] },
    blockPhys:    { tiers: [[1, 2], [2, 3], [3, 4], [4, 6]] },
    blockMag:     { tiers: [[1, 2], [2, 3], [3, 4], [4, 6]] },
    hpRegen:      { tiers: [[0.5, 0.5], [0.5, 1], [1, 1.5], [1.5, 2.5]], step: 0.5 },
    mpRegen:      { tiers: [[0.5, 0.5], [0.5, 1], [1, 1.5], [1.5, 2.5]], step: 0.5 }
  };
  const ATTR_TIERS = [[1, 1], [2, 2], [2, 3], [3, 5]];

  // Характеристики, ліміт яких може перевищити лише легендарна річ
  const LEGEND_OVERCAP = ["crit", "dodge", "speed"];

  // ---------- Допоміжне ----------
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function refId(ref) { return typeof ref === "string" ? ref : ref?.id; }

  function hasRarity(id) {
    return RARITY_TYPES.includes(RPG.ITEMS[id]?.type);
  }

  function rarityOf(ref) {
    if (!ref || typeof ref === "string") return "common";
    return RARITIES[ref.r] ? ref.r : "common";
  }

  function levelScale(id) {
    return 1 + ((RPG.ITEMS[id]?.levelReq || 1) - 1) * 0.15;
  }

  function rollRange([min, max], step = 1) {
    const n = Math.round((max - min) / step);
    return min + Math.floor(Math.random() * (n + 1)) * step;
  }

  function addTo(obj, key, val) {
    obj[key] = Math.round(((obj[key] || 0) + val) * 10) / 10;
  }

  function rollAttr(aff, id, tier) {
    const v = Math.max(1, Math.round(rollRange(ATTR_TIERS[tier - 1]) * levelScale(id)));
    addTo(aff, pick(ATTR_KEYS), v);
  }

  function rollSecondary(aff, id, tier) {
    const key = pick(Object.keys(SECONDARY));
    const def = SECONDARY[key];
    let v = rollRange(def.tiers[tier - 1], def.step || 1);
    if (def.scale) v = Math.max(1, Math.round(v * levelScale(id)));
    addTo(aff, key, v);
  }

  // Випадкові бонуси для рідкості. fromShop — магазинна біла річ без сюрпризів.
  function rollAffixes(id, r, fromShop = false) {
    const aff = {};
    switch (r) {
      case "common":
        if (!fromShop) {
          if (Math.random() < 0.3) rollAttr(aff, id, 1);
          if (Math.random() < 0.3) rollSecondary(aff, id, 1);
        }
        break;
      case "magic":
        if (Math.random() < 0.5) rollAttr(aff, id, 2);          // 1 атрибут, але більший
        else { rollAttr(aff, id, 1); rollAttr(aff, id, 1); }    // або одразу 2
        rollSecondary(aff, id, 1);
        break;
      case "epic":
        rollAttr(aff, id, 3); rollAttr(aff, id, 3);
        for (let i = RPG.randInt(2, 3); i > 0; i--) rollSecondary(aff, id, 2);
        break;
      case "legendary":
        for (let i = RPG.randInt(2, 3); i > 0; i--) rollAttr(aff, id, 4);
        for (let i = RPG.randInt(3, 4); i > 0; i--) rollSecondary(aff, id, 3);
        break;
    }
    return aff;
  }

  // Створити екземпляр речі (для інвентаря/скрині)
  function makeItem(id, r = "common", opts = {}) {
    if (!hasRarity(id)) return { id, qty: 1 };
    if (!RARITIES[r]) r = "common";
    const entry = { id, qty: 1, r };
    const aff = rollAffixes(id, r, opts.fromShop);
    if (Object.keys(aff).length) entry.aff = aff;
    return entry;
  }

  // ---------- Шанс рідкості + прихований лічильник ----------
  function newLuck() {
    return { commons: 0, magic: 0, epic: 0, sinceLegendary: 0 };
  }

  function weightedRarity() {
    const total = RARITY_ORDER.reduce((s, r) => s + DROP_WEIGHTS[r], 0);
    let x = Math.random() * total;
    for (const r of RARITY_ORDER) {
      x -= DROP_WEIGHTS[r];
      if (x <= 0) return r;
    }
    return "common";
  }

  function rollRarity(save) {
    const L = save.lootLuck = Object.assign(newLuck(), save.lootLuck || {});
    let r;
    if (L.sinceLegendary >= LUCK.legendaryEvery) {
      r = "legendary";                                   // гарантована
    } else {
      r = weightedRarity();
      const progress = L.commons / LUCK.window;
      // Верхня межа у вікні: зайві сині / фіолетові стають білими
      if (r === "magic" && L.magic >= LUCK.magic[1]) r = "common";
      if (r === "epic" && L.epic >= LUCK.epic[1]) r = "common";
      // Захист від невдачі: якщо синіх/фіолетових менше, ніж має бути
      if (r === "broken" || r === "common") {
        if (L.epic < Math.round(LUCK.epic[0] * progress)) r = "epic";
        else if (L.magic < Math.round(LUCK.magic[0] * progress)) r = "magic";
      }
    }

    if (r === "common") { L.commons++; L.sinceLegendary++; }
    if (r === "magic") L.magic++;
    if (r === "epic") L.epic++;
    if (r === "legendary") L.sinceLegendary = 0;      // таймер легендарних — спочатку
    if (L.commons >= LUCK.window) { L.commons = 0; L.magic = 0; L.epic = 0; }
    return r;
  }

  // ---------- Підсумкові характеристики речі ----------
  // Повертає { stats } — усі бонуси речі з урахуванням рідкості
  function itemStats(ref) {
    const id = refId(ref);
    const item = RPG.ITEMS[id];
    if (!item) return {};
    const base = item.stats || {};
    if (!hasRarity(id)) return { ...base };

    const r = rarityOf(ref);
    const core = CORE_KEYS[item.type] || [];
    const out = {};
    for (const key in base) {
      if (core === "all" || core.includes(key)) {
        const v = base[key] * RARITIES[r].coreMult;
        if (DECIMAL_KEYS.includes(key)) out[key] = Math.max(base[key] > 0 ? 0.5 : -Infinity, Math.round(v * 10) / 10);
        else out[key] = base[key] > 0 ? Math.max(1, Math.round(v)) : Math.round(v);
      } else if (r !== "broken") {
        out[key] = base[key];                 // власні бонуси речі (не в зламаної)
      }
    }
    if (r !== "broken" && typeof ref === "object") {
      for (const key in ref.aff || {}) addTo(out, key, ref.aff[key]);
    }
    return out;
  }

  function itemName(ref) {
    const item = RPG.ITEMS[refId(ref)];
    return item ? item.name : "???";
  }

  // «Залізний меч [Магічна]» — рідкість показуємо для зброї/броні
  function itemFullName(ref) {
    const id = refId(ref);
    if (!hasRarity(id)) return itemName(ref);
    return `${itemName(ref)} [${RARITIES[rarityOf(ref)].name}]`;
  }

  // Іконка: одна й та сама клітинка спрайт-листа для всіх рідкостей.
  // Рідкість показує CSS (рамка .rarity-*, сіра «зламана» .ri-broken).
  // null — іконки немає, буде заглушка з назвою.
  function itemIconRef(ref) {
    return RPG.itemIconStyle(refId(ref));
  }

  function refSellPrice(ref) {
    const id = refId(ref);
    const base = RPG.shopBuyPrice(id);
    if (!hasRarity(id)) return base;
    return Math.max(1, Math.round(base * RARITIES[rarityOf(ref)].priceMult));
  }

  // Привести запис екіпірування / інвентаря до формату { id, qty, r }
  function normalizeRef(ref) {
    if (!ref) return null;
    if (typeof ref === "string") ref = { id: ref, qty: 1 };
    if (hasRarity(ref.id)) {
      if (!RARITIES[ref.r]) ref.r = "common";
      ref.qty = 1;
    }
    return ref;
  }

  Object.assign(RPG, {
    RARITY_ORDER, RARITIES, DROP_WEIGHTS, LUCK, LEGEND_OVERCAP, CORE_KEYS,
    refId, hasRarity, rarityOf, makeItem, rollRarity, newLuck,
    itemStats, itemName, itemFullName, itemIconRef, refSellPrice, normalizeRef
  });
})(window.RPG);
