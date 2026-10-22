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
      if (RPG.applyRegenAll(save) || fixed) await RPG.saveGame(save);
      return save;
    } catch (e) {
      console.error(e);
      showNoGame();
      return null;
    }
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
    return RPG.hasRarity(RPG.refId(ref)) ? " rt-" + RPG.rarityOf(ref) : "";
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
  }

  // Смужка HP / MP для невеликих рядків (напарники, вороги групою)
  function miniBar(cls, name, id) {
    const bar = el("div", `bar ${cls} bar-mini`);
    bar.dataset.name = name;
    if (id) bar.id = id;
    bar.append(el("div", "bar-fill"), el("span", "bar-label", name));
    return bar;
  }

  // Напарники під головним героєм (сторінка локації): ім'я, рівень, HP / MP
  function renderPartyList(save) {
    const box = $("party-list");
    if (!box) return;
    const members = RPG.partyMembers(save).slice(1);
    box.innerHTML = "";
    box.hidden = !members.length;
    if (!members.length) return;
    box.append(el("div", "party-title", `Група: ${members.length + 1} / ${RPG.MAX_PARTY}`));
    members.forEach((ms, k) => {
      const i = k + 1;
      const st = RPG.calcStats(ms);
      const dead = RPG.isMemberDead(ms);
      const row = el("div", "party-row" + (dead ? " is-dead" : ""));
      const face = el("span", "party-face");
      Object.assign(face.style, RPG.heroSpriteStyle(ms.character.classId));
      const info = el("div", "party-info");
      info.append(el("strong", null, `${ms.character.name} · рів. ${ms.character.level}${dead ? " · полеглий" : ""}`));
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
        (grace ? ` · Молитва благодаті: ще ${Math.ceil(grace / 60000)} хв (+2% HP за 5 с, +3% MP за 10 с)` : "");
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
    return `url("${RPG.asset("assets/images/locations/loc_" + id + ".webp")}")`;
  }

  // ---------- Опис предмета для спливаючого вікна та інвентаря ----------
  const TYPE_NAMES = {
    weapon: "Зброя", armor: "Броня", accessory: "Прикраса", consumable: "Зілля",
    material: "Матеріал", offhand: "Ліва рука", shield: "Щит"
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
    const name = RPG.hasRarity(id) ? rarityName(ref) : el("strong", item.rarity === "rare" ? "rt-epic" : null, item.name);
    name.classList.add("tip-name");
    title.append(name);
    const sub = [TYPE_NAMES[item.type] || "Предмет"];
    if (RPG.hasRarity(id)) sub.push(RARITY_NAMES[RPG.rarityOf(ref)] || "");
    else if (item.rarity === "rare") sub.push("рідкісне");
    if (qty > 1) sub.push(`×${fmtNum(qty)}`);
    title.append(el("span", "tip-sub", sub.filter(Boolean).join(" · ")));
    head.append(title);
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

    box.append(el("div", "tip-price",
      `Ціна: ${fmtNum(item.price || 0)} зол. · продаж: ${fmtNum(RPG.refSellPrice(ref))} зол.` +
      (item.noShop ? (item.tier === 3 ? " · продає лише Торгова гільдія" : " · не продається") : "")));
    return box;
  }

  // ============================================================
  // НОВА ГРА
  // ============================================================
  function pageNewGame() {
    const form = $("new-game-form");
    const msg = $("msg");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) { showMsg(msg, "Введіть ім'я персонажа.", true); return; }
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const save = RPG.createNewSave(name);
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

    const volume = $("volume");
    const volumeValue = $("volume-value");
    if (volume) {
      volume.value = settings.volume;
      volumeValue.textContent = settings.volume + "%";
      volume.addEventListener("input", () => { volumeValue.textContent = volume.value + "%"; });
      volume.addEventListener("change", () => {
        RPG.setSettings({ volume: Number(volume.value) });
        showMsg(msg, "Налаштування збережено.");
      });
    }

    const exportBtn = $("export-btn");
    const current = await RPG.loadCurrentGame().catch(() => null);
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

    // Перехід з мапи: game.html?loc=village_start
    const locParam = new URLSearchParams(location.search).get("loc");
    let enterError = null;
    if (locParam && RPG.LOCATIONS[locParam] && save.location.map !== locParam) {
      const can = RPG.canEnterLocation(locParam, save.character.level, save);
      if (can.ok) {
        save.location.map = locParam;
        await RPG.saveGame(save);
      } else {
        enterError = can.reason;
      }
    }
    const locId = save.location.map;
    const locData = RPG.getLocation(locId);
    $("location-name").textContent = locData.name;
    $("location-desc").textContent = locData.description;
    // Фон локації (assets/images/locations/loc_<id>.webp) — за портретами та в банері.
    // Якщо картинки ще немає, лишається фон теми.
    document.body.style.setProperty("--loc-img", locImage(locId));
    document.body.dataset.loc = locId;

    const combat = RPG.isCombatLocation(locId);
    $("enemy-col").hidden = !combat;
    $("combat-ui").hidden = !combat;
    $("place-panel").hidden = combat;
    document.querySelector(".battle").classList.toggle("no-enemy", !combat);

    let fighting = false;
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
        const use = async () => {
          if (fighting) return;
          const r = RPG.useItem(save, entry.id);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          showMsg(msg, useResultText(item, r));
          await RPG.saveGame(save);
          renderAll();
        };
        if (usable) {
          cell.classList.add("slot-usable");
          cell.addEventListener("dblclick", () => { RPG.popover.hide(); use(); });
        } else {
          cell.classList.add("slot-passive");
        }
        RPG.bindTip(cell, () => itemInfo(entry, entry.qty, save), () => [
          usable && { text: "Використати", className: "wf-button", onClick: use },
          { text: "Інвентар", className: "wf-link", onClick: () => { location.href = "inventory.html"; } }
        ]);
        box.append(cell);
      }
      $("gold").textContent = `Золото: ${fmtNum(save.character.gold)}`;
    }

    // ---------- Мирні локації ----------
    const place = $("place-panel");

    function renderPlace() {
      place.innerHTML = "";
      const banner = el("div", "place-banner info-anchor");
      banner.append(el("h2", null, locData.name));
      place.append(banner);
      if (locData.type === "home") renderHome();
      else if (locData.type === "temple") renderTemple();
      else if (locData.type === "tavern") renderTavern();
      else if (locData.type === "city") renderCity();
      else if (locData.type === "gate") renderDarkGate();
    }

    function renderHome() {
      const per = RPG.regenPerTick(save);
      place.append(el("p", "note", "Тут битися заборонено — монстри сюди не заходять."));
      place.append(el("p", "note",
        `Відпочинок: додатково +${Math.round(RPG.HOME_REGEN_PCT * 100)}% здоров'я та мани кожні 10 секунд ` +
        `понад звичайне відновлення. Зараз: +${per.hp.toFixed(1)} HP і +${per.mp.toFixed(1)} MP за 10 с.`));
      const used = save.chest.length;
      place.append(el("p", "note", `Скриня: ${used ? `${used} клітинок зайнято` : "порожній"}. Речі в скрині не зникають, навіть якщо герой загине.`));
      const row = el("div", "row");
      row.append(link("Інвентар і скриня", "inventory.html"), link("Вирушити (Мапа)", "maps.html"));
      place.append(row);
    }

    // Темний ліс: зворотний бік Центральної брами
    function renderDarkGate() {
      place.append(el("p", "note", locData.description));
      place.append(el("p", "note", "Тут не б'ються. Звідси — дороги до всіх місць Темного лісу (Мапа) або назад у Місто крізь браму."));
      const row = el("div", "row");
      row.append(link("Повернутися в Місто", "game.html?loc=city&district=north"), link("Мапа Темного лісу", "maps.html"));
      place.append(row);
    }

    function renderTemple() {
      place.append(el("p", "note",
        `Сюди повертаються загиблі. Відроджені мають ${Math.round(RPG.RESPAWN_HP_PCT * 100)}% здоров'я та 0% мани — ` +
        "відновіться зіллям або вирушайте відпочити в Домівку."));
      renderNpc(place, "nun");
      const row = el("div", "row");
      row.append(link("До Домівки", "game.html?loc=home"), link("Мапа", "maps.html"));
      place.append(row);
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
        return { text: `Капітан віддає наказ відчинити браму. «Ти з наших. Темний ліс чекає.» +${fmtNum(RPG.GATE.reward.exp)} досвіду` +
          (r.levelUps.length ? `, новий рівень: ${r.levelUps.at(-1)}!` : ".") };
      },
      async gate_go() {
        location.href = "game.html?loc=dark_gate";
        return { text: "Брама відчиняється…" };
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
            const out = await NPC_ACTIONS[r.action]();
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
      row.append(link("До Домівки", "game.html?loc=home"), link("Мапа", "maps.html"));
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

    // ---------- Місто: райони та Гільдія авантюристів ----------
    // Центральний район відкривається після особливого завдання «Час дослідити»
    const districtLocked = d => !RPG.isDistrictOpen(save, d);
    const districtParam = new URLSearchParams(location.search).get("district");
    let cityDistrict = "south";     // обраний район (Південний відкритий)
    {
      const d = (locData.districts || []).find(x => x.id === districtParam);
      if (d && !districtLocked(d)) cityDistrict = d.id;
    }
    let guildNpc = "admin";         // admin | trader | trainer
    let trainMember = 0;            // кого навчає Тренер (герой групи)

    function renderCity() {
      place.append(el("p", "note", locData.description));
      const grid = el("div", "district-grid");
      for (const d of locData.districts || []) {
        const locked = districtLocked(d);
        const card = button("", "wf loc-card " + (locked ? "wf-locked" : "wf-link"));
        card.append(el("strong", null, d.name), el("span", "loc-desc", locked ? "Закрито" : d.building));
        if (cityDistrict === d.id) card.classList.add("is-selected");
        card.addEventListener("click", () => { cityDistrict = d.id; renderPlace(); });
        grid.append(card);
      }
      place.append(grid);

      const d = (locData.districts || []).find(x => x.id === cityDistrict);
      if (d) {
        const box = el("div", "stack district");
        box.append(el("h3", null, `${d.name} — ${d.building}`), el("p", "note", d.description));
        if (districtLocked(d)) box.append(el("p", "status", RPG.districtLockText(d)));
        else if (d.id === "south") renderGuild(box);
        else if (d.id === "trade") renderTradeGuild(box);
        else if (d.id === "north") renderNpc(box, "captain");
        else if (d.id === "center") renderTownHall(box);
        place.append(box);
      }
      const row = el("div", "row");
      row.append(link("До Домівки", "game.html?loc=home"), link("Мапа", "maps.html"));
      place.append(row);
    }

    // --- Торговий район: Торгова гільдія, управляючий Скрудж ---
    function renderTradeGuild(box) {
      renderNpc(box, "scrooge");
      box.append(el("p", "note", `Скрудж продає речі 3 виду (з ${RPG.TRADE_MIN_LEVEL} рівня, для зброї — володіння 20) ` +
        `за ${RPG.TRADE_PRICE_MULT}× від їхньої вартості, а купує будь-що за ${Math.round(RPG.SHOP_BUY_RATE * 100)}%.`));
      renderShop(box, RPG.tradeStock(), { priceOf: RPG.tradePrice, buy: RPG.buyFromTrade, stock: true });
    }

    // --- Мерія: Дошка оголошень (найм у групу) ---
    let hallNpc = "board";     // board | steward
    function renderTownHall(box) {
      const stewardOpen = save.character.level >= RPG.STEWARD_MIN_LEVEL;
      if (stewardOpen) {
        const tabs = el("div", "row npc-tabs");
        for (const [id, name] of [["board", "Дошка оголошень"], ["steward", "Розпорядник Захар"]]) {
          tabs.append(button(name, "wf " + (hallNpc === id ? "wf-button" : "wf-link"), () => { hallNpc = id; renderPlace(); }));
        }
        box.append(tabs);
      } else hallNpc = "board";
      if (hallNpc === "steward") {
        if (npcCtx.member >= RPG.partySize(save)) npcCtx.member = 0;
        if (RPG.partySize(save) > 1) {
          const mt = el("div", "row member-tabs");
          memberTabs(mt, save, npcCtx.member, i => { npcCtx.member = i; npcResult.steward = null; renderPlace(); });
          box.append(mt);
        }
        renderNpc(box, "steward");
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
          (i === 0 ? " · головний герой" : "") + (dead ? " · полеглий" : "")));
        if (i > 0) {
          r.append(button("Відпустити", "wf wf-secondary", async () => {
            if (!confirm(`Відпустити ${ms.character.name}? Його речі перейдуть у спільний інвентар, внесок не повертається.`)) return;
            const res = RPG.dismissMember(save, i);
            await RPG.saveGame(save);
            showMsg(msg, res.ok ? `${res.name} покидає групу. Його речі — в інвентарі.` : res.reason, !res.ok);
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
      for (const [id, name] of [["admin", "Адміністратор Артеміда"], ["trader", "Торговець Тадеуш"], ["trainer", "Тренер Брут"]]) {
        tabs.append(button(name, "wf " + (guildNpc === id ? "wf-button" : "wf-link"), () => { guildNpc = id; renderPlace(); }));
      }
      box.append(tabs);
      const npc = el("div", "stack npc-panel");
      // Шапка з портретом (assets/images/npc/<файл>.webp; поки картинки немає — лише ім'я)
      const GUILD_NPC = { admin: ["npc_guild_admin", "Артеміда, адміністратор гільдії"],
                          trader: ["npc_guild_trader", "Тадеуш, торговець гільдії"],
                          trainer: ["npc_trainer", "Брут, тренер гільдії"] };
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
          `Тадеуш, торговець гільдії, продає зброю 1–2 виду, малі й середні зілля (за ${Math.round(RPG.SHOP_SELL_RATE * 100)}% вартості), ` +
          `а купує будь-що за ${Math.round(RPG.SHOP_BUY_RATE * 100)}%.`));
        renderShop(npc, RPG.GUILD_SHOP || []);
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
        `«Роботи вистачає — беріть до ${RPG.questMaxActive(save)} завдань одночасно.» Виконано завдань: ${qs.done}.`));

      if (qs.bounties.length) {
        box.append(el("h3", null, "Нагороди за чемпіонів"));
        for (const bounty of qs.bounties) {
          const r = el("div", "shop-row quest-row quest-done champion-row");
          const info = el("span", "shop-name", `Переможено чемпіона: ${bounty.name}`);
          info.append(el("small", null, ` · ${bounty.exp} EXP, ${bounty.gold} золота (×${RPG.CHAMPION.bountyMult})`));
          r.append(info, button("Отримати", "wf wf-button", async () => {
            const res = RPG.claimBounty(save, bounty.id);
            if (!res.ok) { showMsg(msg, res.reason, true); return; }
            await RPG.saveGame(save);
            showMsg(msg, `Нагорода за чемпіона: +${bounty.exp} EXP, +${bounty.gold} золота.` +
              (res.levelUps.length ? ` Новий рівень: ${res.levelUps[res.levelUps.length - 1]}!` : ""));
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
          await RPG.saveGame(save);
          showMsg(msg, `Завдання виконано! Нагорода: ${RPG.describeReward(quest.reward)}.` +
            (res.levelUps.length ? ` Новий рівень: ${res.levelUps[res.levelUps.length - 1]}!` : ""));
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
      const card = el("div", "stack explore-card");
      card.append(el("h3", null, `Особливе завдання: «${E.name}»`));
      if (info.done) {
        card.append(el("p", "note", E.finale));
        card.append(link("До Центрального району (Мерія)", "game.html?loc=city&district=center"));
      } else if (info.canStart) {
        card.append(el("p", "note", `«Ви вже досвідчений авантюрист. Час дослідити світ далі — але спершу допоможіть нам. ` +
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
          await RPG.saveGame(save);
          const up = r.levelUps.length ? ` Новий рівень: ${r.levelUps[r.levelUps.length - 1]}!` : "";
          showMsg(msg, r.finished
            ? `«${E.name}» виконано! Прохід до Центрального району відкритий — шукайте Дошку оголошень біля Мерії.${up}`
            : `Частину виконано! Нагорода: ${RPG.describeExploreReward(r.part)}.${up} Далі: ${E.parts[RPG.storyState(save).part - 1].title}.`);
          renderAll();
        });
        b.disabled = !info.complete;
        card.append(b);
      }
      box.append(card);
    }

    // --- Квест «Шлях професії» (з 15 рівня Селянина) ---
    function renderProfession(box) {
      const P = RPG.PROFESSION;
      const info = RPG.professionInfo(save);
      if (!info) {
        if (save.character.classId === RPG.DEFAULT_CLASS) {
          box.append(el("p", "note", `Квест «${P.name}» — зміна професії — Артеміда дає Селянину з ${RPG.PROFESSION_LEVEL} рівня.`));
        }
        return;
      }
      const card = el("div", "stack explore-card");
      card.append(el("h3", null, `Квест: «${P.name}»`));
      if (info.done) {
        card.append(el("p", null, `Ваша професія: ${RPG.getClass(save.character.classId).name}.`));
      } else if (info.canStart) {
        card.append(el("p", "note", "«Ти переріс селянське життя. Пройди два випробування — і я скажу, ким тобі судилося стати. " +
          "Яким шляхом ти підеш, залежить від того, що ти в собі розвивав.»"));
        card.append(button("Взяти квест", "wf wf-button", async () => {
          const r = RPG.startProfession(save);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, `Взято квест «${P.name}». Частина 1: ${P.parts[0].title}.`);
          renderAll();
        }));
      } else {
        card.append(el("p", null, `Частина ${info.index} з ${info.total}: ${info.part.title}`));
        card.append(el("p", "note", info.part.text));
        for (const pr of info.progress) {
          card.append(el("div", pr.have >= pr.need ? "rt-magic" : null, `${pr.label}: ${pr.have} / ${pr.need}`));
        }
        const last = info.index >= info.total;
        const b = button(last ? "Завершити й отримати професію" : "Здати частину", "wf wf-button", async () => {
          const r = RPG.turnInProfession(save);
          if (!r.ok) { showMsg(msg, r.reason, true); return; }
          await RPG.saveGame(save);
          showMsg(msg, r.finished
            ? `Ваша нова професія — ${RPG.getClass(r.classId).name}! ${RPG.getClass(r.classId).description} ` +
              `Рівень професії почався з 1, а бонуси Селянина лишилися. Тренер Брут навчить новим навичкам.`
            : `Частину виконано! Далі: ${P.parts[RPG.professionState(save).part - 1].title}.`);
          renderAll();
        });
        b.disabled = !info.complete;
        card.append(b);
      }
      box.append(card);
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
      const cap = RPG.masteryCap(tms.character.level);
      box.append(el("p", "note", "«Покажи, чим б'єшся, — і я навчу тебе володіти цим краще.» " +
        "Брут навчає лише тієї зброї, яка зараз у вас у правій руці."));
      box.append(el("p", "note",
        `Межа володіння зараз: ${cap}` + (cap < RPG.MASTERY_MAX ? " (з 10 рівня персонажа — 20)." : ".") +
        " Володіння 10 відкриває зброю 2 виду, 20 — 3 виду."));

      box.append(el("h3", null, "Володіння зброєю"));
      for (const [t, wt] of Object.entries(RPG.WEAPON_TYPES)) {
        const lvl = RPG.getMastery(tms, t);
        const r = el("div", "shop-row skill-row" + (t === type ? " is-current" : ""));
        const info = el("span", "shop-name", `${wt.mastery}: ${lvl}/${cap}` + (t === type ? " · у руках" : ""));
        info.append(el("small", null, lvl ? ` · ${masteryBonusText(t, lvl)}` : ` · на 20: ${masteryBonusText(t, RPG.MASTERY_MAX)}`));
        r.append(info);
        if (t === type) {
          const cost = RPG.masteryCost(lvl + 1);
          const b = button(lvl >= cap ? "Максимум" : `Тренувати (${fmtNum(cost)} зол.)`, "wf wf-button", async () => {
            const res = RPG.trainMastery(tms, t);
            if (!res.ok) { showMsg(msg, res.reason, true); return; }
            await RPG.saveGame(save);
            showMsg(msg, `${wt.mastery}: ${res.level} (−${fmtNum(res.cost)} золота).`);
            renderAll();
          });
          b.disabled = lvl >= cap || tms.character.gold < cost;
          r.append(b);
        }
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
    const arena = $("arena");
    let foes = [];              // вороги наступного бою: [{ id, champion }]
    let queueMember = 0;        // чию чергу дій налаштовуємо (0 — головний герой)
    const fighters = () => RPG.aliveMembers(save);
    // Від 1 до межі за середнім рівнем групи — випадково (RPG.enemyGroupCap)
    let champWarn = false;      // показати вікно-попередження про чемпіона
    function nextEnemy() {
      foes = RPG.rollEnemyGroup(locId, save.character.level, RPG.enemyGroupCap(fighters()));
      champWarn = foes.some(f => f.champion);
    }
    // Вікно «Увага, чемпіон!» — з'являється, коли серед ворогів є чемпіон
    function showChampionWarning() {
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
    }
    function curEnemy(i = 0) { return RPG.getEnemy(foes[i].id, foes[i].champion); }
    const anyChampion = () => foes.some(f => f.champion);
    if (combat) nextEnemy();

    // Ворог(и): великий портрет — перший; якщо їх кілька — список з HP / MP кожного
    function renderEnemy() {
      if (champWarn) { champWarn = false; setTimeout(showChampionWarning, 50); }
      const enemy = curEnemy(0);
      const champ = foes[0].champion;
      $("enemy-img").closest("figure").classList.toggle("is-champion", champ);
      $("enemy-col").classList.toggle("is-champion", anyChampion());
      Object.assign($("enemy-img").style, RPG.enemySpriteStyle(foes[0].id));
      $("enemy-img").setAttribute("aria-label", enemy.name);
      $("enemy-name").textContent = `${enemy.name} (рівень ${enemy.level})` + (foes.length > 1 ? ` + ще ${foes.length - 1}` : "");
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
        info.append(el("strong", null, `${e.name} · рів. ${e.level}${f.champion ? " · чемпіон" : ""}${e.boss ? " · бос" : ""}`));
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

    function renderQueue() {
      const box = $("queue");
      box.innerHTML = "";
      if (queueMember >= RPG.partySize(save)) queueMember = 0;
      const qms = RPG.memberSave(save, queueMember);
      memberTabs($("queue-member"), save, queueMember, i => { queueMember = i; renderQueue(); });
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
        box.append(sel);
      }
      const who = RPG.partySize(save) > 1 ? `${qms.character.name}: ` : "";
      $("weapon-info").textContent = who + (weaponItem
        ? `Зброя: ${RPG.itemFullName(weaponRef)} · дальність ${RPG.actionRange(weaponItem.weaponType, false)}${weaponItem.weaponType === "staff" ? " (заклинання — 2)" : ""}`
        : "Зброя: немає (бій кулаками)");
    }

    function renderAll() {
      renderHeroBars(save);
      renderQuickSlots();
      if (combat) renderQueue();
      else renderPlace();
    }

    function setArena(title, lines) {
      arena.innerHTML = "";
      arena.append(el("div", "arena-title", title));
      for (const line of lines || []) arena.append(el("div", "arena-line", line));
    }

    const foesText = () => foes.map((f, i) => { const e = curEnemy(i); return `${e.name} (рівень ${e.level})`; }).join(", ");

    function showReady() {
      const lvl = save.character.level;
      const strong = foes.some((f, i) => curEnemy(i).level >= lvl + 2);
      const lines = [`Попереду: ${foesText()}.${strong ? " Обережно: серед них є значно сильніші!" : ""}`];
      if (foes.length > 1) lines.push(`Ворогів: ${foes.length}, у вашій групі живих героїв: ${fighters().length}.`);
      if (anyChampion()) lines.push("Серед них рідкісний ЧЕМПІОН: утричі сильніший! За перемогу — трофей і нагорода ×5 у Гільдії авантюристів.");
      if (foes.some((f, i) => curEnemy(i).boss)) lines.push("Це БОС! Кожен третій свій хід він застосовує особливу навичку.");
      if (!fighters().length) lines.push("Усі герої групи полягли — помоліться за них у Храмі.");
      lines.push("Натисніть «Почати бій» або пошукайте іншого суперника.");
      setArena(anyChampion() ? "Чемпіон!" : "Готові до бою", lines);
      arena.dataset.state = anyChampion() ? "champion" : "ready";
    }

    // Рядок журналу: позначка «хто діє» + текст, числа виділені
    function addLogLine(ev) {
      const li = el("li", "log-" + ev.who + (ev.crit ? " log-crit" : "") + (ev.move ? " log-move" : "") + (ev.heal ? " log-heal" : ""));
      li.dataset.who = ev.who;
      li.append(el("span", "log-mark", ev.who === "round" ? "" : ev.move ? "➜" : ev.who === "hero" ? "⚔" : ev.who === "enemy" ? "✸" : "◆"));
      const text = el("span", "log-text");
      String(ev.text).split(/(\d+)/).forEach((part, i) => {
        if (!part) return;
        text.append(i % 2 ? el("b", "log-num", part) : document.createTextNode(part));
      });
      li.append(text);
      logBox.append(li);
      logBox.scrollTop = logBox.scrollHeight;
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
    }

    async function startBattle() {
      if (fighting) return;
      const team = fighters();
      if (!team.length) { showMsg(msg, "Усі герої групи полягли — помоліться за них у Храмі.", true); return; }
      setFighting(true);
      renderEnemy();
      logBox.innerHTML = "";

      const maxStats = team.map(ms => RPG.calcStats(ms));
      const result = RPG.simulatePartyBattle(team, foes);
      const group = team.length > 1;

      // Результат застосовуємо і зберігаємо ОДРАЗУ — щоб не можна було
      // уникнути поразки, просто закривши сторінку під час показу бою
      const summary = [];
      const levelLines = [];
      result.heroes.forEach((h, k) => { team[k].character.hp = h.hp; team[k].character.mp = h.mp; });
      let deaths = null;
      if (result.win) {
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
            if (it.refs) it.refs.forEach(ref => summary.push(RPG.itemFullName(ref)));
            else summary.push(`${RPG.ITEMS[it.id].name} ×${it.qty}`);
          }
          save.character.kills = (save.character.kills || 0) + 1;
          summary.push(...RPG.questOnKill(save, e.id).map(s => "Завдання: " + s));
          if (e.champion) {
            // Трофей чемпіона: одна річ (легендарна 5% → епічна 25% → магічна 50%)
            const drop = RPG.rollChampionDrop(e.id);
            if (drop) {
              const ref = RPG.makeItem(drop.id, drop.r);
              save.inventory.push(ref);
              summary.push(`Трофей чемпіона: ${RPG.itemFullName(ref)}`);
            } else {
              summary.push("Трофей чемпіона: цього разу нічого");
            }
            const b = RPG.addChampionBounty(save, e.id);
            summary.push(`Гільдія авантюристів заплатить ${b.exp} EXP і ${b.gold} золота (нагорода ×5)`);
          }
        }
        // Досвід (рішення 2б): +10% за кожного героя групи понад першого,
        // і вся сума ділиться порівну між тими, хто вижив
        const survivors = team.filter((ms, k) => !result.heroes[k].dead);
        const pool = Math.round(totalExp * (1 + 0.1 * (team.length - 1)));
        const expEach = Math.floor(pool / Math.max(1, survivors.length));
        for (const ms of survivors) {
          const ups = RPG.addExp(ms, expEach);
          if (ups.length) levelLines.push(`${ms.character.name}: новий рівень ${ups[ups.length - 1]}!`);
        }
        summary.unshift(group
          ? `+${expEach} EXP кожному, хто вижив (усього ${pool}, бонус групи +${(team.length - 1) * 10}%)`
          : `+${totalExp} EXP`);
        if (gold) summary.splice(1, 0, `+${gold} золота`);
      } else if (!result.draw) {
        // Уся група загинула: штраф кожному, відродження в Храмі
        deaths = team.map(ms => ({ ms, d: RPG.applyDeath(ms, result.enemyIds) }));
        RPG.pray(save);   // ті, хто поліг раніше, теж прокидаються в Храмі
      }
      await RPG.saveGame(save).catch(e => console.error(e));

      // Показ бою
      const stepByStep = RPG.getSettings().battleView !== "result";
      setArena(`${team.map(ms => ms.character.name).join(", ")} проти: ${foesText()}`, ["Бій триває…"]);
      arena.dataset.state = "fight";
      lastSnap = null;
      if (stepByStep) {
        for (const ev of result.events) {
          addLogLine(ev);
          applyEventToBars(ev, team, maxStats);
          battleFx(ev, team);
          await sleep(ev.who === "info" ? 400 : 550);
        }
      } else {
        result.events.forEach(addLogLine);
        applyEventToBars(result.events[result.events.length - 1], team, maxStats);
      }

      // Підсумок
      if (deaths) {
        const lines = deaths.map(({ ms, d }) =>
          `${group ? ms.character.name + ": " : ""}штраф досвіду −${d.expPct}% (${fmtNum(d.expLost)} EXP)` +
          (d.levelDown ? `, рівень знижено до ${d.newLevel}${d.pointsLost ? ` (−${d.pointsLost} очок атрибутів)` : ""}` : "") +
          (d.lostItems.length ? `, втрачено: ${d.lostItems.map(ref => RPG.itemFullName(ref)).join(", ")}` : ""));
        lines.push(`${group ? "Уся група відродилася" : "Ви відродилися"} в Храмі з ${Math.round(RPG.RESPAWN_HP_PCT * 100)}% здоров'я і без мани.`);
        setArena(group ? "Група загинула" : "Загибель", lines);
        arena.dataset.state = "lose";
        addLogLine({ who: "info", text: lines.join(" ") });
        arena.append(link("Прокинутися в Храмі", "game.html?loc=temple"));
        renderHeroBars(save);
        renderQuickSlots();
        document.body.classList.remove("is-fighting");
        fighting = false;
        startBtn.disabled = rerollBtn.disabled = true;   // бій звідси вже неможливий
        saveBtn.disabled = false;
        return;
      }

      if (result.win) {
        const lines = [summary.join(" · ")];
        for (const l of levelLines) lines.push(l + " Здоров'я та мана відновлені, є нові вільні очки атрибутів (сторінка «Персонаж»).");
        lines.push(`Переможено ворогів: ${save.character.kills}`);
        setArena("Перемога!", lines);
        arena.dataset.state = "win";
        addLogLine({ who: "info", text: "Нагорода: " + summary.join(", ") });
      } else {
        setArena(foes.length > 1 ? "Вороги втекли" : "Ворог утік", ["Нагороди немає."]);
        arena.dataset.state = "draw";
      }

      // Наступні суперники
      nextEnemy();
      arena.append(el("div", "arena-line", `Далі на вас чекає: ${foesText()}.` +
        (anyChampion() ? " Серед них рідкісний ЧЕМПІОН!" : "")));
      renderEnemy();

      renderAll();
      setFighting(false);
      if (!fighters().length) startBtn.disabled = true;
    }

    // Не даємо піти зі сторінки посеред показу бою без попередження
    document.querySelectorAll("nav a, a.wf").forEach(a => {
      a.addEventListener("click", ev => {
        if (fighting && !confirm("Бій ще показується. Результат уже збережено. Вийти?")) ev.preventDefault();
      });
    });

    saveBtn.addEventListener("click", async () => {
      try {
        await RPG.saveGame(save);
        showMsg(msg, `Гру збережено (${fmtDate(save.savedAt)}).`);
      } catch (e) {
        showMsg(msg, "Не вдалося зберегти: " + e.message, true);
      }
    });

    if (combat) {
      startBtn.addEventListener("click", startBattle);
      rerollBtn.addEventListener("click", () => {
        if (fighting) return;
        nextEnemy();
        renderEnemy();
        showReady();
      });
      renderEnemy();
      showReady();
      if (!fighters().length) startBtn.disabled = true;
    }

    renderAll();
    // У мирних локаціях не перемальовуємо панель щосекунди — лише смужки героя
    startRegenTimer(save, () => { renderHeroBars(save); }, () => fighting);
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
        box.append(el("p", "status keep", "Розпочатих квестів немає. Завдання дає Артеміда, адміністратор гільдії — Місто, Південний район."));
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
      const byLevel = RPG.levelAttrs(ms);
      const cls = RPG.getClass(ch.classId);
      attrBox.append(el("p", ch.freePoints ? "status" : "note", ch.freePoints
        ? `Вільних очок: ${ch.freePoints}. Натисніть «+», щоб вкласти.`
        : `Вільних очок немає. За кожен новий рівень — ${RPG.POINTS_PER_LEVEL}.`));
      const autoTxt = RPG.describeAttrs(cls.levelAttrs);
      if (autoTxt) attrBox.append(el("p", "note", `${cls.name}: за кожен рівень автоматично ${autoTxt}.`));
      for (const key in RPG.ATTRS) {
        const row = el("div", "stat-row");
        const fromLevels = byLevel[key] || 0;
        const fromItems = total[key] - (ch.attrs[key] || 0) - fromLevels;
        const extra = [];
        if (fromLevels) extra.push(`+${fromLevels} за рівні`);
        if (fromItems) extra.push(`+${fromItems} з речей`);
        const value = el("strong", null, String(total[key]) + (extra.length ? ` (${extra.join(", ")})` : ""));
        row.append(el("span", null, RPG.ATTRS[key]), value);
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
      for (const key of DERIVED) {
        const row = el("div", "stat-row");
        row.append(el("span", null, RPG.STAT_NAMES[key]), el("strong", null, fmtStat(key, st[key] || 0)));
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
        const cap = RPG.masteryCap(ch.level);
        const wtype = RPG.weaponTypeOf(ms);
        for (const [t, wt] of Object.entries(RPG.WEAPON_TYPES)) {
          const row = el("div", "stat-row");
          row.append(el("span", null, wt.mastery + (t === wtype ? " (у руках)" : "")),
                     el("strong", null, `${RPG.getMastery(ms, t)} / ${cap}`));
          mBox.append(row);
        }
        const learned = Object.entries(ch.skills || {}).filter(([, l]) => l > 0);
        mBox.append(el("p", "note", learned.length
          ? "Навички: " + learned.map(([id, l]) => `${RPG.SKILLS[id]?.name || id} ${l}`).join(", ")
          : "Навичок ще немає. Тренер Брут — у Гільдії авантюристів (Місто, Південний район)."));
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
    const atHome = RPG.isAtHome(ms);

    // selected: { kind: "inv", index } | { kind: "eq", slot } | { kind: "chest", index }
    let selected = null;

    function gridOf(list, minCells, kind, box) {
      box.innerHTML = "";
      const total = Math.max(minCells, Math.ceil(list.length / 12) * 12);
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

      gridOf(ms.inventory, 36, "inv", $("item-grid"));
      $("chest-note").textContent = atHome
        ? "Речі тут не зникають навіть після загибелі."
        : "Скриня стоїть у Домівці — тут її можна лише переглянути.";
      gridOf(ms.chest, 24, "chest", $("chest-grid"));

      $("gold").textContent = `Золото: ${fmtNum(ms.character.gold)}`;
      renderDesc();
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
        [btnToChest, "wf-secondary"], [btnFromChest, "wf-secondary"], [btnDrop, "wf-danger"]
      ].filter(([b]) => !b.disabled)
        .map(([b, cls]) => ({ text: b.textContent, className: cls, onClick: () => { openKey = null; b.click(); } }));
    }

    // Обраний запис: екземпляр речі (з рідкістю) або стопка
    function selectedRef() {
      if (!selected) return null;
      if (selected.kind === "eq") return ms.equipment[selected.slot] || null;
      if (selected.kind === "chest") return ms.chest[selected.index] || null;
      return ms.inventory[selected.index] || null;
    }

    function selectedItemId() {
      return RPG.refId(selectedRef()) || null;
    }

    function renderDesc() {
      const id = selectedItemId();
      desc.innerHTML = "";
      for (const b of [btnEquip, btnUnequip, btnUse, btnDrop, btnToChest, btnFromChest]) b.disabled = true;
      btnToChest.title = btnFromChest.title = atHome ? "" : "Доступно лише в Домівці";
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
      if (selected.kind === "inv") btnDrop.disabled = false;
      if (selected.kind === "inv" && atHome) btnToChest.disabled = false;
      if (selected.kind === "chest" && atHome) btnFromChest.disabled = false;
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
      if (!confirm(`Викинути «${RPG.itemFullName(entry)}»${entry.qty > 1 ? ` ×${entry.qty}` : ""}?`)) return;
      ms.inventory.splice(selected.index, 1);
      selected = null;
      await commit(`Викинуто: ${item.name}`);
    });

    btnToChest.addEventListener("click", async () => {
      const r = RPG.moveToChest(ms, selected.index);
      selected = null;
      await commit(r.ok ? `У скриню: ${RPG.ITEMS[r.id].name}${r.qty > 1 ? ` ×${r.qty}` : ""}` : r.reason, !r.ok);
    });

    btnFromChest.addEventListener("click", async () => {
      const r = RPG.takeFromChest(ms, selected.index);
      selected = null;
      await commit(r.ok ? `Забрано зі скрині: ${RPG.ITEMS[r.id].name}${r.qty > 1 ? ` ×${r.qty}` : ""}` : r.reason, !r.ok);
    });

    render();
  }

  // ============================================================
  // МАПА
  // ============================================================
  const LOCATION_ORDER = ["home", "temple", "village_start", "tavern", "city", "forest_path", "forest_cave"];
  const TYPE_LABEL = { home: "Безпечно", temple: "Безпечно", tavern: "Торговець", city: "Гільдія", combat: "Бої", gate: "Брама" };
  // ---------- Темний ліс (друга частина світу, region: "dark") ----------
  // Основа мапи: assets/images/map/map_dark_forest.webp (2048×1280). Поки її немає — темна заглушка з підписами місць.
  const DARK_ORDER = ["dark_gate", "dk_edge", "dk_marsh", "dk_grave", "dk_webs", "dk_ravine", "dk_ruins", "dk_heart"];
  const DARK_MAP_BASE = "assets/images/map/map_dark_forest.webp";
  const DARK_MAP = {
    dark_gate: { x: 50.0, y: 85.9, w: 12.0, h: 14.0 },
    dk_edge:   { x: 30.3, y: 70.3, w: 11.2, h: 14.8 },
    dk_marsh:  { x: 14.2, y: 47.7, w: 11.2, h: 14.8 },
    dk_grave:  { x: 36.1, y: 39.8, w: 11.2, h: 14.8 },
    dk_webs:   { x: 60.1, y: 54.7, w: 11.2, h: 14.8 },
    dk_ravine: { x: 82.0, y: 65.6, w: 11.2, h: 14.8 },
    dk_ruins:  { x: 78.1, y: 29.7, w: 11.2, h: 14.8 },
    dk_heart:  { x: 50.0, y: 13.3, w: 12.0, h: 15.0 }
  };

  // Зони локацій на картинці мапи (assets/images/map_world.*), у відсотках:
  // x, y — центр зони; w, h — ширина й висота. Нову локацію достатньо дописати сюди.
  // Мапу зібрано з map_full_1 + споруди (128x128, 160x128, Town_1) і стежки за маршрутом:
  // Домівка → розвилка → Храм / Ферма → Шинок → Лісова стежка → Печера; Ферма → Південний район;
  // з Північного району стежка йде за край мапи.
  const WORLD_MAP = {
    home:          { x: 9.46,  y: 78.63, w: 8.07,  h: 10.89 },
    temple:        { x: 15.01, y: 65.52, w: 6.81,  h: 12.9 },
    village_start: { x: 18.92, y: 45.87, w: 8.07,  h: 11.09 },
    tavern:        { x: 32.79, y: 46.88, w: 8.07,  h: 11.39 },
    city:          { x: 55.87, y: 35.49, w: 12.11, h: 12.44 },   // точка героя — біля Південного району
    forest_path:   { x: 48.87, y: 63.0,  w: 10.09, h: 11.59 },
    forest_cave:   { x: 91.11, y: 46.88, w: 10.09, h: 12.6 }
  };
  // Місто клікабельне по районах (id — як у LOCATIONS.city.districts)
  const CITY_MAP = {
    north:  { x: 55.87, y: 6.63,  w: 12.11, h: 11.41 },
    trade:  { x: 46.89, y: 21.32, w: 9.08,  h: 17.97 },
    center: { x: 55.87, y: 20.45, w: 9.08,  h: 14.52 },
    rest:   { x: 64.73, y: 21.49, w: 9.08,  h: 17.97 },
    south:  { x: 55.87, y: 35.49, w: 12.11, h: 12.44 }
  };

  // Нова мапа: «чиста» основа без будівель (assets/images/map/map_world_base.webp, 2048×1280)
  // + будівлі окремими картинками поверх неї (вирізані зі старої мапи).
  // x, y — центр, w, h — розмір картинки будівлі у % від мапи.
  // Якщо основи ще немає — показується стара мапа map_world.webp (будівлі на ній уже намальовані).
  const MAP_BASE = "assets/images/map/map_world_base.webp";
  const MAP_BUILDINGS = {
    home:          { x: 9.46,  y: 78.63, w: 10.5, h: 14.2 },
    temple:        { x: 15.01, y: 65.52, w: 9.0,  h: 16.5 },
    village_start: { x: 18.92, y: 45.87, w: 10.5, h: 14.4 },
    tavern:        { x: 32.79, y: 46.88, w: 10.5, h: 14.8 },
    city:          { x: 55.87, y: 21.5,  w: 30.0, h: 43.0 },
    forest_path:   { x: 48.87, y: 63.0,  w: 12.0, h: 14.0 },
    forest_cave:   { x: 91.11, y: 46.88, w: 12.0, h: 15.5 }
  };

  // Свої координати під згенеровану мапу варіанта: assets/js/map_layout.js → RPG.MAP_LAYOUT
  //   { buildings: { id: {x,y,w,h} }, spots: { id: {x,y,w,h} }, city: { id: {x,y,w,h} } }
  // Діють лише тоді, коли є нова основа мапи.
  function applyMapLayout() {
    const L = RPG.MAP_LAYOUT;
    if (!L) return false;
    for (const [id, v] of Object.entries(L.buildings || {})) MAP_BUILDINGS[id] = Object.assign(MAP_BUILDINGS[id] || {}, v);
    for (const [id, v] of Object.entries(L.spots || {})) WORLD_MAP[id] = Object.assign(WORLD_MAP[id] || {}, v);
    for (const [id, v] of Object.entries(L.city || {})) CITY_MAP[id] = Object.assign(CITY_MAP[id] || {}, v);
    return true;
  }

  function setupDarkMap(mapBox) {
    const img = mapBox && mapBox.querySelector(".map-img");
    if (!img) return;
    const h2 = mapBox.closest(".panel")?.querySelector("h2");
    if (h2) h2.firstChild.textContent = "Мапа світу — Темний ліс";
    img.alt = "Мапа: Темний ліс";
    mapBox.classList.add("is-dark", "no-art");
    img.removeAttribute("src");
    const probe = new Image();
    probe.onload = () => { img.src = probe.src; mapBox.classList.remove("no-art"); };
    probe.src = RPG.asset(DARK_MAP_BASE);
    // Стежки між місцями — видно лише на заглушці
    const roads = [["dark_gate", "dk_edge"], ["dk_edge", "dk_marsh"], ["dk_marsh", "dk_grave"], ["dk_grave", "dk_webs"],
                   ["dk_edge", "dk_webs"], ["dk_webs", "dk_ravine"], ["dk_ravine", "dk_ruins"], ["dk_ruins", "dk_heart"]];
    const svg = roads.map(([a, b]) => `<line x1="${DARK_MAP[a].x}" y1="${DARK_MAP[a].y}" x2="${DARK_MAP[b].x}" y2="${DARK_MAP[b].y}"/>`).join("");
    const layer = el("div", "map-roads");
    layer.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${svg}</svg>`;
    img.after(layer);
  }

  function setupMapLayers(mapBox, onReady) {
    const img = mapBox && mapBox.querySelector(".map-img");
    if (!img) return;
    const probe = new Image();
    probe.onload = () => {
      img.src = probe.src;
      mapBox.classList.add("has-base");
      if (applyMapLayout() && onReady) onReady();
      const layer = el("div", "map-buildings");
      for (const [id, b] of Object.entries(MAP_BUILDINGS)) {
        const bi = el("img", "map-building");
        bi.src = RPG.asset(`assets/images/map/bld_${id}.webp`);
        bi.alt = "";
        bi.dataset.loc = id;
        Object.assign(bi.style, { left: b.x + "%", top: b.y + "%", width: b.w + "%", height: b.h + "%" });
        layer.append(bi);
      }
      img.after(layer);
    };
    probe.src = RPG.asset(MAP_BASE);
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
    // Яку частину світу показувати: де зараз герой
    const dark = RPG.getLocation(save.location.map).region === "dark";
    const SPOTS = dark ? DARK_MAP : WORLD_MAP;
    const ids = dark ? DARK_ORDER
      : [...LOCATION_ORDER, ...Object.keys(RPG.LOCATIONS).filter(id => !LOCATION_ORDER.includes(id) && RPG.LOCATIONS[id].region !== "dark")];
    let selected = save.location.map;      // id локації
    let selDistrict = null;                // район міста (якщо обрано на мапі)
    let traveling = false;
    const districts = dark ? [] : (RPG.LOCATIONS.city?.districts || []);
    const districtLocked = d => !RPG.isDistrictOpen(save, d);

    // Стан локації для героя: here | open | closed
    function locState(id) {
      if (save.location.map === id) return { kind: "here", text: "Ви тут" };
      const loc = RPG.LOCATIONS[id];
      const can = RPG.canEnterLocation(id, save.character.level, save);
      if (can.ok) return { kind: "open", text: "Можна перейти" };
      if (loc.locked) return { kind: "closed", text: "Закрито — відкриється згодом" };
      return { kind: "closed", text: `Недоступно: потрібен ${loc.minLevel} рівень (у вас ${save.character.level})` };
    }

    function shortText(s, n = 130) {
      return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
    }

    // ---------- Мапа-картинка: зони, підказка, фігурка героя ----------
    let tip = null, hero = null;
    function buildWorldMap() {
      if (!mapBox) return;
      mapBox.querySelectorAll(".map-spot, .map-tip, .map-hero").forEach(n => n.remove());
      // Райони міста — окремі зони
      for (const d of districts) {
        const pos = CITY_MAP[d.id];
        if (!pos) continue;
        const cityOpen = locState("city").kind !== "closed";
        const closed = !cityOpen || districtLocked(d);
        const spot = button("", `map-spot map-district is-${closed ? "closed" : (save.location.map === "city" ? "here" : "open")}`);
        spot.dataset.loc = "city";
        spot.dataset.district = d.id;
        Object.assign(spot.style, { left: pos.x + "%", top: pos.y + "%", width: pos.w + "%", height: pos.h + "%" });
        spot.setAttribute("aria-label", `Місто, ${d.name} — ${closed ? "закрито" : d.building}`);
        spot.addEventListener("mouseenter", () => showTip("city", d.id));
        spot.addEventListener("focus", () => showTip("city", d.id));
        spot.addEventListener("mouseleave", () => showTip(selected, selDistrict));
        spot.addEventListener("blur", () => showTip(selected, selDistrict));
        spot.addEventListener("click", () => { selected = "city"; selDistrict = d.id; render(); });
        spot.addEventListener("dblclick", () => travel("city", d.id));
        mapBox.append(spot);
      }
      for (const id of ids) {
        const pos = SPOTS[id], loc = RPG.LOCATIONS[id];
        if (!pos || !loc || id === "city") continue;
        const st = locState(id);
        const spot = button("", `map-spot is-${st.kind}`);
        spot.dataset.loc = id;
        spot.dataset.name = loc.name;          // підпис на мапі-заглушці (поки немає картинки)
        Object.assign(spot.style, { left: pos.x + "%", top: pos.y + "%", width: pos.w + "%", height: pos.h + "%" });
        spot.setAttribute("aria-label", `${loc.name} — ${st.text}`);
        spot.addEventListener("mouseenter", () => showTip(id));
        spot.addEventListener("focus", () => showTip(id));
        spot.addEventListener("mouseleave", () => showTip(selected, selDistrict));
        spot.addEventListener("blur", () => showTip(selected, selDistrict));
        spot.addEventListener("click", () => { selected = id; selDistrict = null; render(); });
        spot.addEventListener("dblclick", () => travel(id));
        mapBox.append(spot);
      }
      tip = el("div", "map-tip");
      tip.hidden = true;
      mapBox.append(tip);

      // Фігурка героя (для групи в майбутньому — по фігурці на кожного)
      hero = el("div", "map-hero");
      hero.innerHTML = HERO_FIGURE;
      hero.append(el("span", "hero-tag", save.character.name));
      placeHero(save.location.map, false);
      mapBox.append(hero);
    }

    function heroPoint(id) {
      const pos = SPOTS[id] || SPOTS[ids[0]];
      return { x: pos.x, y: pos.y + pos.h * 0.25 };
    }

    function placeHero(id, animate) {
      if (!hero) return;
      hero.classList.toggle("no-anim", !animate);
      const pt = heroPoint(id);
      hero.style.left = pt.x + "%";
      hero.style.top = pt.y + "%";
    }

    function showTip(id, district) {
      if (!tip) return;
      mapBox.querySelectorAll(".map-spot").forEach(s => s.classList.toggle("is-selected",
        s.dataset.loc === selected && (s.dataset.district || null) === (selected === "city" ? (selDistrict || s.dataset.district || null) : null)));
      const d = district && districts.find(x => x.id === district);
      const pos = d ? CITY_MAP[d.id] : SPOTS[id], loc = RPG.LOCATIONS[id];
      if (!pos || !loc) { tip.hidden = true; return; }
      let st = locState(id);
      if (d && st.kind !== "closed" && districtLocked(d)) {
        st = { kind: "closed", text: d.id === "center" ? "Закрито — прохід відкриває Гільдія авантюристів («Час дослідити»)"
          : d.id === "trade" ? `Закрито — Торгова гільдія приймає з ${RPG.TRADE_MIN_LEVEL} рівня` : "Закрито — відкриється згодом" };
      }
      tip.innerHTML = "";
      tip.append(el("strong", null, d ? `${loc.name}: ${d.name}` : loc.name), el("div", `tip-status tip-${st.kind}`, st.text),
                 el("div", "tip-desc", shortText(d ? `${d.building}. ${d.description}` : (loc.locked ? "Закрито — відкриється згодом." : loc.description))));
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

    // Перехід: фігурка йде до нової локації, потім відкривається її сторінка
    function travel(id, district) {
      if (traveling) return;
      const d = district && districts.find(x => x.id === district);
      if (d && districtLocked(d)) { selected = id; selDistrict = district; render(); return; }
      let href = id === save.location.map ? "game.html" : "game.html?loc=" + encodeURIComponent(id);
      if (d) href += (href.includes("?") ? "&" : "?") + "district=" + encodeURIComponent(d.id);
      if (id !== save.location.map && !RPG.canEnterLocation(id, save.character.level, save).ok) {
        selected = id; render();
        return;
      }
      traveling = true;
      if (!hero || id === save.location.map) { location.href = href; return; }
      hero.classList.add("is-walking");
      placeHero(id, true);
      setTimeout(() => { location.href = href; }, 950);
    }

    function render() {
      showTip(selected, selDistrict);
      grid.innerHTML = "";
      for (const id of ids) {
        const loc = RPG.LOCATIONS[id];
        if (!loc) continue;
        const here = save.location.map === id;
        const closed = !here && !RPG.canEnterLocation(id, save.character.level, save).ok;
        const cell = button("", "wf loc-card " + (closed ? "wf-locked" : "wf-link"));
        cell.append(el("strong", null, loc.name));
        const label = loc.locked ? "Закрито"
          : here ? "Ви тут"
          : closed ? `З ${loc.minLevel} рівня`
          : TYPE_LABEL[loc.type] + (loc.minLevel ? ` · від ${loc.minLevel} рів.` : "");
        cell.append(el("span", "loc-desc", label));
        if (selected === id) cell.classList.add("is-selected");
        if (closed) cell.setAttribute("aria-disabled", "true");
        cell.addEventListener("click", () => { selected = id; selDistrict = null; render(); });
        grid.append(cell);
      }
      renderDetails();
    }

    function renderDetails() {
      const loc = RPG.LOCATIONS[selected];
      details.innerHTML = "";
      const banner = el("div", "place-banner info-anchor");
      banner.style.setProperty("--loc-img", locImage(selected));
      banner.append(el("h2", null, loc.name));
      details.append(banner);
      if (loc.locked) {
        details.append(el("p", "status", "Закрито — відкриється згодом."));
        return;
      }
      details.append(el("p", "note", loc.description));
      if (loc.type === "combat") {
        const enemies = (loc.enemies || []).map(e => `${RPG.getEnemy(e).name} (рів. ${RPG.getEnemy(e).level})`).join(", ");
        details.append(el("p", "note", "Вороги: " + enemies));
      } else {
        details.append(el("p", "note", "Тут не б'ються, монстрів немає."));
      }
      const d = selected === "city" && selDistrict && districts.find(x => x.id === selDistrict);
      if (d) {
        details.append(el("p", "note", `${d.name} — ${d.building}. ${d.description}`));
        if (districtLocked(d)) {
          details.append(el("p", "status", d.id === "center"
            ? "Прохід закритий: його відкриває Артеміда, адміністратор гільдії, після особливого завдання «Час дослідити»."
            : "Закрито — відкриється згодом."));
          return;
        }
      }
      if (save.location.map === selected) {
        const go = link("Ви тут — відкрити локацію", "game.html" + (d ? "?district=" + d.id : ""));
        details.append(go);
        return;
      }
      const can = RPG.canEnterLocation(selected, save.character.level, save);
      if (can.ok) {
        const go = link("Перейти сюди", "game.html?loc=" + encodeURIComponent(selected));
        go.addEventListener("click", ev => { ev.preventDefault(); travel(selected, selDistrict); });
        details.append(go);
      } else {
        details.append(el("p", "status", `Доступ з ${loc.minLevel} рівня персонажа (зараз у вас ${save.character.level}).`));
      }
    }

    if (dark) setupDarkMap(mapBox);
    else setupMapLayers(mapBox, () => { buildWorldMap(); render(); });
    buildWorldMap();
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

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    if (PAGES[page]) {
      Promise.resolve(PAGES[page]()).catch(e => console.error("[game]", e));
    }
  });

  Object.assign(RPG, { setBar });
})(window.RPG);
