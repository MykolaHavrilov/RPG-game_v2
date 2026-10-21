// ============================================================
// quests.js — ЗАВДАННЯ ГІЛЬДІЇ АВАНТЮРИСТІВ
//
// Адміністратор гільдії пропонує 3 завдання; взяти можна до 3 одночасно,
// а з професією 2 рангу (після «Шлях професії») — до 10. Однакових завдань
// (та сама ціль, кількість і нагорода) — не більше 3.
//   kill  — убити N щурів / вовків (рахується після кожної перемоги)
//   bring — принести N хвостів / шкурок / шкур / іклів (забираються при здачі)
// Нагорода: досвід, золото, а за складніші — великі зілля здоров'я/мани.
// Стан у сейві: save.quests = { offers, active, done, nextId }
//
// ОСОБЛИВЕ ЗАВДАННЯ «Час дослідити» (з 10 рівня головного героя) — 3 частини по черзі:
//   1) принести 100 щурячих шкурок → 10 000 EXP
//   2) принести по 100 вовчих іклів і вовчих шкур → 10 000 EXP, 100 середніх зілль здоров'я, 100 малих зілль мани
//   3) убити 70 слаймів → відкривається Центральний район (Мерія, Дошка оголошень — найм у групу)
// Стан: save.story.explore = { part: 0 (не взято) | 1..3 (поточна частина) | 4 (виконано), kills }
//
// КВЕСТ «ШЛЯХ ПРОФЕСІЇ» (з 15 рівня Селянина, видає Адміністратор гільдії) — 2 частини:
//   1) убити 40 вовків; 2) принести 30 слизу.
//   Після здачі герой отримує професію 2 рангу. Яку саме — вирішують приховані
//   критерії (data/classes.js → pickProfession: які атрибути гравець прокачував).
// Стан: save.story.profession = { part: 0 | 1..2 | 3 (виконано), kills, result }
//
// Підключається ПІСЛЯ items.js / enemies.js і ДО character.js.
// ============================================================

