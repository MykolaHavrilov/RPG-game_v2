// ============================================================
// data/skills.js — ВОЛОДІННЯ ЗБРОЄЮ та АКТИВНІ НАВИЧКИ
//
// Володіння (save.character.mastery): меч, кинджал, сокира, лук, посох.
//   Рівень 0–20. Тренується в Гільдії авантюристів у Тренера (за золото).
//   Персонаж 1–9 рівня — максимум 10; з 10 рівня — максимум 20.
//   Володіння 10 потрібне для зброї 2 виду (кам'яної), 20 — для 3 виду (залізної).
//   Бонуси діють лише для ВДЯГНЕНОЇ зброї цього типу і ростуть з рівнем.
//
// Активні навички (save.character.skills = { skillId: рівень }):
//   рівні 1–10, вивчаються й покращуються у Тренера.
//   Рівень навички не може бути вищим за рівень володіння цією зброєю.
//   У бою їх ставлять у чергу дій. Якщо не та зброя або бракує мани —
//   герой просто б'є звичайним ударом.
//
// Підключається ПІСЛЯ data/items.js і ДО character.js / battle.js.
// ============================================================

(function (RPG) {
  const WEAPON_TYPES = {
    sword:  { name: "Меч",     mastery: "Володіння мечем" },
    dagger: { name: "Кинджал", mastery: "Володіння кинджалом" },
    axe:    { name: "Сокира",  mastery: "Володіння сокирою" },
    bow:    { name: "Лук",     mastery: "Володіння луком" },
    staff:  { name: "Посох",   mastery: "Володіння посохом" }
  };

  const MASTERY_MAX = 20;
  // Скільки володіння треба для виду зброї: 1 — дерев'яна, 2 — кам'яна, 3 — залізна
  const TIER_MASTERY = { 1: 0, 2: 10, 3: 20 };

  // Бонус на 20 рівні володіння; на нижчих — пропорційно менше.
  // attackSpeedPct — % до швидкості атаки ПОНАД звичайний ліміт
  // (але не більше 200% ліміту — другий, крайній ліміт).
  const MASTERY_BONUS = {
    sword:  { attack: 14, crit: 5 },
    dagger: { attack: 10, crit: 6, dodge: 4 },
    axe:    { attack: 20, crit: 3 },
    bow:    { attack: 18, attackSpeedPct: 25 },
    staff:  { magic: 18, mp: 40 }
  };
  const DECIMAL = ["crit", "dodge", "attackSpeedPct"];

  // Максимальний рівень володіння для рівня персонажа
  function masteryCap(charLevel) {
    return charLevel < 10 ? 10 : MASTERY_MAX;
  }

  // Ціна тренування до рівня next (у золоті)
  function masteryCost(next) {
    return 2 * next * next + 3 * next;
  }

  function getMastery(save, type) {
    return (save.character.mastery || {})[type] || 0;
  }

  function weaponTypeOf(save) {
    const ref = save.equipment?.mainHand;
    return RPG.ITEMS[RPG.refId(ref)]?.weaponType || null;
  }

  // Бонуси від володіння вдягненою зброєю
  function masteryBonus(save) {
    const type = weaponTypeOf(save);
    if (!type) return {};
    const lvl = getMastery(save, type);
    const out = {};
    for (const [k, max] of Object.entries(MASTERY_BONUS[type] || {})) {
      const v = max * lvl / MASTERY_MAX;
      out[k] = DECIMAL.includes(k) ? Math.round(v * 10) / 10 : Math.round(v);
    }
    return out;
  }

  function trainMastery(save, type) {
    if (!WEAPON_TYPES[type]) return { ok: false, reason: "Невідома зброя." };
    const ch = save.character;
    ch.mastery ??= {};
    const cur = ch.mastery[type] || 0;
    const cap = masteryCap(ch.level);
    if (cur >= cap) {
      return { ok: false, reason: cap < MASTERY_MAX
        ? `Максимум ${cap}. Далі — з 10 рівня персонажа.`
        : "Досягнуто найвищого рівня володіння." };
    }
    const cost = masteryCost(cur + 1);
    if (ch.gold < cost) return { ok: false, reason: `Не вистачає золота (потрібно ${cost}).` };
    ch.gold -= cost;
    ch.mastery[type] = cur + 1;
    return { ok: true, level: cur + 1, cost };
  }

  // ---------- Активні навички та бафи ----------
  // kind: "attack" — удар (mult: [база, +за рівень], hits — скільки ударів,
  //                  magic — від сили магії, critBonus — додатковий шанс криту, %)
  //       "buff"   — посилення героя на кілька ходів (effects: { ключ: [база, +за рівень] })
  // dot  — отрута: шкода щоходу протягом 3 ходів ворога
  // debuff — послаблення ворога: defensePct (до кінця бою) або attackPct (на кілька ходів)
  // req  — потрібний рівень володіння зброєю, щоб вивчити
  const SKILLS = {
    // Меч
    sword_power:  { weapon: "sword", kind: "attack", name: "Потужний удар", mp: 3, req: 1,
                    mult: [1.4, 0.06], desc: "Один сильний удар мечем." },
    sword_double: { weapon: "sword", kind: "attack", name: "Подвійний удар", mp: 5, req: 5,
                    hits: 2, mult: [0.7, 0.03], desc: "Два швидкі удари поспіль." },
    sword_rally:  { weapon: "sword", kind: "buff", name: "Бойовий запал", mp: 6, req: 3,
                    effects: { attackPct: [10, 2] }, desc: "Атака зростає на кілька ходів." },
    // Кинджал
    dagger_backstab: { weapon: "dagger", kind: "attack", name: "Удар у спину", mp: 3, req: 1,
                       mult: [1.2, 0.05], critBonus: [20, 3], desc: "Підступний удар з високим шансом криту." },
    dagger_poison:   { weapon: "dagger", kind: "attack", name: "Отруйний клинок", mp: 5, req: 5,
                       mult: [1.0, 0], dot: [3, 2], desc: "Удар + отрута на 3 ходи ворога." },
    dagger_flurry:   { weapon: "dagger", kind: "attack", name: "Шквал ударів", mp: 7, req: 10,
                       hits: 3, mult: [0.45, 0.02], desc: "Три швидкі удари." },
    dagger_evasion:  { weapon: "dagger", kind: "buff", name: "Ухильність", mp: 5, req: 3,
                       effects: { dodge: [5, 1] }, desc: "Шанс ухилитися зростає." },
    // Сокира
    axe_chop:  { weapon: "axe", kind: "attack", name: "Рубаний удар", mp: 4, req: 1,
                 mult: [1.6, 0.07], desc: "Важкий удар сокирою." },
    axe_break: { weapon: "axe", kind: "attack", name: "Розколоти броню", mp: 5, req: 5,
                 mult: [1.0, 0], debuff: { defensePct: [10, 3] }, desc: "Удар, що знижує захист ворога до кінця бою." },
    axe_rage:  { weapon: "axe", kind: "buff", name: "Лють", mp: 6, req: 3,
                 effects: { attackPct: [12, 3], defensePct: [-10, 0] }, desc: "Більше атаки, але менше захисту." },
    // Лук
    bow_aimed:  { weapon: "bow", kind: "attack", name: "Прицільний постріл", mp: 4, req: 1,
                  mult: [1.5, 0.06], critBonus: [25, 2], desc: "Точний постріл з високим шансом криту." },
    bow_double: { weapon: "bow", kind: "attack", name: "Подвійний постріл", mp: 5, req: 5,
                  hits: 2, mult: [0.75, 0.03], desc: "Дві стріли одна за одною." },
    bow_eagle:  { weapon: "bow", kind: "buff", name: "Орлине око", mp: 4, req: 3,
                  effects: { crit: [5, 1] }, desc: "Шанс криту зростає." },
    bow_quick:  { weapon: "bow", kind: "buff", name: "Швидкі руки", mp: 5, req: 8,
                  effects: { speedPct: [10, 2] }, desc: "Швидкість атаки зростає." },
    // Посох
    staff_fireball: { weapon: "staff", kind: "attack", name: "Вогняна куля", mp: 8, req: 1,
                      magic: true, mult: [1.9, 0.08], desc: "Потужне заклинання вогню." },
    staff_frost:    { weapon: "staff", kind: "attack", name: "Крижана стріла", mp: 6, req: 5,
                      magic: true, mult: [1.4, 0.05], debuff: { attackPct: [10, 2] }, desc: "Холод послаблює атаку ворога на 3 ходи." },
    staff_shield:   { weapon: "staff", kind: "buff", name: "Магічний щит", mp: 6, req: 3,
                      effects: { defensePct: [15, 3], magicDefensePct: [15, 3] }, desc: "Захист зростає на кілька ходів." }
  };
  const SKILL_MAX = 10;

  // Значення ефекту на рівні s
  function skillValue(pair, s) {
    if (!pair) return 0;
    return Math.round((pair[0] + pair[1] * (s - 1)) * 100) / 100;
  }
  // Скільки ходів діє баф/послаблення
  function skillTurns(s) { return 3 + Math.floor(s / 4); }

  function skillCost(next) { return 10 + 6 * next * next; }

  function skillLevel(save, id) {
    return (save.character.skills || {})[id] || 0;
  }

  function skillsForWeapon(type) {
    return Object.keys(SKILLS).filter(id => SKILLS[id].weapon === type);
  }

  // Наскільки можна підняти навичку зараз
  function skillCap(save, id) {
    const sk = SKILLS[id];
    return Math.min(SKILL_MAX, getMastery(save, sk.weapon));
  }

  function learnSkill(save, id) {
    const sk = SKILLS[id];
    if (!sk) return { ok: false, reason: "Такої навички немає." };
    const ch = save.character;
    ch.skills ??= {};
    const cur = ch.skills[id] || 0;
    const mastery = getMastery(save, sk.weapon);
    if (mastery < sk.req) {
      return { ok: false, reason: `Потрібно ${WEAPON_TYPES[sk.weapon].mastery.toLowerCase()} ${sk.req}.` };
    }
    if (cur >= SKILL_MAX) return { ok: false, reason: "Навичка вже на максимумі." };
    if (cur >= skillCap(save, id)) {
      return { ok: false, reason: `Рівень навички не може перевищувати володіння (${mastery}).` };
    }
    const cost = skillCost(cur + 1);
    if (ch.gold < cost) return { ok: false, reason: `Не вистачає золота (потрібно ${cost}).` };
    ch.gold -= cost;
    ch.skills[id] = cur + 1;
    return { ok: true, level: cur + 1, cost };
  }

  // Короткий опис дії навички на рівні s — для інтерфейсу
  const EFFECT_NAMES = {
    attackPct: "атака", defensePct: "захист", magicDefensePct: "маг. захист",
    crit: "шанс криту", dodge: "ухилення", speedPct: "швидкість атаки"
  };
  function describeSkill(id, s) {
    const sk = SKILLS[id];
    s = Math.max(1, s);
    const parts = [];
    if (sk.kind === "attack") {
      const m = Math.round(skillValue(sk.mult, s) * 100);
      parts.push(`${sk.hits ? sk.hits + " × " : ""}${m}% ${sk.magic ? "сили магії" : "атаки"}`);
      if (sk.critBonus) parts.push(`+${skillValue(sk.critBonus, s)}% до криту`);
      if (sk.dot) parts.push(`отрута ${skillValue(sk.dot, s)} шкоди × 3 ходи`);
      if (sk.debuff?.defensePct) parts.push(`захист ворога −${skillValue(sk.debuff.defensePct, s)}%`);
      if (sk.debuff?.attackPct) parts.push(`атака ворога −${skillValue(sk.debuff.attackPct, s)}% на ${skillTurns(s)} ходи`);
    } else {
      for (const [k, pair] of Object.entries(sk.effects)) {
        const v = skillValue(pair, s);
        const unit = ["crit", "dodge"].includes(k) ? " п.п." : "%";
        parts.push(`${EFFECT_NAMES[k]} ${v > 0 ? "+" : ""}${v}${unit}`);
      }
      parts.push(`${skillTurns(s)} ходи`);
    }
    return `${parts.join(", ")} · ${sk.mp} MP`;
  }

  Object.assign(RPG, {
    WEAPON_TYPES, MASTERY_MAX, TIER_MASTERY, MASTERY_BONUS, SKILLS, SKILL_MAX,
    masteryCap, masteryCost, getMastery, weaponTypeOf, masteryBonus, trainMastery,
    skillValue, skillTurns, skillCost, skillLevel, skillsForWeapon, skillCap, learnSkill, describeSkill
  });
})(window.RPG);
