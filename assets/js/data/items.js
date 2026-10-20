// ============================================================
// ДОВІДНИК ПРЕДМЕТІВ
// Тут лише опис речей. У сейві зберігається тільки ID (ключ).
// ID (ключ об'єкта) НІКОЛИ не перейменовуй — інакше старі сейви
// не знайдуть предмет. Назву, картинку, характеристики міняй вільно.
//
// stats   — бонуси, коли річ вдягнена. Можна вказувати і бойові
//           характеристики (attack, defense...), і атрибути (str, agi...).
// price   — базова вартість. Торговець продає за 150%, купує за 50%.
// noShop  — торговець цю річ НЕ продає (лише здобич з ворогів).
// rarity  — "rare" підсвічується в інвентарі.
// maxStack — скільки штук в одній клітинці: зілля 100, ресурси 200.
// tier    — вид/клас речі: 1 — дерев'яна/лляна/мідна (з 1 рівня, біжутерія з 2),
//           2 — кам'яна/шкіряна/срібна (з 10 рівня), 3 — залізна/золота (з 20 рівня).
// weaponType — тип основної зброї: sword, dagger, axe, bow, staff (див. data/skills.js).
//           Зброя 2 виду потребує володіння 10, 3 виду — володіння 20.
// offType — річ для лівої руки: shield, quiver, orb, knife.
//           Що з чим можна тримати — див. OFFHAND_RULES нижче.
// icon    — іконка зі спрайт-листа: ["назва листа", номер клітинки].
//           Номер рахується зліва направо, згори вниз, починаючи з 0.
//           Немає icon — показується заглушка з назвою та кольором рідкості.
//           Рідкість (зламана…легендарна) малюється рамкою/світінням у CSS,
//           окремих картинок для рідкості не потрібно.
// effect  — для зілля: healHp / healMp (одиниці),
//           healHpPct / healMpPct (частка від максимуму: 0.5 = 50%).
// ============================================================

