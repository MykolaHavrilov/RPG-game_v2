// ============================================================
// ЛОГІКА ПЕРСОНАЖА: створення, характеристики, досвід,
// зміна професії, інвентар, скриня, екіпірування, розхідники,
// відновлення HP/MP, загибель, Храм, торгівля.
// Усі функції змінюють об'єкт save. Після змін викликай saveGame(save).
// ============================================================

(function (RPG) {
const { ITEMS, CLASSES, getClass, DEFAULT_CLASS, availableClassChanges,
        expForLevel, maxLevel, maxExp, levelFromExp, newSlotId, SAVE_VERSION } = RPG;

// ---------- Налаштування механік ----------
const REGEN_TICK_MS = 10000;      // відновлення кожні 10 секунд
const HOME_REGEN_PCT = 0.05;      // у Домівці додатково +5% HP і MP за 10 с
const RESPAWN_HP_PCT = 0.10;      // після відродження — 10% здоров'я
const RESPAWN_MP_PCT = 0;         // і 0% мани
const DEATH_EXP_MULT = 10;        // штраф: досвід за переможця(ів) × 10 …
const DEATH_MAX_PCT = 25;         // … але не більше 25% смужки досвіду рівня
const ITEM_LOSS_CHANCE = 0.005;   // 0,5% на кожну вдягнену річ
const QUEUE_SIZE = 6;             // скільки дій у черзі бою
const BUY_MAX = 1000;             // найбільше штук за одну покупку

// «Молитва благодаті» (Храм): +2% макс. HP кожні 5 с і +3% макс. MP кожні 10 с,
// діє 10 хвилин реального часу (і поки гра закрита теж).
const GRACE = { durationMs: 10 * 60 * 1000, hpPct: 0.02, hpEveryMs: 5000, mpPct: 0.03, mpEveryMs: 10000 };
// Ціна: сам — 100; група з n героїв (2–6) — 100 + (100 + 10 × n)
function graceCost(n) {
  return n <= 1 ? 100 : 100 + (100 + 10 * n);
}
// Перерозподіл атрибутів у Мерії: n × 500 + 500 × pct%,
// де n — порядковий номер цього скидання (1, 2, 3…), pct — накопичена надбавка:
// після кожного скидання вона зростає на випадкові 10–30%.
const RESET_BASE = 500;
const RESET_STEP_PCT = [10, 30];
function attrResetCost(n, pct) {
  return Math.round(n * RESET_BASE + RESET_BASE * (pct || 0) / 100);
}

// Скільки речей максимум можна втратити за одну смерть
function maxItemLoss(level) {
  if (level <= 10) return 1;
  if (level <= 20) return 2;
  if (level < 30) return 3;          // 21–29 — на майбутнє
  return RPG.randInt(3, 4);          // 30+ — від 3 до 4
}

// ---------- Стать героя (поки впливає лише на текст розмов і літопису) ----------
// save.character.gender = "m" | "f". Старі сейви без поля: жіноче ім'я зі списку найму → "f", інакше "m".
const FEMALE_NAMES = new Set(["Олена", "Мирослава", "Дарина", "Соломія", "Ярина", "Оксана", "Христина", "Леся", "Устина", "Злата"]);
function heroGender(ms) {
  const c = ms?.character || {};
  if (c.gender === "m" || c.gender === "f") return c.gender;
  return FEMALE_NAMES.has(String(c.name || "").trim()) ? "f" : "m";
}
// Слово за статтю: gw(save, "готовий", "готова")
function gw(ms, m, f) { return heroGender(ms) === "f" ? f : m; }

// ---------- Створення нового персонажа ----------

function createNewSave(name, classId = DEFAULT_CLASS, gender = null) {
  const cls = getClass(classId);
  name = String(name || "");
  const save = {
    id: newSlotId(),
    saveVersion: SAVE_VERSION,
    createdAt: Date.now(),
    savedAt: Date.now(),
    character: {
      name: name.trim() || "Герой",
      gender: gender === "f" ? "f" : gender === "m" ? "m" : (FEMALE_NAMES.has(name.trim()) ? "f" : "m"),
      classId,              // поточна професія
      level: 1,             // рівень у поточній професії
      exp: 0,               // досвід у поточній професії (накопичується)
      totalExp: 0,          // весь зароблений досвід за гру (ніколи не зменшується)
      classHistory: [],     // попередні професії: [{ classId, level, exp }]
      attrs: { ...cls.baseAttrs },
      freePoints: 0,        // вільні очки атрибутів
      gold: cls.startGold,
      kills: 0,             // скільки ворогів переможено
      deaths: 0,
      hp: 0,   // заповнимо нижче, після підрахунку характеристик
      mp: 0,
      regenAt: Date.now(),  // коли востаннє рахували відновлення
      mastery: {},          // володіння зброєю: { sword: 0..20, ... } (data/skills.js)
      skills: {}            // активні навички: { skillId: 1..10 }
    },
    equipment: {},
    inventory: [],
    lootLuck: RPG.newLuck(),   // прихований лічильник рідкісних речей (rarity.js)
    chests: { main: [] },   // сховища скринь: { storageId: [{ id, qty }] } — речі не зникають при смерті
    battleQueue: ["attack"],   // черга дій у бою (до QUEUE_SIZE)
    location: { map: cls.startLocation, page: "game" },
    settings: { battleView: "stepByStep" }   // або "result"
  };

  for (const it of cls.startItems) {
    const item = ITEMS[it.id];
    if (!item) continue;
    if (it.equip && item.slot) save.equipment[equipSlotFor(save, it.id)] = RPG.makeItem(it.id, "common", { fromShop: true });
    else addItem(save, it.id, it.qty || 1);
  }

  fullHeal(save);
  return save;
}

// ---------- Характеристики ----------
// Максимальні значення НЕ зберігаються — завжди рахуються:
// база професії + приріст за рівні + атрибути + екіпірування

const STAT_KEYS = ["hp", "mp", "attack", "magic", "defense", "magicDefense", "speed",
                   "crit", "dodge", "blockPhys", "blockMag", "hpRegen", "mpRegen", "attackSpeedPct"];
const DECIMAL_KEYS = ["crit", "dodge", "blockPhys", "blockMag", "hpRegen", "mpRegen", "attackSpeedPct"];

// trace — необов'язковий об'єкт: якщо передати {}, у нього запишеться, з чого склалась
// кожна характеристика: trace[key] = [{ label, value }] (сторінка «Персонаж» → підказки «i»).
// Сума value дорівнює результату до округлення; округлення — окремим рядком.
function calcStats(save, trace = null) {
  const cls = getClass(save.character.classId);
  const lvl = save.character.level;
  const stats = {};
  for (const key of STAT_KEYS) stats[key] = 0;
  // Записати частку: delta — на скільки змінилось значення
  const note = (key, label, delta) => {
    if (!trace || !delta || Math.abs(delta) < 1e-9) return;
    (trace[key] ??= []).push({ label, value: delta });
  };
  // Змінити значення через функцію і записати різницю
  const change = (key, label, fn) => {
    const before = stats[key] || 0;
    stats[key] = fn(before);
    note(key, label, stats[key] - before);
  };

  for (const key in cls.baseStats) {
    const grow = (cls.growth[key] || 0) * (lvl - 1);
    stats[key] += cls.baseStats[key] + grow;
    note(key, `Професія «${cls.name}»`, cls.baseStats[key]);
    note(key, "Рівень", grow);
  }

  // Атрибути (власні + з речей)
  const attrs = RPG.totalAttrs(save);
  addStats(stats, RPG.attrBonuses(attrs));
  if (trace && RPG.attrContrib) {
    for (const [key, parts] of Object.entries(RPG.attrContrib(attrs))) {
      for (const pt of parts) note(key, pt.label, pt.value);
    }
  }

  // Бойові бонуси речей (атрибути з речей уже враховані вище).
  // Крит / ухилення / швидкість з ЛЕГЕНДАРНИХ речей відкладаємо окремо:
  // спершу все інше впирається в ліміт, а легендарні додаються зверху.
  const legendOver = {};
  for (const slot in save.equipment) {
    const ref = save.equipment[slot];
    const st = RPG.itemStats(ref);
    const legendary = RPG.rarityOf(ref) === "legendary";
    const offWeapon = slot === "offHand" && ITEMS[RPG.refId(ref)]?.weaponType;
    const name = trace ? RPG.itemFullName(ref) : "";
    for (const key in st) {
      if (key in RPG.ATTRS) continue;
      if (offWeapon && key === "attack") continue;   // атака другої сокири — окремим ударом (dualWield)
      if (legendary && RPG.LEGEND_OVERCAP.includes(key)) legendOver[key] = (legendOver[key] || 0) + st[key];
      else { stats[key] = (stats[key] || 0) + st[key]; note(key, `Річ: ${name}`, st[key]); }
    }
  }

  // Володіння вдягненою зброєю (data/skills.js)
  const mastery = RPG.masteryBonus ? RPG.masteryBonus(save) : {};
  for (const key in mastery) {
    if (key !== "attackSpeedPct") { stats[key] = (stats[key] || 0) + mastery[key]; note(key, "Володіння вдягненою зброєю (Тренер)", mastery[key]); }
  }

  // Пасивні навички (data/skills.js → kind "passive"): % до характеристик, крит/ухилення — у пунктах
  const pas = RPG.passiveBonus ? RPG.passiveBonus(save) : {};
  const PCT = { hpPct: "hp", mpPct: "mp", attackPct: "attack", magicPct: "magic",
                defensePct: "defense", magicDefensePct: "magicDefense", speedPct: "speed" };
  for (const [k, stat] of Object.entries(PCT)) if (pas[k]) change(stat, "Пасивні навички", v => v * (1 + pas[k] / 100));
  if (pas.crit) change("crit", "Пасивні навички", v => v + pas.crit);
  if (pas.dodge) change("dodge", "Пасивні навички", v => v + pas.dodge);

  const CAP = RPG.STAT_CAP;
  change("crit", "Обмеження максимуму", v => Math.min(v, CAP.crit));
  change("dodge", "Обмеження максимуму", v => Math.min(v, CAP.dodge));
  change("speed", "Обмеження максимуму", v => Math.min(v, CAP.speed));
  change("blockPhys", "Обмеження максимуму", v => Math.min(v, CAP.block));
  change("blockMag", "Обмеження максимуму", v => Math.min(v, CAP.block));
  for (const key in legendOver) change(key, "Легендарні речі (понад межу)", v => v + legendOver[key]);   // легендарні — понад ліміт

  // Швидкість атаки з володіння (напр. лук до +25%) — теж понад ліміт,
  // але не більше 200% ліміту: це другий, крайній ліміт швидкості
  stats.attackSpeedPct = mastery.attackSpeedPct || 0;
  note("attackSpeedPct", "Володіння вдягненою зброєю (Тренер)", stats.attackSpeedPct);
  if (stats.attackSpeedPct) change("speed", "Швидкість атаки (володіння зброєю)", v => v * (1 + stats.attackSpeedPct / 100));
  change("speed", "Обмеження максимуму", v => Math.min(v, CAP.speed * 2));

  // Бонуси комплектів (data/items.js → ITEM_SETS), поверх усього іншого
  const setCounts = RPG.equippedSetCounts ? RPG.equippedSetCounts(save) : {};
  for (const [setId, n] of Object.entries(setCounts)) {
    const set = RPG.ITEM_SETS[setId];
    if (!set || n < set.pieces) continue;
    for (const [key, pct] of Object.entries(set.bonusPct || {})) change(key, set.name, v => (v || 0) * (1 + pct / 100));
  }

  for (const key in stats) {
    const raw = stats[key];
    stats[key] = DECIMAL_KEYS.includes(key)
      ? Math.round(stats[key] * 10) / 10
      : Math.floor(stats[key]);
    note(key, "Округлення", stats[key] - raw);
  }
  return stats;
}

function addStats(target, source) {
  for (const key in source) target[key] = (target[key] || 0) + source[key];
}

// Не даємо поточному HP/MP бути більшим за максимум
function clampHpMp(save) {
  const s = calcStats(save);
  const ch = save.character;
  ch.hp = Math.max(0, Math.min(ch.hp, s.hp));
  ch.mp = Math.max(0, Math.min(ch.mp, s.mp));
}

function fullHeal(save) {
  const s = calcStats(save);
  save.character.hp = s.hp;
  save.character.mp = s.mp;
}

// ---------- Відновлення HP / MP з часом ----------
// Кожні 10 секунд: hpRegen / mpRegen (залежать від атрибутів і речей).
// У Домівці додатково +5% від максимуму HP і MP.
// Рахується і за час, поки гра була закрита.
// Повертає true, якщо щось змінилося (тоді варто зберегти гру).

function regenPerTick(save) {
  const s = calcStats(save);
  const home = RPG.getLocation(save.location.map).type === "home";
  return {
    hp: s.hpRegen + (home ? s.hp * HOME_REGEN_PCT : 0),
    mp: s.mpRegen + (home ? s.mp * HOME_REGEN_PCT : 0),
    home
  };
}

// Тики «Молитви благодаті»: окремо від звичайного відновлення
function applyGrace(save, now) {
  const ch = save.character, g = ch.grace;
  if (!g) return false;
  const end = Math.min(now, g.until);
  const hpTicks = Math.max(0, Math.floor((end - g.hpAt) / GRACE.hpEveryMs));
  const mpTicks = Math.max(0, Math.floor((end - g.mpAt) / GRACE.mpEveryMs));
  g.hpAt += hpTicks * GRACE.hpEveryMs;
  g.mpAt += mpTicks * GRACE.mpEveryMs;
  let changed = false;
  if ((hpTicks || mpTicks) && ch.hp > 0 && !ch.dead) {
    const s = calcStats(save);
    const hp = Math.min(s.hp, ch.hp + Math.round(s.hp * GRACE.hpPct * hpTicks));
    const mp = Math.min(s.mp, ch.mp + Math.round(s.mp * GRACE.mpPct * mpTicks));
    changed = hp !== ch.hp || mp !== ch.mp;
    ch.hp = hp; ch.mp = mp;
  }
  if (now >= g.until) { delete ch.grace; changed = true; }
  return changed;
}

// Скільки мілісекунд ще діє «Молитва благодаті» (0 — не діє)
function graceLeft(save, now = Date.now()) {
  const g = save.character.grace;
  return g ? Math.max(0, g.until - now) : 0;
}

// Храм, Черниця: «Молитва благодаті» для всієї групи
function buyGrace(save, now = Date.now()) {
  if (RPG.getLocation(save.location.map).type !== "temple") return { ok: false, reason: "Молитву читають лише в Храмі." };
  const members = RPG.partyMembers ? RPG.partyMembers(save) : [save];
  const cost = graceCost(members.length);
  if (save.character.gold < cost) return { ok: false, reason: `Потрібно ${cost} золота на пожертву.` };
  save.character.gold -= cost;
  for (const ms of members) {
    applyRegen(ms, now);
    ms.character.grace = { until: now + GRACE.durationMs, hpAt: now, mpAt: now };
  }
  return { ok: true, cost, count: members.length };
}

// Мерія, Розпорядник: повернути атрибути, які гравець вкладав сам
function attrResetPct(ch) {
  // старі збереження: лише лічильник скидань — рахуємо по 20% за кожне
  if (typeof ch.attrResetPct !== "number") ch.attrResetPct = (ch.attrResets || 0) * 20;
  return ch.attrResetPct;
}
function attrResetPrice(save) {
  return attrResetCost((save.character.attrResets || 0) + 1, attrResetPct(save.character));
}
function investedAttrs(save) {
  const ch = save.character;
  const base = getClass(ch.classHistory?.[0]?.classId || ch.classId).baseAttrs || {};
  let sum = 0;
  for (const k of Object.keys(RPG.ATTRS)) sum += Math.max(0, (ch.attrs[k] || 0) - (base[k] || 0));
  return { base, sum };
}
function resetAttrs(save) {
  const ch = save.character;
  const { base, sum } = investedAttrs(save);
  if (!sum) return { ok: false, reason: "Повертати нічого — очки ще не розподілені." };
  const cost = attrResetPrice(save);
  if (ch.gold < cost) return { ok: false, reason: `Потрібно ${cost} золота.` };
  ch.gold -= cost;
  for (const k of Object.keys(RPG.ATTRS)) {
    if ((ch.attrs[k] || 0) > (base[k] || 0)) ch.attrs[k] = base[k] || 0;
  }
  ch.freePoints = (ch.freePoints || 0) + sum;
  ch.attrResets = (ch.attrResets || 0) + 1;
  ch.attrResetPct = attrResetPct(ch) + RPG.randInt(RESET_STEP_PCT[0], RESET_STEP_PCT[1]);
  clampHpMp(save);
  return { ok: true, cost, points: sum };
}

function applyRegen(save, now = Date.now()) {
  const ch = save.character;
  if (!ch.regenAt || ch.regenAt > now) { ch.regenAt = now; return true; }
  // У данжі (dungeon.js) відновлення не працює — лише навички лікування.
  // Час не накопичується, тож після виходу з данжу «запасу» тиків не буде.
  if (save.dungeon) { ch.regenAt = now; return false; }
  const graceChanged = applyGrace(save, now);
  const ticks = Math.floor((now - ch.regenAt) / REGEN_TICK_MS);
  if (ticks <= 0) return graceChanged;
  ch.regenAt += ticks * REGEN_TICK_MS;

  const s = calcStats(save);
  const per = regenPerTick(save);
  const beforeHp = ch.hp, beforeMp = ch.mp;
  if (ch.hp > 0 && !ch.dead) {   // полеглих не лікує — їх відроджує молитва в Храмі
    ch.hp = Math.min(s.hp, ch.hp + per.hp * ticks);
    ch.mp = Math.min(s.mp, ch.mp + per.mp * ticks);
  }
  return graceChanged || ch.hp !== beforeHp || ch.mp !== beforeMp;
}

// Скільки мілісекунд до наступного відновлення
function msToNextRegen(save, now = Date.now()) {
  const left = REGEN_TICK_MS - ((now - (save.character.regenAt || now)) % REGEN_TICK_MS);
  return Math.max(0, left);
}

// ---------- Досвід та рівні ----------
// Досвід НЕ скидається при новому рівні — він постійно росте,
// а рівень визначається за таблицею поточної професії.
// Повертає масив нових рівнів, напр. [3] або [3, 4], щоб показати повідомлення

function addExp(save, amount) {
  const ch = save.character;
  const table = getClass(ch.classId).levelTable;
  const cap = maxExp(table);

  // на максимумі досвід більше не нараховується
  const gained = Math.max(0, Math.min(Math.floor(amount), cap - ch.exp));
  ch.exp += gained;
  ch.totalExp += gained;

  const oldLevel = ch.level;
  ch.level = levelFromExp(table, ch.exp);

  const levelUps = [];
  for (let lvl = oldLevel + 1; lvl <= ch.level; lvl++) {
    levelUps.push(lvl);
    ch.freePoints = (ch.freePoints || 0) + RPG.POINTS_PER_LEVEL;
  }
  if (levelUps.length) fullHeal(save);      // новий рівень = повне лікування
  return levelUps;
}

// Межі смужки досвіду рівня level: { start, needed }
function levelBar(table, level) {
  const start = expForLevel(table, level);
  let next = expForLevel(table, level + 1);
  if (!isFinite(next)) next = start + (start - expForLevel(table, Math.max(1, level - 1)));   // максимальний рівень
  return { start, needed: Math.max(1, next - start) };
}

// Штраф досвіду за смерть.
// Знімається amount досвіду, але не більше DEATH_MAX_PCT (25%) смужки поточного рівня.
// Якщо на поточному рівні набрано менше, ніж штраф, — залишок (у відсотках)
// знімається вже зі смужки попереднього рівня: рівень знижується, а разом з ним
// зникають бонуси за цей рівень (приріст професії, сталі атрибути, вільні очки).
// Нижче 1 рівня поточної професії не опускається.
// Повертає { pct, expLost, levelDown, newLevel, pointsLost }
function deathExpPenalty(save, amount) {
  const ch = save.character;
  const table = getClass(ch.classId).levelTable;
  const oldLevel = ch.level;
  const before = ch.exp;
  const bar = levelBar(table, ch.level);
  const pct = Math.min(DEATH_MAX_PCT, (Math.max(0, amount) / bar.needed) * 100);
  const curPct = ((ch.exp - bar.start) / bar.needed) * 100;
  if (pct <= curPct || ch.level <= 1) {
    ch.exp = Math.max(ch.level <= 1 ? 0 : bar.start, ch.exp - Math.round(pct / 100 * bar.needed));
  } else {
    const rest = pct - curPct;                          // скільки % лишилось зняти
    const prev = levelBar(table, ch.level - 1);
    ch.exp = Math.max(prev.start, bar.start - Math.max(1, Math.round(rest / 100 * prev.needed)));
  }
  ch.level = levelFromExp(table, ch.exp);
  const lost = Math.max(0, oldLevel - ch.level);
  const pointsLost = lost ? removeLevelPoints(save, lost * RPG.POINTS_PER_LEVEL) : 0;
  if (lost) clampHpMp(save);
  return { pct: Math.round(pct * 10) / 10, expLost: before - ch.exp, levelDown: lost > 0, newLevel: ch.level, pointsLost };
}

// Забрати вільні очки атрибутів за втрачені рівні: спершу невкладені,
// потім — з найбільших вкладених атрибутів (стартові значення професії не чіпаємо)
function removeLevelPoints(save, n) {
  const ch = save.character;
  let left = n;
  const free = Math.min(ch.freePoints || 0, left);
  ch.freePoints = (ch.freePoints || 0) - free;
  left -= free;
  const firstClass = getClass(ch.classHistory?.[0]?.classId || ch.classId);
  const baseAttrs = firstClass.baseAttrs || {};
  while (left > 0) {
    let best = null, bestSpent = 0;
    for (const k of Object.keys(RPG.ATTRS)) {
      const spent = (ch.attrs[k] || 0) - (baseAttrs[k] || 0);
      if (spent > bestSpent) { best = k; bestSpent = spent; }
    }
    if (!best) break;
    ch.attrs[best]--;
    left--;
  }
  return n - left;
}

// Старий штраф (лишився для сумісності): без зниження рівня
function removeExp(save, amount) {
  const ch = save.character;
  const table = getClass(ch.classId).levelTable;
  const floor = Math.min(expForLevel(table, ch.level), ch.exp);
  const before = ch.exp;
  ch.exp = Math.max(floor, ch.exp - Math.floor(amount));
  return Math.max(0, before - ch.exp);
}

// Дані для смужки досвіду
function expProgress(save) {
  const ch = save.character;
  const table = getClass(ch.classId).levelTable;
  if (ch.level >= maxLevel(table)) {
    return { exp: ch.exp, nextLevelAt: null, current: 0, needed: 0, percent: 100, max: true };
  }
  const start = expForLevel(table, ch.level);
  const next = expForLevel(table, ch.level + 1);
  const current = ch.exp - start;
  const needed = next - start;
  return {
    exp: ch.exp,
    nextLevelAt: next,
    current,
    needed,
    percent: Math.floor((current / needed) * 100),
    max: false
  };
}

// ---------- Загибель героя ----------
// enemyIds — усі вороги, що були в бою (для групи — кілька).
// 1) Штраф досвіду: сума exp усіх ворогів × 10, але не більше 25% смужки рівня;
//    може знизити рівень (див. deathExpPenalty)
// 2) Кожна вдягнена річ — 0,5% шанс зникнути (ліміт залежить від рівня)
// 3) Відродження в Храмі: 10% HP, 0% MP
function applyDeath(save, enemyIds) {
  const ch = save.character;
  const expSum = enemyIds.reduce((sum, id) => sum + (RPG.getEnemy(id)?.exp || 0), 0);
  const penalty = expSum * DEATH_EXP_MULT;
  const limit = maxItemLoss(ch.level);       // ліміт — за рівнем до штрафу
  const exp = deathExpPenalty(save, penalty);
  const expLost = exp.expLost;

  // Перевірка втрати речей — у випадковому порядку слотів
  const slots = Object.keys(save.equipment).sort(() => Math.random() - 0.5);
  const lostItems = [];
  for (const slot of slots) {
    if (lostItems.length >= limit) break;
    if (Math.random() < ITEM_LOSS_CHANCE) {
      lostItems.push(save.equipment[slot]);   // екземпляр речі (з рідкістю)
      delete save.equipment[slot];
    }
  }

  ch.deaths = (ch.deaths || 0) + 1;

  // Уся група загинула — кожен відроджується в Храмі.
  // (Якщо хтось вижив, полеглі лишаються мертвими — див. markFallen() і pray().)
  ch.dead = false;
  const s = calcStats(save);
  ch.hp = Math.max(1, Math.ceil(s.hp * RESPAWN_HP_PCT));
  ch.mp = Math.floor(s.mp * RESPAWN_MP_PCT);
  ch.regenAt = Date.now();
  save.location.map = RPG.RESPAWN_LOCATION;
  delete save.travel;

  return { penalty, expLost, expPct: exp.pct, levelDown: exp.levelDown, newLevel: exp.newLevel,
           pointsLost: exp.pointsLost, lostItems, itemLossLimit: limit };
}

// Герой упав у бою, але група перемогла: лишається полеглим (0 HP), поки
// живі не помоляться за нього в Храмі. ms — «вигляд» героя (party.js → memberSave)
function markFallen(ms) {
  ms.character.hp = 0;
  ms.character.mp = 0;
  ms.character.dead = true;
  ms.character.deaths = (ms.character.deaths || 0) + 1;
}

// ---------- Храм: молитва за полеглих ----------
// Полеглі герої групи відроджуються з 10% HP і 0% MP.
function pray(save) {
  if (RPG.getLocation(save.location.map).type !== "temple") {
    return { ok: false, reason: "Помолитися можна лише в Храмі." };
  }
  const members = RPG.partyMembers ? RPG.partyMembers(save) : [save];
  const fallen = members.filter(ms => ms.character.dead || ms.character.hp <= 0);
  for (const ms of fallen) {
    const s = calcStats(ms);
    ms.character.dead = false;
    ms.character.hp = Math.max(1, Math.ceil(s.hp * RESPAWN_HP_PCT));
    ms.character.mp = Math.floor(s.mp * RESPAWN_MP_PCT);
    ms.character.regenAt = Date.now();
  }
  return { ok: true, revived: fallen.map(ms => ms.character.name) };
}

// ---------- Зміна професії ----------

function getClassChanges(save) {
  return availableClassChanges(save.character.classId, save.character.level);
}

// opts.force — без перевірки умов (професію видає квест «Шлях професії», quests.js)
function changeClass(save, newClassId, opts = {}) {
  const ch = save.character;
  if (!CLASSES[newClassId]) return { ok: false, reason: "Такої професії немає." };
  if (!opts.force && !getClassChanges(save).includes(newClassId)) {
    return { ok: false, reason: "Умови для цієї професії не виконані." };
  }

  ch.classHistory.push({ classId: ch.classId, level: ch.level, exp: ch.exp });

  ch.classId = newClassId;
  ch.level = 1;
  ch.exp = 0;

  const removed = [];
  for (const slot in save.equipment) {
    const ref = save.equipment[slot];
    const id = RPG.refId(ref);
    const bad = !canEquip(save, id).ok || (slot === "offHand" && ITEMS[id]?.weaponType && offHandProblem(save, "axe"));
    if (bad) {
      delete save.equipment[slot];
      addRefToList(save.inventory, ref);
      removed.push(ref);
    }
  }
  const off = fixHands(save);
  if (off) removed.push(off);

  fullHeal(save);
  return { ok: true, removed, changeBonus: { ...(CLASSES[newClassId].changeBonus || {}) } };
}

// ---------- Списки предметів (інвентар, скриня) ----------
// Обидва — масиви [{ id, qty }]

function countInList(list, id) {
  return list.filter(e => e.id === id).reduce((sum, e) => sum + e.qty, 0);
}

// Зброя/броня з рідкістю — окремі екземпляри. Без вказаної рідкості
// додається звичайна (біла) річ без випадкових бонусів, як із магазину.
// maxOf(id) — ліміт стопки для цього списку (за замовчуванням item.maxStack; для скрині — chestStackMax).
function addToList(list, id, qty = 1, maxOf = null) {
  const item = ITEMS[id];
  if (!item || qty <= 0) return false;

  if (RPG.hasRarity(id)) {
    for (let i = 0; i < qty; i++) list.push(RPG.makeItem(id, "common", { fromShop: true }));
    return true;
  }

  if (item.stackable) {
    const max = maxOf ? maxOf(id) : (item.maxStack || 99);
    for (const entry of list) {
      if (entry.id === id && entry.qty < max) {
        const add = Math.min(max - entry.qty, qty);
        entry.qty += add;
        qty -= add;
        if (qty === 0) return true;
      }
    }
    while (qty > 0) {
      const add = Math.min(max, qty);
      list.push({ id, qty: add });
      qty -= add;
    }
  } else {
    for (let i = 0; i < qty; i++) list.push({ id, qty: 1 });
  }
  return true;
}

function removeFromList(list, id, qty = 1) {
  if (countInList(list, id) < qty) return false;
  for (let i = list.length - 1; i >= 0 && qty > 0; i--) {
    const entry = list[i];
    if (entry.id !== id) continue;
    const take = Math.min(entry.qty, qty);
    entry.qty -= take;
    qty -= take;
    if (entry.qty === 0) list.splice(i, 1);
  }
  return true;
}

// Покласти вже готовий запис (річ з рідкістю — як є, стопку — докупи)
function addRefToList(list, ref, maxOf = null) {
  ref = RPG.normalizeRef(ref);
  if (!ref || !ITEMS[ref.id]) return false;
  if (ITEMS[ref.id].stackable) return addToList(list, ref.id, ref.qty || 1, maxOf);
  list.push(ref);
  return true;
}

function countItem(save, id)          { return countInList(save.inventory, id); }
function addItem(save, id, qty = 1)    { return addToList(save.inventory, id, qty); }

// ---------- Місткість інвентаря ----------
// 36 клітинок. Коли вільних немає — трофеї, яким нема місця, пропадають (стопки ще доповнюються),
// а купити чи взяти зі скрині не вийде. Старі сейви з понад 36 речами нічого не втрачають.
const INV_SIZE = 36;
// ---------- Пояс: 5 слотів для мішечків (type: "pouch") ----------
// save.belt = [id | null, ...] — спільний для групи, як і інвентар. Кожен мішечок додає ITEMS[id].bag комірок.
const BELT_SLOTS = 5;
const POUCH_DROP = { chance: 0.01, weights: { pouch_small: 60, pouch_medium: 30, pouch_large: 10 } };
function beltOf(save) {
  if (!Array.isArray(save.belt)) save.belt = [];
  while (save.belt.length < BELT_SLOTS) save.belt.push(null);
  return save.belt;
}
function beltBonus(save) {
  return (Array.isArray(save.belt) ? save.belt : []).reduce((n, id) => n + (ITEMS[id]?.bag || 0), 0);
}
// Місткість інвентаря: 36 + мішечки на поясі
function invSize(save) { return INV_SIZE + beltBonus(save); }
function invFree(save) {
  return Math.max(0, invSize(save) - save.inventory.length);
}
// Повісити мішечок з інвентаря на пояс (у слот slot; зайнятий — мішечки міняються місцями)
function putOnBelt(save, invIndex, slot) {
  const belt = beltOf(save);
  const entry = save.inventory[invIndex];
  if (!entry || ITEMS[entry.id]?.type !== "pouch") return { ok: false, reason: "Це не мішечок на пояс." };
  if (!(slot >= 0 && slot < BELT_SLOTS)) return { ok: false, reason: "Немає такого слота." };
  const old = belt[slot];
  if (old && save.inventory.length > INV_SIZE + beltBonus(save) - (ITEMS[old].bag || 0) + (ITEMS[entry.id].bag || 0))
    return { ok: false, reason: "Після заміни речі не вмістяться в інвентар — спершу звільніть місце." };
  save.inventory.splice(invIndex, 1);
  belt[slot] = entry.id;
  if (old) save.inventory.push({ id: old, qty: 1 });
  return { ok: true, id: entry.id, old };
}
// Зняти мішечок з пояса в інвентар (якщо після цього все вміститься)
function takeFromBelt(save, slot) {
  const belt = beltOf(save);
  const id = belt[slot];
  if (!id) return { ok: false, reason: "Слот порожній." };
  if (save.inventory.length + 1 > invSize(save) - (ITEMS[id].bag || 0))
    return { ok: false, reason: "Без цього мішечка речі не вмістяться в інвентар — спершу звільніть місце." };
  belt[slot] = null;
  save.inventory.push({ id, qty: 1 });
  return { ok: true, id };
}
// Трофей з боса: 1% на мішечок (окремо від звичайної здобичі). Повертає id або null
function rollPouchDrop(enemyId) {
  if (!RPG.ENEMIES?.[enemyId]?.boss || Math.random() >= POUCH_DROP.chance) return null;
  const w = Object.entries(POUCH_DROP.weights);
  let x = Math.random() * w.reduce((n, [, v]) => n + v, 0);
  for (const [id, v] of w) { if (x < v) return id; x -= v; }
  return w[0][0];
}
// Скільки штук id ще влізе в інвентар
function fitQty(save, id, qty) {
  const item = ITEMS[id];
  if (!item || qty <= 0) return 0;
  const free = invFree(save);
  if (RPG.hasRarity(id) || !item.stackable) return Math.min(qty, free);
  const max = item.maxStack || 99;
  let room = free * max;
  for (const e of save.inventory) if (e.id === id && !e.r && e.qty < max) room += max - e.qty;
  return Math.min(qty, room);
}
function fullText(save, id, qty) {
  const n = fitQty(save, id, qty);
  return n ? `Інвентар майже повний: влізе лише ${n} шт.` : "Інвентар повний — звільніть місце (продайте речі або покладіть у скриню вдома).";
}
function removeItem(save, id, qty = 1) { return removeFromList(save.inventory, id, qty); }

// ---------- Скрині ----------
// Скриня стоїть у локації, якщо в LOCATIONS (data/enemies.js) у неї є поле chest: "<id сховища>".
// Скрині з однаковим id сховища ПОВ'ЯЗАНІ: це одне спільне сховище, тож покладене
// в одній скрині можна забрати з будь-якої іншої (не треба вертатись на початок).
// Окрема (непов'язана) скриня — просто свій унікальний id сховища.
// Нове сховище додається в CHEST_STORAGES; місткість і ліміти стопок беруться з CHEST_DEFAULTS,
// якщо для сховища не задано своїх.
const CHEST_DEFAULTS = {
  size: 50,                                      // клітинок у скрині
  stack: { material: 1000, consumable: 500 }     // штук в одній клітинці: матеріали / зілля
};
const CHEST_STORAGES = {
  main: { name: "Скриня" }                       // Домівка (і майбутні пов'язані скрині)
};
const DEFAULT_CHEST = "main";

// ---------- Сфера Богів (предмет адміністратора, data/items.js → orb_gods) ----------
// Бонуси діють на всю групу, поки сфера в інвентарі (у скрині — ні). null — сфери в інвентарі немає.
const GODS_ORB = "orb_gods";
function godsOrb(save) {
  return countItem(save, GODS_ORB) > 0 ? ITEMS[GODS_ORB].gods : null;
}
// Чи є сфера де-небудь у збереженні (інвентар або будь-яка скриня)
function hasGodsOrb(save) {
  if (countItem(save, GODS_ORB) > 0) return true;
  return Object.values(save.chests || {}).some(list => (list || []).some(e => e?.id === GODS_ORB));
}
// Видати сферу (сторінка «Налаштування»): одна на збереження
function grantGodsOrb(save) {
  if (hasGodsOrb(save)) return { ok: false, reason: "Сфера Богів уже є в цьому збереженні (в інвентарі чи в скрині Домівки)." };
  if (!invFree(save)) return { ok: false, reason: "Інвентар повний — звільніть клітинку." };
  addItem(save, GODS_ORB, 1);
  return { ok: true };
}

// ---------- Скрині ремесла на складі власного дому (план крафту, етап 5) ----------
// Склад добудовують при домі; на складі купують «меблі» — скрині ремесла. Кожна скриня — окреме
// сховище з id "<id дому>:<вид>:<номер>" (напр. "h_oak:mat:2"), свої для кожного дому.
// allow — які типи предметів можна класти; stack — штук в одній клітинці.
const WAREHOUSE_PRICE = 50000;
const CRAFT_CHESTS = {
  mat:  { name: "Скриня для матеріалів", size: 25, max: 4, price: 5000, allow: ["material"], stack: 1000 },
  pot:  { name: "Скриня для зілля",      size: 10, max: 1, price: 2000, allow: ["consumable"], stack: 1000 },
  item: { name: "Скриня для речей",      size: 25, max: 4, price: 5000, allow: ["weapon", "shield", "offhand", "armor", "accessory"], stack: 1 }
};
const CRAFT_CHEST_ALLOW_TEXT = { mat: "лише матеріали", pot: "лише зілля", item: "лише зброя, броня й прикраси" };
function parseCraftChest(storageId) {
  const m = /^([a-z0-9_]+):(mat|pot|item):(\d+)$/.exec(String(storageId || ""));
  return m ? { houseId: m[1], type: m[2], n: Number(m[3]) } : null;
}

function chestConf(storageId) {
  const cc = parseCraftChest(storageId);
  if (cc) {
    const t = CRAFT_CHESTS[cc.type];
    const stack = {};
    for (const type of t.allow) stack[type] = t.stack;
    return { name: t.max > 1 ? `${t.name} ${cc.n}` : t.name, size: t.size, stack, allow: t.allow, craft: cc.type };
  }
  const conf = CHEST_STORAGES[storageId] || {};
  return {
    name: conf.name || "Скриня",
    size: conf.size || CHEST_DEFAULTS.size,
    stack: { ...CHEST_DEFAULTS.stack, ...(conf.stack || {}) }
  };
}
// Чи можна покласти предмет у сховище (скрині ремесла приймають лише свої типи)
function chestAllows(storageId, id) {
  const allow = chestConf(storageId).allow;
  return !allow || allow.includes(ITEMS[id]?.type);
}
// Скільки штук предмета влазить в одну клітинку скрині
function chestStackMax(id, storageId = DEFAULT_CHEST) {
  const item = ITEMS[id];
  if (!item) return 1;
  return chestConf(storageId).stack[item.type] || item.maxStack || 99;
}
// Вміст сховища (створюється порожнім, якщо його ще немає в сейві)
function chestList(save, storageId = DEFAULT_CHEST) {
  save.chests ??= {};
  save.chests[storageId] ??= [];
  return save.chests[storageId];
}
// id сховища скрині в поточній локації або null
function chestHere(save) {
  return RPG.getLocation(save.location.map).chest || null;
}
// Усі сховища, доступні тут: скриня локації + скрині ремесла складу власного дому
function chestsHere(save) {
  const out = [];
  const main = chestHere(save);
  if (main) out.push(main);
  const h = RPG.houseHere?.(save);
  if (h?.warehouse) {
    for (const type of Object.keys(CRAFT_CHESTS)) {
      for (let n = 1; n <= (h.chests?.[type] || 0); n++) out.push(`${h.id}:${type}:${n}`);
    }
  }
  return out;
}
// Назви локацій, де стоять скрині цього сховища
function chestPlaces(storageId = DEFAULT_CHEST) {
  return Object.values(RPG.LOCATIONS).filter(l => l.chest === storageId && !l.locked).map(l => l.name);
}
function chestFree(save, storageId = DEFAULT_CHEST) {
  return Math.max(0, chestConf(storageId).size - chestList(save, storageId).length);
}

function isAtHome(save) {
  return RPG.getLocation(save.location.map).type === "home";
}

// Покласти клітинку інвентаря в скриню поточної локації.
// Стопка спершу доповнює неповні стопки в скрині, решта йде у вільні клітинки;
// що не влізло — лишається в інвентарі. want — скільки штук зі стопки перекласти (null — усю стопку).
function moveToChest(save, invIndex, storageId = null, want = null) {
  const sid = storageId || chestHere(save);
  if (!sid || !chestsHere(save).includes(sid)) return { ok: false, reason: "Тут немає скрині." };
  const entry = save.inventory[invIndex];
  if (!entry) return { ok: false, reason: "Порожня клітинка." };
  if (ITEMS[entry.id]?.locked && sid !== DEFAULT_CHEST) {
    return { ok: false, reason: `«${ITEMS[entry.id].name}» можна покласти лише в спільну скриню Домівки.` };
  }
  if (!chestAllows(sid, entry.id)) {
    const cc = parseCraftChest(sid);
    return { ok: false, reason: `${chestConf(sid).name}: ${CRAFT_CHEST_ALLOW_TEXT[cc?.type] || "не для цього предмета"}.` };
  }
  const list = chestList(save, sid);
  const item = ITEMS[entry.id];
  const free = chestFree(save, sid);
  const full = { ok: false, reason: `Скриня повна (${chestConf(sid).size} клітинок) — звільніть місце.` };

  if (entry.r || !item?.stackable) {
    if (!free) return full;
    save.inventory.splice(invIndex, 1);
    list.push(entry);
    return { ok: true, id: entry.id, qty: entry.qty || 1 };
  }
  const max = chestStackMax(entry.id, sid);
  let room = free * max;
  for (const e of list) if (e.id === entry.id && !e.r && e.qty < max) room += max - e.qty;
  const ask = want == null ? entry.qty : Math.max(1, Math.min(entry.qty, Math.floor(want)));
  const qty = Math.min(ask, room);
  if (!qty) return full;
  addToList(list, entry.id, qty, id => chestStackMax(id, sid));
  entry.qty -= qty;
  if (entry.qty <= 0) save.inventory.splice(invIndex, 1);
  return { ok: true, id: entry.id, qty, left: qty < ask ? ask - qty : 0 };
}

// Забрати клітинку скрині в інвентар. Якщо вся стопка не влазить — береться скільки влізе.
// want — скільки штук зі стопки взяти (null — усю стопку).
function takeFromChest(save, chestIndex, storageId = null, want = null) {
  const sid = storageId || chestHere(save);
  if (!sid || !chestsHere(save).includes(sid)) return { ok: false, reason: "Тут немає скрині." };
  const list = chestList(save, sid);
  const entry = list[chestIndex];
  if (!entry) return { ok: false, reason: "Порожня клітинка." };
  if (entry.r || !ITEMS[entry.id]?.stackable) {
    if (!invFree(save)) return { ok: false, reason: "Інвентар повний — звільніть місце." };
    list.splice(chestIndex, 1);
    save.inventory.push(entry);
    return { ok: true, id: entry.id, qty: entry.qty || 1 };
  }
  const ask = want == null ? entry.qty : Math.max(1, Math.min(entry.qty, Math.floor(want)));
  const qty = fitQty(save, entry.id, ask);
  if (!qty) return { ok: false, reason: "Інвентар повний — звільніть місце." };
  addToList(save.inventory, entry.id, qty);
  entry.qty -= qty;
  if (entry.qty <= 0) list.splice(chestIndex, 1);
  return { ok: true, id: entry.id, qty, left: qty < ask ? ask - qty : 0 };
}

// ---------- Екіпірування ----------

function canEquip(save, id) {
  const item = ITEMS[id];
  if (!item?.slot) return { ok: false, reason: "Цей предмет не можна вдягнути." };
  if ((item.levelReq || 1) > save.character.level) {
    return { ok: false, reason: `Потрібен ${item.levelReq} рівень.` };
  }
  if (item.classes && !item.classes.includes(save.character.classId)) {
    const names = item.classes.map(c => CLASSES[c]?.name || c).join(", ");
    return { ok: false, reason: `Лише для професій: ${names}.` };
  }
  // Професія дозволяє лише свою зброю (data/classes.js → weapons, offHand)
  if (item.weaponType && !RPG.classAllowsWeapon(save.character.classId, item.weaponType)) {
    return { ok: false, reason: `Професія «${getClass(save.character.classId).name}» не може користуватися цією зброєю.` };
  }
  // Зброя 2–3 виду — лише з достатнім володінням
  if (item.weaponType && item.tier > 1 && RPG.TIER_MASTERY) {
    const need = RPG.TIER_MASTERY[item.tier];
    const have = RPG.getMastery(save, item.weaponType);
    if (have < need) {
      return { ok: false, reason: `Потрібно: ${RPG.WEAPON_TYPES[item.weaponType].mastery.toLowerCase()} ${need} (зараз ${have}).` };
    }
  }
  // Ліва рука: що можна тримати, залежить від зброї в правій (OFFHAND_RULES у data/items.js)
  if (item.slot === "offHand") {
    const why = offHandProblem(save, item.offType);
    if (why) return { ok: false, reason: why };
  }
  return { ok: true };
}

// Тип речі в лівій руці: offType, а для другої сокири Берсерка — "axe"
function offTypeOf(ref) {
  const item = ITEMS[RPG.refId(ref)];
  return item?.offType || item?.weaponType || null;
}
// Чому річ offType не можна тримати в лівій руці (null — можна)
function offHandProblem(save, offType) {
  const cls = getClass(save.character.classId);
  if (cls.offHand) {
    if (!cls.offHand.includes(offType)) {
      const names = cls.offHand.map(t => RPG.OFF_TYPE_NAMES?.[t] || t).join(" або ");
      return `Професія «${cls.name}» у лівій руці може тримати лише ${names}.`;
    }
    if (offType === "axe" && ITEMS[RPG.refId(save.equipment.mainHand)]?.weaponType !== "axe") {
      return "Другу сокиру можна взяти, лише коли в правій руці теж сокира.";
    }
    return null;
  }
  const mainType = ITEMS[RPG.refId(save.equipment.mainHand)]?.weaponType || "none";
  return RPG.offHandAllowed(mainType, offType) ? null : RPG.offHandRuleText(mainType);
}
// Чи може професія взяти сокиру в ліву руку (Берсерк)
function canDualWield(save, id) {
  return ITEMS[id]?.weaponType === "axe" && RPG.classAllowsOffHand(save.character.classId, "axe") &&
         !!getClass(save.character.classId).offHand;
}
// Друга сокира Берсерка: { mainAtk, offAtk, name } або null
function dualWieldInfo(save) {
  const off = save.equipment?.offHand;
  const offItem = ITEMS[RPG.refId(off)];
  const main = save.equipment?.mainHand;
  if (!offItem?.weaponType || ITEMS[RPG.refId(main)]?.weaponType !== offItem.weaponType) return null;
  return { mainAtk: RPG.itemStats(main).attack || 0, offAtk: RPG.itemStats(off).attack || 0, name: offItem.name };
}

// Якщо річ у лівій руці не пасує до зброї в правій — знімає її в інвентар.
// Повертає зняту річ або null.
function fixHands(save) {
  const off = save.equipment.offHand;
  if (!off) return null;
  // Права рука звільнилась, а в лівій — сокира: перекладаємо її в праву
  if (!save.equipment.mainHand && ITEMS[RPG.refId(off)]?.weaponType) {
    save.equipment.mainHand = off;
    delete save.equipment.offHand;
    return null;
  }
  if (!offHandProblem(save, offTypeOf(off))) return null;
  delete save.equipment.offHand;
  addRefToList(save.inventory, off);
  return off;
}

// У який слот персонажа піде річ (кільця/сережки — у вільний з двох)
function equipSlotFor(save, id) {
  // Берсерк: друга сокира йде в ліву руку, якщо в правій уже сокира, а ліва вільна
  if (canDualWield(save, id) && ITEMS[RPG.refId(save.equipment.mainHand)]?.weaponType === "axe" && !save.equipment.offHand) {
    return "offHand";
  }
  const group = RPG.slotsFor(ITEMS[id]?.slot);
  return group.find(s => !save.equipment[s]) || group[0];
}

// what — номер клітинки інвентаря (або ID — тоді береться перша така річ)
function invIndexOf(save, what) {
  if (typeof what === "number") return what;
  return save.inventory.findIndex(e => e.id === what);
}

function equipItem(save, what) {
  const index = invIndexOf(save, what);
  const entry = save.inventory[index];
  if (!entry) return { ok: false, reason: "Предмета немає в інвентарі." };
  const item = ITEMS[entry.id];
  const check = canEquip(save, entry.id);
  if (!check.ok) return check;

  const slot = equipSlotFor(save, entry.id);
  save.inventory.splice(index, 1);
  const old = save.equipment[slot];
  if (old) save.inventory.splice(index, 0, RPG.normalizeRef(old));  // знята річ — у ту ж клітинку
  save.equipment[slot] = RPG.normalizeRef(entry);

  // Нова зброя в правій руці — річ у лівій, що до неї не пасує, знімається в інвентар
  const removed = [];
  const off = fixHands(save);
  if (off) removed.push(off);
  clampHpMp(save);
  return { ok: true, replaced: old || null, ref: entry, slot, removed };
}

function unequipItem(save, slot) {
  const ref = save.equipment[slot];
  if (!ref) return { ok: false, reason: "Слот порожній." };
  delete save.equipment[slot];
  addRefToList(save.inventory, ref);
  fixHands(save);   // з вільною правою рукою ліва може тримати будь-що, але перевіряємо про всяк випадок
  clampHpMp(save);
  return { ok: true, ref };
}

// Як зміняться характеристики, якщо вдягнути предмет з клітинки інвентаря
function previewEquip(save, what) {
  const entry = save.inventory[invIndexOf(save, what)];
  const item = ITEMS[entry?.id];
  if (!item?.slot) return {};
  const before = calcStats(save);
  const test = { ...save, equipment: { ...save.equipment, [equipSlotFor(save, entry.id)]: entry } };
  const after = calcStats(test);
  const diff = {};
  for (const key in after) {
    const d = Math.round((after[key] - (before[key] || 0)) * 10) / 10;
    if (d !== 0) diff[key] = d;
  }
  return diff;
}

// ---------- Розхідники ----------

function useItem(save, id) {
  const item = ITEMS[id];
  if (item?.type !== "consumable") return { ok: false, reason: "Цей предмет не можна використати." };
  // У данжі (dungeon.js) зілля не діють — лікування лише навичками й відновленням
  if (save.dungeon) return { ok: false, reason: "У данжі не можна пити зілля — лікують лише навички." };
  const s = calcStats(save);
  const ch = save.character;
  if (ch.hp <= 0) return { ok: false, reason: "Загиблий не може пити зілля." };
  const e = item.effect || {};
  const wantsHp = (e.healHp || e.healHpPct) && ch.hp < s.hp;
  const wantsMp = (e.healMp || e.healMpPct) && ch.mp < s.mp;
  if (!wantsHp && !wantsMp) return { ok: false, reason: "Здоров'я та мана вже повні." };
  if (!removeItem(save, id, 1)) return { ok: false, reason: "Предмета немає." };

  const result = { ok: true, healedHp: 0, healedMp: 0 };
  const hpAdd = (e.healHp || 0) + (e.healHpPct || 0) * s.hp;
  const mpAdd = (e.healMp || 0) + (e.healMpPct || 0) * s.mp;
  if (hpAdd) {
    const before = ch.hp;
    ch.hp = Math.min(s.hp, ch.hp + hpAdd);
    result.healedHp = Math.round(ch.hp - before);
  }
  if (mpAdd) {
    const before = ch.mp;
    ch.mp = Math.min(s.mp, ch.mp + mpAdd);
    result.healedMp = Math.round(ch.mp - before);
  }
  return result;
}

// ---------- Автозілля ----------
// Налаштування — core.js → RPG.getAutoPotion() (на пристрої, не в сейві). Викликається зі сторінки гри
// перед боєм і після бою (game.js → runAutoPotion). Зілля беруться лише з інвентаря групи.
// Для кожного живого героя: якщо HP (потім MP) нижче below% — п'є, поки не стане upTo% або більше
// (останнє зілля може дати більше), але не більше maxPer зілль цього виду. Усі параметри — окремо для HP і MP.
// У данжі не діє (як і ручне пиття).
// Повертає { lines: [текст для підсумку], missing: { hp, mp } — чи бракувало зілля, drank — скільки випито }.
const AUTO_POTIONS = {
  hp: { small: "potion_hp_small", medium: "potion_hp_medium", large: "potion_hp_large", amount: e => e.healHp || 0, pct: e => e.healHpPct || 0 },
  mp: { small: "potion_mp_small", medium: "potion_mp_medium", large: "potion_mp_large", amount: e => e.healMp || 0, pct: e => e.healMpPct || 0 }
};
const AUTO_MAGIC = "potion_magic";

// Скільки відновить зілля id для цього показника (stat — "hp" | "mp") при максимумі max
function potionGain(id, stat, max) {
  const e = ITEMS[id]?.effect || {};
  return AUTO_POTIONS[stat].amount(e) + AUTO_POTIONS[stat].pct(e) * max;
}

// Яке зілля пити: need — скільки ще бракує до цілі. null — нема чого пити
function pickAutoPotion(save, stat, side, need, max, allowMagic) {
  const set = AUTO_POTIONS[stat];
  const has = id => countItem(save, id) > 0;
  if (side.size !== "auto") {
    if (has(set[side.size])) return set[side.size];
    if (!side.fallback) return null;
  }
  // Авто: найменше зілля, якого одного вистачить до цілі; якщо такого немає — найбільше з наявних
  const avail = ["small", "medium", "large"].map(k => set[k]).filter(has)
    .sort((a, b) => potionGain(a, stat, max) - potionGain(b, stat, max));
  if (avail.length) return avail.find(id => potionGain(id, stat, max) >= need) || avail[avail.length - 1];
  return allowMagic && has(AUTO_MAGIC) ? AUTO_MAGIC : null;   // Чарівне — лише коли звичайних немає
}

function autoPotion(save, cfg = RPG.getAutoPotion()) {
  const out = { lines: [], missing: { hp: false, mp: false }, drank: 0 };
  if (save.dungeon || (!cfg.hp.on && !cfg.mp.on)) return out;
  const members = RPG.aliveMembers ? RPG.aliveMembers(save) : [save];
  const group = members.length > 1;
  for (const ms of members) {
    const ch = ms.character;
    const used = {};                       // id → скільки випито
    const change = {};                     // stat → [було %, стало %]
    for (const stat of ["hp", "mp"]) {
      const side = cfg[stat];
      if (!side.on) continue;
      const max = calcStats(ms)[stat];
      if (!max || ch.hp <= 0) continue;
      const pct = () => (ch[stat] / max) * 100;
      if (pct() >= side.below) continue;   // поріг ще не перейдено
      const from = pct();
      const target = (max * side.upTo) / 100;
      for (let n = 0; n < side.maxPer && ch[stat] < target - 1e-9; n++) {
        const id = pickAutoPotion(ms, stat, side, target - ch[stat], max, side.magic);
        if (!id) { out.missing[stat] = true; break; }
        const r = useItem(ms, id);
        if (!r.ok) break;
        used[id] = (used[id] || 0) + 1;
        out.drank++;
      }
      if (ch[stat] > (from * max) / 100) change[stat] = [Math.floor(from), Math.floor(pct())];
    }
    const ids = Object.keys(used);
    if (!ids.length) continue;
    const what = ids.map(id => `${used[id]}× ${ITEMS[id].name}`).join(", ");
    const delta = Object.entries(change).map(([s, [a, b]]) => `${s === "hp" ? "HP" : "MP"} ${a}% → ${b}%`).join(", ");
    out.lines.push(`Автозілля: ${group ? ch.name + " — " : ""}${what}${delta ? ` (${delta})` : ""}`);
  }
  return out;
}

// ---------- Торгівля в Шинку ----------

// Шинок — свій асортимент; Дубова Застава — торговець Гільдії авантюристів
function currentShop(save) {
  const loc = RPG.getLocation(save.location.map);
  if (loc.type === "tavern") return loc.shop || [];
  if (loc.type === "city") return RPG.GUILD_SHOP || [];
  return null;
}

// ---------- Торгова гільдія (Дубова Застава, Торговий район) ----------
// Відкривається з 20 рівня головного героя. Управляючий — Скрудж:
// продає речі 3 виду за потрійну ціну (price × 3).
const TRADE_MIN_LEVEL = 20;
const TRADE_PRICE_MULT = 3;
function tradeStock() {
  return Object.keys(ITEMS).filter(id => ITEMS[id].tier === 3);
}
// ---------- Власні доми (план крафту, етап 4) ----------
// Дім купують в управителя Спального району Дубової Застави. Гравець дає дому назву один раз, при купівлі —
// згодом доми будуть і в інших містах. Скриня в домі — спільна з Домівкою (сховище "main").
// Стан: save.houses = [{ id, key, name, boughtAt }] (key — з HOUSES)
const HOUSE_NAME_MAX = 20;
const HOUSES = {
  oak: { city: "Дубова Застава", district: "rest", loc: "house_oak", price: 100000 }
};
function houseOf(save, key) { return (save.houses || []).find(h => h.key === key) || null; }
function houseHere(save) {
  const key = RPG.getLocation(save.location.map).house;
  return key ? houseOf(save, key) : null;
}
function cleanHouseName(name) { return String(name || "").replace(/\s+/g, " ").trim().slice(0, HOUSE_NAME_MAX); }
function buyHouse(save, key, name) {
  const conf = HOUSES[key];
  if (!conf) return { ok: false, reason: "Такого дому немає." };
  if (houseOf(save, key)) return { ok: false, reason: "Цей дім уже ваш." };
  const title = cleanHouseName(name);
  if (!title) return { ok: false, reason: "Дайте дому назву." };
  if (save.character.gold < conf.price) return { ok: false, reason: `Не вистачає золота (потрібно ${conf.price}).` };
  save.character.gold -= conf.price;
  save.houses ??= [];
  const house = { id: "h_" + key, key, name: title, boughtAt: Date.now() };
  save.houses.push(house);
  return { ok: true, house, price: conf.price };
}
function enterHouse(save, key) {
  const conf = HOUSES[key];
  if (!conf || !houseOf(save, key)) return { ok: false, reason: "Дім вам не належить." };
  delete save.travel;
  save.location.map = conf.loc;
  save.location.district = conf.district;
  return { ok: true };
}

// Склад при домі: добудова, потім скрині ремесла
function buildWarehouse(save, key) {
  const h = houseOf(save, key);
  if (!h) return { ok: false, reason: "Дім вам не належить." };
  if (h.warehouse) return { ok: false, reason: "Склад уже збудовано." };
  if (save.character.gold < WAREHOUSE_PRICE) return { ok: false, reason: `Не вистачає золота (потрібно ${WAREHOUSE_PRICE}).` };
  save.character.gold -= WAREHOUSE_PRICE;
  h.warehouse = true;
  h.chests ??= { mat: 0, pot: 0, item: 0 };
  return { ok: true, price: WAREHOUSE_PRICE };
}
function buyCraftChest(save, key, type) {
  const h = houseOf(save, key), t = CRAFT_CHESTS[type];
  if (!h) return { ok: false, reason: "Дім вам не належить." };
  if (!h.warehouse) return { ok: false, reason: "Спершу збудуйте склад." };
  if (!t) return { ok: false, reason: "Такої скрині немає." };
  h.chests ??= { mat: 0, pot: 0, item: 0 };
  if ((h.chests[type] || 0) >= t.max) return { ok: false, reason: `${t.name}: уже максимум (${t.max}).` };
  if (save.character.gold < t.price) return { ok: false, reason: `Не вистачає золота (потрібно ${t.price}).` };
  save.character.gold -= t.price;
  h.chests[type] = (h.chests[type] || 0) + 1;
  return { ok: true, price: t.price, n: h.chests[type], name: t.name };
}
// «Розкласти все»: матеріали й зілля з інвентаря — у скрині ремесла цього дому (речі не чіпаємо)
function sortToCraftChests(save) {
  const ids = chestsHere(save).filter(sid => ["mat", "pot"].includes(parseCraftChest(sid)?.type));
  let moved = 0;
  for (let i = save.inventory.length - 1; i >= 0; i--) {
    const entry = save.inventory[i];
    if (!entry || entry.r) continue;
    for (const sid of ids) {
      if (!chestAllows(sid, entry.id)) continue;
      const r = moveToChest(save, i, sid);
      if (r.ok) moved += r.qty;
      if (save.inventory[i] !== entry) break;         // стопка переїхала повністю
    }
  }
  return { ok: true, moved, chests: ids.length };
}

// ---------- Кузня при домі і знаряддя (план крафту, етап 6) ----------
// Кузню добудовують при власному домі. Знаряддя продає коваль Кузьма (Гільдія ремісників, Торговий район)
// і одразу ставить у кузню. Ремесло доступне героям, які вже мають професію (ранг 2+).
// Стан: house.forge = { tools: { furnace: true, ... } }
const FORGE_PRICE = 50000;
// need: true — без цього не кують нічого; for — для яких рецептів потрібне; bonus — +% до шансу успіху
const FORGE_TOOLS = {
  furnace:     { name: "Горно",                    price: 5000, need: true, text: "Вогонь для металу й переплавки руди." },
  anvil:       { name: "Ковадло",                  price: 3000, need: true, text: "Основа, на якій б'ють метал." },
  hammer:      { name: "Молот коваля",             price: 2000, need: true, text: "Кує зброю, броню й кільця." },
  tongs:       { name: "Кліщі",                    price: 1000, need: true, text: "Тримають розпечене залізо." },
  quench:      { name: "Діжка для гартування",     price: 1000, need: true, text: "Гартування — річ отримує рідкість." },
  bellows:     { name: "Міхи",                     price: 4000, for: "залізо (тір 3)", text: "Жар для заліза." },
  leatherwork: { name: "Верстак шкірника",         price: 3000, for: "шкіряна броня, колчани, щити тіру 2", text: "Для роботи зі шкірою." },
  carving:     { name: "Різці й рубанок",          price: 2000, for: "луки, посохи, дерев'яні речі", text: "Для роботи з деревом." },
  crucible:    { name: "Тигель і ювелірні щипці",  price: 3000, for: "кільця, амулети, сережки", text: "Для прикрас." },
  iron_anvil:  { name: "Залізне ковадло",          price: 5000, bonus: 3, text: "Краще ковадло: +3% до успіху кування." }
};
// Ремесло — для героїв з професією (головний герой)
function hasCraftAccess(save) {
  return getClass(save.character.classId).tier > 1;
}
// Дім, у кузню якого Кузьма ставить знаряддя (поки один дім — перший з кузнею)
function forgeHouse(save) { return (save.houses || []).find(h => h.forge) || null; }
function buildForge(save, key) {
  const h = houseOf(save, key);
  if (!h) return { ok: false, reason: "Дім вам не належить." };
  if (h.forge) return { ok: false, reason: "Кузню вже збудовано." };
  if (save.character.gold < FORGE_PRICE) return { ok: false, reason: `Не вистачає золота (потрібно ${FORGE_PRICE}).` };
  save.character.gold -= FORGE_PRICE;
  h.forge = { tools: {} };
  return { ok: true, price: FORGE_PRICE };
}
function buyForgeTool(save, toolId) {
  const t = FORGE_TOOLS[toolId];
  if (!t) return { ok: false, reason: "Такого знаряддя немає." };
  if (!hasCraftAccess(save)) return { ok: false, reason: "Кузьма продає знаряддя лише тим, хто вже має професію." };
  const h = forgeHouse(save);
  if (!h) return { ok: false, reason: "Спершу збудуйте кузню при своєму домі (Спальний район)." };
  if (h.forge.tools[toolId]) return { ok: false, reason: `${t.name} уже стоїть у кузні.` };
  if (save.character.gold < t.price) return { ok: false, reason: `Не вистачає золота (потрібно ${t.price}).` };
  save.character.gold -= t.price;
  h.forge.tools[toolId] = true;
  return { ok: true, price: t.price, name: t.name, house: h.name };
}
// Книга «Небесна кузня. Настанова» (data/books.js) — «перша наука»: без неї кувати не можна.
// Не предмет: save.books.forge = true.
function hasForgeBook(save) { return !!save.books?.forge; }
// Книга «Кров Іггдрасиля — Боги пантеонів» (data/books.js → GODS_BOOK): продається в Мерії за GODS_BOOK.price,
// лише власникам дому; читати — у бібліотеці дому. save.books.gods = true
function hasGodsBook(save) { return !!save.books?.gods; }
function buyGodsBook(save) {
  const B = RPG.GODS_BOOK;
  if (!B) return { ok: false, reason: "Книги немає." };
  if (hasGodsBook(save)) return { ok: false, reason: "Ця книга у вас уже є." };
  if (!(save.houses || []).length) return { ok: false, reason: "Мерія продає цю книгу лише власникам дому в Заставі." };
  if (save.character.gold < B.price) return { ok: false, reason: `Не вистачає золота (потрібно ${B.price}).` };
  save.character.gold -= B.price;
  save.books ??= {};
  save.books.gods = true;
  return { ok: true, price: B.price, name: B.title };
}
function buyForgeBook(save) {
  const B = RPG.FORGE_BOOK;
  if (!B) return { ok: false, reason: "Книги немає." };
  if (hasForgeBook(save)) return { ok: false, reason: "Ця книга у вас уже є." };
  if (!hasCraftAccess(save)) return { ok: false, reason: "Кузьма продає книгу лише тим, хто вже має професію." };
  if (save.character.gold < B.price) return { ok: false, reason: `Не вистачає золота (потрібно ${B.price}).` };
  save.character.gold -= B.price;
  save.books ??= {};
  save.books.forge = true;
  return { ok: true, price: B.price, name: B.title };
}
// Чого бракує в кузні для початку роботи (обов'язкові знаряддя)
function forgeMissing(house) {
  const tools = house?.forge?.tools || {};
  return Object.entries(FORGE_TOOLS).filter(([id, t]) => t.need && !tools[id]).map(([id]) => id);
}

// ============================================================
// ТЕСТ: Іфрит — тимчасовий торговець ресурсами ремесла (Гільдія авантюристів, вкладка «Іфрит (тест)»).
// Не належить до лору. Щоб прибрати: видалити цей блок (IFRIT, ifritPrice, buyFromIfrit) — вкладка зникне сама.
// Ціни — з таблиці «Небесна_кузня_крафт_v2.xlsx», аркуш «Іфрит (тест)».
// ============================================================
const IFRIT = {
  stock: ["coal", "oak_wood", "ash_wood", "flax", "leather_strap", "glass", "copper_ore", "flint",
          "lapis", "silver_ore", "iron_ore", "gold_ore", "onyx", "gem"]
};
// Звичайні руни (data/runes.js) — теж у Іфрита, поки руни не падають з ворогів
if (RPG.RUNE_IDS) IFRIT.stock.push(...RPG.RUNE_IDS);
function ifritPrice(id) { return ITEMS[id]?.price || 0; }
function buyFromIfrit(save, id, qty = 1) {
  if (save.location.map !== "city") return { ok: false, reason: "Іфрит — у Гільдії авантюристів Дубової Застави." };
  if (!IFRIT.stock.includes(id)) return { ok: false, reason: "Іфрит цього не продає." };
  qty = Math.floor(Number(qty));
  if (!(qty >= 1 && qty <= BUY_MAX)) return { ok: false, reason: `Вкажіть кількість від 1 до ${BUY_MAX}.` };
  const unit = ifritPrice(id), price = unit * qty;
  if (save.character.gold < price) return { ok: false, reason: `Не вистачає золота (потрібно ${price}).` };
  if (fitQty(save, id, qty) < qty) return { ok: false, reason: fullText(save, id, qty) };
  save.character.gold -= price;
  addItem(save, id, qty);
  return { ok: true, price, qty, unit };
}

function tradePrice(id) {
  return Math.ceil((ITEMS[id]?.price || 0) * TRADE_PRICE_MULT);
}
function buyFromTrade(save, id, qty = 1) {
  if (save.location.map !== "city") return { ok: false, reason: "Торгова гільдія — у Дубовій Заставі, в Торговому районі." };
  if (save.character.level < TRADE_MIN_LEVEL) return { ok: false, reason: `Торгова гільдія приймає з ${TRADE_MIN_LEVEL} рівня.` };
  if (!tradeStock().includes(id)) return { ok: false, reason: "Скрудж цього не продає." };
  qty = Math.floor(Number(qty));
  if (!(qty >= 1 && qty <= BUY_MAX)) return { ok: false, reason: `Вкажіть кількість від 1 до ${BUY_MAX}.` };
  const unit = tradePrice(id), price = unit * qty;
  if (save.character.gold < price) return { ok: false, reason: `Не вистачає золота (потрібно ${price}).` };
  if (fitQty(save, id, qty) < qty) return { ok: false, reason: fullText(save, id, qty) };
  save.character.gold -= price;
  addItem(save, id, qty);
  return { ok: true, price, qty, unit };
}

// Чи відкритий район Дубової Застави: Центральний — з 6 рівня, Торговий — з 20 рівня
function isDistrictOpen(save, d) {
  if (!d.locked) return true;
  if (d.id === "center") return RPG.isCentralOpen(save);
  if (d.id === "trade") return save.character.level >= TRADE_MIN_LEVEL || hasCraftAccess(save);   // з професією — лише Гільдія ремісників
  if (d.id === "north") return getClass(save.character.classId).tier > 1;
  if (d.id === "rest") return !!RPG.isCoalDone?.(save);
  return false;
}
function districtLockText(d) {
  if (d.id === "center") return `Варта не пускає до Мерії новачків. Повертайтеся з ${RPG.CENTRAL_MIN_LEVEL} рівня.`;
  if (d.id === "trade") return `Торговий район: Гільдія ремісників пускає героїв, що вже мають професію; Торгова гільдія — з ${TRADE_MIN_LEVEL} рівня.`;
  if (d.id === "north") return "Варта не пускає до брами простих селян. Повертайтеся, коли матимете професію (квест «Шлях професії», з 15 рівня).";
  if (d.id === "rest") return "Спальний район відкривається після завдання Мерії «Збір вугілля» (Розпорядник Захар, Центральний район).";
  return "Закрито — відкриється згодом.";
}

// qty — скільки штук купити за раз
function buyItem(save, id, qty = 1) {
  const shop = currentShop(save);
  if (!shop) return { ok: false, reason: "Тут немає торговця." };
  if (!shop.includes(id) || ITEMS[id]?.noShop) return { ok: false, reason: "Торговець цього не продає." };
  qty = Math.floor(Number(qty));
  if (!(qty >= 1 && qty <= BUY_MAX)) return { ok: false, reason: `Вкажіть кількість від 1 до ${BUY_MAX}.` };
  const unit = RPG.shopSellPrice(id);
  const price = unit * qty;
  if (save.character.gold < price) return { ok: false, reason: `Не вистачає золота (потрібно ${price}).` };
  if (fitQty(save, id, qty) < qty) return { ok: false, reason: fullText(save, id, qty) };
  save.character.gold -= price;
  addItem(save, id, qty);
  return { ok: true, price, qty, unit };
}

// qty — скільки штук продати з цієї клітинки (за замовчуванням 1,
// більше ніж є — продається вся стопка)
function sellItem(save, invIndex, qty = 1) {
  if (!currentShop(save)) return { ok: false, reason: "Тут немає торговця." };
  const entry = save.inventory[invIndex];
  if (!entry) return { ok: false, reason: "Порожня клітинка." };
  if (ITEMS[entry.id]?.quest) return { ok: false, reason: "Квестові предмети торговець не купує." };
  if (ITEMS[entry.id]?.locked) return { ok: false, reason: `«${ITEMS[entry.id].name}» — предмет адміністратора, його не можна продати.` };
  qty = Math.floor(Number(qty));
  if (!(qty >= 1)) return { ok: false, reason: "Вкажіть кількість від 1." };
  qty = Math.min(qty, entry.qty);
  const price = RPG.refSellPrice(entry) * qty;   // рідкісніша річ — дорожча
  entry.qty -= qty;
  if (entry.qty <= 0) save.inventory.splice(invIndex, 1);
  save.character.gold += price;
  return { ok: true, id: entry.id, qty, price, ref: entry };
}

// ---------- Нагорода за бій ----------

// Для кожної речі луту: it.got — скільки підібрано, it.lost — скільки пропало (не було місця)
// it.filtered — речі, які викинув фільтр здобичі (rarity.js → lootFilter), вони не займають місця
function applyReward(save, exp, loot) {
  save.character.gold += loot?.gold || 0;
  for (const it of loot?.items || []) {
    if (RPG.hasRarity(it.id)) {
      // зброя/броня: рідкість кожної речі визначається окремо (з лічильником удачі)
      it.refs = [];
      it.filtered = [];
      const filterOn = RPG.lootFilterActive(save);
      for (let i = 0; i < it.qty; i++) {
        if (!filterOn && !invFree(save)) break;        // місця немає — решта пропадає
        const r = RPG.rollRarity(save);
        if (filterOn && RPG.isFilteredOut(save, r)) { it.filtered.push(RPG.makeItem(it.id, r)); continue; }
        if (!invFree(save)) continue;                  // не викинута, але й не влізла — пропала
        const ref = RPG.makeItem(it.id, r);
        save.inventory.push(ref);
        it.refs.push(ref);
      }
      it.got = it.refs.length;
      it.lost = it.qty - it.got - it.filtered.length;
      continue;
    }
    const got = fitQty(save, it.id, it.qty);
    it.got = got;
    it.lost = it.qty - got;
    if (got) {
      addItem(save, it.id, got);
    }
  }
  return addExp(save, exp);   // масив нових рівнів
}

Object.assign(RPG, {
  autoPotion, AUTO_POTIONS, GODS_ORB, godsOrb, hasGodsOrb, grantGodsOrb, INV_SIZE, invFree, fitQty, invSize, BELT_SLOTS, POUCH_DROP, beltOf, beltBonus, putOnBelt, takeFromBelt, rollPouchDrop,
  TRADE_MIN_LEVEL, TRADE_PRICE_MULT, tradeStock, tradePrice, buyFromTrade, isDistrictOpen, districtLockText,
  IFRIT, ifritPrice, buyFromIfrit,                // ТЕСТ: прибрати разом з блоком IFRIT
  HOUSES, HOUSE_NAME_MAX, houseOf, houseHere, buyHouse, enterHouse,
  FORGE_PRICE, FORGE_TOOLS, hasCraftAccess, forgeHouse, buildForge, buyForgeTool, forgeMissing, hasForgeBook, buyForgeBook, hasGodsBook, buyGodsBook,
  WAREHOUSE_PRICE, CRAFT_CHESTS, CRAFT_CHEST_ALLOW_TEXT, parseCraftChest, chestAllows, chestsHere, buildWarehouse, buyCraftChest, sortToCraftChests,
  QUEUE_SIZE, BUY_MAX, GRACE, graceCost, graceLeft, buyGrace, attrResetCost, attrResetPrice, investedAttrs, resetAttrs,
  REGEN_TICK_MS, HOME_REGEN_PCT, RESPAWN_HP_PCT, DEATH_EXP_MULT, ITEM_LOSS_CHANCE, maxItemLoss,
  createNewSave, calcStats, clampHpMp, fullHeal, FEMALE_NAMES, heroGender, gw,
  regenPerTick, applyRegen, msToNextRegen,
  addExp, removeExp, deathExpPenalty, DEATH_MAX_PCT, expProgress, applyDeath, markFallen, pray,
  getClassChanges, changeClass,
  countInList, addToList, addRefToList, removeFromList, countItem, addItem, removeItem,
  isAtHome, moveToChest, takeFromChest,
  CHEST_DEFAULTS, CHEST_STORAGES, DEFAULT_CHEST, chestConf, chestStackMax, chestList, chestHere, chestPlaces, chestFree,
  canEquip, fixHands, offTypeOf, offHandProblem, canDualWield, dualWieldInfo, equipSlotFor, equipItem, unequipItem, previewEquip, useItem,
  currentShop, buyItem, sellItem, applyReward
});
})(window.RPG);
