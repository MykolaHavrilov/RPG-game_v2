// ============================================================
// travel.js — ПЕРЕМІЩЕННЯ ПО МАПІ З ЧАСОМ
//
// Світ поділено на регіони (data/routes.js → MAP_REGIONS):
//   start — стартова мапа (назва для гравців поки «-»); Місто на ній — точка south_gate
//           («Південний район»): дійшовши туди, герой опиняється в Місті, у Південному районі;
//   city  — Місто: 5 районів, герой ходить між ними;
//   dark  — Темний ліс (за Центральною брамою, через капітана варти).
// Між регіонами переходять лише через брами (миттєво): south_gate ↔ Місто, Північний район ↔ dark_gate.
//
// У межах регіону герой іде дорогами (ROUTES): клітинки маршруту × TRAVEL_SEC_PER_CELL секунд.
// Переміщення не скасовується. Поки воно триває, доступні лише «Персонаж», «Інвентар» і «Мапа».
// Стан у сейві: save.travel = { region, from, to, cells, pts, start, end }.
//
// Підключається ПІСЛЯ data/routes.js, character.js і quests.js.
// ============================================================

(function (RPG) {
  const TRAVEL_PAGES = ["character", "inventory", "maps"];   // що можна відкривати в дорозі

  function regionOf(locId) {
    return RPG.LOCATIONS[locId]?.region || "start";
  }

  // Де зараз герой: { region, spot } (у Місті spot — район)
  function whereIs(save) {
    const map = save.location.map;
    const region = regionOf(map);
    if (region === "city") return { region, spot: save.location.district || "south" };
    return { region, spot: map };
  }

  function route(region, from, to) {
    const R = RPG.ROUTES[region] || {};
    const direct = R[`${from}>${to}`];
    if (direct) return { cells: direct.cells, pts: direct.pts };
    const back = R[`${to}>${from}`];
    if (back) return { cells: back.cells, pts: back.pts.slice().reverse() };
    return null;
  }

  function travelSeconds(cells) {
    return cells * RPG.TRAVEL_SEC_PER_CELL;
  }

  // Чи можна йти в точку регіону: { ok, reason }
  function canGo(save, region, to) {
    if (region === "city") {
      const d = (RPG.LOCATIONS.city.districts || []).find(x => x.id === to);
      if (!d) return { ok: false, reason: "Такого району немає." };
      if (!RPG.isDistrictOpen(save, d)) return { ok: false, reason: RPG.districtLockText(d) };
      return { ok: true };
    }
    if (to === "south_gate") return { ok: true };
    return RPG.canEnterLocation(to, save.character.level, save);
  }

  function startTravel(save, to, now = Date.now()) {
    if (isTraveling(save, now)) return { ok: false, reason: "Ви вже в дорозі — переміщення не скасувати." };
    const { region, spot } = whereIs(save);
    if (spot === to) return { ok: false, reason: "Ви вже тут." };
    const can = canGo(save, region, to);
    if (!can.ok) return can;
    const r = route(region, spot, to);
    if (!r) return { ok: false, reason: "Туди немає дороги." };
    const ms = travelSeconds(r.cells) * 1000;
    save.travel = { region, from: spot, to, cells: r.cells, pts: r.pts, start: now, end: now + ms };
    return { ok: true, cells: r.cells, seconds: ms / 1000 };
  }

  function isTraveling(save, now = Date.now()) {
    return !!save.travel && now < save.travel.end;
  }

  // Точка на маршруті за часткою пройденого шляху (0…1)
  function pointAt(pts, t, aspect = 0.625) {
    if (pts.length < 2) return { x: pts[0][0], y: pts[0][1] };
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i][0] - pts[i - 1][0], (pts[i][1] - pts[i - 1][1]) * aspect);   // висота/ширина мапи
      seg.push(L); total += L;
    }
    let left = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < seg.length; i++) {
      if (left <= seg[i] || i === seg.length - 1) {
        const k = seg[i] ? Math.min(1, left / seg[i]) : 1;
        return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k };
      }
      left -= seg[i];
    }
    const p = pts[pts.length - 1];
    return { x: p[0], y: p[1] };
  }

  function aspectOf(region) {
    const R = RPG.MAP_REGIONS[region];
    return R ? R.h / R.w : 0.625;
  }

  // Стан дороги: null або { …travel, leftMs, progress, pos }
  function travelState(save, now = Date.now()) {
    const t = save.travel;
    if (!t) return null;
    const dur = Math.max(1, t.end - t.start);
    const progress = Math.min(1, (now - t.start) / dur);
    return Object.assign({}, t, { leftMs: Math.max(0, t.end - now), progress, pos: pointAt(t.pts, progress, aspectOf(t.region)) });
  }

  // Якщо дорога скінчилась — герой на місці. Повертає { arrived, locId, district } або null
  function finishTravel(save, now = Date.now()) {
    const t = save.travel;
    if (!t || now < t.end) return null;
    delete save.travel;
    if (t.region === "city") {
      save.location.map = "city";
      save.location.district = t.to;
    } else if (t.to === "south_gate") {
      save.location.map = "city";           // Місто на стартовій мапі — одразу в Південний район
      save.location.district = "south";
    } else {
      save.location.map = t.to;
    }
    return { arrived: true, locId: save.location.map, district: save.location.district };
  }

  // Переходи крізь брами (миттєві)
  function enterCity(save, district = "south") {
    delete save.travel;
    save.location.map = "city";
    save.location.district = district;
  }
  function leaveCityToStart(save) {
    delete save.travel;
    save.location.map = "south_gate";
  }

  function fmtLeft(ms) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  Object.assign(RPG, {
    TRAVEL_PAGES, regionOf, whereIs, route, travelSeconds, canGo, startTravel, isTraveling,
    travelState, finishTravel, enterCity, leaveCityToStart, fmtLeft
  });
})(window.RPG);
