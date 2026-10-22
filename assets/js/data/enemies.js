// ============================================================
// ДОВІДНИК ВОРОГІВ ТА ЛОКАЦІЙ
// stats: hp, mp, attack, magic, defense, magicDefense, speed,
//        crit (%), blockPhys (%), blockMag (%)
// exp  — скільки досвіду дає КОЖЕН убитий ворог
//        (і від нього ж рахується штраф при загибелі героя: exp × 10)
// gold — [мін, макс]
// loot — chance — шанс від 0 до 1, qty — [мін, макс]
//        Чим вищий рівень ворога, тим кращі речі та більші зілля.
// sprite — номер кадру у спрайт-листі ворогів assets/images/ENEMIES_1 (256×256, відступ 2 px)
// verb  — як ворог б'є (у журналі бою), за замовчуванням «кусає»
// spell — магічна атака: { name, mp, mult, chance } — сила магії × mult проти маг. захисту,
//         використовується з шансом chance, якщо вистачає мани
// skills — унікальні навички (бос): по черзі, кожен 3-й власний хід ворога.
//          kind: "magic" (шкода), "heal" (лікує healPct від макс. HP), "stun" (шкода + герой пропускає хід)
// range — дальність атаки ворога: 1 — ближній бій, 2 — середній, 3 — дальній
//         (бій починається з відстані 3; хто не дістає — підходить на 1 за хід)
// move  — власний прийом ворога: { name, mult, chance } — фізичний удар attack × mult;
//         якщо не вказано — береться типовий прийом за дальністю (MONSTER_MOVES)
// noChampion — не може стати чемпіоном; boss — показується як бос
//         (GS боса завжди на 200 більший за GS групи героїв — monstergear.js)
// humanoid — гуманоїд (руки, ноги, голова): перед боєм вдягає приховане спорядження
//         під GS групи героїв (monstergear.js); ці речі ніколи не випадають
// spawnWeight — множник шансу зустрічі (1 — звичайно, 0.1 — у 10 разів рідше)
// ============================================================