(function (RPG) {
  const MAX_ACTIVE = 3;          // Селянин
  const MAX_ACTIVE_PRO = 10;     // з професією (ранг 2+)
  const MAX_SAME = 3;            // однакових завдань одночасно
  const MAX_OFFERS = 3;

  function maxActive(save) {
    return RPG.getClass(save.character.classId).tier > 1 ? MAX_ACTIVE_PRO : MAX_ACTIVE;
  }
  // Однакові завдання: та сама дія, ціль/предмет, кількість і нагорода
  function questKey(quest) {
    return JSON.stringify([quest.kind, quest.target, quest.item, quest.need, quest.reward]);
  }
  function sameCount(save, quest) {
    const key = questKey(quest);
    return state(save).active.filter(a => questKey(a) === key).length;
  }

  // Групи ворогів для «вбити N»
  const TARGETS = {
    rat:  { name: "щурів",  match: id => id.startsWith("rat"),  minLevel: 1 },
    wolf: { name: "вовків", match: id => id.startsWith("wolf"), minLevel: 3 },
    slime: { name: "слаймів", match: id => id.startsWith("slime"), minLevel: 6 }
  };

  // Шаблони: amounts — варіанти кількості; exp/gold — за 1 одиницю
  const TEMPLATES = [
    { kind: "kill",  target: "rat",  amounts: [5, 8, 12], exp: 4,  gold: 3 },
    { kind: "kill",  target: "wolf", amounts: [3, 5, 8],  exp: 25, gold: 8 },
    { kind: "bring", item: "rat_tail",  amounts: [5, 10, 15], exp: 2,  gold: 2, minLevel: 1 },
    { kind: "bring", item: "rat_skin",  amounts: [3, 6],      exp: 5,  gold: 4, minLevel: 1 },
    { kind: "bring", item: "wolf_pelt", amounts: [3, 5],      exp: 18, gold: 7, minLevel: 3 },
    { kind: "bring", item: "wolf_fang", amounts: [3, 5],      exp: 15, gold: 6, minLevel: 3 },
    { kind: "kill",  target: "slime", amounts: [3, 5, 8], exp: 40, gold: 10 },
    { kind: "bring", item: "slime_gel", amounts: [3, 6],      exp: 20, gold: 6, minLevel: 6 }
  ];

  function state(save) {
    save.quests ??= {};
    const q = save.quests;
    q.offers ??= [];
    q.active ??= [];
    q.done ??= 0;
    q.nextId ??= 1;
    q.bounties ??= [];      // нагороди за переможених чемпіонів (забрати в Адміністратора)
    return q;
  }

  function templateLevel(t) {
    return t.kind === "kill" ? TARGETS[t.target].minLevel : (t.minLevel || 1);
  }

  function makeQuest(save) {
    const q = state(save);
    const lvl = save.character.level;
    const pool = TEMPLATES.filter(t => templateLevel(t) <= lvl);
    const t = pool[Math.floor(Math.random() * pool.length)];
    const ai = Math.floor(Math.random() * t.amounts.length);
    const n = t.amounts[ai];
    const quest = {
      id: "q" + q.nextId++,
      kind: t.kind, target: t.target || null, item: t.item || null,
      need: n, have: 0,
      reward: { exp: t.exp * n, gold: t.gold * n, items: [] }
    };
    // Складніші завдання — великі зілля
    if (ai >= 1) {
      const potion = Math.random() < 0.5 ? "potion_hp_large" : "potion_mp_large";
      quest.reward.items.push({ id: potion, qty: ai });   // 1 або 2
    }
    return quest;
  }

  function fillOffers(save) {
    const q = state(save);
    while (q.offers.length < MAX_OFFERS) q.offers.push(makeQuest(save));
    return q.offers;
  }

  function questTitle(quest) {
    if (quest.kind === "kill") return `Убити ${quest.need} ${TARGETS[quest.target].name}`;
    return `Принести: ${RPG.ITEMS[quest.item].name} × ${quest.need}`;
  }

  function questProgress(save, quest) {
    if (quest.kind === "kill") return Math.min(quest.have, quest.need);
    return Math.min(RPG.countItem(save, quest.item), quest.need);
  }

  function isComplete(save, quest) {
    return questProgress(save, quest) >= quest.need;
  }

  function describeReward(r) {
    const parts = [`${r.exp} EXP`, `${r.gold} золота`];
    for (const it of r.items) parts.push(`${RPG.ITEMS[it.id].name} × ${it.qty}`);
    return parts.join(", ");
  }

  function acceptQuest(save, questId) {
    const q = state(save);
    const max = maxActive(save);
    if (q.active.length >= max) return { ok: false, reason: `Можна мати не більше ${max} завдань.` };
    const i = q.offers.findIndex(o => o.id === questId);
    if (i < 0) return { ok: false, reason: "Завдання вже немає." };
    if (sameCount(save, q.offers[i]) >= MAX_SAME) {
      return { ok: false, reason: `Дубль квестів обмежений ${MAX_SAME} шт. — таких завдань у вас уже ${MAX_SAME}.` };
    }
    const [quest] = q.offers.splice(i, 1);
    q.active.push(quest);
    fillOffers(save);
    return { ok: true, quest };
  }

  function abandonQuest(save, questId) {
    const q = state(save);
    const i = q.active.findIndex(o => o.id === questId);
    if (i < 0) return { ok: false, reason: "Завдання немає." };
    q.active.splice(i, 1);
    return { ok: true };
  }

  // Повертає { ok, quest, levelUps }
  function turnInQuest(save, questId) {
    const q = state(save);
    const i = q.active.findIndex(o => o.id === questId);
    if (i < 0) return { ok: false, reason: "Завдання немає." };
    const quest = q.active[i];
    if (!isComplete(save, quest)) return { ok: false, reason: "Завдання ще не виконане." };
    if (quest.kind === "bring") RPG.removeItem(save, quest.item, quest.need);
    q.active.splice(i, 1);
    q.done++;
    save.character.gold += quest.reward.gold;
    for (const it of quest.reward.items) RPG.addItem(save, it.id, it.qty);
    const levelUps = RPG.addExp(save, quest.reward.exp);
    return { ok: true, quest, levelUps };
  }

  // Після перемоги над ворогом. Повертає рядки прогресу для повідомлення.
  function questOnKill(save, enemyId) {
    const q = state(save);
    const lines = [];
    for (const quest of q.active) {
      if (quest.kind !== "kill" || quest.have >= quest.need) continue;
      if (!TARGETS[quest.target].match(enemyId)) continue;
      quest.have++;
      lines.push(`${questTitle(quest)}: ${quest.have}/${quest.need}`);
    }
    // Квест професії: частина «убити»
    const ps = professionState(save);
    const ppart = PROFESSION.parts[ps.part - 1];
    if (ppart?.kill && TARGETS[ppart.kill.target].match(enemyId) && ps.kills < ppart.kill.need) {
      ps.kills++;
      lines.push(`«${PROFESSION.name}»: ${TARGETS[ppart.kill.target].name} ${ps.kills}/${ppart.kill.need}`);
    }
    // Особливе завдання: частина «убити»
    const st = storyState(save);
    const part = EXPLORE.parts[st.part - 1];
    if (part?.kill && TARGETS[part.kill.target].match(enemyId) && st.kills < part.kill.need) {
      st.kills++;
      lines.push(`«${EXPLORE.name}»: ${TARGETS[part.kill.target].name} ${st.kills}/${part.kill.need}`);
    }
    return lines;
  }

  // ---------- Особливе завдання «Час дослідити» ----------
  const EXPLORE = {
    name: "Час дослідити",
    minLevel: 10,
    parts: [
      { title: "Урожай на Фермі",
        text: "Фермерам треба зібрати врожай, але поля заполонили щури. Знищіть їх і принесіть як доказ 100 щурячих шкурок.",
        bring: [{ id: "rat_skin", qty: 100 }],
        reward: { exp: 10000, items: [] } },
      { title: "Вовча загроза",
        text: "Вовки з Лісової стежки нападають на мандрівників. Вполюйте їх і принесіть по 100 вовчих іклів і вовчих шкур.",
        bring: [{ id: "wolf_fang", qty: 100 }, { id: "wolf_pelt", qty: 100 }],
        reward: { exp: 10000, items: [{ id: "potion_hp_medium", qty: 100 }, { id: "potion_mp_small", qty: 100 }] } },
      { title: "Слизова печера",
        text: "У Печері в лісі розплодилися слайми. Знищіть 70 слаймів (будь-яких, і Короля теж).",
        kill: { target: "slime", need: 70 },
        reward: { exp: 0, items: [], unlock: "center" } }
    ],
    finale: "«Ви довели, що на вас можна покластися. Біля Мерії в Центральному районі є Дошка оголошень — " +
            "там інші авантюристи шукають собі напарників, щоб об'єднатися в групу. Прохід до Центрального району тепер відкритий.»"
  };

  function storyState(save) {
    save.story ??= {};
    save.story.explore ??= { part: 0, kills: 0 };
    return save.story.explore;
  }

  // Відкрито Центральний район (після завершення «Час дослідити»)
  function isCentralOpen(save) {
    return storyState(save).part > EXPLORE.parts.length;
  }

  // Що показати в Адміністратора: null — ще зарано (рівень < 10)
  function exploreInfo(save) {
    const st = storyState(save);
    if (st.part === 0 && save.character.level < EXPLORE.minLevel) return null;
    const total = EXPLORE.parts.length;
    if (st.part > total) return { done: true, st, total };
    if (st.part === 0) return { canStart: true, st, total };
    const part = EXPLORE.parts[st.part - 1];
    const progress = part.bring
      ? part.bring.map(b => ({ label: RPG.ITEMS[b.id].name, have: Math.min(RPG.countItem(save, b.id), b.qty), need: b.qty }))
      : [{ label: "Убито " + TARGETS[part.kill.target].name, have: Math.min(st.kills, part.kill.need), need: part.kill.need }];
    return { st, total, part, index: st.part, progress, complete: progress.every(p => p.have >= p.need) };
  }

  function describeExploreReward(part) {
    const r = part.reward;
    const out = [];
    if (r.exp) out.push(`${r.exp} EXP`);
    for (const it of r.items) out.push(`${RPG.ITEMS[it.id].name} × ${it.qty}`);
    if (r.unlock === "center") out.push("прохід до Центрального району");
    return out.join(", ");
  }

  function startExplore(save) {
    const info = exploreInfo(save);
    if (!info?.canStart) return { ok: false, reason: "Особливе завдання зараз не можна взяти." };
    info.st.part = 1;
    info.st.kills = 0;
    return { ok: true };
  }

  // Здати поточну частину. Повертає { ok, part, levelUps, finished }
  function turnInExplore(save) {
    const info = exploreInfo(save);
    if (!info || !info.part) return { ok: false, reason: "Немає активної частини завдання." };
    if (!info.complete) return { ok: false, reason: "Частина завдання ще не виконана." };
    const part = info.part;
    for (const b of part.bring || []) RPG.removeItem(save, b.id, b.qty);
    for (const it of part.reward.items) RPG.addItem(save, it.id, it.qty);
    const levelUps = part.reward.exp ? RPG.addExp(save, part.reward.exp) : [];
    info.st.part++;
    info.st.kills = 0;
    return { ok: true, part, levelUps, finished: info.st.part > EXPLORE.parts.length };
  }

  // ---------- Квест «Шлях професії» ----------
  const PROFESSION = {
    name: "Шлях професії",
    parts: [
      { title: "Випробування силою",
        text: "«Селянином можна прожити все життя. Але ти вже більше, ніж селянин. Доведи це: убий 40 вовків на Лісовій стежці.»",
        kill: { target: "wolf", need: 40 } },
      { title: "Випробування витримкою",
        text: "«Тепер — Печера в лісі. Принеси 30 слизу. Тренер тим часом подивиться, чого ти навчився і до чого лежить твоя душа.»",
        bring: [{ id: "slime_gel", qty: 30 }] }
    ]
  };

  function professionState(save) {
    save.story ??= {};
    save.story.profession ??= { part: 0, kills: 0, result: null };
    return save.story.profession;
  }

  // null — квест ще не доступний (не Селянин або рівень < 15)
  function professionInfo(save) {
    const st = professionState(save);
    const total = PROFESSION.parts.length;
    if (st.part > total) return { done: true, st, total, result: st.result };
    const ch = save.character;
    if (st.part === 0) {
      if (ch.classId !== RPG.DEFAULT_CLASS || ch.level < RPG.PROFESSION_LEVEL) return null;
      return { canStart: true, st, total };
    }
    const part = PROFESSION.parts[st.part - 1];
    const progress = part.bring
      ? part.bring.map(b => ({ label: RPG.ITEMS[b.id].name, have: Math.min(RPG.countItem(save, b.id), b.qty), need: b.qty }))
      : [{ label: "Убито " + TARGETS[part.kill.target].name, have: Math.min(st.kills, part.kill.need), need: part.kill.need }];
    return { st, total, part, index: st.part, progress, complete: progress.every(p => p.have >= p.need) };
  }

  function startProfession(save) {
    const info = professionInfo(save);
    if (!info?.canStart) return { ok: false, reason: `Квест доступний Селянину з ${RPG.PROFESSION_LEVEL} рівня.` };
    info.st.part = 1;
    info.st.kills = 0;
    return { ok: true };
  }

  // Здати частину. Остання частина — зміна професії.
  // Повертає { ok, finished, classId, change }
  function turnInProfession(save) {
    const info = professionInfo(save);
    if (!info || !info.part) return { ok: false, reason: "Немає активної частини квесту." };
    if (!info.complete) return { ok: false, reason: "Частина квесту ще не виконана." };
    for (const b of info.part.bring || []) RPG.removeItem(save, b.id, b.qty);
    info.st.part++;
    info.st.kills = 0;
    if (info.st.part <= PROFESSION.parts.length) return { ok: true, finished: false };
    const classId = RPG.pickProfession(save);
    const change = RPG.changeClass(save, classId, { force: true });
    if (!change.ok) { info.st.part--; return change; }
    info.st.result = classId;
    return { ok: true, finished: true, classId, change };
  }

  // ---------- Нагороди за чемпіонів ----------
  function addChampionBounty(save, enemyId) {
    const q = state(save);
    const b = RPG.championBounty(enemyId);
    const bounty = { id: "b" + q.nextId++, enemyId, name: RPG.ENEMIES[enemyId]?.name || enemyId, exp: b.exp, gold: b.gold };
    q.bounties.push(bounty);
    return bounty;
  }

  function claimBounty(save, bountyId) {
    const q = state(save);
    const i = q.bounties.findIndex(b => b.id === bountyId);
    if (i < 0) return { ok: false, reason: "Нагороди немає." };
    const [b] = q.bounties.splice(i, 1);
    save.character.gold += b.gold;
    const levelUps = RPG.addExp(save, b.exp);
    return { ok: true, bounty: b, levelUps };
  }

  // ---------- Журнал квестів (сторінка «Персонаж») ----------
  // [{ title, lines: [рядки прогресу], where, ready }]
  const GUILD_PLACE = "Адміністратор гільдії — Місто, Південний район";
  function questLog(save) {
    const out = [];
    const ex = exploreInfo(save);
    if (ex?.part) out.push({ title: `«${EXPLORE.name}» (${ex.index}/${ex.total}): ${ex.part.title}`, special: true,
      lines: ex.progress.map(p => `${p.label}: ${p.have}/${p.need}`), where: GUILD_PLACE, ready: ex.complete });
    const pr = professionInfo(save);
    if (pr?.part) out.push({ title: `«${PROFESSION.name}» (${pr.index}/${pr.total}): ${pr.part.title}`, special: true,
      lines: pr.progress.map(p => `${p.label}: ${p.have}/${p.need}`), where: GUILD_PLACE, ready: pr.complete });
    for (const quest of state(save).active) {
      const have = questProgress(save, quest);
      out.push({ title: questTitle(quest), lines: [`Виконано: ${have}/${quest.need}`, `Нагорода: ${describeReward(quest.reward)}`],
        where: GUILD_PLACE, ready: have >= quest.need });
    }
    for (const b of state(save).bounties) {
      out.push({ title: `Нагорода за чемпіона: ${b.name}`, lines: [`${b.exp} EXP, ${b.gold} золота`], where: GUILD_PLACE, ready: true });
    }
    return out;
  }

  Object.assign(RPG, {
    addChampionBounty, claimBounty, questLog,
    QUEST_MAX_ACTIVE: MAX_ACTIVE, QUEST_MAX_ACTIVE_PRO: MAX_ACTIVE_PRO, QUEST_MAX_SAME: MAX_SAME, questMaxActive: maxActive, questSameCount: sameCount,
    questState: state, fillOffers, questTitle, questProgress, isQuestComplete: isComplete,
    describeReward, acceptQuest, abandonQuest, turnInQuest, questOnKill,
    EXPLORE, storyState, isCentralOpen, exploreInfo, describeExploreReward, startExplore, turnInExplore,
    PROFESSION, professionState, professionInfo, startProfession, turnInProfession
  });
})(window.RPG);
