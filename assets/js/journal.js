// ============================================================
// journal.js — Журнал бою (save.battleLog)
// Зберігає останні RPG.JOURNAL_MAX (100) подій: бої (повний хід бою + підсумок
// з досвідом, золотом і здобиччю) та нагороди за здачу завдань.
// Найстаріша подія — вгорі списку, найновіша — внизу; коли записів більше 100,
// найстаріший видаляється. Журнал іде у файл збереження (IndexedDB / JSON).
//
// RPG.journalAdd(save, { kind, lines })  — додати подію, повертає запис
//   kind: "battle" | "quest"; lines: [[who, text, flags]]
//   who: "title" (flags = стан: fight/win/lose/draw/ready) | "hero" | "enemy" | "info" | "round"
//   flags для інших: "c" — крит, "m" — переміщення, "h" — лікування
// RPG.journalPack(ev)                    — подія бою (battle.js) → рядок журналу
// RPG.logLi(line)                        — DOM-рядок журналу (<li>)
// RPG.openJournal(save, { skip, live })  — вікно журналу; повертає { append, refresh, isOpen }
// RPG.journalDownload(save)              — файл Log_battle.txt
// Підключається ПІСЛЯ core.js і ДО game.js.
// ============================================================

window.RPG = window.RPG || {};

