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

  const SAVE_VERSION = 8;        // версія ФОРМАТУ сейву (полів усередині)
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
    // Версія 7: власні доми (character.js → HOUSES) — список, бо згодом будуть доми в інших містах
    if (!Array.isArray(save.houses)) save.houses = [];
    // Версія 8: куплені книги (data/books.js) — { forge: true }
    if (!save.books || typeof save.books !== "object" || Array.isArray(save.books)) save.books = {};
    // Версія 6: скрині — окремі сховища save.chests = { main: [...] } (пов'язані скрині ділять одне сховище).
    // Стара скриня Домівки (save.chest) переїжджає в сховище "main".
    save.chests = (save.chests && typeof save.chests === "object" && !Array.isArray(save.chests)) ? save.chests : {};
    if (Array.isArray(save.chest)) save.chests.main = (save.chests.main || []).concat(save.chest);
    delete save.chest;
    save.chests.main ??= [];
    for (const sid in save.chests) if (!Array.isArray(save.chests[sid])) save.chests[sid] = [];
    // Кишеня для ключів від данжів (dungeon.js): ключі з інвентаря/скринь переїжджають туди
    if (RPG.migrateKeys) RPG.migrateKeys(save); else save.keys ??= {};
    save.location ??= { map: RPG.DEFAULT_LOCATION, page: "game" };
    const loc = RPG.LOCATIONS[save.location.map];
    if (!loc || loc.locked) save.location.map = RPG.DEFAULT_LOCATION;
    save.settings ??= { battleView: "stepByStep" };
    // Журнал бою (journal.js): останні 100 подій
    save.battleLog = Array.isArray(save.battleLog) ? save.battleLog.filter(r => r && Array.isArray(r.lines)).slice(-100) : [];
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
    RPG.lootFilter(save);   // фільтр здобичі за рідкістю (старі сейви — вимкнено)

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

  // ---------- Захист файлу збереження ----------
  // Файл містить дані у зашифрованому вигляді + цифровий підпис (HMAC-SHA256).
  // Якщо в файлі змінити хоч один символ — підпис не збігається, і імпорт відхиляється.
  // SHA-256 написано на чистому JS (без crypto.subtle), бо crypto.subtle
  // не працює при відкритті гри з file:// і з http:// у локальній мережі.
  // УВАГА: не змінюй SAVE_SECRET без потреби — усі раніше експортовані файли
  // перестануть імпортуватися.

  const SAVE_SECRET = "Rpg#Game_v2::9fK2-x7Lq!pZ4@wN8-sT1&vB6^hJ3*mC5%dR0~eY";
  const FILE_FORMAT = "rpg-save";
  const FILE_VERSION = 2;          // версія формату ФАЙЛУ (1 = старий відкритий JSON)
  const TAMPERED_MSG = "Файл було змінено. завантаження неможливо. Ми підтримуємо чесну гру =)";

  const SHA_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  // SHA-256 від масиву байтів → Uint8Array(32)
  function sha256(bytes) {
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const bits = len * 8;
    const view = new DataView(buf.buffer);
    view.setUint32(total - 8, Math.floor(bits / 0x100000000));
    view.setUint32(total - 4, bits >>> 0);

    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + SHA_K[i] + W[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
    return out;
  }

  const utf8 = s => new TextEncoder().encode(s);
  const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

  function concatBytes(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a); out.set(b, a.length);
    return out;
  }

  // HMAC-SHA256(key, message) → hex-рядок
  function hmacSha256(keyStr, msgBytes) {
    let key = utf8(keyStr);
    if (key.length > 64) key = sha256(key);
    const ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      ipad[i] = (key[i] || 0) ^ 0x36;
      opad[i] = (key[i] || 0) ^ 0x5c;
    }
    return toHex(sha256(concatBytes(opad, sha256(concatBytes(ipad, msgBytes)))));
  }

  // Шифрування: XOR з потоком байтів SHA-256(секрет | сіль | лічильник).
  // Те саме перетворення і шифрує, і розшифровує.
  function xorStream(bytes, salt) {
    const out = new Uint8Array(bytes.length);
    let block = null;
    for (let i = 0; i < bytes.length; i++) {
      if (i % 32 === 0) block = sha256(utf8(SAVE_SECRET + "|" + salt + "|" + (i / 32)));
      out[i] = bytes[i] ^ block[i % 32];
    }
    return out;
  }

  function bytesToB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Порівняння підписів без «раннього виходу»
  function sameSig(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function signedPart(salt, data) {
    return utf8(FILE_FORMAT + "|" + FILE_VERSION + "|" + salt + "|" + data);
  }

  // Об'єкт сейву → текст захищеного файлу
  function packSave(save) {
    const salt = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    const data = bytesToB64(xorStream(utf8(JSON.stringify(save)), salt));
    const sig = hmacSha256(SAVE_SECRET, signedPart(salt, data));
    return JSON.stringify({ format: FILE_FORMAT, v: FILE_VERSION, salt, data, sig });
  }

  // Текст файлу → об'єкт сейву. Будь-яка невідповідність → помилка TAMPERED_MSG
  function unpackSave(text) {
    let file;
    try { file = JSON.parse(text); }
    catch (e) { throw new Error("Файл пошкоджений або це не файл збереження гри."); }
    if (!file || typeof file !== "object") throw new Error("Це не файл збереження гри.");

    // Старий відкритий формат (без підпису) — його можна було вільно редагувати
    if (file.format !== FILE_FORMAT) {
      if (file.character) throw new Error(TAMPERED_MSG);
      throw new Error("Це не файл збереження гри.");
    }
    if (file.v !== FILE_VERSION || typeof file.salt !== "string" || typeof file.data !== "string") {
      throw new Error(TAMPERED_MSG);
    }
    const expected = hmacSha256(SAVE_SECRET, signedPart(file.salt, file.data));
    if (!sameSig(expected, file.sig)) throw new Error(TAMPERED_MSG);

    let save;
    try {
      save = JSON.parse(new TextDecoder().decode(xorStream(b64ToBytes(file.data), file.salt)));
    } catch (e) {
      throw new Error(TAMPERED_MSG);
    }
    if (!save || typeof save !== "object" || !save.character?.name) throw new Error(TAMPERED_MSG);
    checkSaveSanity(save);
    return save;
  }

  // Додаткова перевірка: значення мають бути «можливими» в грі
  function checkSaveSanity(save) {
    const okNum = (n, min = 0) => typeof n === "number" && Number.isFinite(n) && n >= min;
    const heroes = [save.character, ...(Array.isArray(save.party) ? save.party.map(m => m && m.character) : [])];
    for (const ch of heroes) {
      if (!ch) continue;
      if (ch.level !== undefined && !(Number.isInteger(ch.level) && ch.level >= 1)) throw new Error(TAMPERED_MSG);
      for (const f of ["exp", "totalExp", "gold", "kills", "deaths", "freePoints"]) {
        if (ch[f] !== undefined && !okNum(ch[f])) throw new Error(TAMPERED_MSG);
      }
    }
    const lists = [save.inventory, ...Object.values(save.chests || {})];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const it of list) {
        if (it && typeof it === "object" && it.qty !== undefined && !(Number.isInteger(it.qty) && it.qty >= 0)) {
          throw new Error(TAMPERED_MSG);
        }
      }
    }
  }

  function exportSave(save) {
    const json = packSave(save);
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
    const data = unpackSave(text);   // перевірка підпису; змінений файл → помилка
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
    migrateSave, exportSave, importSave, pickJsonFile,
    packSave, unpackSave
  });
})(window.RPG);
