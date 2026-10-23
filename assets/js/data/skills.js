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
// Навички професій (cls — ID професії, data/classes.js): вивчаються лише в цій професії.
// Школи магії (school): fire — вогонь, water — вода, wind — вітер, earth — земля
//   (для магів відповідної школи; потрібен посох).
// kind: "attack" — удар/заклинання, "buff" — посилення, "heal" — лікування (healPct, % від макс. HP цілі),
//       area (для heal): "self" (за замовчуванням) — себе; "near" — себе й союзників на відстані ≤ 1 клітини;
//       "group" — усю групу, будь-яка відстань; "wounded" — найпораненішого героя групи
//       (якщо всі здорові: чекає першого удару ворога в цьому раунді й одразу лікує;
//        якщо всі вороги вже походили — лікує себе). Див. battle.js → heroHeal.
//       "passive" — постійний бонус, поки навичку вивчено (effects у %, crit/dodge — у пунктах).
// weapon — тип зброї або масив типів; для пасивних — null.
// Додаткові поля (battle.js):
//   turns: [n, n10]   — бaф діє рівно n ходів, а на 10 рівні навички — n10 (замість 3 + рівень/4)
//   area: "near" (для buff) — посилення отримують і союзники на відстані ≤ 1 клітини
//   area: "guard" (для buff) — на себе або на союзника, якого б'ють 2+ ворогів
//   spread: "adjacent" — удари hits по черзі між усіма ворогами в сусідніх клітинах (≤ 1) від героя
//   spread: "target"   — удари hits по черзі між ціллю та ворогами в радіусі 1 від неї
//   splash: 1          — та сама шкода ще й ворогам у радіусі 1 від цілі
//   vsDefDown: k       — множник шкоди, якщо в цілі вже знижений захист (Залп мисливця)
//   vsUndead: pct      — +pct% шкоди нежиті (data/enemies.js → undead: true)
//   freeze: [шанс%, +за рівень] — шанс заморозити ворога на 2 ходи (не ходить і невразливий)
//   shadow: { pct, turns } — перехід за спину найслабшого ворога (до 3 кл.) і отруйний удар
//            100% атаки + отрута pct% макс. HP ворога на turns ходів
//   extra: [15, 12, 9] (для heal) — ще 3 випадкові союзники отримують ці % (+ ріст рівня навички)
//   group: true (для passive) — бонус діє на всю групу в бою
//
// ДИСТАНЦІЯ В БОЮ (battle.js): відстань до ворога 1 (0–1), 2 (1–2), 3 (2–3).
//   Ближній бій (меч, кинджал, сокира, посох без магії, кулаки) — дістає на 1.
//   Магія з посохом — на 2. Лук — на 3. Не дістав — герой підходить на 1 ближче.
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
                      effects: { defensePct: [15, 3], magicDefensePct: [15, 3] }, desc: "Захист зростає на кілька ходів." },

    // ===================== НАВИЧКИ ПРОФЕСІЙ (з 15 рівня, після квесту) =====================
    // Воїн
    warrior_crush: { cls: "warrior", weapon: ["sword", "axe"], kind: "attack", name: "Нищівний удар", mp: 6, req: 1,
                     mult: [1.8, 0.07], desc: "Важкий удар, що трощить усе на шляху." },
    warrior_cry:   { cls: "warrior", weapon: ["sword", "axe"], kind: "buff", name: "Бойовий клич", mp: 6, req: 3,
                     area: "near", turns: [4, 5],
                     effects: { attackPct: [15, 2], defensePct: [5, 1] }, desc: "Клич додає сили й стійкості воїну та союзникам поруч (до 1 клітини)." },
    warrior_tough: { cls: "warrior", weapon: null, kind: "passive", name: "Загартування", req: 0,
                     effects: { hpPct: [4, 1.2] }, desc: "Більше здоров'я назавжди." },
    // Лицар
    knight_bash:   { cls: "knight", weapon: "sword", kind: "attack", name: "Удар щитом", mp: 5, req: 1,
                     mult: [1.2, 0.05], debuff: { attackPct: [15, 2] }, desc: "Оглушливий удар — атака ворога слабшає." },
    knight_stand:  { cls: "knight", weapon: "sword", kind: "buff", name: "Непохитність", mp: 6, req: 3,
                     area: "near", turns: [4, 5],
                     effects: { defensePct: [25, 3], magicDefensePct: [10, 2] }, desc: "Лицар стає стіною — для себе й союзників поруч (до 1 клітини)." },
    knight_armor:  { cls: "knight", weapon: null, kind: "passive", name: "Важка броня", req: 0,
                     effects: { defensePct: [5, 1.5] }, desc: "Більше захисту назавжди." },
    // Берсерк
    berserker_whirl: { cls: "berserker", weapon: "axe", kind: "attack", name: "Вихор сокир", mp: 8, req: 1,
                       hits: 5, mult: [0.6, 0.03], spread: "adjacent",
                       desc: "П'ять ударів по колу: по одному кожному ворогу в сусідніх клітинах, далі знову. Якщо ворог один — усі п'ять у нього." },
    berserker_blood: { cls: "berserker", weapon: "axe", kind: "buff", name: "Кривава лють", mp: 6, req: 3,
                       effects: { attackPct: [25, 3], defensePct: [-15, 0] }, desc: "Атака різко зростає, захист падає." },
    berserker_thirst:{ cls: "berserker", weapon: null, kind: "passive", name: "Жага бою", req: 0,
                       effects: { crit: [2, 0.5], attackPct: [3, 1] }, desc: "Крит і атака назавжди." },
    // Розбійник
    rogue_deadly:  { cls: "rogue", weapon: "dagger", kind: "attack", name: "Смертельний удар", mp: 6, req: 1,
                     mult: [1.5, 0.06], critBonus: [35, 3], desc: "Удар у вразливе місце з величезним шансом криту." },
    rogue_shadow:  { cls: "rogue", weapon: "dagger", kind: "buff", name: "Тінь", mp: 5, req: 3,
                     effects: { dodge: [10, 1.5] }, shadow: { pct: 3, turns: 6 },
                     desc: "Розбійник зливається з тінню, з'являється за спиною найслабшого ворога (до 3 клітин) і б'є отруйним клинком." },
    rogue_fingers: { cls: "rogue", weapon: null, kind: "passive", name: "Спритні пальці", req: 0,
                     effects: { crit: [3, 0.6] }, desc: "Шанс криту назавжди." },
    // Мисливець
    hunter_volley: { cls: "hunter", weapon: "bow", kind: "attack", name: "Залп", mp: 8, req: 1,
                     hits: 3, mult: [0.6, 0.03], vsDefDown: 2,
                     desc: "Три стріли майже одночасно. По ворогу зі зниженим захистом — удвічі сильніше." },
    hunter_pierce: { cls: "hunter", weapon: "bow", kind: "attack", name: "Пробивна стріла", mp: 6, req: 3,
                     mult: [1.2, 0.05], debuff: { defensePct: [12, 3] }, desc: "Стріла пробиває броню — захист ворога падає до кінця бою." },
    hunter_eye:    { cls: "hunter", weapon: null, kind: "passive", name: "Зіркість мисливця", req: 0,
                     effects: { attackPct: [4, 1.2] }, desc: "Атака назавжди." },
    // Маг вогню
    fire_arrow:    { cls: "mage_fire", school: "fire", weapon: "staff", kind: "attack", magic: true, name: "Вогняна стріла", mp: 7, req: 1,
                     mult: [1.7, 0.07], dot: [6, 2], desc: "Швидке вогняне заклинання, що підпалює ворога на 3 ходи." },
    fire_blast:    { cls: "mage_fire", school: "fire", weapon: "staff", kind: "attack", magic: true, name: "Полум'яний вибух", mp: 14, req: 5,
                     mult: [2.4, 0.09], splash: 1, desc: "Вибух б'є ціль і всіх ворогів у радіусі 1 клітини від неї." },
    fire_aura:     { cls: "mage_fire", school: "fire", weapon: "staff", kind: "buff", name: "Вогняна аура", mp: 8, req: 3,
                     effects: { magicPct: [15, 2] }, desc: "Сила магії зростає." },
    fire_heat:     { cls: "mage_fire", school: "fire", weapon: null, kind: "passive", name: "Внутрішній жар", req: 0,
                     effects: { magicPct: [4, 1.2] }, desc: "Сила магії назавжди." },
    // Маг води
    water_spear:   { cls: "mage_water", school: "water", weapon: "staff", kind: "attack", magic: true, name: "Крижаний спис", mp: 7, req: 1,
                     mult: [1.5, 0.06], debuff: { attackPct: [15, 2] }, freeze: [1, 0.75],
                     desc: "Холод сковує — атака ворога слабшає. Є шанс заморозити ворога на 2 ходи: він не ходить, але й удари його не беруть." },
    water_heal:    { cls: "mage_water", school: "water", weapon: "staff", kind: "heal", name: "Цілюща хвиля", mp: 10, req: 3,
                     healPct: [18, 2], extra: [15, 12, 9], desc: "Вода загоює рани мага і ще трьох випадкових союзників (слабше)." },
    water_shield:  { cls: "mage_water", school: "water", weapon: "staff", kind: "buff", name: "Водяний щит", mp: 8, req: 5,
                     effects: { defensePct: [15, 2], magicDefensePct: [25, 3] }, desc: "Водяна завіса гасить удари й чари." },
    water_flow:    { cls: "mage_water", school: "water", weapon: null, kind: "passive", name: "Плинність", req: 0,
                     effects: { mpPct: [6, 1.5] }, desc: "Більше мани назавжди." },
    // Маг вітру
    wind_blade:    { cls: "mage_wind", school: "wind", weapon: "staff", kind: "attack", magic: true, name: "Повітряне лезо", mp: 7, req: 1,
                     hits: 2, mult: [0.85, 0.04], desc: "Два леза стисненого повітря." },
    wind_storm:    { cls: "mage_wind", school: "wind", weapon: "staff", kind: "attack", magic: true, name: "Буревій", mp: 14, req: 5,
                     hits: 5, mult: [0.7, 0.03], spread: "target",
                     desc: "П'ять ударів вітру по черзі між ціллю та ворогами в радіусі 1 клітини від неї." },
    wind_tail:     { cls: "mage_wind", school: "wind", weapon: "staff", kind: "buff", name: "Попутний вітер", mp: 7, req: 3,
                     effects: { speedPct: [15, 2], dodge: [5, 1] }, desc: "Швидкість і ухилення зростають." },
    wind_light:    { cls: "mage_wind", school: "wind", weapon: null, kind: "passive", name: "Легкість", req: 0,
                     effects: { dodge: [2, 0.5], speedPct: [3, 0.8] }, desc: "Ухилення й швидкість назавжди." },
    // Маг землі
    earth_fist:    { cls: "mage_earth", school: "earth", weapon: "staff", kind: "attack", magic: true, name: "Кам'яний кулак", mp: 7, req: 1,
                     mult: [1.8, 0.07], desc: "Брила каменю б'є ворога." },
    earth_quake:   { cls: "mage_earth", school: "earth", weapon: "staff", kind: "attack", magic: true, name: "Землетрус", mp: 12, req: 5,
                     mult: [1.3, 0.05], debuff: { defensePct: [15, 3] }, desc: "Земля тріскається — захист ворога падає до кінця бою." },
    earth_skin:    { cls: "mage_earth", school: "earth", weapon: "staff", kind: "buff", name: "Кам'яна шкіра", mp: 8, req: 3,
                     area: "guard", effects: { defensePct: [30, 3] },
                     desc: "Шкіра твердне, мов камінь. Накладається на союзника, якого б'ють 2 чи більше ворогів, інакше — на себе." },
    earth_firm:    { cls: "mage_earth", school: "earth", weapon: null, kind: "passive", name: "Твердість землі", req: 0,
                     effects: { hpPct: [5, 1.2], defensePct: [2, 0.6] }, desc: "Здоров'я й захист назавжди." },
    // Паладин
    paladin_smite: { cls: "paladin", weapon: "sword", kind: "attack", magic: true, name: "Святий удар", mp: 7, req: 1,
                     mult: [1.5, 0.06], desc: "Меч, сповнений світла (сила магії, ближній бій)." },
    paladin_bless: { cls: "paladin", weapon: "sword", kind: "heal", name: "Благословення", mp: 9, req: 3,
                     healPct: [15, 2], area: "near", desc: "Світло лікує паладина й союзників поруч (до 1 клітини)." },
    paladin_faith: { cls: "paladin", weapon: null, kind: "passive", name: "Віра", req: 0,
                     group: true, effects: { magicDefensePct: [6, 1.5] }, desc: "Магічний захист назавжди — для всієї групи в бою." },
    // Жрець
    priest_light:  { cls: "priest", weapon: "staff", kind: "attack", magic: true, name: "Промінь світла", mp: 7, req: 1,
                     mult: [1.5, 0.06], vsUndead: 50, desc: "Сліпучий промінь. Нежить отримує на 50% більше шкоди." },
    priest_prayer: { cls: "priest", weapon: "staff", kind: "heal", name: "Молитва зцілення", mp: 12, req: 3,
                     healPct: [25, 3], area: "wounded", desc: "Сильне лікування найпораненішого героя групи. Якщо всі здорові — жрець чекає першого удару ворога і одразу лікує." },
    priest_grace:  { cls: "priest", weapon: null, kind: "passive", name: "Благодать", req: 0,
                     effects: { mpPct: [5, 1.2], magicPct: [2, 0.6] }, desc: "Мана й сила магії назавжди." },
    // Монах
    monk_strikes:  { cls: "monk", weapon: "staff", kind: "attack", name: "Удари посохом", mp: 6, req: 1,
                     hits: 2, mult: [0.9, 0.04], desc: "Два стрімкі удари посохом (фізичні, ближній бій)." },
    monk_meditate: { cls: "monk", weapon: "staff", kind: "heal", name: "Медитація", mp: 8, req: 3,
                     healPct: [12, 2], area: "group", desc: "Спокій відновлює сили всієї групи, незалежно від відстані." },
    monk_inner:    { cls: "monk", weapon: null, kind: "passive", name: "Внутрішня сила", req: 0,
                     group: true, effects: { attackPct: [3, 1], dodge: [1.5, 0.4] }, desc: "Атака й ухилення назавжди — для всієї групи в бою." }
  };

  const SCHOOLS = {
    fire:  { name: "Вогонь" },
    water: { name: "Вода" },
    wind:  { name: "Вітер" },
    earth: { name: "Земля" }
  };

  // Чи підходить навичка до зброї type
  function skillWeaponOk(sk, type) {
    if (!sk.weapon) return true;
    return Array.isArray(sk.weapon) ? sk.weapon.includes(type) : sk.weapon === type;
  }

  // Дальність дії (1 — ближній бій, 2 — магія з посохом, 3 — лук)
  function actionRange(weaponType, magic) {
    if (weaponType === "bow") return 3;
    if (magic && weaponType === "staff") return 2;
    return 1;
  }
  const SKILL_MAX = 10;

  // Значення ефекту на рівні s
  function skillValue(pair, s) {
    if (!pair) return 0;
    return Math.round((pair[0] + pair[1] * (s - 1)) * 100) / 100;
  }
  // Скільки ходів діє баф/послаблення
  function skillTurns(s, sk) {
    if (sk?.turns) return s >= SKILL_MAX ? sk.turns[1] : sk.turns[0];
    return 3 + Math.floor(s / 4);
  }

  function skillCost(next) { return 10 + 6 * next * next; }

  function skillLevel(save, id) {
    return (save.character.skills || {})[id] || 0;
  }

  // Активні навички для зброї type (без професії — загальні; з classId — ще й навички цієї професії)
  function skillsForWeapon(type, classId) {
    return Object.keys(SKILLS).filter(id => {
      const sk = SKILLS[id];
      if (sk.kind === "passive" || !type || !sk.weapon) return false;
      if (sk.cls && sk.cls !== classId) return false;
      return skillWeaponOk(sk, type);
    });
  }

  // Що показує Тренер: загальні навички вдягненої зброї + усі навички поточної професії
  function trainerSkills(save) {
    const type = weaponTypeOf(save);
    const cls = save.character.classId;
    const ids = type ? skillsForWeapon(type, null).filter(id => !SKILLS[id].cls) : [];
    for (const id of Object.keys(SKILLS)) if (SKILLS[id].cls === cls && !ids.includes(id)) ids.push(id);
    return ids;
  }

  // Володіння, від якого залежить навичка (для кількох видів зброї — найкраще з них)
  function skillMastery(save, sk) {
    if (!sk.weapon) return MASTERY_MAX;
    const list = Array.isArray(sk.weapon) ? sk.weapon : [sk.weapon];
    return Math.max(...list.map(t => getMastery(save, t)));
  }

  // Наскільки можна підняти навичку зараз
  function skillCap(save, id) {
    const sk = SKILLS[id];
    if (sk.kind === "passive") return Math.min(SKILL_MAX, Math.max(1, Math.ceil(save.character.level / 2)));
    return Math.min(SKILL_MAX, skillMastery(save, sk));
  }

  // Постійні бонуси вивчених пасивних навичок: { hpPct, mpPct, attackPct, magicPct, defensePct,
  //   magicDefensePct, speedPct, crit, dodge }
  function passiveBonus(save) {
    const out = {};
    for (const [id, lvl] of Object.entries(save.character.skills || {})) {
      const sk = SKILLS[id];
      if (!sk || sk.kind !== "passive" || lvl < 1) continue;
      for (const [k, pair] of Object.entries(sk.effects)) out[k] = (out[k] || 0) + skillValue(pair, lvl);
    }
    return out;
  }

  function learnSkill(save, id) {
    const sk = SKILLS[id];
    if (!sk) return { ok: false, reason: "Такої навички немає." };
    const ch = save.character;
    ch.skills ??= {};
    const cur = ch.skills[id] || 0;
    if (sk.cls && sk.cls !== ch.classId) {
      return { ok: false, reason: `Цю навичку вивчає лише професія «${RPG.getClass(sk.cls).name}».` };
    }
    const mastery = skillMastery(save, sk);
    if (mastery < sk.req) {
      const list = Array.isArray(sk.weapon) ? sk.weapon : [sk.weapon];
      return { ok: false, reason: `Потрібно ${list.map(t => WEAPON_TYPES[t].mastery.toLowerCase()).join(" або ")} ${sk.req}.` };
    }
    if (cur >= SKILL_MAX) return { ok: false, reason: "Навичка вже на максимумі." };
    if (cur >= skillCap(save, id)) {
      return { ok: false, reason: sk.kind === "passive"
        ? "Пасивну навичку можна підняти до половини рівня персонажа."
        : `Рівень навички не може перевищувати володіння (${mastery}).` };
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
    crit: "шанс криту", dodge: "ухилення", speedPct: "швидкість атаки",
    magicPct: "сила магії", hpPct: "здоров'я", mpPct: "мана"
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
      if (sk.spread === "adjacent") parts.push("по колу між ворогами поруч");
      if (sk.spread === "target") parts.push("по черзі між ціллю й ворогами біля неї");
      if (sk.splash) parts.push(`та сама шкода ворогам у радіусі ${sk.splash} від цілі`);
      if (sk.vsDefDown) parts.push(`×${sk.vsDefDown} по ворогу зі зниженим захистом`);
      if (sk.vsUndead) parts.push(`+${sk.vsUndead}% по нежиті`);
      if (sk.freeze) parts.push(`${skillValue(sk.freeze, s)}% шанс заморозки на 2 ходи`);
    } else if (sk.kind === "heal") {
      const who = { near: " (собі й союзникам поруч)", group: " (усій групі)", wounded: " (найпоранішому)" }[sk.area] || "";
      parts.push(`лікує ${skillValue(sk.healPct, s)}% здоров'я${who}`);
      if (sk.extra) parts.push(`ще 3 випадковим союзникам: ${sk.extra.map(v => Math.round((v + sk.healPct[1] * (s - 1)) * 100) / 100 + "%").join(" / ")}`);
    } else {
      for (const [k, pair] of Object.entries(sk.effects)) {
        const v = skillValue(pair, s);
        const unit = ["crit", "dodge"].includes(k) ? " п.п." : "%";
        parts.push(`${EFFECT_NAMES[k]} ${v > 0 ? "+" : ""}${v}${unit}`);
      }
      if (sk.shadow) parts.push(`перехід за спину найслабшого ворога (до 3 кл.): удар 100% + отрута ${sk.shadow.pct}% його макс. HP × ${sk.shadow.turns} ходів`);
      if (sk.kind === "buff") parts.push(`${skillTurns(s, sk)} ходи` + (sk.area === "near" ? ", собі й союзникам поруч" : sk.area === "guard" ? ", на союзника під ударами 2+ ворогів або на себе" : ""));
    }
    if (sk.kind === "passive") return `${parts.join(", ")} · постійно${sk.group ? ", уся група" : ""}`;
    const range = sk.kind === "attack"
      ? ` · дальність ${actionRange(Array.isArray(sk.weapon) ? sk.weapon[0] : sk.weapon, sk.magic)}` : "";
    return `${parts.join(", ")} · ${sk.mp} MP${range}`;
  }

  Object.assign(RPG, {
    WEAPON_TYPES, MASTERY_MAX, TIER_MASTERY, MASTERY_BONUS, SKILLS, SKILL_MAX,
    masteryCap, masteryCost, getMastery, weaponTypeOf, masteryBonus, trainMastery,
    skillValue, skillTurns, skillCost, skillLevel, skillsForWeapon, skillCap, learnSkill, describeSkill,
    SCHOOLS, skillWeaponOk, actionRange, trainerSkills, skillMastery, passiveBonus, EFFECT_NAMES
  });
})(window.RPG);
