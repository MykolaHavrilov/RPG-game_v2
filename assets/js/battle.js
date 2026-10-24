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
// ПОЛЕ БОЮ 3 × 8 (FIELD)
//   3 клітинки завширшки (рядки r = 0…2), 8 завдовжки (стовпці c = 0…7):
//   c 0–2 — зона групи гравця (3×3), c 3–4 — проміжок для маневру (2×3), c 5–7 — зона ворогів (3×3).
//   Героїв розставляє гравець (game.js → вікно розстановки, save.formation),
//   ворогів — автоматично (placeFoes): ближній бій — у передній стовпець, далекий — глибше.
//   В одній клітинці — лише один учасник.
//   Відстань = більша з різниць по рядках і стовпцях (діагональ теж 1 клітинка).
//   Передні ряди стоять на відстані 3: c 2 ↔ c 5.
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
  const START_DISTANCE = 3;      // між передніми рядами (c 2 і c 5)
  const FIELD = { rows: 3, cols: 8, heroCols: [0, 1, 2], gapCols: [3, 4], enemyCols: [5, 6, 7] };
  const ROW_ORDER = [1, 0, 2];   // спершу середній рядок, потім краї

  const inField = p => p && p.r >= 0 && p.r < FIELD.rows && p.c >= 0 && p.c < FIELD.cols;
  const cellDist = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
  const stepDist = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  const keyOf = p => p.r + ":" + p.c;

  // Стовпець «за замовчуванням» для героя: ближній бій — передній (c 2), посох і лук — c 1
  function heroPrefCol(ms) {
    const t = RPG.ITEMS[RPG.refId(ms.equipment?.mainHand)]?.weaponType;
    return t === "bow" || t === "staff" ? 1 : 2;
  }

  // Розстановка героїв: saved — [{ r, c }] у порядку members (може бути неповна чи з помилками).
  // Повертає позиції в зоні групи без повторів; кому місця не дісталось — ставить автоматично.
  function placeHeroes(members, saved = []) {
    const used = new Set(), out = [];
    members.forEach((ms, i) => {
      const p = saved[i];
      if (inField(p) && FIELD.heroCols.includes(p.c) && !used.has(keyOf(p))) {
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

  // Автоматична розстановка ворогів: дальність 1 — c 5, 2 — c 6, 3 — c 7;
  // якщо стовпець зайнятий — глибше, а тоді ближче до центру поля
  function placeFoes(specs) {
    const used = new Set();
    return specs.map(spec => {
      const e = RPG.enemyFromSpec ? RPG.enemyFromSpec(spec) : RPG.getEnemy(spec.id, spec.champion);
      const range = RPG.enemyRange ? RPG.enemyRange(e) : 1;
      const pref = FIELD.enemyCols[Math.min(2, Math.max(0, range - 1))];
      const cols = [pref, ...FIELD.enemyCols.filter(c => c > pref), ...FIELD.enemyCols.filter(c => c < pref).reverse()];
      for (const c of cols) {
        const r = ROW_ORDER.find(r => !used.has(r + ":" + c));
        if (r !== undefined) { used.add(r + ":" + c); return { r, c }; }
      }
      return { r: 1, c: 7 };
    });
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
      pos: { r: 1, c: 2 }
    };
  }
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
  const enemyDefense = E => E.enemy.stats.defense * (1 - E.defDown / 100);
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
    const raw = (sk.magic ? h.magic : h.attack) * mult * variance();
    const dmg = finishHit(mitigate(raw, sk.magic ? enemyMagDef(E) : enemyDefense(E)), crit, blocked);
    E.hp = Math.max(0, E.hp - dmg);
    return { text: dmg + (crit ? " (крит)" : ""), crit };
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
    const dmg = finishHit(mitigate(h.attack * variance(), enemyDefense(E)), crit, blocked);
    E.hp = Math.max(0, E.hp - dmg);
    let text = H.weapon.type
      ? `${H.name} б'є (${H.weapon.name}) «${E.name}»: ${dmg} шкоди`
      : `${H.name} б'є кулаками «${E.name}»: ${dmg} шкоди`;
    if (blocked) text += " (ворог частково заблокував)";
    if (crit) text += " — КРИТ!";
    return { who: "hero", text, crit, sound: "weapon:" + (H.weapon.type || "") };
  }

  // Дві сокири Берсерка: удар основною, одразу — другою; кожна на 80% своєї атаки
  function dualAttack(H, E) {
    const h = heroNow(H);
    const es = E.enemy.stats;
    const parts = [];
    let anyCrit = false;
    for (const [atk, name] of [[h.attack, H.weapon.name], [Math.max(1, h.attack + H.dual.delta), H.dual.name]]) {
      if (E.hp <= 0) break;
      if (roll(es.dodge)) { parts.push(`${name} — промах`); continue; }
      const crit = roll(h.crit);
      anyCrit = anyCrit || crit;
      const blocked = roll(es.blockPhys);
      const dmg = finishHit(mitigate(atk * DUAL_MULT * variance(), enemyDefense(E)), crit, blocked);
      E.hp = Math.max(0, E.hp - dmg);
      parts.push(`${name} ${dmg}${crit ? " (крит)" : ""}${blocked ? " (блок)" : ""}`);
    }
    return { who: "hero", text: `${H.name} б'є двома сокирами «${E.name}»: ${parts.join(" + ")} шкоди`, crit: anyCrit, sound: "weapon:axe" };
  }

  function spellAttack(H, E) {
    const h = heroNow(H);
    H.mp -= SPELL_COST;
    const crit = roll(h.crit);
    const blocked = roll(E.enemy.stats.blockMag);
    const dmg = finishHit(mitigate(h.magic * SPELL_MULT * variance(), enemyMagDef(E)), crit, blocked);
    E.hp = Math.max(0, E.hp - dmg);
    let text = `${H.name} кидає «Іскру» (−${SPELL_COST} MP) в «${E.name}»: ${dmg} шкоди`;
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
    const dmg = finishHit(mitigate((E.enemy.stats.magic || 0) * mult * (1 - atkDownOf(E) / 100) * variance(), hero.magicDefense), crit, blocked);
    H.hp = Math.max(0, H.hp - dmg);
    let text = `${E.name} — «${name}» (−${mp} MP) по ${H.name}: ${dmg} магічної шкоди`;
    if (blocked) text += ` (${H.name} частково блокує)`;
    if (crit) text += " — КРИТ!";
    return { who: "enemy", text, crit, sound: "dark" };
  }

  function enemyPhysHit(E, H, moveName, mult) {
    const hero = heroNow(H);
    if (roll(hero.dodge)) {
      return { who: "enemy", text: `${E.name} ${moveName ? `— «${moveName}»` : "кидається"}, але ${H.name} ухиляється!`, crit: false, sound: "miss" };
    }
    const crit = roll(E.enemy.stats.crit);
    const blocked = roll(hero.blockPhys);
    const dmg = finishHit(mitigate(E.enemy.stats.attack * (mult || 1) * (1 - atkDownOf(E) / 100) * variance(), hero.defense), crit, blocked);
    H.hp = Math.max(0, H.hp - dmg);
    const verb = E.enemy.verb || "кусає";
    let text = moveName
      ? `${E.name} — «${moveName}» по ${H.name}: ${dmg} шкоди`
      : `${E.name} ${verb} ${H.name}: ${dmg} шкоди`;
    if (blocked) text += ` (${H.name} блокує частину удару)`;
    if (crit) text += " — КРИТ!";
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
  // opts.heroPos — [{ r, c }] розстановка героїв (у порядку members); без неї — автоматична.
  // Вороги стають за placeFoes(enemySpecs).
  // Повертає { win, draw, rounds, heroes: [{ hp, mp, dead }], enemies: [{ id, champion, name, exp }],
  //            events, enemyIds, heroHp, heroMp, champion, heroPos, foePos }
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
    const heroPos = placeHeroes(members, opts.heroPos || []);
    const foePos = placeFoes(enemySpecs);
    heroes.forEach((h, i) => { h.pos = { ...heroPos[i] }; h.idx = i; });
    applyGroupPassives(heroes);
    foes.forEach((f, i) => { f.pos = { ...foePos[i] }; f.idx = i; });
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

    // Найближчий з тих, до кого дістає (reach); при рівній відстані — перший за списком
    function nearestInReach(U, list, reach) {
      let best = null, bd = Infinity;
      for (const T of list) {
        const d = dist(U, T);
        if (d <= reach && d < bd) { best = T; bd = d; }
      }
      return best;
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
        if (!inField(p) || busy.has(keyOf(p))) continue;
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
    push({ who: "info", text: `Бій починається: ${heroNames} проти ${foeNames}. До найближчого ворога — ${minDist()} кл.` });

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
      const behind = [];
      for (const dr of [0, -1, 1]) behind.push({ r: E.pos.r + dr, c: E.pos.c + 1 });   // «спина» — далі від героїв
      for (const dr of [-1, 0, 1]) for (const dc of [0, -1]) if (dr || dc) behind.push({ r: E.pos.r + dr, c: E.pos.c + dc });
      const spot = behind.find(p => inField(p) && !busy.has(keyOf(p)));
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
        text = `${H.name} виринає з тіні за спиною «${E.name}»: ${dmg} шкоди${crit ? " (крит)" : ""}`;
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
        const d = stepToward(H, targetE());
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
        const d = stepToward(E, aliveH());
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
      for (const f of foes) if (f.atkDown.turns > 0) f.atkDown.turns--;
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
      heroPos, foePos
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
    BATTLE_FIELD: FIELD, placeHeroes, placeFoes });
})(window.RPG);