(function (RPG) {
  const MAX = 100;
  RPG.JOURNAL_MAX = MAX;
  const KIND_NAME = { battle: "Бій", quest: "Нагорода" };

  function list(save) {
    if (!Array.isArray(save.battleLog)) save.battleLog = [];
    return save.battleLog;
  }

  function journalAdd(save, entry) {
    const log = list(save);
    const rec = { at: Date.now(), kind: entry.kind || "battle", lines: entry.lines || [] };
    log.push(rec);
    if (log.length > MAX) log.splice(0, log.length - MAX);   // затираємо найстаріші
    return rec;
  }

  function journalPack(ev) {
    if (Array.isArray(ev)) return ev;
    const f = (ev.crit ? "c" : "") + (ev.move ? "m" : "") + (ev.heal ? "h" : "");
    return f ? [ev.who, String(ev.text), f] : [ev.who, String(ev.text)];
  }

  // ---------- Відображення ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function logLi(line) {
    const [who, text, flags = ""] = line;
    if (who === "title") {
      const li = el("li", "log-title" + (flags ? " is-" + flags : ""));
      li.append(el("span", "log-mark", flags === "win" ? "★" : flags === "lose" ? "✝" : "⚑"), el("span", "log-text", text));
      return li;
    }
    const crit = flags.includes("c"), move = flags.includes("m"), heal = flags.includes("h");
    const li = el("li", "log-" + who + (crit ? " log-crit" : "") + (move ? " log-move" : "") + (heal ? " log-heal" : ""));
    li.dataset.who = who;
    li.append(el("span", "log-mark", who === "round" ? "" : move ? "➜" : who === "hero" ? "⚔" : who === "enemy" ? "✸" : "◆"));
    const t = el("span", "log-text");
    String(text).split(/(\d+)/).forEach((part, i) => {
      if (!part) return;
      t.append(i % 2 ? el("b", "log-num", part) : document.createTextNode(part));
    });
    li.append(t);
    return li;
  }

  const pad = n => String(n).padStart(2, "0");
  function fmtAt(ms) {
    const d = new Date(ms);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function entryHead(rec, n) {
    const li = el("li", "log-entry-head is-" + rec.kind);
    li.append(el("span", "log-entry-num", "#" + n), el("span", "log-entry-kind", KIND_NAME[rec.kind] || rec.kind),
      el("span", "log-entry-at", fmtAt(rec.at)));
    return li;
  }

  // ---------- Вікно журналу ----------

  let ctl = null;   // відкрите вікно

  function openJournal(save, opts = {}) {
    if (ctl && ctl.isOpen()) { ctl.refresh(opts); return ctl; }
    let skip = opts.skip || null;
    let live = opts.live || null;

    const dlg = el("dialog", "notice-dialog journal-dialog");
    const close = el("button", "notice-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Закрити");
    close.addEventListener("click", () => dlg.close());
    const head = el("h3", null, "Журнал бою");
    const note = el("p", "journal-note");
    const wrap = el("div", "journal-wrap");
    const box = el("ol", "log journal-list");
    box.setAttribute("aria-label", "Журнал бою");
    const nav = el("div", "journal-nav");
    const up = el("button", "journal-jump", "▲");
    const down = el("button", "journal-jump", "▼");
    up.type = down.type = "button";
    up.title = "На початок журналу"; up.setAttribute("aria-label", up.title);
    down.title = "У кінець журналу"; down.setAttribute("aria-label", down.title);
    up.addEventListener("click", () => { box.scrollTop = 0; });
    down.addEventListener("click", () => { box.scrollTop = box.scrollHeight; });
    nav.append(up, down);
    wrap.append(box, nav);
    const actions = el("div", "row dialog-actions");
    const dl = el("button", "wf wf-button wf-secondary", "Завантажити .txt");
    dl.type = "button";
    dl.addEventListener("click", () => journalDownload(save));
    actions.append(dl);
    dlg.append(close, head, note, wrap, actions);

    const nearBottom = () => box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const toBottom = () => {
      // без плавної прокрутки — відкривається одразу внизу
      box.style.scrollBehavior = "auto";
      box.scrollTop = box.scrollHeight;
      box.style.scrollBehavior = "";
    };

    function render() {
      box.innerHTML = "";
      const log = list(save).filter(r => r !== skip);
      const frag = document.createDocumentFragment();
      log.forEach((rec, i) => {
        frag.append(entryHead(rec, i + 1));
        for (const line of rec.lines) frag.append(logLi(line));
      });
      if (live) {
        frag.append(entryHead({ kind: "battle", at: Date.now() }, log.length + 1));
        for (const line of live) frag.append(logLi(line));
      }
      box.append(frag);
      box.classList.toggle("is-empty", !log.length && !live);
      note.textContent = `Подій у журналі: ${log.length + (live ? 1 : 0)} з ${MAX}. Найстаріші — вгорі, найновіші — внизу.`;
      dl.disabled = !list(save).length;
      toBottom();
    }

    ctl = {
      isOpen: () => dlg.open,
      append(line) {
        if (!dlg.open || !live) return;
        const stick = nearBottom();
        box.append(logLi(line));
        if (stick) toBottom();
      },
      refresh(o = {}) {
        if ("skip" in o) skip = o.skip || null;
        if ("live" in o) live = o.live || null;
        if (dlg.open) render();
      },
    };
    dlg.addEventListener("close", () => { dlg.remove(); if (ctl && !ctl.isOpen()) ctl = null; });
    document.body.append(dlg);
    dlg.showModal();
    render();
    return ctl;
  }

  // ---------- Файл Log_battle.txt ----------

  function journalText(save) {
    const out = [`Журнал бою — останні ${MAX} подій (найстаріші вгорі)`, `Герой: ${save.character?.name || ""}`, ""];
    list(save).forEach((rec, i) => {
      out.push(`==== #${i + 1} · ${KIND_NAME[rec.kind] || rec.kind} · ${fmtAt(rec.at)} ====`);
      for (const [who, text] of rec.lines) {
        if (who === "title") out.push(`[ ${text} ]`);
        else if (who === "round") out.push(`--- ${text} ---`);
        else out.push((who === "hero" ? "⚔ " : who === "enemy" ? "✸ " : "◆ ") + text);
      }
      out.push("");
    });
    return out.join("\r\n");
  }

  function journalDownload(save) {
    // BOM — щоб Блокнот Windows правильно показав кирилицю
    const blob = new Blob(["﻿" + journalText(save)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Log_battle.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  Object.assign(RPG, { journalAdd, journalPack, logLi, openJournal, journalText, journalDownload });
})(window.RPG);
