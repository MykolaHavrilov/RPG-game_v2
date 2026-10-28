// ============================================================
// data/recipes.js — РЕЦЕПТИ КУЗНІ (план крафту, етап 7; книга «Небесна кузня. Настанова»)
//
// RECIPES[<id речі>] = { tier, mats: [[id матеріалу, кількість], …], tools: [id знаряддя, …] }
//   tier  — 1 / 2 / 3: потрібна майстерність CRAFT_TIER_LEVEL[tier] (1 / 10 / 20)
//   mats  — базові ID матеріалів; підходить будь-яка рідкість (craft.js сам підбирає стопки)
//   tools — знаряддя понад обов'язкові (горно, ковадло, молот, кліщі, діжка — потрібні завжди)
// SMELT[<id злитка>] = { ore, oreQty, coal, tools } — переплавка руди в горні (завжди вдається).
// Кувати можна будь-які речі — незалежно від професії героя.
// Підключається ПІСЛЯ data/items.js, ДО craft.js.
// ============================================================

(function (RPG) {
  const CRAFT_TIER_LEVEL = { 1: 1, 2: 10, 3: 20 };

  const RECIPES = {
    // ---------- Тір 1 (дерево, льон, мідь) ----------
    sword_t1:   { tier: 1, mats: [["oak_wood", 4], ["leather_strap", 1]], tools: ["carving"] },
    dagger_t1:  { tier: 1, mats: [["oak_wood", 2], ["leather_strap", 1]], tools: ["carving"] },
    axe_t1:     { tier: 1, mats: [["oak_wood", 5], ["leather_strap", 1]], tools: ["carving"] },
    bow_t1:     { tier: 1, mats: [["ash_wood", 4], ["flax", 2]], tools: ["carving"] },
    staff_t1:   { tier: 1, mats: [["ash_wood", 4], ["glass", 1], ["slime_gel", 2]], tools: ["carving"] },
    shield_t1:  { tier: 1, mats: [["oak_wood", 6], ["leather_strap", 2]], tools: ["carving"] },
    quiver_t1:  { tier: 1, mats: [["flax", 4], ["rat_tail", 3]], tools: [] },
    orb_t1:     { tier: 1, mats: [["glass", 3], ["slime_gel", 3]], tools: [] },
    knife_t1:   { tier: 1, mats: [["oak_wood", 2], ["leather_strap", 1]], tools: ["carving"] },
    linen_head:  { tier: 1, mats: [["flax", 3], ["rat_skin", 1]], tools: [] },
    linen_chest: { tier: 1, mats: [["flax", 6], ["rat_skin", 2]], tools: [] },
    linen_legs:  { tier: 1, mats: [["flax", 5], ["rat_skin", 2]], tools: [] },
    linen_hands: { tier: 1, mats: [["flax", 3], ["rat_skin", 1]], tools: [] },
    linen_feet:  { tier: 1, mats: [["flax", 4], ["rat_skin", 2]], tools: [] },
    ring_t1:    { tier: 1, mats: [["copper_ingot", 2], ["slime_gel", 1]], tools: ["crucible"] },
    amulet_t1:  { tier: 1, mats: [["copper_ingot", 3], ["slime_gel", 1]], tools: ["crucible"] },
    earring_t1: { tier: 1, mats: [["copper_ingot", 1], ["slime_gel", 1]], tools: ["crucible"] },

    // ---------- Тір 2 (камінь, шкіра, срібло) ----------
    sword_t2:   { tier: 2, mats: [["flint", 6], ["oak_wood", 2], ["leather_strap", 2]], tools: [] },
    dagger_t2:  { tier: 2, mats: [["flint", 3], ["leather_strap", 1]], tools: [] },
    axe_t2:     { tier: 2, mats: [["flint", 7], ["oak_wood", 3]], tools: [] },
    bow_t2:     { tier: 2, mats: [["ash_wood", 5], ["flint", 2], ["wolf_pelt", 1]], tools: ["carving"] },
    staff_t2:   { tier: 2, mats: [["ash_wood", 4], ["lapis", 2], ["slime_gel", 3]], tools: ["carving"] },
    shield_t2:  { tier: 2, mats: [["oak_wood", 4], ["wolf_pelt", 4]], tools: ["leatherwork"] },
    quiver_t2:  { tier: 2, mats: [["wolf_pelt", 3], ["leather_strap", 2]], tools: ["leatherwork"] },
    orb_t2:     { tier: 2, mats: [["lapis", 3], ["slime_gel", 4]], tools: [] },
    knife_t2:   { tier: 2, mats: [["flint", 2], ["leather_strap", 1]], tools: [] },
    leather_head:  { tier: 2, mats: [["wolf_pelt", 3], ["leather_strap", 1]], tools: ["leatherwork"] },
    leather_chest: { tier: 2, mats: [["wolf_pelt", 6], ["leather_strap", 2]], tools: ["leatherwork"] },
    leather_legs:  { tier: 2, mats: [["wolf_pelt", 5], ["leather_strap", 2]], tools: ["leatherwork"] },
    leather_hands: { tier: 2, mats: [["wolf_pelt", 3], ["wolf_fang", 2]], tools: ["leatherwork"] },
    leather_feet:  { tier: 2, mats: [["wolf_pelt", 4], ["leather_strap", 2]], tools: ["leatherwork"] },
    ring_t2:    { tier: 2, mats: [["silver_ingot", 2], ["slime_gel", 1]], tools: ["crucible"] },
    amulet_t2:  { tier: 2, mats: [["silver_ingot", 3], ["wolf_fang", 2]], tools: ["crucible"] },
    earring_t2: { tier: 2, mats: [["silver_ingot", 1], ["slime_gel", 1]], tools: ["crucible"] },

    // ---------- Тір 3 (залізо, онікс, золото) ----------
    sword_t3:   { tier: 3, mats: [["iron_ingot", 6], ["coal", 4], ["leather_strap", 2]], tools: ["bellows"] },
    dagger_t3:  { tier: 3, mats: [["iron_ingot", 3], ["coal", 2], ["leather_strap", 1]], tools: ["bellows"] },
    axe_t3:     { tier: 3, mats: [["iron_ingot", 7], ["coal", 4], ["oak_wood", 2]], tools: ["bellows"] },
    bow_t3:     { tier: 3, mats: [["ash_wood", 5], ["iron_ingot", 2], ["white_pelt", 1]], tools: ["carving", "bellows"] },
    staff_t3:   { tier: 3, mats: [["ash_wood", 3], ["iron_ingot", 2], ["onyx", 2]], tools: ["carving", "bellows"] },
    shield_t3:  { tier: 3, mats: [["iron_ingot", 6], ["coal", 3], ["oak_wood", 2]], tools: ["bellows"] },
    quiver_t3:  { tier: 3, mats: [["white_pelt", 2], ["iron_ingot", 2], ["leather_strap", 2]], tools: ["leatherwork", "bellows"] },
    orb_t3:     { tier: 3, mats: [["onyx", 3], ["iron_ingot", 1]], tools: ["bellows"] },
    knife_t3:   { tier: 3, mats: [["iron_ingot", 2], ["coal", 1], ["leather_strap", 1]], tools: ["bellows"] },
    iron_head:  { tier: 3, mats: [["iron_ingot", 4], ["coal", 2], ["white_pelt", 1]], tools: ["bellows"] },
    iron_chest: { tier: 3, mats: [["iron_ingot", 8], ["coal", 4], ["white_pelt", 1]], tools: ["bellows"] },
    iron_legs:  { tier: 3, mats: [["iron_ingot", 6], ["coal", 3], ["white_pelt", 1]], tools: ["bellows"] },
    iron_hands: { tier: 3, mats: [["iron_ingot", 4], ["coal", 2], ["white_pelt", 1]], tools: ["bellows"] },
    iron_feet:  { tier: 3, mats: [["iron_ingot", 5], ["coal", 2], ["white_pelt", 1]], tools: ["bellows"] },
    ring_t3:    { tier: 3, mats: [["gold_ingot", 2], ["gem", 1]], tools: ["crucible"] },
    amulet_t3:  { tier: 3, mats: [["gold_ingot", 3], ["gem", 1]], tools: ["crucible"] },
    earring_t3: { tier: 3, mats: [["gold_ingot", 1], ["gem", 1]], tools: ["crucible"] }
  };

  // Переплавка: 2 руди (+ вугілля для заліза) → 1 злиток тієї ж рідкості
  const SMELT = {
    copper_ingot: { ore: "copper_ore", oreQty: 2, coal: 0, tools: [] },
    silver_ingot: { ore: "silver_ore", oreQty: 2, coal: 0, tools: [] },
    iron_ingot:   { ore: "iron_ore",   oreQty: 2, coal: 1, tools: ["bellows"] },
    gold_ingot:   { ore: "gold_ore",   oreQty: 2, coal: 0, tools: [] }
  };

  // Групи для вкладок кузні
  const RECIPE_GROUPS = [
    { id: "weapon", name: "Зброя", types: ["weapon"] },
    { id: "offhand", name: "Ліва рука", types: ["shield", "offhand"] },
    { id: "armor", name: "Броня", types: ["armor"] },
    { id: "accessory", name: "Прикраси", types: ["accessory"] }
  ];

  Object.assign(RPG, { CRAFT_TIER_LEVEL, RECIPES, SMELT, RECIPE_GROUPS });
})(window.RPG);
