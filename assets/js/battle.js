// ============================================================
// battle.js — автобій
//
// Бій рахується повністю одразу (simulateBattle), а сторінка
// потім або показує його покроково, або одразу весь результат
// (режим у налаштуваннях).
//
// Формули (характеристики героя — RPG.calcStats: професія + атрибути + речі + володіння):
//   Шкода = атака × (0.85…1.15) × 100 / (100 + захист цілі)
//   Заклинання «Іскра» (4 MP) = сила магії × 1.6, проти магічного захисту.
//   Магічна зброя (магія > атаки, напр. посох) — герой кидає «Іскру»,
//       коли мани немає — б'є зброєю.
//   Крит — шкода × 1.5. Блок (фізичний / магічний) — половина шкоди.
//   Ухилення (dodge, %) — удар зовсім не влучає.
//   Швидкість — хто б'є першим + шанс додаткового «швидкого» удару
//       (до 30%), якщо ти швидший за суперника.
//
// Черга дій (save.battleQueue, до 10): "attack" — звичайний удар,
//   або ID активної навички (data/skills.js). Навичка спрацьовує, якщо
//   вона вивчена, вдягнена її зброя і вистачає мани — інакше звичайний удар.
//   Бафи діють кілька раундів, отрута — 3 ходи ворога.
//
// Вороги з маною (data/enemies.js): spell — магічна атака з шансом, якщо вистачає MP;
//   skills — навички боса, по черзі кожен 3-й власний хід (magic / heal / stun).
//   Магія ворога = сила магії × mult проти магічного захисту героя (блок — маг. блоком).
// ============================================================

