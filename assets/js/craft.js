// ============================================================
// craft.js — КУВАННЯ В КУЗНІ ВЛАСНОГО ДОМУ (план крафту, етап 7)
//
// Майстерність коваля — лише в головного героя (save.character.craft = { level, exp }), а речі носить уся група.
// Рівні 1–30: шанс успіху росте з 10% на 1 рівні до 95% на 30-му (+2,93% за рівень).
// Невдача — річ виходить ЗЛАМАНОЮ (матеріали витрачено). Успіх — рідкість за таблицею RARITY_ANCHORS
// (опорні рівні 1, 5, 10, 15, 20, 25, 30, між ними — плавно). Числа — з «Небесна_кузня_крафт_v2.xlsx».
//
// Якість матеріалів: середня рідкість витрачених стопок (звичайна 0, магічна 1, епічна 2, легендарна 3)
// переносить частину звичайних результатів у кращі рідкості; Небесна іскра (за бажанням) додає +10% до легендарної і згоряє.
// Кувати можна лише в домі з кузнею і всіма обов'язковими знаряддями, героєві з професією.
// Підключається ПІСЛЯ character.js, data/items.js, data/recipes.js, rarity.js.
// ============================================================

(function (RPG) {
  const MAX_LEVEL = 30;
  const MIN_CHANCE = 0.10, MAX_CHANCE = 0.95;
  // Досвід до наступного рівня: 10 × рівень² (1→2: 10, 9→10: 810, 29→30: 8 410; разом ≈ 85 550)
  const expToNext = lvl => lvl >= MAX_LEVEL ? Infinity : 10 * lvl * lvl;
  // Досвід за кування: тір 1/2/3 → 15/40/100; зламана — половина; переплавка — 1 за злиток
  const CRAFT_EXP = { 1: 15, 2: 40, 3: 100 };
  const SMELT_EXP = 1;
  // Опорні точки: частки магічних / епічних / легендарних речей від усіх спроб
  const RARITY_ANCHORS = [
    [1, 0, 0, 0], [5, 0.03, 0, 0], [10, 0.07, 0.01, 0], [15, 0.13, 0.04, 0],
    [20, 0.20, 0.08, 0.01], [25, 0.28, 0.11, 0.03], [30, 0.35, 0.17, 0.06]
  ];
  const GRADE_SCORE = { common: 0, magic: 1, epic: 2, legendary: 3 };
  const GRADE_ORDER = ["common", "magic", "epic", "legendary"];
  const SPARK_BONUS = 0.10;

  function craftState(save) {
    const ch = save.character;
    ch.craft ??= { level: 1, exp: 0 };
    return ch.craft;
  }
  function baseChance(level) {
    return Math.min(MAX_CHANCE, MIN_CHANCE + (level - 1) * (MAX_CHANCE - MIN_CHANCE) / (MAX_LEVEL - 1));
  }
  // Бонус знарядь (залізне ковадло) — у частках
  function toolBonus(house) {
    let b = 0;
    for (const [id, t] of Object.entries(RPG.FORGE_TOOLS)) if (t.bonus && house?.forge?.tools?.[id]) b += t.bonus / 100;
    return b;
  }
  function successChance(save, house) {
    return Math.min(MAX_CHANCE, baseChance(craftState(save).level) + toolBonus(house));
  }
  // Частки рідкостей для рівня (без бонусів якості): { broken, common, magic, epic, legendary }
  function rarityTable(level, success) {
    let i = 0;
    while (i < RARITY_ANCHORS.length - 1 && RARITY_ANCHORS[i + 1][0] <= level) i++;
    const lo = RARITY_ANCHORS[i], hi = RARITY_ANCHORS[Math.min(i + 1, RARITY_ANCHORS.length - 1)];
    const t = hi[0] === lo[0] ? 0 : (level - lo[0]) / (hi[0] - lo[0]);
    const lerp = k => lo[k] + (hi[k] - lo[k]) * t;
    const magic = lerp(1), epic = lerp(2), legendary = lerp(3);
    // базова таблиця розрахована на базовий шанс — частки рідкостей масштабуємо до фактичного успіху
    const scale = success / Math.max(0.0001, baseChance(level));
    const out = { magic: magic * scale, epic: epic * scale, legendary: legendary * scale };
    out.common = Math.max(0, success - out.magic - out.epic - out.legendary);
    out.broken = 1 - success;
    return out;
  }
  // Зсув за якістю матеріалів (q — середній бал 0..3) та Небесною іскрою
  // Якість переносить частину ЗВИЧАЙНИХ результатів у кращі рідкості (на низькій майстерності ефект малий):
  // за кожен бал якості — 15% звичайних у магічні, 8% у епічні, 2% у легендарні (при q = 3 — разом 75%).
  // Небесна іскра — ще до +10% (від усіх спроб) до легендарної, але не більше 60% звичайних, що лишились.
  function applyQuality(tab, q, spark) {
    const t = { ...tab };
    const base = t.common;
    const move = (to, amount) => { const a = Math.max(0, Math.min(t.common, amount)); t.common -= a; t[to] += a; };
    move("magic", base * 0.15 * q);
    move("epic", base * 0.08 * q);
    move("legendary", base * 0.02 * q);
    if (spark) move("legendary", Math.min(SPARK_BONUS, t.common * 0.6));
    return t;
  }

  // Скільки є матеріалу (усіх рідкостей) в інвентарі
  function haveMaterial(save, baseId) {
    return GRADE_ORDER.reduce((n, g) => n + RPG.countItem(save, RPG.materialOfGrade(baseId, g)), 0);
  }
  // План витрати: які стопки брати. preferRare — спершу рідкісніші, інакше спершу звичайні
  function pickMaterials(save, mats, mult = 1, preferRare = false) {
    const order = preferRare ? [...GRADE_ORDER].reverse() : GRADE_ORDER;
    const plan = [];
    let score = 0, units = 0;
    for (const [baseId, qty] of mats) {
      let left = qty * mult;
      for (const g of order) {
        const id = RPG.materialOfGrade(baseId, g);
        if (g !== "common" && id === baseId) continue;
        const take = Math.min(left, RPG.countItem(save, id));
        if (take > 0) { plan.push([id, take]); score += GRADE_SCORE[g] * take; units += take; left -= take; }
        if (!left) break;
      }
      if (left > 0) return null;
    }
    return { plan, quality: units ? score / units : 0 };
  }

  // Перевірка, чи можна кувати тут і зараз. Повертає { ok, reason, house }
  function forgeReady(save, toolsNeeded = []) {
    if (!RPG.hasCraftAccess(save)) return { ok: false, reason: "Кувати можна, коли головний герой має професію." };
    const house = RPG.houseHere(save);
    if (!house) return { ok: false, reason: "Кувати можна лише у власному домі з кузнею." };
    if (!house.forge) return { ok: false, reason: "Спершу збудуйте кузню при домі." };
    const miss = RPG.forgeMissing(house);
    if (miss.length) return { ok: false, reason: `Бракує знарядь: ${miss.map(id => RPG.FORGE_TOOLS[id].name.toLowerCase()).join(", ")}.`, house };
    const extra = toolsNeeded.filter(id => !house.forge.tools[id]);
    if (extra.length) return { ok: false, reason: `Для цього потрібно: ${extra.map(id => RPG.FORGE_TOOLS[id].name.toLowerCase()).join(", ")}.`, house };
    return { ok: true, house };
  }

  // Стан рецепта для показу: { recipe, level, tierLevel, levelOk, tools: [{id, have}], mats: [{id, need, have}], canCraft, reason }
  function recipeInfo(save, itemId) {
    const recipe = RPG.RECIPES[itemId];
    if (!recipe) return null;
    const st = craftState(save);
    const house = RPG.houseHere(save);
    const tierLevel = RPG.CRAFT_TIER_LEVEL[recipe.tier];
    const mats = recipe.mats.map(([id, need]) => ({ id, need, have: haveMaterial(save, id) }));
    const tools = recipe.tools.map(id => ({ id, have: !!house?.forge?.tools?.[id] }));
    const ready = forgeReady(save, recipe.tools);
    let reason = "";
    if (st.level < tierLevel) reason = `Потрібна майстерність ${tierLevel}.`;
    else if (!ready.ok) reason = ready.reason;
    else if (mats.some(m => m.have < m.need)) reason = "Бракує матеріалів.";
    else if (!RPG.invFree(save)) reason = "Інвентар повний.";
    return { recipe, tierLevel, levelOk: st.level >= tierLevel, mats, tools, canCraft: !reason, reason };
  }

  function addCraftExp(save, amount) {
    const st = craftState(save);
    const ups = [];
    if (st.level >= MAX_LEVEL) return ups;
    st.exp += Math.max(0, Math.floor(amount));
    while (st.level < MAX_LEVEL && st.exp >= expToNext(st.level)) {
      st.exp -= expToNext(st.level);
      st.level++;
      ups.push(st.level);
    }
    if (st.level >= MAX_LEVEL) st.exp = 0;
    return ups;
  }

  function rollFrom(tab) {
    let x = Math.random();
    for (const r of ["legendary", "epic", "magic", "common", "broken"]) {
      if (x < tab[r]) return r;
      x -= tab[r];
    }
    return "common";
  }

  // Шанси для показу перед куванням (з урахуванням вибраних матеріалів та іскри)
  function craftOdds(save, itemId, opts = {}) {
    const recipe = RPG.RECIPES[itemId];
    const house = RPG.houseHere(save);
    const success = successChance(save, house);
    const pick = recipe ? pickMaterials(save, recipe.mats, 1, !!opts.preferRare) : null;
    const spark = !!opts.spark && RPG.countItem(save, "heavenly_spark") > 0;
    return applyQuality(rarityTable(craftState(save).level, success), pick?.quality || 0, spark);
  }

  // Кувати річ. opts: { preferRare, spark }. Повертає { ok, reason } або { ok, ref, rarity, exp, levelUps }
  function craftItem(save, itemId, opts = {}) {
    const info = recipeInfo(save, itemId);
    if (!info) return { ok: false, reason: "Такого рецепта немає." };
    if (!info.canCraft) return { ok: false, reason: info.reason };
    const pick = pickMaterials(save, info.recipe.mats, 1, !!opts.preferRare);
    if (!pick) return { ok: false, reason: "Бракує матеріалів." };
    const spark = !!opts.spark && RPG.countItem(save, "heavenly_spark") > 0;
    const tab = craftOdds(save, itemId, opts);
    for (const [id, qty] of pick.plan) RPG.removeItem(save, id, qty);
    if (spark) RPG.removeItem(save, "heavenly_spark", 1);
    const rarity = rollFrom(tab);
    const ref = RPG.makeItem(itemId, rarity);
    save.inventory.push(ref);
    const exp = Math.round(CRAFT_EXP[info.recipe.tier] * (rarity === "broken" ? 0.5 : 1));
    const levelUps = addCraftExp(save, exp);
    return { ok: true, ref, rarity, exp, levelUps, spark };
  }

  // ---------- Переплавка руди ----------
  function smeltInfo(save, ingotId) {
    const s = RPG.SMELT[ingotId];
    if (!s) return null;
    const ready = forgeReady(save, s.tools);
    // скільки злитків можна зробити з руди кожної рідкості
    const byGrade = GRADE_ORDER.map(g => {
      const ore = RPG.materialOfGrade(s.ore, g);
      const can = ore === s.ore && g !== "common" ? 0 : Math.floor(RPG.countItem(save, ore) / s.oreQty);
      return { grade: g, ore, ingot: RPG.materialOfGrade(ingotId, g), can };
    });
    const coalHave = haveMaterial(save, "coal");
    const total = byGrade.reduce((n, b) => n + b.can, 0);
    const max = s.coal ? Math.min(total, Math.floor(coalHave / s.coal)) : total;
    return { s, ready, byGrade, max, coalHave };
  }
  // Переплавити до n злитків (спершу з руди нижчої рідкості). Злиток має рідкість руди.
  function smelt(save, ingotId, n = 1) {
    const info = smeltInfo(save, ingotId);
    if (!info) return { ok: false, reason: "Такого злитка немає." };
    if (!info.ready.ok) return { ok: false, reason: info.ready.reason };
    n = Math.max(1, Math.min(Math.floor(n), info.max));
    if (!info.max) return { ok: false, reason: info.s.coal ? "Бракує руди або вугілля." : "Бракує руди." };
    let left = n, made = 0;
    for (const b of info.byGrade) {
      const k = Math.min(left, b.can);
      if (!k) continue;
      if (RPG.fitQty(save, b.ingot, k) < k) return { ok: false, reason: "Інвентар повний." };
      RPG.removeItem(save, b.ore, k * info.s.oreQty);
      if (info.s.coal) {
        const pick = pickMaterials(save, [["coal", info.s.coal]], k, false);
        for (const [id, q] of pick.plan) RPG.removeItem(save, id, q);
      }
      RPG.addItem(save, b.ingot, k);
      made += k; left -= k;
      if (!left) break;
    }
    const levelUps = addCraftExp(save, made * SMELT_EXP);
    return { ok: true, made, exp: made * SMELT_EXP, levelUps };
  }

  Object.assign(RPG, {
    CRAFT_MAX_LEVEL: MAX_LEVEL, CRAFT_EXP, craftState, craftExpToNext: expToNext, baseCraftChance: baseChance,
    craftSuccessChance: successChance, craftRarityTable: rarityTable, craftOdds, haveMaterial, recipeInfo,
    craftForgeReady: forgeReady, craftItem, addCraftExp, smeltInfo, smelt
  });
})(window.RPG);
