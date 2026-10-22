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
// ДИСТАНЦІЯ
//   Бій починається з відстані 3. Відстань між героєм і ворогом: 1 (0–1), 2 (1–2), 3 (2–3).
//   Дальність дії: ближній бій (меч, кинджал, сокира, посох без заклинання, кулаки) — 1,
//   заклинання з посохом — 2, лук — 3. Вороги: data/enemies.js → range (1 / 2 / 3).
//   Хто не дістає жодного суперника — замість удару підходить на 1 ближче
//   (дія з черги не витрачається). Б'ють першого суперника, до якого дістають.
//
// ФОРМУЛИ
//   Шкода = атака × (0.85…1.15) × 100 / (100 + захист цілі)
//   «Іскра» (4 MP, лише з посохом і лише якщо стоїть у черзі) = сила магії × 1.6 проти маг. захисту.
//   Посох без заклинання в черзі б'є фізично.
//   Крит — шкода × 1.5. Блок — половина шкоди. Ухилення — удар не влучає.
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
  const START_DISTANCE = 3;

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
      base: RPG.calcStats(ms), weapon: heroWeapon(ms),
      skillLevels: { ...(ms.character.skills || {}) }, queue, qi: 0,
      hp: Math.floor(ms.character.hp), mp: Math.floor(ms.character.mp), buffs: {}, stun: 0,
      pos: 0
    };
  }

  function makeEnemy(spec, label) {
    const base = RPG.enemyFromSpec ? RPG.enemyFromSpec(spec) : RPG.getEnemy(spec.id, spec.champion);
    const enemy = label ? { ...base, name: label } : base;
    return {
      side: "enemy", id: spec.id, champion: !!(spec.champion && !base.noChampion), enemy, name: enemy.name,
      hp: enemy.stats.hp, mp: enemy.stats.mp || 0, turn: 0,
      dot: null, defDown: 0, atkDown: { pct: 0, turns: 0 },
      range: RPG.enemyRange ? RPG.enemyRange(enemy) : 1,
      move: RPG.enemyMove ? RPG.enemyMove(enemy) : null,
      pos: START_DISTANCE
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
  const dist = (H, E) => Math.max(1, E.pos - H.pos);
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

  function skillAttack(H, E, sk, lvl) {
    const h = heroNow(H);
    const es = E.enemy.stats;
    const hits = sk.hits || 1;
    const mult = RPG.skillValue(sk.mult, lvl);
    const critBonus = RPG.skillValue(sk.critBonus, lvl);
    const dmgs = [];
    let anyCrit = false;
    for (let i = 0; i < hits && E.hp > 0; i++) {
      if (!sk.magic && roll(es.dodge)) { dmgs.push("промах"); continue; }
      const crit = roll(h.crit + critBonus);
      anyCrit = anyCrit || crit;
      const blocked = roll(sk.magic ? es.blockMag : es.blockPhys);
      const raw = (sk.magic ? h.magic : h.attack) * mult * variance();
      const dmg = finishHit(mitigate(raw, sk.magic ? enemyMagDef(E) : enemyDefense(E)), crit, blocked);
      E.hp = Math.max(0, E.hp - dmg);
      dmgs.push(dmg + (crit ? " (крит)" : ""));
    }
    let text = `${H.name} — «${sk.name}» (−${sk.mp} MP) по «${E.name}»: ${dmgs.join(" + ")} шкоди`;
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
    return { who: "hero", text, crit: anyCrit };
  }

  function castBuff(H, id, sk, lvl) {
    const effects = {};
    for (const [k, pair] of Object.entries(sk.effects)) effects[k] = RPG.skillValue(pair, lvl);
    H.buffs[id] = { effects, turns: RPG.skillTurns(lvl) };
    return { who: "hero", text: `${H.name} — «${sk.name}» (−${sk.mp} MP): ${RPG.describeSkill(id, lvl).split(" · ")[0]}`, crit: false };
  }

  // Лікування: targets — кого лікувати (за замовчуванням себе). Кожен отримує % від СВОГО макс. HP
  function castHeal(H, sk, lvl, targets = [H]) {
    const pct = RPG.skillValue(sk.healPct, lvl) / 100;
    const parts = targets.map(T => {
      const before = T.hp;
      T.hp = Math.min(T.base.hp, T.hp + Math.round(T.base.hp * pct));
      return targets.length === 1 && T === H ? `+${T.hp - before} HP` : `${T.name} +${T.hp - before} HP`;
    });
    return { who: "hero", text: `${H.name} — «${sk.name}» (−${sk.mp} MP): ${parts.join(", ")}`, crit: false, heal: true };
  }

  function basicAttack(H, E) {
    const h = heroNow(H);
    const es = E.enemy.stats;
    if (roll(es.dodge)) {
      return { who: "hero", text: `${H.name} б'є «${E.name}», але той ухиляється`, crit: false };
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
    return { who: "hero", text, crit };
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
    return { who: "hero", text, crit };
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
    return { who: "enemy", text, crit };
  }

  function enemyPhysHit(E, H, moveName, mult) {
    const hero = heroNow(H);
    if (roll(hero.dodge)) {
      return { who: "enemy", text: `${E.name} ${moveName ? `— «${moveName}»` : "кидається"}, але ${H.name} ухиляється!`, crit: false };
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
    return { who: "enemy", text, crit };
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
  // Повертає { win, draw, rounds, heroes: [{ hp, mp, dead }], enemies: [{ id, champion, name, exp }],
  //            events, enemyIds, heroHp, heroMp, champion }
  // кожна подія: { who: "hero" | "enemy" | "info" | "round", text, crit,
  //               heroes: [{hp, mp, pos}], enemies: [{hp, mp, pos}], heroHp, heroMp, enemyHp, enemyMp }
  function simulatePartyBattle(members, enemySpecs) {
    const heroes = members.map(makeHero);
    const labels = enemyLabels(enemySpecs);
    const foes = enemySpecs.map((spec, i) => makeEnemy(spec, labels[i]));
    const events = [];
    const push = ev => events.push(Object.assign(ev, {
      heroes: heroes.map(h => ({ hp: h.hp, mp: h.mp, pos: h.pos })),
      enemies: foes.map(f => ({ hp: f.hp, mp: f.mp, pos: f.pos })),
      heroHp: heroes[0].hp, heroMp: heroes[0].mp, enemyHp: foes[0].hp, enemyMp: foes[0].mp
    }));
    const aliveH = () => heroes.filter(h => h.hp > 0);
    const aliveE = () => foes.filter(f => f.hp > 0);
    const going = () => aliveH().length > 0 && aliveE().length > 0;
    const minDist = () => Math.min(...aliveH().flatMap(h => aliveE().map(e => dist(h, e))));
    const multi = heroes.length > 1;

    const heroNames = heroes.map(h => h.name).join(", ");
    const foeNames = foes.map(f => `«${f.enemy.name}» (рівень ${f.enemy.level})${f.enemy.boss ? " — БОС" : ""}`).join(", ");
    push({ who: "info", text: `Бій починається: ${heroNames} проти ${foeNames}. Відстань — ${START_DISTANCE}.` });

    // Хто вже походив у поточному раунді (для «Молитви зцілення» жерця)
    let roundActed = new Set();
    const hurt = h => h.hp > 0 && h.hp < h.base.hp;
    const mostWounded = () => aliveH().filter(hurt).sort((a, b) => a.hp / a.base.hp - b.hp / b.base.hp)[0] || null;

    // Лікувальна навичка героя. Повертає false, якщо жрець вирішив чекати
    function heroHeal(H, act) {
      const area = act.sk.area || "self";
      let targets = [H];
      if (area === "near") targets = aliveH().filter(a => Math.abs(a.pos - H.pos) <= 1);
      else if (area === "group") targets = aliveH();
      else if (area === "wounded") {
        const w = mostWounded();
        if (w) targets = [w];
        else if (aliveE().some(E => !roundActed.has(E))) {
          // Усі здорові, а вороги ще не ходили — чекаємо першого удару
          H.healWait = act;
          push({ who: "hero", move: true, text: `${H.name} готує «${act.sk.name}» і чекає удару ворога`, crit: false });
          return false;
        }
      }
      H.mp -= act.sk.mp;
      H.qi++;
      push(castHeal(H, act.sk, act.lvl, targets));
      return true;
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
        push(castHeal(H, act.sk, act.lvl, [w]));
      }
    }

    // --- Хід героя ---
    function heroTurn(H) {
      if (H.stun > 0) {
        H.stun--;
        push({ who: "hero", text: `${H.name} застряг у слизу й пропускає хід`, crit: false });
        return;
      }
      const act = resolveAction(H);
      if (act.type === "skill" && act.sk.kind === "heal") { heroHeal(H, act); return; }
      if (act.type === "skill" && act.sk.kind === "buff") {
        H.mp -= act.sk.mp;
        H.qi++;
        push(castBuff(H, act.id, act.sk, act.lvl));
        return;
      }
      const reach = rangeOf(act, H);
      const target = aliveE().find(E => dist(H, E) <= reach);
      if (!target) {
        const limit = Math.min(...aliveE().map(e => e.pos)) - 1;
        if (H.pos < limit) {
          H.pos++;
          const d = Math.min(...aliveE().map(e => dist(H, e)));
          push({ who: "hero", move: true, text: `${H.name} підходить ближче (до ворога ${d})`, crit: false });
        } else {
          push({ who: "hero", move: true, text: `${H.name} чекає, поки ворог наблизиться`, crit: false });
        }
        return;
      }
      H.qi++;
      if (act.type === "skill") { H.mp -= act.sk.mp; push(skillAttack(H, target, act.sk, act.lvl)); }
      else if (act.type === "spell") push(spellAttack(H, target));
      else push(basicAttack(H, target));
      if (target.hp <= 0 && foes.length > 1) push({ who: "info", text: `«${target.name}» переможений.` });
    }

    // --- Хід ворога ---
    function enemyTurn(E, firstInRound) {
      if (firstInRound && E.dot && E.dot.turns > 0) {
        E.hp = Math.max(0, E.hp - E.dot.dmg);
        E.dot.turns--;
        push({ who: "hero", text: `Отрута / вогонь: ${E.dot.dmg} шкоди «${E.name}»`, crit: false });
        if (E.hp <= 0) { if (foes.length > 1) push({ who: "info", text: `«${E.name}» переможений.` }); return; }
      }
      E.turn++;
      const inReach = () => aliveH().find(H => dist(H, E) <= E.range);
      const hit = (H, ev) => {
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
            push({ who: "enemy", text: `${E.name} — «${sk.name}» (−${sk.mp} MP): відновлює ${E.hp - before} HP`, crit: false });
            return;
          }
          const H = inReach();
          if (H) {
            const ev = enemyMagicHit(E, H, sk.name, sk.mp, sk.mult || 1);
            if (sk.kind === "stun" && H.hp > 0) { H.stun = 1; ev.text += `, ${H.name} застряг у слизу й пропустить хід`; }
            hit(H, ev);
            return;
          }
        }
      }

      const H = inReach();
      if (!H) {
        const limit = Math.max(...aliveH().map(h => h.pos)) + 1;
        if (E.pos > limit) {
          E.pos--;
          const d = Math.min(...aliveH().map(h => dist(h, E)));
          push({ who: "enemy", move: true, text: `${E.name} наближається (відстань ${d})`, crit: false });
        }
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
      push({ who: "round", text: `Раунд ${round} · відстань ${minDist()}` });
      const acted = new Set();
      roundActed = acted;
      for (const slot of roundSchedule([...aliveH(), ...aliveE()])) {
        if (!going()) break;
        const u = slot.u;
        if (u.hp <= 0) continue;
        if (u.side === "hero") heroTurn(u);
        else enemyTurn(u, !acted.has(u));
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
    else push({ who: "info", text: multi ? "Уся група загинула…" : `${heroes[0].name} загинув…` });

    return {
      win, draw, rounds: round, events,
      heroes: heroes.map(h => ({ hp: h.hp, mp: h.mp, dead: h.hp <= 0 })),
      enemies: foes.map(f => ({ id: f.id, champion: f.champion, name: f.enemy.name, exp: f.enemy.exp })),
      enemyIds: foes.map(f => f.id),
      heroHp: heroes[0].hp, heroMp: heroes[0].mp,
      champion: foes.some(f => f.champion)
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

  Object.assign(RPG, { simulateBattle, simulatePartyBattle, rollEnemyGroup, enemyGroupCap, enemyGroupRange, roundSchedule, BATTLE_START_DISTANCE: START_DISTANCE });
})(window.RPG);
