// ============================================================
// monstergear.js — GEAR SCORE МОНСТРІВ і їхнє приховане спорядження
//
// GS групи героїв = середнє RPG.equipmentScore(ms).avg живих героїв у бою
//   (для одного героя — те саме число, що «GS: N» на його картинці).
//
// Гуманоїди (data/enemies.js → humanoid: true — є руки, ноги, голова)
//   перед кожним боєм отримують випадкове спорядження: 6 речей
//   (зброя, голова, тіло, штани, наручі, взуття), середній GS яких
//   дорівнює GS групи героїв (кожна річ ±10%).
// Боси (boss: true) — середній GS речей боса більший за GS групи на надбавку,
//   що залежить від рідкості речей героїв (BOSS_BONUS_BY_RARITY):
//   сірі +10, білі +50, сині +70, фіолетові +90, легендарні +110.
//   Якщо речі різної рідкості — береться середнє надбавок усіх вдягнених речей
//   усіх героїв групи (напр. половина білих і половина синіх → +60).
//   Надбавка ділиться між усіма 6 речами боса: їхній СЕРЕДНІЙ GS = GS групи + надбавка
//   (окремі речі трохи сильніші чи слабші, ±10%).
//   Боси-гуманоїди отримують таке спорядження, а боси-звірі (напр. Король слайм)
//   — так само 6 прихованих «частин сили» (природна броня, ікла, слиз…).
// Звичайні звірі спорядження не мають (GS 0).
//
// Речі монстрів існують лише всередині бою: без картинок, без назв,
// ніколи не потрапляють у здобич і не зберігаються в сейві.
//
// Як річ отримує характеристики (бали — як у gearscore.js, варіант «збалансована»):
//   40% балів — основа: зброя → атака (або сила магії, якщо монстр чаклун),
//                       броня → захист 70% / маг. захист 30%
//   60% балів — 2–4 випадкові бонуси (атрибути, другорядні, допоміжні).
//   Бали → значення: бали / вага групи × одиниця (10 HP, 6 MP, 2 атаки = 1 одиниця).
//   Атрибути монстра переводяться в бойові характеристики як у героя (stats.js → attrBonuses).
//   Шанси (крит, ухилення, блок) і швидкість мають межі; надлишок переходить у здоров'я.
//
// Підключається ПІСЛЯ gearscore.js, stats.js і data/enemies.js, ДО battle.js.
// ============================================================