(function (RPG) {
  const MAX_ROUNDS = 60;
  const SPELL_COST = 4;
  const SPELL_MULT = 1.6;
  const CRIT_MULT = 1.5;
  const MAX_EXTRA_HIT = 0.3;

  function variance() {
    return 0.85 + Math.random() * 0.3;   // ±15%
  }

  function mitigate(damage, defense) {
    return damage * 100 / (100 + Math.max(0, defense || 0));
  }

  // Шанс додаткового удару завдяки швидкості
  function extraHitChance(mySpeed, otherSpeed) {
    if (mySpeed <= otherSpeed) return 0;
    return Math.min(MAX_EXTRA_HIT, (mySpeed - otherSpeed) / (mySpeed + otherSpeed));
  }

  // Опис того, чим б'є герой, залежно від спорядження
  function heroWeapon(save) {
    const ref = save.equipment.mainHand;
    const item = RPG.ITEMS[RPG.refId(ref)];
    if (!item) return { name: "кулаками", magic: false, type: null };
    const st = RPG.itemStats(ref);
    return { name: item.name, magic: (st.magic || 0) > (st.attack || 0), type: item.weaponType || null };
  }

  function finishHit(dmg, crit, blocked) {
    if (crit) dmg *= CRIT_MULT;
    if (blocked) dmg *= 0.5;
    return Math.max(1, Math.round(dmg));
  }

  // Характеристики героя з урахуванням бафів
  function heroNow(ctx) {
    const h = { ...ctx.base };
    const sum = {};
    for (const b of Object.values(ctx.state.buffs)) {
      for (const [k, v] of Object.entries(b.effects)) sum[k] = (sum[k] || 0) + v;
    }
    if (sum.attackPct) h.attack *= 1 + sum.attackPct / 100;
    if (sum.defensePct) h.defense *= 1 + sum.defensePct / 100;
    if (sum.magicDefensePct) h.magicDefense *= 1 + sum.magicDefensePct / 100;
    if (sum.crit) h.crit += sum.crit;
    if (sum.dodge) h.dodge = (h.dodge || 0) + sum.dodge;
    if (sum.speedPct) h.speed = Math.min(h.speed * (1 + sum.speedPct / 100), RPG.STAT_CAP.speed * 2);
    return h;
  }

  function enemyDefense(ctx) {
    return ctx.enemy.stats.defense * (1 - ctx.state.enemyDefDown / 100);
  }

  // Чи можна зараз використати навичку з черги
  function usableSkill(action, ctx) {
    const sk = RPG.SKILLS?.[action];
    if (!sk) return null;
    const lvl = ctx.skillLevels[action] || 0;
    if (lvl < 1 || sk.weapon !== ctx.weapon.type || ctx.state.heroMp < sk.mp) return null;
    return { sk, lvl };
  }

  // Удар навичкою (може бути кілька ударів)
  function skillAttack(sk, lvl, ctx, quick) {
    const { enemy, state } = ctx;
    const es = enemy.stats;
    const h = heroNow(ctx);
    const hits = sk.hits || 1;
    const mult = RPG.skillValue(sk.mult, lvl);
    const critBonus = RPG.skillValue(sk.critBonus, lvl);
    const dmgs = [];
    let anyCrit = false;
    for (let i = 0; i < hits && state.enemyHp > 0; i++) {
      if (!sk.magic && Math.random() * 100 < (es.dodge || 0)) { dmgs.push("промах"); continue; }
      const crit = Math.random() * 100 < h.crit + critBonus;
      anyCrit = anyCrit || crit;
      const blocked = Math.random() * 100 < (sk.magic ? (es.blockMag || 0) : (es.blockPhys || 0));
      const raw = (sk.magic ? h.magic : h.attack) * mult * variance();
      const def = sk.magic ? (es.magicDefense ?? Math.floor(es.defense / 2)) : enemyDefense(ctx);
      const dmg = finishHit(mitigate(raw, def), crit, blocked);
      state.enemyHp = Math.max(0, state.enemyHp - dmg);
      dmgs.push(dmg + (crit ? " (крит)" : ""));
    }
    let text = `${quick ? "Швидкий удар! " : ""}${ctx.heroName} — «${sk.name}» (−${sk.mp} MP): ${dmgs.join(" + ")} шкоди`;
    if (sk.dot && state.enemyHp > 0) {
      state.dot = { dmg: Math.round(RPG.skillValue(sk.dot, lvl)), turns: 3 };
      text += `, ворог отруєний`;
    }
    if (sk.debuff?.defensePct) {
      state.enemyDefDown = Math.max(state.enemyDefDown, RPG.skillValue(sk.debuff.defensePct, lvl));
      text += `, захист ворога −${state.enemyDefDown}%`;
    }
    if (sk.debuff?.attackPct) {
      state.enemyAtkDown = { pct: RPG.skillValue(sk.debuff.attackPct, lvl), turns: RPG.skillTurns(lvl) };
      text += `, атака ворога −${state.enemyAtkDown.pct}%`;
    }
    return { who: "hero", text, crit: anyCrit };
  }

  function castBuff(id, sk, lvl, ctx) {
    const effects = {};
    for (const [k, pair] of Object.entries(sk.effects)) effects[k] = RPG.skillValue(pair, lvl);
    const turns = RPG.skillTurns(lvl);
    ctx.state.buffs[id] = { effects, turns };
    return { who: "hero", text: `${ctx.heroName} — «${sk.name}» (−${sk.mp} MP): ${RPG.describeSkill(id, lvl).split(" · ")[0]}`, crit: false };
  }

  // Одна дія героя з черги
  function heroAction(action, ctx, quick) {
    const { enemy, state, weapon } = ctx;
    const es = enemy.stats;

    const use = usableSkill(action, ctx);
    if (use) {
      state.heroMp -= use.sk.mp;
      return use.sk.kind === "buff"
        ? castBuff(action, use.sk, use.lvl, ctx)
        : skillAttack(use.sk, use.lvl, ctx, quick);
    }

    const h = heroNow(ctx);
    const crit = Math.random() * 100 < h.crit;
    let text, dmg, blocked;

    const castSpell = (action === "spell" || weapon.magic) && state.heroMp >= SPELL_COST;
    if (!castSpell && Math.random() * 100 < (es.dodge || 0)) {
      return { who: "hero", text: `${quick ? "Швидкий удар! " : ""}${ctx.heroName} б'є, але ${enemy.name} ухиляється`, crit: false };
    }
    if (castSpell) {
      state.heroMp -= SPELL_COST;
      blocked = Math.random() * 100 < (es.blockMag || 0);
      dmg = finishHit(mitigate(h.magic * SPELL_MULT * variance(), es.magicDefense ?? Math.floor(es.defense / 2)), crit, blocked);
      text = `${ctx.heroName} кидає «Іскру» (−${SPELL_COST} MP): ${dmg} шкоди`;
    } else {
      blocked = Math.random() * 100 < (es.blockPhys || 0);
      dmg = finishHit(mitigate(h.attack * variance(), enemyDefense(ctx)), crit, blocked);
      text = weapon.name === "кулаками"
        ? `${ctx.heroName} б'є кулаками: ${dmg} шкоди`
        : `${ctx.heroName} б'є (${weapon.name}): ${dmg} шкоди`;
    }
    if (quick) text = "Швидкий удар! " + text;
    if (blocked) text += " (ворог частково заблокував)";
    if (crit) text += " — КРИТ!";
    state.enemyHp = Math.max(0, state.enemyHp - dmg);
    return { who: "hero", text, crit };
  }

  // Магічний удар ворога (заклинання або навичка боса)
  function enemyMagicHit(ctx, name, mp, mult, quick) {
    const { enemy, state } = ctx;
    const hero = heroNow(ctx);
    state.enemyMp -= mp;
    const crit = Math.random() * 100 < (enemy.stats.crit || 0);
    const blocked = Math.random() * 100 < (hero.blockMag || 0);
    const atkDown = state.enemyAtkDown.turns > 0 ? state.enemyAtkDown.pct : 0;
    const dmg = finishHit(mitigate((enemy.stats.magic || 0) * mult * (1 - atkDown / 100) * variance(), hero.magicDefense), crit, blocked);
    state.heroHp = Math.max(0, state.heroHp - dmg);
    let text = `${quick ? "Швидкий напад! " : ""}${enemy.name} — «${name}» (−${mp} MP): ${dmg} магічної шкоди`;
    if (blocked) text += ` (${ctx.heroName} частково блокує)`;
    if (crit) text += " — КРИТ!";
    return { text, crit };
  }

  // Навичка боса (kind: magic / heal / stun)
  function enemySkill(sk, ctx) {
    const { enemy, state } = ctx;
    if (sk.kind === "heal") {
      state.enemyMp -= sk.mp;
      const heal = Math.round(enemy.stats.hp * sk.healPct);
      const before = state.enemyHp;
      state.enemyHp = Math.min(enemy.stats.hp, state.enemyHp + heal);
      return { who: "enemy", text: `${enemy.name} — «${sk.name}» (−${sk.mp} MP): відновлює ${state.enemyHp - before} HP`, crit: false };
    }
    const hit = enemyMagicHit(ctx, sk.name, sk.mp, sk.mult || 1, false);
    if (sk.kind === "stun" && state.heroHp > 0) {
      state.heroStun = 1;
      hit.text += `, ${ctx.heroName} застряг у слизу й пропустить хід`;
    }
    return { who: "enemy", text: hit.text, crit: hit.crit };
  }

  function enemyAction(ctx, quick) {
    const { enemy, state } = ctx;
    // Навички боса: кожен 3-й власний (не «швидкий») хід, по черзі
    if (!quick) {
      state.enemyTurn++;
      const skills = enemy.skills || [];
      if (skills.length && state.enemyTurn % 3 === 0) {
        const sk = skills[(state.enemyTurn / 3 - 1) % skills.length];
        if (state.enemyMp >= sk.mp) return enemySkill(sk, ctx);
      }
    }
    // Магічна атака (якщо вистачає мани)
    const sp = enemy.spell;
    if (sp && state.enemyMp >= sp.mp && Math.random() < (sp.chance ?? 0.4)) {
      const hit = enemyMagicHit(ctx, sp.name, sp.mp, sp.mult, quick);
      return { who: "enemy", text: hit.text, crit: hit.crit };
    }

    const hero = heroNow(ctx);
    if (Math.random() * 100 < (hero.dodge || 0)) {
      return { who: "enemy", text: `${quick ? "Швидкий напад! " : ""}${enemy.name} кидається, але ${ctx.heroName} ухиляється!`, crit: false };
    }
    const crit = Math.random() * 100 < (enemy.stats.crit || 0);
    const blocked = Math.random() * 100 < hero.blockPhys;
    const atkDown = state.enemyAtkDown.turns > 0 ? state.enemyAtkDown.pct : 0;
    const dmg = finishHit(mitigate(enemy.stats.attack * (1 - atkDown / 100) * variance(), hero.defense), crit, blocked);

    const verb = enemy.verb || "кусає";
    let text = blocked
      ? `${enemy.name} ${verb}, але ${ctx.heroName} блокує частину удару: ${dmg} шкоди`
      : `${enemy.name} ${verb}: ${dmg} шкоди`;
    if (quick) text = "Швидкий напад! " + text;
    if (crit) text += " — КРИТ!";
    state.heroHp = Math.max(0, state.heroHp - dmg);
    return { who: "enemy", text, crit };
  }

  // Хід героя: якщо він застряг (навичка «stun») — пропускає
  function heroTurn(ctx, queue, qRef, quick) {
    if (ctx.state.heroStun > 0) {
      ctx.state.heroStun--;
      return { who: "hero", text: `${ctx.heroName} застряг у слизу й пропускає хід`, crit: false };
    }
    return heroAction(queue[qRef.i++ % queue.length], ctx, quick);
  }

  // ---------- Бій групи проти кількох ворогів ----------
  // Кожен герой і ворог має свій стан; для удару «герой → ворог» або
  // «ворог → герой» будується пара (ctx) з тим самим інтерфейсом, що й у
  // бою один на один, тож усі функції вище (навички, магія, бафи) працюють без змін.

  function makeHero(ms) {
    const queue = (ms.battleQueue || []).filter(Boolean).slice(0, 10);
    if (!queue.length) queue.push("attack");
    return {
      ms, name: ms.character.name, base: RPG.calcStats(ms), weapon: heroWeapon(ms),
      skillLevels: { ...(ms.character.skills || {}) }, queue, qRef: { i: 0 },
      hp: Math.floor(ms.character.hp), mp: Math.floor(ms.character.mp), buffs: {}, stun: 0
    };
  }

  function makeEnemy(spec, label) {
    const base = RPG.getEnemy(spec.id, spec.champion);
    const enemy = label ? { ...base, name: label } : base;
    return {
      id: spec.id, champion: !!(spec.champion && !base.noChampion), enemy,
      hp: enemy.stats.hp, mp: enemy.stats.mp || 0, turn: 0,
      dot: null, defDown: 0, atkDown: { pct: 0, turns: 0 }
    };
  }

  // Пара для одного удару: state зв'язує стан героя H і ворога E
  function pair(H, E) {
    const state = {
      get heroHp() { return H.hp; }, set heroHp(v) { H.hp = v; },
      get heroMp() { return H.mp; }, set heroMp(v) { H.mp = v; },
      get buffs() { return H.buffs; },
      get heroStun() { return H.stun; }, set heroStun(v) { H.stun = v; },
      get enemyHp() { return E.hp; }, set enemyHp(v) { E.hp = v; },
      get enemyMp() { return E.mp; }, set enemyMp(v) { E.mp = v; },
      get enemyTurn() { return E.turn; }, set enemyTurn(v) { E.turn = v; },
      get dot() { return E.dot; }, set dot(v) { E.dot = v; },
      get enemyDefDown() { return E.defDown; }, set enemyDefDown(v) { E.defDown = v; },
      get enemyAtkDown() { return E.atkDown; }, set enemyAtkDown(v) { E.atkDown = v; }
    };
    return {
      base: H.base, enemy: E.enemy, heroName: H.name, weapon: H.weapon,
      skillLevels: H.skillLevels, state
    };
  }

  // Однакові вороги отримують номери: «Зелений слайм 1», «Зелений слайм 2»
  function enemyLabels(specs) {
    const count = {};
    for (const s of specs) count[s.id] = (count[s.id] || 0) + 1;
    const seen = {};
    return specs.map(s => {
      if (count[s.id] < 2) return null;
      seen[s.id] = (seen[s.id] || 0) + 1;
      const e = RPG.getEnemy(s.id, s.champion);
      return `${e.name} ${seen[s.id]}`;
    });
  }

  // members — «вигляди» героїв (party.js → memberSave), живі; enemySpecs — [{ id, champion }]
  // Повертає { win, draw, rounds, heroes: [{ hp, mp, dead }], enemies: [{ id, champion, name, exp }],
  //            events, enemyIds, heroHp, heroMp, champion }
  // кожна подія: { who, text, crit, heroes: [{hp, mp}], enemies: [{hp, mp}], heroHp, heroMp, enemyHp, enemyMp }
  function simulatePartyBattle(members, enemySpecs) {
    const heroes = members.map(makeHero);
    const labels = enemyLabels(enemySpecs);
    const foes = enemySpecs.map((spec, i) => makeEnemy(spec, labels[i]));
    const events = [];
    const push = ev => events.push(Object.assign(ev, {
      heroes: heroes.map(h => ({ hp: h.hp, mp: h.mp })),
      enemies: foes.map(f => ({ hp: f.hp, mp: f.mp })),
      heroHp: heroes[0].hp, heroMp: heroes[0].mp, enemyHp: foes[0].hp, enemyMp: foes[0].mp
    }));
    const aliveH = () => heroes.filter(h => h.hp > 0);
    const aliveE = () => foes.filter(f => f.hp > 0);
    const going = () => aliveH().length > 0 && aliveE().length > 0;
    const speedOf = u => (u.base ? heroNow(pair(u, foes[0])).speed : u.enemy.stats.speed);

    const heroNames = heroes.map(h => h.name).join(", ");
    const foeNames = foes.map(f => `«${f.enemy.name}» (рівень ${f.enemy.level})${f.enemy.boss ? " — БОС" : ""}`).join(", ");
    push({ who: "info", text: `Бій починається: ${heroNames} проти ${foeNames}.` });

    let round = 0;
    while (going() && round < MAX_ROUNDS) {
      round++;
      // Порядок ходів за швидкістю (при рівності — герої першими)
      const order = [...heroes, ...foes].filter(u => u.hp > 0)
        .map(u => ({ u, hero: !!u.base, speed: speedOf(u) }))
        .sort((a, b) => b.speed - a.speed || (b.hero - a.hero));
      for (const { u, hero } of order) {
        if (!going()) break;
        if (u.hp <= 0) continue;
        if (hero) {
          const target = aliveE()[0];                         // група б'є першого живого ворога
          const ctx = pair(u, target);
          push(heroTurn(ctx, u.queue, u.qRef, false));
          if (target.hp > 0 && Math.random() < extraHitChance(heroNow(ctx).speed, target.enemy.stats.speed)) {
            push(heroTurn(ctx, u.queue, u.qRef, true));
          }
          if (target.hp <= 0 && foes.length > 1) push({ who: "info", text: `«${target.enemy.name}» переможений.` });
        } else {
          const targets = aliveH();
          const H = targets[Math.floor(Math.random() * targets.length)];   // ворог б'є випадкового героя
          const ctx = pair(H, u);
          if (u.dot && u.dot.turns > 0) {
            u.hp = Math.max(0, u.hp - u.dot.dmg);
            u.dot.turns--;
            push({ who: "hero", text: `Отрута: ${u.dot.dmg} шкоди «${u.enemy.name}»`, crit: false });
            if (u.hp <= 0) { if (foes.length > 1) push({ who: "info", text: `«${u.enemy.name}» переможений.` }); continue; }
          }
          push(enemyAction(ctx, false));
          if (H.hp > 0 && Math.random() < extraHitChance(u.enemy.stats.speed, heroNow(ctx).speed)) push(enemyAction(ctx, true));
          if (H.hp <= 0 && heroes.length > 1 && aliveH().length) push({ who: "info", text: `${H.name} падає без сил…` });
        }
      }
      // Кінець раунду — бафи й послаблення слабшають
      for (const h of heroes) {
        for (const [id, b] of Object.entries(h.buffs)) {
          if (--b.turns <= 0) {
            delete h.buffs[id];
            if (going() && h.hp > 0) push({ who: "info", text: `${heroes.length > 1 ? h.name + ": " : ""}дія «${RPG.SKILLS[id].name}» закінчилась.` });
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
    else push({ who: "info", text: heroes.length > 1 ? "Уся група загинула…" : `${heroes[0].name} загинув…` });

    return {
      win, draw, rounds: round, events,
      heroes: heroes.map(h => ({ hp: h.hp, mp: h.mp, dead: h.hp <= 0 })),
      enemies: foes.map(f => ({ id: f.id, champion: f.champion, name: f.enemy.name, exp: f.enemy.exp })),
      enemyIds: foes.map(f => f.id),
      heroHp: heroes[0].hp, heroMp: heroes[0].mp,
      champion: foes.some(f => f.champion)
    };
  }

  // Бій одного героя з одним ворогом (як раніше)
  // champion = true — бій з чемпіоном (показники ×3, див. data/enemies.js)
  function simulateBattle(save, enemyId, champion = false) {
    const r = simulatePartyBattle([save], [{ id: enemyId, champion }]);
    return Object.assign(r, { enemyId });
  }

  // Скільки ворогів може вийти проти групи (рішення 3б):
  // максимум = розмір групи × (середній рівень групи / рівень головного героя),
  // від 1 до розміру групи. Новачки 1 рівня «стримують натовп», а коли
  // підростуть до рівня лідера — ворогів може бути стільки ж, скільки героїв.
  function enemyGroupCap(members) {
    const n = Math.max(1, members.length);
    if (n === 1) return 1;
    const leader = Math.max(1, members[0].character.level || 1);
    const avg = members.reduce((s, ms) => s + (ms.character.level || 1), 0) / n;
    return Math.max(1, Math.min(n, Math.round(n * Math.min(1, avg / leader))));
  }

  // Ворогів у бою: від 1 до groupSize (випадково), бос — не більше одного.
  function rollEnemyGroup(locationId, heroLevel, groupSize) {
    const n = 1 + Math.floor(Math.random() * Math.max(1, groupSize));
    const specs = [];
    let boss = false;
    for (let i = 0; i < n; i++) {
      let id = RPG.pickEnemy(locationId, heroLevel);
      for (let tries = 0; boss && RPG.ENEMIES[id]?.boss && tries < 20; tries++) id = RPG.pickEnemy(locationId, heroLevel);
      if (RPG.ENEMIES[id]?.boss) { if (boss) continue; boss = true; }
      specs.push({ id, champion: RPG.rollChampion(id) });
    }
    return specs;
  }

  Object.assign(RPG, { simulateBattle, simulatePartyBattle, rollEnemyGroup, enemyGroupCap });
})(window.RPG);
