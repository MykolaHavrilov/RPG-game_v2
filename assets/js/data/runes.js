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

  // ---------- Горно Сварога (Гільдія ремісників, Торговий район) ----------
  // 6 будь-яких рун (зламані теж) → 1 нова руна від звичайної до епічної (легендарна з горна не виходить).
  // Кожна руна дає 1/6 свого рядка ODDS. Вид нової: усі шість одного виду → той самий вид, інакше — будь-яка з 28.
  // За кожне розпалювання — данина fee золота.
  // Горно з'являється в гільдії лише після того, як герой знайшов другу книгу Сварога (save.books.runes).
  const RUNE_FORGE = {
    count: 6, fee: 200,
    odds: { broken: [0.70, 0.25, 0.05], common: [0.50, 0.40, 0.10], magic: [0.20, 0.55, 0.25], epic: [0, 0.50, 0.50], legendary: [0, 0.50, 0.50] },
    out: ["common", "magic", "epic"]
  };
  // Шанси для набору id рун: { common, magic, epic, kind | null }
  function runeForgeOdds(ids) {
    const sum = [0, 0, 0];
    for (const id of ids) {
      const row = RUNE_FORGE.odds[RPG.ITEMS[id]?.grade] || RUNE_FORGE.odds.common;
      row.forEach((v, i) => { sum[i] += v / RUNE_FORGE.count; });
    }
    const kinds = new Set(ids.map(id => RPG.ITEMS[id]?.runeKind));
    return { common: sum[0], magic: sum[1], epic: sum[2], kind: ids.length && kinds.size === 1 ? [...kinds][0] : null };
  }
  // Розпалити горно: ids — 6 id рун з інвентаря (можна однакові). Повертає { ok, reason } або { ok, id, grade, price }
  function runeForge(save, ids) {
    if (!save.books?.runes) return { ok: false, reason: "Горно Сварога відкривається тим, хто знайшов книгу «Руни Небесної Кузні»." };
    if (!Array.isArray(ids) || ids.length !== RUNE_FORGE.count) return { ok: false, reason: `Покладіть у горно ${RUNE_FORGE.count} рун.` };
    if (ids.some(id => RPG.ITEMS[id]?.type !== "rune")) return { ok: false, reason: "У горно кладуть лише руни." };
    const need = {};
    for (const id of ids) need[id] = (need[id] || 0) + 1;
    for (const [id, n] of Object.entries(need)) if (RPG.countItem(save, id) < n) return { ok: false, reason: `Бракує: ${RPG.ITEMS[id].name}.` };
    if (save.character.gold < RUNE_FORGE.fee) return { ok: false, reason: `Данина горну — ${RUNE_FORGE.fee} золота, а у вас менше.` };
    const odds = runeForgeOdds(ids);
    let x = Math.random(), grade = "common";
    for (const g of RUNE_FORGE.out) { if (x < odds[g]) { grade = g; break; } x -= odds[g]; }
    const pool = Object.keys(RUNES).filter(k => !odds.kind || RUNES[k].kind === odds.kind);
    const key = pool[Math.floor(Math.random() * pool.length)];
    for (const [id, n] of Object.entries(need)) RPG.removeItem(save, id, n);
    const outId = runeItemId(key, grade);
    if (RPG.fitQty(save, outId, 1) < 1) {            // місця немає — повертаємо руни, данину не беремо
      for (const [id, n] of Object.entries(need)) RPG.addItem(save, id, n);
      return { ok: false, reason: "Інвентар повний — нікуди покласти нову руну." };
    }
    save.character.gold -= RUNE_FORGE.fee;
    RPG.addItem(save, outId, 1);
    return { ok: true, id: outId, grade, price: RUNE_FORGE.fee };
  }

  // ---------- Гнізда: які руни куди лягають, опис дії ----------
  // Руни зброї — у зброю та речі лівої руки (щити, колчани, сфери, малі кинджали), руни броні — у броню,
  // універсальні — у будь-що, зокрема прикраси.
  const RUNE_FITS = { weapon: ["weapon", "shield", "offhand"], armor: ["armor"], universal: ["weapon", "shield", "offhand", "armor", "accessory"] };
  function runeFits(itemId, runeId) {
    const rune = RPG.ITEMS[runeId], item = RPG.ITEMS[itemId];
    return !!(rune?.type === "rune" && item && RUNE_FITS[rune.runeKind]?.includes(item.type));
  }
  // «Атака зброї: +8%» для руни цієї рідкості (зламана — «не діє»)
  function runeEffectText(runeId) {
    const it = RPG.ITEMS[runeId], r = it && RUNES[it.rune];
    if (!r) return "";
    const g = RUNE_GRADES[it.grade];
    return g && g.val >= 0 ? `${r.effect}: ${r.vals[g.val]}` : "не діє — лише паливо для Горна Сварога";
  }
  // Вкласти руну з інвентаря (runeId) у гніздо slot речі ref (річ в інвентарі чи вдягнена). save — сейв героя (ms)
  function insertRune(save, ref, slot, runeId) {
    if (!save.books?.runesRead) return { ok: false, reason: "Гнізда бачить лише той, хто прочитав «Руни Небесної Кузні»." };
    if (!ref?.sockets || !Array.isArray(ref.runes) || !(slot >= 0 && slot < ref.sockets)) return { ok: false, reason: "Немає такого гнізда." };
    if (ref.runes[slot]) return { ok: false, reason: "Гніздо вже зайняте — спершу вийміть руну." };
    if (!runeFits(ref.id, runeId)) return { ok: false, reason: `${RPG.ITEMS[runeId]?.name || "Ця руна"} сюди не лягає.` };
    if (RPG.countItem(save, runeId) < 1) return { ok: false, reason: "Такої руни немає в інвентарі." };
    RPG.removeItem(save, runeId, 1);
    ref.runes[slot] = runeId;
    return { ok: true, id: runeId };
  }
  // Вийняти руну з гнізда: вона тріскається й повертається в інвентар зламаною
  function removeRune(save, ref, slot) {
    const id = ref?.runes?.[slot];
    if (!id) return { ok: false, reason: "Гніздо порожнє." };
    const broken = runeItemId(RPG.ITEMS[id].rune, "broken");
    if (RPG.fitQty(save, broken, 1) < 1) return { ok: false, reason: "Інвентар повний — нікуди покласти руну." };
    ref.runes[slot] = null;
    RPG.addItem(save, broken, 1);
    return { ok: true, id, broken };
  }
  // Руни з гнізд речі, що зникає (розбір): кожна тріскається → id зламаних рун
  function crackedRunes(ref) {
    return (ref?.runes || []).filter(Boolean).map(id => runeItemId(RPG.ITEMS[id].rune, "broken"));
  }

  // ---------- Дія рун у вдягнених речах ----------
  // Числа з vals: "+5%/+2" → [5, 2], "−6%" → [6]
  function runeNums(runeId) {
    const it = RPG.ITEMS[runeId], r = it && RUNES[it.rune], g = it && RUNE_GRADES[it.grade];
    if (!r || !g || g.val < 0) return null;
    return String(r.vals[g.val]).split("/").map(x => parseFloat(x.replace(/[^\d.]/g, "")) || 0);
  }
  // Підсумок рун героя ms: { flat, pct, attrs, battle, eco, parts }
  //   flat   — до характеристик (speed — число; crit, dodge, blockPhys, blockMag — пункти)
  //   pct    — % до attack (Тейваз, Перун), defense (Альгіз), magicDefense (Ансуз), hp, hpRegen, mpRegen; attrs — str / vit / int / allAttr
  //   battle — бойові: stun, burn, pen, fire, elite, lifesteal, curse, freeze, thorns, undeadRes (у %)
  //   eco    — gold, exp, lootRarity (у %); parts — [{ label, key, value }] для підказок
  // Дві однакові руни в одній речі не складаються — діє сильніша. У різних речах — складаються.
  function runeTotals(ms) {
    const T = { flat: {}, pct: {}, attrs: {}, battle: {}, eco: {}, parts: [] };
    const add = (bag, key, v, label) => { if (!v) return; bag[key] = (bag[key] || 0) + v; T.parts.push({ label, key, value: v }); };
    for (const slot in ms.equipment || {}) {
      const ref = ms.equipment[slot];
      if (!ref || typeof ref !== "object" || !Array.isArray(ref.runes)) continue;
      const best = {};                                    // ключ руни → id найсильнішої в цій речі
      for (const rid of ref.runes) {
        const it = RPG.ITEMS[rid];
        if (!it || !runeNums(rid)) continue;
        const cur = best[it.rune];
        if (!cur || RUNE_GRADES[it.grade].val > RUNE_GRADES[RPG.ITEMS[cur].grade].val) best[it.rune] = rid;
      }
      for (const rid of Object.values(best)) {
        const it = RPG.ITEMS[rid], n = runeNums(rid), label = it.name;
        switch (RUNES[it.rune].stat) {
          case "weaponAtkPct": add(T.pct, "attack", n[0], label); break;
          case "weaponAtkPct+speed": add(T.pct, "attack", n[0], label); add(T.flat, "speed", n[1], label); break;
          case "defPct": add(T.pct, "defense", n[0], label); break;
          case "mdefPct+int": add(T.pct, "magicDefense", n[0], label); add(T.attrs, "int", n[1], label); break;
          case "crit": add(T.flat, "crit", n[0], label); break;
          case "speed": add(T.flat, "speed", n[0], label); break;
          case "dodge": add(T.flat, "dodge", n[0], label); break;
          case "physBlockPct": add(T.flat, "blockPhys", n[0], label); break;
          case "magBlockPct": add(T.flat, "blockMag", n[0], label); break;
          case "hpPct": add(T.pct, "hp", n[0], label); break;
          case "hpRegenPct": add(T.pct, "hpRegen", n[0], label); break;
          case "mpRegenPct": add(T.pct, "mpRegen", n[0], label); break;
          case "str": add(T.attrs, "str", n[0], label); break;
          case "vit": add(T.attrs, "vit", n[0], label); break;
          case "allAttr": add(T.attrs, "all", n[0], label); break;
          case "stunChance": add(T.battle, "stun", n[0], label); break;
          case "burnPct": add(T.battle, "burn", n[0], label); break;
          case "armorPenPct": add(T.battle, "pen", n[0], label); break;
          case "fireDmgPct": add(T.battle, "fire", n[0], label); break;
          case "eliteDmgPct": add(T.battle, "elite", n[0], label); break;
          case "lifestealPct": add(T.battle, "lifesteal", n[0], label); break;
          case "curseChance": add(T.battle, "curse", n[0], label); break;
          case "freezeChance": add(T.battle, "freeze", n[0], label); break;
          case "thornsPct": add(T.battle, "thorns", n[0], label); break;
          case "undeadResPct": add(T.battle, "undeadRes", n[0], label); break;
          case "goldPct": add(T.eco, "gold", n[0], label); break;
          case "expPct": add(T.eco, "exp", n[0], label); break;
          case "lootRarityPct": add(T.eco, "lootRarity", n[0], label); break;
        }
      }
    }
    if (T.battle.pen) T.battle.pen = Math.min(T.battle.pen, 60);           // пробиття — не більше 60%
    if (T.battle.undeadRes) T.battle.undeadRes = Math.min(T.battle.undeadRes, 60);
    return T;
  }
  // Атрибути від рун (для stats.js → totalAttrs)
  function runeAttrs(ms) {
    const a = runeTotals(ms).attrs, out = {};
    for (const k of Object.keys(RPG.ATTRS || {})) out[k] = (a[k] || 0) + (a.all || 0);
    return out;
  }
  // Сума бонусів рун усієї групи (золото, рідкість здобичі)
  function teamRuneEco(members) {
    const e = { gold: 0, exp: 0, lootRarity: 0 };
    for (const ms of members || []) { const t = runeTotals(ms).eco; for (const k in e) e[k] += t[k] || 0; }
    return e;
  }

  Object.assign(RPG, { RUNES, RUNE_GRADES, RUNE_GRADE_ORDER, RUNE_KIND_NAME, runeItemId, RUNE_IDS, RUNE_FORGE, runeForgeOdds, runeForge,
    RUNE_FITS, runeFits, runeEffectText, insertRune, removeRune, crackedRunes, runeNums, runeTotals, runeAttrs, teamRuneEco });
})(window.RPG);
