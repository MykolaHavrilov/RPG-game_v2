// ============================================================
// data/runes.js — РУНИ (Книга Сварога · друга «Руни Небесної Кузні»)
//
// Поки що лише ПРЕДМЕТИ: гнізда в речах і дія рун у бою — окреме оновлення рун (план крафту, етап 10).
// Кожна руна — 5 окремих стопок за рідкістю, як матеріали (data/items.js):
//   rune_<key>            — звичайна
//   rune_<key>_broken / _magic / _epic / _legendary
// Поля предмета: type "rune", rune (ключ руни), grade (рідкість), gradeOf (id звичайної), runeKind, pantheon.
// Значення з книги: vals — [звичайна, магічна, епічна, легендарна]; зламана — ×0 (не дає нічого, лише паливо для Горна Сварога).
//   kind: weapon — лише у зброю, armor — лише в броню, universal — у будь-що (зокрема персні й амулети).
//   stat — ключ ефекту для майбутнього battle.js / stats.js (поки ні на що не впливає).
// Підключається ПІСЛЯ data/items.js, ДО character.js (Іфрит продає звичайні руни для тестів).
// ============================================================

(function (RPG) {
  const RUNES = {
    // ---------- Руни зброї: скандинавські (Футарк — дар Асгарду) ----------
    teiwaz:   { name: "Тейваз",   kind: "weapon", pantheon: "norse", glyph: "ᛏ", meaning: "Руна Тіра, бога чесної війни",
                effect: "Атака зброї", stat: "weaponAtkPct", vals: ["+8%", "+12%", "+18%", "+24%"] },
    thurisaz: { name: "Турісаз",  kind: "weapon", pantheon: "norse", glyph: "ᚦ", meaning: "Молот Тора",
                effect: "Шанс оглушити ворога на 1 хід", stat: "stunChance", vals: ["4%", "6%", "9%", "12%"] },
    sowilo:   { name: "Совіло",   kind: "weapon", pantheon: "norse", glyph: "ᛋ", meaning: "Сонце, що сліпить ворога",
                effect: "Шанс критичного удару", stat: "crit", vals: ["+3%", "+5%", "+7%", "+9%"] },
    kenaz:    { name: "Кеназ",    kind: "weapon", pantheon: "norse", glyph: "ᚲ", meaning: "Смолоскип у темряві",
                effect: "Підпал: шкода за хід 3 ходи, від атаки", stat: "burnPct", vals: ["4%", "6%", "9%", "12%"] },
    uruz:     { name: "Уруз",     kind: "weapon", pantheon: "norse", glyph: "ᚢ", meaning: "Сила дикого тура",
                effect: "Сила", stat: "str", vals: ["+3", "+5", "+7", "+9"] },
    hagalaz:  { name: "Хагалаз",  kind: "weapon", pantheon: "norse", glyph: "ᚺ", meaning: "Град, що трощить усе",
                effect: "Пробиття захисту ворога", stat: "armorPenPct", vals: ["6%", "9%", "13%", "18%"] },
    // ---------- Руни зброї: слов'янські (дар Ірію) ----------
    perun:      { name: "Перун",     kind: "weapon", pantheon: "slavic", path: "M24 4 V60 M24 4 L36 18 L18 30 L32 42", meaning: "Блискавка Громовержця",
                  effect: "Атака зброї / Швидкість", stat: "weaponAtkPct+speed", vals: ["+5%/+2", "+8%/+3", "+11%/+4", "+15%/+6"] },
    krada:      { name: "Крада",     kind: "weapon", pantheon: "slavic", path: "M24 60 V4 M24 4 L10 18 M24 4 L38 18 M24 18 L10 32 M24 18 L38 32", meaning: "Жертовний вогонь",
                  effect: "Додаткова вогняна шкода (магічна), від атаки", stat: "fireDmgPct", vals: ["5%", "8%", "11%", "15%"] },
    sila:       { name: "Сила",      kind: "weapon", pantheon: "slavic", path: "M34 4 L14 26 L34 38 L14 60", meaning: "Знак звитяги",
                  effect: "Шкода по чемпіонах і босах", stat: "eliteDmgPct", vals: ["+8%", "+12%", "+18%", "+24%"] },
    viter:      { name: "Вітер",     kind: "weapon", pantheon: "slavic", path: "M10 60 V4 L24 30 L38 4 V60", meaning: "Подих Стрибога",
                  effect: "Швидкість", stat: "speed", vals: ["+4", "+6", "+9", "+12"] },
    treba:      { name: "Треба",     kind: "weapon", pantheon: "slavic", path: "M24 60 V4 M10 4 H38 M14 40 H34", meaning: "Пожертва, що повертається",
                  effect: "Вампіризм: частка шкоди лікує героя", stat: "lifestealPct", vals: ["3%", "5%", "7%", "9%"] },
    chornobog:  { name: "Чорнобог",  kind: "weapon", pantheon: "slavic", path: "M24 4 V60 M24 60 L10 44 M24 60 L38 44 M24 4 L14 14", meaning: "Темний знак — прокляття ворогу",
                  effect: "Шанс прокляття: −10% захисту ворога на 3 ходи", stat: "curseChance", vals: ["5%", "8%", "11%", "15%"] },

    // ---------- Руни броні: скандинавські ----------
    algiz:    { name: "Альгіз",   kind: "armor", pantheon: "norse", glyph: "ᛉ", meaning: "Оберіг, що розкриває роги лося",
                effect: "Захист", stat: "defPct", vals: ["+8%", "+12%", "+18%", "+24%"] },
    eihwaz:   { name: "Ейваз",    kind: "armor", pantheon: "norse", glyph: "ᛇ", meaning: "Тис — дерево, що не гниє",
                effect: "Здоров'я", stat: "hpPct", vals: ["+5%", "+8%", "+11%", "+15%"] },
    othala:   { name: "Отала",    kind: "armor", pantheon: "norse", glyph: "ᛟ", meaning: "Спадок предків",
                effect: "Блок фізичної шкоди", stat: "physBlockPct", vals: ["+3%", "+5%", "+7%", "+9%"] },
    isa:      { name: "Іса",      kind: "armor", pantheon: "norse", glyph: "ᛁ", meaning: "Лід, що сковує",
                effect: "Шанс заморозити нападника на 1 хід", stat: "freezeChance", vals: ["4%", "6%", "9%", "12%"] },
    berkana:  { name: "Беркана",  kind: "armor", pantheon: "norse", glyph: "ᛒ", meaning: "Береза — оновлення",
                effect: "Відновлення здоров'я", stat: "hpRegenPct", vals: ["+15%", "+23%", "+33%", "+45%"] },
    ansuz:    { name: "Ансуз",    kind: "armor", pantheon: "norse", glyph: "ᚨ", meaning: "Голос Одіна",
                effect: "Магічний захист / Інтелект", stat: "mdefPct+int", vals: ["+6%/+2", "+9%/+3", "+13%/+4", "+18%/+6"] },
    // ---------- Руни броні: слов'янські ----------
    berehynia:  { name: "Берегиня",  kind: "armor", pantheon: "slavic", path: "M10 60 V30 L24 4 L38 30 V60 M10 30 H38", meaning: "Мати-заступниця роду",
                  effect: "Блок магічної шкоди", stat: "magBlockPct", vals: ["+3%", "+5%", "+7%", "+9%"] },
    chur:       { name: "Чур",       kind: "armor", pantheon: "slavic", path: "M24 4 V60 M10 18 H38 M10 46 H38", meaning: "Межа, яку не переступити",
                  effect: "Шипи: частка отриманої шкоди б'є нападника", stat: "thornsPct", vals: ["4%", "6%", "9%", "12%"] },
    myr:        { name: "Мир",       kind: "armor", pantheon: "slavic", path: "M24 60 V4 M24 26 L10 10 M24 26 L38 10", meaning: "Знак Білобога",
                  effect: "Ухилення", stat: "dodge", vals: ["+2%", "+3%", "+4%", "+6%"] },
    alatyr:     { name: "Алатир",    kind: "armor", pantheon: "slavic", path: "M24 4 V60 M10 18 L38 46 M38 18 L10 46", meaning: "Камінь — осереддя світу",
                  effect: "Витривалість", stat: "vit", vals: ["+3", "+5", "+7", "+9"] },
    dzherelo:   { name: "Джерело",   kind: "armor", pantheon: "slavic", path: "M10 4 V60 M10 4 L38 20 M10 30 L38 46", meaning: "Жива вода Дани",
                  effect: "Відновлення мани", stat: "mpRegenPct", vals: ["+15%", "+23%", "+33%", "+45%"] },
    veles:      { name: "Велес",     kind: "armor", pantheon: "slavic", path: "M24 32 V60 M24 4 L10 18 L24 32 L38 18 Z", meaning: "Сторож межі з Навʼю",
                  effect: "Менше шкоди від нежиті та слуг Хелли", stat: "undeadResPct", vals: ["−6%", "−9%", "−13%", "−18%"] },

    // ---------- Універсальні руни (зброя, броня, прикраси) ----------
    fehu:      { name: "Феху",      kind: "universal", pantheon: "norse", glyph: "ᚠ", meaning: "Худоба й золото — багатство",
                 effect: "Більше золота з боїв", stat: "goldPct", vals: ["+5%", "+8%", "+11%", "+15%"] },
    wunjo:     { name: "Вуньо",     kind: "universal", pantheon: "norse", glyph: "ᚹ", meaning: "Радість перемоги",
                 effect: "Більше досвіду за бої", stat: "expPct", vals: ["+4%", "+6%", "+9%", "+12%"] },
    rid:       { name: "Рід",       kind: "universal", pantheon: "slavic", path: "M12 60 V4 H34 Q40 4 40 16 Q40 30 30 30 H12 M26 30 L40 60", meaning: "Сила предків, що стоїть за спиною",
                 effect: "Усі атрибути", stat: "allAttr", vals: ["+1", "+2", "+3", "+4"] },
    dazhbog:   { name: "Даждьбог",  kind: "universal", pantheon: "slavic", path: "M10 4 V60 M38 4 V60 M10 20 L38 44", meaning: "Сонце, що дарує",
                 effect: "Шанс вищої рідкості здобичі", stat: "lootRarityPct", vals: ["+3%", "+5%", "+7%", "+9%"] }
  };

  const RUNE_KIND_NAME = { weapon: "Руна зброї", armor: "Руна броні", universal: "Універсальна руна" };
  const RUNE_KIND_WHERE = { weapon: "лише у зброю", armor: "лише в броню", universal: "у зброю, броню чи прикрасу" };
  const PANTHEON_NAME = { norse: "скандинавський знак Футарка — дар Асгарду", slavic: "слов'янський знак — дар Ірію" };
  // Рідкості руни: назва (жіночий рід), індекс значення у vals (зламана — без дії), ціна
  const RUNE_GRADES = {
    broken:    { prefix: "Зламана руна",    val: -1, price: 20 },
    common:    { prefix: "Руна",            val: 0,  price: 120 },
    magic:     { prefix: "Магічна руна",    val: 1,  price: 300 },
    epic:      { prefix: "Епічна руна",     val: 2,  price: 750 },
    legendary: { prefix: "Легендарна руна", val: 3,  price: 2500 }
  };
  const RUNE_GRADE_ORDER = ["broken", "common", "magic", "epic", "legendary"];
  const runeItemId = (key, grade = "common") => grade === "common" ? `rune_${key}` : `rune_${key}_${grade}`;

  const ITEMS = RPG.ITEMS;
  for (const [key, r] of Object.entries(RUNES)) {
    for (const grade of RUNE_GRADE_ORDER) {
      const g = RUNE_GRADES[grade];
      const value = g.val >= 0 ? r.vals[g.val] : null;
      ITEMS[runeItemId(key, grade)] = {
        name: `${g.prefix} ${r.name}`, type: "rune", rune: key, runeKind: r.kind, pantheon: r.pantheon,
        grade, gradeOf: runeItemId(key), iconFile: runeItemId(key), price: g.price, stackable: true, maxStack: 100, noShop: true,
        description: `${RUNE_KIND_NAME[r.kind]} · ${PANTHEON_NAME[r.pantheon]}. «${r.meaning}». ` +
          (value ? `${r.effect}: ${value}. ` : "Зламана: не дає нічого — годиться лише як паливо для Горна Сварога. ") +
          `Вкладається ${RUNE_KIND_WHERE[r.kind]}.`
      };
    }
  }
  // Іконки: знак з книги на камені (assets/images/items/icon_rune_<знак>.webp) — одна на всі рідкості, рідкість видно з рамки
  for (const key of Object.keys(RUNES)) RPG.ITEM_ICON_FILES?.add(runeItemId(key));
  // Звичайні руни (по одній на кожен знак) — для тестового Іфрита
  const RUNE_IDS = Object.keys(RUNES).map(k => runeItemId(k));

  Object.assign(RPG, { RUNES, RUNE_GRADES, RUNE_GRADE_ORDER, RUNE_KIND_NAME, runeItemId, RUNE_IDS });
})(window.RPG);
