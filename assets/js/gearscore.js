// ============================================================
// gearscore.js — ОЦІНКА ПРЕДМЕТА (Gear Score, GS)
//
// GS — одне число, що показує сумарну силу речі.
// Рахується з УСІХ характеристик речі (основа + бонуси рідкості,
// тобто з того, що повертає RPG.itemStats).
//
// Групи характеристик і бали за 1 одиницю:
//   основні     — 2 бали:   Сила, Спритність, Інтелект, Витривалість, Дух
//   другорядні  — 1 бал:    Атака, Сила магії, Захист, Маг. захист, Здоров'я, Мана
//   допоміжні   — 0,5 бала: Крит, Ухилення, Швидкість, Блоки, Відновлення HP/MP,
//                            Швидкість атаки
// Від'ємні характеристики (напр. «Швидкість −1» у сокири) ВІДНІМАЮТЬ бали.
//
// Обрано варіант 3 — він діє завжди. Варіанти 1 і 2 лишені для порівняння
// (RPG.gearScore(ref, 1) / RPG.gearScore(ref, 2)), у грі не показуються.
//
//
//   1 «Пряма сума» — кожна одиниця як є: +1 Сила = 2, +1 Атака = 1,
//     +10 Здоров'я = 10, +1% криту = 0,5.
//     Просто, але речі з великими числами (HP, мана, атака) переоцінені.
//
//   2 «Збалансована» — спершу значення переводиться в «одиниці», рівні
//     за силою одному атрибуту (див. UNIT нижче, узято зі stats.js:
//     1 Витривалість = 10 HP, 1 Інтелект = 6 MP, 1 Сила = 2 Атаки).
//     Потім множиться на бал групи. +10 HP = 1 одиниця = 1 бал.
//
//   3 «Збалансована + рідкість і рівень» — як варіант 2, плюс
//     бонус за рідкість (RARITY_BONUS) і за рівень речі (levelReq × 0,5).
//     Легендарна річ завжди помітно вища, навіть якщо бонуси випали слабкі.
//
// Підключається ПІСЛЯ rarity.js.
// ============================================================

(function (RPG) {
  // Бали за одиницю для кожної групи
  const WEIGHTS = { primary: 2, secondary: 1, auxiliary: 0.5 };

  // До якої групи належить характеристика
  const GROUP = {
    str: "primary", agi: "primary", int: "primary", vit: "primary", spi: "primary",
    attack: "secondary", magic: "secondary", defense: "secondary",
    magicDefense: "secondary", hp: "secondary", mp: "secondary",
    crit: "auxiliary", dodge: "auxiliary", speed: "auxiliary",
    blockPhys: "auxiliary", blockMag: "auxiliary",
    hpRegen: "auxiliary", mpRegen: "auxiliary", attackSpeedPct: "auxiliary"
  };

  // Варіант 2 і 3: скільки «сирих» очок складають 1 одиницю
  // (чого немає в списку — 1 очко = 1 одиниця)
  const UNIT = {
    hp: 10,       // 1 Витривалість дає 10 HP
    mp: 6,        // 1 Інтелект дає 6 MP
    attack: 2,    // 1 Сила дає 2 атаки
    magic: 2,     // 1 Інтелект дає 2 сили магії
    hpRegen: 0.5, // мінімальний крок відновлення
    mpRegen: 0.5
  };

  // Варіант 3: додаткові бали за рідкість
  const RARITY_BONUS = { broken: 0, common: 0, magic: 3, epic: 6, legendary: 12 };
  const LEVEL_BONUS = 0.5;   // за кожен рівень вимоги речі

  const MODES = {
    1: "Пряма сума",
    2: "Збалансована",
    3: "Збалансована + рідкість і рівень"
  };
  const DEFAULT_MODE = 3;   // «Збалансована + рідкість і рівень»

  function gsMode() { return DEFAULT_MODE; }

  // Бали за одну характеристику
  function statPoints(key, value, mode) {
    const group = GROUP[key];
    if (!group || !value) return 0;
    const units = mode === 1 ? value : value / (UNIT[key] || 1);
    return units * WEIGHTS[group];
  }

  // GS речі. ref — ID або екземпляр з рідкістю. mode — 1/2/3 (не вказано — з налаштувань).
  // Повертає ціле число або null, якщо в речі немає характеристик (зілля, матеріали).
  function gearScore(ref, mode = gsMode()) {
    const id = RPG.refId(ref);
    const item = RPG.ITEMS[id];
    if (!item || !item.slot) return null;
    const st = RPG.itemStats(ref);
    let sum = 0;
    for (const key in st) sum += statPoints(key, st[key], mode);
    if (mode === 3) {
      if (RPG.hasRarity(id)) sum += RARITY_BONUS[RPG.rarityOf(ref)] || 0;
      sum += (item.levelReq || 1) * LEVEL_BONUS;
    }
    return Math.max(0, Math.round(sum));
  }

  // Розклад по групах (для підказки): { primary, secondary, auxiliary, extra, total }
  function gearScoreParts(ref, mode = gsMode()) {
    const id = RPG.refId(ref);
    const item = RPG.ITEMS[id];
    const parts = { primary: 0, secondary: 0, auxiliary: 0, extra: 0, total: 0 };
    if (!item || !item.slot) return parts;
    const st = RPG.itemStats(ref);
    for (const key in st) {
      if (GROUP[key]) parts[GROUP[key]] += statPoints(key, st[key], mode);
    }
    if (mode === 3) {
      parts.extra = (RPG.hasRarity(id) ? RARITY_BONUS[RPG.rarityOf(ref)] || 0 : 0) +
                    (item.levelReq || 1) * LEVEL_BONUS;
    }
    for (const k of ["primary", "secondary", "auxiliary", "extra"]) parts[k] = Math.round(parts[k] * 10) / 10;
    parts.total = gearScore(ref, mode);
    return parts;
  }

  // GS усього вдягненого спорядження:
  //   { total — сума, count — скільки речей, avg — середній GS речі (ціле) }
  function equipmentScore(save, mode = gsMode()) {
    let total = 0, count = 0;
    for (const slot in save.equipment || {}) {
      const gs = save.equipment[slot] ? gearScore(save.equipment[slot], mode) : null;
      if (gs !== null) { total += gs; count++; }
    }
    return { total, count, avg: count ? Math.round(total / count) : 0 };
  }

  Object.assign(RPG, {
    GS_WEIGHTS: WEIGHTS, GS_GROUP: GROUP, GS_UNIT: UNIT, GS_MODES: MODES,
    gsMode, gearScore, gearScoreParts, equipmentScore
  });
})(window.RPG);
