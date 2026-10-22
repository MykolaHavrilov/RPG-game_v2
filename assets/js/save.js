// ============================================================
// ЗБЕРЕЖЕННЯ: IndexedDB + експорт/імпорт JSON
// Якщо IndexedDB недоступна (деякі браузери при відкритті файлу
// подвійним кліком або в приватному режимі) — сейви пишуться
// в localStorage, щоб гра все одно працювала.
// Усі функції доступні як RPG.saveGame(...), RPG.loadGame(...) і т.д.
// ============================================================

(function (RPG) {
  const DB_NAME = "rpg_game";
  const DB_VERSION = 1;          // версія СТРУКТУРИ бази (сховищ)
  const STORE = "saves";
  const LS_PREFIX = "rpg_save_"; // запасне сховище в localStorage

  const SAVE_VERSION = 6;        // версія ФОРМАТУ сейву (полів усередині)
  const CURRENT_SLOT_KEY = "rpg_current_slot";

  // ---------- Відкриття бази ----------

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB недоступна")); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("База заблокована іншою вкладкою"));
    });
    return dbPromise;
  }

  function idbRequest(mode, action) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  // ---------- Запасне сховище: localStorage ----------

  const lsStore = {
    put(save) { localStorage.setItem(LS_PREFIX + save.id, JSON.stringify(save)); },
    get(id) {
      const raw = localStorage.getItem(LS_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    },
    getAll() {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LS_PREFIX)) {
          try { out.push(JSON.parse(localStorage.getItem(key))); } catch (e) {}
        }
      }
      return out;
    },
    delete(id) { localStorage.removeItem(LS_PREFIX + id); }
  };

  // Пробує IndexedDB; якщо не вийшло — localStorage
  async function withStore(idbAction, lsAction) {
    try {
      return await idbAction();
    } catch (e) {
      console.warn("[save] IndexedDB не спрацювала, використовую localStorage:", e);
      return lsAction();
    }
  }

  // ---------- Основні операції ----------

  async function saveGame(save) {
    // «Вигляд» героя групи (party.js → memberSave) — зберігаємо справжній спільний сейв
    while (save && save.memberIndex && Object.getPrototypeOf(save) !== Object.prototype) save = Object.getPrototypeOf(save);
    save.savedAt = Date.now();
    save.saveVersion = SAVE_VERSION;
    // зберігаємо «чисту» копію, без посилань на щось стороннє
    const copy = JSON.parse(JSON.stringify(save));
    await withStore(
      () => idbRequest("readwrite", store => store.put(copy)),
      () => lsStore.put(copy)
    );
    return save;
  }

  async function loadGame(slotId) {
    if (!slotId) return null;
    let save = await withStore(
      () => idbRequest("readonly", store => store.get(slotId)),
      () => lsStore.get(slotId)
    );
    // сейв міг потрапити в localStorage раніше, коли IndexedDB не працювала
    if (!save) { try { save = lsStore.get(slotId); } catch (e) {} }
    return save ? migrateSave(save) : null;
  }

  async function listSaves() {
    const fromDb = (await withStore(
      () => idbRequest("readonly", store => store.getAll()),
      () => []
    )) || [];
    let fromLs = [];
    try { fromLs = lsStore.getAll(); } catch (e) {}

    // об'єднуємо без дублікатів
    const map = new Map();
    for (const s of [...fromLs, ...fromDb]) if (s && s.id) map.set(s.id, s);
    return [...map.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); // найновіші першими
  }

  async function deleteSave(slotId) {
    await withStore(
      () => idbRequest("readwrite", store => store.delete(slotId)),
      () => {}
    );
    try { lsStore.delete(slotId); } catch (e) {}
    if (getCurrentSlot() === slotId) setCurrentSlot(null);
  }

  // ---------- Поточний слот (яку гру зараз граємо) ----------
  // Зберігається в localStorage, щоб сторінки pages/*.html знали, що завантажити

  function setCurrentSlot(slotId) {
    try {
      if (slotId) localStorage.setItem(CURRENT_SLOT_KEY, slotId);
      else localStorage.removeItem(CURRENT_SLOT_KEY);
    } catch (e) {}
  }

  function getCurrentSlot() {
    try { return localStorage.getItem(CURRENT_SLOT_KEY); } catch (e) { return null; }
  }

  async function loadCurrentGame() {
    return loadGame(getCurrentSlot());
  }

  // Новий унікальний слот: "slot_1760797200000"
  function newSlotId() {
    return "slot_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  }

  // ---------- Міграція та перевірка сейву ----------
  // Викликається при КОЖНОМУ завантаженні. Коли змінюєш формат сейву,
  // збільш SAVE_VERSION і додай сюди блок "if (save.saveVersion < N)".

  // Зводить неповні стопки однакових предметів докупи (напр. після
  // збільшення maxStack дві клітинки по 99 хвостів стають однією на 198)
  // maxOf — ліміт стопки (для скрині — свій, RPG.chestStackMax)
  function compactStacks(list, maxOf = null) {
    const out = [];
    for (const entry of list) {
      if (RPG.ITEMS[entry.id]?.stackable) RPG.addToList(out, entry.id, entry.qty, maxOf);
      else out.push(entry);
    }
    return out;
  }

  function migrateSave(save) {
    const ITEMS = RPG.ITEMS;
    // Заповнюємо поля, яких могло не бути у старих сейвах
    save.character ??= {};
    save.character.name ??= "Герой";
    save.character.classId = RPG.CLASSES[save.character.classId] ? save.character.classId : RPG.DEFAULT_CLASS;
    save.character.level ??= 1;
    save.character.exp ??= 0;
    save.character.totalExp ??= save.character.exp;
    save.character.classHistory ??= [];
    save.character.gold ??= 0;
    save.character.kills ??= 0;
    save.equipment ??= {};
    save.inventory ??= [];
    // Версія 6: скрині — окремі сховища save.chests = { main: [...] } (пов'язані скрині ділять одне сховище).
    // Стара скриня Домівки (save.chest) переїжджає в сховище "main".
    save.chests = (save.chests && typeof save.chests === "object" && !Array.isArray(save.chests)) ? save.chests : {};
    if (Array.isArray(save.chest)) save.chests.main = (save.chests.main || []).concat(save.chest);
    delete save.chest;
    save.chests.main ??= [];
    for (const sid in save.chests) if (!Array.isArray(save.chests[sid])) save.chests[sid] = [];
    save.location ??= { map: RPG.DEFAULT_LOCATION, page: "game" };
    const loc = RPG.LOCATIONS[save.location.map];
    if (!loc || loc.locked) save.location.map = RPG.DEFAULT_LOCATION;
    save.settings ??= { battleView: "stepByStep" };
    save.battleQueue ??= ["attack"];
    save.battleQueue = save.battleQueue.slice(0, RPG.QUEUE_SIZE || 6);
    if (!save.battleQueue.some(Boolean)) save.battleQueue = ["attack"];

    // Версія 2: атрибути, вільні очки, відновлення з часом, скриня, смерті
    if ((save.saveVersion || 1) < 2) {
      const cls = RPG.getClass(save.character.classId);
      save.character.attrs ??= { ...cls.baseAttrs };
      // очки за вже здобуті рівні — щоб старий герой не втратив розвиток
      save.character.freePoints ??= (save.character.level - 1) * RPG.POINTS_PER_LEVEL;
    }
    save.character.attrs ??= { ...RPG.getClass(save.character.classId).baseAttrs };
    save.character.freePoints ??= 0;
    save.character.deaths ??= 0;
    save.character.regenAt ??= Date.now();

    // Версія 4: новий список предметів — старі ID замінюються новими (рідкість зберігається),
    // слоти «ring» → «ring1». Плюс володіння зброєю, навички, завдання.
    const REN = RPG.ITEM_RENAMES || {};
    const renameRef = ref => {
      if (typeof ref === "string") return REN[ref] || ref;
      if (ref && REN[ref.id]) ref.id = REN[ref.id];
      return ref;
    };
    if (save.equipment.ring && !save.equipment.ring1) save.equipment.ring1 = save.equipment.ring;
    delete save.equipment.ring;
    for (const slot in save.equipment) save.equipment[slot] = renameRef(save.equipment[slot]);
    save.inventory = save.inventory.map(renameRef);
    for (const sid in save.chests) save.chests[sid] = save.chests[sid].map(renameRef);
    save.character.mastery ??= {};
    save.character.skills ??= {};

    // Версія 3: рідкість речей. Старі речі (рядок-ID) стають білими (common)
    for (const slot in save.equipment) save.equipment[slot] = RPG.normalizeRef(save.equipment[slot]);
    save.inventory = save.inventory.map(RPG.normalizeRef).filter(Boolean);
    for (const sid in save.chests) save.chests[sid] = save.chests[sid].map(RPG.normalizeRef).filter(Boolean);
    save.lootLuck = Object.assign(RPG.newLuck(), save.lootLuck || {});

    // Прибираємо предмети, яких більше немає в довіднику
    for (const slot in save.equipment) {
      if (!ITEMS[save.equipment[slot]?.id] || !RPG.SLOTS[slot]) delete save.equipment[slot];
    }
    save.inventory = compactStacks(save.inventory.filter(entry => ITEMS[entry.id] && entry.qty > 0));
    // Стопки в скрині зводяться під її ліміти (матеріали 1000, зілля 500). Якщо клітинок
    // більше, ніж місткість скрині, — нічого не губиться, просто нових речей не покласти.
    for (const sid in save.chests) {
      save.chests[sid] = compactStacks(save.chests[sid].filter(entry => ITEMS[entry.id] && entry.qty > 0),
        id => RPG.chestStackMax(id, sid));
    }

    // Версія 5: група героїв (save.party), сюжет (save.story: «Час дослідити», дошка оголошень)
    save.party = (Array.isArray(save.party) ? save.party : []).filter(m => m && m.character && m.equipment);
    save.story ??= {};
    for (const m of save.party) {
      const ch = m.character;
      ch.classId = RPG.CLASSES[ch.classId] ? ch.classId : RPG.DEFAULT_CLASS;
      ch.level ??= 1; ch.exp ??= 0; ch.totalExp ??= ch.exp; ch.classHistory ??= [];
      ch.attrs ??= { ...RPG.getClass(ch.classId).baseAttrs };
      ch.freePoints ??= 0; ch.kills ??= 0; ch.deaths ??= 0; ch.regenAt ??= Date.now();
      ch.mastery ??= {}; ch.skills ??= {};
      delete ch.gold;                                  // золото групи спільне
      for (const slot in m.equipment) {
        m.equipment[slot] = RPG.normalizeRef(renameRef(m.equipment[slot]));
        if (!ITEMS[m.equipment[slot]?.id] || !RPG.SLOTS[slot]) delete m.equipment[slot];
      }
      m.battleQueue = Array.isArray(m.battleQueue) ? m.battleQueue.slice(0, RPG.QUEUE_SIZE || 6) : [];
      if (!m.battleQueue.some(Boolean)) m.battleQueue = ["attack"];
      if (typeof ch.hp !== "number" || typeof ch.mp !== "number") {
        const st = RPG.calcStats({ ...save, character: ch, equipment: m.equipment });
        ch.hp = st.hp; ch.mp = st.mp;
      }
    }

    // HP/MP мають бути числами (у старих сейвах могло бути 0 «до підрахунку»)
    if (typeof save.character.hp !== "number" || typeof save.character.mp !== "number") {
      RPG.fullHeal(save);
    }

    save.saveVersion = SAVE_VERSION;
    return save;
  }

  // ---------- Експорт / імпорт JSON-файлу ----------

  const TRANSLIT = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
    и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
    р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
    щ: "shch", ь: "", ю: "iu", я: "ia", ы: "y", э: "e", ё: "io", ъ: "", "'": "", "’": ""
  };
  function translit(text) {
    return [...String(text)].map(ch => {
      const low = ch.toLowerCase();
      if (!(low in TRANSLIT)) return ch;
      const t = TRANSLIT[low];
      return ch !== low && t ? t[0].toUpperCase() + t.slice(1) : t;
    }).join("");
  }

  function exportSave(save) {
    const json = JSON.stringify(save, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    // Ім'я файлу — латиницею: деякі браузери відкидають кирилицю й називають файл «download»
    const name = translit(save.character?.name || "hero").replace(/[^A-Za-z0-9_-]/g, "_") || "hero";
    a.href = url;
    a.download = `save_${name}_lvl${save.character?.level || 1}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // невелика затримка, інакше деякі браузери не встигають почати завантаження
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // file — об'єкт File з <input type="file" accept=".json">
  // Імпортований сейв отримує НОВИЙ слот, щоб не затерти існуючий
  async function importSave(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("Файл пошкоджений або це не JSON.");
    }
    if (!data || typeof data !== "object" || !data.character?.name) {
      throw new Error("Це не файл збереження гри.");
    }
    data.id = newSlotId();
    migrateSave(data);
    await saveGame(data);
    return data;
  }

  // Відкриває вікно вибору файлу і повертає File (або null, якщо скасовано)
  function pickJsonFile() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      input.addEventListener("change", () => {
        resolve(input.files && input.files[0] ? input.files[0] : null);
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  Object.assign(RPG, {
    SAVE_VERSION, CURRENT_SLOT_KEY,
    saveGame, loadGame, listSaves, deleteSave,
    setCurrentSlot, getCurrentSlot, loadCurrentGame, newSlotId,
    migrateSave, exportSave, importSave, pickJsonFile
  });
})(window.RPG);