(function (RPG) {
  // Надбавка GS боса за рідкістю речей героїв
  const BOSS_BONUS_BY_RARITY = { broken: 10, common: 50, magic: 70, epic: 90, legendary: 110 };
  const BOSS_BONUS_NO_GEAR = 10; // героїв без речей — як у сірих
  const PIECES = ["mainHand", "head", "chest", "legs", "hands", "feet"];
  const PIECE_SPREAD = 0.1;      // кожна річ — GS ±10% від цілі
  const CORE_SHARE = 0.4;        // частка балів на основу речі

  // Пул випадкових бонусів (mp додається лише монстрам з маною)
  const AFFIX_POOL = ["str", "agi", "int", "vit", "spi",
                      "hp", "attack", "magic", "defense", "magicDefense",
                      "crit", "dodge", "speed", "blockPhys", "blockMag"];

  // Межі для монстрів (сумарно, разом із власними характеристиками)
  const CAPS = { crit: 50, dodge: 35, blockPhys: 45, blockMag: 45 };
  const SPEED_MULT_CAP = 2;      // швидкість — не більше ніж ×2 від власної

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function isHumanoid(enemyId) { return !!RPG.ENEMIES[enemyId]?.humanoid; }

  // GS групи героїв (ціле)
  function partyGs(members) {
    const list = (members || []).filter(Boolean);
    if (!list.length || !RPG.equipmentScore) return 0;
    const sum = list.reduce((s, ms) => s + RPG.equipmentScore(ms).avg, 0);
    return Math.round(sum / list.length);
  }

  // Надбавка GS боса: середнє надбавок за рідкістю всіх вдягнених речей групи (ціле)
  function bossBonus(members) {
    let sum = 0, n = 0;
    for (const ms of (members || []).filter(Boolean)) {
      for (const slot in ms.equipment || {}) {
        const ref = ms.equipment[slot];
        if (!ref || !RPG.hasRarity(RPG.refId(ref))) continue;
        sum += BOSS_BONUS_BY_RARITY[RPG.rarityOf(ref)] ?? BOSS_BONUS_BY_RARITY.common;
        n++;
      }
    }
    return n ? Math.round(sum / n) : BOSS_BONUS_NO_GEAR;
  }

  // Цільовий середній GS речей ворога (0 — без спорядження)
  function targetGs(enemyId, pGs, bonus) {
    const e = RPG.ENEMIES[enemyId];
    if (!e) return 0;
    if (e.boss) return pGs + bonus;
    return e.humanoid ? pGs : 0;
  }

  // Бали → значення характеристики
  function pointsToValue(key, pts) {
    const w = RPG.GS_WEIGHTS[RPG.GS_GROUP[key]] || 1;
    return pts / w * (RPG.GS_UNIT[key] || 1);
  }

  function add(obj, key, v) { obj[key] = (obj[key] || 0) + v; }

  // Одна річ монстра: { slot, gs, stats }
  function rollPiece(slot, gs, caster, withMp) {
    const stats = {};
    const core = gs * CORE_SHARE;
    if (slot === "mainHand") add(stats, caster ? "magic" : "attack", pointsToValue(caster ? "magic" : "attack", core));
    else {
      add(stats, "defense", pointsToValue("defense", core * 0.7));
      add(stats, "magicDefense", pointsToValue("magicDefense", core * 0.3));
    }
    const pool = withMp ? [...AFFIX_POOL, "mp"] : AFFIX_POOL;
    const n = RPG.randInt(2, 4);
    const shares = Array.from({ length: n }, () => rnd(0.5, 1.5));
    const total = shares.reduce((a, b) => a + b, 0);
    const rest = gs - core;
    shares.forEach(s => { const key = pick(pool); add(stats, key, pointsToValue(key, rest * s / total)); });
    return { slot, gs: Math.round(gs), stats };
  }

  // Спорядження для одного ворога: { gs, pieces, stats } або null.
  // Середній GS речей рівно дорівнює цілі; окремі речі — ±10% навколо неї.
  function rollMonsterGear(enemyId, pGs, bonus = 0) {
    const e = RPG.ENEMIES[enemyId];
    const target = targetGs(enemyId, pGs, bonus);
    if (!e || target <= 0) return null;
    const caster = (e.stats.magic || 0) > (e.stats.attack || 0);
    const withMp = (e.stats.mp || 0) > 0;
    const w = PIECES.map(() => rnd(1 - PIECE_SPREAD, 1 + PIECE_SPREAD));
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const pieces = PIECES.map((slot, i) => rollPiece(slot, target * w[i] / mean, caster, withMp));
    const stats = {};
    for (const p of pieces) for (const k in p.stats) add(stats, k, p.stats[k]);
    const gs = Math.round(target);
    return { gs, partyGs: pGs, bonus: e.boss ? bonus : 0, humanoid: !!e.humanoid, pieces, stats };
  }

  // Додати спорядження до специфікацій ворогів [{ id, champion }] під групу героїв.
  // Повторний виклик перекидає речі, лише якщо GS групи змінився.
  function equipFoes(specs, members) {
    const pGs = partyGs(members);
    const bonus = bossBonus(members);
    const key = pGs + "/" + bonus;
    for (const spec of specs || []) {
      if (spec.gear !== undefined && spec.gearFor === key) continue;
      spec.gear = rollMonsterGear(spec.id, pGs, bonus);
      spec.gearFor = key;
    }
    return specs;
  }

  // Бойові характеристики ворога з урахуванням спорядження
  function applyGear(base, gear) {
    const st = { ...base.stats };
    const own = { ...base.stats };
    const attrs = { str: 0, agi: 0, int: 0, vit: 0, spi: 0 };
    const direct = {};
    for (const k in gear.stats) {
      if (k in attrs) attrs[k] += gear.stats[k];
      else add(direct, k, gear.stats[k]);
    }
    const fromAttrs = RPG.attrBonuses(attrs);
    delete fromAttrs.hpRegen; delete fromAttrs.mpRegen;
    if (!(own.mp > 0)) delete fromAttrs.mp;
    for (const k in fromAttrs) add(direct, k, fromAttrs[k]);
    for (const k in direct) add(st, k, direct[k]);

    // Межі: надлишок шансів і швидкості — у здоров'я
    let overflowPts = 0;
    for (const k in CAPS) {
      if ((st[k] || 0) > CAPS[k]) {
        const extra = st[k] - Math.max(CAPS[k], own[k] || 0);
        if (extra > 0) { overflowPts += extra * RPG.GS_WEIGHTS.auxiliary; st[k] -= extra; }
      }
    }
    const speedCap = Math.max(1, (own.speed || 1) * SPEED_MULT_CAP);
    if (st.speed > speedCap) { overflowPts += (st.speed - speedCap) * RPG.GS_WEIGHTS.auxiliary; st.speed = speedCap; }
    if (overflowPts) add(st, "hp", pointsToValue("hp", overflowPts));

    for (const k in st) {
      st[k] = ["crit", "dodge", "blockPhys", "blockMag"].includes(k) ? Math.round(st[k] * 10) / 10 : Math.round(st[k]);
    }
    return st;
  }

  // Ворог зі специфікації бою { id, champion, gear }
  function enemyFromSpec(spec) {
    const base = RPG.getEnemy(spec.id, spec.champion);
    if (!base) return null;
    if (!spec.gear) return { ...base, gs: 0 };
    return { ...base, stats: applyGear(base, spec.gear), gs: spec.gear.gs };
  }

  Object.assign(RPG, {
    BOSS_BONUS_BY_RARITY, bossBonus, isHumanoid, partyGs, rollMonsterGear, equipFoes, enemyFromSpec
  });
})(window.RPG);
