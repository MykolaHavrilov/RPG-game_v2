// ============================================================
// battle.js — автобій
//
// Бій рахується повністю одразу (simulatePartyBattle), а сторінка
// потім або показує його покроково, або одразу весь результат.
//
// РАУНДИ І ШВИДКІСТЬ
//   Раунд триває, доки кожен живий учасник не походить хоча б раз.
//   Кожна дія учасника має «час» n / швидкість (n = 1, 2, …). Раунд закінчується
//   на часі найповільнішого (1 / найменша швидкість). Хто вдвічі швидший за
//   найповільнішого — ходить за раунд двічі, втричі — тричі і т.д.
//   Порядок: за часом; при рівному часі — спершу ті, хто ходить уперше в раунді,
//   потім герої раніше за ворогів.
//   Приклад: герой 1 — 200, герой 2 — 100, ворог 1 — 80, ворог 2 — 100:
//   герой 1 → герой 2 → ворог 2 → герой 1 (вдруге) → ворог 1.
//
// ПОЛЕ БОЮ 15 × 30 (FIELD)
//   Логічно поле завжди 15 рядків (r = 0…14) × 30 стовпців (c = 0…29).
//   На ПК воно показується як 15 × 30 (широке), на телефоні — повернуте, 30 × 15 (високе):
//   це лише показ (game.js), розрахунок бою однаковий.
//   КУТИ (corner 0…3): 0 — верхній лівий, 1 — нижній лівий, 2 — верхній правий, 3 — нижній правий.
//   Щоразу герої з'являються в іншому куті (game.js обирає кут перед боєм), у зоні 3 × 3.
//   ВОРОГИ (placeFoesFree) — у будь-якому місці поля: або кожен у випадковій клітинці («scatter»),
//   або всі купою біля однієї точки («pack»), але не ближче ніж на хід руху до зони героїв
//   (відстань ≥ MOVE_STEPS + 1), не на перешкодах і лише там, звідки можна дійти до героїв.
//   Стара розстановка ворогів у протилежному куті (placeFoes) лишилась запасним варіантом.
//   РОЗСТАНОВКА зберігається ВІДНОСНО зони 3 × 3 (локальні координати): r 0…2, c 0…2,
//   де c 2 — передній ряд (ближче до ворогів), c 0 — задній. fieldPos() переносить її у потрібний кут.
//   Героїв розставляє гравець (game.js → вікно розстановки, save.formation),
//   ворогів — автоматично (placeFoes): ближній бій — у передній стовпець, далекий — глибше.
//   В одній клітинці — лише один учасник.
//   Відстань = більша з різниць по рядках і стовпцях (діагональ теж 1 клітинка).
//   Передні ряди стоять на відстані 25 (START_DISTANCE). Поки суперник далеко, хід «руху»
//   переносить учасника до MOVE_STEPS клітинок за раз (на великому полі бій не затягується).
//
// ПЕРЕШКОДИ (makeObstacles, opts.obstacles): [{ r, c, kind, block }]
//   block: true  — велика перешкода (дерево, скеля, стіна): не пройти й не видно крізь неї;
//   block: false — мала (кущ, каміння): стати не можна, але ціль крізь неї видно.
//   Дальня атака (дальність > 1: лук, заклинання) — лише якщо пряма лінія між клітинками
//   не перетинає великої перешкоди (hasSight). Ближній удар по сусідній клітинці — завжди.
//   Рух — найкоротшим шляхом в обхід перешкод і учасників (moveToward, пошук у ширину)
//   до найближчої клітинки, звідки можна вдарити.
//   Зона героїв 3 × 3 і клітинки довкола неї завжди вільні; від неї можна дійти майже до всього поля
//   (замкнених «кишень» — не більше 15% вільних клітинок, і ворогів у них не ставлять).
//   Дальність дії: ближній бій (меч, кинджал, сокира, посох без заклинання, кулаки) — 1,
//   заклинання з посохом — 2, лук — 3. Вороги: data/enemies.js → range (1 / 2 / 3).
//   Хто не дістає жодного суперника — замість удару робить крок на 1 клітинку до найближчого
//   (на будь-яку вільну сусідню, і по діагоналі; дія з черги не витрачається).
//   Б'ють найближчого суперника серед тих, до кого дістають.
//
// ФОРМУЛИ
//   Шкода = атака × (0.85…1.15) × 100 / (100 + захист цілі)
//   «Іскра» (4 MP, лише з посохом і лише якщо стоїть у черзі) = сила магії × 1.6 проти маг. захисту.
//   Посох без заклинання в черзі б'є фізично.
//   Крит — шкода × 1.5. Блок — половина шкоди. Ухилення — удар не влучає.
//   Берсерк з двома сокирами: звичайний удар — два удари поспіль, кожен 80% атаки своєї сокири
//   (DUAL_MULT); з однією сокирою — 100%. Навички б'ють основною сокирою як завжди.
//   Заморожений ворог (Крижаний спис) пропускає свої ходи і невразливий — його не можна вибрати ціллю.
//   Групові пасивки (skills.js → group: true) діють на всіх героїв у бою.
//
// Черга дій (save.battleQueue, до 6 — RPG.QUEUE_SIZE): "attack" — удар зброєю, "spell" — «Іскра»,
//   або ID навички (data/skills.js). Якщо навичка недоступна (не та зброя, бракує мани) —
//   звичайний удар.
// ============================================================

