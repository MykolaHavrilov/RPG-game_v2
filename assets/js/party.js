// ============================================================
// party.js — ГРУПА ГЕРОЇВ
//
// Перший (головний) герой — save.character / save.equipment / save.battleQueue.
// Напарники — save.party: [{ id, character, equipment, battleQueue }], до 5 штук
// (разом з головним — до 6). Інвентар, скриня, золото, локація — СПІЛЬНІ.
//
// memberSave(save, i) повертає «вигляд» сейву для i-го героя (0 — головний):
//   у нього свої character / equipment / battleQueue, а все інше (inventory,
//   chest, location, quests…) береться зі спільного save. Тож будь-які функції,
//   що працюють з одним героєм (calcStats, equipItem, addExp…), працюють і
//   для напарника. Зберігати завжди треба СПІЛЬНИЙ save: RPG.saveGame(save).
//
// Найм — на Дошці оголошень біля Мерії (Центральний район Дубової Застави), який
// відкривається після особливого завдання «Час дослідити» (quests.js).
// Внесок у Мерію за кожного нового напарника — HIRE_COSTS.
//
// Підключається ПІСЛЯ character.js і ДО battle.js.
// ============================================================

(function (RPG) {
  const MAX_PARTY = 6;
  // Внесок у Мерію: 2-й герой групи, 3-й, 4-й, 5-й, 6-й (перший — безкоштовно)
  const HIRE_COSTS = [1000, 3000, 5000, 8000, 12000];
  const BOARD_SIZE = 3;      // скільки оголошень висить на дошці
  const HIRE_MIN_LEVEL = 10; // рівень головного героя для найму

  const NAMES = [
    "Остап", "Марко", "Богдан", "Тарас", "Ярема", "Данило", "Іван", "Северин", "Орест", "Захар",
    "Олена", "Мирослава", "Дарина", "Соломія", "Ярина", "Оксана", "Христина", "Леся", "Устина", "Злата"
  ];

  function partyState(save) {
    save.party ??= [];
    return save.party;
  }

  function partySize(save) {
    return 1 + partyState(save).length;
  }

  // «Вигляд» сейву для героя групи (0 — головний)
  function memberSave(save, index) {
    if (!index) return save;
    const m = partyState(save)[index - 1];
    if (!m) return save;
    const view = Object.create(save);
    view.character = m.character;
    view.equipment = m.equipment;
    view.battleQueue = m.battleQueue;
    view.memberIndex = index;
    // Золото спільне: у напарника воно береться з головного героя (у сейв не пишеться)
    Object.defineProperty(m.character, "gold", {
      configurable: true, enumerable: false,
      get() { return save.character.gold; },
      set(v) { save.character.gold = v; }
    });
    return view;
  }

  // Усі герої групи як «вигляди»: [головний, напарник 1, …]
  function partyMembers(save) {
    return [save, ...partyState(save).map((_, i) => memberSave(save, i + 1))];
  }

  function isDead(ms) {
    return !!ms.character.dead || ms.character.hp <= 0;
  }

  function aliveMembers(save) {
    return partyMembers(save).filter(ms => !isDead(ms));
  }

  // Відновлення HP/MP з часом — для кожного героя групи
  function applyRegenAll(save) {
    let changed = false;
    for (const ms of partyMembers(save)) changed = RPG.applyRegen(ms) || changed;
    return changed;
  }

  // ---------- Дошка оголошень ----------
  function nextHireCost(save) {
    const n = partyState(save).length;
    return n < HIRE_COSTS.length ? HIRE_COSTS[n] : null;
  }

  function takenNames(save) {
    return new Set(partyMembers(save).map(ms => ms.character.name));
  }

  function boardState(save) {
    save.story ??= {};
    const taken = takenNames(save);
    let board = (save.story.board || []).filter(n => !taken.has(n));
    while (board.length < BOARD_SIZE) {
      const free = NAMES.filter(n => !taken.has(n) && !board.includes(n));
      if (!free.length) break;
      board.push(free[Math.floor(Math.random() * free.length)]);
    }
    save.story.board = board;
    return board;
  }

  function refreshBoard(save) {
    save.story ??= {};
    save.story.board = [];
    return boardState(save);
  }

  // Чи можна зараз наймати: { ok, reason }
  function canHire(save) {
    if (!RPG.isCentralOpen(save)) return { ok: false, reason: "Центральний район ще закритий." };
    if (save.character.level < HIRE_MIN_LEVEL) return { ok: false, reason: `Наймати можна з ${HIRE_MIN_LEVEL} рівня головного героя.` };
    if (partySize(save) >= MAX_PARTY) return { ok: false, reason: `У групі вже ${MAX_PARTY} героїв — це максимум.` };
    const cost = nextHireCost(save);
    if (save.character.gold < cost) return { ok: false, reason: `Внесок у Мерію: ${cost} золота (у вас ${save.character.gold}).` };
    return { ok: true, cost };
  }

  // Найняти напарника з дошки: новий Рекрут 1 рівня зі стартовими речами
  function hireMember(save, name) {
    const can = canHire(save);
    if (!can.ok) return can;
    if (!boardState(save).includes(name)) return { ok: false, reason: "Цього оголошення вже немає." };
    const fresh = RPG.createNewSave(name);           // те саме, що стартовий герой
    const ch = fresh.character;
    delete ch.gold;                                   // золото в групі спільне
    ch.regenAt = Date.now();
    const member = {
      id: "m" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
      character: ch,
      equipment: fresh.equipment,                     // дерев'яний меч, лляна сорочка й штани
      battleQueue: ["attack"]
    };
    save.character.gold -= can.cost;
    partyState(save).push(member);
    save.story.board = save.story.board.filter(n => n !== name);
    boardState(save);
    return { ok: true, member, cost: can.cost, index: save.party.length };
  }

  // Звільнити напарника (його речі — у спільний інвентар; внесок не повертається)
  function dismissMember(save, index) {
    const m = partyState(save)[index - 1];
    if (!m) return { ok: false, reason: "Такого героя в групі немає." };
    for (const slot in m.equipment) RPG.addRefToList(save.inventory, m.equipment[slot]);
    save.party.splice(index - 1, 1);
    return { ok: true, name: m.character.name };
  }

  Object.assign(RPG, {
    MAX_PARTY, HIRE_COSTS, HIRE_MIN_LEVEL,
    partyState, partySize, memberSave, partyMembers, aliveMembers, isMemberDead: isDead, applyRegenAll,
    nextHireCost, boardState, refreshBoard, canHire, hireMember, dismissMember
  });
})(window.RPG);
