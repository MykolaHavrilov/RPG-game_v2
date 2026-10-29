// ============================================================
// game.js — логіка сторінок гри.
// Кожна сторінка має <body data-page="...">, і тут запускається
// відповідний обробник: new-game, load, settings, game, character,
// inventory, maps.
// ============================================================

(function (RPG) {

  // ---------- Допоміжні функції ----------

  function $(id) { return document.getElementById(id); }

  // Створює елемент: el("div", "wf wf-slot", "текст")
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function link(text, href, className = "wf wf-link") {
    const a = el("a", className, text);
    a.href = href;
    return a;
  }

  function button(text, className, onClick) {
    const b = el("button", className, text);
    b.type = "button";
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  // Встановлює ширину смужки HP / MP / EXP і її підпис.
  function setBar(bar, current, max, label) {
    if (!bar) return;
    current = Math.floor(current);
    const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    bar.style.setProperty("--value", percent + "%");
    const lbl = bar.querySelector(".bar-label");
    if (lbl) lbl.textContent = label || `${bar.dataset.name} ${current} / ${max}`;
  }

  function fmtNum(n) { return Number(n).toLocaleString("uk-UA"); }

  function fmtDate(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("uk-UA", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function fmtStat(key, value) {
    const pct = ["crit", "dodge", "blockPhys", "blockMag"].includes(key);
    return fmtNum(value) + (pct ? "%" : "");
  }

  // Коротке повідомлення в блоці #msg (зникає через кілька секунд)
  let msgTimer = null;
  function showMsg(node, text, isError) {
    if (!node) return;
    node.textContent = text;
    node.hidden = false;
    node.classList.toggle("msg-error", !!isError);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { node.hidden = true; }, 4000);
  }

  // Якщо активної гри немає — замість сторінки показуємо підказку
  function showNoGame() {
    const main = document.querySelector("main");
    main.innerHTML = "";
    const box = el("div", "panel stack narrow");
    box.append(el("h2", null, "Немає активної гри"));
    box.append(el("p", null, "Створіть нового персонажа або завантажте збереження."));
    box.append(link("Нова гра", "new-game.html"), link("Завантажити гру", "load.html"),
               link("Головне меню", "../index.html"));
    main.append(box);
  }

  // Завантажує поточну гру й одразу нараховує відновлення за час відсутності
  async function requireSave() {
    try {
      const save = await RPG.loadCurrentGame();
      if (!save) { showNoGame(); return null; }
      // старий сейв: зайва річ з лівої руки — в інвентар (для кожного героя групи)
      const fixed = RPG.partyMembers(save).map(ms => RPG.fixHands(ms)).some(Boolean);
      const arrived = RPG.finishTravel(save);          // дорога скінчилась, поки гра була закрита
      if (RPG.applyRegenAll(save) || fixed || arrived) await RPG.saveGame(save);
      // У дорозі доступні лише «Персонаж», «Інвентар» і «Мапа»
      if (RPG.isTraveling(save)) {
        const page = document.body.dataset.page;
        if (!RPG.TRAVEL_PAGES.includes(page)) { location.replace("maps.html"); return null; }
        lockNavForTravel();
        if (page !== "maps") showTravelBanner(save);
      }
      return save;
    } catch (e) {
      console.error(e);
      showNoGame();
      return null;
    }
  }

  // ---------- Кишеня для ключів (dungeon.js): вікно зі списком ключів, без картинок ----------
  // Показуються лише ключі, які є: повна назва і кількість n/1000
  function showKeyPocket(save) {
    const keys = RPG.keyPocket(save).filter(k => k.count > 0);
    if (!keys.length) return showNotice("Кишеня для ключів", ["Ключів поки немає."], "is-keys");
    const list = el("ul", "key-pocket");
    for (const k of keys) {
      const li = el("li", "key-row" + (k.count >= RPG.KEY_MAX ? " is-full" : ""));
      li.append(el("strong", "key-name", k.name), el("b", "key-count", `${k.count}/${RPG.KEY_MAX}`));
      list.append(li);
    }
    return showNotice("Кишеня для ключів", [list], "is-keys");
  }

  // ---------- Фільтр здобичі (rarity.js → lootFilter): автоматичне викидання речей за рідкістю ----------
  // Зміни зберігаються одразу. onChange — оновити вигляд кнопки-воронки.
  function showLootFilter(save, onChange) {
    const f = RPG.lootFilter(save);
    const store = () => { RPG.saveGame(save).catch(e => console.error(e)); onChange?.(); };

    const power = el("label", "loot-filter-power");
    const onBox = document.createElement("input");
    onBox.type = "checkbox";
    onBox.id = "loot-filter-on";
    onBox.checked = f.on;
    const state = el("b", "loot-filter-state");
    power.append(onBox, el("span", null, "Фільтр увімкнено"), state);

    const list = el("ul", "loot-filter-list");
    const boxes = {};
    for (const r of RPG.RARITY_ORDER) {
      const li = el("li", "loot-filter-row rarity-" + r);
      const lab = el("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.rarity = r;
      box.checked = f.drop[r];
      boxes[r] = box;
      const name = el("span", "loot-filter-name", RPG.RARITIES[r].name);
      name.style.color = RPG.RARITIES[r].color;
      lab.append(box, name);
      li.append(lab);
      list.append(li);
      box.addEventListener("change", () => { f.drop[r] = box.checked; sync(); store(); });
    }
    function sync() {
      state.textContent = f.on ? (RPG.lootFilterActive(save) ? "Працює" : "Оберіть рідкість") : "Вимкнено";
      state.classList.toggle("is-on", RPG.lootFilterActive(save));
      list.classList.toggle("is-off", !f.on);
    }
    onBox.addEventListener("change", () => { f.on = onBox.checked; sync(); store(); });
    sync();

    const note = el("p", "note", "Позначені рідкості зброї та броні, що випадуть у бою, одразу викидаються " +
      "і не займають місця в інвентарі. Речі, які вже лежать в інвентарі, ключі, зілля й матеріали фільтр не чіпає.");
    return showNotice("Фільтр здобичі", [power, list, note], "is-loot-filter");
  }

  // Кнопка-воронка: підсвічена, коли фільтр реально викидає речі
  function renderFilterBtn(btn, save) {
    if (!btn) return;
    const on = RPG.lootFilterActive(save);
    btn.classList.toggle("is-on", on);
    const t = on
      ? "Фільтр здобичі: увімкнено (" + RPG.RARITY_ORDER.filter(r => save.lootFilter.drop[r]).map(r => RPG.RARITIES[r].name).join(", ") + ")"
      : "Фільтр здобичі: вимкнено";
    btn.title = t;
    btn.setAttribute("aria-label", t);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // ---------- Окреме повідомлення (вікно), що закривається лише хрестиком ----------
  // Повертає Promise, який виконується після закриття.
  // Черга вікон: вікна, що з'являються самі (повідомлення, «Увага — чемпіон!»), не відкриваються
  // одне на одне — кожне чекає, доки закриються всі інші відкриті вікна, і показується по черзі.
  // open() — відкриває вікно й повертає його (або null — показувати вже нічого).
  // Повертає проміс, що виконується, коли це вікно закрили.
  let dialogQueue = Promise.resolve();
  function whenNoDialog() {
    return new Promise(resolve => {
      const check = () => (document.querySelector("dialog[open]") ? setTimeout(check, 150) : resolve());
      check();
    });
  }
  function queueDialog(open) {
    const p = dialogQueue.then(whenNoDialog).then(() => new Promise(resolve => {
      const dlg = open();
      if (!dlg || !dlg.open) { resolve(); return; }
      dlg.addEventListener("close", () => resolve(), { once: true });
    }));
    dialogQueue = p.catch(e => console.error(e));
    return p;
  }

  function showNotice(title, lines, cls = "") {
    return queueDialog(() => {
      const dlg = el("dialog", "notice-dialog " + cls);
      const close = button("×", "notice-close", () => dlg.close());
      close.setAttribute("aria-label", "Закрити");
      dlg.append(close, el("h3", null, title));
      for (const l of lines) dlg.append(typeof l === "string" ? el("p", null, l) : l);
      dlg.addEventListener("cancel", ev => ev.preventDefault());     // Esc не закриває — лише хрестик
      dlg.addEventListener("close", () => dlg.remove());
      document.body.append(dlg);
      dlg.showModal();
      return dlg;
    });
  }

  // ---------- Журнал бою: нагорода за завдання (journal.js) ----------
  function journalReward(save, title, text) {
    if (RPG.journalAdd) RPG.journalAdd(save, { kind: "quest", lines: [["title", title, "win"], ["info", text]] });
  }

  // ---------- Незнайомець зі сферою (квест «Долоні Велеса», 12 рівень) ----------
  async function meetStranger(save) {
    if (!RPG.velesGiveOrb(save)) return;
    await RPG.saveGame(save);
    return showNotice("Незнайомець", [
      "До вас підходить хтось у запиленому плащі з глибоким каптуром — обличчя не видно. Він ніби випадково зачіпає вас плечем " +
      "і щось тихо кладе вам у торбу. «Тобі воно потрібніше», — чуєте ви шепіт, а коли обертаєтеся, незнайомця вже й слід простиг.",
      "У торбі — важка куля з темного каменю, тепла на дотик. На одному боці — глибоке заглиблення у формі ромба.",
      "Отримано: Дивна сфера (квестовий предмет). Розпитайте людей, що це може бути.",
    ]);
  }

  // ---------- Обірваний пергамент (Домівка) ----------
  function showParchment() {
    const P = RPG.CHRONICLE.PARCHMENT;
    document.querySelector(".parchment-dialog")?.remove();
    const dlg = el("dialog", "parchment-dialog");
    const close = button("×", "notice-close chronicle-close", () => dlg.close());
    close.setAttribute("aria-label", "Закрити");
    const sheet = el("article", "parchment-sheet");
    sheet.append(el("h2", "chronicle-title", P.title));
    P.paras.forEach((p, i) => sheet.append(el("p", "chronicle-p" + (i === 0 ? " is-initial" : "") + (i === P.paras.length - 1 ? " is-cut" : ""), p)));
    sheet.append(el("p", "parchment-torn", P.torn));
    sheet.append(el("p", "parchment-keep", "Ви обережно згортаєте клапоть і ховаєте в торбу."));
    dlg.append(close, sheet);
    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  // ---------- Книга «Предки Минулих та Майбутніх часів» (data/chronicle.js) ----------
  // 2.5D-книга з рендерів Blender (assets/images/book/): на широкому екрані — розворот,
  // зміст на лівій сторінці, текст глави — на правій; анімації відкриття, гортання й відновлення.
  // На телефоні (≤700px) — пергаментна книга як раніше: зміст зверху, сторінка знизу
  // (програються лише анімації відкриття й відновлення).
  const BOOK = {
    dir: "assets/images/book/",
    spread: "book_spread.webp",            // розворот (чисті сторінки)
    torn: "book_spread_torn.webp",         // розворот з обгорілими корінцями вирваної сторінки
    // [файл, тривалість у мс] — анімації програються один раз і зупиняються на останньому кадрі
    anims: {
      open: ["book_open.webp", 2700],
      next: ["book_flip_next.webp", 1350],
      prev: ["book_flip_prev.webp", 1350],
      manyNext: ["book_flip_many_next.webp", 2020],
      manyPrev: ["book_flip_many_prev.webp", 2020],
      restore: ["book_restore.webp", 4710]
    }
  };

  const bookMotionOff = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bookWide = () => !window.matchMedia("(max-width: 700px)").matches;
  const bookBlobs = {};
  // URL, з якого анімація гарантовано стартує з першого кадру (кожен показ — новий URL)
  async function bookAnimUrl(file) {
    const url = RPG.asset(BOOK.dir + file);
    if (location.protocol !== "file:") {
      try {
        if (!bookBlobs[file]) {
          const r = await fetch(url);
          if (!r.ok) throw new Error(r.status);
          bookBlobs[file] = await r.blob();
        }
        return URL.createObjectURL(bookBlobs[file]);
      } catch (e) { /* без мережі й кешу — звичайне посилання */ }
    }
    return url + (url.includes("?") ? "&" : "?") + "play=" + Date.now();
  }
  // Програти анімацію в шарі layer. onShow — коли з'явився перший кадр.
  // Повертає <img> на останньому кадрі (прибрати його — справа викликача) або null.
  function playBookAnim(layer, name, onShow) {
    const [file, ms] = BOOK.anims[name];
    return new Promise(resolve => {
      if (bookMotionOff()) return resolve(null);
      const img = new Image();
      img.className = "book-anim";
      img.alt = "";
      let done = false, timer = 0, shown = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        layer.classList.remove("is-active");
        layer.removeEventListener("click", finish);
        resolve(shown ? img : null);
      };
      img.onload = () => {
        if (done) return;
        shown = true;
        layer.append(img);
        layer.classList.add("is-active");
        if (onShow) onShow(img);
        timer = setTimeout(finish, ms);
      };
      img.onerror = finish;
      layer.addEventListener("click", finish);          // клік — пропустити анімацію
      timer = setTimeout(finish, 6000);                 // повільне завантаження — не чекаємо
      bookAnimUrl(file).then(src => { img.src = src; });
    });
  }
  function dropBookAnim(img) {
    if (!img) return;
    if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
    img.remove();
  }

  // Вміст розділу книги: "toc" — зміст, "prologue" — Пролог, інакше — глава (id з CHAPTERS).
  // go(key) — перехід на розділ (для кнопок змісту), glow — золоте сяйво відновлених абзаців.
  function chronicleSection(save, key, { go, glow = false, torn = false, paged = false } = {}) {
    const C = RPG.CHRONICLE;
    const frag = document.createDocumentFragment();
    const add = (...nodes) => nodes.forEach(n => frag.append(n));
    if (key === "toc") {
      add(el("div", "chronicle-cover", C.TITLE));
      add(el("p", "chronicle-epigraph",
        "Ніхто не пише в ній чорнилом: щойно герой здолає великого ворога, сторінки наповнюються самі."));
      const list = el("nav", "chronicle-toc-list");
      for (const c of RPG.chronicleContents(save)) {
        if (!c.open) { list.append(el("span", "chronicle-toc-item is-sealed", `${c.title} — запечатано`)); continue; }
        list.append(button(c.title, "chronicle-toc-item", () => go(c.key)));
      }
      add(list);
      // Права сторінка змісту — віньєтка (лише в книзі-розвороті)
      if (paged) add(el("div", "book-col-break"), el("div", "book-vignette", "❦"),
        el("p", "book-vignette-text", "Так нащадки знатимуть, хто проливав кров, щоб зупинити кров Іггдрасиля."));
      return frag;
    }
    if (key === "prologue") {
      const pr = RPG.prologueFor(save);
      add(el("h2", "chronicle-title", C.PROLOGUE.title));
      if (pr.torn) {
        add(el("p", "chronicle-torn", "Перших сторінок Прологу бракує — їх вирвано, лишилися тільки обгорілі корінці."));
        // У книзі-розвороті корінці вирваної сторінки — на правій сторінці: текст продовжується вже після них
        if (paged && torn) add(el("div", "book-col-break"), el("div", "book-torn-spacer"));
      }
      pr.paras.forEach((p, i) => {
        const restored = glow && i < C.PARCHMENT.paras.length;
        add(el("p", "chronicle-p" + (i === 0 && !pr.torn ? " is-initial" : "") + (restored ? " is-restored" : ""), p));
      });
      return frag;
    }
    const ch = C.CHAPTERS.find(c => c.id === key);
    add(el("h2", "chronicle-title", ch.title), el("p", "chronicle-region", ch.region));
    add(el("p", "chronicle-p is-initial", ch.intro));
    ch.bosses.forEach(b => {
      const e = RPG.chronicleEntry(save, b.dungeon);
      const sec = el("section", "chronicle-entry");
      if (!e) {
        sec.append(el("p", "chronicle-blank", "Ця сторінка ще чиста. Її напише перемога, якої поки не було…"));
        add(sec);
        return;
      }
      const t = RPG.chronicleBossEntry(b.dungeon, e);
      sec.append(el("h3", "chronicle-sub", t.title), el("p", "chronicle-date", t.date));
      const roster = el("ul", "chronicle-roster");
      t.roster.forEach(r => roster.append(el("li", null, r)));
      sec.append(roster);
      t.lines.forEach(l => sec.append(el("p", "chronicle-p", l)));
      if (t.wins > 1) sec.append(el("p", "chronicle-note", `Відтоді цей данж пройдено ще ${t.wins - 1} раз(ів).`));
      sec.append(el("p", "chronicle-mark" + (b.final ? " is-final" : ""), `✦ ${b.mark} ✦`));
      add(sec);
    });
    if (ch.bosses.every(b => RPG.chronicleEntry(save, b.dungeon))) {
      add(el("p", "chronicle-p chronicle-ending", ch.ending), el("p", "chronicle-end", "— Кінець глави —"));
    }
    return frag;
  }

  // opts.book — інша книга в тому ж вікні: { title, cls, contents(save) → [{ key, title, open }], section(save, key, o) }
  // (за замовчуванням — літопис Захара). Обгорілі корінці Прологу — лише в літописі.
  function showChronicle(save, startKey = "prologue", opts = {}) {
    document.querySelector(".chronicle-dialog")?.remove();
    const src = opts.book || { title: RPG.CHRONICLE.TITLE, contents: RPG.chronicleContents, section: chronicleSection, torn: true };
    const wide = bookWide();
    const dlg = el("dialog", "chronicle-dialog" + (wide ? " is-3d" : "") + (src.cls ? " " + src.cls : ""));
    dlg.lang = "uk";
    const close = button("×", "notice-close chronicle-close", () => dlg.close());
    close.setAttribute("aria-label", "Закрити книгу");
    const book = el("div", "chronicle-book");
    const plate = el("div", "book-plate");          // картинка розвороту
    const layer = el("div", "book-anim-layer");     // анімації поверх книги
    book.append(plate);
    dlg.append(close, book);
    const restoring = !!opts.restoring;
    let busy = false;
    const reveal = wide ? initPaged() : initScroll();
    book.append(layer);

    // ---------- Телефон: зміст зверху, сторінка з прокруткою (як раніше) ----------
    function initScroll() {
      const toc = el("nav", "chronicle-toc");
      const page = el("article", "chronicle-page");
      book.append(toc, page);
      let key = startKey, glow = restoring;
      const keys = () => src.contents(save).filter(c => c.open).map(c => c.key);
      const go = k => { key = k; draw(); };
      function draw() {
        toc.innerHTML = "";
        toc.append(el("div", "chronicle-cover", src.title));
        for (const c of src.contents(save)) {
          if (!c.open) { toc.append(el("span", "chronicle-toc-item is-sealed", `${c.title} — запечатано`)); continue; }
          toc.append(button(c.title, "chronicle-toc-item" + (c.key === key ? " is-current" : ""), () => go(c.key)));
        }
        page.innerHTML = "";
        page.append(src.section(save, key, { go, glow }));
        glow = false;
        const ks = keys(), i = ks.indexOf(key);
        const nav = el("div", "row chronicle-nav");
        const prev = button("◂ Попередня", "wf wf-link", () => go(ks[i - 1]));
        const next = button("Наступна ▸", "wf wf-link", () => go(ks[i + 1]));
        prev.disabled = i <= 0;
        next.disabled = i >= ks.length - 1;
        nav.append(prev, next);
        page.append(nav);
        page.scrollTop = 0;
      }
      return draw;
    }

    // ---------- Широкий екран: розворот, текст тече по двох сторінках, гортання розворотами ----------
    // Розділи: зміст + відкриті Пролог і глави. Кожен розділ починається з нового розвороту.
    function initPaged() {
      const spread = el("div", "book-spread");     // обидві сторінки (з перспективою під картинку)
      const flow = el("div", "book-flow");         // колонки = сторінки
      spread.append(flow);
      const footL = el("div", "book-foot is-left"), footR = el("div", "book-foot is-right");
      const prevB = button("◂", "book-turn", () => turn(-1));
      const nextB = button("▸", "book-turn", () => turn(1));
      prevB.setAttribute("aria-label", "Попередній розворот");
      nextB.setAttribute("aria-label", "Наступний розворот");
      const tocB = button("Зміст", "book-tocbtn", () => jump("toc", 0));
      const numL = el("span", "book-num"), numR = el("span", "book-num");
      footL.append(prevB, numL, tocB);
      footR.append(numR, nextB);
      book.append(spread, footL, footR);

      const sections = () => ["toc", ...src.contents(save).filter(c => c.open).map(c => c.key)];
      let secs = sections();
      let key = secs.includes(startKey) ? startKey : (secs[1] || "toc");
      let sp = 0;                                  // розворот усередині розділу
      let counts = {};                             // розділ → кількість розворотів
      let glow = restoring;
      let geo = null;
      const isTornSpread = () => !!src.torn && key === "prologue" && sp === 0 && RPG.prologueFor(save).torn;

      function measure() {
        const w = book.clientWidth, h = book.clientHeight;
        if (!w || !h) return false;
        // Перспектива: верх сторінок на картинці вужчий за низ (≈0.936) — нахиляємо текст так само
        const sh = h * 0.88;
        spread.style.transform = `perspective(${(sh * 2.5).toFixed(1)}px) rotateX(9.85deg)`;
        const W = spread.clientWidth;
        const colW = W * (39.49 / 86.67), gap = W - 2 * colW;
        const fs = Math.max(13, Math.min(19, w * 0.0152));
        flow.style.columnCount = "2";              // (не column-width: при точному збігу ширин браузер дає 1 колонку)
        flow.style.columnGap = gap + "px";
        flow.style.fontSize = fs + "px";
        geo = { W, colW, gap, H: flow.clientHeight };
        dlg.style.setProperty("--book-colh", geo.H + "px");
        dlg.style.setProperty("--book-colw", colW + "px");
        return true;
      }
      function fill(k) {
        flow.innerHTML = "";
        flow.append(src.section(save, k, { go: kk => jump(kk, 0), glow: k === "prologue" && glow, torn: true, paged: true }));
        flow.scrollLeft = 0;
        const cols = Math.max(1, Math.round((flow.scrollWidth + geo.gap) / (geo.colW + geo.gap)));
        return Math.ceil(cols / 2);
      }
      function layout() {
        if (!measure()) return;
        secs = sections();
        counts = {};
        for (const k of secs) counts[k] = fill(k);
        sp = Math.min(sp, counts[key] - 1);
        show();
      }
      // Номер сторінки по всій книзі (зміст без номерів, Пролог починається зі сторінки 1)
      function pageNo() {
        let n = 0;
        for (const k of secs) {
          if (k === key) break;
          if (k !== "toc") n += counts[k] * 2;
        }
        return key === "toc" ? 0 : n + sp * 2 + 1;
      }
      function show() {
        fill(key);
        if (key === "prologue") glow = false;
        flow.scrollLeft = sp * (geo.W + geo.gap);
        const p = pageNo();
        numL.textContent = p ? String(p) : "";
        numR.textContent = p ? String(p + 1) : "";
        const gi = globalIndex(key, sp);
        prevB.disabled = gi <= 0;
        nextB.disabled = gi >= totalSpreads() - 1;
        tocB.hidden = key === "toc";
        plate.style.backgroundImage = `url("${RPG.asset(BOOK.dir + (isTornSpread() ? BOOK.torn : BOOK.spread))}")`;
      }
      const totalSpreads = () => secs.reduce((a, k) => a + (counts[k] || 1), 0);
      function globalIndex(k, s) {
        let n = 0;
        for (const kk of secs) { if (kk === k) return n + s; n += counts[kk] || 1; }
        return n;
      }
      function fromGlobal(g) {
        for (const k of secs) { const c = counts[k] || 1; if (g < c) return [k, g]; g -= c; }
        const last = secs[secs.length - 1];
        return [last, (counts[last] || 1) - 1];
      }
      async function jump(k, s) {
        if (busy) return;
        const from = globalIndex(key, sp), to = globalIndex(k, s);
        if (from === to) return;
        if (bookMotionOff()) { key = k; sp = s; show(); return; }
        busy = true;
        book.classList.add("is-turning");
        const fwd = to > from, many = Math.abs(to - from) > 1;
        const img = await playBookAnim(layer, many ? (fwd ? "manyNext" : "manyPrev") : (fwd ? "next" : "prev"),
          () => { plate.style.backgroundImage = `url("${RPG.asset(BOOK.dir + BOOK.spread)}")`; });
        key = k; sp = s;
        show();
        dropBookAnim(img);
        book.classList.remove("is-turning");
        busy = false;
      }
      function turn(d) {
        const g = globalIndex(key, sp) + d;
        if (g < 0 || g >= totalSpreads()) return;
        const [k, s] = fromGlobal(g);
        jump(k, s);
      }
      dlg.addEventListener("keydown", e => {
        if (e.key === "ArrowRight") { e.preventDefault(); turn(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); turn(-1); }
      });
      let rz = 0;
      const ro = new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (!busy) layout(); }); });
      dlg.addEventListener("close", () => ro.disconnect());
      return () => { layout(); ro.observe(book); };
    }

    // Відкриття книги (і, якщо віддали пергамент, — зрощення сторінки), потім текст
    async function intro() {
      if (bookMotionOff()) { reveal(); return; }
      busy = true;
      book.classList.add("is-opening");
      if (wide) plate.style.backgroundImage = `url("${RPG.asset(BOOK.dir + (restoring ? BOOK.torn : BOOK.spread))}")`;
      let img = await playBookAnim(layer, "open");
      if (restoring && dlg.isConnected) {
        const prevImg = img;
        img = await playBookAnim(layer, "restore", () => dropBookAnim(prevImg));
        if (!img) dropBookAnim(prevImg);
      }
      if (!dlg.isConnected) return;
      busy = false;
      book.classList.remove("is-opening");
      reveal();
      dropBookAnim(img);
    }

    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    intro();
  }

  // ---------- Книга «Небесна кузня. Настанова» (data/books.js) — те саме вікно-книга, що й літопис ----------
  // Таблиці { auto: … } будуються з даних гри (рецепти, знаряддя, шанси, ціни), тож книга завжди збігається з грою.
  function forgeBookTable(head, rows, cls = "") {
    const t = el("table", "fbook-table" + (cls ? " " + cls : ""));
    if (head) { const tr = el("tr"); head.forEach(h => tr.append(el("th", null, h))); const th = el("thead"); th.append(tr); t.append(th); }
    const tb = el("tbody");
    for (const r of rows) {
      const tr = el("tr");
      r.forEach(c => { const td = el("td"); if (c instanceof Node) td.append(c); else td.textContent = c; tr.append(td); });
      tb.append(tr);
    }
    t.append(tb);
    return t;
  }
  function forgeBookAuto(kind) {
    const pc = x => `${Math.round(x * 100)}%`;
    const gold = n => `${fmtNum(n)} зол.`;
    const frag = document.createDocumentFragment();
    if (kind === "recipes") {
      for (const g of RPG.RECIPE_GROUPS) {
        frag.append(el("p", "fbook-group", g.name));
        const rows = [];
        for (const tier of [1, 2, 3]) {
          const ids = Object.keys(RPG.RECIPES).filter(id => RPG.RECIPES[id].tier === tier && g.types.includes(RPG.ITEMS[id]?.type));
          if (!ids.length) continue;
          const mats = [...new Set(ids.flatMap(id => RPG.RECIPES[id].mats.map(([m]) => RPG.ITEMS[m]?.name.toLowerCase())))];
          const cell = el("span", null, ids.map(id => RPG.ITEMS[id].name).join(", "));
          cell.append(el("small", "fbook-mats", mats.join(", ")));
          rows.push([`${tier} (з ${RPG.CRAFT_TIER_LEVEL[tier]})`, cell]);
        }
        frag.append(forgeBookTable(["Тір (рівень)", "Речі й матеріали"], rows, "is-recipes"));
      }
    } else if (kind === "tools") {
      frag.append(forgeBookTable(["Знаряддя", "Для чого", "Ціна, зол."], Object.values(RPG.FORGE_TOOLS).map(t => {
        const n = el("strong", null, t.name);
        if (t.need) n.append(el("small", "fbook-mats", "обов'язкове"));
        return [n, t.text + (t.for ? ` Потрібне для: ${t.for}.` : ""), fmtNum(t.price)];
      }), "is-priced"));
    } else if (kind === "ranks") {
      frag.append(forgeBookTable(["Звання", "Рівні", "Успіх"], [["Учень", 1, 9], ["Підмайстер", 10, 19], ["Майстер", 20, 29], ["Небесний коваль", 30, 30]]
        .map(([n, a, b]) => [n, a === b ? String(a) : `${a}–${b}`, a === b ? pc(RPG.baseCraftChance(a)) : `${pc(RPG.baseCraftChance(a))}–${pc(RPG.baseCraftChance(b))}`])));
    } else if (kind === "cats") {
      frag.append(forgeBookTable(["Вид", "Що входить", "Тіри (рівень виду)"], RPG.RECIPE_GROUPS.map(g => {
        const tiers = [...new Set(Object.keys(RPG.RECIPES).filter(id => g.types.includes(RPG.ITEMS[id]?.type)).map(id => RPG.RECIPES[id].tier))].sort();
        const what = { weapon: "зброя для правої й лівої руки", armor: "уся броня", jewel: "кільця, амулети, сережки" }[g.id] || "";
        return [g.name, what, tiers.map(t => `${t} — з ${RPG.CRAFT_TIER_LEVEL[t]}`).join(", ") + `; максимум ${RPG.craftCatMaxLevel(g.id)}`];
      })));
    } else if (kind === "odds") {
      const R = ["broken", "common", "magic", "epic", "legendary"];
      const head = ["Рів.", "Успіх", ...R.map(r => { const s = el("span", "rt-" + r, RPG.RARITIES[r].name.slice(0, 4) + "."); s.title = RPG.RARITIES[r].name; return s; })];
      const t = forgeBookTable(null, [1, 5, 10, 15, 20, 25, 30].map(L => {
        const b = RPG.baseCraftChance(L), tab = RPG.craftRarityTable(L, b);
        return [String(L), pc(b), ...R.map(r => pc(tab[r]))];
      }), "is-odds");
      const thead = el("thead"), tr = el("tr");
      head.forEach(h => { const th = el("th"); if (h instanceof Node) th.append(h); else th.textContent = h; tr.append(th); });
      thead.append(tr); t.prepend(thead);
      frag.append(t);
    } else if (kind === "prices") {
      const C = RPG.CRAFT_CHESTS;
      frag.append(forgeBookTable(["Що", "Ціна"], [
        ["Дім на околиці", gold(RPG.HOUSES.oak.price)], ["Склад", gold(RPG.WAREHOUSE_PRICE)], ["Кузня", gold(RPG.FORGE_PRICE)],
        [C.mat.name, gold(C.mat.price)], [C.pot.name, gold(C.pot.price)], [C.item.name, gold(C.item.price)],
        ["Ця книга", gold(RPG.FORGE_BOOK.price)]
      ], "is-priced"));
    } else if (kind === "chests") {
      const rows = [["Скриня Домівки (спільна)", "50", "як в інвентарі", "1"]];
      for (const [k, c] of Object.entries(RPG.CRAFT_CHESTS)) rows.push([`${c.name} (${RPG.CRAFT_CHEST_ALLOW_TEXT[k]})`, String(c.size), c.stack > 1 ? `${fmtNum(c.stack)} шт` : "1 річ", String(c.max)]);
      frag.append(forgeBookTable(["Скриня", "Комірок", "У комірці", "Скринь"], rows));
    } else if (kind === "disassemble") {
      const extra = { broken: "—", common: "—", magic: "1 магічний матеріал", epic: "1 епічний матеріал", legendary: "Небесна іскра" };
      frag.append(forgeBookTable(["Рідкість речі", "Назад", "Додатково"], Object.entries(RPG.DISASSEMBLE_SHARE).map(([r, sh]) =>
        [el("span", "rt-" + r, RPG.RARITIES[r].name), pc(sh), extra[r]])));
    }
    return frag;
  }
  // Розділ книги з даних (data/books.js): FORGE_BOOK, GODS_BOOK… — B передається через bookFrom(B)
  function forgeBookSection(save, key, opts = {}) { return dataBookSection(RPG.FORGE_BOOK, key, opts); }
  function dataBookSection(B, key, { go, paged = false } = {}) {
    const frag = document.createDocumentFragment();
    if (key === "toc") {
      frag.append(el("p", "fbook-kicker", B.kicker), el("div", "chronicle-cover", B.title), el("p", "chronicle-epigraph", B.epigraph));
      const list = el("nav", "chronicle-toc-list");
      for (const sct of B.sections) list.append(button(sct.title, "chronicle-toc-item", () => go(sct.key)));
      frag.append(list, el("p", "fbook-authors", B.authors));
      if (paged) frag.append(el("div", "book-col-break"), el("div", "book-vignette", B.vignetteSign || "⚒"), el("p", "book-vignette-text", B.vignette));
      return frag;
    }
    const sct = B.sections.find(x => x.key === key);
    if (!sct) return frag;
    frag.append(el("h2", "chronicle-title", sct.title));
    // буквиця — лише в першому абзаці, що відкриває розділ (одразу після назви чи епіграфа)
    sct.blocks.forEach((b, i) => {
      if (b.p) frag.append(el("p", "chronicle-p" + (i === 0 || (i === 1 && sct.blocks[0].quote) ? " is-initial" : ""), b.p));
      else if (b.quote) frag.append(el("p", "chronicle-epigraph", b.quote));
      else if (b.h) frag.append(el("h3", "chronicle-sub fbook-h", b.h));
      else if (b.ol || b.ul) { const l = el(b.ol ? "ol" : "ul", "fbook-list"); (b.ol || b.ul).forEach(x => l.append(el("li", null, x))); frag.append(l); }
      else if (b.table) frag.append(forgeBookTable(b.table.head, b.table.rows));
      else if (b.note) frag.append(el("p", "chronicle-note", b.note));
      else if (b.end) frag.append(el("p", "chronicle-end", b.end));
      else if (b.auto) frag.append(forgeBookAuto(b.auto));
      else if (b.god) {
        const sec = el("section", "fbook-god");
        const rel = el("p", "chronicle-p fbook-rel");
        rel.append(el("strong", null, "Стосунки: "), document.createTextNode(b.rel || ""));
        sec.append(el("h3", "chronicle-sub fbook-h", b.god), el("p", "chronicle-p", b.sphere || ""), rel);
        frag.append(sec);
      }
    });
    return frag;
  }
  // Відкрити книгу з бібліотеки за id (data/books.js → LIBRARY)
  function openLibraryBook(save, id) {
    if (id === "chronicle") showChronicle(save);
    else if (id === "forge") showForgeBook(save);
    else if (id === "gods") showDataBook(save, RPG.GODS_BOOK, "world", "is-gods-book");
  }
  // Будь-яка книга з даних у вікні-книзі (як літопис)
  function showDataBook(save, B, startKey, cls = "") {
    if (!B) return;
    showChronicle(save, startKey, { book: {
      title: B.title, cls,
      contents: () => B.sections.map(x => ({ key: x.key, title: x.title, open: true })),
      section: (sv, key, o) => dataBookSection(B, key, o)
    } });
  }
  function showForgeBook(save, startKey = "prologue") {
    if (!RPG.FORGE_BOOK) return;
    showChronicle(save, startKey, { book: {
      title: RPG.FORGE_BOOK.title, cls: "is-forge-book",
      contents: () => RPG.FORGE_BOOK.sections.map(x => ({ key: x.key, title: x.title, open: true })),
      section: forgeBookSection
    } });
  }

  // ---------- Здобич на полі бою (save.fieldLoot) ----------
  // Поки герой б'ється на одній локації, усе здобуте складається; при виході з неї
  // (перед дорогою або після загибелі) показується окреме вікно з підсумком.
  function fieldLootAdd(save, add) {
    const locId = save.location.map;
    let f = save.fieldLoot;
    if (!f || f.loc !== locId) f = save.fieldLoot = { loc: locId, battles: 0, wins: 0, exp: 0, gold: 0, items: {}, lost: {}, filtered: {} };
    f.filtered ??= {};
    f.battles++;
    if (add.win) f.wins++;
    f.exp += add.exp || 0;
    f.gold += add.gold || 0;
    for (const [k, n] of Object.entries(add.items || {})) f.items[k] = (f.items[k] || 0) + n;
    for (const [k, n] of Object.entries(add.lost || {})) f.lost[k] = (f.lost[k] || 0) + n;
    for (const [k, n] of Object.entries(add.filtered || {})) f.filtered[k] = (f.filtered[k] || 0) + n;
  }
  // Показати підсумок і очистити. Повертає Promise (виконується після закриття вікна або одразу, якщо нічого немає)
  async function showFieldLoot(save) {
    const f = save.fieldLoot;
    if (!f) return;
    delete save.fieldLoot;
    await RPG.saveGame(save).catch(e => console.error(e));
    if (!f.battles) return;
    const name = RPG.LOCATIONS[f.loc]?.name || f.loc;
    const lines = [`Боїв: ${f.battles}, перемог: ${f.wins}.`, `Досвід: +${fmtNum(f.exp)} EXP · Золото: +${fmtNum(f.gold)}`];
    const items = Object.entries(f.items);
    const list = el("ul", "notice-list");
    for (const [k, n] of items) list.append(el("li", null, n > 1 ? `${k} ×${n}` : k));
    lines.push(items.length ? "Речі й ресурси:" : "Речей і ресурсів не здобуто.");
    if (items.length) lines.push(list);
    const lost = Object.entries(f.lost);
    const filtered = Object.values(f.filtered || {}).reduce((a, n) => a + n, 0);
    if (filtered) lines.push(`Фільтр здобичі викинув речей: ${fmtNum(filtered)}.`);
    if (lost.length) lines.push(`Не вмістилось в інвентар і пропало: ${lost.map(([k, n]) => n > 1 ? `${k} ×${n}` : k).join(", ")}.`);
    await showNotice(`Здобич: ${name}`, lines, "is-loot");
  }

  // ---------- Дорога: блокування вкладок і банер з відліком ----------
  const TRAVEL_HREFS = ["character.html", "inventory.html", "maps.html"];
  function blockLink(ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }
  function lockNavForTravel() {
    document.body.classList.add("is-traveling");
    document.querySelectorAll("header nav a, main a[href]").forEach(a => {
      const href = (a.getAttribute("href") || "").split("?")[0];
      if (TRAVEL_HREFS.includes(href)) return;
      a.classList.add("travel-locked");
      a.setAttribute("aria-disabled", "true");
      a.title = "Недоступно в дорозі";
      a.addEventListener("click", blockLink, true);
    });
  }
  function unlockNavAfterTravel() {
    document.body.classList.remove("is-traveling");
    document.querySelectorAll("a.travel-locked").forEach(a => {
      a.classList.remove("travel-locked");
      a.removeAttribute("aria-disabled");
      a.removeAttribute("title");
      a.removeEventListener("click", blockLink, true);
    });
  }
  // Банер «В дорозі» на сторінках Персонаж / Інвентар
  function showTravelBanner(save) {
    const main = document.querySelector("main");
    if (!main) return;
    const bar = el("div", "travel-banner");
    bar.setAttribute("role", "status");
    const text = el("span");
    bar.append(text, link("Мапа", "maps.html"));
    main.prepend(bar);
    const name = id => (save.travel.region === "city"
      ? (RPG.LOCATIONS.city.districts.find(d => d.id === id) || {}).name
      : RPG.LOCATIONS[id]?.name) || id;
    const to = name(save.travel.to);
    const upd = async () => {
      const tr = RPG.travelState(save);
      if (tr && tr.leftMs > 0) { text.textContent = `В дорозі до «${to}»: ${RPG.fmtLeft(tr.leftMs)}`; return; }
      clearInterval(timer);
      RPG.finishTravel(save);
      await RPG.saveGame(save).catch(e => console.error(e));
      text.textContent = `Ви прибули: «${to}».`;
      bar.classList.add("is-done");
      unlockNavAfterTravel();
    };
    const timer = setInterval(upd, 250);
    upd();
  }

  // Щосекунди перевіряє, чи настав час відновлення (кожні 10 с).
  // isPaused() — напр. під час бою відновлення не застосовується.
  function startRegenTimer(save, onChange, isPaused) {
    setInterval(async () => {
      if (isPaused && isPaused()) return;
      if (RPG.applyRegenAll(save)) {
        await RPG.saveGame(save).catch(e => console.error(e));
        onChange();
      }
    }, 1000);
  }

  function itemLabel(entry) {
    return RPG.itemFullName(entry) + (entry.qty > 1 ? ` ×${entry.qty}` : "");
  }

  // Назва речі кольором рідкості
  function rarityName(ref, tag = "strong") {
    const node = el(tag, null, RPG.itemFullName(ref));
    if (RPG.hasRarity(RPG.refId(ref))) node.classList.add("rt-" + RPG.rarityOf(ref));
    return node;
  }

  // Іконка предмета зі спрайт-листа (квадратний <span> з фоном).
  // Повертає null, якщо іконки немає — тоді показується заглушка з назвою.
  function itemIcon(ref, className) {
    const id = RPG.refId(ref);
    const style = RPG.itemIconRef(ref);
    if (!style) return null;
    const icon = el("span", className + " sprite-icon");
    Object.assign(icon.style, style);
    if (RPG.hasRarity(id)) icon.classList.add("ri-" + RPG.rarityOf(ref));
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", RPG.itemFullName(ref));
    return icon;
  }

  // Клас кольору рідкості для тексту заглушки
  function rarityTextClass(ref) {
    const id = RPG.refId(ref);
    if (RPG.hasRarity(id)) return " rt-" + RPG.rarityOf(ref);
    const gr = RPG.ITEMS[id]?.grade;                  // рідкість матеріалу (окрема стопка)
    return gr && gr !== "common" ? " rt-" + gr : "";
  }

  // Маленька заглушка: перші літери назви кольором рідкості
  function miniPlaceholder(ref, className) {
    const name = RPG.itemName(ref);
    const letters = name.split(/\s+/).map(w => w[0]).join("").slice(0, 3).toUpperCase();
    const ph = el("span", `${className} mini-ph${rarityTextClass(ref)}`, letters);
    ph.title = RPG.itemFullName(ref);
    return ph;
  }

  // Наповнює клітинку предмета: картинка + кількість.
  // Якщо картинки в assets/img/items/ немає — показує назву текстом,
  // тож нову іконку достатньо просто покласти в папку.
  function fillItemCell(cell, ref, qty = 1) {
    const item = RPG.ITEMS[RPG.refId(ref)];
    cell.textContent = "";
    cell.title = RPG.itemFullName(ref) + (qty > 1 ? ` ×${qty}` : "");
    const icon = itemIcon(ref, "item-icon");
    if (icon) {
      cell.classList.add("has-icon");
      cell.append(icon);
    } else {
      cell.classList.remove("has-icon");
      cell.append(el("span", "item-name item-ph" + rarityTextClass(ref), item.name));
    }
    if (qty > 1) cell.append(el("span", "item-qty", `×${qty}`));
    const gs = RPG.gearScore ? RPG.gearScore(ref) : null;
    if (gs !== null) cell.append(el("span", "item-gs", String(gs)));
    return cell;
  }

  // Комірка спорядження розміром з іконку: річ — лише картинка,
  // порожня — коротка назва слота. Повна назва — у спливаючому вікні.
  const SLOT_SHORT = {
    mainHand: "Зброя", offHand: "Ліва рука", head: "Голова", chest: "Тіло", legs: "Штани", hands: "Наручі",
    feet: "Взуття", earring1: "Сережка", ring1: "Кільце", amulet: "Амулет", ring2: "Кільце", earring2: "Сережка"
  };
  function fillEquipCell(cell, ref, slot) {
    const item = ref && RPG.ITEMS[RPG.refId(ref)];
    cell.textContent = "";
    cell.dataset.slot = slot;
    if (item) {
      cell.classList.add("has-icon");
      cell.append(smallIcon(ref, "equip-icon"));
      const gs = RPG.gearScore ? RPG.gearScore(ref) : null;
      if (gs !== null) cell.append(el("span", "item-gs", String(gs)));
      cell.setAttribute("aria-label", `${RPG.SLOTS[slot]}: ${RPG.itemFullName(ref)}`);
    } else {
      cell.append(el("span", "equip-slot-name", SLOT_SHORT[slot] || RPG.SLOTS[slot]));
      cell.setAttribute("aria-label", `${RPG.SLOTS[slot]}: порожньо`);
      cell.title = RPG.SLOTS[slot];
    }
    return cell;
  }

  // Маленька іконка поруч із текстом (спорядження, шинок, опис)
  function smallIcon(ref, className = "mini-icon") {
    return itemIcon(ref, className) || miniPlaceholder(ref, className);
  }

  function slotClass(ref, extra = "") {
    const id = RPG.refId(ref);
    let cls = RPG.ITEMS[id]?.rarity === "rare" ? " rarity-rare" : "";
    if (RPG.hasRarity(id)) cls += " rarity-" + RPG.rarityOf(ref);
    const grade = RPG.ITEMS[id]?.grade;               // матеріал магічної / епічної / легендарної рідкості — рамка
    if (grade && grade !== "common") cls += " rarity-" + grade;
    return "wf wf-slot" + cls + (extra ? " " + extra : "");
  }

  // Збирає героя з шарів: [речі за спиною] → основа → [зброя] → [кулаки поверх руків'я]
  function renderHeroDoll(box, save) {
    const doll = RPG.heroDoll(save);
    box.textContent = "";
    box.removeAttribute("style");
    const layer = (cls, style, ref) => {
      const s = el("span", "doll-layer " + cls);
      Object.assign(s.style, style);
      if (ref && RPG.hasRarity(RPG.refId(ref))) s.classList.add("ri-" + RPG.rarityOf(ref));
      box.append(s);
    };
    for (const l of doll.layers) if (l.behind) layer("doll-item", l.style, l.ref);
    layer("doll-base", doll.base);
    for (const l of doll.layers) if (!l.behind) layer("doll-item", l.style, l.ref);
    for (const [x, y] of doll.fists) layer("doll-base", RPG.heroFistStyle(doll.base, x, y));
    renderHeroGs(box, save);
  }

  // «GS: N» у правому верхньому куті картинки героя: N — середній GS вдягнених речей
  function renderHeroGs(box, save) {
    const pic = box.parentElement;
    if (!pic || !RPG.equipmentScore) return;
    let badge = pic.querySelector(".hero-gs");
    if (!badge) { badge = el("span", "hero-gs"); pic.append(badge); }
    const es = RPG.equipmentScore(save);
    badge.textContent = `GS: ${es.avg}`;
    badge.title = es.count
      ? `Середній Gear Score вдягнених речей: ${es.avg} (речей: ${es.count}, сума: ${es.total})`
      : "Gear Score: нічого не вдягнено";
  }

  // Смужка HP / MP для невеликих рядків (напарники, вороги групою)
  function miniBar(cls, name, id) {
    const bar = el("div", `bar ${cls} bar-mini`);
    bar.dataset.name = name;
    if (id) bar.id = id;
    bar.append(el("div", "bar-fill"), el("span", "bar-label", name));
    return bar;
  }

  // Інші герої групи під портретом (сторінка локації): ім'я, рівень, HP / MP.
  // shown — хто зараз на великому портреті (його в списку немає; 0 — головний герой).
  // onPick(index) — якщо задано, клік по рядку обирає цього героя (зілля, черга дій)
  function renderPartyList(save, shown = 0, onPick = null) {
    const box = $("party-list");
    if (!box) return;
    const all = RPG.partyMembers(save);
    box.innerHTML = "";
    box.hidden = all.length < 2;
    if (all.length < 2) return;
    box.append(el("div", "party-title", `Група: ${all.length} / ${RPG.MAX_PARTY}` + (onPick ? " · клік — обрати героя" : "")));
    all.forEach((ms, i) => {
      if (i === shown) return;
      const st = RPG.calcStats(ms);
      const dead = RPG.isMemberDead(ms);
      const row = el("div", "party-row" + (dead ? " is-dead" : "") + (onPick ? " is-pickable" : ""));
      if (onPick) {
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.title = `Обрати: ${ms.character.name}`;
        row.addEventListener("click", () => onPick(i));
        row.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onPick(i); } });
      }
      const face = el("span", "party-face");
      Object.assign(face.style, RPG.heroSpriteStyle(ms.character.classId));
      const info = el("div", "party-info");
      info.append(el("strong", null, `${ms.character.name} · рів. ${ms.character.level}${dead ? (RPG.heroGender(ms) === "f" ? " · полегла" : " · полеглий") : ""}`));
      const hp = miniBar("bar-hp", "HP", "party-hp-" + i), mp = miniBar("bar-mp", "MP", "party-mp-" + i);
      setBar(hp, ms.character.hp, st.hp);
      setBar(mp, ms.character.mp, st.mp);
      info.append(hp, mp);
      row.append(face, info);
      box.append(row);
    });
  }

  // Перемикач героїв групи (Інвентар, Персонаж, Тренер, черга бою).
  // onPick(index) — коли обрали іншого героя
  function memberTabs(box, save, current, onPick) {
    if (!box) return;
    box.innerHTML = "";
    const members = RPG.partyMembers(save);
    box.hidden = members.length < 2;
    members.forEach((ms, i) => {
      const dead = RPG.isMemberDead(ms);
      const b = button(`${ms.character.name} · ${ms.character.level}${dead ? " ✝" : ""}`,
        "wf member-tab " + (i === current ? "wf-button" : "wf-link"), () => onPick(i));
      b.title = i === 0 ? "Головний герой" : "Напарник";
      if (i === current) b.setAttribute("aria-pressed", "true");
      box.append(b);
    });
  }

  // Оновлює блок героя: картинка, ім'я, HP / MP / EXP / LVL, відновлення
  function renderHeroBars(save) {
    const st = RPG.calcStats(save);
    const ch = save.character;
    const img = $("hero-img");
    if (img) { img._save = save; renderHeroDoll(img, save); }   // герой + зброя в руках (шари)
    const name = $("hero-name");
    if (name) name.textContent = `${ch.name} — ${RPG.getClass(ch.classId).name}`;

    setBar($("hero-hp"), ch.hp, st.hp);
    setBar($("hero-mp"), ch.mp, st.mp);

    const p = RPG.expProgress(save);
    const expBar = $("hero-exp");
    if (expBar) {
      if (p.max) setBar(expBar, 1, 1, "EXP 100% (максимум)");
      else setBar(expBar, p.current, p.needed, `EXP ${p.percent}%`);
      bindExpInfo(expBar, save);
    }
    const lvl = $("hero-lvl");
    if (lvl) lvl.textContent = `LVL ${ch.level}`;

    const regen = $("regen-info");
    if (regen) {
      const per = RPG.regenPerTick(save);
      const grace = RPG.graceLeft(save);
      regen.textContent = `Відновлення за 10 с: +${per.hp.toFixed(1)} HP, +${per.mp.toFixed(1)} MP` +
        (per.home ? " (з бонусом Домівки)" : "") +
        (grace ? ` · Молитва благодаті: ще ${Math.ceil(grace / 60000)} хв (+2% HP за 5 с, +3% MP за 10 с)` : "") +
        (RPG.springLeft && RPG.springLeft(save) ? ` · Джерело Велеса: +${RPG.VELES.expBonusPct}% досвіду, ще ${Math.ceil(RPG.springLeft(save) / 60000)} хв` : "") +
        (RPG.trainerBoostLeft && RPG.trainerBoostLeft(save) ? ` · Тренування з Брутом: +${RPG.TRAINER_BOOST.flat} досвіду володіння за бій, ще ${Math.ceil(RPG.trainerBoostLeft(save) / 60000)} хв` : "");
    }
    if (!save.memberIndex) renderPartyList(save);
  }

  // Смужка досвіду: мітка «i» і вікно з подробицями (рівень, %, досвід числами)
  function expInfo(save) {
    const ch = save.character;
    const p = RPG.expProgress(save);
    const cls = RPG.getClass(ch.classId);
    const box = el("div", "info-body exp-info");
    box.append(el("p", null, `Рівень ${ch.level} · ${cls.name}`));
    if (p.max) {
      box.append(el("p", null, `Максимальний рівень. Досвід: ${fmtNum(p.exp)}.`));
    } else {
      box.append(el("p", null, `Набрано ${p.percent}% до ${ch.level + 1} рівня.`));
      box.append(el("p", null, `Цей рівень: ${fmtNum(p.current)} / ${fmtNum(p.needed)} EXP (ще ${fmtNum(p.needed - p.current)}).`));
      box.append(el("p", null, `Усього в професії: ${fmtNum(p.exp)} / ${fmtNum(p.nextLevelAt)} EXP.`));
    }
    box.append(el("p", null, `Весь здобутий досвід: ${fmtNum(ch.totalExp || 0)} EXP.`));
    box.append(el("p", null, `Загибель забирає не більше ${RPG.DEATH_MAX_PCT || 25}% смужки рівня і може знизити рівень.`));
    return box;
  }
  function bindExpInfo(bar, save) {
    bar._save = save;
    const lbl = bar.querySelector(".bar-label");
    if (lbl && !lbl.querySelector(".info-i")) lbl.append(el("span", "info-i bar-i", "i"));
    if (bar.dataset.tip) return;
    bar.dataset.tip = "1";
    bar.setAttribute("role", "button");
    bar.setAttribute("aria-label", "Досвід — детальніше");
    RPG.bindTip(bar, () => expInfo(bar._save), null);
  }

  // ref — ID предмета або екземпляр з рідкістю
  function describeStats(ref) {
    return Object.entries(RPG.itemStats(ref))
      .map(([k, v]) => `${RPG.STAT_NAMES[k] || k} ${v > 0 ? "+" : ""}${v}`)
      .join(", ");
  }

  function describeEffect(item) {
    const e = item.effect || {};
    const parts = [];
    if (e.healHp) parts.push(`${e.healHp} HP`);
    if (e.healHpPct) parts.push(`${Math.round(e.healHpPct * 100)}% HP`);
    if (e.healMp) parts.push(`${e.healMp} MP`);
    if (e.healMpPct) parts.push(`${Math.round(e.healMpPct * 100)}% MP`);
    return parts.length ? "Відновлює " + parts.join(" і ") : "";
  }

  function useResultText(item, r) {
    const parts = [];
    if (r.healedHp) parts.push(`+${r.healedHp} HP`);
    if (r.healedMp) parts.push(`+${r.healedMp} MP`);
    return `${item.name}: ${parts.join(", ") || "нічого не змінилось"}`;
  }

  // Картинка локації для CSS (var(--loc-img))
  function locImage(id) {
    if (id === "south_gate") id = "city";            // вхід у Дубову Заставу — та сама картинка
    if (RPG.LOCATIONS[id]?.house) id = "home";       // власний дім — поки картинка Домівки
    return `url("${RPG.asset("assets/images/locations/loc_" + id + ".webp")}")`;
  }

  // ---------- Опис предмета для спливаючого вікна та інвентаря ----------
  const TYPE_NAMES = {
    weapon: "Зброя", armor: "Броня", accessory: "Прикраса", consumable: "Зілля",
    material: "Матеріал", offhand: "Ліва рука", shield: "Щит", quest: "Квестовий предмет", admin: "Предмет адміністратора"
  };
  const RARITY_NAMES = {
    broken: "зламана", common: "звичайна", magic: "магічна", epic: "епічна", legendary: "легендарна"
  };

  // ref — ID або екземпляр; qty — кількість у стопці; ms — сейв героя (для комплектів)
  function itemInfo(ref, qty = 1, ms = null) {
    const id = RPG.refId(ref);
    const item = RPG.ITEMS[id];
    const box = el("div", "tip-item");
    if (!item) return box;

    const head = el("div", "tip-head");
    head.append(smallIcon(ref, "tip-icon"));
    const title = el("div", "tip-title");
    const gradeCls = item.grade && item.grade !== "common" ? "rt-" + item.grade : null;
    const name = RPG.hasRarity(id) ? rarityName(ref) : el("strong", item.rarity === "rare" ? "rt-epic" : gradeCls, item.name);
    name.classList.add("tip-name");
    title.append(name);
    const sub = [TYPE_NAMES[item.type] || "Предмет"];
    if (RPG.hasRarity(id)) sub.push(RARITY_NAMES[RPG.rarityOf(ref)] || "");
    else if (item.rarity === "rare") sub.push("рідкісне");
    else if (item.grade) sub.push(RARITY_NAMES[item.grade] || "");
    if (qty > 1) sub.push(`×${fmtNum(qty)}`);
    title.append(el("span", "tip-sub", sub.filter(Boolean).join(" · ")));
    head.append(title);
    const gs = RPG.gearScore ? RPG.gearScore(ref) : null;
    if (gs !== null) {
      const p = RPG.gearScoreParts(ref);
      const badge = el("div", "tip-gs", `GS ${gs}`);
      badge.title = `Gear Score: основні ${p.primary}, ` +
        `другорядні ${p.secondary}, допоміжні ${p.auxiliary}` + (p.extra ? `, рідкість і рівень ${p.extra}` : "");
      head.append(badge);
    }
    box.append(head);

    const stats = Object.entries(RPG.itemStats(ref));
    if (stats.length) {
      const list = el("ul", "tip-stats");
      for (const [k, v] of stats) {
        const li = el("li", v < 0 ? "is-neg" : null);
        li.append(el("span", null, RPG.STAT_NAMES[k] || k), el("b", null, (v > 0 ? "+" : "") + v));
        list.append(li);
      }
      box.append(list);
    }

    const eff = describeEffect(item);
    if (eff) box.append(el("div", "tip-effect", eff));

    const set = item.set && RPG.ITEM_SETS && RPG.ITEM_SETS[item.set];
    if (set) {
      const have = ms && RPG.equippedSetCounts ? (RPG.equippedSetCounts(ms)[item.set] || 0) : 0;
      box.append(el("div", "tip-set" + (have >= set.pieces ? " rt-magic" : ""),
        `${set.name}: ${set.pieces} речі — ${set.text}` + (ms ? ` (вдягнено ${Math.min(have, set.pieces)}/${set.pieces})` : "")));
    }

    const req = [];
    if (item.slot) req.push(`Слот: ${RPG.slotsFor(item.slot).map(s => RPG.SLOTS[s]).join(" / ")}`);
    if (item.levelReq > 1 || item.slot) req.push(`рівень ${item.levelReq || 1}`);
    if (item.weaponType) {
      const need = RPG.TIER_MASTERY[item.tier] || 0;
      req.push(RPG.WEAPON_TYPES[item.weaponType].name +
        (need ? ` · ${RPG.WEAPON_TYPES[item.weaponType].mastery.toLowerCase()} ${need}` : "") +
        (item.weaponType === "bow" ? " · дворучна" : ""));
    }
    if (req.length) box.append(el("div", "tip-req", req.join(" · ")));

    if (item.description) box.append(el("p", "tip-desc", item.description));

    box.append(el("div", "tip-price", item.locked
      ? "Не продається, не викидається й не розбирається — лише в спільну скриню Домівки."
      : `Ціна: ${fmtNum(item.price || 0)} зол. · продаж: ${fmtNum(RPG.refSellPrice(ref))} зол.` +
        (item.noShop ? (item.tier === 3 ? " · продає лише Торгова гільдія" : " · не продається") : "")));
    return box;
  }

  // ============================================================
  // НОВА ГРА
  // ============================================================
  function pageNewGame() {
    const form = $("new-game-form");
    const msg = $("msg");
    const intro = $("intro-panel");
    const gender = () => form.elements.gender?.value === "f" ? "f" : "m";
    function drawIntro() {
      if (!intro || !RPG.CHRONICLE) return;
      intro.innerHTML = "";
      intro.append(el("h2", "intro-title", "Кров Іггдрасиля"));
      RPG.CHRONICLE.intro(gender()).forEach(p => intro.append(el("p", "intro-p", p)));
      intro.hidden = false;
    }
    drawIntro();
    form.querySelectorAll("input[name=gender]").forEach(r => r.addEventListener("change", drawIntro));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) { showMsg(msg, "Введіть ім'я персонажа.", true); return; }
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const save = RPG.createNewSave(name, undefined, gender());
        await RPG.saveGame(save);
        RPG.setCurrentSlot(save.id);
        location.href = "game.html";
      } catch (e) {
        console.error(e);
        showMsg(msg, "Не вдалося створити гру: " + e.message, true);
        btn.disabled = false;
      }
    });
  }

  // ============================================================
  // ЗАВАНТАЖИТИ ГРУ
  // ============================================================
  async function pageLoad() {
    const list = $("save-list");
    const msg = $("msg");

    async function render() {
      list.innerHTML = "";
      let saves = [];
      try { saves = await RPG.listSaves(); }
      catch (e) { console.error(e); showMsg(msg, "Помилка читання збережень: " + e.message, true); }

      if (!saves.length) {
        list.append(el("div", "wf wf-text", "Збережень поки немає"));
        return;
      }
      const current = RPG.getCurrentSlot();
      for (const s of saves) {
        const row = el("div", "save-row");
        const cls = RPG.getClass(s.character?.classId).name;
        const place = RPG.getLocation(s.location?.map).name;
        const btn = button("", "wf wf-link save-load", () => {
          RPG.setCurrentSlot(s.id);
          location.href = "game.html";
        });
        btn.append(el("strong", null, `${s.character?.name || "Герой"} — ${cls}, рівень ${s.character?.level || 1}`));
        btn.append(el("span", "save-date",
          `${place} · збережено: ${fmtDate(s.savedAt)}${s.id === current ? " · поточна гра" : ""}`));

        const del = button("Видалити", "wf wf-danger save-del", async () => {
          if (!confirm(`Видалити збереження «${s.character?.name}»? Цю дію не можна скасувати.`)) return;
          await RPG.deleteSave(s.id);
          render();
        });
        del.title = "Видалити це збереження";

        row.append(btn, del);
        list.append(row);
      }
    }

    $("import-btn").addEventListener("click", async () => {
      const file = await RPG.pickJsonFile();
      if (!file) return;
      try {
        const save = await RPG.importSave(file);
        showMsg(msg, `Імпортовано: ${save.character.name}, рівень ${save.character.level}.`);
        render();
      } catch (e) {
        showMsg(msg, e.message, true);
      }
    });

    render();
  }

  // ============================================================
  // НАЛАШТУВАННЯ
  // ============================================================
  async function pageSettings() {
    const msg = $("msg");
    const settings = RPG.getSettings();

    document.querySelectorAll('input[name="battle-mode"]').forEach(radio => {
      radio.checked = radio.value === settings.battleView;
      radio.addEventListener("change", () => {
        if (radio.checked) {
          RPG.setSettings({ battleView: radio.value });
          showMsg(msg, "Налаштування збережено.");
        }
      });
    });

    // Гучність: загальна, музика, звуки (audio.js). Змінюється одразу, зберігається при відпусканні
    const VOL = [["volume", "volume", 70], ["music-volume", "musicVolume", 60], ["sfx-volume", "sfxVolume", 80]];
    for (const [id, key, def] of VOL) {
      const input = $(id), out = $(id + "-value");
      if (!input) continue;
      const v = settings[key] != null ? settings[key] : def;
      input.value = v;
      out.textContent = v + "%";
      input.addEventListener("input", () => {
        out.textContent = input.value + "%";
        RPG.setSettings({ [key]: Number(input.value) });
        RPG.audio?.applyVolume();
      });
      input.addEventListener("change", () => {
        if (key === "sfxVolume") RPG.audio?.sfx("sword");
        showMsg(msg, "Налаштування збережено.");
      });
    }
    const mute = $("mute");
    if (mute) {
      mute.checked = !!settings.muted;
      mute.addEventListener("change", () => {
        RPG.setSettings({ muted: mute.checked });
        RPG.audio?.applyVolume();
        showMsg(msg, "Налаштування збережено.");
      });
    }

    // ---------- Автозілля (core.js → getAutoPotion, character.js → autoPotion) ----------
    // Окреме вікно: два блоки (здоров'я, мана) + спільні параметри. Зберігається на пристрої, не в сейві.
    const SIZE_NAMES = { auto: "Авто — найменше, якого вистачить", small: "Мале", medium: "Середнє", large: "Велике" };
    function autoPotionSummary() {
      const c = RPG.getAutoPotion();
      const side = (s, name) => (c[s].on
        ? `${name}: нижче ${c[s].below}% — пити до ${c[s].upTo}% (${c[s].size === "auto" ? "авто" : SIZE_NAMES[c[s].size].toLowerCase()}, ` +
          `до ${c[s].maxPer} за раз${c[s].magic ? ", з Чарівним" : ""})`
        : `${name}: вимкнено`);
      const box = $("autopotion-summary");
      if (box) box.textContent = `${side("hp", "Здоров'я")}. ${side("mp", "Мана")}. Діє на цьому пристрої для всіх збережень.`;
    }
    function openAutoPotion() {
      const c = RPG.getAutoPotion();
      let dlg = $("autopotion-dialog");
      if (!dlg) { dlg = el("dialog", "autopotion-dialog"); dlg.id = "autopotion-dialog"; document.body.append(dlg); }
      dlg.innerHTML = "";
      const form = el("div", "stack");
      const range = (label, min, max, step, value, fmt = v => v + "%") => {
        const wrap = el("label", "field");
        const cap = el("span"), val = el("b", null, fmt(value));
        cap.append(label + " ", val);
        const input = el("input");
        Object.assign(input, { type: "range", min, max, step, value });
        input.addEventListener("input", () => { val.textContent = fmt(input.value); });
        wrap.append(cap, input);
        return { wrap, input };
      };
      const check = (label, on) => {
        const wrap = el("label", "choice"), input = el("input");
        input.type = "checkbox"; input.checked = on;
        wrap.append(input, document.createTextNode(" " + label));
        return { wrap, input };
      };
      const block = (key, title) => {
        const s = c[key];
        const box = el("fieldset", "panel stack autopotion-side");
        box.append(el("legend", null, title));
        const on = check("Увімкнено", s.on);
        const below = range("Пити, коли нижче", 5, 95, 5, s.below);
        const upTo = range("Пити, поки не стане", 10, 100, 5, Math.max(s.upTo, s.below));
        // Ціль не може бути меншою за поріг
        below.input.addEventListener("input", () => { if (+upTo.input.value < +below.input.value) { upTo.input.value = below.input.value; upTo.input.dispatchEvent(new Event("input")); } });
        upTo.input.addEventListener("input", () => { if (+upTo.input.value < +below.input.value) { below.input.value = upTo.input.value; below.input.dispatchEvent(new Event("input")); } });
        const sizeWrap = el("label", "field");
        const size = el("select");
        for (const [v, n] of Object.entries(SIZE_NAMES)) { const o = el("option", null, n); o.value = v; size.append(o); }
        size.value = s.size;
        sizeWrap.append(el("span", null, "Розмір зілля"), size);
        const fallback = check("Якщо обраного розміру немає — брати інший", s.fallback);
        const sync = () => { fallback.wrap.hidden = size.value === "auto"; };
        size.addEventListener("change", sync); sync();
        const maxPer = range(`Не більше зілль ${key === "hp" ? "здоров'я" : "мани"} за раз для одного героя`, 1, 20, 1, s.maxPer, v => String(v));
        const magic = check(`Дозволити Чарівне зілля (лише коли звичайних зілль ${key === "hp" ? "здоров'я" : "мани"} немає)`, s.magic);
        box.append(on.wrap, below.wrap, upTo.wrap, sizeWrap, fallback.wrap, maxPer.wrap, magic.wrap);
        form.append(box);
        return () => ({ on: on.input.checked, below: +below.input.value, upTo: +upTo.input.value, size: size.value,
          fallback: fallback.input.checked, maxPer: +maxPer.input.value, magic: magic.input.checked });
      };
      const readHp = block("hp", "Здоров'я (HP)");
      const readMp = block("mp", "Мана (MP)");
      form.append(
        el("p", "note", "Перевірка — перед кожним боєм і після нього, для кожного живого героя групи. Зілля беруться лише з інвентаря. " +
          "Останнє зілля може відновити трохи більше за ціль. У данжі зілля не діють."));
      const row = el("div", "dialog-actions");
      row.append(button("Зберегти", "wf wf-button", () => {
        RPG.setSettings({ autoPotion: { hp: readHp(), mp: readMp() } });
        dlg.close();
        autoPotionSummary();
        showMsg(msg, "Налаштування автозілля збережено.");
      }), button("Скасувати", "wf wf-link", () => dlg.close()));
      dlg.append(el("h2", null, "Автозілля"), form, row);
      dlg.showModal();
    }
    autoPotionSummary();
    $("autopotion-btn")?.addEventListener("click", openAutoPotion);

    const exportBtn = $("export-btn");
    const current = await RPG.loadCurrentGame().catch(() => null);

    // Рядок коду: «god.mod» — Сфера Богів у інвентар поточної гри (одна на збереження);
    // «god.mod.off» — прибрати сферу з гри (з інвентаря й скринь). Будь-який інший текст нічого не виконує.
    const codeForm = $("code-form"), codeInput = $("code-input");
    if (codeForm) {
      codeForm.addEventListener("submit", async ev => {
        ev.preventDefault();
        const code = codeInput.value.trim().toLowerCase();
        codeInput.value = "Код";
        if (code !== "god.mod" && code !== "god.mod.off") { showMsg(msg, "Невірний код.", true); return; }
        const s = await RPG.loadCurrentGame().catch(() => null);
        if (!s) { showMsg(msg, "Немає активної гри.", true); return; }
        const off = code === "god.mod.off";
        const r = off ? RPG.removeGodsOrb(s) : RPG.grantGodsOrb(s);
        if (!r.ok) { showMsg(msg, r.reason, true); return; }
        await RPG.saveGame(s);
        showMsg(msg, off ? "Сферу Богів прибрано з гри." : "Сфера Богів — в інвентарі.");
      });
    }
    if (!current) {
      exportBtn.disabled = true;
      exportBtn.title = "Немає активної гри";
    }
    exportBtn.addEventListener("click", async () => {
      const save = await RPG.loadCurrentGame();
      if (!save) { showMsg(msg, "Немає активної гри для експорту.", true); return; }
      RPG.exportSave(save);
      showMsg(msg, "Файл збереження завантажується.");
    });

    $("import-btn").addEventListener("click", async () => {
      const file = await RPG.pickJsonFile();
      if (!file) return;
      try {
        const save = await RPG.importSave(file);
        RPG.setCurrentSlot(save.id);
        exportBtn.disabled = false;
        // Гра завантажена — «Назад» поведе на сторінку персонажа (menu.js)
        document.body.dataset.gameLoaded = "1";
        showMsg(msg, `Імпортовано й обрано поточною грою: ${save.character.name}, рівень ${save.character.level}.`);
      } catch (e) {
        showMsg(msg, e.message, true);
      }
    });
  }

  // ============================================================
  // ЕКРАН ЛОКАЦІЇ (бій, Домівка, Храм, Шинок)
  // ============================================================
  async function pageGame() {
    const save = await requireSave();
    if (!save) return;

    const msg = $("msg");

    // Посилання «game.html?loc=…» / «?district=…» — герой не телепортується, а вирушає туди дорогою (travel.js)
    const params = new URLSearchParams(location.search);
    const locParam = params.get("loc");
    const distParam = params.get("district");
    let enterError = null;
    let target = null;
    if (save.location.map === "city" && distParam && distParam !== (save.location.district || "south")) target = distParam;
    else if (locParam && RPG.LOCATIONS[locParam] && save.location.map !== locParam && locParam !== "city") target = locParam;
    if (target) {
      if (save.fieldLoot) await showFieldLoot(save);
      const r = RPG.startTravel(save, target);
      if (r.ok) {
        await RPG.saveGame(save);
        location.replace("maps.html");
        return;
      }
      enterError = r.reason;
    }
    if (locParam || distParam) history.replaceState(null, "", "game.html");
    if (RPG.velesStrangerDue(save)) setTimeout(() => meetStranger(save).then(() => renderAll()), 300);
    if (save.fieldLoot && save.fieldLoot.loc !== save.location.map) setTimeout(() => showFieldLoot(save), 0);
    const locId = save.location.map;
    const locData = RPG.getLocation(locId);
    // Власний дім показується з назвою, яку дав гравець
    const placeName = locData.house ? (RPG.houseHere(save)?.name || locData.name) : locData.name;
    $("location-name").textContent = placeName;
    $("location-desc").textContent = locData.description;
    // Фон локації (assets/images/locations/loc_<id>.webp) — за портретами та в банері.
    // Якщо картинки ще немає, лишається фон теми.
    document.body.style.setProperty("--loc-img", locImage(locId));
    document.body.dataset.loc = locId;

    const combat = RPG.isCombatLocation(locId);
    // Телефон, бойова локація: кнопка локації (перехід на мапу) — над портретами героя й ворога
    if (combat) {
      const locLink = document.querySelector("a.location");
      const home = locLink.parentElement, battleBox = document.querySelector(".battle");
      const phone = window.matchMedia("(max-width: 700px)");
      const place = () => { if (phone.matches) battleBox.before(locLink); else home.prepend(locLink); };
      place();
      phone.addEventListener("change", place);
    }
    $("enemy-col").hidden = !combat;
    $("combat-ui").hidden = !combat;
    $("place-panel").hidden = combat;
    document.querySelector(".battle").classList.toggle("no-enemy", !combat);

    let fighting = false;
    let queueMember = 0;        // обраний герой групи: його чергу дій налаштовуємо, йому — зілля (0 — головний)
    // Чий портрет, смужки HP/MP і швидкий доступ показуємо: обраного героя,
    // а під час показу бою — завжди головного (анімація бою пише в його смужки)
    function heroView() {
      if (!combat || fighting) return save;
      if (queueMember >= RPG.partySize(save)) queueMember = 0;
      return RPG.memberSave(save, queueMember);
    }
    function drawHero() {
      const v = heroView();
      renderHeroBars(v);
      renderPartyList(save, v.memberIndex || 0, combat && !fighting && RPG.partySize(save) > 1 ? pickMember : null);
    }
    // Обрали іншого героя групи (вкладки над чергою дій або клік по рядку групи)
    function pickMember(i) {
      queueMember = i;
      if (fighting) { renderQueue(); return; }
      renderAll();
    }
    // Данж локації (dungeon.js): режим «explore» — звичайні бої, «dungeon» — данж
    const dungeonInfo = combat ? RPG.locationDungeon(locId) : null;
    let mode = dungeonInfo && RPG.activeDungeon(save) ? "dungeon" : "explore";
    const dungeonOn = () => mode === "dungeon" && !!RPG.activeDungeon(save);
    // Музика локації: бій — під тип локації (останній бій данжу — тема боса), Дубова Застава — під район
    function playLocationMusic() {
      if (!RPG.audio) return;
      const dun = dungeonOn() ? RPG.activeDungeon(save) : null;
      if (combat) RPG.audio.scene({ screen: "combat", location: locId, region: locData.region, boss: !!(dun && dun.stage === dun.stages) });
      else if (locData.type === "city") RPG.audio.scene({ screen: "city", district: save.location.district || "south" });
      else if (locData.type === "citygate") RPG.audio.scene({ screen: "city", district: "south" });
      else RPG.audio.scene({ screen: "map", region: locData.region || "start" });
    }
    playLocationMusic();
    if (enterError) setTimeout(() => showMsg(msg, enterError + " Ви залишились тут.", true), 0);

    function renderQuickSlots() {
      const box = $("quick-slots");
      box.innerHTML = "";
      for (let i = 0; i < 12; i++) {
        const entry = save.inventory[i];
        if (!entry) { box.append(el("div", "wf wf-slot slot-empty", "")); continue; }
        const item = RPG.ITEMS[entry.id];
        const cell = fillItemCell(button("", slotClass(entry)), entry, entry.qty);
        cell.removeAttribute("title");
        cell.setAttribute("aria-label", itemLabel(entry));
        const usable = item.type === "consumable";
        const ms = heroView();   // зілля п'є обраний герой групи
        const who = RPG.partySize(save) > 1 ? `${ms.character.name}: ` : "";
        const use = async () => {
          if (fighting) return;
          const r = RPG.useItem(ms, entry.id);
          if (!r.ok) { showMsg(msg, who + r.reason, true); return; }
          showMsg(msg, who + useResultText(item, r));
          await RPG.saveGame(save);
          renderAll();
        };
        if (usable) {
          cell.classList.add("slot-usable");
          cell.addEventListener("dblclick", () => { RPG.popover.hide(); use(); });
        } else {
          cell.classList.add("slot-passive");
        }
        RPG.bindTip(cell, () => itemInfo(entry, entry.qty, ms), () => [
          usable && { text: "Використати", className: "wf-button", onClick: use },
          { text: "Інвентар", className: "wf-link", onClick: () => { location.href = "inventory.html"; } }
        ]);
        box.append(cell);
      }
      $("gold").textContent = `Золото: ${fmtNum(save.character.gold)}`;
      const qt = $("quick-title");
      if (qt) qt.textContent = RPG.partySize(save) > 1 ? `Швидкий доступ · ${heroView().character.name}` : "Швидкий доступ";
    }

    // ---------- Мирні локації ----------
    const place = $("place-panel");

    function renderPlace() {
      place.innerHTML = "";
      const banner = el("div", "place-banner info-anchor");
      banner.append(el("h2", null, placeName));
      place.append(banner);
      if (locData.type === "home") renderHome();
      else if (locData.type === "temple") renderTemple();
      else if (locData.type === "tavern") renderTavern();
      else if (locData.type === "city") renderCity();
      else if (locData.type === "gate") renderDarkGate();
      else if (locData.type === "citygate") renderCityGate();
      // Скриня в іншій (не Домівка) локації — пов'язана або окрема, див. character.js → CHEST_STORAGES
      if (locData.chest && locData.type !== "home") {
        const used = RPG.chestList(save, locData.chest).length;
        place.append(el("p", "note", `Скриня: ${used}/${RPG.chestConf(locData.chest).size} клітинок зайнято.`));
        place.append(link("Інвентар і скриня", "inventory.html"));
      }
    }

    function renderHome() {
      const per = RPG.regenPerTick(save);
      place.append(el("p", "note", "Тут битися заборонено — монстри сюди не заходять."));
      place.append(el("p", "note",
        `Відпочинок: додатково +${Math.round(RPG.HOME_REGEN_PCT * 100)}% здоров'я та мани кожні 10 секунд ` +
        `понад звичайне відновлення. Зараз: +${per.hp.toFixed(1)} HP і +${per.mp.toFixed(1)} MP за 10 с.`));
      const sid = RPG.chestHere(save) || RPG.DEFAULT_CHEST;
      const used = RPG.chestList(save, sid).length;
      place.append(el("p", "note", `Скриня: ${used}/${RPG.chestConf(sid).size} клітинок зайнято. Речі в скрині не зникають, навіть якщо герой загине.`));
      const row = el("div", "row");
      row.append(link("Інвентар і скриня", "inventory.html"), link("Вирушити (Мапа)", "maps.html"));
      place.append(row);
      if (locData.house) { renderHouseExtras(); return; }
      // Обірваний пергамент — шматок Прологу з книги «Предки…» (data/chronicle.js → PARCHMENT)
      // Після прочитання пергамент іде в торбу (save.story.parchment = "have") — кнопка зникає
      if (RPG.CHRONICLE && !RPG.parchmentState(save)) {
        const P = RPG.CHRONICLE.PARCHMENT;
        const box = el("div", "stack parchment-hint");
        box.append(el("p", "parchment-text", P.hint));
        box.append(button("Прочитати пергамент", "wf wf-link", async () => {
          (save.story ??= {}).parchment = "have";
          await RPG.saveGame(save).catch(e => console.error(e));
          showParchment();
          renderPlace();
        }));
        place.append(box);
      }
    }

    // Власний дім: добудови (кузня, склад — наступні етапи) і вихід у Спальний район
    function renderHouseExtras() {
      const key = locData.house, h = RPG.houseOf(save, key);
      const box = el("div", "stack house-panel");
      box.append(el("h3", null, "Добудови"));
      // Склад і скрині ремесла
      const wh = el("div", "stack house-build");
      if (!h?.warehouse) {
        wh.append(el("p", null, `Склад — місце для скринь ремесла: матеріалів, зілля й речей. Добудова — ${fmtNum(RPG.WAREHOUSE_PRICE)} золота.`));
        const b = button(`Збудувати склад за ${fmtNum(RPG.WAREHOUSE_PRICE)} золота`, "wf wf-button", async () => {
          const r = RPG.buildWarehouse(save, key);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `Склад збудовано! −${fmtNum(r.price)} золота. Тепер можна купувати скрині ремесла.`);
          renderAll();
        });
        b.disabled = save.character.gold < RPG.WAREHOUSE_PRICE;
        wh.append(b);
      } else {
        wh.append(el("strong", null, "Склад"));
        // Куплені до максимуму скрині з переліку покупок зникають; коли куплено все — лишається тільки підсумок
        const chestTypes = Object.entries(RPG.CRAFT_CHESTS);
        const left = chestTypes.filter(([type, t]) => (h.chests?.[type] || 0) < t.max);
        if (!left.length) wh.append(el("small", "shop-lvl", "Усі скрині ремесла куплено: " +
          chestTypes.map(([, t]) => `${t.name.replace("Скриня ", "").toLowerCase()} ×${t.max}`).join(", ") + "."));
        for (const [type, t] of left) {
          const have = h.chests?.[type] || 0;
          const r = el("div", "shop-row house-chest");
          r.append(el("span", "shop-name", `${t.name}: ${have}/${t.max}`),
            el("small", "shop-lvl", `${t.size} клітинок · ${RPG.CRAFT_CHEST_ALLOW_TEXT[type]}${type === "item" ? "" : `, до ${fmtNum(t.stack)} шт.`}`));
          const b = button(`Купити · ${fmtNum(t.price)} зол.`, "wf wf-button", async () => {
            const res = RPG.buyCraftChest(save, key, type);
            if (!res.ok) { showMsg(msg, res.reason, true); return; }
            await RPG.saveGame(save);
            showMsg(msg, `${res.name} №${res.n} стоїть на складі. −${fmtNum(res.price)} золота.`);
            renderAll();
          });
          b.disabled = save.character.gold < t.price;
          r.append(b);
          wh.append(r);
        }
        wh.append(link("Відкрити скрині (Інвентар)", "inventory.html"));
      }
      box.append(wh);
      // Кузня
      const fg = el("div", "stack house-build");
      if (!h?.forge) {
        fg.append(el("p", null, `Кузня — тут куватимете й розбиратимете речі. Добудова — ${fmtNum(RPG.FORGE_PRICE)} золота. ` +
          "Знаряддя для неї продає коваль Кузьма в Гільдії ремісників (Торговий район)."));
        const b = button(`Збудувати кузню за ${fmtNum(RPG.FORGE_PRICE)} золота`, "wf wf-button", async () => {
          const r = RPG.buildForge(save, key);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `Кузню збудовано! −${fmtNum(r.price)} золота. Тепер купіть знаряддя в коваля Кузьми.`);
          renderAll();
        });
        b.disabled = save.character.gold < RPG.FORGE_PRICE;
        fg.append(b);
      } else {
        fg.append(el("strong", null, "Кузня"));
        // Знаряддя: показуємо лише те, чого ще бракує; коли куплено все — перелік зникає
        const lacking = Object.entries(RPG.FORGE_TOOLS).filter(([id]) => !h.forge.tools[id]);
        if (lacking.length) {
          const tools = el("div", "tool-grid");
          for (const [, t] of lacking) tools.append(el("span", "tool-chip" + (t.need ? " is-need" : ""), "✗ " + t.name));
          fg.append(el("small", "shop-lvl", "Ще не куплено:"), tools);
        }
        const miss = RPG.forgeMissing(h);
        if (miss.length) fg.append(el("p", "house-soon",
          `Щоб почати кувати, бракує: ${miss.map(id => RPG.FORGE_TOOLS[id].name.toLowerCase()).join(", ")}. Знаряддя — у коваля Кузьми (Торговий район).`));
        if (!RPG.hasCraftAccess(save)) fg.append(el("p", "house-soon", "Кувати й купувати знаряддя можна, коли головний герой має професію."));
        if (RPG.craftState && RPG.hasCraftAccess(save)) {
          const st = RPG.craftState(save);
          const book = RPG.hasForgeBook(save);
          if (!book) fg.append(el("p", "house-soon", `Першу науку коваля — книгу «${RPG.FORGE_BOOK.title}» — продає Кузьма в Гільдії ремісників (Торговий район). Без неї кувати не вийде.`));
          fg.append(el("p", "forge-mastery", `Майстерність коваля: ${st.level} (${craftRank(st.level)}) · шанс успіху ${pct(RPG.craftSuccessChance(save, h))}`));
          fg.append(el("p", "forge-cat", RPG.RECIPE_GROUPS.map(g => `${g.name} ${RPG.craftCat(save, g.id).level}/${RPG.craftCatMaxLevel(g.id)}`).join(" · ")));
          const row = el("div", "row forge-open-row");
          const open = button("Кувати", "wf wf-button", () => showForge());
          open.disabled = !!miss.length || !book;
          row.append(open);
          if (book) row.append(button("Книга «Небесна кузня»", "wf wf-secondary", () => showForgeBook(save)));
          fg.append(row);
        }
      }
      box.append(fg);
      // Бібліотека: усі знайдені за сюжетом і куплені книги (data/books.js → LIBRARY)
      if (RPG.libraryBooks) {
        const lib = el("div", "stack house-build house-library");
        lib.append(el("strong", null, "Бібліотека"));
        const books = RPG.libraryBooks(save);
        if (!books.length) lib.append(el("p", "house-soon", "Полиці ще порожні. Сюди ляже кожна книга, яку ви знайдете в мандрах чи купите в торговців."));
        for (const bk of books) {
          const r = el("div", "shop-row tool-row library-row");
          const info = el("div", "tool-info");
          info.append(el("strong", null, `«${bk.title}»`), el("small", null, bk.note));
          r.append(info, button("Читати", "wf wf-secondary", () => openLibraryBook(save, bk.id)));
          lib.append(r);
        }
        box.append(lib);
      }
      const row = el("div", "row");
      row.append(button("Вийти в Спальний район", "wf wf-secondary", async () => {
        RPG.enterCity(save, RPG.HOUSES[locData.house].district);
        await RPG.saveGame(save);
        location.href = "game.html";
      }));
      box.append(row);
      place.append(box);
    }

    // ---------- Кузня: кування і переплавка (craft.js, data/recipes.js) ----------
    const pct = x => `${Math.round(x * 100)}%`;
    function craftRank(lvl) {
      return lvl >= 30 ? "Небесний коваль" : lvl >= 20 ? "Майстер" : lvl >= 10 ? "Підмайстер" : "Учень";
    }
    const RARITY_LABEL = { broken: "зламана", common: "звичайна", magic: "магічна", epic: "епічна", legendary: "легендарна" };
    // Підвищення рівнів після кування/розбору: загальна майстерність і майстерність виду
    function craftUpsText(r) {
      const parts = [];
      if (r.levelUps?.length) parts.push(`Майстерність ${r.levelUps.at(-1)}!`);
      const g = RPG.RECIPE_GROUPS.find(x => x.id === r.cat);
      if (g && r.catUps?.length) parts.push(`${g.name}: рівень ${r.catUps.at(-1)}!`);
      return parts.length ? ". " + parts.join(" ") : ".";
    }
    let forgeTab = "weapon", forgePreferRare = false, forgeSpark = false, forgeResult = null, disConfirm = null;
    function showForge() {
      document.querySelector(".forge-dialog")?.remove();
      const dlg = el("dialog", "notice-dialog forge-dialog");
      const draw = () => {
        dlg.innerHTML = "";
        const close = button("×", "notice-close", () => dlg.close());
        close.setAttribute("aria-label", "Закрити кузню");
        const st = RPG.craftState(save);
        const house = RPG.houseHere(save);
        const next = RPG.craftExpToNext(st.level);
        dlg.append(close, el("h3", null, "Кузня"));
        dlg.append(el("p", "forge-mastery", `Майстерність ${st.level} — ${craftRank(st.level)}` +
          (st.level < RPG.CRAFT_MAX_LEVEL ? ` · досвід ${fmtNum(st.exp)}/${fmtNum(next)}` : "") +
          ` · успіх ${pct(RPG.craftSuccessChance(save, house))}`));
        if (forgeResult) dlg.append(el("p", "forge-result" + (forgeResult.error ? " is-error" : ""), forgeResult.text));
        const tabs = el("div", "row npc-tabs forge-tabs");
        for (const gr of [...RPG.RECIPE_GROUPS, { id: "smelt", name: "Переплавка" }, { id: "dis", name: "Розбір" }]) {
          tabs.append(button(gr.name, "wf " + (forgeTab === gr.id ? "wf-button" : "wf-link"), () => { forgeTab = gr.id; forgeResult = null; disConfirm = null; draw(); }));
        }
        dlg.append(tabs);
        // рівень майстерності виду (відкриває тіри); загальна майстерність — лише шанс успіху й рідкість
        const curGroup = RPG.RECIPE_GROUPS.find(x => x.id === forgeTab);
        if (curGroup) {
          const cs = RPG.craftCat(save, curGroup.id), cmax = RPG.craftCatMaxLevel(curGroup.id);
          dlg.append(el("p", "forge-cat", `${curGroup.name}: рівень ${cs.level}/${cmax}` +
            (cs.level < cmax ? ` · досвід ${fmtNum(cs.exp)}/${fmtNum(RPG.craftExpToNext(cs.level))}` : " · максимум") +
            ` · відкрито тір ${RPG.craftCatOpenTier(cs.level)}`));
        }
        if (forgeTab === "smelt") { drawSmelt(); return; }
        if (forgeTab === "dis") { drawDis(); return; }
        // параметри
        const optRow = el("div", "forge-opts");
        const cb = (label, val, set) => {
          const l = el("label", "forge-opt");
          const i = el("input"); i.type = "checkbox"; i.checked = val;
          i.addEventListener("change", () => { set(i.checked); draw(); });
          l.append(i, document.createTextNode(" " + label));
          return l;
        };
        optRow.append(cb("Спершу рідкісніші матеріали (кращі шанси)", forgePreferRare, v => forgePreferRare = v));
        const sparks = RPG.craftCountMat(save, "heavenly_spark");
        if (sparks) optRow.append(cb(`Додати Небесну іскру (до +10% до легендарної; є ${sparks})`, forgeSpark, v => forgeSpark = v));
        else forgeSpark = false;
        dlg.append(optRow);
        if (RPG.chestsHere(save).some(id => RPG.parseCraftChest(id)?.type === "mat"))
          dlg.append(el("small", "forge-why", "Матеріали беруться з інвентаря і скринь для матеріалів цього дому."));
        const group = RPG.RECIPE_GROUPS.find(x => x.id === forgeTab);
        const list = el("div", "stack forge-list");
        for (const [id, rc] of Object.entries(RPG.RECIPES).sort((a, b) => a[1].tier - b[1].tier)) {
          const item = RPG.ITEMS[id];
          if (!item || !group.types.includes(item.type)) continue;
          const info = RPG.recipeInfo(save, id);
          const row = el("div", "forge-row" + (info.levelOk ? "" : " is-locked"));
          const head = el("div", "forge-head");
          head.append(smallIcon(id), el("strong", null, item.name), el("small", "forge-tier", `тір ${rc.tier}`));
          row.append(head);
          const mats = el("div", "forge-mats");
          for (const m of info.mats) mats.append(el("span", "forge-mat" + (m.have >= m.need ? " is-ok" : " is-short"), `${RPG.ITEMS[m.id].name} ${fmtNum(m.have)}/${m.need}`));
          for (const t of info.tools) mats.append(el("span", "forge-mat" + (t.have ? " is-ok" : " is-short"), `знаряддя: ${RPG.FORGE_TOOLS[t.id].name}`));
          row.append(mats);
          if (info.levelOk) {
            const odds = RPG.craftOdds(save, id, { preferRare: forgePreferRare, spark: forgeSpark });
            row.append(el("p", "forge-odds", ["broken", "common", "magic", "epic", "legendary"]
              .filter(r => odds[r] >= 0.005).map(r => `${RARITY_LABEL[r]} ${pct(odds[r])}`).join(" · ")));
          }
          const b = button(info.levelOk ? "Кувати" : `${group.name} ${info.tierLevel}`, "wf wf-button forge-btn", async () => {
            const r = RPG.craftItem(save, id, { preferRare: forgePreferRare, spark: forgeSpark });
            if (!r.ok) { forgeResult = { text: r.reason, error: true }; draw(); return; }
            await RPG.saveGame(save);
            forgeResult = { text: `Викувано: ${RPG.itemFullName(r.ref)} (${RARITY_LABEL[r.rarity]}). +${r.exp} досвіду майстерності` +
              (r.spark ? ", Небесна іскра згоріла" : "") + craftUpsText(r) };
            draw();
          });
          b.disabled = !info.canCraft;
          if (!info.canCraft && info.reason) b.title = info.reason;
          row.append(b);
          if (!info.canCraft && info.levelOk) row.append(el("small", "forge-why", info.reason));
          list.append(row);
        }
        dlg.append(list);
      };
      const drawSmelt = () => {
        const list = el("div", "stack forge-list");
        list.append(el("p", "forge-why", "Переплавка завжди вдається: 2 руди → 1 злиток тієї ж рідкості (залізо — ще й 1 вугілля та міхи). +1 досвіду за злиток. " +
          "Руда й вугілля беруться і зі скринь для матеріалів; злитки, що не влізли в інвентар, лягають туди ж."));
        for (const ingot of Object.keys(RPG.SMELT)) {
          const info = RPG.smeltInfo(save, ingot);
          const row = el("div", "forge-row");
          const head = el("div", "forge-head");
          head.append(smallIcon(ingot), el("strong", null, RPG.ITEMS[ingot].name));
          row.append(head);
          const mats = el("div", "forge-mats");
          const oreTotal = info.byGrade.reduce((n, b) => n + RPG.craftCountMat(save, b.ore), 0);
          mats.append(el("span", "forge-mat" + (oreTotal >= info.s.oreQty ? " is-ok" : " is-short"), `${RPG.ITEMS[info.s.ore].name}: ${fmtNum(oreTotal)}`));
          if (info.s.coal) mats.append(el("span", "forge-mat" + (info.coalHave >= info.s.coal ? " is-ok" : " is-short"), `Вугілля: ${fmtNum(info.coalHave)}`));
          for (const t of info.s.tools) mats.append(el("span", "forge-mat" + (RPG.houseHere(save)?.forge?.tools?.[t] ? " is-ok" : " is-short"), `знаряддя: ${RPG.FORGE_TOOLS[t].name}`));
          row.append(mats);
          const btns = el("div", "row forge-smelt-btns");
          for (const n of [1, 10, info.max]) {
            if (n < 1 || (n === info.max && (n === 1 || n === 10))) continue;
            const b = button(n === info.max ? `Усе (${fmtNum(n)})` : `×${n}`, "wf wf-button", async () => {
              const r = RPG.smelt(save, ingot, n);
              if (!r.ok) { forgeResult = { text: r.reason, error: true }; draw(); return; }
              await RPG.saveGame(save);
              forgeResult = { text: `Переплавлено: ${RPG.ITEMS[ingot].name} ×${fmtNum(r.made)}. +${r.exp} досвіду майстерності` + (r.levelUps.length ? `. Майстерність ${r.levelUps.at(-1)}!` : ".") };
              draw();
            });
            b.disabled = !info.ready.ok || info.max < n;
            btns.append(b);
          }
          if (!info.ready.ok) row.append(el("small", "forge-why", info.ready.reason));
          row.append(btns);
          list.append(row);
        }
        dlg.append(list);
      };
      // Розбір речей з інвентаря (craft.js → disassemble). Вдягнені речі не показуються.
      const drawDis = () => {
        const list = el("div", "stack forge-list");
        list.append(el("p", "forge-why", "Розбір повертає частину матеріалів рецепта: зламана річ — 25%, звичайна — 40%, магічна — 50% + 1 магічний матеріал, " +
          "епічна — 60% + 1 епічний, легендарна — 70% + Небесна іскра. Досвід — за кожен матеріал: 1 / 3 / 8 / 25. Розбираються лише речі з інвентаря — рецепт не потрібен; вдягнені спершу зніміть, зі скринь — заберіть в інвентар."));
        const ready = RPG.craftForgeReady(save);
        if (!ready.ok) list.append(el("small", "forge-why", ready.reason));
        let any = false;
        save.inventory.forEach((ref, index) => {
          const info = RPG.disassembleInfo(save, index);
          if (!info) return;
          any = true;
          const row = el("div", "forge-row");
          const head = el("div", "forge-head");
          head.append(smallIcon(ref), el("strong", "forge-dis-name" + rarityTextClass(ref), RPG.itemFullName(ref)),
            el("small", "forge-tier", `${RARITY_LABEL[info.rarity]} · ${pct(info.share)}`));
          row.append(head);
          const mats = el("div", "forge-mats");
          for (const [id, q] of info.mats) mats.append(el("span", "forge-mat is-ok", `${RPG.ITEMS[id].name} ×${q}`));
          if (info.bonus === "spark") mats.append(el("span", "forge-mat is-ok rt-legendary", "Небесна іскра ×1"));
          else if (info.bonus) mats.append(el("span", "forge-mat is-ok rt-" + info.bonus, `+1 ${info.bonus === "magic" ? "магічний" : "епічний"} матеріал`));
          mats.append(el("span", "forge-mat", `+${info.exp} досвіду`));
          row.append(mats);
          const asking = disConfirm === index;
          const b = button(asking ? "Так, розібрати" : "Розібрати", "wf " + (asking ? "wf-danger" : "wf-button") + " forge-btn", async () => {
            if (info.confirm && !asking) { disConfirm = index; forgeResult = { text: `${RPG.itemFullName(ref)} — ${RARITY_LABEL[info.rarity]} річ. Натисніть ще раз, щоб розібрати.`, error: true }; draw(); return; }
            disConfirm = null;
            const r = RPG.disassemble(save, index);
            if (!r.ok) { forgeResult = { text: r.reason, error: true }; draw(); return; }
            await RPG.saveGame(save);
            forgeResult = { text: `Розібрано: ${r.name}. Отримано: ${r.got.map(([id, q]) => `${RPG.ITEMS[id].name} ×${q}`).join(", ")}. +${r.exp} досвіду майстерності` +
              craftUpsText(r) };
            draw();
          });
          b.disabled = !ready.ok;
          row.append(b);
          if (asking) row.append(button("Скасувати", "wf wf-link", () => { disConfirm = null; forgeResult = null; draw(); }));
          list.append(row);
        });
        if (!any) list.append(el("p", "house-soon", "В інвентарі немає речей, які можна розібрати. Розбираються зброя, щити, броня й прикраси, що лежать в інвентарі (не в скринях)."));
        dlg.append(list);
      };
      dlg.addEventListener("close", () => { dlg.remove(); forgeResult = null; disConfirm = null; renderAll(); });
      document.body.append(dlg);
      draw();
      dlg.showModal();
    }

    // Вікно з полем для назви дому — лише при купівлі (назву дають один раз)
    function askHouseName(current, onOk, opts = {}) {
      const dlg = el("dialog", "notice-dialog house-dialog");
      const close = button("×", "notice-close", () => dlg.close());
      close.setAttribute("aria-label", "Закрити");
      dlg.append(close, el("h3", null, opts.title || "Назва дому"));
      if (opts.text) dlg.append(el("p", null, opts.text));
      const label = el("label", "field", "Назва дому");
      const input = el("input");
      Object.assign(input, { type: "text", maxLength: RPG.HOUSE_NAME_MAX, value: current, placeholder: "Напр. «Дубовий двір»" });
      label.append(input);
      const ok = button(opts.okText || "Зберегти", "wf wf-button", () => { const v = input.value; dlg.close(); onOk(v); });
      input.addEventListener("keydown", e => { if (e.key === "Enter") ok.click(); });
      dlg.append(label, el("p", "note keep", `До ${RPG.HOUSE_NAME_MAX} символів. Назву дають лише раз — змінити її потім не можна. ` +
        "Згодом доми будуть і в інших містах — назва допоможе їх розрізняти."), ok);
      dlg.addEventListener("close", () => dlg.remove());
      document.body.append(dlg);
      dlg.showModal();
      input.focus();
    }

    // --- Спальний район: управитель продає дім на околиці ---
    function renderRestDistrict(box) {
      renderNpc(box, "rest_steward");
      const key = "oak", conf = RPG.HOUSES[key], h = RPG.houseOf(save, key);
      const card = el("div", "stack house-card");
      if (!h) {
        card.append(el("p", null, `Дім на околиці Спального району — ${fmtNum(conf.price)} золота. У вас: ${fmtNum(save.character.gold)}.`));
        const buy = button(`Купити дім за ${fmtNum(conf.price)} золота`, "wf wf-button", () => askHouseName("", async name => {
          const r = RPG.buyHouse(save, key, name);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `Дім «${r.house.name}» тепер ваш! −${fmtNum(r.price)} золота.`);
          renderAll();
        }, { title: "Купівля дому", okText: `Купити за ${fmtNum(conf.price)} золота`,
             text: "Як назвете свій дім? Оберіть уважно: назва дається один раз." }));
        buy.disabled = save.character.gold < conf.price;
        card.append(buy);
      } else {
        card.append(el("p", null, `Ваш дім: «${h.name}».`));
        card.append(button(`Увійти в дім «${h.name}»`, "wf wf-button", async () => {
          const r = RPG.enterHouse(save, key);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          location.href = "game.html";
        }));
      }
      box.append(card);
    }

    // Темний ліс: зворотний бік Центральної брами
    function renderDarkGate() {
      place.append(el("p", "note", locData.description));
      place.append(el("p", "note", "Тут не б'ються. Звідси — дороги до всіх місць Темного лісу (Мапа). Щоб повернутися в Дубову Заставу, гукніть капітана варти."));
      renderNpc(place, "captain");
      const row = el("div", "row");
      row.append(link("Мапа Темного лісу", "maps.html"));
      place.append(row);
    }

    // Стартова мапа: Південні ворота Дубової Застави
    function renderCityGate() {
      place.append(el("p", "note", "Тут не б'ються. Крізь ворота — Південний район Дубової Застави з Гільдією авантюристів."));
      const row = el("div", "row");
      row.append(button("Увійти в Дубову Заставу", "wf wf-button", async () => {
        RPG.enterCity(save, "south");
        await RPG.saveGame(save);
        location.reload();
      }), link("Мапа", "maps.html"));
      place.append(row);
    }

    function renderTemple() {
      place.append(el("p", "note",
        `Сюди повертаються загиблі. Відроджені мають ${Math.round(RPG.RESPAWN_HP_PCT * 100)}% здоров'я та 0% мани — ` +
        "відновіться зіллям або вирушайте відпочити в Домівку."));
      renderNpc(place, "nun");
      if (RPG.velesState(save).stage >= 4) renderCourtyard(place);
      const row = el("div", "row");
      row.append(link("Мапа", "maps.html"));
      place.append(row);
    }

    // --- Внутрішній двір Храму: статуя Велеса й джерело (квест «Долоні Велеса») ---
    let springWaking = false;      // сферу щойно поклали — 5 секунд «нічого не відбувається»
    function renderCourtyard(box) {
      const V = RPG.VELES;
      const st = RPG.velesState(save);
      const card = el("div", "stack explore-card");
      card.append(el("h3", null, "Внутрішній двір Храму"));
      if (springWaking) {
        card.append(el("p", null, "Ви кладете сферу на долоні статуї. Камінь лягає в ромбовидний виступ, мов там і був…"));
        card.append(el("p", "rt-magic", "Нічого не відбувається."));
      } else if (st.stage < 5) {
        card.append(el("p", null, "Посеред двору — висохлий кам'яний фонтан. Над ним — статуя Велеса, що береже мудрість поколінь, " +
          "з глечиком біля ніг. На розкритих долонях статуї — невеликий виступ у формі ромба."));
        const put = button("Покласти сферу на долоні статуї", "wf wf-button", async () => {
          const r = RPG.velesPlaceOrb(save);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          springWaking = true;
          npcNode.nun = "start"; npcResult.nun = null;     // Ївга мовчить, поки джерело прокидається
          renderAll();
          setTimeout(() => {
            springWaking = false;
            showMsg(msg, "Раптом з глечика біля ніг статуї починає сочитися блакитна вода. Вона тече все швидше, дзюрчить по каменю — " +
              "і висохлий фонтан наповнюється сяйливою блакиттю. Джерело Велеса прокинулося!");
            if (RPG.audio?.jingle) RPG.audio.jingle("levelup");
            renderAll();
          }, V.waitMs);
        });
        put.disabled = RPG.countItem(save, "orb_veles") < 1;
        card.append(put);
      } else {
        card.append(el("p", null, "Над фонтаном височіє статуя Велеса зі сферою на долонях. З глечика біля його ніг тече блакитна вода, " +
          "і чаша фонтана повна до країв. Це чарівне джерело: хто нап'ється — тому кожен бій дає втричі більше досвіду " +
          `(+${V.expBonusPct}% до досвіду групи) протягом ${V.durationMs / 60000} хвилин. Потім вода годину набирає силу знову.`));
        const left = RPG.springLeft(save);
        const wait = RPG.springCooldown(save);
        if (left) card.append(el("p", "rt-magic", `Сила джерела ще з вами — близько ${Math.ceil(left / 60000)} хв. ` +
          `Після цього вода набиратиме силу ще ${RPG.VELES.cooldownMs / 60000} хв.`));
        else if (wait) card.append(el("p", "rt-magic", `Вода в чаші ще не набрала сили — пити знову можна буде за ${Math.ceil(wait / 60000)} хв.`));
        const drink = button("Випити з джерела", "wf wf-button", async () => {
          const r = RPG.drinkSpring(save);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          journalReward(save, "Джерело Велеса", `Група напилася з чарівного джерела: +${V.expBonusPct}% досвіду за бої на ${r.minutes} хвилин.`);
          await RPG.saveGame(save);
          showMsg(msg, `Вода холодна й солодка, як весняний дощ. Уся група відчуває, як світ стає яснішим: +${V.expBonusPct}% досвіду ` +
            `за бої на ${r.minutes} хвилин.`);
          renderAll();
        });
        drink.disabled = !!wait;
        card.append(drink);
      }
      box.append(card);
    }

    // ---------- Розмови з NPC (data/npcs.js) ----------
    const npcNode = {};      // на якому вузлі розмова з кожним NPC
    const npcResult = {};    // відповідь на останню дію (молитва, оплата…)
    const npcCtx = { member: 0 };

    const NPC_ACTIONS = {
      async pray() {
        const r = RPG.pray(save);
        if (!r.ok) return { text: r.reason, error: true };
        await RPG.saveGame(save);
        return { text: r.revived.length
          ? `Сестра Ївга довго молиться над полеглими. Відроджено: ${r.revived.join(", ")}.`
          : "«У твоїй групі немає полеглих. Хай так буде й надалі.»" };
      },
      async grace() {
        const r = RPG.buyGrace(save);
        if (!r.ok) return { text: `«${r.reason}»`, error: true, to: "grace" };
        await RPG.saveGame(save);
        return { text: `Сестра Ївга читає Молитву благодаті${r.count > 1 ? " над усією групою" : ""}. Пожертва: ${fmtNum(r.cost)} золота. Благодать діятиме 10 хвилин.` };
      },
      async gate_start() {
        const r = RPG.startGate(save);
        if (!r.ok) return { text: `«${r.reason}»`, error: true };
        await RPG.saveGame(save);
        return { text: "Квест «Варта Центральної брами» взято. Прогрес — у журналі квестів на сторінці «Персонаж».", to: "progress" };
      },
      async gate_turn() {
        const r = RPG.turnInGate(save);
        if (!r.ok) return { text: `«${r.reason}»`, error: true, to: "progress" };
        await RPG.saveGame(save);
        if (!r.finished) return { text: "Капітан задоволено киває. «Добре. Тепер — припаси.»", to: "progress" };
        const dot = t => (t.endsWith("!") ? t : t + ".");
        journalReward(save, "Завдання «Варта Центральної брами» виконано", dot(`Нагорода: досвід — ${r.expText}`));
        await RPG.saveGame(save);
        return { text: dot(`Капітан віддає наказ відчинити браму. «Ти з наших. Темний ліс чекає.» Досвід — ${r.expText}`) };
      },
      async gate_go() {
        if (!RPG.isGateOpen(save)) return { text: "«Брама зачинена.»", error: true };
        save.location.map = "dark_gate";               // крізь браму — одразу, без дороги
        await RPG.saveGame(save);
        location.href = "game.html";
        return { text: "Брама відчиняється…" };
      },
      async gate_back() {
        RPG.enterCity(save, "north");
        await RPG.saveGame(save);
        location.href = "game.html";
        return { text: "Варта відчиняє хвіртку в брамі…" };
      },
      // Квест «Долоні Велеса» (quests.js → VELES)
      async veles_ask(npcId) {
        if (!RPG.velesAdvance(save, 1)) return { text: "«Не розумію, про що ти.»", error: true };
        await RPG.saveGame(save);
        return { text: npcId === "steward"
          ? "Захар крутить сферу в пальцях, підносить до вікна й хитає головою. «У наших записах такого нема. Але знаєш що — " +
            "спитай Остапа в шинку біля млина. До нього хто тільки не заходить: путівники, путівниці, купці з усіх земель. " +
            "Хтось та й бачив подібне.»"
          : "Сестра Ївга обережно бере сферу, проводить пальцем по ромбовидному заглибленню й довго мовчить. «Щось знайоме… " +
            "та не пригадаю. Спитай Остапа в шинку біля млина — до нього заходять мандрівники й путівниці з далеких країв. " +
            "Може, хтось із них щось підкаже.»" };
      },
      async veles_ostap() {
        if (!RPG.velesAdvance(save, 2)) return { text: `«Щось я не второпаю, ${RPG.gw(save, "мандрівнику", "мандрівнице")}.»`, error: true };
        await RPG.saveGame(save);
        return { text: "Остап відставляє кухоль і стишує голос. «Ромб, кажеш? Була тут торік одна путівниця з півдня, сива вся, " +
          "хоч і молода на лице. Розповідала, що колись у Храмі Перуна під вівтарем било джерело, і стерегли його Велесові долоні. " +
          "А потім вода пішла, і про те забули. Сходи до сестри Ївги — вона в Храмі найдовше, мо' пригадає.»" };
      },
      async veles_nun() {
        if (!RPG.velesAdvance(save, 3)) return { text: "«Про що ти, дитино?»", error: true };
        await RPG.saveGame(save);
        return { text: "Ївга завмирає, і її очі ширшають. «Велесові долоні… Ну звісно! Як я могла забути. Ходімо.» " +
          "Вона веде вас за вівтар, у внутрішній двір Храму. Посеред двору — висохлий кам'яний фонтан, а над ним статуя Велеса, " +
          "що береже мудрість поколінь, з глечиком біля ніг. Ви придивляєтеся: на його розкритих долонях — невеликий виступ у формі ромба.",
          to: "veles_yard" };
      },
      // Квест «Збір вугілля» (quests.js → COAL)
      async coal_start() {
        const r = RPG.startCoal(save);
        if (!r.ok) return { text: `«${r.reason}»`, error: true };
        await RPG.saveGame(save);
        return { text: "Завдання «Збір вугілля» взято. Прогрес — у журналі квестів на сторінці «Персонаж»." };
      },
      async coal_turn() {
        const r = RPG.turnInCoal(save);
        if (!r.ok) return { text: `«${r.reason}»`, error: true };
        await RPG.saveGame(save);
        return { text: `Вози з вугіллям рушають до складів Мерії. Срібні злитки ×${RPG.COAL.reward.items[0].qty}. ` +
          `Спальний район відкрито. Досвід — ${r.expText}${r.expText.endsWith("!") ? "" : "."}` };
      },
      // Віддати Захару обірваний пергамент — книга відновлюється
      async parchment_give() {
        if (RPG.parchmentState(save) !== "have") return { text: "«У вас нічого такого немає.»", error: true };
        save.story.parchment = "given";
        await RPG.saveGame(save);
        showChronicle(save, "prologue", { restoring: true });
        return { text: "Захар прикладає обгорілий клапоть до місця, де бракує сторінок. Пергамент тепліє, краї зростаються, " +
          "і по них пробігає золоте сяйво. Коли світло згасає, сторінка вже вшита назад — ніби ніколи й не була вирвана. " +
          `«Велес бачить… — шепоче Захар. — Книга знову ціла. Дякую ${RPG.gw(save, "тобі, друже", "тобі, подруго")}».` };
      },
      async chronicle() {
        // герой побачив літопис — його список з'являється в бібліотеці власного дому
        if (RPG.addToLibrary?.(save, "chronicle")) await RPG.saveGame(save);
        showChronicle(save);
        return { text: "Захар обережно розгортає перед вами книгу. Від пергаменту пахне димом і старим дубом." };
      },
      async reset() {
        const ms = RPG.memberSave(save, npcCtx.member);
        const r = RPG.resetAttrs(ms);
        if (!r.ok) return { text: `«${r.reason}»`, error: true, to: "reset" };
        await RPG.saveGame(save);
        return { text: `Захар Вергун переписує записи. ${ms.character.name}: повернуто ${r.points} очок атрибутів, мито — ${fmtNum(r.cost)} золота. ` +
          "Розподілити очки знову можна на сторінці «Персонаж»." };
      }
    };

    function renderNpc(box, npcId) {
      const npc = RPG.NPCS[npcId];
      const node = npc.nodes[npcNode[npcId]] || npc.nodes.start;
      const wrap = el("div", "npc-dialog");
      const head = el("div", "npc-head");
      const img = new Image();
      img.className = "npc-portrait";
      img.alt = "";
      img.addEventListener("error", () => img.remove());
      img.src = RPG.asset(`assets/images/npc/${npc.portrait}.webp`);
      head.append(img, el("strong", "npc-name", npc.name));
      wrap.append(head);
      const res = npcResult[npcId];
      if (res) wrap.append(el("p", "npc-result" + (res.error ? " is-error" : ""), res.text));
      const text = typeof node.text === "function" ? node.text(save, npcCtx) : node.text;
      wrap.append(el("p", "npc-line", text));
      const replies = el("div", "npc-replies");
      for (const r of node.replies) {
        if (r.show && !r.show(save, npcCtx)) continue;
        const label = typeof r.text === "function" ? r.text(save, npcCtx) : r.text;
        replies.append(button("➤ " + label, "wf wf-link npc-reply", async () => {
          npcResult[npcId] = null;
          if (r.action) {
            const out = await NPC_ACTIONS[r.action](npcId);
            npcResult[npcId] = out;
            npcNode[npcId] = out.to || r.to || "start";
          } else {
            npcNode[npcId] = r.to || "start";
          }
          renderAll();
        }));
      }
      wrap.append(replies);
      box.append(wrap);
    }

    function renderTavern() {
      renderNpc(place, "ostap");
      place.append(el("p", "note",
        `${locData.merchant || "Торговець"} продає за ${Math.round(RPG.SHOP_SELL_RATE * 100)}% вартості, ` +
        `а купує за ${Math.round(RPG.SHOP_BUY_RATE * 100)}%. Великі та чарівні зілля тут не купиш — лише здобути в бою.`));
      renderShop(place, locData.shop || []);
      const row = el("div", "row");
      row.append(link("Мапа", "maps.html"));
      place.append(row);
    }

    // Купівля / продаж (Шинок, торговець Гільдії)
    // Після покупки кнопки «Купити» на пів секунди вимикаються — щоб не купити двічі випадково
    const BUY_PAUSE_MS = 500;
    let buyLockUntil = 0;
    function lockBuyButtons() {
      document.body.classList.add("buy-locked");
      setTimeout(() => document.body.classList.remove("buy-locked"), BUY_PAUSE_MS);
    }
    // opts: { priceOf(id), buy(save, id, qty), stock: true — продавати й речі з позначкою noShop }
    function renderShop(box, shopIds, opts = {}) {
      const priceOf = opts.priceOf || RPG.shopSellPrice;
      const buyFn = opts.buy || RPG.buyItem;
      box.append(el("p", "status shop-gold", `Ваше золото: ${fmtNum(save.character.gold)}`));

      const cols = el("div", "row shop");
      const buyBox = el("div", "stack shop-list");
      buyBox.append(el("h3", null, "Купити"));
      for (const id of shopIds) {
        const item = RPG.ITEMS[id];
        if (!item || (item.noShop && !opts.stock)) continue;
        const price = priceOf(id);
        const r = el("button", "shop-row shop-info");
        r.type = "button";
        r.append(smallIcon(id), el("span", "shop-name", item.name));
        if (item.levelReq > 1) r.append(el("small", "shop-lvl", `рів. ${item.levelReq}`));
        r.append(el("span", "shop-price" + (save.character.gold < price ? " is-short" : ""), `${fmtNum(price)} зол.`));
        const buy = async (qty = 1) => {
          if (Date.now() < buyLockUntil) return;          // пауза після покупки
          buyLockUntil = Date.now() + BUY_PAUSE_MS;
          lockBuyButtons();
          const res = buyFn(save, id, qty);
          if (!res.ok) { showMsg(msg, res.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `Куплено: ${item.name}${res.qty > 1 ? ` × ${res.qty}` : ""} за ${fmtNum(res.price)} золота.`);
          renderAll();
        };
        const stack = item.stackable ? (item.maxStack || 99) : 0;
        // Вікно покупки: опис + вибір кількості
        const build = () => {
          const box = itemInfo(id, 1, save);
          const most = Math.max(1, Math.min(RPG.BUY_MAX, Math.floor(save.character.gold / price)));
          const buyRow = el("div", "sell-qty");
          const minus = button("−", "wf wf-secondary qty-btn");
          const plus = button("+", "wf wf-secondary qty-btn");
          const qtyInput = el("input", "shop-qty");
          Object.assign(qtyInput, { type: "number", min: 1, max: RPG.BUY_MAX, step: 1, value: 1, inputMode: "numeric" });
          qtyInput.setAttribute("aria-label", `Кількість: ${item.name}`);
          const buySome = button("", "wf wf-button buy-btn", () => {
            const n = Math.floor(Number(qtyInput.value));
            if (!(n >= 1 && n <= RPG.BUY_MAX)) { showMsg(msg, `Вкажіть кількість від 1 до ${RPG.BUY_MAX}.`, true); return; }
            RPG.popover.hide();
            buy(n);
          });
          const upd = () => {
            const n = Math.min(RPG.BUY_MAX, Math.max(1, Math.floor(Number(qtyInput.value)) || 1));
            buySome.textContent = `Купити ${n} · ${fmtNum(price * n)} зол.`;
            buySome.disabled = save.character.gold < price * n;
          };
          const step = d => { qtyInput.value = Math.min(RPG.BUY_MAX, Math.max(1, (Number(qtyInput.value) || 1) + d)); upd(); };
          minus.addEventListener("click", () => step(-1));
          plus.addEventListener("click", () => step(1));
          qtyInput.addEventListener("input", upd);
          qtyInput.addEventListener("keydown", e => { if (e.key === "Enter") buySome.click(); });
          upd();
          buyRow.append(minus, qtyInput, plus);
          box.append(buyRow, buySome);
          if (most > 1) box.append(el("p", "note", `На ваше золото — до ${fmtNum(most)} шт.`));
          return box;
        };
        RPG.bindTip(r, build, () => [
          stack && { text: `Повна комірка (${stack} шт.) · ${fmtNum(price * stack)} зол.`, className: "wf-secondary buy-btn",
            onClick: () => buy(stack), disabled: save.character.gold < price * stack,
            title: save.character.gold < price * stack ? "Не вистачає золота" : "" }
        ].filter(Boolean));
        buyBox.append(r);
      }

      const sellBox = el("div", "stack shop-list");
      sellBox.append(el("h3", null, "Продати (з інвентаря)"));
      if (!save.inventory.length) sellBox.append(el("p", "status", "Інвентар порожній. Вдягнені речі спершу зніміть."));
      save.inventory.forEach((entry, index) => {
        const item = RPG.ITEMS[entry.id];
        const unit = RPG.refSellPrice(entry);
        const r = el("button", "shop-row shop-info");
        r.type = "button";
        const label = el("span", "shop-name", itemLabel(entry));
        if (RPG.hasRarity(entry.id)) label.classList.add("rt-" + RPG.rarityOf(entry));
        r.append(smallIcon(entry), label, el("span", "shop-price is-sell", `+${fmtNum(unit)} зол.`));

        async function sell(qty) {
          RPG.popover.hide();
          const res = RPG.sellItem(save, index, qty);
          if (!res.ok) { showMsg(msg, res.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `Продано: ${RPG.itemFullName(entry)}${res.qty > 1 ? ` × ${res.qty}` : ""} за ${fmtNum(res.price)} золота.`);
          renderAll();
        }

        // Вікно продажу: опис + (для стопки) вибір кількості
        const build = () => {
          const box = itemInfo(entry, entry.qty, save);
          if (entry.qty > 1) {
            const sellRow = el("div", "sell-qty");
            const minus = button("−", "wf wf-secondary qty-btn");
            const plus = button("+", "wf wf-secondary qty-btn");
            const qtyInput = el("input", "shop-qty");
            Object.assign(qtyInput, { type: "number", min: 1, max: entry.qty, step: 1, value: 1, inputMode: "numeric" });
            qtyInput.setAttribute("aria-label", `Кількість: ${item.name}`);
            const sellSome = button("", "wf wf-button", () => {
              const n = Math.floor(Number(qtyInput.value));
              if (!(n >= 1 && n <= entry.qty)) { showMsg(msg, `Вкажіть кількість від 1 до ${entry.qty}.`, true); return; }
              sell(n);
            });
            const upd = () => {
              const n = Math.min(entry.qty, Math.max(1, Math.floor(Number(qtyInput.value)) || 1));
              sellSome.textContent = `Продати ${n} · +${fmtNum(unit * n)} зол.`;
            };
            const step = d => { qtyInput.value = Math.min(entry.qty, Math.max(1, (Number(qtyInput.value) || 1) + d)); upd(); };
            minus.addEventListener("click", () => step(-1));
            plus.addEventListener("click", () => step(1));
            qtyInput.addEventListener("input", upd);
            qtyInput.addEventListener("keydown", e => { if (e.key === "Enter") sellSome.click(); });
            upd();
            sellRow.append(minus, qtyInput, plus);
            box.append(sellRow, sellSome);
          }
          return box;
        };
        RPG.bindTip(r, build, () => entry.qty > 1
          ? [{ text: `Продати все (${entry.qty}) · +${fmtNum(unit * entry.qty)} зол.`, className: "wf-secondary", onClick: () => sell(entry.qty) }]
          : [{ text: `Продати · +${fmtNum(unit)} зол.`, className: "wf-button", onClick: () => sell(1) }]);
        sellBox.append(r);
      });

      cols.append(buyBox, sellBox);
      box.append(cols);
    }

    // ---------- Дубова Застава: райони та Гільдія авантюристів ----------
    // Центральний район — з 6 рівня; Дошка оголошень біля Мерії — після особливого завдання «Час дослідити»
    const districtLocked = d => !RPG.isDistrictOpen(save, d);
    // Район, де зараз герой (переходи між районами — дорогою по мапі Дубової Застави)
    const cityDistrict = save.location.district || "south";
    let guildNpc = "admin";         // admin | trader | trainer
    let trainMember = 0;            // кого навчає Тренер (герой групи)

    function renderCity() {
      place.append(el("p", "note", locData.description));
      const grid = el("div", "district-grid");
      for (const d of locData.districts || []) {
        const locked = districtLocked(d);
        const card = button("", "wf loc-card " + (locked ? "wf-locked" : "wf-link"));
        card.append(el("strong", null, d.name), el("span", "loc-desc", locked ? "Закрито" : d.building));
        if (cityDistrict === d.id) { card.classList.add("is-selected"); card.append(el("span", "loc-desc", "Ви тут")); }
        card.addEventListener("click", async () => {
          if (cityDistrict === d.id) return;
          if (locked) { showMsg(msg, RPG.districtLockText(d), true); return; }
          const r = RPG.startTravel(save, d.id);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          location.href = "maps.html";
        });
        grid.append(card);
      }
      place.append(grid);

      const d = (locData.districts || []).find(x => x.id === cityDistrict);
      if (d) {
        const box = el("div", "stack district");
        box.append(el("h3", null, `${d.name} — ${d.building}`), el("p", "note", d.description));
        if (districtLocked(d)) box.append(el("p", "status", RPG.districtLockText(d)));
        else if (d.id === "south") {
          renderGuild(box);
          box.append(button("Вийти з Дубової Застави", "wf wf-secondary", async () => {
            RPG.leaveCityToStart(save);
            await RPG.saveGame(save);
            location.reload();
          }));
        }
        else if (d.id === "trade") renderTradeDistrict(box);
        else if (d.id === "north") renderNpc(box, "captain");
        else if (d.id === "center") renderTownHall(box);
        else if (d.id === "rest") renderRestDistrict(box);
        place.append(box);
      }
      const row = el("div", "row");
      row.append(link("Мапа", "maps.html"));
      place.append(row);
    }

    // --- Торговий район: Торгова гільдія, управляючий Скрудж ---
    // Торговий район: Гільдія ремісників (Кузьма — з професією) і Торгова гільдія (Скрудж — з 20 рівня)
    let tradeNpc = "kuzma";
    function renderTradeDistrict(box) {
      const tabs = el("div", "row npc-tabs");
      for (const [id, name] of [["kuzma", "Гільдія ремісників"], ["scrooge", "Торгова гільдія"]]) {
        tabs.append(button(name, "wf " + (tradeNpc === id ? "wf-button" : "wf-link"), () => { tradeNpc = id; renderPlace(); }));
      }
      box.append(tabs);
      if (tradeNpc === "scrooge") {
        if (save.character.level < RPG.TRADE_MIN_LEVEL) {
          box.append(el("p", "status", `Торгова гільдія Скруджа приймає лише поважних гостей — з ${RPG.TRADE_MIN_LEVEL} рівня.`));
          return;
        }
        renderTradeGuild(box);
        return;
      }
      renderNpc(box, "kuzma");
      if (!RPG.hasCraftAccess(save)) return;
      renderToolShop(box);
    }

    // Знаряддя від Кузьми — одразу стають у кузню вашого дому
    function renderToolShop(box) {
      const h = RPG.forgeHouse(save);
      const wrap = el("div", "stack tool-shop");
      wrap.append(el("p", "status shop-gold", `Ваше золото: ${fmtNum(save.character.gold)}`));
      // Книга «Небесна кузня. Настанова» — перша наука коваля (data/books.js)
      if (RPG.FORGE_BOOK) {
        const B = RPG.FORGE_BOOK, has = RPG.hasForgeBook(save);
        const r = el("div", "shop-row tool-row fbook-row");
        const info = el("div", "tool-info");
        info.append(el("strong", null, `Книга «${B.title}»`),
          el("small", null, has ? "Перша наука коваля вже ваша. Перечитувати можна тут і в бібліотеці свого дому."
            : "Перша наука коваля від Сварога, Брокка й Ейтрі. Без неї не викувати й не розібрати жодної речі."));
        r.append(info);
        const btns = el("div", "row fbook-btns");
        if (has) btns.append(el("span", "shop-price tool-have", "✓ ваша"));
        else {
          const b = button(`Купити · ${fmtNum(B.price)} зол.`, "wf wf-button", async () => {
            const res = RPG.buyForgeBook(save);
            if (!res.ok) { showMsg(msg, res.reason, true); return; }
            await RPG.saveGame(save);
            showMsg(msg, `Куплено книгу «${res.name}». −${fmtNum(res.price)} золота. Кузьма радить почати з Прологу.`);
            renderAll();
            showForgeBook(save);
          });
          b.disabled = !RPG.hasCraftAccess(save) || save.character.gold < B.price;
          btns.append(b);
        }
        btns.append(button(has ? "Читати" : "Погортати", "wf wf-secondary", () => showForgeBook(save, has ? "prologue" : "toc")));
        r.append(btns);
        wrap.append(r);
      }
      wrap.append(el("h3", null, "Знаряддя для кузні"));
      const toolsLeft = Object.entries(RPG.FORGE_TOOLS).filter(([id]) => !h?.forge?.tools?.[id]);
      if (!h) wrap.append(el("p", "tool-hint", "Спершу збудуйте кузню при своєму домі в Спальному районі — Кузьма поставить знаряддя туди."));
      else if (!toolsLeft.length) wrap.append(el("p", "tool-hint", `Усі знаряддя вже стоять у кузні «${h.name}».`));
      else wrap.append(el("p", "tool-hint", `Куплене Кузьма поставить у кузню дому «${h.name}».`));
      // уже куплені знаряддя з переліку зникають
      for (const [id, t] of toolsLeft) {
        const r = el("div", "shop-row tool-row");
        const info = el("div", "tool-info");
        info.append(el("strong", null, t.name + (t.need ? " · обов'язкове" : "")),
          el("small", null, t.text + (t.for ? ` Потрібне для: ${t.for}.` : "")));
        r.append(info);
        const b = button(`Купити · ${fmtNum(t.price)} зол.`, "wf wf-button", async () => {
          const res = RPG.buyForgeTool(save, id);
          if (!res.ok) { showMsg(msg, res.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `Куплено: ${res.name}. Кузьма поставив у кузню «${res.house}». −${fmtNum(res.price)} золота.`);
          renderAll();
        });
        b.disabled = !h || save.character.gold < t.price;
        r.append(b);
        wrap.append(r);
      }
      box.append(wrap);
    }

    function renderTradeGuild(box) {
      renderNpc(box, "scrooge");
      box.append(el("p", "note", `Скрудж продає речі 3 виду (з ${RPG.TRADE_MIN_LEVEL} рівня, для зброї — володіння 20) ` +
        `за ${RPG.TRADE_PRICE_MULT}× від їхньої вартості, а купує будь-що за ${Math.round(RPG.SHOP_BUY_RATE * 100)}%.`));
      renderShop(box, RPG.tradeStock(), { priceOf: RPG.tradePrice, buy: RPG.buyFromTrade, stock: true });
    }

    // --- Мерія: Дошка оголошень (найм у групу) ---
    let hallNpc = RPG.isHiringOpen(save) ? "board" : "steward";     // board | steward
    function renderTownHall(box) {
      // Захар доступний завжди (книга «Предки…»); перерозподіл атрибутів — з RPG.STEWARD_MIN_LEVEL рівня
      {
        const tabs = el("div", "row npc-tabs");
        for (const [id, name] of [["board", "Дошка оголошень"], ["steward", "Розпорядник Захар"]]) {
          tabs.append(button(name, "wf " + (hallNpc === id ? "wf-button" : "wf-link"), () => { hallNpc = id; renderPlace(); }));
        }
        box.append(tabs);
      }
      if (hallNpc === "steward") {
        if (npcCtx.member >= RPG.partySize(save)) npcCtx.member = 0;
        if (RPG.partySize(save) > 1) {
          const mt = el("div", "row member-tabs");
          memberTabs(mt, save, npcCtx.member, i => { npcCtx.member = i; npcResult.steward = null; renderPlace(); });
          box.append(mt);
        }
        renderNpc(box, "steward");
        // Книга «Кров Іггдрасиля — Боги пантеонів» — продається власникам дому (data/books.js → GODS_BOOK)
        if (RPG.GODS_BOOK) {
          const B = RPG.GODS_BOOK, has = RPG.hasGodsBook(save), owner = (save.houses || []).length > 0;
          const r = el("div", "shop-row tool-row fbook-row");
          const info = el("div", "tool-info");
          info.append(el("strong", null, `Книга «${B.title}»`), el("small", null, has
            ? "Книга ваша — читати її можна в бібліотеці свого дому."
            : owner ? "Довідник Мерії про богів Ірію, Асгарду й сили темряви. Ляже на полицю бібліотеки у вашому домі."
            : "Мерія продає цей довідник лише власникам дому в Заставі (Спальний район)."));
          r.append(info);
          if (has) r.append(el("span", "shop-price tool-have", "✓ ваша"));
          else {
            const b = button(`Купити · ${fmtNum(B.price)} зол.`, "wf wf-button", async () => {
              const res = RPG.buyGodsBook(save);
              if (!res.ok) { showMsg(msg, res.reason, true); return; }
              await RPG.saveGame(save);
              showMsg(msg, `Куплено книгу «${res.name}». −${fmtNum(res.price)} золота. Вона вже на полиці бібліотеки вашого дому.`);
              renderAll();
            });
            b.disabled = !owner || save.character.gold < B.price;
            r.append(b);
          }
          box.append(r);
        }
        return;
      }
      if (!RPG.isHiringOpen(save)) {
        box.append(el("p", "board-closed", "Біля Мерії стоїть Дошка оголошень: авантюристи шукають собі напарників. Та чужинцеві тут ніхто не довіряє — " +
          `спершу доведіть, що на вас можна покластися: особливе завдання «${RPG.EXPLORE.name}» в Артеміди, адміністратора Гільдії авантюристів ` +
          `(з ${RPG.EXPLORE.minLevel} рівня). А поки зазирніть до Розпорядника Захара.`));
        return;
      }
      const size = RPG.partySize(save);
      box.append(el("p", "note", "Біля Мерії стоїть Дошка оголошень: авантюристи шукають собі напарників, щоб об'єднатися в групу. " +
        `За кожного нового члена групи Мерія бере внесок. У групі може бути до ${RPG.MAX_PARTY} героїв.`));

      box.append(el("h3", null, `Ваша група: ${size} / ${RPG.MAX_PARTY}`));
      RPG.partyMembers(save).forEach((ms, i) => {
        const r = el("div", "shop-row");
        const dead = RPG.isMemberDead(ms);
        r.append(el("span", "shop-name", `${ms.character.name} — ${RPG.getClass(ms.character.classId).name}, рівень ${ms.character.level}` +
          (i === 0 ? (RPG.heroGender(ms) === "f" ? " · головна героїня" : " · головний герой") : "") +
          (dead ? (RPG.heroGender(ms) === "f" ? " · полегла" : " · полеглий") : "")));
        if (i > 0) {
          r.append(button("Відпустити", "wf wf-secondary", async () => {
            if (!confirm(`Відпустити ${ms.character.name}? ${RPG.gw(ms, "Його", "Її")} речі перейдуть у спільний інвентар, внесок не повертається.`)) return;
            const res = RPG.dismissMember(save, i);
            await RPG.saveGame(save);
            showMsg(msg, res.ok ? `${res.name} покидає групу. ${RPG.gw(ms, "Його", "Її")} речі — в інвентарі.` : res.reason, !res.ok);
            renderAll();
          }));
        }
        box.append(r);
      });

      box.append(el("h3", null, "Дошка оголошень"));
      const cost = RPG.nextHireCost(save);
      if (cost == null) { box.append(el("p", "status", "Група вже повна.")); return; }
      box.append(el("p", "status", `Внесок у Мерію за наступного (${size + 1}-го) героя групи: ${fmtNum(cost)} золота. ` +
        `Далі — ${RPG.HIRE_COSTS.slice(size).map(fmtNum).join(" → ")} золота. Новачки починають з 1 рівня.`));
      const can = RPG.canHire(save);
      if (!can.ok) box.append(el("p", "status", can.reason));
      for (const name of RPG.boardState(save)) {
        const r = el("div", "shop-row");
        r.append(el("span", "shop-name", `«Шукаю групу. ${name}, ${RPG.getClass(RPG.DEFAULT_CLASS).name}, 1 рівень.»`));
        const b = button(`Найняти (${fmtNum(cost)} зол.)`, "wf wf-button", async () => {
          const res = RPG.hireMember(save, name);
          if (!res.ok) { showMsg(msg, res.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `${name} приєднується до групи! Внесок у Мерію: ${fmtNum(res.cost)} золота. ` +
            "Налаштувати спорядження — в Інвентарі, атрибути — на сторінці «Персонаж».");
          renderAll();
        });
        b.disabled = !can.ok;
        r.append(b);
        box.append(r);
      }
      box.append(button("Оновити оголошення", "wf wf-link", async () => {
        RPG.refreshBoard(save);
        await RPG.saveGame(save);
        renderAll();
      }));
    }

    function renderGuild(box) {
      const tabs = el("div", "row npc-tabs");
      const guildTabs = [["admin", "Адміністратор Артеміда"], ["trader", "Торговець Тадеуш"], ["trainer", "Тренер Брут"]];
      if (RPG.IFRIT) guildTabs.push(["ifrit", "Іфрит (тест)"]);      // ТЕСТ: прибрати разом з блоком IFRIT у character.js
      for (const [id, name] of guildTabs) {
        tabs.append(button(name, "wf " + (guildNpc === id ? "wf-button" : "wf-link"), () => { guildNpc = id; renderPlace(); }));
      }
      box.append(tabs);
      const npc = el("div", "stack npc-panel");
      // Шапка з портретом (assets/images/npc/<файл>.webp; поки картинки немає — лише ім'я)
      const GUILD_NPC = { admin: ["npc_guild_admin", "Артеміда, адміністратор гільдії"],
                          trader: ["npc_guild_trader", "Тадеуш, торговець гільдії"],
                          trainer: ["npc_trainer", "Брут, тренер гільдії"],
                          ifrit: ["npc_ifrit", "Іфрит — тестовий торговець ресурсами"] };
      if (!GUILD_NPC[guildNpc] || (guildNpc === "ifrit" && !RPG.IFRIT)) guildNpc = "admin";
      const [pic, who] = GUILD_NPC[guildNpc];
      const head = el("div", "npc-head");
      const img = new Image();
      img.className = "npc-portrait"; img.alt = "";
      img.addEventListener("error", () => img.remove());
      img.src = RPG.asset(`assets/images/npc/${pic}.webp`);
      head.append(img, el("strong", "npc-name", who));
      npc.append(head);
      if (guildNpc === "admin") renderQuestBoard(npc);
      else if (guildNpc === "trader") {
        npc.append(el("p", "note",
          `Тадеуш, торговець гільдії, продає зброю 1–2 виду, шкіряну броню (2 вид), малі й середні зілля (за ${Math.round(RPG.SHOP_SELL_RATE * 100)}% вартості), ` +
          `а купує будь-що за ${Math.round(RPG.SHOP_BUY_RATE * 100)}%.`));
        renderShop(npc, RPG.GUILD_SHOP || []);
      } else if (guildNpc === "ifrit") {
        // ТЕСТ: Іфрит не належить до лору — продає ресурси, які ще не падають і не добуваються
        npc.append(el("p", "ifrit-note", "Тестовий персонаж (не з лору гри). Продає ресурси ремесла, які поки ніде не падають і не добуваються. " +
          `За одну покупку — до ${fmtNum(RPG.BUY_MAX)} шт.`));
        renderShop(npc, RPG.IFRIT.stock, { priceOf: RPG.ifritPrice, buy: RPG.buyFromIfrit, stock: true });
      } else renderTrainer(npc);
      box.append(npc);
    }

    // --- Адміністратор гільдії: завдання ---
    function renderQuestBoard(box) {
      const before = RPG.questState(save).offers.length;
      RPG.fillOffers(save);
      if (RPG.questState(save).offers.length !== before) RPG.saveGame(save).catch(e => console.error(e));
      const qs = RPG.questState(save);
      renderExplore(box);
      renderProfession(box);
      box.append(el("p", "note",
        `«Роботи вистачає — беріть до ${RPG.questMaxActive(save)} завдань одночасно.» Виконано завдань: ${qs.done}.` +
        (RPG.partySize(save) > 1 ? " Досвід за завдання отримує кожен герой групи — повністю, ще й з бонусами (група, тимчасові ефекти, руни й речі)." : "")));

      // «Здати все»: разом усі виконані завдання гільдії та нагороди за чемпіонів
      if (qs.active.length || qs.bounties.length) {
        const readyCount = qs.active.filter(q => RPG.isQuestComplete(save, q)).length + qs.bounties.length;
        const all = button(readyCount ? `Здати все (${readyCount})` : "Здати все", "wf wf-button turn-in-all", async () => {
          let exp = 0, gold = 0, quests = 0, bounties = 0, lastLevel = null;
          const items = {};
          const bountyExp = {};   // досвід (чемпіони й завдання) — кожному герою окремо, з бонусами
          const noteLevel = lv => { if (lv.length) lastLevel = lv[lv.length - 1]; };
          for (const bounty of [...qs.bounties]) {
            const res = RPG.claimBounty(save, bounty.id);
            if (!res.ok) continue;
            bounties++;
            gold += bounty.gold;
            for (const h of res.heroes) bountyExp[h.name] = (bountyExp[h.name] || 0) + h.exp;
            noteLevel(res.levelUps);
            journalReward(save, `Гільдія: переможено чемпіона «${bounty.name}»`, RPG.bountyRewardText(res));
          }
          for (const quest of qs.active.filter(q => RPG.isQuestComplete(save, q))) {
            const res = RPG.turnInQuest(save, quest.id);
            if (!res.ok) continue;
            quests++;
            gold += quest.reward.gold;
            for (const it of quest.reward.items) items[it.id] = (items[it.id] || 0) + it.qty;
            for (const h of res.heroes) bountyExp[h.name] = (bountyExp[h.name] || 0) + h.exp;
            noteLevel(res.levelUps);
            const t = `Нагорода: ${RPG.describeReward({ ...quest.reward, exp: null })}; досвід — ${res.expText}`;
            journalReward(save, `Завдання «${RPG.questTitle(quest)}» здано`, t.endsWith("!") ? t : t + ".");
          }
          if (!quests && !bounties) { showMsg(msg, "Немає виконаних завдань.", true); return; }
          const reward = RPG.describeReward({ exp: null, gold, items: Object.entries(items).map(([id, qty]) => ({ id, qty })) });
          const what = [quests ? `завдань: ${quests}` : "", bounties ? `нагород за чемпіонів: ${bounties}` : ""].filter(Boolean).join(", ");
          const names = Object.keys(bountyExp);
          const bTxt = names.length ? ` Досвід${names.length > 1 ? " кожному" : ""}: ` +
            names.map(n => names.length > 1 ? `${n} +${fmtNum(bountyExp[n])}` : `+${fmtNum(bountyExp[n])}`).join(", ") + " EXP (з бонусами)." : "";
          const txt = `Здано ${what}. Нагорода: ${reward}.${bTxt}` + (lastLevel ? ` Новий рівень: ${lastLevel}!` : "");
          await RPG.saveGame(save);
          showMsg(msg, txt);
          renderAll();
        });
        all.disabled = !readyCount;
        const allRow = el("div", "row");
        allRow.append(all);
        box.append(allRow);
      }

      if (qs.bounties.length) {
        box.append(el("h3", null, "Нагороди за чемпіонів"));
        for (const bounty of qs.bounties) {
          const r = el("div", "shop-row quest-row quest-done champion-row");
          const info = el("span", "shop-name", `Переможено чемпіона: ${bounty.name}`);
          const many = RPG.partySize(save) > 1;
          info.append(el("small", null, ` · ${bounty.exp} EXP${many ? " кожному герою" : ""} + бонуси, ${bounty.gold} золота (×${RPG.CHAMPION.bountyMult})`));
          r.append(info, button("Отримати", "wf wf-button", async () => {
            const res = RPG.claimBounty(save, bounty.id);
            if (!res.ok) { showMsg(msg, res.reason, true); return; }
            const txt = RPG.bountyRewardText(res);
            journalReward(save, `Гільдія: переможено чемпіона «${bounty.name}»`, txt);
            await RPG.saveGame(save);
            showMsg(msg, txt);
            renderAll();
          }));
          box.append(r);
        }
      }

      box.append(el("h3", null, "Ваші завдання"));
      if (!qs.active.length) box.append(el("p", "status", "Немає взятих завдань."));
      for (const quest of qs.active) {
        const done = RPG.isQuestComplete(save, quest);
        const r = el("div", "shop-row quest-row" + (done ? " quest-done" : ""));
        const info = el("span", "shop-name", `${RPG.questTitle(quest)} — ${RPG.questProgress(save, quest)}/${quest.need}`);
        info.append(el("small", null, ` · нагорода: ${RPG.describeReward(quest.reward)}`));
        const turnIn = button("Здати", "wf wf-button", async () => {
          const res = RPG.turnInQuest(save, quest.id);
          if (!res.ok) { showMsg(msg, res.reason, true); return; }
          const t = `Завдання виконано! Нагорода: ${RPG.describeReward({ ...quest.reward, exp: null })}; досвід — ${res.expText}`;
          const txt = t.endsWith("!") ? t : t + ".";
          journalReward(save, `Завдання «${RPG.questTitle(quest)}» здано`, txt);
          await RPG.saveGame(save);
          showMsg(msg, txt);
          renderAll();
        });
        turnIn.disabled = !done;
        const drop = button("Відмовитись", "wf wf-secondary", async () => {
          if (!confirm(`Відмовитися від завдання «${RPG.questTitle(quest)}»?`)) return;
          RPG.abandonQuest(save, quest.id);
          await RPG.saveGame(save);
          renderAll();
        });
        r.append(info, turnIn, drop);
        box.append(r);
      }

      box.append(el("h3", null, "Нові завдання"));
      for (const quest of qs.offers) {
        const r = el("div", "shop-row quest-row");
        const info = el("span", "shop-name", RPG.questTitle(quest));
        info.append(el("small", null, ` · нагорода: ${RPG.describeReward(quest.reward)}`));
        const take = button("Взяти", "wf wf-button", async () => {
          const res = RPG.acceptQuest(save, quest.id);
          if (!res.ok) { showMsg(msg, res.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `Взято завдання: ${RPG.questTitle(quest)}.`);
          renderAll();
        });
        take.disabled = qs.active.length >= RPG.questMaxActive(save);
        r.append(info, take);
        box.append(r);
      }
    }

    // --- Особливе завдання «Час дослідити» (у Адміністратора) ---
    function renderExplore(box) {
      const info = RPG.exploreInfo(save);
      const E = RPG.EXPLORE;
      if (!info) {
        box.append(el("p", "note", `Особливе завдання «${E.name}» Артеміда доручає героям від ${E.minLevel} рівня.`));
        return;
      }
      // Виконано: один раз показуємо повідомлення про відкриття Дошки оголошень, далі поле приховане
      if (info.done) {
        if (!info.st.announced) {
          info.st.announced = true;
          RPG.saveGame(save).catch(e => console.error(e));
          showExploreUnlocked();
        }
        return;
      }
      const card = el("div", "stack explore-card");
      card.append(el("h3", null, `Особливе завдання: «${E.name}»`));
      if (info.canStart) {
        card.append(el("p", "note", `«Ви вже ${RPG.gw(save, "досвідчений авантюрист", "досвідчена авантюристка")}. Час дослідити світ далі — але спершу допоможіть нам. ` +
          `Завдання з ${info.total} частин, кожна відкривається після попередньої.»`));
        card.append(button("Взяти завдання", "wf wf-button", async () => {
          const r = RPG.startExplore(save);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `Взято особливе завдання «${E.name}». Частина 1: ${E.parts[0].title}.`);
          renderAll();
        }));
      } else {
        card.append(el("p", null, `Частина ${info.index} з ${info.total}: ${info.part.title}`));
        card.append(el("p", "note", info.part.text));
        for (const pr of info.progress) {
          card.append(el("div", pr.have >= pr.need ? "rt-magic" : null, `${pr.label}: ${pr.have} / ${pr.need}`));
        }
        card.append(el("p", "status", "Нагорода: " + RPG.describeExploreReward(info.part)));
        const b = button(info.index < info.total ? "Здати частину" : "Завершити завдання", "wf wf-button", async () => {
          const r = RPG.turnInExplore(save);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          const rest = RPG.describeExploreReward(r.part || info.part, true);
          const up = [rest, r.expText ? `досвід — ${r.expText}` : ""].filter(Boolean).join("; ");
          const upTxt = up ? ` Нагорода: ${up}${up.endsWith("!") ? "" : "."}` : "";
          journalReward(save, r.finished ? `Завдання «${E.name}» виконано` : `«${E.name}»: частину ${info.index} з ${info.total} здано`,
            upTxt.trim() || "Нагороди немає.");
          if (r.finished) RPG.storyState(save).announced = true;
          await RPG.saveGame(save);
          if (r.finished) showExploreUnlocked(upTxt);
          else showMsg(msg, `Частину виконано!${upTxt} Далі: ${E.parts[RPG.storyState(save).part - 1].title}.`);
          renderAll();
        });
        b.disabled = !info.complete;
        card.append(b);
      }
      box.append(card);
    }

    // Повідомлення: «Час дослідити» виконано — відкрито Дошку оголошень біля Мерії
    function showExploreUnlocked(up = "") {
      const E = RPG.EXPLORE;
      const go = link("До Центрального району (Мерія)", "game.html?district=center", "wf wf-button");
      showNotice("Відкрито доступ: Дошка оголошень", [
        `Особливе завдання «${E.name}» виконано!${up}`,
        E.finale,
        "Дошка оголошень біля Мерії (Центральний район) тепер відкрита — можна наймати героїв у групу.",
        go
      ]);
    }

    // --- Квест «Шлях професії» (з 12 рівня Селянина; 3 гілки по 10 завдань; професія — на 15 рівні) ---
    // Кожен герой групи проходить шлях сам (quests.js → professionState): картка на кожного,
    // умови й професія — за його власними атрибутами. ms — «вигляд» героя (party.js → memberSave).
    function renderProfession(box) {
      const members = RPG.partyMembers(save);
      const group = members.length > 1;
      const waiting = [];
      for (const ms of members) {
        if (!renderProfessionFor(box, ms, group) && ms.character.classId === RPG.DEFAULT_CLASS) waiting.push(ms);
      }
      if (waiting.length) {
        const who = group ? waiting.map(ms => `${ms.character.name} (${ms.character.level} рів.)`).join(", ") + " — " : "";
        box.append(el("p", "note", `${who}квест «${RPG.PROFESSION.name}» — зміна професії — Артеміда дає Селянину з ${RPG.PROFESSION_QUEST_LEVEL} рівня.`));
      }
    }
    // Картка квесту одного героя. Повертає false, якщо квест йому ще не доступний
    function renderProfessionFor(box, ms, group) {
      const info = RPG.professionInfo(ms);
      const name = RPG.professionName(ms);
      const who = group ? `${ms.character.name}: ` : "";
      if (!info) return false;
      const card = el("div", "stack explore-card");
      card.append(el("h3", null, `${group ? ms.character.name + " — к" : "К"}вест: «${name}»`));
      const levelTxt = lv => lv.length ? ` Новий рівень: ${lv[lv.length - 1]}!` : "";
      if (info.done) {
        card.append(el("p", null, `${group ? ms.character.name + " — професія" : "Ваша професія"}: ${RPG.getClass(ms.character.classId).name}.`));
      } else if (info.canStart) {
        card.append(el("p", "note", "«Ти переріс селянське життя. Пройди десять випробувань — і на 15 рівні я скажу, ким тобі судилося стати. " +
          "Яким шляхом ти підеш, залежить від того, що ти в собі розвивав.»"));
        if (!info.branches.length) card.append(el("p", "rt-magic", RPG.PROFESSION_REFUSE));
        const take = async branch => {
          const r = RPG.startProfession(ms, branch);
          if (r.choose) {
            const pick = el("div", "stack");
            pick.append(el("p", null, "«Перед тобою кілька шляхів. Обери, яким підеш, — назад дороги не буде.»"));
            for (const id of r.choose) {
              const B = RPG.PROFESSION_BRANCHES[id];
              pick.append(button(B.name, "wf wf-button", () => take(id)));
              pick.append(el("p", null, "Професії: " + B.classes.map(c => RPG.getClass(c).name).join(", ") + "."));
            }
            takeBtn.replaceWith(pick);
            return;
          }
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          const B = RPG.PROFESSION_BRANCHES[r.branch];
          showMsg(msg, `${who ? who + "в" : "В"}зято квест «${B.name}». ${B.intro} Завдання 1: ${B.parts[0].title}.`);
          renderAll();
        };
        const takeBtn = button("Взяти квест", "wf wf-button", () => take(null));
        card.append(takeBtn);
      } else if (info.final) {
        card.append(el("p", null, "Усі десять випробувань пройдено. «Ти довів, на що здатен. Час дізнатися, ким ти станеш.»"));
        card.append(el("p", null, "Нагорода за шлях: ???"));
        const finish = async classId => {
          const r = RPG.turnInProfession(ms, classId);
          if (r.choose) {
            if (r.choose.length === 1) return finish(r.choose[0]);
            const pick = el("div", "stack");
            pick.append(el("p", null, "«Перед тобою кілька шляхів — обери свій. Маг сам вирішує, якій стихії служити.» " +
              "Вибір не можна буде змінити."));
            for (const id of r.choose) {
              const c = RPG.getClass(id);
              const w = (c.weapons || []).map(t => RPG.WEAPON_TYPES[t]?.name || t).join(" / ");
              pick.append(button(`${c.name} — ${w}`, "wf wf-button", () => finish(id)));
              pick.append(el("p", null, c.description));
            }
            b.replaceWith(pick);
            return;
          }
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          const c = RPG.getClass(r.classId);
          journalReward(save, `${who}Шлях професії пройдено`, `Нагорода за шлях: ${r.exp ? fmtNum(r.exp) + " EXP (15 рівень) і " : ""}нова професія — ${c.name}.`);
          await RPG.saveGame(save);
          showMsg(msg, `${who ? who + "н" : "Н"}агорода за шлях: ${r.exp ? fmtNum(r.exp) + " EXP (15 рівень) і " : ""}нова професія — ${c.name}! ${c.description} ` +
            `Рівень професії почався з 1, а бонуси Селянина лишилися. Тренер Брут навчить новим навичкам.` +
            (r.change?.removed?.length ? " Зброю, якою ця професія не користується, знято в інвентар." : ""));
          renderAll();
        };
        const b = button("Завершити шлях і отримати професію", "wf wf-button", () => finish(null));
        card.append(b);
      } else {
        card.append(el("p", null, `Завдання ${info.index} з ${info.total}: ${info.part.title}`));
        card.append(el("p", "note", info.part.text));
        for (const pr of info.progress) {
          card.append(el("div", pr.have >= pr.need ? "rt-magic" : null, `${pr.label}: ${pr.have} / ${pr.need}`));
        }
        card.append(el("div", null, "Нагорода: досвід — скільки, дізнаєтесь при здачі."));
        const b = button("Здати завдання", "wf wf-button", async () => {
          const r = RPG.turnInProfession(ms);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          journalReward(save, `${who}Шлях професії: завдання ${info.index} з ${info.total} здано`,
            `Нагорода: ${fmtNum(r.exp)} EXP.${levelTxt(r.levelUps)}`);
          await RPG.saveGame(save);
          const next = RPG.professionInfo(ms);
          showMsg(msg, `${who ? who + "з" : "З"}авдання виконано! Нагорода: ${fmtNum(r.exp)} EXP.${levelTxt(r.levelUps)} ` +
            (r.allDone ? "Усі десять випробувань пройдено — поверніться до Артеміди по нагороду за шлях."
                       : `Далі: ${next.part.title}.`));
          renderAll();
        });
        b.disabled = !info.complete;
        card.append(b);
      }
      box.append(card);
      return true;
    }

    // --- Тренер: володіння зброєю та навички ---
    function masteryBonusText(type, lvl) {
      const parts = [];
      for (const [k, max] of Object.entries(RPG.MASTERY_BONUS[type] || {})) {
        const v = Math.round(max * lvl / RPG.MASTERY_MAX * 10) / 10;
        parts.push(`${RPG.STAT_NAMES[k] || k} +${v}`);
      }
      return parts.join(", ");
    }

    function renderTrainer(box) {
      if (trainMember >= RPG.partySize(save)) trainMember = 0;
      const tabs = el("div", "row member-tabs");
      memberTabs(tabs, save, trainMember, i => { trainMember = i; renderPlace(); });
      box.append(tabs);
      const tms = RPG.memberSave(save, trainMember);
      const type = RPG.weaponTypeOf(tms);
      const cap = RPG.masteryCap(tms);
      box.append(el("p", "note", "«Володіння приходить у бою, а не за золото. За кожен виграний бій росте вміння тією зброєю, " +
        "що в правій руці. Хочеш швидше — потренуйся зі мною.»"));
      box.append(el("p", "note",
        `Межа володіння зараз: ${cap}` + (cap < RPG.MASTERY_MAX ? " (з 10 рівня персонажа — 20)." : ".") +
        " Володіння 10 відкриває зброю 2 виду, 20 — 3 виду. Більше досвіду володіння — за кількох ворогів, чемпіонів, босів, " +
        "сильніших ворогів і з Джерелом Велеса; за ворогів, слабших на 10+ рівнів, — нічого."));

      // Тренування: +1 досвіду володіння за кожен виграний бій для всієї групи на 30 хв; лише одне активне
      const TB = RPG.TRAINER_BOOST;
      const left = RPG.trainerBoostLeft(save);
      const boost = el("div", "shop-row skill-row" + (left ? " is-current" : ""));
      const bInfo = el("span", "shop-name", `Тренування з Брутом: +${TB.flat} досвіду володіння за кожен виграний бій`);
      bInfo.append(el("small", null, left
        ? ` · діє ще ${Math.ceil(left / 60000)} хв для всієї групи`
        : ` · для всієї групи на ${TB.durationMs / 60000} хв`));
      const bBtn = button(left ? "Триває" : `Тренуватися (${fmtNum(TB.cost)} зол.)`, "wf wf-button", async () => {
        const res = RPG.buyTrainerBoost(save);
        if (!res.ok) { showMsg(msg, res.reason, true); return; }
        journalReward(save, "Тренування з Брутом", `+${TB.flat} досвіду володіння за кожен виграний бій для всієї групи на ${res.minutes} хв (−${fmtNum(res.cost)} золота).`);
        await RPG.saveGame(save);
        showMsg(msg, `Брут ганяє вас до сьомого поту. ${res.minutes} хв уся група отримує +${TB.flat} досвіду володіння за кожен виграний бій (−${fmtNum(res.cost)} золота).`);
        renderAll();
      });
      bBtn.disabled = !!left || (save.character.gold || 0) < TB.cost;
      boost.append(bInfo, bBtn);
      box.append(boost);

      box.append(el("h3", null, "Володіння зброєю"));
      for (const [t, wt] of Object.entries(RPG.WEAPON_TYPES)) {
        const pr = RPG.masteryProgress(tms, t);
        const lvl = pr.level;
        const r = el("div", "shop-row skill-row" + (t === type ? " is-current" : ""));
        const expTxt = pr.need ? ` · досвід ${Math.floor(pr.exp)}/${pr.need}` + (lvl >= cap ? " (межа)" : "") : " · найвищий рівень";
        const info = el("span", "shop-name", `${wt.mastery}: ${lvl}/${cap}` + (t === type ? " · у руках" : "") + expTxt);
        info.append(el("small", null, lvl ? ` · ${masteryBonusText(t, lvl)}` : ` · на 20: ${masteryBonusText(t, RPG.MASTERY_MAX)}`));
        r.append(info);
        box.append(r);
      }

      box.append(el("h3", null, "Навички, заклинання та пасивні вміння"));
      const ids = RPG.trainerSkills(tms);
      if (!ids.length) { box.append(el("p", "status", "Вдягніть зброю, щоб тренер показав навички для неї.")); return; }
      const KIND = { buff: "Баф", heal: "Лікування", passive: "Пасивне" };
      const wName = sk => (Array.isArray(sk.weapon) ? sk.weapon : [sk.weapon]).map(t => RPG.WEAPON_TYPES[t].name.toLowerCase()).join(" / ");
      for (const id of ids) {
        const sk = RPG.SKILLS[id];
        const lvl = RPG.skillLevel(tms, id);
        const mastery = RPG.skillMastery(tms, sk);
        const r = el("div", "shop-row skill-row" + (sk.cls ? " is-class" : ""));
        const icon = el("img", "skill-icon");
        icon.alt = "";
        icon.onerror = () => icon.remove();
        icon.src = RPG.asset(`assets/images/skills/${id}.webp`);
        const kind = KIND[sk.kind] || (sk.magic ? "Заклинання" : "Навичка");
        const info = el("span", "shop-name", `${kind}: ${sk.name} — ${lvl}/${RPG.SKILL_MAX}`);
        info.append(el("small", null, ` · ${sk.desc} ${RPG.describeSkill(id, Math.max(1, lvl))}` +
          (sk.school ? ` · школа: ${RPG.SCHOOLS[sk.school].name}` : "") +
          (sk.weapon && !RPG.skillWeaponOk(sk, type) ? ` · потрібна зброя: ${wName(sk)}` : "") +
          (sk.req && mastery < sk.req ? ` · потрібно володіння ${sk.req}` : "")));
        const cost = RPG.skillCost(lvl + 1);
        const cap = RPG.skillCap(tms, id);
        const label = lvl >= RPG.SKILL_MAX ? "Максимум" : `${lvl ? "Покращити" : "Вивчити"} (${fmtNum(cost)} зол.)`;
        const b = button(label, "wf wf-button", async () => {
          const res = RPG.learnSkill(tms, id);
          if (!res.ok) { showMsg(msg, res.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `«${sk.name}»: рівень ${res.level} (−${fmtNum(res.cost)} золота).` +
            (sk.kind === "passive" ? " Бонус діє постійно." : " Додайте навичку в чергу дій у бою."));
          renderAll();
        });
        b.disabled = lvl >= cap || mastery < (sk.req || 0) || tms.character.gold < cost;
        if (b.disabled && lvl >= cap && lvl < RPG.SKILL_MAX) {
          b.title = sk.kind === "passive" ? "Пасивне вміння — до половини рівня персонажа" : "Рівень навички не може перевищувати рівень володіння зброєю";
        }
        r.append(icon, info, b);
        box.append(r);
      }
    }

    // ---------- Бій ----------
    const startBtn = $("start-btn");
    const rerollBtn = $("reroll-btn");
    const saveBtn = $("save-btn");
    const logBox = $("battle-log");
    let foes = [];              // вороги наступного бою: [{ id, champion }]
    const fighters = () => RPG.aliveMembers(save);
    // Від половини групи до розміру групи (макс. 6) — випадково (RPG.enemyGroupRange); данж — без змін
    let champWarn = false;      // показати вікно-попередження про чемпіона
    // Кут поля, де з'являться герої в наступному бою (battle.js → corner 0…3);
    // з кожною новою групою ворогів — інший кут, вороги — у протилежному
    // Краї поля (EDGE_TYPES) і перешкоди за краями (EDGE_COVER) — див. «Краї поля» нижче (fieldEdges, fieldCover).
    // Оголошені тут, бо nextEnemy() кличе fieldCover() ще до того місця.
    const EDGE_TYPES = { trees: "Дерева", rocks: "Скелі", walls: "Стіни", water: "Вода" };
    const EDGE_COVER = { trees: ["tree", "bush"], rocks: ["rock", "stone"], walls: ["wall", "stone"] };
    let corner = RPG.randomCorner();
    let obstacles = [];         // перешкоди наступного бою (battle.js → makeObstacles), нові з кожною групою ворогів
    let foePositions = [];      // стартові місця ворогів (battle.js → placeFoesFree): будь-де на полі, купою або врозкид
    function nextEnemy() {
      corner = RPG.randomCorner(corner);
      obstacles = RPG.makeObstacles(fieldCover(), corner);
      pickFoes();
      foePositions = RPG.placeFoesFree(foes, corner, obstacles);
    }
    function pickFoes() {
      if (mode === "dungeon") {
        // У данжі вороги задані наперед; поки ворота зачинені — показуємо боса
        foes = dungeonOn() ? RPG.dungeonSpecs(save) : [{ id: dungeonInfo.boss, champion: false }];
        RPG.equipFoes(foes, fighters());
        champWarn = false;
        return;
      }
      foes = RPG.rollEnemyGroup(locId, save.character.level, RPG.enemyGroupRange(fighters()), fighters());
      champWarn = foes.some(f => f.champion);
    }

    // Перемикач «Обстеження / Данж» і панель воріт данжу
    const leaveBtn = $("leave-btn");
    function renderMode() {
      const tabs = $("mode-tabs"), panel = $("dungeon-panel");
      if (!dungeonInfo) { tabs.hidden = panel.hidden = true; return; }
      const active = RPG.activeDungeon(save);
      tabs.hidden = false;
      tabs.innerHTML = "";
      const keys = RPG.keyCount(save, dungeonInfo.id);
      [["explore", dungeonInfo.explore], ["dungeon", `${dungeonInfo.name} · ключів: ${keys}`]].forEach(([m, text]) => {
        const b = button(text, "wf member-tab " + (m === mode ? "wf-button" : "wf-link"), () => {
          if (fighting || m === mode) return;
          if (active && m === "explore") { showMsg(msg, "Спершу пройдіть або покиньте данж.", true); return; }
          mode = m;
          nextEnemy();
          renderMode();
          renderEnemy();
          showReady();
        });
        if (m === mode) b.setAttribute("aria-pressed", "true");
        tabs.append(b);
      });

      const inGate = mode === "dungeon" && !active;
      panel.hidden = !inGate;
      rerollBtn.hidden = mode === "dungeon";
      startBtn.hidden = inGate;
      leaveBtn.hidden = !(mode === "dungeon" && active);
      startBtn.textContent = active && mode === "dungeon" ? `Почати бій ${active.stage} з ${active.stages}` : "Почати бій";
      if (!inGate) return;
      panel.innerHTML = "";
      panel.append(el("h3", null, `Данж «${dungeonInfo.name}»`), el("p", "note", dungeonInfo.description));
      panel.append(el("p", "note",
        `3 бої поспіль: 1) ${RPG.DUNGEON_POOL_TEXT(dungeonInfo, 1)}; 2) ${RPG.DUNGEON_POOL_TEXT(dungeonInfo, 2)}; ` +
        `3) бос «${RPG.ENEMIES[dungeonInfo.boss].name}». Зілля й відновлення HP/MP у данжі не діють — ` +
        "лікують лише навички. Досвід і здобич — тільки за перемогу над босом."));
      panel.append(el("p", "note" + (keys ? "" : " is-neg"),
        `${RPG.ITEMS[dungeonInfo.key].name} у кишені для ключів: ${keys}. Одна спроба — один ключ (зникає при вході). ` +
        `Ключ можна знайти під час «${dungeonInfo.explore}» — шанс ${Math.round(dungeonInfo.keyChance * 100)}% з кожного ворога.`));
      const open = button("Відчинити ворота (−1 ключ)", "wf wf-button", async () => {
        if (fighting) return;
        if (!confirm(`Відчинити ворота? ${RPG.ITEMS[dungeonInfo.key].name} зникне, навіть якщо данж не вдасться пройти.`)) return;
        const r = RPG.openDungeon(save, dungeonInfo.id);
        if (!r.ok) { showMsg(msg, r.reason, true); return; }
        await RPG.saveGame(save);
        showMsg(msg, "Ворота відчинено. Бій 1 з 3 — зілля й відновлення тут не діють.");
        nextEnemy();
        renderMode();
        renderEnemy();
        showReady();
        renderQuickSlots();
      });
      open.disabled = !keys || !fighters().length;
      panel.append(open);
    }
    // Вікно «Увага, чемпіон!» — з'являється, коли серед ворогів є чемпіон
    // Показується в черзі вікон (queueDialog): після «Незнайомця» та інших повідомлень, а не поверх них
    function showChampionWarning() { queueDialog(openChampionWarning); }
    function openChampionWarning() {
      if (fighting || !foes.some(f => f.champion)) return null;   // поки чекали — ворога вже змінили
      let dlg = $("champion-dialog");
      if (!dlg) {
        dlg = el("dialog", "champion-dialog");
        dlg.id = "champion-dialog";
        document.body.append(dlg);
      }
      const i = foes.findIndex(f => f.champion);
      const e = curEnemy(i);
      dlg.innerHTML = "";
      const face = el("span", "champion-face");
      Object.assign(face.style, RPG.enemySpriteStyle(foes[i].id));
      dlg.append(el("div", "champion-badge", "Увага — чемпіон!"), face,
        el("h3", null, `${e.name} · рівень ${e.level}`),
        el("p", null, "Утричі сильніший за звичайного: здоров'я, мана, атака, магія й захист ×3. " +
          "За перемогу — трофей рідкісної якості й нагорода ×5 в Артеміди, адміністратора гільдії."));
      const row = el("div", "row dialog-actions");
      row.append(
        button("Прийняти виклик", "wf wf-button", () => dlg.close()),
        button("Шукати іншого ворога", "wf wf-link", () => { dlg.close(); $("reroll-btn")?.click(); }));
      dlg.append(row);
      if (!dlg.open) dlg.showModal();
      return dlg;
    }
    function curEnemy(i = 0) { return RPG.enemyFromSpec(foes[i]); }
    const gsText = e => (e.gs ? ` · GS ${e.gs}` : "");
    // Зброя гуманоїда і його дальність (monstergear.js)
    const weaponText = e => (e.weaponName ? ` · ${e.weaponName} (дальн. ${RPG.enemyRange(e)})` : "");
    const anyChampion = () => foes.some(f => f.champion);
    if (combat) nextEnemy();

    // Ворог(и): великий портрет — перший; якщо їх кілька — список з HP / MP кожного
    function renderEnemy() {
      if (champWarn) { champWarn = false; setTimeout(showChampionWarning, 50); }
      if (!fighting) renderField();
      const enemy = curEnemy(0);
      const champ = foes[0].champion;
      $("enemy-img").closest("figure").classList.toggle("is-champion", champ);
      $("enemy-col").classList.toggle("is-champion", anyChampion());
      Object.assign($("enemy-img").style, RPG.enemySpriteStyle(foes[0].id));
      $("enemy-img").setAttribute("aria-label", enemy.name);
      $("enemy-name").textContent = `${enemy.name} (рівень ${enemy.level}${gsText(enemy)})` + (foes.length > 1 ? ` + ще ${foes.length - 1}` : "");
      setBar($("enemy-hp"), enemy.stats.hp, enemy.stats.hp);
      const mpBar = $("enemy-mp");
      mpBar.hidden = !enemy.stats.mp;
      if (enemy.stats.mp) setBar(mpBar, enemy.stats.mp, enemy.stats.mp);

      const list = $("enemy-list");
      if (!list) return;
      list.innerHTML = "";
      list.hidden = foes.length < 2;
      if (foes.length < 2) return;
      list.append(el("div", "party-title", `Ворогів: ${foes.length}`));
      foes.forEach((f, i) => {
        const e = curEnemy(i);
        const row = el("div", "party-row" + (f.champion ? " is-champion" : ""));
        const face = el("span", "party-face");
        Object.assign(face.style, RPG.enemySpriteStyle(f.id));
        const info = el("div", "party-info");
        info.append(el("strong", null, `${e.name} · рів. ${e.level}${gsText(e)}${f.champion ? " · чемпіон" : ""}${e.boss ? " · бос" : ""}${weaponText(e)}`));
        const hp = miniBar("bar-hp", "HP", "foe-hp-" + i);
        setBar(hp, e.stats.hp, e.stats.hp);
        info.append(hp);
        if (e.stats.mp) {
          const mp = miniBar("bar-mp", "MP", "foe-mp-" + i);
          setBar(mp, e.stats.mp, e.stats.mp);
          info.append(mp);
        }
        row.append(face, info);
        list.append(row);
      });
    }

    // ---------- Поле бою 15 × 30 (battle.js → BATTLE_FIELD, fieldPos, placeHeroes, placeFoes) ----------
    // Логічно поле 15 рядків × 30 стовпців. На ПК показується так само (широке),
    // на телефоні (≤ 700 px) — повернуте: 30 рядків × 15 стовпців (високе).
    // Герої стоять у куті corner (зона 3 × 3), вороги — будь-де на полі (купою або врозкид),
    // але не ближче ніж на хід руху до героїв (battle.js → placeFoesFree).
    // Розстановку героїв обирає гравець (вікно розстановки) — ВІДНОСНО своєї зони 3 × 3
    // (c 2 — передній ряд), і вона зберігається в save.formation:
    // { main: { r, c }, <id напарника>: { r, c } }. Якщо для всіх героїв групи вона вже є —
    // використовується щоразу, у будь-якому куті; інакше вікно з'являється перед першим боєм.
    const FIELD = RPG.BATTLE_FIELD;
    const fieldBox = $("bfield");
    const fieldTokens = { hero: [], enemy: [] };
    const mobileField = window.matchMedia ? window.matchMedia("(max-width: 700px)") : { matches: false };
    // Повернули телефон / змінили ширину вікна — перемалювати поле під новий вигляд (не під час бою)
    mobileField.addEventListener?.("change", () => { if (combat && !fighting) renderField(); });
    const memberKey = ms => (ms.memberIndex ? (save.party[ms.memberIndex - 1]?.id || "m" + ms.memberIndex) : "main");
    function formationOf(team) {
      const f = save.formation || {};
      return RPG.placeHeroes(team, team.map(ms => f[memberKey(ms)]));
    }
    function storeFormation(team, pos) {
      save.formation = {};
      team.forEach((ms, i) => { if (pos[i]) save.formation[memberKey(ms)] = { r: pos[i].r, c: pos[i].c }; });
      save.formationAt = locId;
    }
    // Чи вже є розстановка для всіх, хто йде в бій (нового напарника треба поставити)
    const inZone = p => p && p.r >= 0 && p.r < FIELD.zone && p.c >= 0 && p.c < FIELD.zone;
    const placedHere = () => {
      const f = save.formation || {};
      const team = fighters();
      return team.length > 0 && team.every(ms => inZone(f[memberKey(ms)]));
    };

    // Як клітинка (r, c) стоїть на екрані: box.bfView = { rows, cols, map(p) → { row, col }, scale }
    function setView(box, rows, cols, map, scale = 1) {
      box.bfView = { rows, cols, map, scale };
      box.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      box.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
      box.style.setProperty("--bf-ar", cols / rows);
    }
    function addCell(box, p, cls) {
      const v = box.bfView.map(p);
      const cell = el("div", "bf-cell " + cls);
      cell.dataset.r = p.r;
      cell.dataset.c = p.c;
      cell.style.gridRow = v.row + 1;
      cell.style.gridColumn = v.col + 1;
      box.append(cell);
      return cell;
    }
    // ---------- Краї поля: дерева / скелі / стіни / вода (data/enemies.js → LOCATIONS / DUNGEONS → edge) ----------
    // Поле обгортається рамкою .bf-frame з чотирма смугами .bf-edge (суто для вигляду, на бій не впливають).
    // Логічні краї [верх, право, низ, ліво] поточної локації (у данжі — краї данжу, якщо задані)
    function fieldEdges() {
      const src = (mode === "dungeon" && dungeonInfo?.edge) || locData?.edge || "trees";
      const arr = Array.isArray(src) ? src : [src, src, src, src];
      return [0, 1, 2, 3].map(i => (EDGE_TYPES[arr[i]] ? arr[i] : "trees"));
    }
    // Які перешкоди бувають на полі: з LOCATIONS / DUNGEONS → cover = { block: [...], low: [...] },
    // а без нього — за краями: дерева → дерева й кущі, скелі → скелі й каміння, стіни → стіни й уламки-каміння
    function fieldCover() {
      const own = (mode === "dungeon" && dungeonInfo?.cover) || locData?.cover;
      if (own) return own;
      const kinds = [...new Set(fieldEdges())].filter(k => EDGE_COVER[k]);
      if (!kinds.length) kinds.push("trees");                  // лише вода — тоді дерева й кущі
      return { block: kinds.map(k => EDGE_COVER[k][0]), low: [...new Set(kinds.map(k => EDGE_COVER[k][1]))] };
    }
    const OBST_TITLES = {
      tree: "Дерево — не пройти й не видно ціль", rock: "Скеля — не пройти й не видно ціль", wall: "Стіна — не пройти й не видно ціль",
      bush: "Кущ — не стати, але ціль видно (лук, заклинання)", stone: "Каміння — не стати, але ціль видно (лук, заклинання)"
    };
    let fieldFrame = null;
    function frameField(mob) {
      if (!fieldBox) return;
      if (!fieldFrame) {
        fieldFrame = el("div", "bf-frame");
        fieldBox.parentNode.insertBefore(fieldFrame, fieldBox);
        fieldFrame.append(fieldBox);
        for (const side of ["top", "right", "bottom", "left"]) fieldFrame.append(el("div", "bf-edge bf-edge-" + side));
      }
      const [t, r, b, l] = fieldEdges();
      // На телефоні поле повернуте (рядок ↔ стовпець): логічний лівий край стає верхнім,
      // нижній — правим, правий — нижнім, верхній — лівим
      const shown = mob ? [l, b, r, t] : [t, r, b, l];
      fieldFrame.className = "bf-frame" + (mob ? " is-mobile" : "") + (locData?.region === "dark" ? " is-dark" : "");
      ["top", "right", "bottom", "left"].forEach((side, i) => {
        const strip = fieldFrame.querySelector(".bf-edge-" + side);
        strip.className = `bf-edge bf-edge-${side} edge-${shown[i]}`;
        strip.title = EDGE_TYPES[shown[i]];
      });
    }

    // Велике поле: 450 клітинок, підсвічені зони кутів героїв і ворогів
    function fieldGrid(box, heroCorner = corner, obst = obstacles) {
      box.innerHTML = "";
      const mob = mobileField.matches;
      if (box === fieldBox) frameField(mob);
      box.className = "bfield bf-big" + (mob ? " is-mobile" : "");
      setView(box, mob ? FIELD.cols : FIELD.rows, mob ? FIELD.rows : FIELD.cols,
        mob ? p => ({ row: p.c, col: p.r }) : p => ({ row: p.r, col: p.c }), 1.3);
      const zone = {};
      for (const z of RPG.zoneCells(heroCorner)) zone[z.r + ":" + z.c] = "bf-hero" + (z.front ? " bf-front" : "");
      const ob = {};
      for (const o of obst || []) ob[o.r + ":" + o.c] = o;
      for (let r = 0; r < FIELD.rows; r++) {
        for (let c = 0; c < FIELD.cols; c++) {
          const o = ob[r + ":" + c];
          const cell = addCell(box, { r, c }, o ? `bf-gap bf-obst ob-${o.kind}${o.block ? " is-block" : " is-low"}` : (zone[r + ":" + c] || "bf-gap"));
          if (o) cell.title = OBST_TITLES[o.kind] || "";
        }
      }
    }
    // Вікно розстановки: лише своя зона 3 × 3 і смуга «у бік поля» з боку переднього ряду
    // (на ПК — праворуч, на телефоні — знизу)
    function zoneGrid(box, extra = "") {
      box.innerHTML = "";
      const mob = mobileField.matches;
      box.className = "bfield bf-zone" + (mob ? " is-mobile" : "") + (extra ? " " + extra : "");
      const n = FIELD.zone;
      setView(box, mob ? n + 1 : n, mob ? n : n + 1,
        mob ? p => ({ row: p.c, col: p.r }) : p => ({ row: p.r, col: p.c }));
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) addCell(box, { r, c }, "bf-hero" + (c === n - 1 ? " bf-front" : ""));
      const toward = el("div", "bf-toward", mob ? "↓ у бік поля ↓" : "у бік поля →");
      if (mob) { toward.style.gridRow = n + 1; toward.style.gridColumn = "1 / -1"; }
      else { toward.style.gridColumn = n + 1; toward.style.gridRow = "1 / -1"; }
      box.append(toward);
    }
    // Іконка учасника: портрет + маленькі смужки HP / MP
    function fieldToken(kind, name, sprite, extra = "") {
      const t = el("div", "bf-unit is-" + kind + (extra ? " " + extra : ""));
      t.dataset.name = name;
      const face = el("span", "bf-face");
      Object.assign(face.style, sprite);
      const bars = el("span", "bf-bars");
      for (const cls of ["bf-bar-hp", "bf-bar-mp"]) {
        const b = el("span", "bf-bar " + cls);
        b.append(el("i"));
        bars.append(b);
      }
      t.append(face, bars);
      return t;
    }
    // Іконка на клітинці p (логічні r, c) поля box; scale > 1 — трохи більша за клітинку (по центру)
    function tokenPos(t, p, box = fieldBox) {
      const v = box?.bfView;
      if (!p || !v) return;
      const q = v.map(p), k = v.scale || 1;
      t.style.width = (k * 100 / v.cols) + "%";
      t.style.height = (k * 100 / v.rows) + "%";
      t.style.left = ((q.col - (k - 1) / 2) * 100 / v.cols) + "%";
      t.style.top = ((q.row - (k - 1) / 2) * 100 / v.rows) + "%";
    }
    function tokenBars(t, hp, maxHp, mp, maxMp) {
      const [h, m] = t.querySelectorAll(".bf-bar i");
      h.style.width = Math.max(0, Math.min(100, hp / Math.max(1, maxHp) * 100)) + "%";
      m.parentElement.hidden = !maxMp;
      if (maxMp) m.style.width = Math.max(0, Math.min(100, mp / maxMp * 100)) + "%";
      t.classList.toggle("is-dead", hp <= 0);
      const label = `${t.dataset.name} — HP ${Math.max(0, Math.round(hp))} / ${Math.round(maxHp)}` + (maxMp ? `, MP ${Math.round(mp)} / ${Math.round(maxMp)}` : "");
      t.title = label;
      t.setAttribute("aria-label", label);
    }
    const heroTokenFor = ms => fieldToken("hero", ms.character.name, RPG.heroSpriteStyle(ms.character.classId));
    const foeTokenFor = (f, e) => fieldToken("enemy", e.name + weaponText(e), RPG.enemySpriteStyle(f.id),
      (f.champion ? "is-champion" : "") + (e.boss ? " is-boss" : ""));

    // Поле над журналом: як стоятимуть герої й вороги в наступному бою.
    // heroPos / foePos / team / maxStats — для показу бою (інакше — поточна розстановка)
    function renderField(opts = {}) {
      if (!fieldBox) return;
      const team = opts.team || fighters();
      const hc = Number.isInteger(opts.corner) ? opts.corner : corner;
      const heroPos = opts.heroPos || formationOf(team).map(p => RPG.fieldPos(p, hc));
      if (foePositions.length !== foes.length) foePositions = RPG.placeFoesFree(foes, corner, obstacles);
      const foePos = opts.foePos || foePositions;
      fieldGrid(fieldBox, hc, opts.obstacles || obstacles);
      fieldTokens.hero = team.map((ms, k) => {
        const t = heroTokenFor(ms);
        const st = opts.maxStats?.[k] || RPG.calcStats(ms);
        tokenPos(t, heroPos[k]);
        tokenBars(t, ms.character.hp, st.hp, ms.character.mp, st.mp);
        fieldBox.append(t);
        return t;
      });
      fieldTokens.enemy = foes.map((f, i) => {
        const e = curEnemy(i);
        const t = foeTokenFor(f, e);
        tokenPos(t, foePos[i]);
        tokenBars(t, e.stats.hp, e.stats.hp, e.stats.mp || 0, e.stats.mp || 0);
        fieldBox.append(t);
        return t;
      });
    }
    // Подія бою на полі: позиції, смужки, хто діє, по кому влучили
    function fieldEvent(ev, prev, team, maxStats) {
      (ev.heroes || []).forEach((h, k) => {
        const t = fieldTokens.hero[k];
        if (!t) return;
        tokenPos(t, h.pos);
        tokenBars(t, h.hp, maxStats[k].hp, h.mp, maxStats[k].mp);
        const was = prev?.heroes?.[k];
        if (was && was.hp !== h.hp) RPG.fx.hit(t, h.hp - was.hp, ev.crit ? "crit" : "");
      });
      (ev.enemies || []).forEach((st, i) => {
        const t = fieldTokens.enemy[i];
        if (!t) return;
        const e = curEnemy(i);
        tokenPos(t, st.pos);
        tokenBars(t, st.hp, e.stats.hp, st.mp, e.stats.mp || 0);
        const was = prev?.enemies?.[i];
        if (was && was.hp !== st.hp) RPG.fx.hit(t, st.hp - was.hp, ev.crit ? "crit" : "");
      });
      fieldBox.querySelectorAll(".is-acting, .is-target").forEach(n => n.classList.remove("is-acting", "is-target"));
      const pick = r => (r ? fieldTokens[r.side]?.[r.i] : null);
      const a = pick(ev.actor), tg = pick(ev.target);
      if (a) { a.classList.add("is-acting"); RPG.fx.act(a); }
      if (tg && tg !== a) tg.classList.add("is-target");
    }

    // ---------- Вікно розстановки героїв ----------
    // Перетягнути портрет на клітинку своєї зони або натиснути героя, потім клітинку.
    // onDone() — що робити після «Готово» (наприклад, почати бій)
    function openFormation(onDone = null) {
      if (document.querySelector("dialog[open]:not(#formation-dialog)")) { queueDialog(() => { openFormation(onDone); return $("formation-dialog"); }); return; }
      const team = fighters();
      if (!team.length) { showMsg(msg, "Усі герої групи полягли — розставляти нікого.", true); return; }
      const f = save.formation || {};
      // Хто вже має збережене місце — стоїть на ньому; інші чекають унизу
      const auto = RPG.placeHeroes(team, team.map(ms => f[memberKey(ms)]));
      let pos = team.map((ms, i) => (f[memberKey(ms)] ? auto[i] : null));
      let selected = null;

      let dlg = $("formation-dialog");
      if (!dlg) {
        dlg = el("dialog", "formation-dialog");
        dlg.id = "formation-dialog";
        document.body.append(dlg);
      }
      dlg.innerHTML = "";
      const close = button("×", "notice-close", () => dlg.close());
      close.setAttribute("aria-label", "Закрити");
      const field = el("div", "bfield bf-zone");
      const tray = el("div", "bf-tray");
      tray.setAttribute("aria-label", "Герої, яких ще не розставлено");
      const hint = el("p", "bf-hint");
      const btnAuto = button("Розставити автоматично", "wf wf-link", () => {
        pos = RPG.placeHeroes(team, pos.map(p => p || undefined));
        selected = null;
        draw();
      });
      const btnOk = button(onDone ? "До бою!" : "Готово", "wf wf-button", async () => {
        if (pos.some(p => !p)) return;
        storeFormation(team, pos);
        await RPG.saveGame(save);
        dlg.close();
        renderField();
        if (onDone) onDone();
        else showMsg(msg, "Розстановку збережено.");
      });
      const row = el("div", "row dialog-actions");
      row.append(btnOk, btnAuto, button("Скасувати", "wf wf-link", () => dlg.close()));
      dlg.append(close, el("h3", null, "Розстановка героїв"),
        el("p", "note", "Ваша зона — 3×3 клітинки. У кожному бою група з'являється в іншому куті поля, " +
          "а вороги — будь-де на полі (купою або врозкид), але не ближче ніж на хід руху. Розстановка задається відносно " +
          "кута: передній ряд (виділений) дивиться в бік поля. " +
          "Перетягніть героя на клітинку або натисніть на героя, а потім на клітинку. " +
          "Дальність: ближній бій — 1 клітинка, посох (заклинання) — 2, лук — 3. Схема збережеться для наступних боїв і локацій."),
        field, tray, hint, row);

      function placeAt(i, p) {
        const j = pos.findIndex((q, k) => k !== i && q && q.r === p.r && q.c === p.c);
        if (j >= 0) pos[j] = pos[i] ? { ...pos[i] } : null;   // обмін місцями (або той іде вниз)
        pos[i] = { r: p.r, c: p.c };
      }
      function tokenClick(i) {
        if (selected !== null && selected !== i && pos[i]) { placeAt(selected, pos[i]); selected = null; }
        else selected = selected === i ? null : i;
        draw();
      }
      function cellClick(cell) {
        const p = { r: +cell.dataset.r, c: +cell.dataset.c };
        if (selected === null) return;
        placeAt(selected, p);
        selected = null;
        draw();
      }
      // Перетягування мишею й пальцем (pointer events); короткий дотик без руху — це клік
      function bindDrag(node, i) {
        node.tabIndex = 0;
        node.setAttribute("role", "button");
        node.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); tokenClick(i); } });
        node.addEventListener("pointerdown", ev => {
          if (ev.button > 0) return;
          ev.preventDefault();
          const sx = ev.clientX, sy = ev.clientY;
          let ghost = null, over = null;
          try { node.setPointerCapture(ev.pointerId); } catch (e) { /* без захоплення теж працює */ }
          const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest(".bf-cell.bf-hero");
          const move = e => {
            if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
            if (!ghost) {
              ghost = node.cloneNode(true);
              ghost.className = "bf-unit is-hero bf-ghost";
              ghost.style.width = node.offsetWidth + "px";
              ghost.style.height = node.offsetHeight + "px";
              document.body.append(ghost);
              node.classList.add("is-dragging");
            }
            ghost.style.left = e.clientX + "px";
            ghost.style.top = e.clientY + "px";
            const c = cellAt(e.clientX, e.clientY);
            if (c !== over) { over?.classList.remove("is-over"); over = c; over?.classList.add("is-over"); }
          };
          const end = (e, cancel) => {
            node.removeEventListener("pointermove", move);
            node.removeEventListener("pointerup", up);
            node.removeEventListener("pointercancel", cancelUp);
            over?.classList.remove("is-over");
            node.classList.remove("is-dragging");
            if (!ghost) { if (!cancel) tokenClick(i); return; }
            ghost.remove();
            if (cancel) return;
            const cell = cellAt(e.clientX, e.clientY);
            if (cell) placeAt(i, { r: +cell.dataset.r, c: +cell.dataset.c });
            else if (document.elementFromPoint(e.clientX, e.clientY)?.closest(".bf-tray")) pos[i] = null;
            selected = null;
            draw();
          };
          const up = e => end(e, false);
          const cancelUp = e => end(e, true);
          node.addEventListener("pointermove", move);
          node.addEventListener("pointerup", up);
          node.addEventListener("pointercancel", cancelUp);
        });
      }

      function draw() {
        zoneGrid(field, "is-setup" + (selected !== null ? " has-pick" : ""));
        field.querySelectorAll(".bf-cell.bf-hero").forEach(cell => {
          cell.addEventListener("click", () => cellClick(cell));
        });
        tray.innerHTML = "";
        team.forEach((ms, i) => {
          const st = RPG.calcStats(ms);
          const t = heroTokenFor(ms);
          tokenBars(t, ms.character.hp, st.hp, ms.character.mp, st.mp);
          const w = RPG.ITEMS[RPG.refId(ms.equipment.mainHand)];
          const reach = RPG.actionRange(w?.weaponType || null, w?.weaponType === "staff");
          t.append(el("span", "bf-name", `${ms.character.name} · ${reach}`));
          t.title += ` · дальність ${reach}`;
          if (i === selected) t.classList.add("is-picked");
          bindDrag(t, i);
          if (pos[i]) { tokenPos(t, pos[i], field); field.append(t); }
          else { t.classList.add("in-tray"); tray.append(t); }
        });
        tray.classList.toggle("is-empty", !tray.children.length);
        if (!tray.children.length) tray.append(el("span", "bf-tray-empty", "Усі герої на полі. Перетягніть сюди, щоб прибрати з клітинки."));
        const left = pos.filter(p => !p).length;
        btnOk.disabled = left > 0;
        hint.textContent = left
          ? `Ще не розставлено: ${left}. ${selected !== null ? "Тепер натисніть клітинку своєї зони." : ""}`
          : selected !== null ? "Натисніть клітинку своєї зони або іншого героя, щоб помінятися місцями." : "Усі на місцях — можна в бій.";
      }
      draw();
      if (!dlg.open) dlg.showModal();
    }

    function renderQueue() {
      const box = $("queue");
      box.innerHTML = "";
      if (queueMember >= RPG.partySize(save)) queueMember = 0;
      const qms = RPG.memberSave(save, queueMember);
      memberTabs($("queue-member"), save, queueMember, pickMember);
      const weaponRef = qms.equipment.mainHand;
      const weaponItem = RPG.ITEMS[RPG.refId(weaponRef)];
      const weaponSt = weaponItem ? RPG.itemStats(weaponRef) : {};
      const magicWeapon = weaponItem && (weaponSt.magic || 0) > (weaponSt.attack || 0);
      // Варіанти для кожної клітинки: порожньо, звичайний удар, вивчені навички цієї зброї
      const wtype = weaponItem?.weaponType || null;
      const options = [["", "—"], ["attack", "Удар"]];
      if (weaponItem?.weaponType === "staff") options.push(["spell", "Іскра (4 MP)"]);
      if (wtype) {
        for (const id of RPG.skillsForWeapon(wtype, qms.character.classId)) {
          if (RPG.skillLevel(qms, id) > 0) options.push([id, `${RPG.SKILLS[id].name} (${RPG.SKILLS[id].mp} MP)`]);
        }
      }
      for (let i = 0; i < RPG.QUEUE_SIZE; i++) {
        const action = qms.battleQueue[i] || "";
        const sel = el("select", "wf wf-slot queue-select" + (action ? "" : " slot-empty"));
        sel.title = `Дія ${i + 1}`;
        sel.setAttribute("aria-label", `Дія ${i + 1} у черзі`);
        const opts = options.slice();
        if (action && !opts.some(o => o[0] === action)) {
          const sk = RPG.SKILLS[action];
          opts.push([action, sk ? `${sk.name} (недоступна — буде удар)` : (action === "spell" ? "Іскра (лише з посохом)" : action)]);
        }
        for (const [val, text] of opts) {
          const o = el("option", null, `${i + 1}. ${text}`);
          o.value = val;
          if (val === action) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener("change", async () => {
          if (fighting) return;
          qms.battleQueue[i] = sel.value;
          for (let k = 0; k < RPG.QUEUE_SIZE; k++) qms.battleQueue[k] ??= "";
          qms.battleQueue.length = RPG.QUEUE_SIZE;
          if (!qms.battleQueue.some(Boolean)) qms.battleQueue[0] = "attack";
          await RPG.saveGame(save);
          renderQueue();
        });
        // Невеличке зображення навички зліва в клітинці (assets/images/skills/<id>.webp), якщо воно є;
        // для удару, «Іскри» й порожньої клітинки — без зображення
        const cell = el("div", "queue-cell");
        if (RPG.SKILLS[action]) {
          const icon = el("img", "queue-icon");
          icon.alt = "";
          icon.onerror = () => { icon.remove(); cell.classList.remove("has-icon"); };
          icon.src = RPG.asset(`assets/images/skills/${action}.webp`);
          cell.classList.add("has-icon");
          cell.append(icon);
        }
        cell.append(sel);
        box.append(cell);
      }
      const who = RPG.partySize(save) > 1 ? `${qms.character.name}: ` : "";
      $("weapon-info").textContent = who + (weaponItem
        ? `Зброя: ${RPG.itemFullName(weaponRef)} · дальність ${RPG.actionRange(weaponItem.weaponType, false)}${weaponItem.weaponType === "staff" ? " (заклинання — 2)" : ""}`
        : "Зброя: немає (бій кулаками)");
    }

    function renderAll() {
      drawHero();
      renderQuickSlots();
      if (combat) renderQueue();
      if (combat && !fighting) renderField();
      else renderPlace();
    }

    // Короткий стан бою (logBox): заголовок і рядки. Повний журнал — у вікні (journal.js).
    // Під час показу бою (liveLines) рядки ще й ідуть у відкрите вікно журналу.
    let liveLines = null;     // рядки бою, що зараз показується
    let liveEntry = null;     // його запис у save.battleLog (у вікні не показуємо, поки бій іде)
    let journalCtl = null;    // відкрите вікно журналу
    function statusAppend(line) {
      logBox.append(RPG.logLi(line));   // смужка на 2 рядки: видно початок (головне), решта — у журналі
    }
    function setArena(title, lines, state = "") {
      logBox.innerHTML = "";
      const all = [["title", title, state], ...(lines || []).map(l => ["info", l])];
      all.forEach(statusAppend);
      if (liveLines) all.forEach(l => { liveLines.push(l); journalCtl?.append(l); });
    }

    const foesText = () => foes.map((f, i) => { const e = curEnemy(i); return `${e.name} (рівень ${e.level})`; }).join(", ");

    function showReady() {
      if (mode === "dungeon") {
        const a = RPG.activeDungeon(save);
        logBox.innerHTML = "";
        if (!a) {
          setArena(`Данж «${dungeonInfo.name}»`, [`Ворота зачинені. Попереду чекає бос: ${foesText()}.`,
            "Відчиніть ворота ключем (панель вище)."], "ready");
          return;
        }
        const lines = [`Бій ${a.stage} з ${a.stages}: ${foesText()}.`,
          "Зілля й відновлення в данжі не діють — лікують лише навички."];
        if (a.stage < a.stages) lines.push("За цей бій нагороди немає — досвід і здобич дає лише бос.");
        else lines.push("Це БОС! Кожен третій свій хід він застосовує особливу навичку. Перемога — нагорода за весь данж.");
        if (!fighters().length) lines.push("Усі герої групи полягли.");
        setArena(a.stage < a.stages ? `Данж: бій ${a.stage} з ${a.stages}` : "Данж: бос!", lines, "ready");
        return;
      }
      const lvl = save.character.level;
      const strong = foes.some((f, i) => curEnemy(i).level >= lvl + 2);
      const lines = [`Попереду: ${foesText()}.${strong ? " Обережно: серед них є значно сильніші!" : ""}`];
      if (foes.length > 1) lines.push(`Ворогів: ${foes.length}, у вашій групі живих героїв: ${fighters().length}.`);
      if (anyChampion()) lines.push("Серед них рідкісний ЧЕМПІОН: утричі сильніший! За перемогу — трофей і нагорода ×5 у Гільдії авантюристів.");
      if (foes.some((f, i) => curEnemy(i).boss)) lines.push("Це БОС! Кожен третій свій хід він застосовує особливу навичку.");
      if (!fighters().length) lines.push("Усі герої групи полягли — помоліться за них у Храмі.");
      lines.push("Натисніть «Почати бій» або пошукайте іншого суперника.");
      logBox.innerHTML = "";
      setArena(anyChampion() ? "Чемпіон!" : "Готові до бою", lines, anyChampion() ? "champion" : "ready");
    }

    // Рядок журналу: позначка «хто діє» + текст, числа виділені (RPG.logLi).
    // Під час бою в короткому стані — заголовок бою й лише останній рядок.
    function addLogLine(ev) {
      const line = RPG.journalPack(ev);
      if (!liveLines) { statusAppend(line); return; }
      liveLines.push(line);
      journalCtl?.append(line);
      logBox.querySelector(".log-live")?.remove();
      const li = RPG.logLi(line);
      li.classList.add("log-live");
      logBox.append(li);
    }

    // Ефекти: хто діє — спалах; у кого змінилось HP — число над портретом
    let lastSnap = null;
    const heroFig = () => $("hero-img").closest("figure");
    const enemyFig = () => $("enemy-img").closest("figure");
    function rowOf(id) { const b = $(id); return b ? b.closest(".party-row") : null; }
    function battleFx(ev, team) {
      if (ev.who === "hero") RPG.fx.act(heroFig());
      else if (ev.who === "enemy") RPG.fx.act(enemyFig());
      if (lastSnap) {
        team.forEach((ms, k) => {
          const now = ev.heroes?.[k], was = lastSnap.heroes?.[k];
          if (!now || !was) return;
          const i = ms.memberIndex || 0;
          const target = i === 0 ? heroFig() : rowOf("party-hp-" + i);
          if (now.hp !== was.hp) RPG.fx.hit(target, now.hp - was.hp, ev.crit ? "crit" : "");
        });
        (ev.enemies || []).forEach((now, i) => {
          const was = lastSnap.enemies?.[i];
          if (!was || now.hp === was.hp) return;
          RPG.fx.hit(i === 0 ? enemyFig() : rowOf("foe-hp-" + i), now.hp - was.hp, ev.crit ? "crit" : "");
        });
      }
      lastSnap = ev;
    }

    // Смужки під час показу бою. team — герої, що б'ються; maxStats — їхні максимуми
    function applyEventToBars(ev, team, maxStats) {
      team.forEach((ms, k) => {
        const h = ev.heroes?.[k];
        if (!h) return;
        const i = ms.memberIndex || 0;
        if (i === 0) {
          setBar($("hero-hp"), h.hp, maxStats[k].hp);
          setBar($("hero-mp"), h.mp, maxStats[k].mp);
        } else {
          setBar($("party-hp-" + i), h.hp, maxStats[k].hp);
          setBar($("party-mp-" + i), h.mp, maxStats[k].mp);
        }
      });
      foes.forEach((f, i) => {
        const e = curEnemy(i), st = ev.enemies?.[i];
        if (!st) return;
        if (i === 0) {
          setBar($("enemy-hp"), st.hp, e.stats.hp);
          if (e.stats.mp) setBar($("enemy-mp"), st.mp, e.stats.mp);
        }
        setBar($("foe-hp-" + i), st.hp, e.stats.hp);
        if (e.stats.mp) setBar($("foe-mp-" + i), st.mp, e.stats.mp);
      });
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function setFighting(on) {
      fighting = on;
      startBtn.disabled = rerollBtn.disabled = saveBtn.disabled = on;
      document.body.classList.toggle("is-fighting", on);
      drawHero();          // на час бою — портрет головного героя, після — знову обраного
      renderQuickSlots();
      if (!on) renderField();   // поле — під наступний бій
      const fb = $("formation-btn");
      if (fb) fb.disabled = on;
    }

    // Автозілля (налаштування на пристрої — core.js → getAutoPotion; пиття — character.js → autoPotion):
    // перед боєм і після бою. «Немає зілля» пишемо один раз, поки зілля цього виду знову не з'явиться.
    const potionWarned = { hp: false, mp: false };
    function runAutoPotion() {
      const cfg = RPG.getAutoPotion();
      const r = RPG.autoPotion(save, cfg);
      const lines = r.lines.slice();
      for (const stat of ["hp", "mp"]) {
        const set = RPG.AUTO_POTIONS[stat];
        if (["small", "medium", "large"].some(k => RPG.countItem(save, set[k]) > 0)) potionWarned[stat] = false;
        if (cfg[stat].on && r.missing[stat] && !potionWarned[stat]) {
          potionWarned[stat] = true;
          lines.push(`Автозілля: в інвентарі закінчилось ${stat === "hp" ? "зілля здоров'я" : "зілля мани"}.`);
        }
      }
      return lines;
    }

    async function startBattle() {
      if (fighting) return;
      const team = fighters();
      if (!team.length) { showMsg(msg, "Усі герої групи полягли — помоліться за них у Храмі.", true); return; }
      if (mode === "dungeon" && !dungeonOn()) { showMsg(msg, "Спершу відчиніть ворота данжу ключем.", true); return; }
      const dun = dungeonOn() ? RPG.activeDungeon(save) : null;   // бій у данжі: { stage, stages, ... }
      const rewarded = !dun || dun.stage === dun.stages;          // нагорода — лише за боса данжу
      // Автозілля перед боєм (у данжі не діє — character.js → autoPotion)
      const prePotion = runAutoPotion().map(l => l.replace(/^Автозілля:/, "Автозілля перед боєм:"));
      setFighting(true);
      renderEnemy();
      logBox.innerHTML = "";

      const maxStats = team.map(ms => RPG.calcStats(ms));
      RPG.equipFoes(foes, team);   // GS групи міг змінитися (перевдягнулись) — речі ворогів під нього
      renderEnemy();
      const result = RPG.simulatePartyBattle(team, foes, { heroPos: formationOf(team), corner, obstacles, foePos: foePositions });
      const group = team.length > 1;

      // Результат застосовуємо і зберігаємо ОДРАЗУ — щоб не можна було
      // уникнути поразки, просто закривши сторінку під час показу бою
      const summary = [];
      const levelLines = [];
      const got = {}, lost = {}, filtered = {};   // речі цього бою (для підсумку поля бою); filtered — викинув фільтр
      const freeBefore = RPG.invFree(save);
      let battleGold = 0, battleExp = 0;
      result.heroes.forEach((h, k) => { team[k].character.hp = h.hp; team[k].character.mp = h.mp; });
      let deaths = null;
      if (result.win && !rewarded) {
        result.heroes.forEach((h, k) => {
          if (h.dead) { RPG.markFallen(team[k]); summary.push(`${team[k].character.name} полягає (відродіть у Храмі)`); }
        });
      } else if (result.win) {
        // Полеглі в переможному бою лишаються мертвими до молитви в Храмі
        result.heroes.forEach((h, k) => {
          if (h.dead) { RPG.markFallen(team[k]); summary.push(`${team[k].character.name} полягає (відродіть у Храмі)`); }
        });
        const totalExp = result.enemies.reduce((sum, e) => sum + (e.exp || 0), 0);
        let gold = 0;
        for (const e of result.enemies) {
          const loot = RPG.rollLoot(e.id);
          RPG.applyReward(save, 0, loot);                // золото й речі — у спільний інвентар
          gold += loot.gold || 0;
          for (const it of loot.items) {
            if (it.refs) it.refs.forEach(ref => { const n = RPG.itemFullName(ref); summary.push(n); got[n] = (got[n] || 0) + 1; });
            else if (it.got) { const n = RPG.ITEMS[it.id].name; summary.push(`${n} ×${it.got}`); got[n] = (got[n] || 0) + it.got; }
            if (it.lost) { const n = RPG.ITEMS[it.id].name; lost[n] = (lost[n] || 0) + it.lost; }
            if (it.filtered) it.filtered.forEach(ref => { const n = RPG.itemFullName(ref); filtered[n] = (filtered[n] || 0) + 1; });
          }
          save.character.kills = (save.character.kills || 0) + 1;
          summary.push(...RPG.questOnKill(save, e.id).map(s => "Завдання: " + s));
          if (e.champion) {
            // Трофей чемпіона: одна річ (легендарна 5% → епічна 25% → магічна 50%)
            const drop = RPG.rollChampionDrop(e.id);
            if (drop && RPG.isFilteredOut(save, drop.r)) {
              const n = RPG.itemFullName(RPG.makeItem(drop.id, drop.r));
              filtered[n] = (filtered[n] || 0) + 1;
              summary.push(`Трофей чемпіона: ${n} — викинуто фільтром`);
            } else if (drop && !RPG.invFree(save)) {
              const n = RPG.itemFullName(RPG.makeItem(drop.id, drop.r));
              lost[n] = (lost[n] || 0) + 1;
              summary.push(`Трофей чемпіона: ${n} — пропав, інвентар повний!`);
            } else if (drop) {
              const ref = RPG.makeItem(drop.id, drop.r);
              save.inventory.push(ref);
              summary.push(`Трофей чемпіона: ${RPG.itemFullName(ref)}`);
              got[RPG.itemFullName(ref)] = (got[RPG.itemFullName(ref)] || 0) + 1;
            } else {
              summary.push("Трофей чемпіона: цього разу нічого");
            }
            const b = RPG.addChampionBounty(save, e.id);
            summary.push(`Гільдія авантюристів заплатить ${b.exp} EXP${group ? " кожному герою" : ""} (+ бонуси) і ${b.gold} золота (нагорода ×5)`);
          }
          // Мішечок на пояс: 1% з кожного переможеного боса, окремо від звичайної здобичі
          const pouch = RPG.rollPouchDrop?.(e.id);
          if (pouch) {
            const n = RPG.ITEMS[pouch].name;
            if (RPG.invFree(save)) {
              save.inventory.push({ id: pouch, qty: 1 });
              summary.push(`Рідкісний трофей боса: ${n}!`);
              got[n] = (got[n] || 0) + 1;
            } else {
              summary.push(`Рідкісний трофей боса: ${n} — пропав, інвентар повний!`);
              lost[n] = (lost[n] || 0) + 1;
            }
          }
        }
        // Досвід (рішення 2б): +10% за кожного героя групи понад першого,
        // і вся сума ділиться порівну між тими, хто вижив
        const survivors = team.filter((ms, k) => !result.heroes[k].dead);
        const spring = RPG.springExpMult(save);          // Джерело Велеса: ×3 до досвіду групи
        const orb = RPG.godsOrb(save);                     // Сфера Богів (предмет адміністратора): +800% досвіду
        const orbMult = orb ? 1 + orb.expPct / 100 : 1;
        const pool = Math.round(totalExp * (1 + 0.1 * (team.length - 1)) * spring * orbMult);
        const expEach = Math.floor(pool / Math.max(1, survivors.length));
        for (const ms of survivors) {
          const ups = RPG.addExp(ms, expEach);
          if (ups.length) levelLines.push(`${ms.character.name}: новий рівень ${ups[ups.length - 1]}!`);
        }
        const springTxt = (spring > 1 ? `, Джерело Велеса +${RPG.VELES.expBonusPct}%` : "") + (orb ? `, Сфера Богів +${orb.expPct}%` : "");
        summary.unshift(group
          ? `+${expEach} EXP кожному, хто вижив (усього ${pool}, бонус групи +${(team.length - 1) * 10}%${springTxt})`
          : `+${expEach} EXP${springTxt ? ` (${springTxt.slice(2)})` : ""}`);
        if (gold) summary.splice(1, 0, `+${gold} золота`);
        if (Object.keys(filtered).length) summary.push(`Фільтр викинув: ${Object.entries(filtered).map(([k, n]) => n > 1 ? `${k} ×${n}` : k).join(", ")}`);
        if (Object.keys(lost).length) summary.push(`Не вмістилось в інвентар: ${Object.entries(lost).map(([k, n]) => `${k} ×${n}`).join(", ")}`);
        battleGold = gold;
        battleExp = group ? expEach : totalExp;
        // «Обстеження» локації з данжем: шанс знайти ключ з кожного переможеного ворога
        const keys = RPG.rollKeyDrops(save, locId, result.enemyIds);
        if (keys.got) { summary.push(`${keys.name} ×${keys.got} — у кишеню для ключів!`); got[keys.name] = (got[keys.name] || 0) + keys.got; }
        if (keys.full) summary.push(`Кишеня для ключів: ${keys.name} — уже ${RPG.KEY_MAX}/${RPG.KEY_MAX}, нові не випадають, поки не використаєте хоча б один.`);
      } else if (!result.draw) {
        // Уся група загинула: штраф кожному, відродження в Храмі
        deaths = team.map(ms => ({ ms, d: RPG.applyDeath(ms, result.enemyIds) }));
        RPG.pray(save);   // ті, хто поліг раніше, теж прокидаються в Храмі
      }
      // Данж: перемога — наступний бій (або кінець), поразка чи втеча ворогів — данж провалено
      // Досвід володіння зброєю (data/skills.js → masteryGainFor / addMasteryExp): кожному живому герою за виграний бій
      const masteryLines = [];
      if (result.win) {
        const fmtM = v => (Math.round(v * 10) / 10).toString().replace(".", ",");
        team.forEach((ms, k) => {
          if (result.heroes[k].dead) return;
          const g = RPG.masteryGainFor(save, ms, foes);
          if (!g.type || !g.gain) return;
          const r = RPG.addMasteryExp(ms, g.type, g.gain);
          const wt = RPG.WEAPON_TYPES[g.type];
          const prog = r.need ? ` (рівень ${r.level}, ${fmtM(r.exp)}/${r.need}${r.capped ? " — межа" : ""})` : ` (рівень ${r.level} — найвищий)`;
          masteryLines.push(`${group ? ms.character.name + ": " : ""}${wt.mastery.toLowerCase()} +${fmtM(g.gain)}` +
            (g.parts.length ? ` [${g.parts.join(", ")}]` : "") + prog +
            (r.levelUps.length ? ` — новий рівень володіння ${r.levelUps.at(-1)}!` : ""));
        });
      }
      let dunNext = null;
      let chron = null;   // запис у книзі «Предки…» (перша перемога над босом данжу)
      if (dun) {
        if (result.win) dunNext = RPG.advanceDungeon(save);
        else RPG.leaveDungeon(save);
        if (result.win && dunNext.done && RPG.chronicleRecord) chron = RPG.chronicleRecord(save, dun.id, team, result);
      }
      if (!result.draw || result.win) fieldLootAdd(save, { win: result.win, exp: battleExp, gold: battleGold, items: got, lost, filtered });
      // Автозілля після бою (не після загибелі всієї групи; у данжі між боями не діє)
      const postPotion = deaths ? [] : runAutoPotion();

      // Підсумок бою (заголовок + рядки) — рахуємо одразу, щоб записати в журнал разом із ходом бою
      let outcome;
      if (deaths) {
        const lines = deaths.map(({ ms, d }) =>
          `${group ? ms.character.name + ": " : ""}штраф досвіду −${d.expPct}% (${fmtNum(d.expLost)} EXP)` +
          (d.levelDown ? `, рівень знижено до ${d.newLevel}${d.pointsLost ? ` (−${d.pointsLost} очок атрибутів)` : ""}` : "") +
          (d.lostItems.length ? `, втрачено: ${d.lostItems.map(ref => RPG.itemFullName(ref)).join(", ")}` : ""));
        lines.push(`${group ? "Уся група відродилася" : "Ви відродилися"} в Храмі з ${Math.round(RPG.RESPAWN_HP_PCT * 100)}% здоров'я і без мани.`);
        outcome = { title: group ? "Група загинула" : "Загибель", lines, state: "lose" };
      } else if (dun && result.win && !dunNext.done) {
        const lines = [`Бій ${dun.stage} з ${dun.stages} виграно. Нагороди за нього немає — лише за боса.`];
        if (summary.length) lines.push(summary.join(" · "));
        lines.push("Зілля й відновлення тут не діють — HP переходить у наступний бій як є (лікують лише навички).");
        outcome = { title: `Данж: бій ${dun.stage} з ${dun.stages} — перемога`, lines, state: "win" };
      } else if (result.win) {
        const lines = [summary.join(" · ")];
        for (const l of levelLines) lines.push(l + " Здоров'я та мана відновлені, є нові вільні очки атрибутів (сторінка «Персонаж»).");
        lines.push(`Переможено ворогів: ${save.character.kills}`);
        if (chron?.first) lines.push(`📜 У книзі «${RPG.CHRONICLE.TITLE}» з'явився новий запис` +
          (chron.chapterDone ? ` — «${chron.chapter.title}» завершено!` : ` («${chron.chapter.title}»).`) +
          " Попросіть Розпорядника Захара в Мерії показати книгу.");
        outcome = { title: dun ? `Данж «${dun.name}» пройдено!` : "Перемога!", lines, state: "win" };
      } else if (dun) {
        outcome = { title: foes.length > 1 ? "Вороги втекли — данж провалено" : "Ворог утік — данж провалено",
          lines: ["Ворота зачинилися. Нагороди немає, ключ використано."], state: "draw" };
      } else {
        outcome = { title: foes.length > 1 ? "Вороги втекли" : "Ворог утік", lines: ["Нагороди немає."], state: "draw" };
      }
      if (masteryLines.length) outcome.lines.push("Володіння: " + masteryLines.join("; "));
      outcome.lines.push(...prePotion, ...postPotion);
      const fightTitle = `${team.map(ms => ms.character.name).join(", ")} проти: ${foesText()}`;
      // Журнал бою (journal.js): увесь хід бою + підсумок; найстаріший запис понад 100 затирається
      liveEntry = RPG.journalAdd(save, { kind: "battle", lines: [
        ["title", fightTitle, "fight"], ...result.events.map(RPG.journalPack),
        ["title", outcome.title, outcome.state], ...outcome.lines.map(l => ["info", l])] });
      await RPG.saveGame(save).catch(e => console.error(e));

      // Показ бою (у вікні журналу цей бій з'являється рядок за рядком, без спойлера підсумку)
      const stepByStep = RPG.getSettings().battleView !== "result";
      liveLines = [];
      journalCtl?.refresh({ skip: liveEntry, live: liveLines });
      setArena(fightTitle, [], "fight");
      lastSnap = null;
      // Поле бою: розстановка цього бою, смужки — зі стану на початку
      renderField({ team, heroPos: result.heroPos, foePos: result.foePos, corner: result.corner, obstacles: result.obstacles, maxStats });
      fieldEvent(result.events[0], null, team, maxStats);
      if (stepByStep) {
        let prevEv = null;
        for (const ev of result.events) {
          addLogLine(ev);
          applyEventToBars(ev, team, maxStats);
          battleFx(ev, team);
          RPG.audio?.battleSound(ev);
          fieldEvent(ev, prevEv, team, maxStats);
          prevEv = ev;
          await sleep(ev.who === "info" ? 400 : 550);
        }
      } else {
        result.events.forEach(addLogLine);
        applyEventToBars(result.events[result.events.length - 1], team, maxStats);
        fieldEvent(result.events[result.events.length - 1], null, team, maxStats);
      }

      // Підсумок: коротка мелодія, далі знову музика локації
      if (RPG.audio) {
        if (deaths) RPG.audio.jingle("defeat");
        else if (result.win && levelLines.length) RPG.audio.jingle("levelup");
        else if (result.win) RPG.audio.jingle("victory");
      }
      // Бій показано — у журналі тепер повний запис (з підсумком)
      liveLines = liveEntry = null;
      journalCtl?.refresh({ skip: null, live: null });
      setArena(outcome.title, outcome.lines, outcome.state);
      if (deaths) {
        const wake = el("li", "log-action");
        wake.append(link("Прокинутися в Храмі", "game.html"));
        logBox.append(wake);
        logBox.scrollTop = logBox.scrollHeight;
        document.body.classList.remove("is-fighting");
        fighting = false;
        drawHero();
        renderQuickSlots();
        startBtn.disabled = rerollBtn.disabled = true;   // бій звідси вже неможливий
        saveBtn.disabled = false;
        return;
      }

      // Наступні суперники
      nextEnemy();
      renderMode();
      const nextDun = dungeonOn() ? RPG.activeDungeon(save) : null;
      addLogLine({ who: "info", text: nextDun
        ? `Далі — бій ${nextDun.stage} з ${nextDun.stages}: ${foesText()}.`
        : mode === "dungeon" ? `Щоб повторити данж, потрібен новий ключ. Бос: ${foesText()}.`
        : `Далі на вас чекає: ${foesText()}.` + (anyChampion() ? " Серед них рідкісний ЧЕМПІОН!" : "") });
      renderEnemy();

      renderAll();
      setFighting(false);
      // Данж перейшов до бою з босом (або завершився) — після джингла грає відповідна тема
      if (RPG.audio && dun) setTimeout(playLocationMusic, 5500);
      if (!fighters().length) startBtn.disabled = true;
      // Герой досяг 12 рівня — підходить незнайомець зі сферою (квест «Долоні Велеса»)
      if (RPG.velesStrangerDue(save)) setTimeout(() => meetStranger(save).then(renderAll), 800);
      // Інвентар заповнився (або щось уже пропало) — окреме повідомлення, щоб не пропустити
      if (result.win && (Object.keys(lost).length || (freeBefore > 0 && !RPG.invFree(save)))) {
        showNotice("Інвентар заповнено!", [
          `Усі ${RPG.invSize(save)} клітинок інвентаря зайняті. Нові речі та ресурси, яким немає місця, пропадатимуть — ` +
          "доповнюються лише неповні стопки.",
          Object.keys(lost).length ? `Уже пропало: ${Object.entries(lost).map(([k, n]) => `${k} ×${n}`).join(", ")}.` : "",
          "Продайте зайве торговцю або покладіть у скриню в Домівці."
        ].filter(Boolean), "is-warn");
      }
    }

    // Не даємо піти зі сторінки посеред показу бою без попередження
    document.querySelectorAll("nav a, a.wf").forEach(a => {
      a.addEventListener("click", ev => {
        if (fighting && !confirm("Бій ще показується. Результат уже збережено. Вийти?")) { ev.preventDefault(); return; }
        // Вихід із локації посеред данжу — данж втрачено (dungeon.js скасує його на іншій локації)
        if (!fighting && RPG.activeDungeon(save) && a.getAttribute("href") === "maps.html" &&
            !confirm("Ви в данжі. Якщо підете з локації — данж буде втрачено разом із ключем. Піти?")) ev.preventDefault();
      });
    });

    // Журнал бою: останні 100 подій в окремому вікні (journal.js); під час бою — поточний бій наживо.
    // Кнопка є і в бойових локаціях (біля «Почати бій»), і в мирних (біля «Зберегти гру»)
    const openJournal = () => { journalCtl = RPG.openJournal(save, liveLines ? { skip: liveEntry, live: liveLines } : {}); };
    document.querySelectorAll(".journal-btn").forEach(b => b.addEventListener("click", openJournal));
    // Коротка смужка стану (2 рядки) — клік відкриває повний журнал
    logBox.title = "Натисніть, щоб відкрити журнал бою";
    logBox.addEventListener("click", openJournal);
    const placeJournal = $("journal-btn-place");
    if (placeJournal) placeJournal.hidden = !!combat;

    saveBtn.addEventListener("click", async () => {
      try {
        await RPG.saveGame(save);
        showMsg(msg, `Гру збережено (${fmtDate(save.savedAt)}).`);
      } catch (e) {
        showMsg(msg, "Не вдалося зберегти: " + e.message, true);
      }
    });

    if (combat) {
      // Після прибуття на локацію перед першим боєм — вікно розстановки героїв
      startBtn.addEventListener("click", () => { if (fighting) return; if (placedHere()) startBattle(); else openFormation(startBattle); });
      $("formation-btn")?.addEventListener("click", () => { if (!fighting) openFormation(); });

      rerollBtn.addEventListener("click", () => {
        if (fighting || mode === "dungeon") return;
        nextEnemy();
        renderEnemy();
        showReady();
      });
      leaveBtn.addEventListener("click", async () => {
        if (fighting || !RPG.activeDungeon(save)) return;
        if (!confirm("Покинути данж? Ключ уже використано, прогрес буде втрачено.")) return;
        RPG.leaveDungeon(save);
        await RPG.saveGame(save);
        nextEnemy();
        renderMode();
        renderEnemy();
        showReady();
        showMsg(msg, "Ви покинули данж.");
      });
      renderMode();
      renderEnemy();
      showReady();
      if (!fighters().length) startBtn.disabled = true;
    }

    renderAll();
    // У мирних локаціях не перемальовуємо панель щосекунди — лише смужки героя
    startRegenTimer(save, () => { drawHero(); }, () => fighting);
  }

  // ============================================================
  // ПЕРСОНАЖ
  // ============================================================
  async function pageCharacter() {
    const save = await requireSave();
    if (!save) return;

    // Герой групи, якого зараз налаштовуємо (0 — головний). ms — його «вигляд» сейву:
    // своє спорядження й атрибути, а інвентар, скриня й золото — спільні.
    let memberIndex = 0;
    let ms = save;
    function pickMember(i) {
      memberIndex = i;
      ms = RPG.memberSave(save, i);
      if (typeof selected !== "undefined") selected = null;
      render();
    }
    function renderMemberTabs() {
      memberTabs($("member-tabs"), save, memberIndex, pickMember);
      
    }

    const DERIVED = ["hp", "mp", "attack", "magic", "defense", "magicDefense", "speed",
                     "crit", "dodge", "blockPhys", "blockMag", "hpRegen", "mpRegen", "attackSpeedPct"];

    // ---------- Карусель «Атрибути / Характеристики / Розвиток» ----------
    const CAROUSEL_KEY = "rpg.charPage";
    let carouselPage = 0;
    try { carouselPage = Number(localStorage.getItem(CAROUSEL_KEY)) || 0; } catch (e) { /* без сховища */ }
    function showCarousel(i) {
      const pages = document.querySelectorAll("#carousel-track .carousel-page");
      if (!pages.length) return;
      carouselPage = (i + pages.length) % pages.length;
      $("carousel-track").style.transform = `translateX(-${carouselPage * 100}%)`;
      pages.forEach((p, k) => { p.setAttribute("aria-hidden", k !== carouselPage ? "true" : "false"); p.inert = k !== carouselPage; });
      $("carousel-title").textContent = pages[carouselPage].dataset.title;
      document.querySelectorAll(".carousel-dot").forEach((d, k) => {
        d.classList.toggle("is-active", k === carouselPage);
        d.setAttribute("aria-selected", k === carouselPage ? "true" : "false");
      });
      try { localStorage.setItem(CAROUSEL_KEY, String(carouselPage)); } catch (e) { /* без сховища */ }
      fitCarousel();
    }
    // Висота вікна — за поточною сторінкою (без порожнього місця під короткими)
    function fitCarousel() {
      const page = document.querySelectorAll("#carousel-track .carousel-page")[carouselPage];
      const view = document.querySelector("#char-carousel .carousel-view");
      if (page && view) view.style.height = page.offsetHeight + "px";
    }
    window.addEventListener("resize", () => fitCarousel());
    (function setupCarousel() {
      const box = $("char-carousel");
      if (!box) return;
      box.querySelectorAll(".carousel-arrow").forEach(b => b.addEventListener("click", () => showCarousel(carouselPage + Number(b.dataset.step))));
      box.querySelectorAll(".carousel-dot").forEach(b => b.addEventListener("click", () => showCarousel(Number(b.dataset.page))));
      // Гортання пальцем на телефоні/планшеті
      let x0 = null, y0 = 0;
      const view = box.querySelector(".carousel-view");
      view.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      view.addEventListener("touchend", e => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) showCarousel(carouselPage + (dx < 0 ? 1 : -1));
      });
      showCarousel(carouselPage);
    })();

    // ---------- Журнал квестів (спільний для групи) ----------
    function renderQuestLog() {
      const box = $("quest-log");
      if (!box) return;
      box.innerHTML = "";
      const log = RPG.questLog(save);
      if (!log.length) {
        box.append(el("p", "status keep", "Розпочатих квестів немає. Завдання дає Артеміда, адміністратор гільдії — Дубова Застава, Південний район."));
        return;
      }
      for (const q of log) {
        const item = el("div", "quest-entry" + (q.ready ? " is-ready" : "") + (q.special ? " is-special" : ""));
        item.append(el("strong", "quest-entry-title", q.title));
        for (const line of q.lines) item.append(el("span", "quest-entry-line", line));
        item.append(el("span", "quest-entry-where", (q.ready ? "✔ Готово — здати: " : "Здати: ") + q.where));
        box.append(item);
      }
    }

    // ---------- Підказки «i» для атрибутів і характеристик ----------
    // Що робить характеристика в бою / поза боєм
    const STAT_HELP = {
      hp: "Скільки шкоди герой витримає. Коли здоров'я падає до 0 — герой полягає.",
      mp: "Запас мани для навичок і заклинань.",
      attack: "Сила фізичних ударів зброєю і фізичних навичок.",
      magic: "Сила заклинань і магічних навичок.",
      defense: "Зменшує фізичну шкоду, яку отримує герой.",
      magicDefense: "Зменшує магічну шкоду, яку отримує герой.",
      speed: "Як часто герой ходить у бою.",
      crit: "Шанс завдати посиленого (критичного) удару.",
      dodge: "Шанс повністю ухилитися від фізичного удару.",
      blockPhys: "Шанс заблокувати половину фізичної шкоди.",
      blockMag: "Шанс заблокувати половину магічної шкоди.",
      hpRegen: "Скільки здоров'я відновлюється з часом поза боєм (у Домівці — швидше).",
      mpRegen: "Скільки мани відновлюється з часом поза боєм (у Домівці — швидше).",
      attackSpeedPct: "Бонус володіння зброєю до швидкості."
    };
    const PASSIVE_KEYS = { hp: "hpPct", mp: "mpPct", attack: "attackPct", magic: "magicPct", defense: "defensePct",
                           magicDefense: "magicDefensePct", speed: "speedPct", crit: "crit", dodge: "dodge" };
    const num1 = v => fmtNum(Math.round(v * 10) / 10);
    const signed = v => (v < 0 ? "−" : "+") + num1(Math.abs(v));

    // Від чого взагалі може залежати характеристика (загальний перелік джерел)
    function statSources(key, cls) {
      const out = [];
      if (cls.baseStats?.[key] || cls.growth?.[key]) out.push("професії та рівня");
      const eff = RPG.ATTR_EFFECTS[key];
      const attrs = eff ? [...Object.keys(eff.per || {}), ...(eff.soft || [])] : [];
      if (attrs.length) out.push(attrs.map(a => RPG.ATTRS[a]).join(", "));
      if (key !== "attackSpeedPct") out.push("бонусів речей");
      if (Object.values(RPG.MASTERY_BONUS || {}).some(b => key in b)) out.push("володіння зброєю (Тренер)");
      const pk = PASSIVE_KEYS[key];
      if (pk && Object.values(RPG.SKILLS || {}).some(sk => sk.kind === "passive" && sk.effects && pk in sk.effects)) out.push("пасивних навичок");
      if (Object.values(RPG.ITEM_SETS || {}).some(set => key in (set.bonusPct || {}))) out.push("комплектів речей");
      return out;
    }

    // Кнопка «i» з підказкою (наведення — попередній перегляд, клік / дотик — закріпити)
    function infoButton(label, build) {
      const b = el("button", "info-tip stat-i");
      b.type = "button";
      b.setAttribute("aria-label", label + " — детальніше");
      b.append(el("span", "info-i", "i"));
      RPG.bindTip(b, build, null);
      return b;
    }

    // Підказка атрибута: власне (рівні + вкладені очки) окремо від речей, і на що впливає
    function attrInfo(key, total) {
      const ch = ms.character;
      const fromLevels = RPG.levelAttrs(ms)[key] || 0;
      const invested = ch.attrs[key] || 0;
      const items = [];
      for (const slot in ms.equipment) {
        const v = RPG.itemStats(ms.equipment[slot])[key];
        if (v) items.push([RPG.itemFullName(ms.equipment[slot]), v]);
      }
      const fromItems = items.reduce((sum, [, v]) => sum + v, 0);
      const box = el("div", "info-body stat-info");
      box.append(el("p", "stat-info-head", `${RPG.ATTRS[key]}: ${fmtNum(total[key])}`));
      const own = el("ul", "stat-parts");
      own.append(partRow(`Власна: ${fmtNum(fromLevels + invested)}`, null, "is-sum"));
      own.append(partRow("рівень", fromLevels));
      own.append(partRow("розподілені очки", invested));
      // Бонус від речей — лише якщо якісь вдягнені речі додають цей атрибут (і лише ці речі)
      if (items.length) {
        own.append(partRow(`Бонус від речей: ${signed(fromItems)}`, null, "is-sum"));
        for (const [name, v] of items) own.append(partRow(name, v));
      }
      box.append(own);
      box.append(el("p", "stat-info-sub", "Впливає на:"));
      const eff = el("ul", "stat-parts");
      for (const e of RPG.attrEffects(key, total)) {
        eff.append(partRow(RPG.STAT_NAMES[e.key], e.value, "", ["crit", "dodge", "blockPhys", "blockMag"].includes(e.key) ? "%" : ""));
      }
      box.append(eff);
      return box;
    }

    // Рядок розкладу: підпис і значення (зі знаком). value === null — без числа
    function partRow(label, value, cls = "", unit = "") {
      const li = el("li", cls);
      li.append(el("span", null, label));
      if (value !== null && value !== undefined) li.append(el("b", null, signed(value) + unit));
      return li;
    }

    // Підказка характеристики: що робить, з чого складається зараз, від чого залежить
    function statInfo(key, st, trace) {
      const pct = ["crit", "dodge", "blockPhys", "blockMag", "attackSpeedPct"].includes(key) ? "%" : "";
      const box = el("div", "info-body stat-info");
      box.append(el("p", "stat-info-head", `${RPG.STAT_NAMES[key]}: ${fmtStat(key, st[key] || 0)}`));
      box.append(el("p", null, STAT_HELP[key] || ""));
      // Округлення не показуємо — лише параметри, що впливають
      const parts = (trace[key] || []).filter(pt => pt.label !== "Округлення" && Math.abs(pt.value) >= 0.05);
      box.append(el("p", "stat-info-sub", "Складається з:"));
      const list = el("ul", "stat-parts");
      if (parts.length) for (const pt of parts) list.append(partRow(pt.label, pt.value, pt.value < 0 ? "is-neg" : "", pct));
      else list.append(partRow("поки нічого не дає", null, "is-empty"));
      box.append(list);
      const src = statSources(key, RPG.getClass(ms.character.classId));
      if (src.length) box.append(el("p", "note-src", "Залежить від: " + src.join("; ") + "."));
      return box;
    }

    function render() {
      renderMemberTabs();
      renderHeroBars(ms);
      renderQuestLog();
      requestAnimationFrame(fitCarousel);
      const st = RPG.calcStats(ms);
      const ch = ms.character;

      // Атрибути
      const attrBox = $("attrs-list");
      attrBox.innerHTML = "";
      const total = RPG.totalAttrs(ms);
      const cls = RPG.getClass(ch.classId);
      attrBox.append(el("p", ch.freePoints ? "status" : "note", ch.freePoints
        ? `Вільних очок: ${ch.freePoints}. Натисніть «+», щоб вкласти.`
        : `Вільних очок немає. За кожен новий рівень — ${RPG.POINTS_PER_LEVEL}.`));
      const autoTxt = RPG.describeAttrs(cls.levelAttrs);
      if (autoTxt) attrBox.append(el("p", "note", `${cls.name}: за кожен рівень автоматично ${autoTxt}.`));
      for (const key in RPG.ATTRS) {
        const row = el("div", "stat-row");
        // Лише загальна сума; з чого вона складається і на що впливає — у підказці «i»
        row.append(el("span", null, RPG.ATTRS[key]),
          infoButton(RPG.ATTRS[key], () => attrInfo(key, RPG.totalAttrs(ms))),
          el("strong", null, fmtNum(total[key])));
        if (ch.freePoints > 0) {
          const plus = button("+", "wf wf-button attr-plus", async () => {
            if (!RPG.addAttrPoint(ms, key)) return;
            await RPG.saveGame(save);
            render();
          });
          plus.title = `Додати очко: ${RPG.ATTRS[key]}`;
          row.append(plus);
        }
        attrBox.append(row);
      }

      // Бойові характеристики
      const list = $("stats-list");
      list.innerHTML = "";
      const trace = {};
      RPG.calcStats(ms, trace);
      for (const key of DERIVED) {
        const row = el("div", "stat-row");
        row.append(el("span", null, RPG.STAT_NAMES[key]),
          infoButton(RPG.STAT_NAMES[key], () => statInfo(key, st, trace)),
          el("strong", null, fmtStat(key, st[key] || 0)));
        list.append(row);
      }

      const info = $("char-info");
      info.innerHTML = "";
      const p = RPG.expProgress(ms);
      const infoRows = [
        ["Професія", RPG.getClass(ch.classId).name],
        ["Рівень", ch.level],
        ["Досвід", p.max ? `${fmtNum(p.exp)} (максимум)` : `${fmtNum(p.exp)} / ${fmtNum(p.nextLevelAt)}`],
        ["Весь здобутий досвід", fmtNum(ch.totalExp)],
        ["Золото", fmtNum(ch.gold)],
        ["Локація", RPG.getLocation(ms.location.map).name],
        ["Переможено ворогів", fmtNum(ch.kills || 0)],
        ["Загибелей", fmtNum(ch.deaths || 0)]
      ];
      for (const [k, v] of infoRows) {
        const row = el("div", "stat-row");
        row.append(el("span", null, k), el("strong", null, String(v)));
        info.append(row);
      }

      const slots = $("equip-slots");
      slots.innerHTML = "";
      for (const slot in RPG.SLOTS) {
        const ref = ms.equipment[slot];
        const item = RPG.ITEMS[RPG.refId(ref)];
        const cell = el("div", item ? slotClass(ref, "equip-cell") : "wf wf-slot equip-cell slot-empty");
        fillEquipCell(cell, ref, slot);
        if (item) RPG.bindTip(cell, () => itemInfo(ref, 1, ms), () => [
          { text: "Змінити в інвентарі", className: "wf-link", onClick: () => { location.href = "inventory.html"; } }
        ]);
        slots.append(cell);
      }

      // Володіння зброєю та вивчені навички
      const mBox = $("mastery-list");
      if (mBox) {
        mBox.innerHTML = "";
        const cap = RPG.masteryCap(ms);
        const wtype = RPG.weaponTypeOf(ms);
        for (const [t, wt] of Object.entries(RPG.WEAPON_TYPES)) {
          const pr = RPG.masteryProgress(ms, t);
          const row = el("div", "stat-row");
          row.append(el("span", null, wt.mastery + (t === wtype ? " (у руках)" : "")),
                     el("strong", null, `${pr.level} / ${cap}` + (pr.need ? ` · ${Math.floor(pr.exp)}/${pr.need}` : "")));
          row.title = pr.need ? `Досвід володіння: ${Math.floor(pr.exp)} з ${pr.need} до рівня ${pr.level + 1}. Росте за виграні бої.` : "Найвищий рівень володіння.";
          mBox.append(row);
        }
        const learned = Object.entries(ch.skills || {}).filter(([, l]) => l > 0);
        mBox.append(el("p", "note", learned.length
          ? "Навички: " + learned.map(([id, l]) => `${RPG.SKILLS[id]?.name || id} ${l}`).join(", ")
          : "Навичок ще немає. Тренер Брут — у Гільдії авантюристів (Дубова Застава, Південний район)."));
      }
    }

    render();
    startRegenTimer(save, () => renderHeroBars(ms));
  }

  // ============================================================
  // ІНВЕНТАР + СУНДУК
  // ============================================================
  async function pageInventory() {
    const save = await requireSave();
    if (!save) return;

    // Герой групи, якого зараз налаштовуємо (0 — головний). ms — його «вигляд» сейву:
    // своє спорядження й атрибути, а інвентар, скриня й золото — спільні.
    let memberIndex = 0;
    let ms = save;
    function pickMember(i) {
      memberIndex = i;
      ms = RPG.memberSave(save, i);
      if (typeof selected !== "undefined") selected = null;
      render();
    }
    function renderMemberTabs() {
      memberTabs($("member-tabs"), save, memberIndex, pickMember);
      const t = $("equip-title"); if (t) t.textContent = RPG.partySize(save) > 1 ? `Спорядження: ${ms.character.name}` : "Спорядження";
    }

    const msg = $("msg");
    // Дії з предметами — лише у спливаючому вікні. Кнопки створюються
    // «в пам'яті» (не на сторінці): вікно бере з них назву, стан і дію.
    const desc = el("div", "item-desc");
    const btnEquip = button("Вдягнути", "wf wf-button");
    const btnUnequip = button("Зняти", "wf wf-button");
    const btnUse = button("Використати", "wf wf-button");
    const btnDrop = button("Викинути", "wf wf-danger");
    const btnToChest = button("У скриню", "wf wf-secondary");
    const btnFromChest = button("Забрати зі скрині", "wf wf-secondary");
    // Частина стопки: вікно з кількістю (напр. 25 слизу з 200)
    const btnToChestPart = button("У скриню: частину…", "wf wf-secondary");
    const btnFromChestPart = button("Забрати частину…", "wf wf-secondary");
    // Скриня поточної локації (або основна — тоді її можна лише переглянути)
    // У власному домі зі складом — ще й скрині ремесла (вкладки над скринею)
    const storages = RPG.chestsHere(ms);
    const atHome = storages.length > 0;
    let viewChest = storages[0] || RPG.DEFAULT_CHEST;
    const chestOf = () => RPG.chestList(ms, viewChest);

    // selected: { kind: "inv", index } | { kind: "eq", slot } | { kind: "chest", index }
    let selected = null;

    function gridOf(list, minCells, kind, box) {
      box.innerHTML = "";
      const total = Math.max(minCells, list.length);
      for (let i = 0; i < total; i++) {
        const entry = list[i];
        if (!entry) { box.append(el("div", "wf wf-slot slot-empty", "")); continue; }
        const cell = fillItemCell(button("", slotClass(entry)), entry, entry.qty);
        cell.removeAttribute("title");
        cell.setAttribute("aria-label", itemLabel(entry));
        cell.dataset.key = kind + ":" + i;
        if (selected?.kind === kind && selected.index === i) cell.classList.add("is-selected");
        RPG.bindTip(cell, () => itemInfo(entry, entry.qty, ms), null,
          { onOpen: () => { pick({ kind, index: i }, cell.dataset.key); return false; } });
        box.append(cell);
      }
    }

    function render() {
      renderMemberTabs();
      const eq = $("equip-list");
      eq.innerHTML = "";
      for (const slot in RPG.SLOTS) {
        const ref = ms.equipment[slot];
        const item = RPG.ITEMS[RPG.refId(ref)];
        const cell = button("", item ? slotClass(ref, "equip-cell") : "wf wf-slot equip-cell slot-empty");
        fillEquipCell(cell, ref, slot);
        if (selected?.kind === "eq" && selected.slot === slot) cell.classList.add("is-selected");
        cell.dataset.key = "eq:" + slot;
        if (item) {
          RPG.bindTip(cell, () => itemInfo(ref, 1, ms), null,
            { onOpen: () => { pick({ kind: "eq", slot }, cell.dataset.key); return false; } });
        } else {
          cell.addEventListener("click", () => { selected = null; RPG.popover.hide(); render(); });
        }
        eq.append(cell);
      }

      gridOf(ms.inventory, RPG.invSize(ms), "inv", $("item-grid"));
      const conf = RPG.chestConf(viewChest);
      const chest = chestOf();
      $("chest-title").textContent = conf.name;
      const cc = RPG.parseCraftChest(viewChest);
      $("chest-note").textContent = `Клітинок: ${chest.length}/${conf.size} · ` + (cc
        ? `${RPG.CRAFT_CHEST_ALLOW_TEXT[cc.type]}${cc.type === "item" ? "" : `, до ${fmtNum(RPG.CRAFT_CHESTS[cc.type].stack)} шт. в клітинці`}. Скриня ремесла цього дому.`
        : atHome
        ? `Матеріали — до ${fmtNum(conf.stack.material)} шт., зілля — до ${fmtNum(conf.stack.consumable)} шт. в клітинці. Речі тут не зникають навіть після загибелі. Ця скриня спільна для Домівки й усіх ваших домів.`
        : `Скриня стоїть тут: ${RPG.chestPlaces(viewChest).join(", ") || "Домівка"} — звідси її можна лише переглянути.`);
      renderChestTabs();
      $("chest-note").classList.toggle("is-full", chest.length >= conf.size);
      gridOf(chest, conf.size, "chest", $("chest-grid"));

      $("gold").textContent = `Клітинок: ${ms.inventory.length}/${RPG.invSize(ms)} · Золото: ${fmtNum(ms.character.gold)}`;
      const beltBtn = $("belt-btn");
      if (beltBtn) {
        const bonus = RPG.beltBonus(ms);
        beltBtn.title = `Пояс: мішечки (+${bonus} комірок)`;
        beltBtn.classList.toggle("is-on", bonus > 0);
        beltBtn.onclick = () => showBelt();
      }
      const pocketBtn = $("key-pocket-btn");
      if (pocketBtn) pocketBtn.onclick = () => showKeyPocket(save);
      const filterBtn = $("loot-filter-btn");
      renderFilterBtn(filterBtn, save);
      if (filterBtn) filterBtn.onclick = () => showLootFilter(save, () => renderFilterBtn(filterBtn, save));
      $("gold").classList.toggle("is-full", !RPG.invFree(ms));
      renderDesc();
    }

    // Вкладки сховищ (спільна скриня + скрині ремесла складу) і «Розкласти все»
    function renderChestTabs() {
      const box = $("chest-tabs");
      if (!box) return;
      box.innerHTML = "";
      box.hidden = storages.length < 2;
      if (box.hidden) return;
      for (const sid of storages) {
        const conf = RPG.chestConf(sid);
        const used = RPG.chestList(ms, sid).length;
        box.append(button(`${conf.name} · ${used}/${conf.size}`, "wf " + (sid === viewChest ? "wf-button" : "wf-link") + " chest-tab",
          () => { viewChest = sid; selected = null; RPG.popover.hide(); render(); }));
      }
      if (storages.some(sid => ["mat", "pot"].includes(RPG.parseCraftChest(sid)?.type))) {
        box.append(button("Розкласти все", "wf wf-secondary chest-tab", async () => {
          const r = RPG.sortToCraftChests(ms);
          selected = null;
          await commit(r.moved ? `Розкладено по скринях ремесла: ${fmtNum(r.moved)} шт. матеріалів і зілля.` : "Нічого розкладати: матеріалів і зілля в інвентарі немає або скрині повні.", !r.moved);
        }));
      }
    }

    // Клік по предмету: виділити його і показати вікно з описом та діями.
    // Повторний клік по тому ж предмету — закрити вікно.
    let openKey = null;
    function pick(sel, key) {
      const popOpen = document.querySelector(".popover:not([hidden]):not(.is-preview)");
      if (popOpen && openKey === key) { RPG.popover.hide(); openKey = null; return; }
      selected = sel;
      render();
      const cell = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
      const ref = selectedRef();
      if (!cell || !ref) return;
      const box = itemInfo(ref, ref.qty || 1, ms);
      const diff = desc.querySelector(".item-diff");
      if (diff) box.append(diff.cloneNode(true));
      RPG.popover.show(cell, box, { actions: invActions() });
      openKey = key;
    }

    // Кнопки дій у вікні — дублюють активні кнопки під інвентарем
    function invActions() {
      return [
        [btnEquip, "wf-button"], [btnUnequip, "wf-button"], [btnUse, "wf-button"],
        [btnToChest, "wf-secondary"], [btnToChestPart, "wf-secondary"], [btnFromChest, "wf-secondary"], [btnFromChestPart, "wf-secondary"],
        [btnDrop, "wf-danger"]
      ].filter(([b]) => !b.disabled)
        .map(([b, cls]) => ({ text: b.textContent, className: cls, onClick: () => { openKey = null; b.click(); } }));
    }

    // Обраний запис: екземпляр речі (з рідкістю) або стопка
    function selectedRef() {
      if (!selected) return null;
      if (selected.kind === "eq") return ms.equipment[selected.slot] || null;
      if (selected.kind === "chest") return chestOf()[selected.index] || null;
      return ms.inventory[selected.index] || null;
    }

    function selectedItemId() {
      return RPG.refId(selectedRef()) || null;
    }

    function renderDesc() {
      const id = selectedItemId();
      desc.innerHTML = "";
      for (const b of [btnEquip, btnUnequip, btnUse, btnDrop, btnToChest, btnFromChest, btnToChestPart, btnFromChestPart]) b.disabled = true;
      btnToChest.title = btnFromChest.title = atHome ? "" : "Доступно лише біля скрині";
      if (!id) {
        desc.append(el("div", null, "Оберіть предмет, щоб побачити опис."));
        return;
      }
      const ref = selectedRef();
      const item = RPG.ITEMS[id];
      desc.append(itemInfo(ref, ref.qty || 1, ms));

      if (selected.kind === "inv" && item.slot) {
        const diff = RPG.previewEquip(ms, selected.index);
        const txt = Object.entries(diff).map(([k, v]) => `${RPG.STAT_NAMES[k] || k} ${v > 0 ? "+" : ""}${v}`).join(", ");
        desc.append(el("div", "item-diff", "Якщо вдягнути: " + (txt || "без змін")));
        const check = RPG.canEquip(ms, id);
        btnEquip.disabled = !check.ok;
        btnEquip.title = check.ok ? "" : check.reason;
      }
      if (selected.kind === "eq") btnUnequip.disabled = false;
      if (selected.kind === "inv" && item.type === "consumable") btnUse.disabled = false;
      if (selected.kind === "inv") btnDrop.disabled = !!RPG.ITEMS[ms.inventory[selected.index]?.id]?.locked;   // Сфера Богів не викидається
      if (selected.kind === "inv" && atHome) btnToChest.disabled = false;
      if (selected.kind === "chest" && atHome) btnFromChest.disabled = false;
      const isStack = !ref.r && item.stackable && (ref.qty || 1) > 1;
      if (isStack && selected.kind === "inv" && atHome) btnToChestPart.disabled = false;
      if (isStack && selected.kind === "chest" && atHome) btnFromChestPart.disabled = false;
    }

    // Пояс: 5 слотів для мішечків (character.js → putOnBelt / takeFromBelt). Порожній слот — вибрати мішечок з інвентаря.
    function showBelt() {
      document.querySelector(".belt-dialog")?.remove();
      const dlg = el("dialog", "notice-dialog belt-dialog");
      let pick = null, note = null;
      const draw = () => {
        dlg.innerHTML = "";
        const close = button("×", "notice-close", () => dlg.close());
        close.setAttribute("aria-label", "Закрити пояс");
        dlg.append(close, el("h3", null, "Пояс"));
        dlg.append(el("p", "belt-sum", `Інвентар: ${RPG.invSize(ms)} комірок (36 + ${RPG.beltBonus(ms)} від мішечків) · зайнято ${ms.inventory.length}`));
        if (note) dlg.append(el("p", "forge-result" + (note.error ? " is-error" : ""), note.text));
        const slots = el("div", "belt-slots");
        RPG.beltOf(ms).forEach((id, i) => {
          const cell = button("", "wf wf-slot belt-slot" + (id ? " is-filled" : "") + (pick === i ? " is-pick" : ""), () => {
            if (id) {
              const r = RPG.takeFromBelt(ms, i);
              note = { text: r.ok ? `Знято: ${RPG.ITEMS[r.id].name}.` : r.reason, error: !r.ok };
              if (r.ok) RPG.saveGame(save).catch(e => console.error(e));
              pick = null;
            } else pick = pick === i ? null : i;
            draw();
          });
          if (id) {
            cell.append(el("span", "belt-name", RPG.ITEMS[id].name), el("b", "belt-bag", `+${RPG.ITEMS[id].bag}`));
            cell.title = `${RPG.ITEMS[id].name}: +${RPG.ITEMS[id].bag} комірок. Натисніть, щоб зняти.`;
          } else {
            cell.append(el("span", "belt-empty", "порожньо"));
            cell.title = "Порожній слот — натисніть і виберіть мішечок";
          }
          slots.append(cell);
        });
        dlg.append(slots);
        if (pick !== null) {
          const pouches = ms.inventory.map((e, idx) => ({ e, idx })).filter(x => RPG.ITEMS[x.e.id]?.type === "pouch");
          const box = el("div", "stack belt-pick");
          box.append(el("strong", null, `Слот ${pick + 1}: виберіть мішечок`));
          if (!pouches.length) box.append(el("p", "house-soon", "В інвентарі немає мішечків. Їх можна вибити з босів — шанс 1% з кожного переможеного боса."));
          for (const { e, idx } of pouches) {
            box.append(button(`${RPG.ITEMS[e.id].name} · +${RPG.ITEMS[e.id].bag} комірок`, "wf wf-button", () => {
              const r = RPG.putOnBelt(ms, idx, pick);
              note = { text: r.ok ? `На поясі: ${RPG.ITEMS[r.id].name} (+${RPG.ITEMS[r.id].bag} комірок).` : r.reason, error: !r.ok };
              if (r.ok) { RPG.saveGame(save).catch(e => console.error(e)); pick = null; }
              draw();
            }));
          }
          dlg.append(box);
        } else dlg.append(el("p", "note", "Натисніть порожній слот, щоб повісити мішечок з інвентаря, або зайнятий — щоб зняти його."));
      };
      dlg.addEventListener("close", () => { dlg.remove(); selected = null; RPG.popover.hide(); render(); });
      document.body.append(dlg);
      draw();
      dlg.showModal();
    }

    // Вікно «Скільки перекласти?»: число + швидкі кнопки. Повертає Promise<кількість | null>
    function askQty(title, max) {
      return new Promise(resolve => {
        const dlg = el("dialog", "notice-dialog qty-dialog");
        let done = false;
        const finish = v => { if (done) return; done = true; resolve(v); dlg.close(); };
        const close = button("×", "notice-close", () => finish(null));
        close.setAttribute("aria-label", "Скасувати");
        dlg.append(close, el("h3", null, title));
        const label = el("label", "field", `Кількість (є ${fmtNum(max)})`);
        const input = el("input");
        Object.assign(input, { type: "number", min: 1, max, step: 1, value: Math.min(max, Math.max(1, Math.floor(max / 2))), inputMode: "numeric" });
        label.append(input);
        dlg.append(label);
        const quick = el("div", "row qty-quick");
        for (const [t, v] of [["1", 1], ["10", 10], ["25", 25], ["100", 100], ["½", Math.floor(max / 2)], ["Усе", max]]) {
          if (v < 1 || v > max) continue;
          quick.append(button(t, "wf wf-link", () => { input.value = v; input.focus(); }));
        }
        dlg.append(quick);
        const ok = button("Перекласти", "wf wf-button", () => {
          const n = Math.floor(Number(input.value));
          if (!(n >= 1)) { input.focus(); return; }
          finish(Math.min(n, max));
        });
        input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); ok.click(); } });
        const row = el("div", "row");
        row.append(ok, button("Скасувати", "wf wf-secondary", () => finish(null)));
        dlg.append(row);
        dlg.addEventListener("close", () => { if (!done) { done = true; resolve(null); } dlg.remove(); });
        document.body.append(dlg);
        dlg.showModal();
        input.select();
      });
    }

    async function commit(text, isError) {
      if (!isError) await RPG.saveGame(save);
      showMsg(msg, text, isError);
      render();
    }

    btnEquip.addEventListener("click", async () => {
      const ref = selectedRef();
      const slot = RPG.equipSlotFor(ms, ref.id);
      const old = ms.equipment[slot];
      if (old && !confirm(`Замінити «${RPG.itemFullName(old)}» на «${RPG.itemFullName(ref)}»?`)) return;
      const r = RPG.equipItem(ms, selected.index);
      selected = r.ok ? { kind: "eq", slot } : selected;
      const extra = r.ok && r.removed?.length ? ` Знято з лівої руки: ${r.removed.map(x => RPG.itemFullName(x)).join(", ")}.` : "";
      await commit(r.ok ? `Вдягнено: ${RPG.itemFullName(ref)}.${extra}` : r.reason, !r.ok);
    });

    btnUnequip.addEventListener("click", async () => {
      const r = RPG.unequipItem(ms, selected.slot);
      selected = null;
      await commit(r.ok ? `Знято: ${RPG.itemFullName(r.ref)}` : r.reason, !r.ok);
    });

    btnUse.addEventListener("click", async () => {
      const id = selectedItemId();
      const r = RPG.useItem(ms, id);
      if (!ms.inventory[selected.index] || ms.inventory[selected.index].id !== id) selected = null;
      await commit(r.ok ? useResultText(RPG.ITEMS[id], r) : r.reason, !r.ok);
    });

    btnDrop.addEventListener("click", async () => {
      const entry = ms.inventory[selected.index];
      const item = RPG.ITEMS[entry.id];
      if (item?.locked) { await commit(`«${item.name}» — предмет адміністратора, його не можна викинути.`, true); return; }
      if (!confirm(`Викинути «${RPG.itemFullName(entry)}»${entry.qty > 1 ? ` ×${entry.qty}` : ""}?`)) return;
      ms.inventory.splice(selected.index, 1);
      selected = null;
      await commit(`Викинуто: ${item.name}`);
    });

    btnToChest.addEventListener("click", async () => {
      const r = RPG.moveToChest(ms, selected.index, viewChest);
      selected = null;
      await commit(r.ok ? `У скриню: ${RPG.ITEMS[r.id].name}${r.qty > 1 ? ` ×${r.qty}` : ""}` +
        (r.left ? `. Не влізло ${r.left} шт. — скриня повна.` : "") : r.reason, !r.ok);
    });

    btnToChestPart.addEventListener("click", async () => {
      const entry = ms.inventory[selected?.index];
      if (!entry) return;
      const n = await askQty(`У скриню: ${RPG.ITEMS[entry.id].name}`, entry.qty);
      if (!n) return;
      const r = RPG.moveToChest(ms, selected.index, viewChest, n);
      selected = null;
      await commit(r.ok ? `У скриню: ${RPG.ITEMS[r.id].name} ×${r.qty}` +
        (r.left ? `. Не влізло ${r.left} шт. — скриня повна.` : "") : r.reason, !r.ok);
    });

    btnFromChestPart.addEventListener("click", async () => {
      const entry = chestOf()[selected?.index];
      if (!entry) return;
      const n = await askQty(`Забрати: ${RPG.ITEMS[entry.id].name}`, entry.qty);
      if (!n) return;
      const r = RPG.takeFromChest(ms, selected.index, viewChest, n);
      selected = null;
      await commit(r.ok ? `Забрано зі скрині: ${RPG.ITEMS[r.id].name} ×${r.qty}` +
        (r.left ? `. Не влізло ${r.left} шт. — інвентар повний.` : "") : r.reason, !r.ok);
    });

    btnFromChest.addEventListener("click", async () => {
      const r = RPG.takeFromChest(ms, selected.index, viewChest);
      selected = null;
      await commit(r.ok ? `Забрано зі скрині: ${RPG.ITEMS[r.id].name}${r.qty > 1 ? ` ×${r.qty}` : ""}` +
        (r.left ? `. У скрині лишилось ${r.left} шт. — інвентар повний.` : "") : r.reason, !r.ok);
    });

    render();
  }

  // ============================================================
  // МАПА: три частини світу (data/routes.js → MAP_REGIONS), переміщення з часом (travel.js)
  // ============================================================
  const TYPE_LABEL = { home: "Безпечно", temple: "Безпечно", tavern: "Торговець", city: "Гільдія", combat: "Бої", gate: "Брама", citygate: "Вхід у Дубову Заставу" };
  // Порядок місць у списку під мапою
  const REGION_ORDER = {
    start: ["home", "temple", "village_start", "tavern", "south_gate", "forest_path", "forest_cave"],
    city: ["south", "center", "trade", "rest", "north"],
    dark: ["dark_gate", "dk_edge", "dk_marsh", "dk_grave", "dk_webs", "dk_ravine", "dk_ruins", "dk_heart"]
  };
  // Зони кліку (x, y — центр; w, h — розмір у % мапи). Стартова мапа — за картинками будівель (map_layout.js):
  // Дубова Застава на ній — це вхід south_gate («Південний район»).
  const CITY_ZONES = {                       // під картинку city_map.webp (з Town_1.png)
    south:  { x: 50.0, y: 79.0, w: 56, h: 28 },
    center: { x: 50.0, y: 51.0, w: 32, h: 28 },
    north:  { x: 50.0, y: 20.0, w: 56, h: 30 },
    trade:  { x: 16.5, y: 50.0, w: 32, h: 36 },
    rest:   { x: 83.0, y: 51.0, w: 32, h: 36 }
  };
  const DARK_ZONES = {                       // під картинку map_dark_forest.webp
    dark_gate: { x: 48.5, y: 78.0, w: 14.0, h: 18.0 },
    dk_edge:   { x: 24.0, y: 64.0, w: 12.0, h: 14.0 },
    dk_marsh:  { x: 13.0, y: 43.0, w: 15.0, h: 15.0 },
    dk_grave:  { x: 31.0, y: 25.0, w: 14.0, h: 16.0 },
    dk_webs:   { x: 70.0, y: 40.0, w: 16.0, h: 16.0 },
    dk_ravine: { x: 91.0, y: 67.0, w: 12.0, h: 16.0 },
    dk_ruins:  { x: 91.0, y: 11.0, w: 9.0,  h: 16.0 },
    dk_heart:  { x: 55.5, y: 9.5,  w: 14.0, h: 16.0 }
  };
  function startZones() {
    const b = (RPG.MAP_LAYOUT && RPG.MAP_LAYOUT.buildings) || {};
    const z = {};
    for (const id of REGION_ORDER.start) z[id] = b[id === "south_gate" ? "city" : id];
    return z;
  }

  // Фігурка героя (SVG)
  const HERO_FIGURE = `<svg viewBox="0 0 24 40" aria-hidden="true">
    <circle cx="12" cy="6" r="5" fill="#f4d3a6" stroke="#3a2a14" stroke-width="1.2"/>
    <path d="M6 13 h12 l2 13 h-4 l-1 13 h-3 l-0.5 -9 h-1 l-0.5 9 h-3 l-1 -13 h-4 z" fill="#2f6fd6" stroke="#10213f" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M7 15 l-4 9" stroke="#f4d3a6" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M17 15 l3 6 l1 -7" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round" fill="none"/>
  </svg>`;

  async function pageMaps() {
    const save = await requireSave();
    if (!save) return;
    const grid = $("loc-list");
    const details = $("loc-details");
    const mapBox = $("world-map");
    const t0 = RPG.travelState(save);
    const here = RPG.whereIs(save);
    const region = t0 ? t0.region : here.region;
    const R = RPG.MAP_REGIONS[region];
    const ZONES = region === "city" ? CITY_ZONES : region === "dark" ? DARK_ZONES : startZones();
    const districts = RPG.LOCATIONS.city.districts || [];
    const ids = REGION_ORDER[region].filter(id => ZONES[id] && R.spots[id]);
    let selected = t0 ? t0.to : here.spot;
    let travelTimer = null;
    // Музика мапи: регіон світу; на мапі Дубової Застави — тема району, куди йде (або де стоїть) герой
    RPG.audio?.scene({ screen: "map", region, district: region === "city" ? selected : null });

    // Опис місця регіону: { name, desc, loc? (LOCATIONS), district? }
    function place(id) {
      if (region === "city") {
        const d = districts.find(x => x.id === id);
        return { name: d.name, desc: `${d.building}. ${d.description}`, district: d, typeLabel: d.building };
      }
      const loc = RPG.LOCATIONS[id];
      return { name: loc.name, desc: loc.description, loc, typeLabel: TYPE_LABEL[loc.type] + (loc.minLevel ? ` · від ${loc.minLevel} рів.` : "") };
    }

    // here | open | closed | road (поки герой у дорозі)
    function placeState(id) {
      const tr = RPG.travelState(save);
      if (tr) return tr.to === id ? { kind: "here", text: "Сюди прямуєте" } : { kind: "closed", text: "Ви в дорозі" };
      if (here.spot === id) return { kind: "here", text: "Ви тут" };
      const can = RPG.canGo(save, region, id);
      if (!can.ok) return { kind: "closed", text: can.reason };
      const r = RPG.route(region, here.spot, id);
      if (!r) return { kind: "closed", text: "Туди немає дороги." };
      return { kind: "open", text: `Час у дорозі: ${RPG.fmtLeft(RPG.travelSeconds(r.cells, region, save) * 1000)}`, cells: r.cells };
    }

    function shortText(s, n = 130) {
      return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
    }

    // ---------- Картинка мапи ----------
    const h2 = mapBox.closest(".panel")?.querySelector("h2");
    if (h2) {
      h2.textContent = `Мапа: ${R.name}`;
      // Короткий опис регіону під заголовком (data/routes.js → MAP_REGIONS[…].desc)
      let sub = h2.nextElementSibling;
      if (!sub || !sub.classList.contains("map-desc")) {
        sub = el("p", "note map-desc", "");
        h2.after(sub);
      }
      sub.textContent = R.desc ? `(${R.desc})` : "";
      sub.hidden = !R.desc;
    }
    const img = mapBox.querySelector(".map-img");
    img.src = RPG.asset(R.image);
    img.width = R.w; img.height = R.h;
    img.alt = `Мапа: ${R.name}`;
    mapBox.classList.add("region-" + region);
    if (region === "start" && RPG.MAP_LAYOUT) {
      const layer = el("div", "map-buildings");
      for (const [id, b] of Object.entries(RPG.MAP_LAYOUT.buildings || {})) {
        const bi = el("img", "map-building");
        bi.src = RPG.asset(`assets/images/map/bld_${id}.webp`);
        bi.alt = "";
        Object.assign(bi.style, { left: b.x + "%", top: b.y + "%", width: b.w + "%", height: b.h + "%" });
        layer.append(bi);
      }
      img.after(layer);
    }
    // Лінія маршруту (видно під час дороги)
    const pathLayer = el("div", "map-route");
    img.after(pathLayer);

    let tip = null, hero = null, timerTag = null;
    for (const id of ids) {
      const pos = ZONES[id], p = place(id);
      const spot = button("", "map-spot" + (region === "city" ? " map-district" : ""));
      spot.dataset.loc = id;
      Object.assign(spot.style, { left: pos.x + "%", top: pos.y + "%", width: pos.w + "%", height: pos.h + "%" });
      spot.setAttribute("aria-label", p.name);
      spot.addEventListener("mouseenter", () => showTip(id));
      spot.addEventListener("focus", () => showTip(id));
      spot.addEventListener("mouseleave", restTip);
      spot.addEventListener("blur", restTip);
      spot.addEventListener("click", () => { selected = id; render(); });
      spot.addEventListener("dblclick", () => go(id));
      mapBox.append(spot);
    }
    tip = el("div", "map-tip");
    tip.hidden = true;
    mapBox.append(tip);
    hero = el("div", "map-hero");
    hero.innerHTML = HERO_FIGURE;
    hero.append(el("span", "hero-tag", save.character.name));
    timerTag = el("span", "hero-timer");
    timerTag.hidden = true;
    hero.append(timerTag);
    mapBox.append(hero);

    function setHero(x, y) {
      hero.style.left = x + "%";
      hero.style.top = y + "%";
    }

    function showTip(id) {
      mapBox.querySelectorAll(".map-spot").forEach(s => {
        s.classList.toggle("is-selected", s.dataset.loc === selected);
        const st = placeState(s.dataset.loc);
        s.classList.toggle("is-closed", st.kind === "closed");
      });
      const pos = ZONES[id];
      if (!pos) { tip.hidden = true; return; }
      const p = place(id), st = placeState(id);
      tip.innerHTML = "";
      tip.append(el("strong", null, p.name), el("div", `tip-status tip-${st.kind}`, st.text),
                 el("div", "tip-desc", shortText(p.desc)));
      let below = pos.y < 45;
      tip.style.left = Math.min(82, Math.max(18, pos.x)) + "%";
      tip.style.top = (below ? pos.y + pos.h / 2 : pos.y - pos.h / 2) + "%";
      tip.style.transform = "";
      tip.classList.toggle("tip-below", below);
      tip.hidden = false;
      // Маленька мапа (телефон): підказка не повинна вилазити за край — міряємо й зсуваємо
      const mh = mapBox.clientHeight, th = tip.offsetHeight, gap = 6;
      if (mh > 40 && th) {
        const topPx = (pos.y - pos.h / 2) / 100 * mh, botPx = (pos.y + pos.h / 2) / 100 * mh;
        const fitsAbove = topPx - th - gap >= 0, fitsBelow = botPx + gap + th <= mh;
        if (below && !fitsBelow && fitsAbove) below = false;
        else if (!below && !fitsAbove && fitsBelow) below = true;
        const y = Math.max(0, Math.min(mh - th, below ? botPx + gap : topPx - th - gap));
        tip.style.top = y + "px";
        const mw = mapBox.clientWidth, tw = tip.offsetWidth;
        tip.style.left = Math.max(tw / 2, Math.min(mw - tw / 2, pos.x / 100 * mw)) + "px";
        tip.style.transform = "translateX(-50%)";
      }
    }

    // ---------- Дорога ----------
    function drawRoute(pts) {
      const line = pts.map(p => p.join(",")).join(" ");
      pathLayer.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${line}"/></svg>`;
    }

    function tick() {
      const tr = RPG.travelState(save);
      if (!tr) return;
      setHero(tr.pos.x, tr.pos.y);
      timerTag.textContent = RPG.fmtLeft(tr.leftMs);
      if (tr.leftMs > 0) return;
      clearInterval(travelTimer);
      RPG.finishTravel(save);
      RPG.saveGame(save).then(() => { location.href = "game.html"; });
    }

    function followTravel() {
      const tr = RPG.travelState(save);
      if (!tr) return;
      document.body.classList.add("is-traveling");
      lockNavForTravel();
      drawRoute(tr.pts);
      hero.classList.add("is-walking", "on-road");
      hero.classList.add("no-anim");
      setHero(tr.pos.x, tr.pos.y);
      void hero.offsetWidth;
      hero.classList.remove("no-anim");
      timerTag.hidden = false;
      tick();
      travelTimer = setInterval(tick, 250);
    }

    async function go(id) {
      if (RPG.isTraveling(save)) return;
      const can = RPG.canGo(save, region, id);
      if (can.ok && RPG.route(region, here.spot, id) && save.fieldLoot) await showFieldLoot(save);   // здобич поля бою — перед дорогою
      const r = RPG.startTravel(save, id);
      if (!r.ok) { selected = id; render(); showMsg($("map-msg"), r.reason, true); return; }
      await RPG.saveGame(save);
      selected = id;
      render();
      followTravel();
    }

    // ---------- Список місць і опис ----------
    // Без наведення: підказка обраного місця (у дорозі — схована, щоб не закривати фігурку)
    function restTip() {
      showTip(selected);
      if (RPG.isTraveling(save)) tip.hidden = true;
    }

    function render() {
      restTip();
      grid.innerHTML = "";
      for (const id of ids) {
        const p = place(id), st = placeState(id);
        const cell = button("", "wf loc-card " + (st.kind === "closed" ? "wf-locked" : "wf-link"));
        cell.append(el("strong", null, p.name));
        cell.append(el("span", "loc-desc", st.kind === "open" ? p.typeLabel
          : st.kind === "closed" && !RPG.isTraveling(save) ? "Закрито" : st.text));
        if (selected === id) cell.classList.add("is-selected");
        if (st.kind === "closed") cell.setAttribute("aria-disabled", "true");
        cell.addEventListener("click", () => { selected = id; render(); });
        grid.append(cell);
      }
      renderDetails();
    }

    function renderDetails() {
      const p = place(selected), st = placeState(selected);
      details.innerHTML = "";
      const banner = el("div", "place-banner info-anchor");
      banner.style.setProperty("--loc-img", locImage(region === "city" ? "city" : selected));
      banner.append(el("h2", null, p.name));
      details.append(banner);
      details.append(el("p", "note", p.desc));
      if (p.loc && p.loc.type === "combat") {
        const enemies = (p.loc.enemies || []).map(e => `${RPG.getEnemy(e).name} (рів. ${RPG.getEnemy(e).level})` +
          (p.loc.dungeon && RPG.ENEMIES[e]?.boss ? ` — лише в данжі «${RPG.DUNGEONS[p.loc.dungeon].name}»` : "")).join(", ");
        details.append(el("p", "note", "Вороги: " + enemies));
      }
      const tr = RPG.travelState(save);
      if (tr) {
        details.append(el("p", "status", `Ви в дорозі до «${place(tr.to).name}». Переміщення не скасувати — дочекайтеся прибуття.`));
        return;
      }
      if (st.kind === "here") {
        details.append(link("Ви тут — відкрити локацію", "game.html"));
        if (region === "city" && selected === "south") {
          details.append(button("Вийти з Дубової Застави", "wf wf-secondary", async () => {
            RPG.leaveCityToStart(save);
            await RPG.saveGame(save);
            location.reload();
          }));
        }
        return;
      }
      if (st.kind === "open") {
        details.append(button(`Вирушити · ${RPG.fmtLeft(RPG.travelSeconds(st.cells, region, save) * 1000)}`, "wf wf-button", () => go(selected)));
        details.append(el("p", "note", "Переміщення не можна скасувати; у дорозі доступні лише «Персонаж», «Інвентар» і «Мапа»."));
      } else {
        details.append(el("p", "status", st.text));
      }
    }

    if (t0) {
      followTravel();
    } else {
      const s = R.spots[here.spot] || R.spots[ids[0]];
      hero.classList.add("no-anim");
      setHero(s.x, s.y);
    }
    render();
  }

  // ---------- Запуск ----------
  const PAGES = {
    "new-game": pageNewGame,
    "load": pageLoad,
    "settings": pageSettings,
    "game": pageGame,
    "character": pageCharacter,
    "inventory": pageInventory,
    "maps": pageMaps
  };

  // Картинка професії завантажилась пізніше за сторінку — перемалювати героя
  document.addEventListener("rpg:hero-sprite", () => {
    const img = document.getElementById("hero-img");
    if (img && img._save) renderHeroDoll(img, img._save);
  });

  // Музика сторінок без власної логіки звуку (Локація й Мапа обирають трек самі)
  async function pageMusic(page) {
    const A = RPG.audio;
    if (!A) return;
    if (page === "new-game" || page === "load") { A.play("menu"); return; }
    if (page === "settings") {
      const from = new URLSearchParams(location.search).get("from");
      if (!from || from === "index") A.play("menu"); else A.resume();
      return;
    }
    if (page === "character" || page === "inventory") {
      if (A.resume()) return;
      const save = await RPG.loadCurrentGame().catch(() => null);
      if (!save) return;
      const here = RPG.whereIs(save);
      if (RPG.isCombatLocation(save.location.map)) A.scene({ screen: "combat", location: save.location.map, region: here.region });
      else if (here.region === "city") A.scene({ screen: "city", district: here.spot });
      else A.scene({ screen: "map", region: here.region });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    pageMusic(page).catch(() => {});
    if (PAGES[page]) {
      Promise.resolve(PAGES[page]()).catch(e => console.error("[game]", e));
    }
  });

  Object.assign(RPG, { setBar });
})(window.RPG);