(function (RPG) {
  // Спрайт-лист ворогів: 5 стовпців × 2 рядки, кадр 256×256, відступ 2 px
  const ENEMY_SHEET = { file: "assets/images/ENEMIES_1", ext: ".webp", cols: 5, rows: 2, size: 256, gap: 2 };

  // Типові прийоми монстрів за дальністю атаки
  const MONSTER_MOVES = {
    1: { name: "Шматування",        mult: 1.6,  chance: 0.25 },   // ближній бій
    2: { name: "Удар з наскоку",     mult: 1.35, chance: 0.30 },   // середня дистанція
    3: { name: "Прицільний постріл", mult: 1.45, chance: 0.30 }    // дальній бій
  };
  const RANGE_NAMES = { 1: "ближній бій", 2: "середня дистанція", 3: "дальній бій" };

  const ENEMIES = {
    // ---------- Щури (1–3 рівень) ----------
    rat: {
      name: "Щур з льоху",
      range: 1, move: { name: "Сказений укус", mult: 1.5, chance: 0.25 },
      sprite: 0,
      level: 1,
      stats: { hp: 30, mp: 0, attack: 7, defense: 1, magicDefense: 0, speed: 4, crit: 3 },
      exp: 2,
      gold: [0, 2],
      loot: [
        { id: "rat_tail",         chance: 0.5, qty: [1, 1] },
        { id: "potion_hp_small",  chance: 0.06, qty: [1, 1] },
        { id: "linen_legs",       chance: 0.01, qty: [1, 1] },
        { id: "sword_t1",         chance: 0.006, qty: [1, 1] }
      ]
    },
    rat2: {
      name: "Щур з поля",
      range: 1, move: { name: "Сказений укус", mult: 1.5, chance: 0.25 },
      sprite: 1,
      level: 2,
      stats: { hp: 45, mp: 0, attack: 10, defense: 2, magicDefense: 1, speed: 5, crit: 4 },
      exp: 6,
      gold: [1, 4],
      loot: [
        { id: "rat_tail",         chance: 0.55, qty: [1, 2] },
        { id: "rat_skin",         chance: 0.25, qty: [1, 1] },
        { id: "potion_hp_small",  chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_small",  chance: 0.04, qty: [1, 1] },
        { id: "linen_head",       chance: 0.012, qty: [1, 1] },
        { id: "dagger_t1",        chance: 0.01, qty: [1, 1] },
        { id: "knife_t1",         chance: 0.006, qty: [1, 1] }
      ]
    },
    rat3: {
      name: "Щур з підвалу",
      range: 1, move: { name: "Сказений укус", mult: 1.55, chance: 0.28 },
      sprite: 2,
      level: 3,
      stats: { hp: 65, mp: 0, attack: 14, defense: 3, magicDefense: 1, speed: 6, crit: 5 },
      exp: 20,
      gold: [3, 8],
      loot: [
        { id: "rat_tail",         chance: 0.6, qty: [1, 2] },
        { id: "rat_skin",         chance: 0.35, qty: [1, 1] },
        { id: "potion_hp_small",  chance: 0.1, qty: [1, 1] },
        { id: "potion_mp_small",  chance: 0.06, qty: [1, 1] },
        { id: "potion_hp_medium", chance: 0.02, qty: [1, 1] },
        { id: "ring_t1",          chance: 0.01, qty: [1, 1] },
        { id: "linen_hands",      chance: 0.012, qty: [1, 1] },
        { id: "linen_chest",      chance: 0.01, qty: [1, 1] },
        { id: "axe_t1",           chance: 0.008, qty: [1, 1] },
        { id: "bow_t1",           chance: 0.008, qty: [1, 1] }
      ]
    },

    // ---------- Вовки (4–6 рівень) ----------
    wolf: {
      name: "Сірий вовк",
      range: 1, move: { name: "Розірвати горлянку", mult: 1.6, chance: 0.25 },
      sprite: 3,
      level: 4,
      stats: { hp: 110, mp: 0, attack: 20, defense: 5, magicDefense: 2, speed: 8, crit: 6, blockPhys: 3 },
      exp: 40,
      gold: [5, 12],
      loot: [
        { id: "wolf_pelt",        chance: 0.45, qty: [1, 1] },
        { id: "wolf_fang",        chance: 0.25, qty: [1, 1] },
        { id: "potion_hp_small",  chance: 0.08, qty: [1, 1] },
        { id: "potion_hp_medium", chance: 0.05, qty: [1, 1] },
        { id: "potion_mp_medium", chance: 0.025, qty: [1, 1] },
        { id: "linen_feet",       chance: 0.012, qty: [1, 1] },
        { id: "axe_t1",           chance: 0.01, qty: [1, 1] },
        { id: "shield_t1",        chance: 0.008, qty: [1, 1] },
        { id: "quiver_t1",        chance: 0.008, qty: [1, 1] },
        { id: "amulet_t1",        chance: 0.006, qty: [1, 1] },
        { id: "earring_t1",       chance: 0.006, qty: [1, 1] },
        { id: "potion_magic",     chance: 0.003, qty: [1, 1] }
      ]
    },
    wolf2: {
      name: "Чорний вовк",
      range: 1, move: { name: "Розірвати горлянку", mult: 1.65, chance: 0.28 },
      sprite: 4,
      level: 5,
      stats: { hp: 150, mp: 0, attack: 26, defense: 7, magicDefense: 3, speed: 9, crit: 8, blockPhys: 4 },
      exp: 60,
      gold: [8, 18],
      loot: [
        { id: "wolf_pelt",        chance: 0.5, qty: [1, 2] },
        { id: "wolf_fang",        chance: 0.35, qty: [1, 1] },
        { id: "potion_hp_medium", chance: 0.07, qty: [1, 1] },
        { id: "potion_mp_medium", chance: 0.045, qty: [1, 1] },
        { id: "potion_hp_large",  chance: 0.008, qty: [1, 1] },
        { id: "linen_head",       chance: 0.012, qty: [1, 1] },
        { id: "staff_t1",         chance: 0.008, qty: [1, 1] },
        { id: "orb_t1",           chance: 0.008, qty: [1, 1] },
        { id: "ring_t1",          chance: 0.006, qty: [1, 1] },
        { id: "amulet_t1",        chance: 0.008, qty: [1, 1] },
        { id: "earring_t1",       chance: 0.006, qty: [1, 1] },
        { id: "leather_hands",    chance: 0.003, qty: [1, 1] },
        { id: "potion_magic",     chance: 0.005, qty: [1, 1] }
      ]
    },
    wolf3: {
      name: "Білий вовк",
      range: 1, move: { name: "Розірвати горлянку", mult: 1.65, chance: 0.28 },
      sprite: 5,
      level: 6,
      stats: { hp: 200, mp: 0, attack: 32, defense: 9, magicDefense: 4, speed: 10, crit: 10, blockPhys: 5 },
      exp: 90,
      gold: [12, 25],
      loot: [
        { id: "white_pelt",       chance: 0.45, qty: [1, 1] },
        { id: "wolf_fang",        chance: 0.4, qty: [1, 2] },
        { id: "potion_hp_medium", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_medium", chance: 0.05, qty: [1, 1] },
        { id: "potion_hp_large",  chance: 0.015, qty: [1, 1] },
        { id: "potion_mp_large",  chance: 0.01, qty: [1, 1] },
        { id: "linen_chest",      chance: 0.01, qty: [1, 1] },
        { id: "bow_t1",           chance: 0.008, qty: [1, 1] },
        { id: "dagger_t1",        chance: 0.008, qty: [1, 1] },
        { id: "earring_t1",       chance: 0.008, qty: [1, 1] },
        { id: "leather_chest",    chance: 0.004, qty: [1, 1] },
        { id: "sword_t2",         chance: 0.002, qty: [1, 1] },
        { id: "shield_t2",        chance: 0.002, qty: [1, 1] },
        { id: "potion_magic",     chance: 0.008, qty: [1, 1] }
      ]
    },
    // ---------- Слайми (6–8 рівень) та Король слайм (Печера в лісі) ----------
    slime: {
      name: "Зелений слайм",
      range: 2, move: { name: "Стрибок слизу", mult: 1.35, chance: 0.25 },
      sprite: 6, verb: "хлюпає",
      level: 6,
      stats: { hp: 170, mp: 40, attack: 22, magic: 26, defense: 7, magicDefense: 10, speed: 7, crit: 4, blockMag: 4 },
      spell: { name: "Кислотний плювок", mp: 10, mult: 1.3, chance: 0.4 },
      exp: 100,
      gold: [10, 22],
      loot: [
        { id: "slime_gel",        chance: 0.6, qty: [1, 2] },
        { id: "potion_mp_small",  chance: 0.12, qty: [1, 1] },
        { id: "potion_mp_medium", chance: 0.05, qty: [1, 1] },
        { id: "potion_hp_medium", chance: 0.05, qty: [1, 1] },
        { id: "slime_ring",       chance: 0.012, qty: [1, 1] },
        { id: "slime_earring",    chance: 0.01, qty: [1, 1] },
        { id: "slime_amulet",     chance: 0.008, qty: [1, 1] },
        { id: "orb_t1",           chance: 0.008, qty: [1, 1] }
      ]
    },
    slime2: {
      name: "Синій слайм",
      range: 2, move: { name: "Стрибок слизу", mult: 1.35, chance: 0.25 },
      sprite: 7, verb: "хлюпає",
      level: 7,
      stats: { hp: 220, mp: 60, attack: 25, magic: 33, defense: 8, magicDefense: 14, speed: 8, crit: 5, blockMag: 6 },
      spell: { name: "Крижаний бризок", mp: 12, mult: 1.4, chance: 0.4 },
      exp: 140,
      gold: [14, 28],
      loot: [
        { id: "slime_gel",        chance: 0.65, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 1] },
        { id: "potion_hp_medium", chance: 0.06, qty: [1, 1] },
        { id: "potion_mp_large",  chance: 0.01, qty: [1, 1] },
        { id: "slime_ring",       chance: 0.015, qty: [1, 1] },
        { id: "slime_earring",    chance: 0.012, qty: [1, 1] },
        { id: "slime_amulet",     chance: 0.01, qty: [1, 1] },
        { id: "staff_t1",         chance: 0.008, qty: [1, 1] }
      ]
    },
    slime3: {
      name: "Фіолетовий слайм",
      range: 2, move: { name: "Стрибок слизу", mult: 1.35, chance: 0.25 },
      sprite: 8, verb: "хлюпає",
      level: 8,
      stats: { hp: 270, mp: 80, attack: 29, magic: 40, defense: 9, magicDefense: 16, speed: 9, crit: 6, blockMag: 8 },
      spell: { name: "Отруйна хмара", mp: 15, mult: 1.5, chance: 0.45 },
      exp: 190,
      gold: [18, 35],
      loot: [
        { id: "slime_gel",        chance: 0.7, qty: [1, 3] },
        { id: "potion_mp_medium", chance: 0.1, qty: [1, 1] },
        { id: "potion_hp_large",  chance: 0.015, qty: [1, 1] },
        { id: "potion_mp_large",  chance: 0.015, qty: [1, 1] },
        { id: "slime_ring",       chance: 0.018, qty: [1, 1] },
        { id: "slime_earring",    chance: 0.015, qty: [1, 1] },
        { id: "slime_amulet",     chance: 0.012, qty: [1, 1] },
        { id: "orb_t2",           chance: 0.004, qty: [1, 1] },
        { id: "potion_magic",     chance: 0.008, qty: [1, 1] }
      ]
    },
    slime_king: {
      name: "Король слайм",
      range: 2, move: { name: "Удар хвилею слизу", mult: 1.5, chance: 0.25 },
      sprite: 9, verb: "розчавлює вагою",
      level: 10,
      boss: true, noChampion: true, spawnWeight: 0.1,
      // У 5–6 разів сильніший за зеленого слайма: HP ×6, атака й магія ×1,6
      stats: { hp: 1020, mp: 300, attack: 35, magic: 42, defense: 14, magicDefense: 20, speed: 8, crit: 8, blockPhys: 5, blockMag: 10 },
      skills: [
        { kind: "magic", name: "Золотий потоп", mp: 40, mult: 2.2 },
        { kind: "heal",  name: "Королівське желе", mp: 50, healPct: 0.12 },
        { kind: "stun",  name: "Липкі кайдани", mp: 30, mult: 1.0 }
      ],
      exp: 1000,
      gold: [80, 150],
      loot: [
        { id: "slime_gel",        chance: 1, qty: [3, 6] },
        { id: "potion_mp_large",  chance: 0.25, qty: [1, 2] },
        { id: "potion_hp_large",  chance: 0.2, qty: [1, 1] },
        { id: "potion_magic",     chance: 0.1, qty: [1, 1] },
        { id: "slime_ring",       chance: 0.15, qty: [1, 1] },
        { id: "slime_earring",    chance: 0.15, qty: [1, 1] },
        { id: "slime_amulet",     chance: 0.12, qty: [1, 1] },
        { id: "orb_t2",           chance: 0.04, qty: [1, 1] },
        { id: "staff_t2",         chance: 0.04, qty: [1, 1] }
      ]
    },

    // ---------- ТЕМНИЙ ЛІС (10–25 рівень) — за Центральною брамою; картинки: assets/images/enemies/<id>.webp ----------
    shadow_wolf: {
      name: "Тіньовий вовк",
      range: 1, move: { name: "Укус із тіні", mult: 1.50, chance: 0.25 },
      verb: "кусає",
      level: 10,
      stats: { hp: 823, mp: 0, attack: 113, defense: 42, magicDefense: 50, speed: 18, crit: 12 },
      exp: 300,
      gold: [23, 44],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.04, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.03, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    rot_boar: {
      name: "Гнилий кабан",
      range: 1, move: { name: "Таранний удар", mult: 1.51, chance: 0.25 },
      verb: "б'є іклами",
      level: 11,
      stats: { hp: 1398, mp: 0, attack: 96, defense: 78, magicDefense: 62, speed: 11, crit: 7, blockPhys: 8 },
      exp: 363,
      gold: [25, 48],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.04, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.03, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    forest_spider: {
      name: "Лісовий павук",
      range: 2, move: { name: "Плювок отрутою", mult: 1.52, chance: 0.25 },
      verb: "кусає",
      level: 12,
      stats: { hp: 1029, mp: 0, attack: 112, defense: 54, magicDefense: 54, speed: 14, crit: 7 },
      exp: 432,
      gold: [28, 53],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.04, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.03, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    bog_leech: {
      name: "Болотяна п'явка",
      range: 1, move: { name: "Висмоктати кров", mult: 1.52, chance: 0.25 },
      verb: "присмоктується",
      level: 12,
      stats: { hp: 874, mp: 0, attack: 123, defense: 46, magicDefense: 54, speed: 19, crit: 12 },
      exp: 432,
      gold: [28, 53],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.04, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.03, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    drowner: {
      name: "Утопленик",
      humanoid: true,
      range: 1, move: { name: "Мертва хватка", mult: 1.53, chance: 0.25 },
      verb: "дряпає",
      level: 13,
      stats: { hp: 1481, mp: 0, attack: 105, defense: 84, magicDefense: 67, speed: 12, crit: 8, blockPhys: 8 },
      exp: 507,
      gold: [30, 57],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.04, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.03, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    will_wisp: {
      name: "Блукаючий вогник",
      range: 2, move: { name: "Спалах", mult: 1.54, chance: 0.25 },
      verb: "обпікає",
      level: 14,
      stats: { hp: 923, mp: 168, attack: 73, magic: 106, defense: 46, magicDefense: 87, speed: 15, crit: 8, blockMag: 8 },
      spell: { name: "Мертвецьке полум'я", mp: 17, mult: 1.4, chance: 0.4 },
      exp: 588,
      gold: [32, 62],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.04, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.03, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    skeleton_archer: {            // id лишається старий (сейви, квести); це скелет-мечник
      name: "Скелет-мечник",
      humanoid: true,
      range: 1, move: { name: "Удар іржавого меча", mult: 1.54, chance: 0.25 },
      verb: "рубає",
      level: 14,
      stats: { hp: 1086, mp: 0, attack: 122, defense: 58, magicDefense: 58, speed: 15, crit: 8 },
      exp: 588,
      gold: [32, 62],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.04, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.03, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    ghost: {
      name: "Привид",
      range: 2, move: { name: "Холодний дотик", mult: 1.55, chance: 0.25 },
      verb: "торкається",
      level: 15,
      stats: { hp: 947, mp: 180, attack: 76, magic: 111, defense: 48, magicDefense: 90, speed: 16, crit: 8, blockMag: 8 },
      spell: { name: "Крижаний стогін", mp: 18, mult: 1.4, chance: 0.4 },
      exp: 675,
      gold: [34, 66],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    ghoul: {
      name: "Гуль",
      humanoid: true,
      range: 1, move: { name: "Трупні пазурі", mult: 1.56, chance: 0.25 },
      verb: "шматує",
      level: 16,
      stats: { hp: 970, mp: 0, attack: 146, defense: 53, magicDefense: 62, speed: 22, crit: 13 },
      exp: 768,
      gold: [37, 70],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    web_hunter: {
      name: "Павук-мисливець",
      range: 1, move: { name: "Отруйне жало", mult: 1.56, chance: 0.25 },
      verb: "жалить",
      level: 16,
      stats: { hp: 970, mp: 0, attack: 146, defense: 53, magicDefense: 62, speed: 22, crit: 13 },
      exp: 768,
      gold: [37, 70],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    web_weaver: {
      name: "Павук-ткач",
      range: 2, move: { name: "Липка сітка", mult: 1.57, chance: 0.25 },
      verb: "кусає",
      level: 17,
      stats: { hp: 1167, mp: 0, attack: 137, defense: 64, magicDefense: 64, speed: 16, crit: 8 },
      exp: 867,
      gold: [39, 75],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    spider_queen: {
      name: "Королева павуків",
      range: 2, move: { name: "Отруйний укус", mult: 1.58, chance: 0.25 },
      verb: "кусає",
      level: 18,
      boss: true, noChampion: true, spawnWeight: 0.1,
      stats: { hp: 3101, mp: 450, attack: 136, magic: 120, defense: 73, magicDefense: 73, speed: 17, crit: 9, blockPhys: 8, blockMag: 8 },
      skills: [
        { kind: "magic", name: "Отруйна злива", mp: 40, mult: 2.0 },
        { kind: "stun", name: "Кокон", mp: 30, mult: 1.0 },
        { kind: "heal", name: "Пожерти здобич", mp: 50, healPct: 0.12 }
      ],
      exp: 4860,
      gold: [205, 395],
      loot: [
        { id: "potion_hp_large", chance: 0.35, qty: [1, 2] },
        { id: "potion_mp_large", chance: 0.3, qty: [1, 2] },
        { id: "potion_magic", chance: 0.15, qty: [1, 1] },
        { id: "sword_t2", chance: 0.04, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.04, qty: [1, 1] },
        { id: "axe_t2", chance: 0.04, qty: [1, 1] },
        { id: "bow_t2", chance: 0.04, qty: [1, 1] },
        { id: "staff_t2", chance: 0.04, qty: [1, 1] },
        { id: "shield_t2", chance: 0.04, qty: [1, 1] },
        { id: "quiver_t2", chance: 0.04, qty: [1, 1] },
        { id: "orb_t2", chance: 0.04, qty: [1, 1] },
        { id: "knife_t2", chance: 0.04, qty: [1, 1] },
        { id: "leather_head", chance: 0.04, qty: [1, 1] },
        { id: "leather_chest", chance: 0.04, qty: [1, 1] },
        { id: "leather_legs", chance: 0.04, qty: [1, 1] },
        { id: "leather_hands", chance: 0.04, qty: [1, 1] },
        { id: "leather_feet", chance: 0.04, qty: [1, 1] },
        { id: "ring_t2", chance: 0.04, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.04, qty: [1, 1] },
        { id: "earring_t2", chance: 0.04, qty: [1, 1] }
      ]
    },
    werewolf: {
      name: "Вовкулака",
      humanoid: true,
      range: 1, move: { name: "Розшматувати", mult: 1.58, chance: 0.25 },
      verb: "роздирає",
      level: 18,
      stats: { hp: 1014, mp: 0, attack: 157, defense: 56, magicDefense: 66, speed: 23, crit: 14 },
      exp: 972,
      gold: [41, 79],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    pack_leader: {
      name: "Ватажок зграї",
      range: 1, move: { name: "Удар ватажка", mult: 1.59, chance: 0.25 },
      verb: "б'є",
      level: 19,
      stats: { hp: 1705, mp: 0, attack: 133, defense: 102, magicDefense: 82, speed: 14, crit: 9, blockPhys: 8 },
      exp: 1083,
      gold: [44, 84],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    shadow_beast: {
      name: "Тіньовий звір",
      range: 2, move: { name: "Тіньовий кіготь", mult: 1.60, chance: 0.25 },
      verb: "рве",
      level: 20,
      stats: { hp: 1079, mp: 240, attack: 99, magic: 140, defense: 56, magicDefense: 105, speed: 18, crit: 9, blockMag: 8 },
      spell: { name: "Тіньовий подих", mp: 24, mult: 1.4, chance: 0.4 },
      exp: 1200,
      gold: [46, 88],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    cultist: {
      name: "Культист",
      humanoid: true,
      range: 2, move: { name: "Ритуальний ніж", mult: 1.60, chance: 0.25 },
      verb: "б'є ножем",
      level: 20,
      stats: { hp: 1079, mp: 240, attack: 99, magic: 140, defense: 56, magicDefense: 105, speed: 18, crit: 9, blockMag: 8 },
      spell: { name: "Чорне прокляття", mp: 24, mult: 1.4, chance: 0.4 },
      exp: 1200,
      gold: [46, 88],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    witch: {
      name: "Лісова відьма",
      humanoid: true,
      range: 3, move: { name: "Удар патерицею", mult: 1.61, chance: 0.25 },
      verb: "вдаряє патерицею",
      level: 21,
      stats: { hp: 1122, mp: 252, attack: 109, magic: 150, defense: 58, magicDefense: 108, speed: 18, crit: 9, blockMag: 8 },
      spell: { name: "Відьомський вогонь", mp: 25, mult: 1.4, chance: 0.4 },
      exp: 1323,
      gold: [48, 92],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    stone_golem: {
      name: "Кам'яний голем",
      range: 1, move: { name: "Кам'яний кулак", mult: 1.62, chance: 0.25 },
      verb: "трощить",
      level: 22,
      stats: { hp: 1917, mp: 0, attack: 180, defense: 111, magicDefense: 89, speed: 15, crit: 9, blockPhys: 8 },
      exp: 1452,
      gold: [51, 97],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    ancient_treant: {
      name: "Древній лісовик",
      range: 2, move: { name: "Удар корінням", mult: 1.63, chance: 0.25 },
      verb: "хльоскає",
      level: 23,
      stats: { hp: 1947, mp: 0, attack: 185, defense: 114, magicDefense: 91, speed: 16, crit: 10, blockPhys: 8 },
      exp: 1587,
      gold: [53, 101],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    black_rider: {
      name: "Чорний вершник",
      humanoid: true,
      range: 1, move: { name: "Наскок вершника", mult: 1.64, chance: 0.25 },
      verb: "рубає",
      level: 24,
      stats: { hp: 1201, mp: 0, attack: 234, defense: 66, magicDefense: 78, speed: 27, crit: 15 },
      exp: 1728,
      gold: [55, 106],
      loot: [
        { id: "potion_hp_medium", chance: 0.12, qty: [1, 2] },
        { id: "potion_mp_medium", chance: 0.08, qty: [1, 2] },
        { id: "potion_hp_large", chance: 0.08, qty: [1, 1] },
        { id: "potion_mp_large", chance: 0.06, qty: [1, 1] },
        { id: "potion_magic", chance: 0.01, qty: [1, 1] },
        { id: "leather_head", chance: 0.004, qty: [1, 1] },
        { id: "leather_chest", chance: 0.004, qty: [1, 1] },
        { id: "leather_legs", chance: 0.004, qty: [1, 1] },
        { id: "leather_hands", chance: 0.004, qty: [1, 1] },
        { id: "leather_feet", chance: 0.004, qty: [1, 1] },
        { id: "sword_t2", chance: 0.003, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.003, qty: [1, 1] },
        { id: "axe_t2", chance: 0.003, qty: [1, 1] },
        { id: "bow_t2", chance: 0.003, qty: [1, 1] },
        { id: "staff_t2", chance: 0.003, qty: [1, 1] },
        { id: "shield_t2", chance: 0.003, qty: [1, 1] },
        { id: "orb_t2", chance: 0.003, qty: [1, 1] },
        { id: "ring_t2", chance: 0.004, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.004, qty: [1, 1] },
        { id: "earring_t2", chance: 0.004, qty: [1, 1] }
      ]
    },
    forest_lord: {
      name: "Володар Темного лісу",
      humanoid: true,
      range: 2, move: { name: "Гнів лісу", mult: 1.65, chance: 0.25 },
      verb: "б'є",
      level: 25,
      boss: true, noChampion: true, spawnWeight: 0.1,
      stats: { hp: 3727, mp: 625, attack: 208, magic: 169, defense: 88, magicDefense: 88, speed: 20, crit: 10, blockPhys: 8, blockMag: 8 },
      skills: [
        { kind: "magic", name: "Темне коріння", mp: 60, mult: 2.4 },
        { kind: "heal", name: "Подих лісу", mp: 70, healPct: 0.1 },
        { kind: "stun", name: "Обійми коріння", mp: 45, mult: 1.1 }
      ],
      exp: 9375,
      gold: [285, 550],
      loot: [
        { id: "potion_hp_large", chance: 0.35, qty: [1, 2] },
        { id: "potion_mp_large", chance: 0.3, qty: [1, 2] },
        { id: "potion_magic", chance: 0.15, qty: [1, 1] },
        { id: "sword_t2", chance: 0.04, qty: [1, 1] },
        { id: "dagger_t2", chance: 0.04, qty: [1, 1] },
        { id: "axe_t2", chance: 0.04, qty: [1, 1] },
        { id: "bow_t2", chance: 0.04, qty: [1, 1] },
        { id: "staff_t2", chance: 0.04, qty: [1, 1] },
        { id: "shield_t2", chance: 0.04, qty: [1, 1] },
        { id: "quiver_t2", chance: 0.04, qty: [1, 1] },
        { id: "orb_t2", chance: 0.04, qty: [1, 1] },
        { id: "knife_t2", chance: 0.04, qty: [1, 1] },
        { id: "leather_head", chance: 0.04, qty: [1, 1] },
        { id: "leather_chest", chance: 0.04, qty: [1, 1] },
        { id: "leather_legs", chance: 0.04, qty: [1, 1] },
        { id: "leather_hands", chance: 0.04, qty: [1, 1] },
        { id: "leather_feet", chance: 0.04, qty: [1, 1] },
        { id: "ring_t2", chance: 0.04, qty: [1, 1] },
        { id: "amulet_t2", chance: 0.04, qty: [1, 1] },
        { id: "earring_t2", chance: 0.04, qty: [1, 1] }
      ]
    }
  };

  // ---------- Локації ----------
  // type:
  //   "home"   — Домівка: битися заборонено, скриня, +5% HP/MP кожні 10 с
  //   "temple" — Храм: тут відроджуються загиблі, молитва за полеглих у групі
  //   "tavern" — Шинок: торговець (shop — що він продає)
  //   "city"   — Місто з районами (districts); Гільдія авантюристів — у Південному
  //   "combat" — бойова локація (enemies — хто трапляється)
  // locked: true — «Закрито — відкриється згодом»
  // minLevel: N — вхід лише з N рівня героя
  // chest: "<id сховища>" — у локації стоїть скриня (character.js → CHEST_STORAGES).
  //   Скрині з однаковим id пов'язані — у них спільний вміст; новий id — окрема скриня.
  // ID локацій НЕ перейменовувати (вони в сейвах). village_start — це Ферма.
  const LOCATIONS = {
    home: {
      name: "Домівка",
      type: "home",
      chest: "main",
      description: "Рідна хата. Тут не б'ються: можна перепочити, розібрати речі й сховати цінне в скриню."
    },
    temple: {
      name: "Храм",
      type: "temple",
      description: "Сюди повертаються полеглі. Молитва тут відроджує загиблих побратимів."
    },
    village_start: {
      name: "Ферма",
      type: "combat",
      description: "Звідки беруться ці щури — з льоху під коморою, з підвалу під амбаром чи з поля? Тут водяться лише вони, а от за полем, у лісі, вже виють вовки…",
      enemies: ["rat", "rat2", "rat3"]
    },
    tavern: {
      name: "Шинок біля млина",
      type: "tavern",
      description: "Пахне хлібом і пивом. Шинкар купує все, але дешево, а продає — дорожче.",
      merchant: "Шинкар Остап",
      shop: [
        "potion_hp_small", "potion_hp_medium", "potion_mp_small", "potion_mp_medium",
        "sword_t1", "dagger_t1", "staff_t1", "shield_t1",
        "linen_head", "linen_chest", "linen_legs", "linen_hands", "linen_feet"
      ]
    },
    // Південні ворота Міста на стартовій мапі (region "start"): дійшовши сюди, герой одразу входить у Місто
    south_gate: {
      name: "Південний район",
      type: "citygate",
      description: "Південні ворота Міста. За ними — Південний район з Гільдією авантюристів, а далі — інші райони Міста."
    },
    // Місто — окрема мапа (region "city"): герой ходить між районами (save.location.district)
    city: {
      name: "Місто",
      type: "city", region: "city",
      description: "Мури, дзвони й гамір вулиць. Місто ділиться на райони: у Південному стоїть Гільдія авантюристів, а в Центральному — Мерія з Дошкою оголошень (прохід туди відкриває Гільдія).",
      // Райони міста. locked: true — «Закрито — відкриється згодом»
      districts: [
        { id: "center", name: "Центральний район", building: "Мерія", locked: true,
          description: "Площа з фонтаном і кам'яна Мерія, де вирішуються справи міста." },
        { id: "trade", name: "Торговий район", building: "Торгова гільдія", locked: true,   // відкривається з 20 рівня (character.js → isDistrictOpen)
          description: "Крамниці, майстерні й склади. Торгова гільдія Скруджа продає найкраще залізо в місті — для поважних гостей." },
        { id: "south", name: "Південний район", building: "Гільдія авантюристів", locked: false,
          description: "Галасливий квартал найманців. У Гільдії авантюристів дають завдання, торгують зброєю й навчають бою." },
        { id: "north", name: "Північний район", building: "Центральна брама", locked: true,
          description: "Велика брама, крізь яку йдуть каравани та загони до далеких земель." },
        { id: "rest", name: "Спальний район", building: "Будинки для відпочинку", locked: true,
          description: "Тихі вулички з будинками, де можна винайняти кімнату й відпочити." }
      ]
    },
    forest_path: {
      name: "Лісова стежка",
      type: "combat",
      minLevel: 3,
      description: "Вузька стежка між темних ялин. Тут полюють вовки — сірі, чорні, а подекуди й білі. Новачкам сюди зарано.",
      enemies: ["wolf", "wolf2", "wolf3"]
    },
    forest_cave: {
      name: "Печера в лісі",
      type: "combat",
      minLevel: 6,
      description: "Волога темна печера, де стіни блищать від слизу. Тут живуть зелені, сині й фіолетові слайми, а в глибині, кажуть, сидить сам Король слайм.",
      enemies: ["slime", "slime2", "slime3", "slime_king"]
    },

    // ---------- ТЕМНИЙ ЛІС (region: "dark") — за Центральною брамою міста ----------
    // Пускають лише після квесту капітана варти «Варта Центральної брами» (quests.js → GATE).
    dark_gate: {
      name: "Зворотний бік брами",
      type: "gate", region: "dark",
      description: "Висока скеля, а в ній — зворотний бік Центральної брами Міста. Варта тримає її зачиненою, але для своїх відчиняє. Далі на північ — лише Темний ліс."
    },
    dk_edge: {
      name: "Похмуре узлісся", type: "combat", region: "dark", minLevel: 10,
      description: "Сухі сірі дерева, коріння, що чіпляється за ноги, і очі, які світяться в глибині. Тут Темний ліс тільки починається.",
      enemies: ["shadow_wolf", "rot_boar", "forest_spider"]
    },
    dk_marsh: {
      name: "Туманні болота", type: "combat", region: "dark", minLevel: 10,
      description: "Чорна вода, гнилі кладки й бліді вогники в тумані. Хто зійшов зі стежки — той лишився тут назавжди.",
      enemies: ["bog_leech", "drowner", "will_wisp"]
    },
    dk_grave: {
      name: "Старе кладовище", type: "combat", region: "dark", minLevel: 10,
      description: "Покинуті могили, розкриті склепи й зруйнована каплиця. Мертві тут не сплять.",
      enemies: ["skeleton_archer", "ghost", "ghoul"]
    },
    dk_webs: {
      name: "Павутинна гущавина", type: "combat", region: "dark", minLevel: 10,
      description: "Велетенські дерева, обплетені павутинням, і кокони на гілках. Десь у глибині — гніздо Королеви павуків.",
      enemies: ["web_hunter", "web_weaver", "spider_queen"]
    },
    dk_ravine: {
      name: "Вовкулачий яр", type: "combat", region: "dark", minLevel: 10,
      description: "Глибокий кам'янистий яр, обгризені кістки й сліди пазурів на скелях. Уночі тут виють не вовки.",
      enemies: ["werewolf", "pack_leader", "shadow_beast"]
    },
    dk_ruins: {
      name: "Руїни відьминої вежі", type: "combat", region: "dark", minLevel: 10,
      description: "Розвалена вежа на пагорбі, фіолетове сяйво й свічки на уламках. Культисти досі служать тут своїй господині.",
      enemies: ["cultist", "witch", "stone_golem"]
    },
    dk_heart: {
      name: "Серце Темного лісу", type: "combat", region: "dark", minLevel: 10,
      description: "Коло замшілих каменів і велетенське мертве дерево, що світиться зсередини. Тут править Володар Темного лісу.",
      enemies: ["ancient_treant", "black_rider", "forest_lord"]
    }
  };
  const DEFAULT_LOCATION = "home";

  // Торговець Гільдії авантюристів (місто): зброя 1–2 виду, малі й середні зілля
  const GUILD_SHOP = [
    "potion_hp_small", "potion_hp_medium", "potion_mp_small", "potion_mp_medium",
    "sword_t1", "dagger_t1", "axe_t1", "bow_t1", "staff_t1",
    "shield_t1", "quiver_t1", "orb_t1", "knife_t1",
    "sword_t2", "dagger_t2", "axe_t2", "bow_t2", "staff_t2",
    "shield_t2", "quiver_t2", "orb_t2", "knife_t2"
  ];
  const RESPAWN_LOCATION = "temple";

  // ---------- Чемпіони ----------
  // З шансом 5% замість звичайного ворога з'являється чемпіон (золота рамка, попередження):
  //   показники ×3 (здоров'я, мана, атака, магія, захист, маг. захист;
  //   відсоткові шанси і швидкість — як у звичайного),
  //   Гільдія авантюристів платить за нього нагороду ×5 (досвід і золото ворога),
  //   з нього випадає ОДНА річ: спершу перевірка легендарної (5%), якщо ні —
  //   епічної (25%), якщо ні — магічної (50%).
  const CHAMPION = {
    chance: 0.05,
    statMult: 3,
    bountyMult: 5,
    statKeys: ["hp", "mp", "attack", "magic", "defense", "magicDefense"],
    drops: [["legendary", 0.05], ["epic", 0.25], ["magic", 0.50]]
  };

  // enemyId — якщо ворог не може бути чемпіоном (noChampion, напр. Король слайм), завжди false
  function rollChampion(enemyId) {
    if (enemyId && ENEMIES[enemyId]?.noChampion) return false;
    return Math.random() < CHAMPION.chance;
  }

  // champion = true — повертає посилену копію ворога
  // Дальність атаки й прийом ворога
  function enemyRange(e) { return e?.range || 1; }
  function enemyMove(e) { return e?.move || MONSTER_MOVES[enemyRange(e)]; }

  function getEnemy(id, champion = false) {
    const base = ENEMIES[id];
    if (!base || !champion || base.noChampion) return base || null;
    const stats = { ...base.stats };
    for (const k of CHAMPION.statKeys) if (stats[k]) stats[k] = Math.round(stats[k] * CHAMPION.statMult);
    return { ...base, stats, champion: true, baseName: base.name, name: `Чемпіон: ${base.name}` };
  }

  // Трофей чемпіона: { id, r } або null. Річ береться зі здобичі цього ворога
  // (зброя/броня/біжутерія), а якщо такої немає — будь-яка річ 1 виду.
  function rollChampionDrop(enemyId) {
    let r = null;
    for (const [rarity, chance] of CHAMPION.drops) {
      if (Math.random() < chance) { r = rarity; break; }
    }
    if (!r) return null;
    let pool = (ENEMIES[enemyId]?.loot || []).map(d => d.id).filter(id => RPG.hasRarity(id));
    if (!pool.length) pool = Object.keys(RPG.ITEMS).filter(id => RPG.hasRarity(id) && RPG.ITEMS[id].tier === 1);
    return { id: pool[Math.floor(Math.random() * pool.length)], r };
  }

  // Нагорода гільдії за чемпіона: ×5 від досвіду та середнього золота ворога
  function championBounty(enemyId) {
    const e = ENEMIES[enemyId];
    if (!e) return { exp: 0, gold: 0 };
    return {
      exp: e.exp * CHAMPION.bountyMult,
      gold: Math.round((e.gold[0] + e.gold[1]) / 2 * CHAMPION.bountyMult)
    };
  }

  // Вороги з окремою картинкою assets/images/enemies/<id>.webp (додати ID, коли з'явиться файл)
  const ENEMY_FILES = new Set([
    "ancient_treant", "black_rider", "bog_leech", "cultist", "drowner", "forest_lord",
    "forest_spider", "ghost", "ghoul", "pack_leader", "rot_boar", "shadow_beast",
    "shadow_wolf", "skeleton_archer", "spider_queen", "stone_golem", "web_hunter", "web_weaver",
    "werewolf", "will_wisp", "witch"
  ]);
  // Заглушка, поки картинки немає: темний силует з очима
  const ENEMY_PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<defs><radialGradient id="g" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="#2b3a2e"/><stop offset="1" stop-color="#2b3a2e" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="50" cy="58" rx="42" ry="36" fill="url(#g)"/>' +
    '<path d="M22 86 C20 60 30 34 50 30 C70 34 80 60 78 86 Z" fill="#0d120e" opacity=".92"/>' +
    '<path d="M30 40 L24 22 L38 34 Z M70 40 L76 22 L62 34 Z" fill="#0d120e"/>' +
    '<ellipse cx="41" cy="48" rx="4" ry="2.4" fill="#d6ff7a"/><ellipse cx="59" cy="48" rx="4" ry="2.4" fill="#d6ff7a"/></svg>');

  // CSS-стиль кадру ворога (для квадратного елемента)
  function enemySpriteStyle(id) {
    const e = ENEMIES[id];
    if (e && e.sprite === undefined) {
      const url = ENEMY_FILES.has(id) ? RPG.asset(`assets/images/enemies/${id}.webp`) : ENEMY_PLACEHOLDER;
      return { backgroundImage: `url("${url}")`, backgroundSize: "contain", backgroundPosition: "center bottom", backgroundRepeat: "no-repeat" };
    }
    const sh = ENEMY_SHEET;
    return RPG.spriteStyle(RPG.asset(sh.file + sh.ext), sh.cols, sh.rows, sh.size, sh.gap, ENEMIES[id]?.sprite ?? 0);
  }

  function getLocation(id) {
    return LOCATIONS[id] || LOCATIONS[DEFAULT_LOCATION];
  }

  // Чи можна на локації битися
  function isCombatLocation(id) {
    const loc = getLocation(id);
    return loc.type === "combat" && !loc.locked && (loc.enemies || []).length > 0;
  }

  // Чи пускають героя на локацію: { ok, reason }. save — для Темного лісу (чи відчинена брама)
  function canEnterLocation(id, heroLevel = 1, save = null) {
    const loc = LOCATIONS[id];
    if (!loc) return { ok: false, reason: "Такої локації немає." };
    if (loc.locked) return { ok: false, reason: "Закрито — відкриється згодом." };
    if (loc.region === "dark" && save && !RPG.isGateOpen(save)) {
      return { ok: false, reason: "Центральна брама зачинена — спершу поговоріть з капітаном варти (Місто, Північний район)." };
    }
    if (loc.minLevel && heroLevel < loc.minLevel) {
      return { ok: false, reason: `${loc.name}: вхід з ${loc.minLevel} рівня персонажа.` };
    }
    return { ok: true };
  }

  // Випадковий ворог для локації.
  // Вороги близького до героя рівня трапляються частіше, а набагато
  // сильніші — рідко (але трапляються, тож обережно!).
  function enemyWeight(enemyLevel, heroLevel) {
    const diff = enemyLevel - heroLevel;
    if (diff >= 3) return 0.08;
    if (diff === 2) return 0.3;
    if (diff <= -3) return 0.3;
    return 1;
  }

  function pickEnemy(locationId, heroLevel = 1) {
    const list = getLocation(locationId).enemies || [];
    if (!list.length) return null;
    const weights = list.map(id => enemyWeight(ENEMIES[id].level, heroLevel) * (ENEMIES[id].spawnWeight ?? 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) {
      r -= weights[i];
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  // Випадкова здобич після перемоги: { gold, items: [{id, qty}] }
  function rollLoot(enemyId) {
    const enemy = ENEMIES[enemyId];
    if (!enemy) return { gold: 0, items: [] };
    const items = [];
    for (const drop of enemy.loot) {
      if (Math.random() < drop.chance) {
        items.push({ id: drop.id, qty: RPG.randInt(drop.qty[0], drop.qty[1]) });
      }
    }
    return { gold: RPG.randInt(enemy.gold[0], enemy.gold[1]), items };
  }

  Object.assign(RPG, {
    MONSTER_MOVES, RANGE_NAMES, enemyRange, enemyMove,
    ENEMIES, LOCATIONS, DEFAULT_LOCATION, RESPAWN_LOCATION, GUILD_SHOP,
    CHAMPION, rollChampion, rollChampionDrop, championBounty,
    getEnemy, enemySpriteStyle, getLocation, isCombatLocation, canEnterLocation, pickEnemy, rollLoot
  });
})(window.RPG);
