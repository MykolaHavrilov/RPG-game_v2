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
//   3) убити 70 слаймів → відкривається Дошка оголошень біля Мерії (найм у групу)
// Сам Центральний район (Мерія, Розпорядник Захар) відкритий з CENTRAL_MIN_LEVEL (6) рівня.
// Стан: save.story.explore = { part: 0 (не взято) | 1..3 (поточна частина) | 4 (виконано), kills,
//        announced: true — повідомлення про відкриття Дошки оголошень уже показано (поле в Артеміди приховане) }
//
// КВЕСТ «ШЛЯХ ПРОФЕСІЇ» (з 12 рівня Селянина, видає Адміністратор гільдії) — 3 гілки
//   (воїн / чародій / дух) по 10 невеликих завдань, нагорода — досвід (до 14 рівня 80%).
//   Професія — на 15 рівні, нагорода за весь шлях. Докладно — див. розділ «Шлях професії» нижче.
//   Квест видається лише тому, хто підходить хоча б під одну професію (data/classes.js →
//   requires.attrs — мінімум вкладених очок атрибутів); інакше — відмова і порада йти до Захара.
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
    slime: { name: "слаймів", match: id => id.startsWith("slime"), minLevel: 6 },
    slime_king: { name: "Королів слайм", match: id => id === "slime_king", minLevel: 99 },
    white_wolf: { name: "білих вовків", match: id => id === "wolf3", minLevel: 99 }
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
    const parts = r.exp == null ? [`${r.gold} золота`] : [`${r.exp} EXP`, `${r.gold} золота`];
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
    const g = grantPartyExp(save, quest.reward.exp);
    return { ok: true, quest, levelUps: g.levelUps, heroes: g.heroes, expText: g.text };
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
    // Квест професії: частина «убити» — кожному герою групи, у кого зараз таке завдання
    const members = RPG.partyMembers ? RPG.partyMembers(save) : [save];
    for (const ms of members) {
      const ps = professionState(ms);
      const ppart = !ps.result && branchOf(ms)?.parts[ps.part - 1];
      if (ppart?.kill && TARGETS[ppart.kill.target].match(enemyId) && ps.kills < ppart.kill.need) {
        ps.kills++;
        const who = members.length > 1 ? `${ms.character.name}, ` : "";
        lines.push(`«${who}${professionName(ms)}»: ${TARGETS[ppart.kill.target].name} ${ps.kills}/${ppart.kill.need}`);
      }
    }
    // Квест капітана варти: частина «убити»
    const gs = gateState(save);
    const gpart = GATE.parts[gs.part - 1];
    if (gpart?.kill && TARGETS[gpart.kill.target].match(enemyId) && gs.kills < gpart.kill.need) {
      gs.kills++;
      lines.push(`«${GATE.name}»: ${TARGETS[gpart.kill.target].name} ${gs.kills}/${gpart.kill.need}`);
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
            "там інші авантюристи шукають собі напарників, щоб об'єднатися в групу. Тепер і вам там можна шукати товаришів.»"
  };

  function storyState(save) {
    save.story ??= {};
    save.story.explore ??= { part: 0, kills: 0 };
    return save.story.explore;
  }

  // Центральний район (Мерія, Розпорядник Захар) — з 6 рівня головного героя
  const CENTRAL_MIN_LEVEL = 6;
  // Дошка оголошень (найм у групу) — після завершення «Час дослідити»
  function isHiringOpen(save) {
    return storyState(save).part > EXPLORE.parts.length;
  }
  function isCentralOpen(save) {
    return save.character.level >= CENTRAL_MIN_LEVEL || isHiringOpen(save);
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

  function describeExploreReward(part, noExp = false) {
    const r = part.reward;
    const out = [];
    if (r.exp && !noExp) out.push(`${r.exp} EXP`);
    for (const it of r.items) out.push(`${RPG.ITEMS[it.id].name} × ${it.qty}`);
    if (r.unlock === "center") out.push("Дошка оголошень біля Мерії (найм у групу)");
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
    const g = part.reward.exp ? grantPartyExp(save, part.reward.exp) : { levelUps: [], heroes: [], text: "" };
    info.st.part++;
    info.st.kills = 0;
    return { ok: true, part, levelUps: g.levelUps, heroes: g.heroes, expText: g.text, finished: info.st.part > EXPLORE.parts.length };
  }

  // ---------- Квест «Шлях професії» ----------
  // Три гілки з різними назвами й завданнями (branch):
  //   warrior — «Шлях воїна» (Воїн, Лицар, Берсерк, Розбійник, Мисливець, Паладин)
  //   mage    — «Шлях чародія» (маги вогню, води, вітру, землі)
  //   spirit  — «Шлях духу» (Жрець, Монах)
  // Квест береться з PROFESSION_QUEST_LEVEL (12) рівня Селянина; гілку визначають професії, під які герой
  // підходить (data/classes.js → requires.attrs); якщо підходить під кілька гілок — обирає сам.
  // 10 невеликих завдань по черзі. Нагорода за кожне — лише досвід, і рахується вона в момент здачі:
  //   після завдання i герой має опинитися в точці startExp + (END − startExp) × weight(i),
  //   де END — 14 рівень і 80% (PROFESSION_END), тож досвід з монстрів, убитих дорогою, уже врахований.
  //   Після 10-го завдання герой рівно на 14 рівні 80% (якщо не набив більше сам — тоді мінімум MIN_REWARD).
  // Нагороди НЕ показуються до здачі. Нагорода за весь шлях (11-й крок, з PROFESSION_LEVEL — 15 рівня):
  //   досвід до 15 рівня і нова професія (з професій гілки, під які герой підходить; вибір — за гравцем).
  // Стан: { part: 0 | 1..10 | 11 (усе виконано, лишилось завершити), kills,
  //        branch, startExp, rewards: [EXP за кожне], result: ID професії (квест завершено) }
  //   Головний герой — save.story.profession; напарник — його character.profQuest (party.js → memberSave).
  // КОЖЕН ГЕРОЙ ГРУПИ проходить шлях сам: усі функції нижче приймають «вигляд» героя (memberSave),
  //   умови й гілки — за його власними вкладеними атрибутами, професію обирає гравець для кожного окремо.
  //   Кілька героїв можуть іти шляхом одночасно: убиті групою вороги зараховуються кожному, у кого таке
  //   завдання (questOnKill); речі «принести» кожен здає окремо зі спільного інвентаря.
  const PROFESSION_QUEST_LEVEL = 12;
  const PROFESSION_END = { level: 14, pct: 0.8 };
  const PROFESSION_WEIGHTS = [6, 7, 8, 9, 10, 10, 11, 12, 13, 14];   // частки (%) шляху 12 → 14,80% для завдань 1–10
  const PROFESSION_MIN_REWARD = 1000;
  const k = (target, need) => ({ kill: { target, need } });
  const br = (id, qty) => ({ bring: [{ id, qty }] });
  const PROFESSION_BRANCHES = {
    warrior: {
      name: "Шлях воїна: Гарт Перуна",
      classes: ["warrior", "knight", "berserker", "rogue", "hunter", "paladin"],
      intro: "«Перун не дає меча тому, хто не тримав його в бурю. Пройди десять випробувань — і гільдія визнає тебе воїном.»",
      parts: [
        { title: "Перша кров", text: "«Вовки знову підходять до Лісової стежки. Убий 15 — подивимось, як ти тримаєш зброю.»", ...k("wolf", 15) },
        { title: "Шкури для щитів", text: "«Щитникам Застави бракує шкіри на обтяжку. Принеси 10 вовчих шкур.»", ...br("wolf_pelt", 10) },
        { title: "Вартовий льоху", text: "«Щури підточують комори з харчами для варти. Убий 20 — це теж служба.»", ...k("rat", 20) },
        { title: "Ікла на обереги", text: "«Воїни Перуна носять вовчі ікла на шиї — на удачу в бою. Принеси 10.»", ...br("wolf_fang", 10) },
        { title: "Слизька загроза", text: "«Із Печери в лісі лізуть слайми. Зачисти 15, поки не дісталися до стежки.»", ...k("slime", 15) },
        { title: "Біла зграя", text: "«Білі вовки — найсильніші в лісі. Убий 10, і про тебе заговорять у гільдії.»", ...k("white_wolf", 10) },
        { title: "Броня з білого хутра", text: "«Біле хутро тримає холод і удар. Принеси 6 білих вовчих шкур для зброярні.»", ...br("white_pelt", 6) },
        { title: "Печерний дозор", text: "«Стань у дозор у Печері в лісі й винищ 20 слаймів.»", ...k("slime", 20) },
        { title: "Слиз для гарту", text: "«Ковалі гартують клинки в слизу — так кажуть старі майстри. Принеси 15.»", ...br("slime_gel", 15) },
        { title: "Корона слизу", text: "«Останнє випробування: здолай Короля слайм. Хто переміг короля — той воїн.»", ...k("slime_king", 1) }
      ]
    },
    mage: {
      name: "Шлях чародія: Таємниці Велеса",
      classes: ["mage_fire", "mage_water", "mage_wind", "mage_earth"],
      intro: "«Велес відкриває таємниці лише терплячим. Десять доручень — і ти доторкнешся до стихій.»",
      parts: [
        { title: "Збір реагентів", text: "«Для першого обряду потрібен слиз — найчистіша волога печери. Принеси 10.»", ...br("slime_gel", 10) },
        { title: "Хвости для зілля", text: "«Щурячі хвости — основа зілля прозріння. Принеси 15.»", ...br("rat_tail", 15) },
        { title: "Нічні голоси", text: "«Вовче виття заважає слухати знаки. Убий 15 вовків на Лісовій стежці.»", ...k("wolf", 15) },
        { title: "Ікла місяця", text: "«Вовчі ікла вбирають місячне світло. Принеси 8 для амулетів-фокусів.»", ...br("wolf_fang", 8) },
        { title: "Слиз, що світиться", text: "«Слайми печери сповнені дикої сили. Розвій 15 — і відчуєш, як вона тече крізь тебе.»", ...k("slime", 15) },
        { title: "Шкурки для сувоїв", text: "«Писати закляття треба на шкурі, а не на папері. Принеси 8 щурячих шкурок.»", ...br("rat_skin", 8) },
        { title: "Холод білого вовка", text: "«У білих вовках живе зимова стихія. Убий 8 і запам'ятай той холод.»", ...k("white_wolf", 8) },
        { title: "Сувій на білому хутрі", text: "«Найсильніші сувої пишуть на білому хутрі. Принеси 5 білих вовчих шкур.»", ...br("white_pelt", 5) },
        { title: "Чиста печера", text: "«Очисти Печеру в лісі: розвій 20 слаймів.»", ...k("slime", 20) },
        { title: "Серце слизу", text: "«Король слайм носить у собі серце печери. Здолай його — і стихії відгукнуться на твій поклик.»", ...k("slime_king", 1) }
      ]
    },
    spirit: {
      name: "Шлях духу: Світло Даждьбога",
      classes: ["priest", "monk"],
      intro: "«Сила духу — у служінні. Допоможи людям Застави десять разів — і Даждьбог дасть тобі своє світло.»",
      parts: [
        { title: "Тиша ферми", text: "«Щури не дають спокою людям на Фермі. Прожени 20.»", ...k("rat", 20) },
        { title: "Дари для Храму", text: "«Храм збирає шкурки, щоб зігріти біженців. Принеси 10 щурячих шкурок.»", ...br("rat_skin", 10) },
        { title: "Захист пастухів", text: "«Вовки ріжуть худобу. Убий 15 — пастухи помоляться за тебе.»", ...k("wolf", 15) },
        { title: "Шкури для бідних", text: "«Наближається зима. Принеси 10 вовчих шкур для тих, хто втратив дім.»", ...br("wolf_pelt", 10) },
        { title: "Очищення печери", text: "«Печера в лісі гниє від слизу. Очисти її від 15 слаймів.»", ...k("slime", 15) },
        { title: "Ікла для оберегів", text: "«Жерці роблять з вовчих іклів обереги для дітей. Принеси 8.»", ...br("wolf_fang", 8) },
        { title: "Білий звір", text: "«Білі вовки нападають уже й на подорожніх. Зупини 8.»", ...k("white_wolf", 8) },
        { title: "Слиз для свічок", text: "«Зі слизу печери виходять свічки, що горять усю ніч. Принеси 12 для Храму.»", ...br("slime_gel", 12) },
        { title: "Біле хутро для вівтаря", text: "«Вівтар Даждьбога вкривають білим хутром. Принеси 5 білих вовчих шкур.»", ...br("white_pelt", 5) },
        { title: "Король у темряві", text: "«У глибині печери сидить Король слайм — від нього вся гниль. Здолай його.»", ...k("slime_king", 1) }
      ]
    }
  };
  const PROFESSION_TOTAL = 10;
  const PROFESSION = { name: "Шлях професії", branches: PROFESSION_BRANCHES, total: PROFESSION_TOTAL };

  function professionState(save) {
    let st;
    if (save.memberIndex) st = save.character.profQuest ??= { part: 0, kills: 0, result: null };   // напарник
    else { save.story ??= {}; st = save.story.profession ??= { part: 0, kills: 0, result: null }; }
    // Старі збереження: квест з 2 частин без гілки — починається заново (професію, якщо вже отримана, не чіпаємо)
    if (!st.result && st.part > 0 && !st.branch) { st.part = 0; st.kills = 0; }
    st.rewards ??= [];
    return st;
  }
  function branchOf(save) { return PROFESSION_BRANCHES[professionState(save).branch] || null; }
  // Назва квесту для героя (до вибору гілки — загальна)
  function professionName(save) { return branchOf(save)?.name || PROFESSION.name; }
  // Гілки, під які герой зараз підходить
  function professionBranches(save) {
    const ok = RPG.eligibleProfessions(save);
    return Object.keys(PROFESSION_BRANCHES).filter(b => PROFESSION_BRANCHES[b].classes.some(c => ok.includes(c)));
  }
  // Досвід, у якому має опинитися герой після завдання index (1..10)
  function professionCheckpoint(save, index) {
    const st = professionState(save);
    const table = RPG.getClass(save.character.classId).levelTable;
    const lo = RPG.expForLevel(table, PROFESSION_END.level), hi = RPG.expForLevel(table, PROFESSION_END.level + 1);
    const end = Math.round(lo + (hi - lo) * PROFESSION_END.pct);
    const start = Math.min(st.startExp ?? save.character.exp, end);
    const w = PROFESSION_WEIGHTS.slice(0, index).reduce((a, b) => a + b, 0) / 100;
    return Math.round(start + (end - start) * w);
  }

  // null — квест ще не доступний (не Селянин або рівень < 12)
  function professionInfo(save) {
    const st = professionState(save);
    const total = PROFESSION_TOTAL;
    const ch = save.character;
    if (st.result) return { done: true, st, total, result: st.result };
    if (st.part === 0) {
      if (ch.classId !== RPG.DEFAULT_CLASS || ch.level < PROFESSION_QUEST_LEVEL) return null;
      return { canStart: true, st, total, branches: professionBranches(save) };
    }
    const branch = branchOf(save);
    if (st.part > total) {
      // Усі 10 завдань виконано — лишилось завершити шлях (з 15 рівня — або досвід доллється нагородою)
      return { final: true, st, total, branch, complete: true };
    }
    const part = branch.parts[st.part - 1];
    const progress = part.bring
      ? part.bring.map(b => ({ label: RPG.ITEMS[b.id].name, have: Math.min(RPG.countItem(save, b.id), b.qty), need: b.qty }))
      : [{ label: "Убито " + TARGETS[part.kill.target].name, have: Math.min(st.kills, part.kill.need), need: part.kill.need }];
    return { st, total, branch, part, index: st.part, progress, complete: progress.every(p => p.have >= p.need) };
  }

  // Відмова, якщо герой не підходить під жодну професію (умови — data/classes.js → requires.attrs)
  const PROFESSION_REFUSE = "«Не бачу в тобі жодного шляху — сили розкидані навмання. Піди до Розпорядника Захара в Мерії " +
    "(Центральний район): він підкаже, як виправити твої характеристики, а тоді повертайся.»";

  // branch — обрана гілка; якщо гілок кілька, а вибору ще немає — { ok: false, choose: [ids] }
  function startProfession(save, branch = null) {
    const info = professionInfo(save);
    if (!info?.canStart) return { ok: false, reason: `Квест доступний Селянину з ${PROFESSION_QUEST_LEVEL} рівня.` };
    const can = professionBranches(save);
    if (!can.length) return { ok: false, refused: true, reason: PROFESSION_REFUSE };
    if (!branch && can.length === 1) branch = can[0];
    if (!branch || !can.includes(branch)) return { ok: false, choose: can };
    Object.assign(info.st, { part: 1, kills: 0, branch, startExp: save.character.exp, rewards: [] });
    return { ok: true, branch, name: PROFESSION_BRANCHES[branch].name };
  }

  // Здати завдання 1–10 → { ok, finished: false, exp, levelUps, allDone }
  // Завершити шлях (після 10-го) → потрібна професія classId з гілки; без неї — { ok: false, choose: [ids] }
  //   → { ok, finished: true, classId, change, exp }
  function turnInProfession(save, classId = null) {
    const info = professionInfo(save);
    if (!info || info.done || info.canStart) return { ok: false, reason: "Немає активного завдання." };
    const st = info.st;
    if (!info.final) {
      if (!info.complete) return { ok: false, reason: "Завдання ще не виконане." };
      for (const b of info.part.bring || []) RPG.removeItem(save, b.id, b.qty);
      const exp = Math.max(PROFESSION_MIN_REWARD, professionCheckpoint(save, st.part) - save.character.exp);
      const levelUps = RPG.addExp(save, exp);
      st.rewards.push(exp);
      st.part++;
      st.kills = 0;
      return { ok: true, finished: false, exp, levelUps, allDone: st.part > PROFESSION_TOTAL };
    }
    const choose = RPG.eligibleProfessions(save).filter(c => info.branch.classes.includes(c));
    if (!choose.length) return { ok: false, refused: true, reason: PROFESSION_REFUSE };
    if (!classId || !choose.includes(classId)) return { ok: false, choose };
    // Нагорода за весь шлях: досвід до 15 рівня і нова професія
    const ch = save.character;
    const need = RPG.expForLevel(RPG.getClass(ch.classId).levelTable, RPG.PROFESSION_LEVEL) - ch.exp;
    const exp = need > 0 ? need : 0;
    if (exp) RPG.addExp(save, exp);
    const change = RPG.changeClass(save, classId, { force: true });
    if (!change.ok) return change;
    st.result = classId;
    st.part = PROFESSION_TOTAL + 2;
    return { ok: true, finished: true, classId, change, exp };
  }

  // ---------- Квест капітана варти «Варта Центральної брами» ----------
  // Видає Капітан Северин Залізняк (Дубова Застава, Північний район — відкритий після професії).
  // Після здачі брама відчиняється: можна йти в Темний ліс.
  const GATE = {
    name: "Варта Центральної брами",
    reward: { exp: 15000 },
    parts: [
      { title: "Довести силу",
        text: "«За брамою — Темний ліс, і новачки звідти не вертаються. Доведи, що ти не з них: здолай трьох Королів слайм у Печері в лісі.»",
        kill: { target: "slime_king", need: 3 } },
      { title: "Припаси для варти",
        text: "«Варта мерзне й голодує. Принеси 40 вовчих шкур і 40 желе слизу — і брама для тебе відчиниться.»",
        bring: [{ id: "wolf_pelt", qty: 40 }, { id: "slime_gel", qty: 40 }] }
    ]
  };
  function gateState(save) {
    save.story ??= {};
    save.story.gate ??= { part: 0, kills: 0 };
    return save.story.gate;
  }
  function isGateOpen(save) {
    return gateState(save).part > GATE.parts.length;
  }
  function gateInfo(save) {
    const st = gateState(save);
    const total = GATE.parts.length;
    if (st.part > total) return { done: true, st, total };
    if (st.part === 0) return { canStart: RPG.getClass(save.character.classId).tier > 1, st, total };
    const part = GATE.parts[st.part - 1];
    const progress = part.bring
      ? part.bring.map(b => ({ label: RPG.ITEMS[b.id].name, have: Math.min(RPG.countItem(save, b.id), b.qty), need: b.qty }))
      : [{ label: "Убито " + TARGETS[part.kill.target].name, have: Math.min(st.kills, part.kill.need), need: part.kill.need }];
    return { st, total, part, index: st.part, progress, complete: progress.every(p => p.have >= p.need) };
  }
  function startGate(save) {
    const info = gateInfo(save);
    if (!info.canStart) return { ok: false, reason: "Капітан говорить лише з тими, хто вже має професію." };
    info.st.part = 1; info.st.kills = 0;
    return { ok: true };
  }
  function turnInGate(save) {
    const info = gateInfo(save);
    if (!info.part) return { ok: false, reason: "Немає активної частини квесту." };
    if (!info.complete) return { ok: false, reason: "Частина квесту ще не виконана." };
    for (const b of info.part.bring || []) RPG.removeItem(save, b.id, b.qty);
    info.st.part++; info.st.kills = 0;
    const finished = info.st.part > GATE.parts.length;
    const g = finished ? grantPartyExp(save, GATE.reward.exp) : { levelUps: [], heroes: [], text: "" };
    return { ok: true, finished, levelUps: g.levelUps, heroes: g.heroes, expText: g.text };
  }

  // ---------- Квест Мерії «Збір вугілля» (план крафту, етап 3) ----------
  // Видає Розпорядник Захар (Мерія, Центральний район — з 6 рівня). Принести 1000 вугілля
  // (рахується вугілля будь-якої рідкості, спершу забирається звичайне) — тепло для Застави на зиму.
  // Нагорода: досвід головному герою + срібні злитки; відкривається Спальний район (дім, кузня, склад).
  // Стан: save.story.coal = { part: 0 (не взято) | 1 (взято) | 2 (виконано) }
  const COAL = {
    name: "Збір вугілля",
    need: 1000,
    reward: { exp: 50000, items: [{ id: "silver_ingot", qty: 50 }] },
    text: "«Зима цього року прийде рано, а біженців у Заставі вдвічі більше, ніж місця біля печей. " +
          "Принесіть Мерії тисячу вугілля — і Застава цього не забуде.»"
  };
  const coalGrades = () => ["coal", "coal_magic", "coal_epic", "coal_legendary"].filter(id => RPG.ITEMS[id]);
  function coalState(save) {
    save.story ??= {};
    save.story.coal ??= { part: 0 };
    return save.story.coal;
  }
  function coalHave(save) { return coalGrades().reduce((n, id) => n + RPG.countItem(save, id), 0); }
  function isCoalDone(save) { return coalState(save).part >= 2; }
  function coalInfo(save) {
    const st = coalState(save);
    const have = Math.min(coalHave(save), COAL.need);
    return { st, taken: st.part === 1, done: st.part >= 2, canStart: st.part === 0 && RPG.isCentralOpen(save),
             have, need: COAL.need, complete: st.part === 1 && have >= COAL.need };
  }
  function startCoal(save) {
    const info = coalInfo(save);
    if (!info.canStart) return { ok: false, reason: "Завдання зараз не можна взяти." };
    info.st.part = 1;
    return { ok: true };
  }
  function turnInCoal(save) {
    const info = coalInfo(save);
    if (!info.taken) return { ok: false, reason: "Завдання не взято." };
    if (!info.complete) return { ok: false, reason: `Потрібно ${COAL.need} вугілля (є ${info.have}).` };
    for (const it of COAL.reward.items) {
      if (RPG.fitQty(save, it.id, it.qty) < it.qty) return { ok: false, reason: "Звільніть місце в інвентарі для нагороди." };
    }
    let left = COAL.need;
    for (const id of coalGrades()) {                      // спершу звичайне, потім рідкісніше
      const take = Math.min(left, RPG.countItem(save, id));
      if (take) { RPG.removeItem(save, id, take); left -= take; }
      if (!left) break;
    }
    for (const it of COAL.reward.items) RPG.addItem(save, it.id, it.qty);
    info.st.part = 2;
    const g = grantPartyExp(save, COAL.reward.exp);
    return { ok: true, levelUps: g.levelUps, heroes: g.heroes, expText: g.text };
  }

  // ---------- Нагороди за чемпіонів ----------
  function addChampionBounty(save, enemyId) {
    const q = state(save);
    const b = RPG.championBounty(enemyId);
    const bounty = { id: "b" + q.nextId++, enemyId, name: RPG.ENEMIES[enemyId]?.name || enemyId, exp: b.exp, gold: b.gold };
    q.bounties.push(bounty);
    return bounty;
  }

  // ---------- Бонуси до досвіду нагород ----------
  // EXP героя = N + N × (k% + j% + r% + x%), де N — досвід за завдання:
  //   k — за групу героїв: +10% за кожного героя понад першого (як у боях);
  //   j — тимчасові ефекти: Джерело Велеса (+VELES.expBonusPct, поки діє);
  //   r — руни й вдягнені речі цього героя: стат expPct речей (rarity.js → itemStats) і руни в гніздах
  //       (ref.runes = [id рун] — гнізда з'являться в оновленні рун; руна «Вуньо» дає +4…12%);
  //   x — інші джерела: RPG.EXP_BONUS_EXTRA — масив функцій (save, ms) → [{ label, pct }] (поки порожній).
  // Повертає { k, j, r, x, total, parts: [{ label, pct }] } — total у відсотках.
  const EXP_BONUS_EXTRA = [];
  function runeExpPct(runeId) {
    const it = RPG.ITEMS[runeId];
    const R = it?.type === "rune" && RPG.RUNES?.[it.rune];
    if (!R || R.stat !== "expPct") return 0;
    const gi = RPG.RUNE_GRADES?.[it.grade]?.val ?? -1;
    return gi >= 0 ? parseFloat(String(R.vals[gi]).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0 : 0;
  }
  function expBonusParts(save, ms = save) {
    const parts = [];
    const size = RPG.partySize ? RPG.partySize(save) : 1;
    const k = 10 * Math.max(0, size - 1);
    if (k) parts.push({ label: `група з ${size} героїв`, pct: k });
    const j = springLeft(save) ? VELES.expBonusPct : 0;
    if (j) parts.push({ label: "Джерело Велеса", pct: j });
    let r = 0;
    for (const slot in ms.equipment || {}) {
      const ref = ms.equipment[slot];
      if (!ref) continue;
      r += (RPG.itemStats ? RPG.itemStats(ref).expPct : 0) || 0;
      for (const rid of (typeof ref === "object" && ref.runes) || []) r += runeExpPct(rid);
    }
    r = Math.round(r * 10) / 10;
    if (r) parts.push({ label: "руни й речі", pct: r });
    let x = 0;
    for (const fn of EXP_BONUS_EXTRA) {
      for (const pt of fn(save, ms) || []) { if (pt?.pct) { x += pt.pct; parts.push(pt); } }
    }
    return { k, j, r, x, total: k + j + r + x, parts };
  }

  // Досвід квесту N — КОЖНОМУ герою групи: 100% + бонуси expBonusParts (у кожного свої руни й речі).
  // Так нараховують усі квести: завдання гільдії, «Час дослідити», «Варта Центральної брами», «Збір вугілля»,
  // нагороди за чемпіонів. Виняток — «Шлях професії»: він у кожного героя свій і веде рівно до 14 рівня 80%.
  // Повертає { heroes: [{ name, exp, bonusPct, parts, levelUps }], levelUps (головного), text — опис для повідомлення }
  function grantPartyExp(save, N) {
    const members = RPG.partyMembers ? RPG.partyMembers(save) : [save];
    const heroes = members.map(ms => {
      const bonus = expBonusParts(save, ms);
      const exp = Math.round(N * (1 + bonus.total / 100));
      const levelUps = RPG.addExp(ms, exp);
      return { name: ms.character.name, exp, bonusPct: bonus.total, parts: bonus.parts, levelUps };
    });
    return { heroes, levelUps: heroes[0].levelUps, text: partyExpText(heroes, N) };
  }
  // «640 EXP (200 + 220%: група з 3 героїв +20%, …)» — для одного героя без імені, для групи — з іменами
  function partyExpText(heroes, N) {
    const one = h => `${h.exp} EXP` + (h.bonusPct ? ` (${N} + ${h.bonusPct}%: ${h.parts.map(p => `${p.label} +${p.pct}%`).join(", ")})` : "") +
      (h.levelUps.length ? `, новий рівень ${h.levelUps[h.levelUps.length - 1]}!` : "");
    return heroes.length > 1 ? heroes.map(h => `${h.name}: ${one(h)}`).join("; ") : one(heroes[0]);
  }

  // Нагорода за чемпіона: золото — у спільний гаманець; досвід — КОЖНОМУ герою групи:
  //   100% досвіду завдання + бонуси (expBonusParts — у кожного свої руни й речі).
  // Повертає { ok, bounty, heroes: [{ name, exp, bonusPct, parts, levelUps }], levelUps (головного) }
  function claimBounty(save, bountyId) {
    const q = state(save);
    const i = q.bounties.findIndex(b => b.id === bountyId);
    if (i < 0) return { ok: false, reason: "Нагороди немає." };
    const [b] = q.bounties.splice(i, 1);
    save.character.gold += b.gold;
    const g = grantPartyExp(save, b.exp);
    return { ok: true, bounty: b, heroes: g.heroes, levelUps: g.levelUps, expText: g.text };
  }
  // Текст нагороди за чемпіона для повідомлення й журналу
  function bountyRewardText(res) {
    const txt = `Нагорода за чемпіона «${res.bounty.name}»: +${res.bounty.gold} золота; досвід — ${res.expText}`;
    return txt.endsWith("!") ? txt : txt + ".";
  }

  // ---------- Квест «Долоні Велеса» (з 12 рівня головного героя) ----------
  // 1) На 12 рівні до героя підходить незнайомець і підкидає «Дивну сферу» (orb_veles) — вікно на сторінці «Локація».
  // 2) Розпитати про сферу: Сестра Ївга (Храм) або Розпорядник Захар (Мерія) радять спитати шинкаря Остапа.
  // 3) Остап чув від мандрівників про Велесові долоні в Храмі — радить спитати Сестру Ївгу.
  // 4) Ївга пригадує і веде до вівтаря у внутрішньому дворі Храму: висохлий фонтан зі статуєю Велеса,
  //    на долонях — виступ у формі ромба. З'являється «Внутрішній двір» на сторінці Храму.
  // 5) Покласти сферу на долоні статуї: 5 секунд нічого, потім з глечика біля ніг статуї тече блакитна вода
  //    й наповнює фонтан. Сфера лишається на статуї.
  // Джерело Велеса: випити води — уся група отримує +200% досвіду за бої (до досвіду з бонусом групи)
  //   на 15 хвилин реального часу (і поки гра закрита теж). Після того як дія скінчилась — перерва 1 година
  //   (cooldownMs), лише тоді можна пити знову.
  // Стан: save.story.veles = { stage: 0..5 } (5 — джерело відкрите), save.spring = { until, next }
  //   until — до коли діє бонус, next — з якого часу можна пити знову
  const VELES = {
    name: "Долоні Велеса",
    minLevel: 12,
    expBonusPct: 200,
    durationMs: 15 * 60 * 1000,
    cooldownMs: 60 * 60 * 1000,   // перерва після закінчення дії
    waitMs: 5000,          // скільки «нічого не відбувається» після того, як сферу поклали
    stages: {
      1: "Дізнатися, що це за сфера: розпитати людей у Заставі чи в Храмі.",
      2: "Спитати шинкаря Остапа — до нього заходять мандрівники й путівниці з усіх земель.",
      3: "Остап радить спитати Сестру Ївгу в Храмі.",
      4: "Покласти сферу на долоні статуї Велеса у внутрішньому дворі Храму."
    }
  };
  function velesState(save) {
    save.story ??= {};
    return save.story.veles ??= { stage: 0 };
  }
  // Чи час незнайомцю підійти (герой досяг 12 рівня, сфери ще немає)
  function velesStrangerDue(save) {
    return velesState(save).stage === 0 && save.character.level >= VELES.minLevel;
  }
  // Незнайомець підкидає сферу. Квестовий предмет кладеться в інвентар навіть повний
  function velesGiveOrb(save) {
    const st = velesState(save);
    if (st.stage !== 0) return false;
    if (!RPG.addItem(save, "orb_veles", 1)) save.inventory.push({ id: "orb_veles", qty: 1 });
    st.stage = 1;
    return true;
  }
  // Перехід на наступний етап (з from на from+1), якщо герой саме на ньому
  function velesAdvance(save, from) {
    const st = velesState(save);
    if (st.stage !== from) return false;
    st.stage = from + 1;
    return true;
  }
  // Покласти сферу на статую → { ok } (сама вода з'являється на сторінці після VELES.waitMs)
  function velesPlaceOrb(save) {
    const st = velesState(save);
    if (st.stage !== 4) return { ok: false, reason: "Статуя мовчить." };
    if (RPG.countItem(save, "orb_veles") < 1) return { ok: false, reason: "Сфери немає в інвентарі." };
    RPG.removeItem(save, "orb_veles", 1);
    st.stage = 5;
    return { ok: true };
  }
  function springLeft(save, now = Date.now()) {
    const until = save.spring?.until || 0;
    return Math.max(0, until - now);
  }
  // Скільки мілісекунд до наступної можливості напитися (0 — можна зараз; поки діє бонус — теж > 0)
  function springCooldown(save, now = Date.now()) {
    const sp = save.spring;
    if (!sp) return 0;
    const next = sp.next ?? (sp.until + VELES.cooldownMs);   // старі збереження без next
    return Math.max(0, next - now);
  }
  // Випити з джерела → { ok, minutes } (для всієї групи; діє на досвід за бої)
  function drinkSpring(save, now = Date.now()) {
    if (velesState(save).stage < 5) return { ok: false, reason: "Фонтан сухий." };
    if (springLeft(save, now)) return { ok: false, reason: `Сила джерела ще з вами — близько ${Math.ceil(springLeft(save, now) / 60000)} хв.` };
    const wait = springCooldown(save, now);
    if (wait) return { ok: false, reason: `Вода в чаші ще не набрала сили. Спробуйте за ${Math.ceil(wait / 60000)} хв.` };
    save.spring = { until: now + VELES.durationMs, next: now + VELES.durationMs + VELES.cooldownMs };
    return { ok: true, minutes: VELES.durationMs / 60000 };
  }
  // Множник досвіду за бій (1 або 3)
  function springExpMult(save, now = Date.now()) {
    return springLeft(save, now) ? 1 + VELES.expBonusPct / 100 : 1;
  }

  // ---------- Журнал квестів (сторінка «Персонаж») ----------
  // [{ title, lines: [рядки прогресу], where, ready }]
  const GUILD_PLACE = "Артеміда, адміністратор гільдії — Дубова Застава, Південний район";
  function questLog(save) {
    const out = [];
    const ex = exploreInfo(save);
    if (ex?.part) out.push({ title: `«${EXPLORE.name}» (${ex.index}/${ex.total}): ${ex.part.title}`, special: true,
      lines: ex.progress.map(p => `${p.label}: ${p.have}/${p.need}`), where: GUILD_PLACE, ready: ex.complete });
    // «Шлях професії» — окремо для кожного героя групи
    const members = RPG.partyMembers ? RPG.partyMembers(save) : [save];
    for (const ms of members) {
      const pr = professionInfo(ms);
      const who = members.length > 1 ? `${ms.character.name}: ` : "";
      if (pr?.part) out.push({ title: `${who}«${professionName(ms)}» (${pr.index}/${pr.total}): ${pr.part.title}`, special: true,
        lines: [...pr.progress.map(p => `${p.label}: ${p.have}/${p.need}`), "Нагорода: досвід (скільки — дізнаєтесь при здачі)"],
        where: GUILD_PLACE, ready: pr.complete });
      if (pr?.final) out.push({ title: `${who}«${professionName(ms)}»: завершення шляху`, special: true,
        lines: ["Усі 10 завдань виконано. Нагорода за шлях — ???"], where: GUILD_PLACE, ready: true });
    }
    const vs = velesState(save);
    if (vs.stage >= 1 && vs.stage <= 4) out.push({ title: `«${VELES.name}»`, special: true,
      lines: [VELES.stages[vs.stage]], where: vs.stage >= 3 ? "Храм" : "Дубова Застава, Шинок біля млина, Храм", ready: false });
    const co = coalInfo(save);
    if (co.taken) out.push({ title: `«${COAL.name}»`, special: true,
      lines: [`Вугілля: ${co.have}/${co.need}`, `Нагорода: ${COAL.reward.exp} EXP, срібні злитки ×${COAL.reward.items[0].qty}, Спальний район`],
      where: "Розпорядник Захар — Дубова Застава, Центральний район (Мерія)", ready: co.complete });
    const gt = gateInfo(save);
    if (gt.part) out.push({ title: `«${GATE.name}» (${gt.index}/${gt.total}): ${gt.part.title}`, special: true,
      lines: gt.progress.map(p => `${p.label}: ${p.have}/${p.need}`), where: "Капітан варти — Дубова Застава, Північний район (Центральна брама)", ready: gt.complete });
    for (const quest of state(save).active) {
      const have = questProgress(save, quest);
      out.push({ title: questTitle(quest), lines: [`Виконано: ${have}/${quest.need}`, `Нагорода: ${describeReward(quest.reward)}`],
        where: GUILD_PLACE, ready: have >= quest.need });
    }
    for (const b of state(save).bounties) {
      out.push({ title: `Нагорода за чемпіона: ${b.name}`, lines: [`${b.exp} EXP кожному герою групи + бонуси (група, тимчасові ефекти, руни й речі), ${b.gold} золота`], where: GUILD_PLACE, ready: true });
    }
    return out;
  }

  Object.assign(RPG, {
    addChampionBounty, claimBounty, bountyRewardText, expBonusParts, EXP_BONUS_EXTRA, grantPartyExp, partyExpText, questLog,
    QUEST_MAX_ACTIVE: MAX_ACTIVE, QUEST_MAX_ACTIVE_PRO: MAX_ACTIVE_PRO, QUEST_MAX_SAME: MAX_SAME, questMaxActive: maxActive, questSameCount: sameCount,
    questState: state, fillOffers, questTitle, questProgress, isQuestComplete: isComplete,
    describeReward, acceptQuest, abandonQuest, turnInQuest, questOnKill,
    EXPLORE, storyState, isCentralOpen, isHiringOpen, CENTRAL_MIN_LEVEL, exploreInfo, describeExploreReward, startExplore, turnInExplore,
    VELES, velesState, velesStrangerDue, velesGiveOrb, velesAdvance, velesPlaceOrb, springLeft, springCooldown, drinkSpring, springExpMult,
    PROFESSION, PROFESSION_BRANCHES, PROFESSION_QUEST_LEVEL, PROFESSION_END, PROFESSION_REFUSE,
    professionState, professionInfo, professionName, professionBranches, professionCheckpoint, startProfession, turnInProfession,
    GATE, gateState, isGateOpen, gateInfo, startGate, turnInGate,
    COAL, coalState, coalInfo, isCoalDone, startCoal, turnInCoal
  });
})(window.RPG);
