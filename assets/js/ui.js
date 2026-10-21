// ============================================================
// ui.js — спливаючі вікна (опис предметів) та бойові ефекти.
// Підключається ПІСЛЯ core.js і ДО game.js.
//
// RPG.popover.show(anchor, content, { actions })  — показати вікно біля елемента
// RPG.popover.hide()                              — сховати
// RPG.bindTip(el, buildContent, getActions)       — клік (дотик) відкриває вікно,
//     на ПК з мишею наведення показує попередній перегляд.
// Вікно зникає при кліку/дотику деінде, Esc або повторному кліку по тому ж предмету.
// На вузьких екранах (телефон) вікно виїжджає знизу («шторка»).
//
// RPG.fx.hit(target, amount, kind) — число шкоди/лікування, що злітає над портретом.
// ============================================================

window.RPG = window.RPG || {};

(function (RPG) {
  const SHEET_MAX_WIDTH = 600;              // ширина екрана, нижче якої — «шторка»
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");

  let pop = null;          // DOM вікна
  let anchor = null;       // елемент, до якого прив'язане вікно
  let pinned = false;      // відкрите кліком (а не наведенням)
  let hoverTimer = 0;

  function ensure() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "popover";
    pop.hidden = true;
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-modal", "false");
    document.body.append(pop);
    return pop;
  }

  function isSheet() { return window.innerWidth < SHEET_MAX_WIDTH; }

  function place() {
    if (!pop || pop.hidden || !anchor) return;
    if (!anchor.isConnected) { hide(); return; }
    const sheet = isSheet() && pinned;
    pop.classList.toggle("is-sheet", sheet);
    if (sheet) {
      pop.style.left = pop.style.top = "";
      pop.removeAttribute("data-side");
      return;
    }
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const gap = 10, pad = 8;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let side = "top";
    let top = r.top - h - gap;
    if (top < pad) { side = "bottom"; top = r.bottom + gap; }
    if (side === "bottom" && top + h > vh - pad) {
      // ні зверху, ні знизу не влазить — притискаємо до краю екрана
      top = Math.max(pad, vh - h - pad);
    }
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(pad, Math.min(left, vw - w - pad));
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(top) + "px";
    pop.dataset.side = side;
    // «Носик» вікна дивиться на центр предмета
    const arrowX = Math.max(14, Math.min(w - 14, r.left + r.width / 2 - left));
    pop.style.setProperty("--arrow-x", arrowX + "px");
  }

  function show(target, content, opts = {}) {
    ensure();
    clearTimeout(hoverTimer);
    if (anchor && anchor !== target) anchor.classList.remove("has-popover");
    anchor = target;
    pinned = !opts.preview;
    pop.innerHTML = "";
    pop.classList.toggle("is-preview", !pinned);

    const body = document.createElement("div");
    body.className = "popover-body";
    if (content) body.append(content);
    pop.append(body);

    const actions = (pinned && opts.actions) ? opts.actions.filter(Boolean) : [];
    if (actions.length) {
      const row = document.createElement("div");
      row.className = "popover-actions";
      for (const a of actions) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wf " + (a.className || "wf-button");
        b.textContent = a.text;
        b.disabled = !!a.disabled;
        if (a.title) b.title = a.title;
        b.addEventListener("click", ev => {
          ev.stopPropagation();
          if (a.keepOpen !== true) hide();
          a.onClick && a.onClick();
        });
        row.append(b);
      }
      pop.append(row);
    }

    if (pinned) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "popover-close";
      close.setAttribute("aria-label", "Закрити");
      close.textContent = "×";
      close.addEventListener("click", ev => { ev.stopPropagation(); hide(); });
      pop.append(close);
    }

    pop.hidden = false;
    target.classList.add("has-popover");
    pop.classList.remove("is-open");
    place();
    // перезапуск анімації появи
    void pop.offsetWidth;
    pop.classList.add("is-open");
  }

  function hide() {
    clearTimeout(hoverTimer);
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    pop.classList.remove("is-open", "is-sheet");
    if (anchor) anchor.classList.remove("has-popover");
    anchor = null;
    pinned = false;
  }

  function isOpenFor(el) { return !!pop && !pop.hidden && anchor === el && pinned; }

  RPG.popover = { show, hide, isOpenFor, place };

  // Клік / дотик деінде — закрити
  document.addEventListener("pointerdown", ev => {
    if (!pop || pop.hidden) return;
    if (pop.contains(ev.target)) return;
    if (anchor && anchor.contains(ev.target)) return;
    hide();
  }, true);
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") hide(); });
  window.addEventListener("resize", place);
  window.addEventListener("scroll", () => { if (pinned) place(); else hide(); }, { passive: true, capture: true });

  // ---------- Прив'язка до елемента ----------
  // build()      — повертає DOM-вузол з описом
  // getActions() — масив кнопок [{ text, className, onClick, disabled, title }] або null
  // opts.onOpen  — викликається перед відкриттям кліком (напр. щоб виділити клітинку)
  RPG.bindTip = function (el, build, getActions, opts = {}) {
    el.classList.add("has-tip");
    if (!el.hasAttribute("tabindex") && !/^(BUTTON|A|INPUT|SELECT)$/.test(el.tagName)) el.tabIndex = 0;
    const open = () => show(el, build(), { actions: getActions ? getActions() : null });
    el.addEventListener("click", ev => {
      if (opts.onOpen && opts.onOpen(ev) === false) return;
      if (isOpenFor(el)) { hide(); return; }
      open();
    });
    el.addEventListener("keydown", ev => {
      if ((ev.key === "Enter" || ev.key === " ") && el.tagName !== "BUTTON") { ev.preventDefault(); el.click(); }
    });
    el.addEventListener("mouseenter", () => {
      if (!canHover.matches || (pop && !pop.hidden && pinned)) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => show(el, build(), { preview: true }), 280);
    });
    el.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimer);
      if (pop && !pop.hidden && !pinned && anchor === el) hide();
    });
  };

  // ---------- Мітки «i» з додатковим описом ----------
  // Будь-який елемент з класом .note або .desc ховається, а на його місці
  // (або в найближчому заголовку) з'являється маленька мітка «i».
  // Наведення / дотик / клік по мітці показує текст у спливаючому вікні.
  // Текст береться «наживо» з прихованого елемента, тож динамічні описи
  // (відновлення, зброя тощо) завжди актуальні.
  //   data-label="…"         — підпис біля мітки, якщо її ставимо окремо
  //   data-anchor="heading"  — мітку поставити в заголовок батьківського блока
  //   клас .keep             — не ховати (показувати як є)
  // (у каруселі сторінки «Персонаж» підказки лишаються видимими — там є місце)
  const COLLAPSE = ".note:not(.keep):not(.char-carousel .note), .desc:not(.keep):not(.char-carousel .desc)";
  const HEADINGS = /^(H1|H2|H3|H4|STRONG)$/;

  function infoContent(sources) {
    const box = document.createElement("div");
    box.className = "info-body";
    for (const s of sources) {
      const txt = s.textContent.trim();
      if (!txt) continue;
      const p = document.createElement("p");
      p.textContent = txt;
      box.append(p);
    }
    if (!box.childNodes.length) box.textContent = "Немає додаткової інформації.";
    return box;
  }

  function makeMarker(label) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "info-tip" + (label ? " has-label" : "");
    b.setAttribute("aria-label", label ? label + " — детальніше" : "Детальніше");
    const i = document.createElement("span");
    i.className = "info-i";
    i.textContent = "i";
    b.append(i);
    if (label) { const t = document.createElement("span"); t.className = "info-label"; t.textContent = label; b.append(t); }
    b._sources = [];
    RPG.bindTip(b, () => infoContent(b._sources), null, {
      onOpen: ev => { ev.preventDefault(); ev.stopPropagation(); }
    });
    // Мітка всередині посилання не повинна відкривати посилання
    b.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); }, true);
    return b;
  }

  // Знайти заголовок, до якого прив'язати мітку
  function findAnchor(src) {
    const mode = src.dataset.anchor;
    if (mode && mode !== "heading") {
      const t = document.querySelector(mode);
      if (t) return t;
    }
    // 1) попередні сусіди (пропускаючи вже сховані описи)
    for (let n = src.previousElementSibling; n; n = n.previousElementSibling) {
      if (n.classList.contains("desc-collapsed")) continue;
      if (HEADINGS.test(n.tagName) || n.classList.contains("info-anchor")) return n;
      if (mode !== "heading") break;
    }
    // 2) заголовок батьківського блока
    for (let p = src.parentElement, depth = 0; p && depth < 2; p = p.parentElement, depth++) {
      const h = p.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > .info-anchor");
      if (h && h !== src) return h;
      for (let n = p.previousElementSibling; n; n = n.previousElementSibling) {
        if (HEADINGS.test(n.tagName) || n.classList.contains("info-anchor")) return n;
        break;
      }
    }
    return null;
  }

  function collapse(src) {
    if (src.classList.contains("desc-collapsed") || src.closest(".popover")) return;
    src.classList.add("desc-collapsed");
    // Сусідні описи підряд — одна спільна мітка
    let prev = src.previousElementSibling;
    while (prev && prev.classList.contains("info-tip")) prev = prev.previousElementSibling;
    if (prev && prev.classList.contains("desc-collapsed") && prev._marker) {
      prev._marker._sources.push(src); src._marker = prev._marker; return;
    }
    const anchor = src.dataset.label ? null : findAnchor(src);
    let marker = anchor && anchor.querySelector(":scope > .info-tip");
    if (!marker) {
      marker = makeMarker(anchor ? "" : (src.dataset.label || "Детальніше"));
      if (anchor) anchor.append(marker);
      else src.before(marker);
    }
    marker._sources.push(src);
    src._marker = marker;
  }

  function scan(root) {
    if (!(root instanceof Element)) return;
    if (root.matches && root.matches(COLLAPSE)) collapse(root);
    root.querySelectorAll && root.querySelectorAll(COLLAPSE).forEach(collapse);
  }
  RPG.collapseNotes = scan;

  function startObserver() {
    // <body data-show-notes> — описи не ховати (лише вікна для явних міток)
    if (document.body.hasAttribute("data-show-notes")) return;
    scan(document.body);
    new MutationObserver(list => {
      for (const m of list) m.addedNodes.forEach(n => scan(n));
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
  else startObserver();

  // ---------- Бойові ефекти ----------
  RPG.fx = {
    // target — елемент (портрет або рядок групи); amount — зміна HP (від'ємна = шкода)
    hit(target, amount, kind) {
      if (!target || !amount) return;
      const host = target;
      const n = document.createElement("span");
      const heal = amount > 0;
      n.className = "fx-num " + (heal ? "fx-heal" : "fx-dmg") + (kind === "crit" ? " fx-crit" : "") + (kind === "mp" ? " fx-mp" : "");
      n.textContent = (heal ? "+" : "−") + Math.abs(Math.round(amount));
      n.style.setProperty("--dx", (Math.random() * 40 - 20).toFixed(0) + "px");
      host.append(n);
      setTimeout(() => n.remove(), 1200);
      if (!heal && kind !== "mp") {
        host.classList.remove("fx-shake");
        void host.offsetWidth;
        host.classList.add("fx-shake");
        setTimeout(() => host.classList.remove("fx-shake"), 450);
      }
    },
    // Короткий спалах того, хто діє
    act(target) {
      if (!target) return;
      target.classList.remove("fx-act");
      void target.offsetWidth;
      target.classList.add("fx-act");
      setTimeout(() => target.classList.remove("fx-act"), 500);
    }
  };
})(window.RPG);