(function (RPG) {
// Папка зі спрайт-листами предметів (шлях рахує core.js від кореня гри)
const IMG_BASE = RPG.asset("assets/img/items/");

// ---------- СПРАЙТ-ЛИСТИ ПРЕДМЕТІВ ----------
// Кожна клітинка 128×128 px, між клітинками 2 px. cols/rows — сітка листа.
// Новий предмет: домалюй іконку в потрібний лист і вкажи її номер у полі icon.
const ICON_SIZE = 128;
const ICON_GAP = 2;
const ICON_EXT = ".webp";
const ICON_SHEETS = {
  weapon_mainHand: { cols: 6, rows: 3 },   // мечі, кинджали / сокири, луки / посохи
  weapon_offHand:  { cols: 4, rows: 3 },   // щити, колчани, сфери, малі кинджали
  armor:           { cols: 5, rows: 3 },   // рядки: льон, шкіра, залізо; стовпці: голова…взуття
  accessory:       { cols: 3, rows: 4 },   // рядки: кільця, амулети, сережки, комплект слизу; стовпці: мідь, срібло, золото
  material:        { cols: 3, rows: 2 },
  consumable:      { cols: 4, rows: 2 }
};

// CSS для показу однієї клітинки спрайт-листа в КВАДРАТНОМУ елементі будь-якого розміру
// (відсотки, тож працює і в слоті інвентаря, і в маленькій іконці).
function spriteStyle(url, cols, rows, size, gap, index) {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const w = cols * size + (cols - 1) * gap;
  const h = rows * size + (rows - 1) * gap;
  const px = w > size ? (col * (size + gap)) / (w - size) * 100 : 0;
  const py = h > size ? (row * (size + gap)) / (h - size) * 100 : 0;
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${(w / size) * 100}% ${(h / size) * 100}%`,
    backgroundPosition: `${px}% ${py}%`,
    backgroundRepeat: "no-repeat"
  };
}

// Слоти екіпірування
// Слоти екіпірування (12) — у такому порядку показуються в грі
const SLOTS = {
  mainHand: "Права рука (зброя)",
  offHand: "Ліва рука",
  head: "Голова",
  chest: "Тіло",
  legs: "Штани",
  hands: "Наручі",
  feet: "Взуття",
  earring1: "Сережка 1",
  ring1: "Кільце 1",
  amulet: "Амулет",
  ring2: "Кільце 2",
  earring2: "Сережка 2"
};
// Кільця й сережки можна носити по дві: slot предмета → слоти персонажа
const SLOT_GROUPS = {
  ring: ["ring1", "ring2"],
  earring: ["earring1", "earring2"]
};
function slotsFor(itemSlot) {
  return SLOT_GROUPS[itemSlot] || (itemSlot ? [itemSlot] : []);
}

// Назви характеристик для відображення в інтерфейсі
const STAT_NAMES = {
  hp: "Здоров'я",
  mp: "Мана",
  attack: "Атака",
  magic: "Сила магії",
  defense: "Захист",
  magicDefense: "Магічний захист",
  speed: "Швидкість",
  crit: "Шанс криту, %",
  blockPhys: "Блок фіз. шкоди, %",
  blockMag: "Блок маг. шкоди, %",
  attackSpeedPct: "Швидкість атаки (володіння), %",
  dodge: "Ухилення, %",
  hpRegen: "Відновлення HP за 10 с",
  mpRegen: "Відновлення MP за 10 с",
  str: "Сила",
  agi: "Спритність",
  int: "Інтелект",
  vit: "Витривалість",
  spi: "Дух"
};

// ---------- ПРАВА + ЛІВА РУКА ----------
// Що можна тримати в лівій руці залежно від зброї в правій.
// Ключ — weaponType зброї в правій руці (none — права рука вільна).
// Ліва рука завжди може бути вільною.
const OFFHAND_RULES = {
  sword:  ["shield", "knife"],
  axe:    ["shield", "knife"],
  dagger: ["orb", "knife"],
  bow:    ["quiver"],
  staff:  ["orb", "knife"],
  none:   ["shield", "quiver", "orb", "knife"]
};
const OFF_TYPE_NAMES = { shield: "щит", quiver: "колчан", orb: "сферу", knife: "малий кинджал" };
const MAIN_WITH_NAMES = {
  sword: "З мечем", axe: "Із сокирою", dagger: "З кинджалом",
  bow: "З луком", staff: "З посохом", none: "З вільною правою рукою"
};

// Чи можна тримати річ типу offType у лівій руці, коли в правій mainType
function offHandAllowed(mainType, offType) {
  const allowed = OFFHAND_RULES[mainType || "none"];
  return !allowed || allowed.includes(offType);   // невідомий тип зброї — без обмежень
}

// Пояснення для гравця, напр. "З луком у лівій руці можна тримати лише колчан."
function offHandRuleText(mainType) {
  const key = mainType || "none";
  const names = (OFFHAND_RULES[key] || []).map(t => OFF_TYPE_NAMES[t] || t);
  const list = names.length > 1 ? names.slice(0, -1).join(", ") + " або " + names[names.length - 1] : names[0];
  return `${MAIN_WITH_NAMES[key] || "З цією зброєю"} у лівій руці можна тримати лише ${list}.`;
}

// Необов'язкове поле classes: ["knight"] — предмет лише для цих професій.
// Без нього предмет підходить усім.

const ITEMS = {
  // ---------- ОСНОВНА ЗБРОЯ (права рука) ----------
  sword_t1: {
    name: "Дерев'яний меч", icon: ["weapon_mainHand", 0],
    type: "weapon", slot: "mainHand", tier: 1, levelReq: 1, price: 12, weaponType: "sword",
    stats: { attack: 5, crit: 1 },
    description: "Тренувальний меч зі звичайного дерева."
  },
  sword_t2: {
    name: "Кам'яний меч", icon: ["weapon_mainHand", 1],
    type: "weapon", slot: "mainHand", tier: 2, levelReq: 10, price: 180, weaponType: "sword",
    stats: { attack: 20, crit: 2 },
    description: "Важкий меч із тесаного каменю."
  },
  sword_t3: {
    name: "Залізний меч", icon: ["weapon_mainHand", 2],
    type: "weapon", slot: "mainHand", tier: 3, levelReq: 20, price: 900, weaponType: "sword", noShop: true,
    stats: { attack: 40, crit: 3 },
    description: "Надійний залізний клинок."
  },
  dagger_t1: {
    name: "Дерев'яний кинджал", icon: ["weapon_mainHand", 3],
    type: "weapon", slot: "mainHand", tier: 1, levelReq: 1, price: 12, weaponType: "dagger",
    stats: { attack: 4, crit: 3, speed: 1 },
    description: "Легкий дерев'яний кинджал."
  },
  dagger_t2: {
    name: "Кам'яний кинджал", icon: ["weapon_mainHand", 4],
    type: "weapon", slot: "mainHand", tier: 2, levelReq: 10, price: 170, weaponType: "dagger",
    stats: { attack: 15, crit: 5, speed: 2 },
    description: "Гострий кремінний кинджал."
  },
  dagger_t3: {
    name: "Залізний кинджал", icon: ["weapon_mainHand", 5],
    type: "weapon", slot: "mainHand", tier: 3, levelReq: 20, price: 850, weaponType: "dagger", noShop: true,
    stats: { attack: 30, crit: 8, speed: 3 },
    description: "Залізний кинджал — швидкий і підступний."
  },
  axe_t1: {
    name: "Дерев'яна сокира", icon: ["weapon_mainHand", 6],
    type: "weapon", slot: "mainHand", tier: 1, levelReq: 1, price: 14, weaponType: "axe",
    stats: { attack: 7, str: 1, speed: -1 },
    description: "Груба дерев'яна сокира — б'є сильно, але повільно."
  },
  axe_t2: {
    name: "Кам'яна сокира", icon: ["weapon_mainHand", 7],
    type: "weapon", slot: "mainHand", tier: 2, levelReq: 10, price: 190, weaponType: "axe",
    stats: { attack: 26, str: 2, speed: -1 },
    description: "Кам'яна сокира з важким обухом."
  },
  axe_t3: {
    name: "Залізна сокира", icon: ["weapon_mainHand", 8],
    type: "weapon", slot: "mainHand", tier: 3, levelReq: 20, price: 950, weaponType: "axe", noShop: true,
    stats: { attack: 50, str: 3, speed: -2 },
    description: "Залізна сокира лісоруба-воїна."
  },
  bow_t1: {
    name: "Дерев'яний лук", icon: ["weapon_mainHand", 9],
    type: "weapon", slot: "mainHand", tier: 1, levelReq: 1, price: 14, weaponType: "bow",
    stats: { attack: 5, crit: 2, speed: 1 },
    description: "Простий дерев'яний лук."
  },
  bow_t2: {
    name: "Кам'яний лук", icon: ["weapon_mainHand", 10],
    type: "weapon", slot: "mainHand", tier: 2, levelReq: 10, price: 190, weaponType: "bow",
    stats: { attack: 19, crit: 3, speed: 2 },
    description: "Лук із кам'яними вістрями стріл."
  },
  bow_t3: {
    name: "Залізний лук", icon: ["weapon_mainHand", 11],
    type: "weapon", slot: "mainHand", tier: 3, levelReq: 20, price: 950, weaponType: "bow", noShop: true,
    stats: { attack: 38, crit: 4, speed: 3 },
    description: "Лук, окутий залізом."
  },
  staff_t1: {
    name: "Дерев'яний посох", icon: ["weapon_mainHand", 12],
    type: "weapon", slot: "mainHand", tier: 1, levelReq: 1, price: 14, weaponType: "staff",
    stats: { attack: 1, magic: 6, mp: 10, int: 1 },
    description: "Дерев'яний посох учня. Кидає «Іскру»."
  },
  staff_t2: {
    name: "Кам'яний посох", icon: ["weapon_mainHand", 13],
    type: "weapon", slot: "mainHand", tier: 2, levelReq: 10, price: 190, weaponType: "staff",
    stats: { attack: 3, magic: 22, mp: 30, int: 2 },
    description: "Кам'яний посох з рунами."
  },
  staff_t3: {
    name: "Залізний посох", icon: ["weapon_mainHand", 14],
    type: "weapon", slot: "mainHand", tier: 3, levelReq: 20, price: 950, weaponType: "staff", noShop: true,
    stats: { attack: 6, magic: 44, mp: 60, int: 3 },
    description: "Залізний посох бойового мага."
  },

  // ---------- ДРУГА РУКА ----------
  shield_t1: {
    name: "Дерев'яний щит", icon: ["weapon_offHand", 0],
    type: "shield", slot: "offHand", tier: 1, levelReq: 1, price: 12, offType: "shield",
    stats: { defense: 3, blockPhys: 8 },
    description: "Легкий щит із дощок."
  },
  shield_t2: {
    name: "Шкіряний щит", icon: ["weapon_offHand", 1],
    type: "shield", slot: "offHand", tier: 2, levelReq: 10, price: 160, offType: "shield",
    stats: { defense: 12, blockPhys: 12 },
    description: "Щит, обтягнутий товстою шкірою."
  },
  shield_t3: {
    name: "Залізний щит", icon: ["weapon_offHand", 2],
    type: "shield", slot: "offHand", tier: 3, levelReq: 20, price: 800, offType: "shield", noShop: true,
    stats: { defense: 24, blockPhys: 16 },
    description: "Важкий залізний щит."
  },
  quiver_t1: {
    name: "Полотняний колчан", icon: ["weapon_offHand", 3],
    type: "offhand", slot: "offHand", tier: 1, levelReq: 1, price: 10, offType: "quiver",
    stats: { attack: 2, speed: 1 },
    description: "Колчан для стріл. Тримають з луком або з вільною правою рукою."
  },
  quiver_t2: {
    name: "Шкіряний колчан", icon: ["weapon_offHand", 4],
    type: "offhand", slot: "offHand", tier: 2, levelReq: 10, price: 150, offType: "quiver",
    stats: { attack: 7, speed: 2 },
    description: "Шкіряний колчан — стріли під рукою. З луком або з вільною правою рукою."
  },
  quiver_t3: {
    name: "Окутий колчан", icon: ["weapon_offHand", 5],
    type: "offhand", slot: "offHand", tier: 3, levelReq: 20, price: 750, offType: "quiver", noShop: true,
    stats: { attack: 14, speed: 3 },
    description: "Окутий колчан для бойових стріл. З луком або з вільною правою рукою."
  },
  orb_t1: {
    name: "Скляна сфера", icon: ["weapon_offHand", 6],
    type: "offhand", slot: "offHand", tier: 1, levelReq: 1, price: 12, offType: "orb",
    stats: { magic: 3, mp: 10, mpRegen: 0.5 },
    description: "Скляна куля, що тихо світиться."
  },
  orb_t2: {
    name: "Лазурна сфера", icon: ["weapon_offHand", 7],
    type: "offhand", slot: "offHand", tier: 2, levelReq: 10, price: 160, offType: "orb",
    stats: { magic: 11, mp: 30, mpRegen: 1 },
    description: "Лазурна сфера з магічними рунами."
  },
  orb_t3: {
    name: "Оніксова сфера", icon: ["weapon_offHand", 8],
    type: "offhand", slot: "offHand", tier: 3, levelReq: 20, price: 800, offType: "orb", noShop: true,
    stats: { magic: 22, mp: 60, mpRegen: 2 },
    description: "Оніксова сфера в залізній оправі."
  },
  knife_t1: {
    name: "Дерев'яний малий кинджал", icon: ["weapon_offHand", 9],
    type: "offhand", slot: "offHand", tier: 1, levelReq: 1, price: 10, offType: "knife",
    stats: { attack: 2, crit: 2 },
    description: "Короткий клинок для лівої руки."
  },
  knife_t2: {
    name: "Кам'яний малий кинджал", icon: ["weapon_offHand", 10],
    type: "offhand", slot: "offHand", tier: 2, levelReq: 10, price: 150, offType: "knife",
    stats: { attack: 8, crit: 3 },
    description: "Кремінний ніж для лівої руки."
  },
  knife_t3: {
    name: "Залізний малий кинджал", icon: ["weapon_offHand", 11],
    type: "offhand", slot: "offHand", tier: 3, levelReq: 20, price: 750, offType: "knife", noShop: true,
    stats: { attack: 16, crit: 5 },
    description: "Залізний малий кинджал для лівої руки."
  },

  // ---------- БРОНЯ ----------
  linen_head: {
    name: "Лляна шапка", icon: ["armor", 0],
    type: "armor", slot: "head", tier: 1, levelReq: 1, price: 6, set: "linen",
    stats: { defense: 1, hp: 5 },
    description: "Частина лляного комплекту."
  },
  linen_chest: {
    name: "Лляна сорочка", icon: ["armor", 1],
    type: "armor", slot: "chest", tier: 1, levelReq: 1, price: 10, set: "linen",
    stats: { defense: 2, hp: 10 },
    description: "Частина лляного комплекту."
  },
  linen_legs: {
    name: "Лляні штани", icon: ["armor", 2],
    type: "armor", slot: "legs", tier: 1, levelReq: 1, price: 8, set: "linen",
    stats: { defense: 1, hp: 5 },
    description: "Частина лляного комплекту."
  },
  linen_hands: {
    name: "Лляні наручі", icon: ["armor", 3],
    type: "armor", slot: "hands", tier: 1, levelReq: 1, price: 6, set: "linen",
    stats: { defense: 1, attack: 1 },
    description: "Частина лляного комплекту."
  },
  linen_feet: {
    name: "Лляні черевики", icon: ["armor", 4],
    type: "armor", slot: "feet", tier: 1, levelReq: 1, price: 8, set: "linen",
    stats: { defense: 1, speed: 1 },
    description: "Частина лляного комплекту."
  },
  leather_head: {
    name: "Шкіряна шапка", icon: ["armor", 5],
    type: "armor", slot: "head", tier: 2, levelReq: 10, price: 90, set: "leather", noShop: true,
    stats: { defense: 5, hp: 20 },
    description: "Частина шкіряного комплекту."
  },
  leather_chest: {
    name: "Шкіряна куртка", icon: ["armor", 6],
    type: "armor", slot: "chest", tier: 2, levelReq: 10, price: 150, set: "leather", noShop: true,
    stats: { defense: 9, hp: 35 },
    description: "Частина шкіряного комплекту."
  },
  leather_legs: {
    name: "Шкіряні штани", icon: ["armor", 7],
    type: "armor", slot: "legs", tier: 2, levelReq: 10, price: 110, set: "leather", noShop: true,
    stats: { defense: 6, hp: 25 },
    description: "Частина шкіряного комплекту."
  },
  leather_hands: {
    name: "Шкіряні наручі", icon: ["armor", 8],
    type: "armor", slot: "hands", tier: 2, levelReq: 10, price: 90, set: "leather", noShop: true,
    stats: { defense: 4, attack: 3 },
    description: "Частина шкіряного комплекту."
  },
  leather_feet: {
    name: "Шкіряні чоботи", icon: ["armor", 9],
    type: "armor", slot: "feet", tier: 2, levelReq: 10, price: 100, set: "leather", noShop: true,
    stats: { defense: 4, speed: 2 },
    description: "Частина шкіряного комплекту."
  },
  iron_head: {
    name: "Залізний шолом", icon: ["armor", 10],
    type: "armor", slot: "head", tier: 3, levelReq: 20, price: 450, set: "iron", noShop: true,
    stats: { defense: 10, hp: 40 },
    description: "Частина залізного комплекту."
  },
  iron_chest: {
    name: "Залізна кіраса", icon: ["armor", 11],
    type: "armor", slot: "chest", tier: 3, levelReq: 20, price: 750, set: "iron", noShop: true,
    stats: { defense: 18, hp: 70 },
    description: "Частина залізного комплекту."
  },
  iron_legs: {
    name: "Залізні поножі", icon: ["armor", 12],
    type: "armor", slot: "legs", tier: 3, levelReq: 20, price: 550, set: "iron", noShop: true,
    stats: { defense: 12, hp: 50 },
    description: "Частина залізного комплекту."
  },
  iron_hands: {
    name: "Залізні наручі", icon: ["armor", 13],
    type: "armor", slot: "hands", tier: 3, levelReq: 20, price: 450, set: "iron", noShop: true,
    stats: { defense: 8, attack: 6 },
    description: "Частина залізного комплекту."
  },
  iron_feet: {
    name: "Залізні чоботи", icon: ["armor", 14],
    type: "armor", slot: "feet", tier: 3, levelReq: 20, price: 500, set: "iron", noShop: true,
    stats: { defense: 8, speed: 3 },
    description: "Частина залізного комплекту."
  },

  // ---------- БІЖУТЕРІЯ ----------
  ring_t1: {
    name: "Мідне кільце", icon: ["accessory", 0],
    type: "accessory", slot: "ring", tier: 1, levelReq: 2, price: 30, noShop: true,
    stats: { crit: 2 },
    description: "Кільце з невеликим бонусом. Можна носити два кільця."
  },
  ring_t2: {
    name: "Срібне кільце", icon: ["accessory", 1],
    type: "accessory", slot: "ring", tier: 2, levelReq: 10, price: 250, noShop: true,
    stats: { crit: 3, str: 2 },
    description: "Кільце з невеликим бонусом. Можна носити два кільця."
  },
  ring_t3: {
    name: "Золоте кільце", icon: ["accessory", 2],
    type: "accessory", slot: "ring", tier: 3, levelReq: 20, price: 1200, noShop: true,
    stats: { crit: 5, str: 4 },
    description: "Кільце з невеликим бонусом. Можна носити два кільця."
  },
  amulet_t1: {
    name: "Мідний амулет", icon: ["accessory", 3],
    type: "accessory", slot: "amulet", tier: 1, levelReq: 2, price: 30, noShop: true,
    stats: { hp: 15, spi: 1 },
    description: "Амулет на шиї."
  },
  amulet_t2: {
    name: "Срібний амулет", icon: ["accessory", 4],
    type: "accessory", slot: "amulet", tier: 2, levelReq: 10, price: 250, noShop: true,
    stats: { hp: 50, spi: 3 },
    description: "Амулет на шиї."
  },
  amulet_t3: {
    name: "Золотий амулет", icon: ["accessory", 5],
    type: "accessory", slot: "amulet", tier: 3, levelReq: 20, price: 1200, noShop: true,
    stats: { hp: 100, spi: 5 },
    description: "Амулет на шиї."
  },
  earring_t1: {
    name: "Мідна сережка", icon: ["accessory", 6],
    type: "accessory", slot: "earring", tier: 1, levelReq: 2, price: 30, noShop: true,
    stats: { mp: 10, dodge: 1 },
    description: "Сережка з невеликим бонусом. Можна носити дві сережки."
  },
  earring_t2: {
    name: "Срібна сережка", icon: ["accessory", 7],
    type: "accessory", slot: "earring", tier: 2, levelReq: 10, price: 250, noShop: true,
    stats: { mp: 30, dodge: 2 },
    description: "Сережка з невеликим бонусом. Можна носити дві сережки."
  },
  earring_t3: {
    name: "Золота сережка", icon: ["accessory", 8],
    type: "accessory", slot: "earring", tier: 3, levelReq: 20, price: 1200, noShop: true,
    stats: { mp: 60, dodge: 4 },
    description: "Сережка з невеликим бонусом. Можна носити дві сережки."
  },

  // ---------- КОМПЛЕКТ СЛИЗУ (здобич зі слаймів, див. ITEM_SETS) ----------
  slime_ring: {
    name: "Слизове кільце", icon: ["accessory", 9],
    type: "accessory", slot: "ring", tier: 1, levelReq: 6, price: 140, noShop: true, set: "slime",
    stats: { mp: 15, magic: 2, crit: 1 },
    description: "Холодне й трохи липке. Частина комплекту слизу."
  },
  slime_amulet: {
    name: "Слизовий амулет", icon: ["accessory", 10],
    type: "accessory", slot: "amulet", tier: 1, levelReq: 6, price: 160, noShop: true, set: "slime",
    stats: { hp: 25, mp: 25, spi: 2 },
    description: "Усередині повільно переливається желе. Частина комплекту слизу."
  },
  slime_earring: {
    name: "Слизова сережка", icon: ["accessory", 11],
    type: "accessory", slot: "earring", tier: 1, levelReq: 6, price: 140, noShop: true, set: "slime",
    stats: { mp: 20, magicDefense: 2, dodge: 1 },
    description: "Крапля застиглого слизу. Частина комплекту слизу."
  },

  // ---------- ЗІЛЛЯ ----------
  // Малі та середні продає шинкар; великі та чарівне — лише з ворогів.
  potion_hp_small: {
    name: "Мале зілля здоров'я", icon: ["consumable", 0],
    type: "consumable", price: 5, stackable: true, maxStack: 100,
    effect: { healHp: 30 },
    description: "Відновлює 30 здоров'я."
  },
  potion_hp_medium: {
    name: "Середнє зілля здоров'я", icon: ["consumable", 1],
    type: "consumable", price: 15, stackable: true, maxStack: 100,
    effect: { healHp: 80 },
    description: "Відновлює 80 здоров'я."
  },
  potion_hp_large: {
    name: "Велике зілля здоров'я", icon: ["consumable", 2],
    type: "consumable", price: 45, stackable: true, maxStack: 100, noShop: true,
    effect: { healHp: 200 },
    description: "Відновлює 200 здоров'я. Торговці таким не торгують."
  },
  potion_mp_small: {
    name: "Мале зілля мани", icon: ["consumable", 3],
    type: "consumable", price: 6, stackable: true, maxStack: 100,
    effect: { healMp: 20 },
    description: "Відновлює 20 мани."
  },
  potion_mp_medium: {
    name: "Середнє зілля мани", icon: ["consumable", 4],
    type: "consumable", price: 18, stackable: true, maxStack: 100,
    effect: { healMp: 50 },
    description: "Відновлює 50 мани."
  },
  potion_mp_large: {
    name: "Велике зілля мани", icon: ["consumable", 5],
    type: "consumable", price: 50, stackable: true, maxStack: 100, noShop: true,
    effect: { healMp: 120 },
    description: "Відновлює 120 мани. Торговці таким не торгують."
  },
  potion_magic: {
    name: "Чарівне зілля", icon: ["consumable", 6],
    type: "consumable", price: 150, stackable: true, maxStack: 100, noShop: true, rarity: "rare",
    effect: { healHpPct: 0.5, healMpPct: 0.3 },
    description: "Дуже рідкісне. Відновлює 50% здоров'я та 30% мани."
  },

  // ---------- МАТЕРІАЛИ (здобич з ворогів) ----------
  rat_tail: {
    name: "Щурячий хвіст", icon: ["material", 0],
    type: "material", price: 2, stackable: true, maxStack: 200,
    description: "Трофей з льоху. Торговці купують за мідяк."
  },
  rat_skin: {
    name: "Щуряча шкурка", icon: ["material", 1],
    type: "material", price: 3, stackable: true, maxStack: 200,
    description: "Дрібна, але шкірник візьме."
  },
  wolf_pelt: {
    name: "Вовча шкура", icon: ["material", 2],
    type: "material", price: 6, stackable: true, maxStack: 200,
    description: "Можна продати торговцю."
  },
  wolf_fang: {
    name: "Вовче ікло", icon: ["material", 3],
    type: "material", price: 5, stackable: true, maxStack: 200,
    description: "Гостре. Згодиться на амулет."
  },
  white_pelt: {
    name: "Біла вовча шкура", icon: ["material", 4],
    type: "material", price: 12, stackable: true, maxStack: 200,
    description: "Рідкісне хутро, за нього добре платять."
  },
  slime_gel: {
    name: "Слиз", icon: ["material", 5],
    type: "material", price: 2, stackable: true, maxStack: 200,
    description: "Липкий і трохи світиться."
  }
};

// ---------- КОМПЛЕКТИ (бонус за кілька вдягнених речей одного set) ----------
// pieces — скільки речей комплекту треба вдягнути (кільця/сережки рахуються кожна);
// bonusPct — відсоткові бонуси поверх уже підрахованих характеристик
//            (mpRegen: 50 — відновлення мани ×1,5).
const ITEM_SETS = {
  slime: {
    name: "Комплект слизу",
    pieces: 3,
    bonusPct: { mpRegen: 50 },
    text: "+50% до відновлення мани"
  }
};

// Скільки речей кожного комплекту вдягнено: { slime: 2, ... }
function equippedSetCounts(save) {
  const counts = {};
  for (const slot in save.equipment || {}) {
    const ref = save.equipment[slot];
    const id = ref && (typeof ref === "string" ? ref : ref.id);
    const set = ITEMS[id]?.set;
    if (set) counts[set] = (counts[set] || 0) + 1;
  }
  return counts;
}

// ---------- Допоміжні функції ----------

// Повертає опис предмета або null, якщо такого ID немає
function getItem(id) {
  return ITEMS[id] || null;
}

// Стиль іконки предмета зі спрайт-листа; null — іконки немає (буде заглушка)
function itemIconStyle(id) {
  const icon = ITEMS[id]?.icon;
  const sheet = icon && ICON_SHEETS[icon[0]];
  if (!sheet) return null;
  return spriteStyle(IMG_BASE + icon[0] + ICON_EXT, sheet.cols, sheet.rows, ICON_SIZE, ICON_GAP, icon[1]);
}

// Старі ID предметів (до нового списку) → нові. Застосовується при завантаженні сейву.
const ITEM_RENAMES = {
  sword_wood: "sword_t1", sword_iron: "sword_t1", sword_steel: "sword_t1",
  dagger_rusty: "dagger_t1", club_spiked: "axe_t1",
  staff_oak: "staff_t1", staff_moon: "staff_t1",
  shield_wood: "shield_t1", shield_iron: "shield_t1",
  cap_leather: "linen_head", hood_wolf: "linen_head",
  shirt_linen: "linen_chest", armor_leather: "linen_chest", armor_wolf: "linen_chest",
  pants_linen: "linen_legs", pants_leather: "linen_legs",
  boots_simple: "linen_feet", boots_leather: "linen_feet",
  ring_copper: "ring_t1", ring_silver: "ring_t1", amulet_fang: "amulet_t1"
};

// Чи можна вдягнути предмет
function isEquippable(id) {
  return !!ITEMS[id]?.slot;
}

// Ціни торговця: продає за 150%, купує за 50% (мінімум 1 золотий)
const SHOP_SELL_RATE = 1.5;
const SHOP_BUY_RATE = 0.5;
function shopSellPrice(id) { return Math.ceil((ITEMS[id]?.price || 0) * SHOP_SELL_RATE); }
function shopBuyPrice(id)  { return Math.max(1, Math.floor((ITEMS[id]?.price || 0) * SHOP_BUY_RATE)); }

Object.assign(RPG, {
  SLOTS, SLOT_GROUPS, slotsFor, ITEM_RENAMES, STAT_NAMES, ITEMS, getItem, itemIconStyle, spriteStyle, ICON_SHEETS, isEquippable,
  OFFHAND_RULES, offHandAllowed, offHandRuleText, ITEM_SETS, equippedSetCounts,
  SHOP_SELL_RATE, SHOP_BUY_RATE, shopSellPrice, shopBuyPrice
});
})(window.RPG);
