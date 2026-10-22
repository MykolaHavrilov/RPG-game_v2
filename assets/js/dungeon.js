// ============================================================
// dungeon.js — ДАНЖІ (опис данжів — data/enemies.js → DUNGEONS)
//
// Стан данжу в сейві: save.dungeon = { id, stage: 1..3, foes: ["slime", ...] }
//   stage — номер бою, foes — ID ворогів поточного бою.
//   Поки save.dungeon є — зілля пити не можна (character.js → useItem),
//   а сторінка локації показує данж замість звичайних боїв.
// Вихід із локації, загибель, втеча ворогів або перемога в 3-му бою — данж закінчується.
//
// Підключається ПІСЛЯ data/enemies.js і character.js, ДО game.js.
// ============================================================

(function (RPG) {
  const STAGES = 3;

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function getDungeon(id) { return RPG.DUNGEONS[id] ? { id, ...RPG.DUNGEONS[id] } : null; }

  // Данж локації або null
  function locationDungeon(locId) {
    const id = RPG.LOCATIONS[locId]?.dungeon;
    return id ? getDungeon(id) : null;
  }

  function keyCount(save, dungeonId) {
    const d = RPG.DUNGEONS[dungeonId];
    return d ? RPG.countItem(save, d.key) : 0;
  }

  // ID ворогів для бою stage
  function stageFoes(d, stage) {
    if (stage === 1) return [pick(d.pool)];
    if (stage === 2) {
      const list = shuffle(d.pool).slice(0, 3);
      while (list.length < 3) list.push(pick(d.pool));
      return shuffle(list);
    }
    return [d.boss];
  }

  // Поточний данж (або null). Якщо герой уже не на локації данжу — данж скасовується.
  function activeDungeon(save) {
    const s = save.dungeon;
    if (!s) return null;
    const d = getDungeon(s.id);
    if (!d || save.location?.map !== d.location || !(s.stage >= 1 && s.stage <= STAGES)) {
      delete save.dungeon;
      return null;
    }
    if (!Array.isArray(s.foes) || !s.foes.length) s.foes = stageFoes(d, s.stage);
    return { ...d, stage: s.stage, stages: STAGES, foes: s.foes };
  }

  // Відчинити ворота: −1 ключ, бій 1
  function openDungeon(save, dungeonId) {
    const d = getDungeon(dungeonId);
    if (!d) return { ok: false, reason: "Такого данжу немає." };
    if (save.location?.map !== d.location) return { ok: false, reason: "Ворота данжу — в іншій локації." };
    if (save.dungeon) return { ok: false, reason: "Ви вже в данжі." };
    if (!RPG.aliveMembers(save).length) return { ok: false, reason: "Усі герої групи полягли — помоліться за них у Храмі." };
    if (!RPG.removeItem(save, d.key, 1)) {
      return { ok: false, reason: `Потрібен ${RPG.ITEMS[d.key].name}. Його можна знайти під час «${d.explore}» (шанс ${Math.round(d.keyChance * 100)}% з кожного ворога).` };
    }
    save.dungeon = { id: d.id, stage: 1, foes: stageFoes(d, 1) };
    return { ok: true };
  }

  // Перемога в бою: наступний бій або кінець данжу. Повертає { done, stage }
  function advanceDungeon(save) {
    const s = save.dungeon;
    if (!s) return { done: true, stage: 0 };
    if (s.stage >= STAGES) { delete save.dungeon; return { done: true, stage: STAGES }; }
    s.stage++;
    s.foes = stageFoes(getDungeon(s.id), s.stage);
    return { done: false, stage: s.stage };
  }

  function leaveDungeon(save) { delete save.dungeon; }

  // Опис бою stage для гравця
  function dungeonStageText(d, stage) {
    const names = d.pool.map(id => RPG.ENEMIES[id].name);
    if (stage === 1) return `один випадковий ворог (${names.join(" / ")}) з GS як у вашої групи`;
    if (stage === 2) return `три вороги (${names.join(", ")}) з GS як у вашої групи`;
    return `бос «${RPG.ENEMIES[d.boss].name}»`;
  }

  // Специфікації ворогів поточного бою данжу для battle.js:
  // у боях 1–2 вороги мають речі з GS, рівним GS групи (dungeonGs), бос — за звичайними правилами боса
  function dungeonSpecs(save) {
    const a = activeDungeon(save);
    if (!a) return [];
    return a.foes.map(id => ({ id, champion: false, dungeonGs: !RPG.ENEMIES[id]?.boss }));
  }

  // Ключі зі «Обстеження»: шанс keyChance з кожного переможеного ворога з pool.
  // Повертає { got, lost } — скільки ключів отримано і скільки не вмістилося.
  function rollKeyDrops(save, locId, enemyIds) {
    const d = locationDungeon(locId);
    const out = { got: 0, lost: 0, name: d ? RPG.ITEMS[d.key].name : "" };
    if (!d || save.dungeon) return out;
    for (const id of enemyIds || []) {
      if (!d.pool.includes(id) || Math.random() >= d.keyChance) continue;
      if (RPG.fitQty(save, d.key, 1) >= 1) { RPG.addItem(save, d.key, 1); out.got++; }
      else out.lost++;                                   // інвентар повний — ключ пропав
    }
    return out;
  }

  Object.assign(RPG, {
    DUNGEON_STAGES: STAGES, DUNGEON_POOL_TEXT: dungeonStageText, getDungeon, locationDungeon, keyCount, activeDungeon, openDungeon,
    advanceDungeon, leaveDungeon, dungeonSpecs, rollKeyDrops
  });
})(window.RPG);