(function (RPG) {
  const MAX_ROUNDS = 80;
  const SPELL_COST = 4;
  const SPELL_MULT = 1.6;
  const CRIT_MULT = 1.5;
  const DUAL_MULT = 0.8;         // кожна з двох сокир Берсерка б'є на 80%
  const FREEZE_TURNS = 2;
  const FIELD = { rows: 15, cols: 30, zone: 3 };   // зона кожної сторони — 3 × 3 у куті
  const START_DISTANCE = FIELD.cols - 2 * FIELD.zone + 1;   // між передніми рядами: 25
  const MOVE_STEPS = 4;          // скільки клітинок проходить учасник за один хід руху
  const ROW_ORDER = [1, 0, 2];   // спершу середній рядок, потім краї

  const inField = p => p && p.r >= 0 && p.r < FIELD.rows && p.c >= 0 && p.c < FIELD.cols;
  // Локальні координати зони 3 × 3 (розстановка): r 0…2, c 0…2 (c 2 — передній ряд)
  const inZone = p => p && p.r >= 0 && p.r < FIELD.zone && p.c >= 0 && p.c < FIELD.zone;
  const oppositeCorner = k => 3 - (k & 3);
  // Випадковий кут; якщо передати попередній — новий буде іншим
  function randomCorner(prev = null) {
    const opts = [0, 1, 2, 3].filter(k => k !== prev);
    return opts[Math.floor(Math.random() * opts.length)];
  }
  // Локальна клітинка зони 3 × 3 → клітинка поля для кута corner
  function fieldPos(p, corner = 0) {
    if (!p) return p;
    const bottom = corner & 1, right = corner & 2;
    return {
      r: bottom ? FIELD.rows - FIELD.zone + p.r : p.r,
      c: right ? FIELD.cols - 1 - p.c : p.c
    };
  }
  // Усі клітинки зони кута (для підсвітки на сторінці): [{ r, c, front }]
  function zoneCells(corner = 0) {
    const out = [];
    for (let r = 0; r < FIELD.zone; r++) for (let c = 0; c < FIELD.zone; c++) {
      out.push(Object.assign(fieldPos({ r, c }, corner), { front: c === FIELD.zone - 1 }));
    }
    return out;
  }
  const cellDist = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
  const stepDist = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  const keyOf = p => p.r + ":" + p.c;

  // Стовпець «за замовчуванням» для героя: ближній бій — передній (c 2), посох і лук — c 1
  function heroPrefCol(ms) {
    const t = RPG.ITEMS[RPG.refId(ms.equipment?.mainHand)]?.weaponType;
    return t === "bow" || t === "staff" ? 1 : 2;
  }

  // ---------- Перешкоди ----------
  // Великі: tree — дерево, rock — скеля, wall — стіна; малі: bush — кущ, stone — каміння
  const OBSTACLE_KINDS = {
    tree: { block: true }, rock: { block: true }, wall: { block: true },
    bush: { block: false }, stone: { block: false }
  };
  // Пряма видимість між клітинками a і b: лінія (Брезенгем) не проходить крізь велику перешкоду.
  // sight — Set ключів "r:c" великих перешкод. Самі a і b не перевіряються.
  function hasSight(a, b, sight) {
    if (!sight || !sight.size) return true;
    let x = a.c, y = a.r;
    const dx = Math.abs(b.c - x), dy = -Math.abs(b.r - y);
    const sx = x < b.c ? 1 : -1, sy = y < b.r ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
      if (x === b.c && y === b.r) return true;
      if (sight.has(y + ":" + x)) return false;
    }
  }
  // Усі клітинки, до яких можна дійти від start (обходячи blocked): Set ключів "r:c"
  function reachableFrom(start, blocked) {
    const seen = new Set(start.map(keyOf)), queue = start.map(p => ({ r: p.r, c: p.c }));
    while (queue.length) {
      const p = queue.shift();
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const q = { r: p.r + dr, c: p.c + dc }, k = keyOf(q);
        if ((dr || dc) && inField(q) && !seen.has(k) && !blocked.has(k)) { seen.add(k); queue.push(q); }
      }
    }
    return seen;
  }
  // Випадкові перешкоди для бою. cover = { block: ["tree", ...], low: ["bush", ...] } — які бувають
  // на локації (game.js → fieldCover); corner — кут героїв. Повертає [{ r, c, kind, block }].
  function makeObstacles(cover = {}, corner = 0) {
    const big = (cover.block || ["tree"]).filter(k => OBSTACLE_KINDS[k]?.block);
    const low = (cover.low || ["bush"]).filter(k => OBSTACLE_KINDS[k] && !OBSTACLE_KINDS[k].block);
    const zones = zoneCells(corner);
    const near = p => zones.some(z => cellDist(z, p) <= 1);   // зона героїв і клітинки довкола — вільні
    const rnd = n => Math.floor(Math.random() * n);
    const pick = arr => arr[rnd(arr.length)];
    for (let attempt = 0; attempt < 30; attempt++) {
      const used = new Map();
      const free = p => inField(p) && !near(p) && !used.has(keyOf(p));
      const put = (p, kind) => used.set(keyOf(p), { r: p.r, c: p.c, kind, block: OBSTACLE_KINDS[kind].block });
      // Великі — купками: стіна — відрізок 3–6 клітинок (іноді з поворотом), дерева й скелі — гурт 2–5
      const groups = big.length ? 5 + rnd(3) : 0;
      for (let g = 0; g < groups; g++) {
        const kind = pick(big);
        let p = { r: rnd(FIELD.rows), c: rnd(FIELD.cols) };
        if (!free(p)) continue;
        put(p, kind);
        if (kind === "wall") {
          let dir = Math.random() < 0.5 ? { r: 0, c: 1 } : { r: 1, c: 0 };
          const len = 3 + rnd(4), turn = Math.random() < 0.35 ? 1 + rnd(len - 1) : -1;
          for (let i = 1; i < len; i++) {
            if (i === turn) dir = dir.r ? { r: 0, c: Math.random() < 0.5 ? 1 : -1 } : { r: Math.random() < 0.5 ? 1 : -1, c: 0 };
            p = { r: p.r + dir.r, c: p.c + dir.c };
            if (!free(p)) break;
            put(p, kind);
          }
        } else {
          const size = 2 + rnd(4);
          for (let i = 1; i < size; i++) {
            const q = { r: p.r + rnd(3) - 1, c: p.c + rnd(3) - 1 };
            if (free(q)) { put(q, kind); p = q; }
          }
        }
      }
      // Малі — поодинці, 8–13 штук
      const smalls = low.length ? 8 + rnd(6) : 0;
      for (let i = 0; i < smalls; i++) {
        const p = { r: rnd(FIELD.rows), c: rnd(FIELD.cols) };
        if (free(p)) put(p, pick(low));
      }
      const list = [...used.values()];
      const blocked = new Set(list.map(keyOf));
      const freeCells = FIELD.rows * FIELD.cols - blocked.size;
      if (reachableFrom(zones, blocked).size >= freeCells * 0.85) return list;
    }
    return [];
  }

  // Розстановка героїв: saved — [{ r, c }] у порядку members (може бути неповна чи з помилками).
  // Повертає ЛОКАЛЬНІ позиції в зоні 3 × 3 без повторів; кому місця не дісталось — ставить автоматично.
  // На поле їх переносить fieldPos(p, corner).
  function placeHeroes(members, saved = []) {
    const used = new Set(), out = [];
    members.forEach((ms, i) => {
      const p = saved[i];
      if (inZone(p) && !used.has(keyOf(p))) {
        out[i] = { r: p.r, c: p.c };
        used.add(keyOf(p));
      }
    });
    members.forEach((ms, i) => {
      if (out[i]) return;
      const pref = heroPrefCol(ms);
      const cols = [pref, ...[2, 1, 0].filter(c => c !== pref)];
      for (const c of cols) {
        const r = ROW_ORDER.find(r => !used.has(r + ":" + c));
        if (r !== undefined) { out[i] = { r, c }; used.add(r + ":" + c); break; }
      }
    });
    return out;
  }

  // Автоматична розстановка ворогів у ЛОКАЛЬНІЙ зоні 3 × 3 (c 2 — передній ряд):
  // дальність 1 — c 2, 2 — c 1, 3 — c 0; якщо стовпець зайнятий — глибше, а тоді ближче до героїв
  function placeFoesLocal(specs) {
    const used = new Set();
    return specs.map(spec => {
      const e = RPG.enemyFromSpec ? RPG.enemyFromSpec(spec) : RPG.getEnemy(spec.id, spec.champion);
      const range = RPG.enemyRange ? RPG.enemyRange(e) : 1;
      const pref = 2 - Math.min(2, Math.max(0, range - 1));
      const cols = [pref, ...[0, 1, 2].filter(c => c < pref).reverse(), ...[0, 1, 2].filter(c => c > pref)];
      for (const c of cols) {
        const r = ROW_ORDER.find(r => !used.has(r + ":" + c));
        if (r !== undefined) { used.add(r + ":" + c); return { r, c }; }
      }
      return { r: 1, c: 0 };
    });
  }
  // Вороги на полі: у куті, протилежному куту героїв (heroCorner) — запасний варіант
  function placeFoes(specs, heroCorner = 0) {
    const k = oppositeCorner(heroCorner);
    return placeFoesLocal(specs).map(p => fieldPos(p, k));
  }

  // Стартові місця ворогів по всьому полю. heroCorner — кут героїв, obstacles — перешкоди бою.
  // spread: "scatter" — кожен у випадковій клітинці, "pack" — купою біля однієї точки;
  //   без нього — навпіл випадково. Обмеження: не ближче MOVE_STEPS + 1 клітинок до зони героїв,
  //   не на перешкоді, по одному в клітинці, лише там, звідки можна дійти до героїв.
  // Повертає [{ r, c }] у порядку specs (масив має поле spread — як їх розставлено).
  function placeFoesFree(specs, heroCorner = 0, obstacles = [], spread = null) {
    const n = specs.length;
    const blocked = new Set((obstacles || []).map(keyOf));
    const heroZone = zoneCells(heroCorner);
    const gap = MOVE_STEPS + 1;
    const ok = [...reachableFrom(heroZone, blocked)]
      .map(k => { const [r, c] = k.split(":").map(Number); return { r, c }; })
      .filter(p => heroZone.every(z => cellDist(z, p) >= gap));
    if (ok.length < n) {
      const out = placeFoes(specs, heroCorner);
      out.spread = "corner";
      return out;
    }
    const mode = spread || (Math.random() < 0.5 ? "pack" : "scatter");
    let out;
    if (mode === "scatter") {
      const pool = ok.slice();
      out = specs.map(() => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    } else {
      // Купа: випадкова точка, а вороги — у найближчих до неї вільних клітинках (з невеликим розкидом)
      const center = ok[Math.floor(Math.random() * ok.length)];
      const ranked = ok.map(p => ({ p, d: cellDist(p, center) + stepDist(p, center) * 0.01 + Math.random() * 0.5 }))
        .sort((a, b) => a.d - b.d);
      out = ranked.slice(0, n).map(x => x.p);
    }
    out = out.map(p => ({ r: p.r, c: p.c }));
    out.spread = mode;
    return out;
  }

  const variance = () => 0.85 + Math.random() * 0.3;   // ±15%
  const mitigate = (damage, defense) => damage * 100 / (100 + Math.max(0, defense || 0));
  const roll = pct => Math.random() * 100 < (pct || 0);

  function finishHit(dmg, crit, blocked) {
    if (crit) dmg *= CRIT_MULT;
    if (blocked) dmg *= 0.5;
    return Math.max(1, Math.round(dmg));
  }

  // Чим б'є герой
  function heroWeapon(save) {
    const ref = save.equipment.mainHand;
    const item = RPG.ITEMS[RPG.refId(ref)];
    if (!item) return { name: "кулаками", type: null };
    return { name: item.name, type: item.weaponType || null };
  }

  // ---------- Учасники ----------
  function makeHero(ms) {
    const queue = (ms.battleQueue || []).filter(Boolean).slice(0, RPG.QUEUE_SIZE || 6);
    if (!queue.length) queue.push("attack");
    return {
      side: "hero", ms, name: ms.character.name, classId: ms.character.classId,
      g: RPG.heroGender ? RPG.heroGender(ms) : "m",      // стать — для тексту журналу бою
      base: RPG.calcStats(ms), weapon: heroWeapon(ms),
      skillLevels: { ...(ms.character.skills || {}) }, queue, qi: 0,
      hp: Math.floor(ms.character.hp), mp: Math.floor(ms.character.mp), buffs: {}, stun: 0,
      dual: dualOf(ms),
      lifesteal: (RPG.godsOrb ? (RPG.godsOrb(ms)?.lifestealPct || 0) : 0) + (runeB(ms).lifesteal || 0),   // Сфера Богів + руна Треба
      rb: runeB(ms),                                     // бойові ефекти рун (data/runes.js → runeTotals().battle)
      pos: { r: 1, c: 2 }
    };
  }
  const runeB = ms => (RPG.runeTotals ? RPG.runeTotals(ms).battle : {});
  // ---------- Руни в бою ----------
  // Після влучання героя: оглушення (Турісаз), підпал (Кеназ), прокляття (Чорнобог). Повертає текст для журналу
  function runeOnHit(H, E, dmg) {
    const rb = H.rb || {};
    let t = "";
    if (dmg <= 0 || E.hp <= 0) return t;
    if (rb.stun && !E.stunned && roll(rb.stun)) { E.stunned = 1; t += `, «${E.name}» оглушений (Турісаз)`; }
    if (rb.burn) {
      const burn = Math.max(1, Math.round(heroNow(H).attack * rb.burn / 100));
      const fresh = !E.dot || E.dot.turns <= 0;
      if (fresh || E.dot.dmg * E.dot.turns < burn * 3) { E.dot = { dmg: burn, turns: 3 }; if (fresh) t += `, підпал ${burn} × 3 ходи (Кеназ)`; }
    }
    if (rb.curse && !(E.curse > 0) && roll(rb.curse)) { E.curse = 3; t += `, прокляття: захист −${CURSE_PCT}% на 3 ходи (Чорнобог)`; }
    return t;
  }
  // Множник шкоди героя по ворогу: по чемпіонах і босах (руна Сила)
  const runeEliteMult = (H, E) => (H.rb?.elite && (E.champion || E.enemy.boss) ? 1 + H.rb.elite / 100 : 1);
  // Захист ворога з урахуванням пробиття (Хагалаз)
  const penDef = (H, E) => enemyDefense(E) * (1 - (H.rb?.pen || 0) / 100);
  // Додаткова вогняна шкода від атаки (Крада) — магічна, проти магічного захисту
  function runeFire(H, E) {
    const pct = H.rb?.fire;
    if (!pct || E.hp <= 0) return 0;
    const f = Math.max(1, Math.round(mitigate(heroNow(H).attack * pct / 100, enemyMagDef(E) * 0.5)));
    E.hp = Math.max(0, E.hp - f);
    return f;
  }
  // Удар ворога по герою: менше шкоди від нежиті (Велес). Повертає змінену шкоду
  const runeUndead = (H, E, dmg) => (E.undead && H.rb?.undeadRes ? Math.round(dmg * (1 - H.rb.undeadRes / 100)) : dmg);
  // Після удару ворога: шипи (Чур) і заморожування нападника (Іса). Повертає текст
  function runeOnStruck(H, E, dmg) {
    const rb = H.rb || {};
    let t = "";
    if (dmg > 0 && rb.thorns && E.hp > 0) {
      const back = Math.max(1, Math.round(dmg * rb.thorns / 100));
      E.hp = Math.max(0, E.hp - back);
      t += `, шипи б'ють у відповідь: ${back} (Чур)`;
    }
    if (rb.freeze && E.hp > 0 && !(E.frozen > 0) && roll(rb.freeze)) { E.frozen = 1; t += `, «${E.name}» скутий кригою (Іса)`; }
    return t;
  }
  // Вампіризм: частка завданої шкоди лікує героя. Повертає, скільки HP відновлено
  function leech(H, dmg) {
    if (!H.lifesteal || H.hp <= 0 || dmg <= 0) return 0;
    const before = H.hp;
    H.hp = Math.min(H.base.hp, H.hp + Math.round(dmg * H.lifesteal / 100));
    return H.hp - before;
  }
  const leechTxt = n => (n ? `, вампіризм +${n} HP` : "");
  // Друга сокира Берсерка: { name, delta } — на скільки атака другої сокири відрізняється від першої
  function dualOf(ms) {
    const d = RPG.dualWieldInfo ? RPG.dualWieldInfo(ms) : null;
    return d ? { name: d.name, delta: d.offAtk - d.mainAtk } : null;
  }

  // Групові пасивки: бонус героя з group: true отримують і всі інші герої (свій — уже в calcStats).
  // Однакова пасивка від кількох героїв не складається — береться найвищий рівень.
  function applyGroupPassives(heroes) {
    const best = {};   // skillId → { lvl, from }
    for (const H of heroes) {
      for (const [id, lvl] of Object.entries(H.skillLevels)) {
        const sk = RPG.SKILLS?.[id];
        if (!sk?.group || sk.kind !== "passive" || lvl < 1) continue;
        if (!best[id] || best[id].lvl < lvl) best[id] = { lvl, from: H };
      }
    }
    const PCT = { hpPct: "hp", mpPct: "mp", attackPct: "attack", magicPct: "magic",
                  defensePct: "defense", magicDefensePct: "magicDefense", speedPct: "speed" };
    for (const [id, { lvl, from }] of Object.entries(best)) {
      for (const H of heroes) {
        if (H === from || (H.skillLevels[id] || 0) >= lvl) continue;   // свій бонус уже врахований
        const own = H.skillLevels[id] || 0;
        for (const [k, pair] of Object.entries(RPG.SKILLS[id].effects)) {
          const v = RPG.skillValue(pair, lvl) - (own ? RPG.skillValue(pair, own) : 0);
          if (PCT[k]) H.base[PCT[k]] *= 1 + v / 100;
          else H.base[k] = (H.base[k] || 0) + v;
        }
      }
    }
  }

  function makeEnemy(spec, label) {
    const base = RPG.enemyFromSpec ? RPG.enemyFromSpec(spec) : RPG.getEnemy(spec.id, spec.champion);
    const enemy = label ? { ...base, name: label } : base;
    return {
      side: "enemy", id: spec.id, champion: !!(spec.champion && !base.noChampion), enemy, name: enemy.name,
      hp: enemy.stats.hp, mp: enemy.stats.mp || 0, turn: 0,
      dot: null, defDown: 0, atkDown: { pct: 0, turns: 0 }, frozen: 0,
      undead: !!enemy.undead,
      range: RPG.enemyRange ? RPG.enemyRange(enemy) : 1,
      move: RPG.enemyMove ? RPG.enemyMove(enemy) : null,
      pos: { r: 1, c: 5 }
    };
  }

  // Характеристики героя з урахуванням бафів
  function heroNow(H) {
    const h = { ...H.base };
    const sum = {};
    for (const b of Object.values(H.buffs)) {
      for (const [k, v] of Object.entries(b.effects)) sum[k] = (sum[k] || 0) + v;
    }
    if (sum.attackPct) h.attack *= 1 + sum.attackPct / 100;
    if (sum.magicPct) h.magic *= 1 + sum.magicPct / 100;
    if (sum.defensePct) h.defense *= 1 + sum.defensePct / 100;
    if (sum.magicDefensePct) h.magicDefense *= 1 + sum.magicDefensePct / 100;
    if (sum.crit) h.crit += sum.crit;
    if (sum.dodge) h.dodge = (h.dodge || 0) + sum.dodge;
    if (sum.speedPct) h.speed = Math.min(h.speed * (1 + sum.speedPct / 100), RPG.STAT_CAP.speed * 2);
    return h;
  }

  const speedOf = u => Math.max(0.5, u.side === "hero" ? heroNow(u).speed : (u.enemy.stats.speed || 1));
  const dist = (A, B) => cellDist(A.pos, B.pos);
  const CURSE_PCT = 10;
  const enemyDefense = E => E.enemy.stats.defense * (1 - Math.min(90, E.defDown + (E.curse > 0 ? CURSE_PCT : 0)) / 100);
  const enemyMagDef = E => E.enemy.stats.magicDefense ?? Math.floor(E.enemy.stats.defense / 2);
  const atkDownOf = E => (E.atkDown.turns > 0 ? E.atkDown.pct : 0);

  // ---------- Дії героя ----------
  // Що герой робить зараз: { type: "skill" | "spell" | "attack", id?, sk?, lvl? }
  function resolveAction(H) {
    const action = H.queue[H.qi % H.queue.length];
    const sk = RPG.SKILLS?.[action];
    if (sk) {
      const lvl = H.skillLevels[action] || 0;
      const weaponOk = RPG.skillWeaponOk ? RPG.skillWeaponOk(sk, H.weapon.type) : sk.weapon === H.weapon.type;
      if (lvl >= 1 && sk.kind !== "passive" && weaponOk && H.weapon.type && H.mp >= sk.mp) {
        return { type: "skill", id: action, sk, lvl };
      }
    }
    if (action === "spell" && H.weapon.type === "staff" && H.mp >= SPELL_COST) return { type: "spell" };
    return { type: "attack" };
  }

  function rangeOf(act, H) {
    const range = RPG.actionRange || ((t, m) => (t === "bow" ? 3 : m && t === "staff" ? 2 : 1));
    if (act.type === "spell") return range("staff", true);
    if (act.type === "skill") return range(H.weapon.type, act.sk.magic);
    return range(H.weapon.type, false);
  }

  // Один удар навички по ворогу E. Повертає рядок шкоди ("123 (крит)" / "промах")
  function skillHit(H, E, sk, lvl) {
    const h = heroNow(H);
    const es = E.enemy.stats;
    if (!sk.magic && roll(es.dodge)) return { text: "промах", crit: false };
    let mult = RPG.skillValue(sk.mult, lvl);
    if (sk.vsDefDown && E.defDown > 0) mult *= sk.vsDefDown;
    if (sk.vsUndead && E.undead) mult *= 1 + sk.vsUndead / 100;
    const crit = roll(h.crit + RPG.skillValue(sk.critBonus, lvl));
    const blocked = roll(sk.magic ? es.blockMag : es.blockPhys);
    const raw = (sk.magic ? h.magic : h.attack) * mult * variance() * runeEliteMult(H, E);
    const dmg = finishHit(mitigate(raw, sk.magic ? enemyMagDef(E) : penDef(H, E)), crit, blocked);
    E.hp = Math.max(0, E.hp - dmg);
    const lh = leech(H, dmg);
    const rt = sk.magic ? "" : runeOnHit(H, E, dmg);
    return { text: dmg + (crit ? " (крит)" : "") + (lh ? ` (+${lh} HP)` : "") + rt, crit };
  }

  // Атакувальна навичка. pool — вороги поруч (для spread / splash), уже без заморожених
  function skillAttack(H, E, sk, lvl, pool = [E]) {
    const hits = sk.hits || 1;
    const log = new Map();          // ворог → рядки шкоди
    let anyCrit = false;
    const note = (T, r) => { if (!log.has(T)) log.set(T, []); log.get(T).push(r.text); anyCrit = anyCrit || r.crit; };
    if (sk.spread) {
      // Удари по колу: ціль, наступний ворог, … і знову по колу (мертвих пропускаємо)
      const order = [E, ...pool.filter(T => T !== E)];
      let k = 0;
      for (let i = 0; i < hits; i++) {
        const alive = order.filter(T => T.hp > 0);
        if (!alive.length) break;
        const T = alive[k % alive.length];
        note(T, skillHit(H, T, sk, lvl));
        k++;
      }
    } else {
      for (let i = 0; i < hits && E.hp > 0; i++) note(E, skillHit(H, E, sk, lvl));
      if (sk.splash) for (const T of pool) if (T !== E && T.hp > 0) note(T, skillHit(H, T, sk, lvl));
    }
    const parts = [...log.entries()].map(([T, d]) => (log.size > 1 ? `«${T.name}» ${d.join(" + ")}` : d.join(" + ")));
    let text = log.size > 1
      ? `${H.name} — «${sk.name}» (−${sk.mp} MP): ${parts.join("; ")} шкоди`
      : `${H.name} — «${sk.name}» (−${sk.mp} MP) по «${E.name}»: ${parts[0] || "промах"} шкоди`;
    if (sk.vsUndead && E.undead) text += " (нежить!)";
    if (sk.vsDefDown && E.defDown > 0) text += " (захист ворога пробито — подвійна сила)";
    if (sk.dot && E.hp > 0) {
      E.dot = { dmg: Math.round(RPG.skillValue(sk.dot, lvl)), turns: 3 };
      text += `, ${sk.school === "fire" ? "ворог горить" : "ворог отруєний"}`;
    }
    if (sk.debuff?.defensePct) {
      E.defDown = Math.max(E.defDown, RPG.skillValue(sk.debuff.defensePct, lvl));
      text += `, захист ворога −${E.defDown}%`;
    }
    if (sk.debuff?.attackPct) {
      E.atkDown = { pct: RPG.skillValue(sk.debuff.attackPct, lvl), turns: RPG.skillTurns(lvl) };
      text += `, атака ворога −${E.atkDown.pct}%`;
    }
    if (sk.freeze && E.hp > 0 && roll(RPG.skillValue(sk.freeze, lvl))) {
      E.frozen = FREEZE_TURNS;
      text += `, «${E.name}» скутий кригою на ${FREEZE_TURNS} ходи!`;
    }
    return { who: "hero", text, crit: anyCrit };
  }

  // targets — кому дається посилення (за замовчуванням собі)
  function castBuff(H, id, sk, lvl, targets = [H]) {
    const effects = {};
    for (const [k, pair] of Object.entries(sk.effects)) effects[k] = RPG.skillValue(pair, lvl);
    const turns = RPG.skillTurns(lvl, sk);
    for (const T of targets) T.buffs[id] = { effects: { ...effects }, turns };
    const eff = Object.entries(effects).map(([k, v]) => {
      const unit = ["crit", "dodge"].includes(k) ? " п." : "%";
      return `${RPG.EFFECT_NAMES?.[k] || k} ${v > 0 ? "+" : ""}${v}${unit}`;
    }).join(", ");
    const who = targets.length === 1 && targets[0] === H ? "" : ` (${targets.map(T => T.name).join(", ")})`;
    return { who: "hero", text: `${H.name} — «${sk.name}» (−${sk.mp} MP): ${eff}, ${turns} ходи${who}`, crit: false, sound: "skill:" + id };
  }

  // Лікування: targets — кого лікувати (за замовчуванням себе). Кожен отримує % від СВОГО макс. HP
  // pcts — свій % для кожної цілі (за замовчуванням усім healPct)
  function castHeal(H, sk, lvl, targets = [H], pcts = null) {
    const main = RPG.skillValue(sk.healPct, lvl) / 100;
    const parts = targets.map((T, i) => {
      const pct = pcts ? pcts[i] / 100 : main;
      const before = T.hp;
      T.hp = Math.min(T.base.hp, T.hp + Math.round(T.base.hp * pct));
      return targets.length === 1 && T === H ? `+${T.hp - before} HP` : `${T.name} +${T.hp - before} HP`;
    });
    return { who: "hero", text: `${H.name} — «${sk.name}» (−${sk.mp} MP): ${parts.join(", ")}`, crit: false, heal: true };
  }

  function basicAttack(H, E) {
    if (H.dual) return dualAttack(H, E);
    const h = heroNow(H);
    const es = E.enemy.stats;
    if (roll(es.dodge)) {
      return { who: "hero", text: `${H.name} б'є «${E.name}», але той ухиляється`, crit: false, sound: "miss" };
    }
    const crit = roll(h.crit);
    const blocked = roll(es.blockPhys);
    const dmg = finishHit(mitigate(h.attack * variance() * runeEliteMult(H, E), penDef(H, E)), crit, blocked);
    E.hp = Math.max(0, E.hp - dmg);
    const fire = runeFire(H, E);
    const lh = leech(H, dmg + fire);
    let text = H.weapon.type
      ? `${H.name} б'є (${H.weapon.name}) «${E.name}»: ${dmg} шкоди`
      : `${H.name} б'є кулаками «${E.name}»: ${dmg} шкоди`;
    if (fire) text += ` + ${fire} вогнем (Крада)`;
    if (blocked) text += " (ворог частково заблокував)";
    if (crit) text += " — КРИТ!";
    text += leechTxt(lh) + runeOnHit(H, E, dmg);
    return { who: "hero", text, crit, sound: "weapon:" + (H.weapon.type || "") };
  }

  // Дві сокири Берсерка: удар основною, одразу — другою; кожна на 80% своєї атаки
  function dualAttack(H, E) {
    const h = heroNow(H);
    const es = E.enemy.stats;
    const parts = [];
    let anyCrit = false, healed = 0;
    for (const [atk, name] of [[h.attack, H.weapon.name], [Math.max(1, h.attack + H.dual.delta), H.dual.name]]) {
      if (E.hp <= 0) break;
      if (roll(es.dodge)) { parts.push(`${name} — промах`); continue; }
      const crit = roll(h.crit);
      anyCrit = anyCrit || crit;
      const blocked = roll(es.blockPhys);
      const dmg = finishHit(mitigate(atk * DUAL_MULT * variance() * runeEliteMult(H, E), penDef(H, E)), crit, blocked);
      E.hp = Math.max(0, E.hp - dmg);
      const fire = runeFire(H, E);
      healed += leech(H, dmg + fire);
      parts.push(`${name} ${dmg}${fire ? ` +${fire} вогнем` : ""}${crit ? " (крит)" : ""}${blocked ? " (блок)" : ""}${runeOnHit(H, E, dmg)}`);
    }
    return { who: "hero", text: `${H.name} б'є двома сокирами «${E.name}»: ${parts.join(" + ")} шкоди${leechTxt(healed)}`, crit: anyCrit, sound: "weapon:axe" };
  }

  function spellAttack(H, E) {
    const h = heroNow(H);
    H.mp -= SPELL_COST;
    const crit = roll(h.crit);
    const blocked = roll(E.enemy.stats.blockMag);
    const dmg = finishHit(mitigate(h.magic * SPELL_MULT * variance() * runeEliteMult(H, E), enemyMagDef(E)), crit, blocked);
    E.hp = Math.max(0, E.hp - dmg);
    const lh = leech(H, dmg);
    let text = `${H.name} кидає «Іскру» (−${SPELL_COST} MP) в «${E.name}»: ${dmg} шкоди${leechTxt(lh)}`;
    if (blocked) text += " (ворог частково заблокував)";
    if (crit) text += " — КРИТ!";
    return { who: "hero", text, crit, sound: "fire" };
  }

  // ---------- Дії ворога ----------
  function enemyMagicHit(E, H, name, mp, mult) {
    const hero = heroNow(H);
    E.mp -= mp;
    const crit = roll(E.enemy.stats.crit);
    const blocked = roll(hero.blockMag);
    const dmg = runeUndead(H, E, finishHit(mitigate((E.enemy.stats.magic || 0) * mult * (1 - atkDownOf(E) / 100) * variance(), hero.magicDefense), crit, blocked));
    H.hp = Math.max(0, H.hp - dmg);
    let text = `${E.name} — «${name}» (−${mp} MP) по ${H.name}: ${dmg} магічної шкоди`;
    if (blocked) text += ` (${H.name} частково блокує)`;
    if (crit) text += " — КРИТ!";
    if (H.hp > 0) text += runeOnStruck(H, E, dmg);
    return { who: "enemy", text, crit, sound: "dark" };
  }

  function enemyPhysHit(E, H, moveName, mult) {
    const hero = heroNow(H);
    if (roll(hero.dodge)) {
      return { who: "enemy", text: `${E.name} ${moveName ? `— «${moveName}»` : "кидається"}, але ${H.name} ухиляється!`, crit: false, sound: "miss" };
    }
    const crit = roll(E.enemy.stats.crit);
    const blocked = roll(hero.blockPhys);
    const dmg = runeUndead(H, E, finishHit(mitigate(E.enemy.stats.attack * (mult || 1) * (1 - atkDownOf(E) / 100) * variance(), hero.defense), crit, blocked));
    H.hp = Math.max(0, H.hp - dmg);
    const verb = E.enemy.verb || "кусає";
    let text = moveName
      ? `${E.name} — «${moveName}» по ${H.name}: ${dmg} шкоди`
      : `${E.name} ${verb} ${H.name}: ${dmg} шкоди`;
    if (blocked) text += ` (${H.name} блокує частину удару)`;
    if (crit) text += " — КРИТ!";
    if (H.hp > 0) text += runeOnStruck(H, E, dmg);
    return { who: "enemy", text, crit, sound: `enemy:${E.enemy.weapon || ""}:${verb}` };
  }

  // ---------- Бій групи проти кількох ворогів ----------
  // Однакові вороги отримують номери: «Зелений слайм 1», «Зелений слайм 2»
  function enemyLabels(specs) {
    const count = {};
    for (const s of specs) count[s.id] = (count[s.id] || 0) + 1;
    const seen = {};
    return specs.map(s => {
      if (count[s.id] < 2) return null;
      seen[s.id] = (seen[s.id] || 0) + 1;
      return `${RPG.getEnemy(s.id, s.champion).name} ${seen[s.id]}`;
    });
  }

  // Розклад ходів одного раунду
  function roundSchedule(units) {
    const speeds = units.map(speedOf);
    const end = Math.max(...speeds.map(s => 1 / s)) + 1e-9;
    const slots = [];
    units.forEach((u, idx) => {
      for (let n = 1; n / speeds[idx] <= end && n <= 6; n++) {
        slots.push({ u, t: n / speeds[idx], n, hero: u.side === "hero", idx });
      }
    });
    return slots.sort((a, b) => a.t - b.t || a.n - b.n || (b.hero - a.hero) || a.idx - b.idx);
  }

  // members — «вигляди» героїв (party.js → memberSave), живі; enemySpecs — [{ id, champion }]
  // opts.heroPos — [{ r, c }] ЛОКАЛЬНА розстановка героїв у зоні 3 × 3 (у порядку members);
  //   без неї — автоматична. opts.corner — кут героїв (0…3); без нього — випадковий.
  // Вороги стають за placeFoes(enemySpecs, corner) — у протилежному куті.
  // Повертає { win, draw, rounds, heroes: [{ hp, mp, dead }], enemies: [{ id, champion, name, exp }],
  //            events, enemyIds, heroHp, heroMp, champion, heroPos, foePos, corner }
  //   (heroPos / foePos — уже клітинки поля)
  // opts.foePos — готові стартові місця ворогів (placeFoesFree, як показано на сторінці);
  //   без них або якщо вони некоректні — розставляються тут.
  // opts.obstacles — перешкоди (makeObstacles); без них поле чисте. Повертаються в result.obstacles.
  // кожна подія: { who: "hero" | "enemy" | "info" | "round", text, crit,
  //               heroes: [{hp, mp, pos: {r, c}}], enemies: [{hp, mp, pos: {r, c}}],
  //               actor: { side: "hero" | "enemy", i } | null, target: { side, i } | null,
  //               heroHp, heroMp, enemyHp, enemyMp,
  //               sound? — який звук грати (audio.js → battleSound): "skill:<id>", "weapon:<тип>",
  //                        "enemy:<зброя>:<дієслово>" або назва звуку ("miss", "dark", "death"…) }
  function simulatePartyBattle(members, enemySpecs, opts = {}) {
    const heroes = members.map(makeHero);
    const labels = enemyLabels(enemySpecs);
    const foes = enemySpecs.map((spec, i) => makeEnemy(spec, labels[i]));
    const corner = Number.isInteger(opts.corner) ? (opts.corner & 3) : randomCorner();
    const heroPos = placeHeroes(members, opts.heroPos || []).map(p => fieldPos(p, corner));
    const obstacles = (opts.obstacles || []).filter(o => inField(o) && OBSTACLE_KINDS[o.kind]);
    const walls = new Set(obstacles.map(keyOf));
    // Вороги: готові місця з opts.foePos (те, що гравець бачив на полі до бою), якщо вони коректні;
    // інакше — розставляємо тут
    const heroKeys = new Set(heroPos.map(keyOf));
    const given = opts.foePos;
    const givenOk = Array.isArray(given) && given.length === enemySpecs.length &&
      given.every(p => inField(p) && !walls.has(keyOf(p)) && !heroKeys.has(keyOf(p))) &&
      new Set(given.map(keyOf)).size === given.length;
    const foePos = givenOk ? given.map(p => ({ r: p.r, c: p.c })) : placeFoesFree(enemySpecs, corner, obstacles);
    const foeSpread = givenOk ? (given.spread || null) : foePos.spread;
    heroes.forEach((h, i) => { h.pos = { ...heroPos[i] }; h.idx = i; });
    applyGroupPassives(heroes);
    foes.forEach((f, i) => { f.pos = { ...foePos[i] }; f.idx = i; });
    // Перешкоди: усі — не стати; великі (block) — ще й не видно крізь них
    const sight = new Set(obstacles.filter(o => OBSTACLE_KINDS[o.kind].block).map(keyOf));
    // Чи дістає U до T з клітинки from: відстань ≤ reach, а для дальньої дії — ще й пряма видимість
    const canHitFrom = (from, T, reach) => {
      const d = cellDist(from, T.pos);
      return d <= reach && (d <= 1 || hasSight(from, T.pos, sight));
    };
    const events = [];
    const cur = { actor: null, target: null };   // хто діє і по кому (для поля бою на сторінці)
    const ref = u => (u ? { side: u.side, i: u.idx } : null);
    const push = ev => events.push(Object.assign(ev, {
      heroes: heroes.map(h => ({ hp: h.hp, mp: h.mp, pos: { ...h.pos } })),
      enemies: foes.map(f => ({ hp: f.hp, mp: f.mp, pos: { ...f.pos } })),
      actor: ev.actor !== undefined ? ev.actor : ref(cur.actor),
      target: ev.target !== undefined ? ev.target : ref(cur.target),
      heroHp: heroes[0].hp, heroMp: heroes[0].mp, enemyHp: foes[0].hp, enemyMp: foes[0].mp
    }));
    const aliveH = () => heroes.filter(h => h.hp > 0);
    const aliveE = () => foes.filter(f => f.hp > 0);
    const targetE = () => aliveE().filter(f => !(f.frozen > 0));   // заморожених бити не можна
    const going = () => aliveH().length > 0 && aliveE().length > 0;
    const minDist = () => Math.min(...aliveH().flatMap(h => aliveE().map(e => dist(h, e))));
    const multi = heroes.length > 1;

    // Найближчий з тих, до кого дістає (reach) і кого видно; при рівній відстані — перший за списком
    function nearestInReach(U, list, reach) {
      let best = null, bd = Infinity;
      for (const T of list) {
        const d = dist(U, T);
        if (d < bd && canHitFrom(U.pos, T, reach)) { best = T; bd = d; }
      }
      return best;
    }
    // Хід руху: найкоротшим шляхом (пошук у ширину, 8 напрямків) в обхід перешкод і учасників
    // до найближчої клітинки, звідки можна вдарити когось із targets; за хід — до MOVE_STEPS клітинок.
    // Якщо такої клітинки не дістатись (усе заступили) — крок «просто ближче», як раніше.
    // Повертає нову відстань до найближчого суперника або null (немає куди)
    function moveToward(U, targets, reach = 1) {
      const busy = new Set([...aliveH(), ...aliveE()].filter(x => x !== U).map(x => keyOf(x.pos)));
      const startKey = keyOf(U.pos);
      const prev = new Map([[startKey, null]]);
      const queue = [{ r: U.pos.r, c: U.pos.c }];
      let goal = null;
      while (queue.length && !goal) {
        const p = queue.shift();
        for (let dr = -1; dr <= 1 && !goal; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const q = { r: p.r + dr, c: p.c + dc }, k = keyOf(q);
          if (!inField(q) || prev.has(k) || walls.has(k) || busy.has(k)) continue;
          prev.set(k, keyOf(p));
          if (targets.some(T => canHitFrom(q, T, reach))) { goal = q; break; }
          queue.push(q);
        }
      }
      if (!goal) {
        let d = null;
        for (let i = 0; i < MOVE_STEPS; i++) {
          const nd = stepToward(U, targets);
          if (nd === null) break;
          d = nd;
          if (d <= reach) break;
        }
        return d;
      }
      const path = [];
      for (let k = keyOf(goal); k && k !== startKey; k = prev.get(k)) path.unshift(k);
      const [r, c] = path[Math.min(MOVE_STEPS, path.length) - 1].split(":").map(Number);
      U.pos = { r, c };
      return Math.min(...targets.map(T => cellDist(U.pos, T.pos)));
    }
    // Крок на 1 клітинку до найближчого суперника. Повертає нову відстань або null (немає куди)
    function stepToward(U, targets) {
      const busy = new Set([...aliveH(), ...aliveE()].filter(x => x !== U).map(x => keyOf(x.pos)));
      const score = p => {
        let d = Infinity, m = Infinity;
        for (const T of targets) {
          const cd = cellDist(p, T.pos), sd = stepDist(p, T.pos);
          if (cd < d || (cd === d && sd < m)) { d = cd; m = sd; }
        }
        return [d, m];
      };
      const [d0, m0] = score(U.pos);
      let best = null, bs = [d0, m0];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const p = { r: U.pos.r + dr, c: U.pos.c + dc };
        if (!inField(p) || busy.has(keyOf(p)) || walls.has(keyOf(p))) continue;
        const sc = score(p);
        // лише якщо стало ближче (або так само за клітинками, але менше кроків) — без ходіння по колу
        if (sc[0] < bs[0] || (sc[0] === bs[0] && sc[1] < bs[1])) { best = p; bs = sc; }
      }
      if (!best) return null;
      U.pos = best;
      return bs[0];
    }

    const heroNames = heroes.map(h => h.name).join(", ");
    const foeNames = foes.map(f => `«${f.enemy.name}» (рівень ${f.enemy.level})${f.enemy.boss ? " — БОС" : ""}`).join(", ");
    const spreadTxt = foes.length > 1 && foeSpread === "pack" ? " Вороги тримаються купою."
      : foes.length > 1 && foeSpread === "scatter" ? " Вороги розсипались по полю." : "";
    push({ who: "info", text: `Бій починається: ${heroNames} проти ${foeNames}. До найближчого ворога — ${minDist()} кл.${spreadTxt}` });

    // Хто вже походив у поточному раунді (для «Молитви зцілення» жерця)
    let roundActed = new Set();
    const hurt = h => h.hp > 0 && h.hp < h.base.hp;
    const mostWounded = () => aliveH().filter(hurt).sort((a, b) => a.hp / a.base.hp - b.hp / b.base.hp)[0] || null;

    // Лікувальна навичка героя. Повертає false, якщо жрець вирішив чекати
    function heroHeal(H, act) {
      const area = act.sk.area || "self";
      let targets = [H];
      let pcts = null;
      if (area === "near") targets = aliveH().filter(a => dist(a, H) <= 1);
      else if (area === "group") targets = aliveH();
      else if (area === "wounded") {
        const w = mostWounded();
        if (w) { targets = [w]; cur.target = w; }
        else if (aliveE().some(E => !roundActed.has(E))) {
          // Усі здорові, а вороги ще не ходили — чекаємо першого удару
          H.healWait = act;
          push({ who: "hero", move: true, text: `${H.name} готує «${act.sk.name}» і чекає удару ворога`, crit: false });
          return false;
        }
      }
      if (act.sk.extra) {
        // Цілюща хвиля: себе + до 3 випадкових союзників, кожен слабше
        const others = aliveH().filter(a => a !== H).sort(() => Math.random() - 0.5).slice(0, act.sk.extra.length);
        const grow = act.sk.healPct[1] * (act.lvl - 1);
        targets = [H, ...others];
        pcts = [RPG.skillValue(act.sk.healPct, act.lvl), ...others.map((_, i) => act.sk.extra[i] + grow)];
      }
      H.mp -= act.sk.mp;
      H.qi++;
      push(Object.assign(castHeal(H, act.sk, act.lvl, targets, pcts), { sound: "skill:" + act.id }));
      return true;
    }

    // Скільки ворогів зараз дістає героя T (для «Кам'яної шкіри»)
    const attackersOf = T => targetE().filter(E => dist(E, T) <= E.range).length;

    // Посилення: на себе, на союзників поруч (near) або на союзника під ударами (guard)
    function heroBuff(H, act) {
      const sk = act.sk;
      let targets = [H];
      if (sk.area === "near") targets = aliveH().filter(a => dist(a, H) <= 1);
      else if (sk.area === "guard") {
        const ally = aliveH().map(a => ({ a, n: attackersOf(a) })).filter(x => x.n >= 2)
          .sort((x, y) => y.n - x.n || (x.a === H ? -1 : 0))[0];
        if (ally) { targets = [ally.a]; cur.target = ally.a; }
      }
      H.mp -= sk.mp;
      H.qi++;
      push(castBuff(H, act.id, sk, act.lvl, targets));
      if (sk.shadow) shadowStrike(H, act);
    }

    // «Тінь» розбійника: за спину найслабшого ворога (до 3 кл.) і отруйний удар
    function shadowStrike(H, act) {
      const E = targetE().filter(T => dist(H, T) <= 3).sort((a, b) => a.hp - b.hp)[0];
      if (!E) return;
      const busy = new Set([...aliveH(), ...aliveE()].filter(x => x !== H).map(x => keyOf(x.pos)));
      // «Спина» — клітинки з боку ворога, протилежного розбійнику (поле велике, кути різні)
      const sr = Math.sign(E.pos.r - H.pos.r), sc = Math.sign(E.pos.c - H.pos.c);
      const behind = [];
      if (sr || sc) behind.push({ r: E.pos.r + sr, c: E.pos.c + sc });
      if (sc) behind.push({ r: E.pos.r, c: E.pos.c + sc }, { r: E.pos.r - 1, c: E.pos.c + sc }, { r: E.pos.r + 1, c: E.pos.c + sc });
      if (sr) behind.push({ r: E.pos.r + sr, c: E.pos.c }, { r: E.pos.r + sr, c: E.pos.c - 1 }, { r: E.pos.r + sr, c: E.pos.c + 1 });
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) behind.push({ r: E.pos.r + dr, c: E.pos.c + dc });
      const spot = behind.find(p => inField(p) && !busy.has(keyOf(p)) && !walls.has(keyOf(p)));
      if (!spot) return;
      H.pos = spot;
      cur.target = E;
      const h = heroNow(H);
      const es = E.enemy.stats;
      const sh = act.sk.shadow;
      let text;
      if (roll(es.dodge)) text = `${H.name} виринає з тіні за спиною «${E.name}», але той ухиляється`;
      else {
        const crit = roll(h.crit);
        const dmg = finishHit(mitigate(h.attack * variance(), enemyDefense(E)), crit, roll(es.blockPhys));
        E.hp = Math.max(0, E.hp - dmg);
        text = `${H.name} виринає з тіні за спиною «${E.name}»: ${dmg} шкоди${crit ? " (крит)" : ""}${leechTxt(leech(H, dmg))}`;
        if (E.hp > 0) {
          E.dot = { dmg: Math.max(1, Math.round(es.hp * sh.pct / 100)), turns: sh.turns };
          text += `, отрута ${E.dot.dmg} × ${sh.turns} ходів`;
        }
      }
      push({ who: "hero", text, crit: false, sound: "weapon:dagger" });
      if (E.hp <= 0 && foes.length > 1) push({ who: "info", text: `«${E.name}» переможений.`, sound: "death" });
    }

    // Після удару ворога: жрець, що чекав, одразу лікує пораненого
    function answerWaitingHealers() {
      for (const H of aliveH()) {
        const act = H.healWait;
        if (!act) continue;
        const w = mostWounded();
        if (!w) continue;
        delete H.healWait;
        if (H.mp < act.sk.mp || H.stun > 0) continue;
        H.mp -= act.sk.mp;
        H.qi++;
        push(Object.assign(castHeal(H, act.sk, act.lvl, [w]), { actor: ref(H), target: ref(w), sound: "skill:" + act.id }));
      }
    }

    // --- Хід героя ---
    function heroTurn(H) {
      if (H.stun > 0) {
        H.stun--;
        push({ who: "hero", text: `${H.name} ${H.g === "f" ? "застрягла" : "застряг"} у слизу й пропускає хід`, crit: false, sound: "squish" });
        return;
      }
      const act = resolveAction(H);
      if (act.type === "skill" && act.sk.kind === "heal") { heroHeal(H, act); return; }
      if (act.type === "skill" && act.sk.kind === "buff") { heroBuff(H, act); return; }
      const reach = rangeOf(act, H);
      const target = nearestInReach(H, targetE(), reach);
      if (!target) {
        if (!targetE().length) { push({ who: "hero", move: true, text: `${H.name} чекає, поки розтане крига`, crit: false }); return; }
        const d = moveToward(H, targetE(), reach);
        if (d !== null) push({ who: "hero", move: true, text: `${H.name} просувається вперед (до ворога ${d} кл.)`, crit: false });
        else push({ who: "hero", move: true, text: `${H.name} чекає — шлях уперед зайнятий`, crit: false });
        return;
      }
      cur.target = target;
      H.qi++;
      const before = new Set(aliveE());
      if (act.type === "skill") {
        H.mp -= act.sk.mp;
        const sk = act.sk;
        const pool = sk.spread === "adjacent" ? targetE().filter(T => dist(H, T) <= 1)
          : (sk.spread === "target" || sk.splash) ? targetE().filter(T => dist(target, T) <= (sk.splash || 1))
          : [target];
        push(Object.assign(skillAttack(H, target, sk, act.lvl, pool), { sound: "skill:" + act.id }));
      }
      else if (act.type === "spell") push(spellAttack(H, target));
      else push(basicAttack(H, target));
      if (foes.length > 1) for (const T of before) if (T.hp <= 0) push({ who: "info", text: `«${T.name}» переможений.`, sound: "death" });
    }

    // --- Хід ворога ---
    function enemyTurn(E, firstInRound) {
      if (E.stunned > 0) {
        E.stunned--;
        push({ who: "enemy", text: `«${E.name}» оглушений і пропускає хід`, crit: false });
        return;
      }
      if (E.frozen > 0) {
        E.frozen--;
        push({ who: "enemy", text: E.frozen > 0 ? `«${E.name}» скутий кригою й пропускає хід`
                                                : `«${E.name}» пропускає хід — крига починає танути`, crit: false });
        return;
      }
      if (firstInRound && E.dot && E.dot.turns > 0) {
        E.hp = Math.max(0, E.hp - E.dot.dmg);
        E.dot.turns--;
        push({ who: "hero", text: `Отрута / вогонь: ${E.dot.dmg} шкоди «${E.name}»`, crit: false, sound: "hit" });
        if (E.hp <= 0) { if (foes.length > 1) push({ who: "info", text: `«${E.name}» переможений.`, sound: "death" }); return; }
      }
      E.turn++;
      const inReach = () => nearestInReach(E, aliveH(), E.range);
      const hit = (H, ev) => {
        cur.target = H;
        push(ev);
        if (H.hp <= 0 && multi && aliveH().length) push({ who: "info", text: `${H.name} падає без сил…` });
        answerWaitingHealers();
      };

      // Навички боса: кожен 3-й власний хід, по черзі
      const skills = E.enemy.skills || [];
      if (skills.length && E.turn % 3 === 0) {
        const sk = skills[(E.turn / 3 - 1) % skills.length];
        if (E.mp >= sk.mp) {
          if (sk.kind === "heal") {
            E.mp -= sk.mp;
            const before = E.hp;
            E.hp = Math.min(E.enemy.stats.hp, E.hp + Math.round(E.enemy.stats.hp * sk.healPct));
            push({ who: "enemy", text: `${E.name} — «${sk.name}» (−${sk.mp} MP): відновлює ${E.hp - before} HP`, crit: false, sound: "heal" });
            return;
          }
          const H = inReach();
          if (H) {
            const ev = enemyMagicHit(E, H, sk.name, sk.mp, sk.mult || 1);
            if (sk.kind === "stun" && H.hp > 0) { H.stun = 1; ev.text += `, ${H.name} ${H.g === "f" ? "застрягла" : "застряг"} у слизу й пропустить хід`; }
            hit(H, ev);
            return;
          }
        }
      }

      const H = inReach();
      if (!H) {
        const d = moveToward(E, aliveH(), E.range || 1);
        if (d !== null) push({ who: "enemy", move: true, text: `${E.name} наближається (до героя ${d} кл.)`, crit: false });
        return;
      }
      const sp = E.enemy.spell;
      if (sp && E.mp >= sp.mp && Math.random() < (sp.chance ?? 0.4)) { hit(H, enemyMagicHit(E, H, sp.name, sp.mp, sp.mult)); return; }
      const mv = E.move;
      if (mv && Math.random() < (mv.chance || 0)) { hit(H, enemyPhysHit(E, H, mv.name, mv.mult)); return; }
      hit(H, enemyPhysHit(E, H, null, 1));
    }

    let round = 0;
    while (going() && round < MAX_ROUNDS) {
      round++;
      push({ who: "round", text: `Раунд ${round} · до найближчого ворога ${minDist()} кл.` });
      const acted = new Set();
      roundActed = acted;
      for (const slot of roundSchedule([...aliveH(), ...aliveE()])) {
        if (!going()) break;
        const u = slot.u;
        if (u.hp <= 0) continue;
        cur.actor = u; cur.target = null;
        if (u.side === "hero") heroTurn(u);
        else enemyTurn(u, !acted.has(u));
        cur.actor = cur.target = null;
        acted.add(u);
      }
      // Кінець раунду — бафи й послаблення слабшають; жрець, що так і не дочекався удару, перестає чекати
      for (const h of heroes) {
        delete h.healWait;
        for (const [id, b] of Object.entries(h.buffs)) {
          if (--b.turns <= 0) {
            delete h.buffs[id];
            if (going() && h.hp > 0) push({ who: "info", text: `${multi ? h.name + ": " : ""}дія «${RPG.SKILLS[id].name}» закінчилась.` });
          }
        }
      }
      for (const f of foes) { if (f.atkDown.turns > 0) f.atkDown.turns--; if (f.curse > 0) f.curse--; }
    }

    const win = aliveE().length === 0;
    const draw = !win && aliveH().length > 0;
    const many = foes.length > 1;
    if (win) push({ who: "info", text: `${many ? "Усіх ворогів" : `«${foes[0].enemy.name}»`} переможено за ${round} раунд(ів).` });
    else if (draw) push({ who: "info", text: `${many ? "Вороги втекли" : `«${foes[0].enemy.name}» втік`} із бою.` });
    else push({ who: "info", text: multi ? "Уся група загинула…" : `${heroes[0].name} ${heroes[0].g === "f" ? "загинула" : "загинув"}…` });

    return {
      win, draw, rounds: round, events,
      heroes: heroes.map(h => ({ hp: h.hp, mp: h.mp, dead: h.hp <= 0 })),
      enemies: foes.map(f => ({ id: f.id, champion: f.champion, name: f.enemy.name, exp: f.enemy.exp })),
      enemyIds: foes.map(f => f.id),
      heroHp: heroes[0].hp, heroMp: heroes[0].mp,
      champion: foes.some(f => f.champion),
      heroPos, foePos, corner, obstacles, foeSpread
    };
  }

  // Бій одного героя з одним ворогом
  function simulateBattle(save, enemyId, champion = false) {
    const specs = [{ id: enemyId, champion }];
    if (RPG.equipFoes) RPG.equipFoes(specs, [save]);
    const r = simulatePartyBattle([save], specs);
    return Object.assign(r, { enemyId });
  }

  // Скільки ворогів може вийти проти групи (звичайні бої, не данж):
  // від половини групи (округлення вгору) до розміру групи, але не більше 6.
  // Кожна кількість у цьому діапазоні — з однаковою ймовірністю.
  const MAX_FOES = 6;
  function enemyGroupRange(members) {
    const n = Math.max(1, Math.min(MAX_FOES, members.length));
    return { min: Math.ceil(n / 2), max: n };
  }
  // Сумісність: верхня межа діапазону
  function enemyGroupCap(members) { return enemyGroupRange(members).max; }

  // Ворогів у бою: від min до max (випадково), бос — не більше одного.
  // groupSize — число героїв (або { min, max }).
  // Якщо випав другий бос — замість нього звичайний ворог локації, щоб кількість не зменшувалась.
  // members — герої групи: під їхній GS гуманоїди й боси отримують спорядження (monstergear.js)
  function rollEnemyGroup(locationId, heroLevel, groupSize, members = null) {
    const range = typeof groupSize === "object" && groupSize
      ? groupSize
      : enemyGroupRange({ length: groupSize || 1 });
    const min = Math.max(1, range.min), max = Math.max(min, range.max);
    const n = min + Math.floor(Math.random() * (max - min + 1));
    const specs = [];
    let boss = false;
    for (let i = 0; i < n; i++) {
      let id = boss ? RPG.pickEnemy(locationId, heroLevel, { noBoss: true }) : RPG.pickEnemy(locationId, heroLevel);
      if (!id) continue;
      if (RPG.ENEMIES[id]?.boss) boss = true;
      specs.push({ id, champion: RPG.rollChampion(id) });
    }
    if (members && RPG.equipFoes) RPG.equipFoes(specs, members);
    return specs;
  }

  Object.assign(RPG, { simulateBattle, simulatePartyBattle, rollEnemyGroup, enemyGroupCap, enemyGroupRange, roundSchedule, BATTLE_START_DISTANCE: START_DISTANCE,
    BATTLE_FIELD: FIELD, placeHeroes, placeFoes, placeFoesLocal, fieldPos, zoneCells, randomCorner, oppositeCorner,
    makeObstacles, hasSight, OBSTACLE_KINDS, placeFoesFree });
})(window.RPG);
