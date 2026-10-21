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
const BUY_MAX = 999;              // найбільше штук за одну покупку

// «Молитва благодаті» (Храм): +2% макс. HP кожні 5 с і +3% макс. MP кожні 10 с,
// діє 10 хвилин реального часу (і поки гра закрита теж).
const GRACE = { durationMs: 10 * 60 * 1000, hpPct: 0.02, hpEveryMs: 5000, mpPct: 0.03, mpEveryMs: 10000 };
// Ціна: сам — 100; група з n героїв (2–6) — 100 + (100 + 10 × n)
function graceCost(n) {
  return n <= 1 ? 100 : 100 + (100 + 10 * n);
}
// Перерозподіл атрибутів у Мерії: n — скільки разів уже скидали
function attrResetCost(n) {
  return 2 * ((500 * n) / 100) + 500;
}

// Скільки речей максимум можна втратити за одну смерть
function maxItemLoss(level) {
  if (level <= 10) return 1;
  if (level <= 20) return 2;
  if (level < 30) return 3;          // 21–29 — на майбутнє
  return RPG.randInt(3, 4);          // 30+ — від 3 до 4
}

// ---------- Створення нового персонажа ----------

function createNewSave(name, classId = DEFAULT_CLASS) {
  const cls = getClass(classId);
  name = String(name || "");
  const save = {
    id: newSlotId(),
    saveVersion: SAVE_VERSION,
    createdAt: Date.now(),
    savedAt: Date.now(),
    character: {
      name: name.trim() || "Герой",
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
    chest: [],              // скриня в Домівці — речі не зникають при смерті
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

function calcStats(save) {
  const cls = getClass(save.character.classId);
  const lvl = save.character.level;
  const stats = {};
  for (const key of STAT_KEYS) stats[key] = 0;

  for (const key in cls.baseStats) {
    stats[key] += cls.baseStats[key] + (cls.growth[key] || 0) * (lvl - 1);
  }

  // Атрибути (власні + з речей)
  addStats(stats, RPG.attrBonuses(RPG.totalAttrs(save)));

  // Бойові бонуси речей (атрибути з речей уже враховані вище).
  // Крит / ухилення / швидкість з ЛЕГЕНДАРНИХ речей відкладаємо окремо:
  // спершу все інше впирається в ліміт, а легендарні додаються зверху.
  const legendOver = {};
  for (const slot in save.equipment) {
    const ref = save.equipment[slot];
    const st = RPG.itemStats(ref);
    const legendary = RPG.rarityOf(ref) === "legendary";
    for (const key in st) {
      if (key in RPG.ATTRS) continue;
      if (legendary && RPG.LEGEND_OVERCAP.includes(key)) legendOver[key] = (legendOver[key] || 0) + st[key];
      else stats[key] = (stats[key] || 0) + st[key];
    }
  }

  // Володіння вдягненою зброєю (data/skills.js)
  const mastery = RPG.masteryBonus ? RPG.masteryBonus(save) : {};
  for (const key in mastery) {
    if (key !== "attackSpeedPct") stats[key] = (stats[key] || 0) + mastery[key];
  }

  // Пасивні навички (data/skills.js → kind "passive"): % до характеристик, крит/ухилення — у пунктах
  const pas = RPG.passiveBonus ? RPG.passiveBonus(save) : {};
  const PCT = { hpPct: "hp", mpPct: "mp", attackPct: "attack", magicPct: "magic",
                defensePct: "defense", magicDefensePct: "magicDefense", speedPct: "speed" };
  for (const [k, stat] of Object.entries(PCT)) if (pas[k]) stats[stat] *= 1 + pas[k] / 100;
  if (pas.crit) stats.crit += pas.crit;
  if (pas.dodge) stats.dodge = (stats.dodge || 0) + pas.dodge;

  const CAP = RPG.STAT_CAP;
  stats.crit = Math.min(stats.crit, CAP.crit);
  stats.dodge = Math.min(stats.dodge, CAP.dodge);
  stats.speed = Math.min(stats.speed, CAP.speed);
  stats.blockPhys = Math.min(stats.blockPhys, CAP.block);
  stats.blockMag = Math.min(stats.blockMag, CAP.block);
  addStats(stats, legendOver);   // легендарні — понад ліміт

  // Швидкість атаки з володіння (напр. лук до +25%) — теж понад ліміт,
  // але не більше 200% ліміту: це другий, крайній ліміт швидкості
  stats.attackSpeedPct = mastery.attackSpeedPct || 0;
  if (stats.attackSpeedPct) stats.speed *= 1 + stats.attackSpeedPct / 100;
  stats.speed = Math.min(stats.speed, CAP.speed * 2);

  // Бонуси комплектів (data/items.js → ITEM_SETS), поверх усього іншого
  const setCounts = RPG.equippedSetCounts ? RPG.equippedSetCounts(save) : {};
  for (const [setId, n] of Object.entries(setCounts)) {
    const set = RPG.ITEM_SETS[setId];
    if (!set || n < set.pieces) continue;
    for (const [key, pct] of Object.entries(set.bonusPct || {})) stats[key] = (stats[key] || 0) * (1 + pct / 100);
  }

  for (const key in stats) {
    stats[key] = DECIMAL_KEYS.includes(key)
      ? Math.round(stats[key] * 10) / 10
      : Math.floor(stats[key]);
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
function attrResetPrice(save) {
  return attrResetCost(save.character.attrResets || 0);
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
  clampHpMp(save);
  return { ok: true, cost, points: sum };
}

function applyRegen(save, now = Date.now()) {
  const ch = save.character;
  if (!ch.regenAt || ch.regenAt > now) { ch.regenAt = now; return true; }
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
    if (!canEquip(save, RPG.refId(ref)).ok) {
      delete save.equipment[slot];
      addRefToList(save.inventory, ref);
      removed.push(ref);
    }
  }

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
function addToList(list, id, qty = 1) {
  const item = ITEMS[id];
  if (!item || qty <= 0) return false;

  if (RPG.hasRarity(id)) {
    for (let i = 0; i < qty; i++) list.push(RPG.makeItem(id, "common", { fromShop: true }));
    return true;
  }

  if (item.stackable) {
    const max = item.maxStack || 99;
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
function addRefToList(list, ref) {
  ref = RPG.normalizeRef(ref);
  if (!ref || !ITEMS[ref.id]) return false;
  if (ITEMS[ref.id].stackable) return addToList(list, ref.id, ref.qty || 1);
  list.push(ref);
  return true;
}

function countItem(save, id)          { return countInList(save.inventory, id); }
function addItem(save, id, qty = 1)    { return addToList(save.inventory, id, qty); }
function removeItem(save, id, qty = 1) { return removeFromList(save.inventory, id, qty); }

// ---------- Скриня (лише в Домівці) ----------
// Переносить усю стопку з однієї клітинки.

function isAtHome(save) {
  return RPG.getLocation(save.location.map).type === "home";
}

function moveToChest(save, invIndex) {
  if (!isAtHome(save)) return { ok: false, reason: "Скриня стоїть у Домівці." };
  const entry = save.inventory[invIndex];
  if (!entry) return { ok: false, reason: "Порожня клітинка." };
  save.inventory.splice(invIndex, 1);
  addRefToList(save.chest, entry);
  return { ok: true, id: entry.id, qty: entry.qty };
}

function takeFromChest(save, chestIndex) {
  if (!isAtHome(save)) return { ok: false, reason: "Скриня стоїть у Домівці." };
  const entry = save.chest[chestIndex];
  if (!entry) return { ok: false, reason: "Порожня клітинка." };
  save.chest.splice(chestIndex, 1);
  addRefToList(save.inventory, entry);
  return { ok: true, id: entry.id, qty: entry.qty };
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
    const mainType = ITEMS[RPG.refId(save.equipment.mainHand)]?.weaponType || "none";
    if (!RPG.offHandAllowed(mainType, item.offType)) {
      return { ok: false, reason: RPG.offHandRuleText(mainType) };
    }
  }
  return { ok: true };
}

// Якщо річ у лівій руці не пасує до зброї в правій — знімає її в інвентар.
// Повертає зняту річ або null.
function fixHands(save) {
  const off = save.equipment.offHand;
  if (!off) return null;
  const mainType = ITEMS[RPG.refId(save.equipment.mainHand)]?.weaponType || "none";
  const offType = ITEMS[RPG.refId(off)]?.offType;
  if (RPG.offHandAllowed(mainType, offType)) return null;
  delete save.equipment.offHand;
  addRefToList(save.inventory, off);
  return off;
}

// У який слот персонажа піде річ (кільця/сережки — у вільний з двох)
function equipSlotFor(save, id) {
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

// ---------- Торгівля в Шинку ----------

// Шинок — свій асортимент; Місто — торговець Гільдії авантюристів
function currentShop(save) {
  const loc = RPG.getLocation(save.location.map);
  if (loc.type === "tavern") return loc.shop || [];
  if (loc.type === "city") return RPG.GUILD_SHOP || [];
  return null;
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

function applyReward(save, exp, loot) {
  save.character.gold += loot?.gold || 0;
  for (const it of loot?.items || []) {
    if (RPG.hasRarity(it.id)) {
      // зброя/броня: рідкість кожної речі визначається окремо (з лічильником удачі)
      it.refs = [];
      for (let i = 0; i < it.qty; i++) {
        const ref = RPG.makeItem(it.id, RPG.rollRarity(save));
        save.inventory.push(ref);
        it.refs.push(ref);
      }
    } else {
      addItem(save, it.id, it.qty);
    }
  }
  return addExp(save, exp);   // масив нових рівнів
}

Object.assign(RPG, {
  QUEUE_SIZE, BUY_MAX, GRACE, graceCost, graceLeft, buyGrace, attrResetCost, attrResetPrice, investedAttrs, resetAttrs,
  REGEN_TICK_MS, HOME_REGEN_PCT, RESPAWN_HP_PCT, DEATH_EXP_MULT, ITEM_LOSS_CHANCE, maxItemLoss,
  createNewSave, calcStats, clampHpMp, fullHeal,
  regenPerTick, applyRegen, msToNextRegen,
  addExp, removeExp, deathExpPenalty, DEATH_MAX_PCT, expProgress, applyDeath, markFallen, pray,
  getClassChanges, changeClass,
  countInList, addToList, addRefToList, removeFromList, countItem, addItem, removeItem,
  isAtHome, moveToChest, takeFromChest,
  canEquip, fixHands, equipSlotFor, equipItem, unequipItem, previewEquip, useItem,
  currentShop, buyItem, sellItem, applyReward
});
})(window.RPG);
