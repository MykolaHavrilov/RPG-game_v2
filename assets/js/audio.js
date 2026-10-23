// ============================================================
// audio.js — МУЗИКА ТА ЗВУКИ ГРИ (Web Audio API, без аудіофайлів)
//
// Уся музика й звуки синтезуються прямо в браузері в ретро-стилі
// (чиптюн: пульсові хвилі, трикутний бас, шумові барабани).
// Файлів немає — гра лишається легкою і працює офлайн (PWA).
//
// Підключається після core.js (використовує RPG.getSettings, якщо він є).
//
// ОСНОВНЕ API:
//   RPG.audio.play("menu")            — увімкнути трек (плавний перехід з попереднього)
//   RPG.audio.stop()                  — вимкнути музику
//   RPG.audio.scene({ screen, region, district, location, boss })
//                                     — сам обирає трек під сцену гри (див. SCENES нижче)
//   RPG.audio.jingle("victory")       — коротка мелодія; потім повертається попередній трек
//   RPG.audio.sfx("sword")            — звук (список: RPG.audio.SFX_LIST)
//   RPG.audio.skill("fire_arrow")     — звук навички за її ID (data/skills.js)
//   RPG.audio.attack("bow")           — звук звичайного удару зброєю
//   RPG.audio.battleSound(ev)         — звук події бою (поле ev.sound з battle.js)
//   RPG.audio.resume()                — продовжити трек, що грав на попередній сторінці
//   RPG.audio.setVolume({ master, music, sfx })  — 0..100, зберігається в налаштуваннях
//
// Браузери дозволяють звук лише після першого дотику/кліку гравця.
// Модуль сам чекає на нього: якщо play() викликано раніше — трек
// заграє одразу після першого кліку.
//
// ЯК ЗАПИСАНО МУЗИКУ (TRACKS):
//   root  — тоніка (MIDI-номер, 48 = До 3-ї октави), mode — лад (MODES),
//   chords — акорди по тактах як ступені ладу (0 = тоніка; "4M" — мажорний, "4m" — мінорний),
//   мелодія (notes) — ступені ладу по восьмих: "0 2 4 7" (7 = октава вище, -1 = нижче),
//     "#"/"b" — підвищити/знизити, "-" — тягнути ноту далі, "." — пауза, "|" — межа такту,
//     ".*8" — повторити 8 разів, "@lead" — скопіювати партію lead (shift — зсув ступенів).
//   drums — рядки по 16-х: x — удар, . — тиша (k бочка, s малий, h хет, o відкритий хет,
//     t том, c тарілка).
//   from/until — у яких тактах звучить партія (для другого проходу пісні).
// ============================================================

window.RPG = window.RPG || {};

(function (RPG) {
  "use strict";

  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;

  // ---------- Лади ----------
  const MODES = {
    major:    [0, 2, 4, 5, 7, 9, 11],
    dorian:   [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian:   [0, 2, 4, 6, 7, 9, 11],
    mixo:     [0, 2, 4, 5, 7, 9, 10],
    minor:    [0, 2, 3, 5, 7, 8, 10],
    harm:     [0, 2, 3, 5, 7, 8, 11],   // гармонічний мінор
    phrdom:   [0, 1, 4, 5, 7, 8, 10]    // фригійський домінантовий (східний, «відьмин»)
  };

  function degSemi(mode, deg) {
    const o = Math.floor(deg / 7);
    const d = ((deg % 7) + 7) % 7;
    return o * 12 + mode[d];
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- Кеш хвиль і шуму для кожного AudioContext ----------
  const cache = new WeakMap();
  function res(ctx) {
    let r = cache.get(ctx);
    if (r) return r;
    r = {};
    const pulse = (duty) => {
      const N = 48, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) {
        re[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n);
        im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n);
      }
      return ctx.createPeriodicWave(re, im);
    };
    r.p12 = pulse(0.125);
    r.p25 = pulse(0.25);
    r.organ = ctx.createPeriodicWave(
      new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
      new Float32Array([0, 1, 0.55, 0.25, 0.3, 0, 0.12, 0, 0.08])
    );
    const len = ctx.sampleRate * 2;
    r.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = r.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    cache.set(ctx, r);
    return r;
  }

  function setWave(ctx, osc, wave) {
    const r = res(ctx);
    if (wave === "p12" || wave === "p25" || wave === "organ") osc.setPeriodicWave(r[wave]);
    else if (wave === "saw") osc.type = "sawtooth";
    else if (wave === "sq") osc.type = "square";
    else if (wave === "tri") osc.type = "triangle";
    else osc.type = "sine";
  }

  // ---------- Обвідні (атака, спад, утримання, згасання) ----------
  const ENV = {
    lead:  { a: 0.01,  d: 0.12, s: 0.75, r: 0.08 },
    stacc: { a: 0.004, d: 0.05, s: 0.35, r: 0.03 },
    pluck: { a: 0.003, d: 0.16, s: 0,    r: 0.05, pl: true },
    ring:  { a: 0.003, d: 0.45, s: 0,    r: 0.1,  pl: true },
    bell:  { a: 0.002, d: 0.55, s: 0,    r: 0.2,  pl: true },
    pad:   { a: 0.35,  d: 0.3,  s: 0.9,  r: 0.45 },
    bass:  { a: 0.005, d: 0.08, s: 0.85, r: 0.04 }
  };

  // Одна нота: p = { wave, vol, env, vib, slide, chorus, ring }
  function voice(ctx, out, t, dur, midi, p) {
    const f = mtof(midi);
    const env = ENV[p.env] || ENV.lead;
    const vol = p.vol;
    const g = ctx.createGain();
    g.connect(out);
    const oscs = [];
    const mk = (wave, freq, detune, dest) => {
      const o = ctx.createOscillator();
      setWave(ctx, o, wave);
      o.frequency.setValueAtTime(freq, t);
      if (detune) o.detune.setValueAtTime(detune, t);
      o.connect(dest || g);
      oscs.push(o);
      return o;
    };

    if (p.wave === "bell") {
      mk("sine", f);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.35, t);
      pg.gain.setTargetAtTime(0, t, 0.08);
      pg.connect(g);
      mk("sine", f * 2.76, 0, pg);
      mk("sine", f * 5.4, 0, pg);
    } else if (p.chorus) {
      mk(p.wave, f, -8);
      mk(p.wave, f, 8);
    } else {
      mk(p.wave, f);
    }

    if (p.slide) {
      for (const o of oscs) {
        const base = o.frequency.value;
        o.frequency.setValueAtTime(base * Math.pow(2, p.slide / 12), t);
        o.frequency.exponentialRampToValueAtTime(base, t + 0.06);
      }
    }

    let end;
    const peak = Math.max(vol, 0.0002);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + env.a);
    if (env.pl) {
      const d = env.d * (p.ring || 1);
      g.gain.setTargetAtTime(0, t + env.a, d);
      end = t + env.a + d * 6;
    } else {
      const off = t + Math.max(dur, env.a + 0.005);
      g.gain.setTargetAtTime(peak * env.s, t + env.a, env.d);
      g.gain.setTargetAtTime(0, off, env.r);
      end = off + env.r * 6;
    }

    if (p.vib && dur > 0.22) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.setValueAtTime(5.5, t);
      lg.gain.setValueAtTime(0, t);
      lg.gain.setValueAtTime(0, t + 0.15);
      lg.gain.linearRampToValueAtTime(f * 0.007 * p.vib, t + 0.35);
      lfo.connect(lg);
      for (const o of oscs) lg.connect(o.frequency);
      oscs.push(lfo);
    }

    for (const o of oscs) { o.start(t); o.stop(end); }
  }

  // ---------- Барабани ----------
  function noiseSrc(ctx, t, dur) {
    const s = ctx.createBufferSource();
    s.buffer = res(ctx).noise;
    s.start(t, Math.random() * 1.5, dur + 0.05);
    return s;
  }

  function drum(ctx, out, t, kind, vol) {
    const g = ctx.createGain();
    g.connect(out);
    if (kind === "k") {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
      g.gain.setValueAtTime(vol * 0.9, t);
      g.gain.setTargetAtTime(0, t + 0.01, 0.07);
      o.connect(g); o.start(t); o.stop(t + 0.45);
    } else if (kind === "s") {
      const n = noiseSrc(ctx, t, 0.25);
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1300;
      n.connect(hp); hp.connect(g);
      g.gain.setValueAtTime(vol * 0.45, t);
      g.gain.setTargetAtTime(0, t + 0.005, 0.05);
      const o = ctx.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(200, t);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
      const og = ctx.createGain();
      og.gain.setValueAtTime(vol * 0.5, t);
      og.gain.setTargetAtTime(0, t, 0.035);
      o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.25);
    } else if (kind === "h" || kind === "o") {
      const n = noiseSrc(ctx, t, kind === "h" ? 0.08 : 0.35);
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
      n.connect(hp); hp.connect(g);
      g.gain.setValueAtTime(vol * 0.25, t);
      g.gain.setTargetAtTime(0, t + 0.002, kind === "h" ? 0.015 : 0.08);
    } else if (kind === "t") {
      const o = ctx.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(65, t + 0.2);
      g.gain.setValueAtTime(vol * 0.8, t);
      g.gain.setTargetAtTime(0, t + 0.01, 0.1);
      o.connect(g); o.start(t); o.stop(t + 0.6);
    } else if (kind === "c") {
      const n = noiseSrc(ctx, t, 1.4);
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3500;
      n.connect(hp); hp.connect(g);
      g.gain.setValueAtTime(vol * 0.22, t);
      g.gain.setTargetAtTime(0, t + 0.005, 0.3);
    }
  }

  // ============================================================
  // ТРЕКИ
  // ============================================================
  const D = (s) => s; // позначка рядка барабанів (16 кроків = 1 такт)
  const rest = (n) => ".".repeat(n);

  const TRACKS = {
    // ---------------- 1. Головне меню ----------------
    menu: {
      title: "Клич богів", group: "Головне меню",
      root: 50, mode: "dorian", bpm: 80, bars: 16, echo: 0.28, cutoff: 7000,
      chords: "0 6 3 0 | 2 6 3 4",
      parts: {
        lead:  { wave: "p25", vol: 0.13, oct: 1, vib: 0.5,
          notes: "4 - - 2 4 - 7 - | 6 - 5 - 3 - 1 - | 3 - 5 - 7 - 5 3 | 4 - - - - - . . |" +
                 "2 - 4 - 6 - 4 2 | 6 - 7 8 8 - 7 6 | 7 - 5 - 3 - 5 - | 4 - - - 1 - - ." },
        lead2: { wave: "p12", vol: 0.07, oct: 1, vib: 0.5, notes: "@lead", shift: -2, from: 8 },
        pad:   { wave: "saw", vol: 0.022, oct: 0, cut: 1100 },
        bass:  { wave: "tri", vol: 0.24, oct: -1, style: "drone" },
        arp:   { wave: "p12", vol: 0.045, oct: 1, style: "strum", from: 8 },
        drums: { vol: 0.5, t: D("x.......x.....x."), k: D("x..............."), c: "x" + rest(255) }
      }
    },

    // ---------------- 2. Мапи світу ----------------
    map_start: {
      title: "Шлях героя", group: "Мапа світу",
      root: 55, mode: "mixo", bpm: 104, bars: 16, echo: 0.18,
      chords: "0 6 3 0 | 0 6 3 4",
      parts: {
        lead:  { wave: "p12", vol: 0.12, oct: 1, vib: 0.3,
          notes: "0 - 2 4 4 - 2 0 | 1 - 3 1 -1 - - . | 3 2 3 4 5 - 4 3 | 2 - 0 - - - . . |" +
                 "4 - 4 5 4 2 0 2 | 3 - 1 3 6 - 5 3 | 5 - 3 - 0 - 2 3 | 4 - - - 1 - . ." },
        lead2: { wave: "p25", vol: 0.06, oct: 1, notes: "@lead", shift: 2, from: 8, vib: 0.3 },
        bass:  { wave: "tri", vol: 0.24, oct: -1, style: "walk" },
        arp:   { wave: "p25", vol: 0.05, oct: 0, style: "strum8", env: "pluck" },
        drums: { vol: 0.45, k: D("x.......x......."), h: D("..x...x...x...x."), s: rest(64) + D("....x.......x...") }
      }
    },
    map_dark: {
      title: "Темні стежки", group: "Мапа світу",
      root: 52, mode: "minor", bpm: 84, bars: 8, echo: 0.38, cutoff: 3000,
      chords: "0 0 5 5 | 3 3 4 4",
      parts: {
        lead:  { wave: "p25", vol: 0.11, oct: 1, vib: 0.6,
          notes: "4 - - - 2 - 1 - | 0 - - - - - . . | 5 - - 4 7 - - - | 5 - - - - - . . |" +
                 "3 - 5 - 7 - 5 - | 3 - 2 - 0 - . . | 1 - - - 4 - 3 - | 4 - - - - - . ." },
        pad:   { wave: "saw", vol: 0.025, oct: 0, cut: 800 },
        bass:  { wave: "tri", vol: 0.24, oct: -1, style: "half" },
        arp:   { wave: "p12", vol: 0.035, oct: 1, style: "up8", env: "pluck" },
        drums: { vol: 0.45, k: D("x.........x....."), h: D("........x.......") }
      }
    },

    // ---------------- 3. Квартали Дубової Застави ----------------
    city_south: {
      title: "Гамір найманців", group: "Південний район",
      root: 57, mode: "dorian", bpm: 126, bars: 8, swing: 0.18, echo: 0.12,
      chords: "0 3 0 4 | 0 3 6 4",
      parts: {
        lead:  { wave: "p25", vol: 0.12, oct: 1, env: "lead",
          notes: "4 4 5 4 2 - 0 - | 3 - 5 - 7 - 5 3 | 4 - 2 - 0 2 4 5 | 4 - - - 1 - . . |" +
                 "7 7 6 5 4 - 2 - | 5 - 3 5 7 - 5 - | 6 - 5 - 3 - 1 - | 4 - 1 - 4 - . ." },
        bass:  { wave: "tri", vol: 0.25, oct: -1, style: "octave" },
        arp:   { wave: "p12", vol: 0.05, oct: 0, style: "stab" },
        drums: { vol: 0.5, k: D("x.......x......."), s: D("....x.......x..."), h: D("x.x.x.x.x.x.x.x.") }
      }
    },
    city_center: {
      title: "Площа з фонтаном", group: "Центральний район",
      root: 48, mode: "major", bpm: 92, bars: 16, echo: 0.3,
      chords: "0 3 4 0 | 5 3 1 4",
      parts: {
        lead:  { wave: "sq", vol: 0.07, oct: 1, vib: 0.3,
          notes: "4 - 2 - 0 - 2 4 | 5 - - - 3 - - - | 4 - 6 - 8 - 6 - | 7 - - - - - . . |" +
                 "7 - 5 - 2 - 0 2 | 3 - 5 - 7 - 5 - | 8 - 7 - 5 - 3 - | 4 - - - 6 - . ." },
        lead2: { wave: "bell", vol: 0.06, oct: 2, env: "bell", notes: "@lead", from: 8 },
        pad:   { wave: "tri", vol: 0.03, oct: 0 },
        bass:  { wave: "tri", vol: 0.22, oct: -1, style: "half" },
        arp:   { wave: "bell", vol: 0.035, oct: 2, style: "twinkle", env: "bell" },
        drums: { vol: 0.3, h: D("....x.......x...") }
      }
    },
    city_trade: {
      title: "Торгові ряди", group: "Торговий район",
      root: 53, mode: "major", bpm: 138, bars: 8, echo: 0.1,
      chords: "0 0 3 4 | 0 5 3 4",
      parts: {
        lead:  { wave: "p12", vol: 0.12, oct: 1, env: "stacc",
          notes: "0 2 4 2 0 2 4 7 | 9 - 7 - 4 - . . | 3 5 7 5 3 5 7 8 | 6 - 4 - 1 - . . |" +
                 "7 - 4 - 2 4 7 9 | 9 - 7 - 5 - . . | 5 4 3 - 7 5 3 - | 4 - 6 - 8 - 7 -" },
        bass:  { wave: "tri", vol: 0.25, oct: -1, style: "walk" },
        arp:   { wave: "p25", vol: 0.045, oct: 0, style: "stab" },
        drums: { vol: 0.5, k: D("x...x...x...x..."), s: D("....x.......x..."), h: D("..x...x...x...x.") }
      }
    },
    city_rest: {
      title: "Тихі вулички", group: "Спальний район",
      root: 55, mode: "major", bpm: 70, bars: 16, echo: 0.3,
      chords: "0 2 3 0 | 5 3 4 4",
      parts: {
        lead:  { wave: "tri", vol: 0.2, oct: 1, vib: 0.4,
          notes: "4 - - 2 0 - - - | 2 - - 4 6 - - - | 5 - - 4 3 - - - | 2 - - - - - . . |" +
                 "5 - - 4 2 - - - | 3 - - 5 7 - - - | 6 - - 5 4 - 1 - | 4 - - - - - . ." },
        lead2: { wave: "bell", vol: 0.05, oct: 2, env: "bell", notes: "@lead", from: 8 },
        pad:   { wave: "sine", vol: 0.04, oct: 0 },
        bass:  { wave: "tri", vol: 0.2, oct: -1, style: "half" },
        arp:   { wave: "bell", vol: 0.03, oct: 1, style: "up8", env: "bell" }
      }
    },
    city_north: {
      title: "Головна брама", group: "Північний район",
      root: 50, mode: "minor", bpm: 100, bars: 8, echo: 0.15,
      chords: "0 0 6 6 | 5 5 4M 4M",
      parts: {
        lead:  { wave: "saw", vol: 0.09, oct: 1, cut: 2200, vib: 0.3,
          notes: "0 - - 0 2 - 4 - | 7 - - - 4 - . . | 6 - - 6 8 - 6 - | 3 - - - - - . . |" +
                 "5 - - 5 7 - 9 - | 9 - 7 - 5 - . . | 4 - - 4 6# - 8 - | 4 - - - 1 - . ." },
        pad:   { wave: "saw", vol: 0.02, oct: 0, cut: 900 },
        bass:  { wave: "tri", vol: 0.25, oct: -1, style: "pulse" },
        drums: { vol: 0.5, k: D("x.......x......."), s: D("x.x.xxx.x.x.xxx."), c: "x" + rest(127) }
      }
    },

    // ---------------- 4. Бойові локації ----------------
    battle_farm: {
      title: "Щури в коморі", group: "Бій · Ферма",
      root: 48, mode: "mixo", bpm: 144, bars: 8, echo: 0.1,
      chords: "0 6 0 6 | 3 3 4M 4M",
      parts: {
        lead:  { wave: "p25", vol: 0.12, oct: 1, env: "stacc",
          notes: "0 . 0 2 4 . 2 0 | 6 . 8 . 10 . 8 6 | 7 . 7 9 11 . 9 7 | 13 - 10 - 8 - . . |" +
                 "3 4 5 . 3 . 0 . | 5 4 3 . 7 . . . | 4 . 6# . 8 . 6# . | 4 6# 8 11 . . . ." },
        bass:  { wave: "tri", vol: 0.25, oct: -1, style: "octave" },
        arp:   { wave: "p12", vol: 0.04, oct: 0, style: "stab" },
        drums: { vol: 0.55, k: D("x...x...x...x..."), s: D("....x.......x..x"), h: D("x.x.x.x.x.x.x.x.") }
      }
    },
    battle_forest: {
      title: "Вовча стежка", group: "Бій · Лісова стежка",
      root: 57, mode: "minor", bpm: 152, bars: 8, echo: 0.12,
      chords: "0 0 5 6 | 0 0 3 4M",
      parts: {
        lead:  { wave: "p25", vol: 0.12, oct: 1, vib: 0.3,
          notes: "4 - 3 4 7 - 4 - | 2 - 1 2 4 - . . | 5 - 4 5 7 - 9 - | 8 - 6 - 3 - 1 - |" +
                 "7 - 7 6 7 - 9 - | 11 - 9 - 7 - . . | 10 - 8 - 7 - 5 - | 6# - 4 - 1 - 4 6#" },
        bass:  { wave: "tri", vol: 0.26, oct: -1, style: "gallop" },
        arp:   { wave: "p12", vol: 0.035, oct: 1, style: "up16" },
        drums: { vol: 0.55, k: D("x.x...x.x.x...x."), s: D("....x.......x..."), h: D("x.x.x.x.x.x.x.x.") }
      }
    },
    battle_cave: {
      title: "Слизька печера", group: "Бій · Печера в лісі",
      root: 50, mode: "dorian", bpm: 124, bars: 8, echo: 0.42, cutoff: 3200,
      chords: "0 0 3 3 | 6 6 4 4",
      parts: {
        lead:  { wave: "sq", vol: 0.09, oct: 1, env: "stacc", slide: -3,
          notes: "0 . 2 . 4 . 2 . | 5 - 4 - 2 - . . | 3 . 5 . 7 . 5 . | 8 - 7 - 5 - . . |" +
                 "6 . 8 . 10 . 8 . | 11 - 10 - 8 - . . | 4 . 6 . 8 . 11 - | - - 8 - 4 - . ." },
        bass:  { wave: "tri", vol: 0.26, oct: -1, style: "octave" },
        arp:   { wave: "sine", vol: 0.06, oct: 2, style: "twinkle", env: "pluck" },
        drums: { vol: 0.5, k: D("x.....x...x....."), s: D("....x.......x..."), h: D("..x...x...x...x.") }
      }
    },
    battle_dk_edge: {
      title: "Похмуре узлісся", group: "Бій · Похмуре узлісся",
      root: 52, mode: "phrygian", bpm: 144, bars: 8, echo: 0.15, cutoff: 6000,
      chords: "0 0 1 1 | 0 0 6 5",
      parts: {
        lead:  { wave: "p25", vol: 0.12, oct: 1, vib: 0.3,
          notes: "0 - 1 0 4 - 2 - | 4 - 5 4 2 - . . | 5 - 3 - 1 - 3 5 | 8 - - - 5 - . . |" +
                 "7 - 8 7 4 - 2 - | 4 - 2 1 0 - . . | 6 - 8 - 10 - 8 - | 7 - 5 - 2 - 1 -" },
        bass:  { wave: "tri", vol: 0.26, oct: -1, style: "drive" },
        arp:   { wave: "p12", vol: 0.035, oct: 1, style: "up16" },
        drums: { vol: 0.55, k: D("x...x...x...x..x"), s: D("....x.......x..."), h: D("x.x.x.x.x.x.x.x.") }
      }
    },
    battle_dk_marsh: {
      title: "Туманні болота", group: "Бій · Туманні болота",
      root: 49, mode: "harm", bpm: 112, bars: 8, echo: 0.45, cutoff: 2400,
      chords: "0 0 5 5 | 3 3 4 4",
      parts: {
        lead:  { wave: "sq", vol: 0.08, oct: 1, vib: 0.9,
          notes: "0 - - 1 2 - - 1 | 0 - - - - - . . | 5 - - 4 2 - - 4 | 5 - - - 7 - . . |" +
                 "3 - - 5 7 - - 5 | 3 - - - - - . . | 4 - - 6 8 - - 6 | 4 - - - - - . ." },
        pad:   { wave: "saw", vol: 0.022, oct: 0, cut: 700 },
        bass:  { wave: "tri", vol: 0.28, oct: -1, style: "pulse" },
        arp:   { wave: "sine", vol: 0.05, oct: 1, style: "broken8", env: "pluck", slide: 5 },
        drums: { vol: 0.55, k: D("x.......x..x...."), s: D("........x......."), h: D("..x...x...x...x.") }
      }
    },
    battle_dk_grave: {
      title: "Старе кладовище", group: "Бій · Старе кладовище",
      root: 59, mode: "harm", bpm: 132, bars: 8, echo: 0.25, cutoff: 5000,
      chords: "0 3 0 4 | 5 3 6 4",
      parts: {
        lead:  { wave: "organ", vol: 0.12, oct: 0, vib: 0.4,
          notes: "4 - 2 - 0 - 2 - | 3 - 5 - 7 - 5 - | 9 - 7 - 4 - 2 - | 1 - 6 - 4 - . . |" +
                 "5 - 7 - 9 - 7 - | 10 - 9 - 7 - 5 - | 6 - 8 - 10 - 8 - | 4 - - - 6 - 8 -" },
        bass:  { wave: "tri", vol: 0.26, oct: -2, style: "drive" },
        arp:   { wave: "p12", vol: 0.035, oct: 0, style: "updown16" },
        drums: { vol: 0.5, k: D("x...x...x...x..."), s: D("....x.......x..."), h: D("x.x.x.x.x.x.x.x.") }
      }
    },
    battle_dk_webs: {
      title: "Ліс павутини", group: "Бій · Ліс павутини",
      root: 54, mode: "phrygian", bpm: 156, bars: 8, echo: 0.2,
      chords: "0 1 0 1 | 5 6 1 0",
      parts: {
        lead:  { wave: "sq", vol: 0.08, oct: 1, env: "stacc",
          notes: "7 . . 8 7 . . . | 8 . . 10 8 . 5 . | 9 . . 8 7 . 4 . | 8 - - - 1 . . . |" +
                 "5 . 7 . 9 . 12 . | 13 . 10 . 8 . 6 . | 8 . 10 . 12 . 10 . | 7 - - - - - . ." },
        bass:  { wave: "tri", vol: 0.26, oct: -1, style: "drive" },
        arp:   { wave: "p12", vol: 0.04, oct: 1, style: "crawl" },
        drums: { vol: 0.5, k: D("x..x..x.x..x..x."), s: D("....x.......x..."), h: D("xxxxxxxxxxxxxxxx") }
      }
    },
    battle_dk_ravine: {
      title: "Вовкулачий яр", group: "Бій · Вовкулачий яр",
      root: 57, mode: "minor", bpm: 164, bars: 8, echo: 0.12,
      chords: "0 0 5 4M | 3 3 5 4M",
      parts: {
        lead:  { wave: "saw", vol: 0.08, oct: 1, cut: 2600, vib: 0.3,
          notes: "0 - 0 - 2 0 4 - | 7 - 4 - 2 - 0 - | 5 - 7 - 9 - 7 5 | 4 - 6# - 8 - . . |" +
                 "3 - 5 - 7 - 10 - | 10 - 9 7 5 - . . | 9 - 7 5 7 - 9 - | 11 - - - 6# - 8 -" },
        bass:  { wave: "tri", vol: 0.26, oct: -1, style: "gallop" },
        drums: { vol: 0.55, k: D("x..x..x.x..x..x."), t: D("..x...x...x.x.x."), s: D("....x.......x..."), h: D("x.x.x.x.x.x.x.x.") }
      }
    },
    battle_dk_ruins: {
      title: "Руїни відьминої вежі", group: "Бій · Руїни відьминої вежі",
      root: 52, mode: "phrdom", bpm: 136, bars: 8, echo: 0.3,
      chords: "0 1 0 1 | 3 1 6 0",
      parts: {
        lead:  { wave: "p25", vol: 0.11, oct: 1, vib: 0.7,
          notes: "4 - 2 1 2 - 0 - | 3 - 5 - 1 - . . | 7 - 8 - 7 - 4 - | 8 - 10 - 12 - 10 8 |" +
                 "10 - 7 - 5 - 3 - | 5 - 3 - 1 - 3 - | 6 - 8 - 10 - 8 6 | 7 - 4 - 2 - 1 -" },
        pad:   { wave: "organ", vol: 0.02, oct: 0, cut: 1500 },
        bass:  { wave: "tri", vol: 0.26, oct: -1, style: "drive" },
        arp:   { wave: "p12", vol: 0.035, oct: 1, style: "updown16" },
        drums: { vol: 0.5, k: D("x...x...x...x..."), s: D("....x..x....x..."), h: D("..x...x...x...x.") }
      }
    },
    battle_dk_heart: {
      title: "Серце Темного лісу", group: "Бій · Серце Темного лісу",
      root: 50, mode: "minor", bpm: 150, bars: 16, echo: 0.18,
      chords: "0 5 6 4M | 0 5 3 4M",
      parts: {
        lead:  { wave: "saw", vol: 0.08, oct: 1, cut: 3000, vib: 0.4,
          notes: "7 - - 4 7 - 9 - | 12 - - 9 7 - 5 - | 8 - - 6 8 - 10 - | 11 - - - 13# - 11 - |" +
                 "14 - - 11 9 - 7 - | 12 - 9 - 7 - 5 - | 10 - 12 - 14 - 12 10 | 11 - - - 8 - 6# -" },
        lead2: { wave: "p25", vol: 0.06, oct: 1, notes: "@lead", shift: -2, from: 8 },
        pad:   { wave: "saw", vol: 0.018, oct: 0, cut: 1000 },
        bass:  { wave: "tri", vol: 0.27, oct: -1, style: "octave" },
        arp:   { wave: "p12", vol: 0.035, oct: 1, style: "up16" },
        drums: { vol: 0.55, k: D("x...x...x...x.x."), s: D("....x.......x..."), h: D("x.x.x.x.x.x.x.x."), c: "x" + rest(127) }
      }
    },
    battle_boss: {
      title: "Володар", group: "Бій · Бос данжу",
      root: 48, mode: "harm", bpm: 170, bars: 16, echo: 0.15,
      chords: "0 0 5 5 | 3 3 4 4",
      parts: {
        lead:  { wave: "saw", vol: 0.08, oct: 1, cut: 3200, vib: 0.3,
          notes: "0 - 2 - 4 - 7 - | 9 - 7 6 7 - 4 - | 5 - 7 - 9 - 12 - | 12 - 9 - 7 - 5 - |" +
                 "3 - 5 - 7 - 10 - | 10 - 12 - 14 - 12 - | 11 - 13 - 15 - 13 - | 11 - - - 6 - 8 -" },
        lead2: { wave: "p25", vol: 0.06, oct: 1, notes: "@lead", shift: -2, from: 8 },
        pad:   { wave: "saw", vol: 0.018, oct: 0, cut: 1000 },
        bass:  { wave: "tri", vol: 0.27, oct: -1, style: "gallop" },
        arp:   { wave: "p12", vol: 0.035, oct: 1, style: "updown16" },
        drums: { vol: 0.55, k: D("x.x.x.x.x.x.x.x."), s: D("....x.......x..."), h: D("xxxxxxxxxxxxxxxx"), c: "x" + rest(127) }
      }
    },

    // ---------------- Джингли (без повтору) ----------------
    victory: {
      title: "Перемога", group: "Джингл", loop: false,
      root: 48, mode: "major", bpm: 140, bars: 3, echo: 0.15,
      chords: "0 4 0",
      parts: {
        lead:  { wave: "p25", vol: 0.13, oct: 1, notes: "0 2 4 - 7 - - . | 6 - 4 - 6 8 11 - | 7 - - - - - - ." },
        lead2: { wave: "p12", vol: 0.07, oct: 1, notes: "@lead", shift: -2 },
        bass:  { wave: "tri", vol: 0.25, oct: -1, style: "pulse" },
        drums: { vol: 0.5, k: D("x...x...x...x...") + D("x...x...x...x...") + D("x..............."),
                 s: rest(16) + D("....x...x.x.xxxx") + rest(16), c: rest(32) + "x" + rest(15) }
      }
    },
    defeat: {
      title: "Поразка", group: "Джингл", loop: false,
      root: 57, mode: "minor", bpm: 70, bars: 3, echo: 0.3,
      chords: "3 4M 0",
      parts: {
        lead:  { wave: "p25", vol: 0.12, oct: 1, vib: 0.6, notes: "5 - 4 - 3 - 1 - | 6# - - - 4 - - - | 0 - - - - - - ." },
        pad:   { wave: "saw", vol: 0.025, oct: 0, cut: 900 },
        bass:  { wave: "tri", vol: 0.22, oct: -1, style: "half" },
        drums: { vol: 0.5, t: rest(32) + "x" + rest(15) }
      }
    },
    levelup: {
      title: "Новий рівень", group: "Джингл", loop: false,
      root: 55, mode: "major", bpm: 150, bars: 2,
      chords: "0 0",
      parts: {
        lead:  { wave: "p25", vol: 0.12, oct: 1, mres: 1,
          notes: "0 2 4 7 2 4 7 9 4 7 9 11 14 - - - | 14 - - - - - - - . . . . . . . ." },
        lead2: { wave: "p12", vol: 0.06, oct: 1, mres: 1, notes: "@lead", shift: -2 },
        bass:  { wave: "tri", vol: 0.22, oct: -1, style: "pulse" },
        drums: { vol: 0.45, c: rest(12) + "x" + rest(19) }
      }
    }
  };

  // Другий прохід для коротких треків: пісня грає двічі, і на другому разі
  // до мелодії додається підголосок на терцію нижче — менше відчуття повтору.
  for (const id in TRACKS) {
    const d = TRACKS[id], L = d.parts.lead;
    if (d.loop === false || d.parts.lead2 || !L || d.bars !== 8) continue;
    d.bars = 16;
    d.parts.lead2 = { wave: L.wave === "p25" ? "p12" : "p25", vol: L.vol * 0.55, oct: L.oct, env: L.env,
      vib: L.vib, notes: "@lead", shift: -2, from: 8 };
  }

  // ---------- Яка музика в якій сцені гри ----------
  // ID регіонів/районів/локацій — як у data/enemies.js та data/routes.js
  const SCENES = {
    menu: "menu",
    map: { start: "map_start", dark: "map_dark" },
    city: { south: "city_south", center: "city_center", trade: "city_trade", rest: "city_rest", north: "city_north" },
    combat: {
      village_start: "battle_farm", forest_path: "battle_forest", forest_cave: "battle_cave",
      dk_edge: "battle_dk_edge", dk_marsh: "battle_dk_marsh", dk_grave: "battle_dk_grave",
      dk_webs: "battle_dk_webs", dk_ravine: "battle_dk_ravine", dk_ruins: "battle_dk_ruins",
      dk_heart: "battle_dk_heart"
    },
    boss: "battle_boss"
  };

  // ============================================================
  // ПІДГОТОВКА ТРЕКУ (розбір нот і акордів)
  // ============================================================
  function expand(str) {
    const out = [];
    for (const tok of str.replace(/\|/g, " ").split(/\s+/)) {
      if (!tok) continue;
      const m = tok.match(/^(.+)\*(\d+)$/);
      if (m) for (let i = 0; i < +m[2]; i++) out.push(m[1]);
      else out.push(tok);
    }
    return out;
  }

  function parseMelody(tokens, mode, shift) {
    const ev = new Array(tokens.length).fill(null);
    for (let i = 0; i < tokens.length; i++) {
      const m = tokens[i].match(/^(-?\d+)([#b]?)$/);
      if (!m) continue;
      let len = 1;
      while (i + len < tokens.length && tokens[i + len] === "-") len++;
      const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
      ev[i] = { semi: degSemi(mode, +m[1] + (shift || 0)) + acc, len };
    }
    return ev;
  }

  function parseChords(str, mode) {
    return expand(str).map((tok) => {
      const m = tok.match(/^(-?\d+)([Mm]?)$/);
      const d = +m[1];
      const r = degSemi(mode, d);
      const third = m[2] === "M" ? r + 4 : m[2] === "m" ? r + 3 : degSemi(mode, d + 2);
      return { r, tones: [r, third, degSemi(mode, d + 4)] };
    });
  }

  const prepared = {};
  function prep(id) {
    if (prepared[id]) return prepared[id];
    const def = TRACKS[id];
    if (!def) return null;
    const mode = MODES[def.mode] || MODES.major;
    const chords = parseChords(def.chords, mode);
    const parts = [];
    const tokensOf = {};
    for (const name in def.parts) {
      const p = Object.assign({ name }, def.parts[name]);
      if (name === "drums") {
        p.kind = "drums";
        p.lanes = ["k", "s", "h", "o", "t", "c"].filter((k) => p[k]).map((k) => ({ k, pat: p[k] }));
      } else if (p.notes) {
        p.kind = "mel";
        p.mres = p.mres || 2;
        const toks = p.notes[0] === "@" ? tokensOf[p.notes.slice(1)] : expand(p.notes);
        tokensOf[name] = toks;
        p.ev = parseMelody(toks, mode, p.shift);
      } else if (name.startsWith("bass")) p.kind = "bass";
      else if (name.startsWith("pad")) p.kind = "pad";
      else p.kind = "arp";
      parts.push(p);
    }
    const bars = def.bars || chords.length;
    return (prepared[id] = { id, def, mode, chords, parts, bars, stepDur: 60 / def.bpm / 4, loop: def.loop !== false });
  }

  // ============================================================
  // ПРОГРАВАЧ ТРЕКУ
  // ============================================================
  function createInstance(ctx, dest, id) {
    const T = prep(id);
    if (!T) return null;
    const def = T.def;
    const gain = ctx.createGain();
    gain.connect(dest);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = def.cutoff || 14000;
    lp.Q.value = 0.4;
    lp.connect(gain);
    const mix = ctx.createGain();
    mix.connect(lp);
    if (def.echo) {
      const send = ctx.createGain(); send.gain.value = def.echo;
      const dl = ctx.createDelay(2); dl.delayTime.value = T.stepDur * 3;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const dlp = ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 2600;
      mix.connect(send); send.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(lp);
    }
    const outs = {};
    for (const p of T.parts) {
      if (p.cut) {
        const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = p.cut; f.Q.value = 0.7;
        f.connect(mix);
        outs[p.name] = f;
      } else outs[p.name] = mix;
    }
    return { id, T, ctx, gain, outs, step: 0, next: 0, total: T.bars * 16 };
  }

  const ARP = {
    up16: [0, 1, 2, 3], updown16: [0, 1, 2, 3, 2, 1], crawl: [0, 1, 0, 2, 1, 2, 3, 2],
    up8: [0, 1, 2, 3], broken8: [0, 2, 1, 2]
  };

  function scheduleStep(I, s, t) {
    const T = I.T, def = T.def, ctx = I.ctx, sd = T.stepDur;
    const barAbs = Math.floor(s / 16), pos = s % 16;
    const bar = barAbs % T.bars;
    const ch = T.chords[bar % T.chords.length];
    const root = def.root;
    if (def.swing && pos % 4 === 2) t += def.swing * sd;

    for (const p of T.parts) {
      if (p.from != null && bar < p.from) continue;
      if (p.until != null && bar >= p.until) continue;
      const out = I.outs[p.name];
      const base = root + 12 * (p.oct || 0);

      if (p.kind === "mel") {
        if (s % p.mres) continue;
        const ev = p.ev[(s / p.mres) % p.ev.length];
        if (ev) voice(ctx, out, t, ev.len * p.mres * sd * 0.92, base + ev.semi, p);
      } else if (p.kind === "bass") {
        const r = base + ch.r, fifth = base + ch.tones[2];
        const b = Object.assign({ env: "bass" }, p);
        const st = p.style;
        if (st === "drone") {
          if (pos === 0) { voice(ctx, out, t, sd * 16 * 0.95, r, b); voice(ctx, out, t, sd * 16 * 0.95, fifth, Object.assign({}, b, { vol: p.vol * 0.5 })); }
        } else if (st === "half") {
          if (pos === 0) voice(ctx, out, t, sd * 7.5, r, b);
          if (pos === 8) voice(ctx, out, t, sd * 7.5, fifth, b);
        } else if (st === "pulse") {
          if (pos % 4 === 0) voice(ctx, out, t, sd * 3, r, b);
        } else if (st === "drive") {
          if (pos % 2 === 0) voice(ctx, out, t, sd * 1.6, r, b);
        } else if (st === "octave") {
          if (pos % 2 === 0) voice(ctx, out, t, sd * 1.6, pos % 4 === 0 ? r : r + 12, b);
        } else if (st === "gallop") {
          if (pos % 4 !== 1) voice(ctx, out, t, sd * 0.85, r, b);
        } else if (st === "walk") {
          if (pos % 4 === 0) {
            const walk = [r, base + ch.tones[1], fifth, fifth + 2];
            voice(ctx, out, t, sd * 3.4, walk[pos / 4], b);
          }
        }
      } else if (p.kind === "pad") {
        if (pos === 0) for (const tn of ch.tones) voice(ctx, out, t, sd * 15.5, base + 12 + tn, Object.assign({ env: "pad", chorus: true }, p));
      } else if (p.kind === "arp") {
        const tones = [ch.tones[0], ch.tones[1], ch.tones[2], ch.tones[0] + 12];
        const a = Object.assign({ env: "pluck" }, p);
        const st = p.style;
        if (ARP[st]) {
          const rate = st.endsWith("8") ? 2 : 1;
          if (s % rate) continue;
          const seq = ARP[st];
          const k = (s / rate) % seq.length;
          voice(ctx, out, t, sd * rate * 0.9, base + 12 + tones[seq[k]], a);
        } else if (st === "strum" || st === "strum8") {
          const every = st === "strum" ? 4 : 2;
          if (pos % every === 0) {
            const lo = pos % 4 === 0;
            tones.forEach((tn, i) => voice(ctx, out, t + i * 0.018, sd * every, base + 12 + tn, Object.assign({}, a, { vol: p.vol * (lo ? 1 : 0.6) })));
          }
        } else if (st === "stab") {
          if (pos % 4 === 2) for (const tn of tones.slice(0, 3)) voice(ctx, out, t, sd * 0.8, base + 12 + tn, Object.assign({}, a, { env: "stacc" }));
        } else if (st === "twinkle") {
          // «краплі»/«бризки фонтану»: псевдовипадкові високі ноти акорду
          const h = Math.sin((s + 1) * 12.9898) * 43758.5453;
          const rnd = h - Math.floor(h);
          if (rnd < 0.4) voice(ctx, out, t, sd, base + 12 + tones[Math.floor(rnd * 10) % 4] + (rnd < 0.15 ? 12 : 0), a);
        }
      } else if (p.kind === "drums") {
        for (const L of p.lanes) {
          const c = L.pat[s % L.pat.length];
          if (c && c !== ".") drum(ctx, out, t, L.k, p.vol * (c === "X" ? 1.3 : 1));
        }
      }
    }
  }

  // ============================================================
  // ЗВУКОВІ ЕФЕКТИ
  // ============================================================
  function nz(ctx, out, t, o) {
    // o: { dur, vol, type, f0, f1, q, a }
    const s = noiseSrc(ctx, t, o.dur + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = o.type || "bandpass";
    f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + (o.a || 0.005));
    g.gain.setTargetAtTime(0, t + (o.a || 0.005), o.dur / 3);
    s.connect(f); f.connect(g); g.connect(out);
  }
  function tn(ctx, out, t, o) {
    // o: { wave, f0, f1, dur, vol, a }
    const osc = ctx.createOscillator();
    setWave(ctx, osc, o.wave || "sine");
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + (o.a || 0.004));
    g.gain.setTargetAtTime(0, t + (o.a || 0.004), o.dur / 3);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + (o.a || 0) + o.dur * 2.5 + 0.05);
  }
  const notes = (ctx, out, t, list, gap, o) =>
    list.forEach((m, i) => voice(ctx, out, t + i * gap, o.dur || 0.2, m, o));

  const SFX = {
    // --- атакуючі: зброя ---
    sword(c, o, t) {
      nz(c, o, t, { f0: 1200, f1: 4500, dur: 0.1, vol: 0.35, q: 2 });
      nz(c, o, t + 0.08, { type: "lowpass", f0: 900, dur: 0.06, vol: 0.5 });
      tn(c, o, t + 0.08, { f0: 2350, dur: 0.25, vol: 0.06 });
      tn(c, o, t + 0.08, { f0: 3520, dur: 0.18, vol: 0.04 });
    },
    dagger(c, o, t) {
      nz(c, o, t, { f0: 3000, f1: 7000, dur: 0.06, vol: 0.3, q: 2 });
      tn(c, o, t + 0.05, { wave: "sq", f0: 2800, f1: 1800, dur: 0.03, vol: 0.06 });
      nz(c, o, t + 0.05, { type: "lowpass", f0: 1400, dur: 0.04, vol: 0.35 });
    },
    axe(c, o, t) {
      nz(c, o, t, { f0: 500, f1: 1600, dur: 0.14, vol: 0.4, q: 1.5 });
      nz(c, o, t + 0.12, { type: "lowpass", f0: 700, dur: 0.12, vol: 0.7 });
      tn(c, o, t + 0.12, { f0: 130, f1: 45, dur: 0.15, vol: 0.6 });
    },
    bow(c, o, t) {
      tn(c, o, t, { wave: "tri", f0: 330, f1: 300, dur: 0.18, vol: 0.3 });
      tn(c, o, t, { wave: "p25", f0: 165, f1: 150, dur: 0.12, vol: 0.06 });
      nz(c, o, t + 0.04, { f0: 2000, f1: 5500, dur: 0.18, vol: 0.18, q: 3 });
      nz(c, o, t + 0.24, { type: "lowpass", f0: 1100, dur: 0.04, vol: 0.4 });
    },
    blunt(c, o, t) {
      nz(c, o, t, { f0: 600, f1: 1200, dur: 0.08, vol: 0.2, q: 1 });
      nz(c, o, t + 0.06, { type: "lowpass", f0: 500, dur: 0.09, vol: 0.6 });
      tn(c, o, t + 0.06, { f0: 180, f1: 60, dur: 0.12, vol: 0.5 });
    },
    poison(c, o, t) {
      SFX.dagger(c, o, t);
      for (let i = 0; i < 6; i++) tn(c, o, t + 0.08 + i * 0.05, { f0: 380 + ((i * 97) % 300), f1: 800 + i * 60, dur: 0.04, vol: 0.12 });
    },
    // --- атакуючі: магія ---
    fire(c, o, t) {
      nz(c, o, t, { type: "lowpass", f0: 300, f1: 3200, dur: 0.35, vol: 0.55, a: 0.05 });
      tn(c, o, t, { f0: 75, f1: 55, dur: 0.4, vol: 0.35 });
      for (let i = 0; i < 10; i++) nz(c, o, t + 0.1 + i * 0.045 + (i % 3) * 0.012, { type: "highpass", f0: 3000, dur: 0.012, vol: 0.18 });
    },
    fireblast(c, o, t) {
      nz(c, o, t, { type: "lowpass", f0: 200, f1: 2500, dur: 0.25, vol: 0.5, a: 0.08 });
      nz(c, o, t + 0.22, { type: "lowpass", f0: 1500, f1: 200, dur: 0.6, vol: 0.8 });
      tn(c, o, t + 0.22, { f0: 110, f1: 32, dur: 0.5, vol: 0.7 });
      for (let i = 0; i < 14; i++) nz(c, o, t + 0.3 + i * 0.04 + (i % 4) * 0.01, { type: "highpass", f0: 2500, dur: 0.015, vol: 0.18 });
    },
    ice(c, o, t) {
      tn(c, o, t, { wave: "p12", f0: 1400, f1: 3200, dur: 0.15, vol: 0.06 });
      nz(c, o, t, { f0: 4000, f1: 8000, dur: 0.15, vol: 0.12, q: 4 });
      nz(c, o, t + 0.15, { type: "highpass", f0: 3000, dur: 0.05, vol: 0.45 });
      notes(c, o, t + 0.16, [96, 103, 100], 0.04, { wave: "bell", env: "bell", vol: 0.07 });
    },
    wind(c, o, t) {
      const s = noiseSrc(c, t, 0.6);
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 4;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(3000, t + 0.22);
      f.frequency.exponentialRampToValueAtTime(700, t + 0.5);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 0.15); g.gain.setTargetAtTime(0, t + 0.25, 0.1);
      s.connect(f); f.connect(g); g.connect(o);
      SFX.dagger(c, o, t + 0.22);
    },
    storm(c, o, t) {
      SFX.wind(c, o, t);
      SFX.wind(c, o, t + 0.25);
      nz(c, o, t, { type: "lowpass", f0: 250, dur: 1.0, vol: 0.4, a: 0.3 });
    },
    earth(c, o, t) {
      tn(c, o, t, { f0: 70, f1: 35, dur: 0.45, vol: 0.75 });
      nz(c, o, t, { type: "lowpass", f0: 400, f1: 150, dur: 0.4, vol: 0.6 });
      for (let i = 0; i < 5; i++) nz(c, o, t + 0.08 + i * 0.06, { type: "bandpass", f0: 900 + i * 200, dur: 0.03, vol: 0.25, q: 3 });
    },
    quake(c, o, t) {
      for (let i = 0; i < 4; i++) {
        tn(c, o, t + i * 0.22, { f0: 60, f1: 32, dur: 0.4, vol: 0.6 });
        nz(c, o, t + i * 0.22, { type: "lowpass", f0: 300, dur: 0.3, vol: 0.5 });
      }
      for (let i = 0; i < 10; i++) nz(c, o, t + 0.1 + i * 0.08, { type: "bandpass", f0: 700 + (i % 4) * 250, dur: 0.03, vol: 0.2, q: 3 });
    },
    holy(c, o, t) {
      nz(c, o, t, { type: "highpass", f0: 5000, dur: 0.4, vol: 0.12, a: 0.1 });
      notes(c, o, t, [72, 76, 79, 84, 88], 0.035, { wave: "p25", env: "pluck", vol: 0.08, ring: 1.6 });
      notes(c, o, t + 0.17, [96, 100], 0.0, { wave: "bell", env: "bell", vol: 0.06 });
    },
    smite(c, o, t) {
      SFX.holy(c, o, t);
      SFX.sword(c, o, t + 0.15);
    },
    // --- відновлюючі ---
    heal(c, o, t) {
      notes(c, o, t, [72, 74, 76, 79, 81, 84, 88], 0.06, { wave: "sine", env: "ring", vol: 0.12 });
      notes(c, o, t + 0.03, [84, 86, 88, 91, 93, 96], 0.06, { wave: "p12", env: "pluck", vol: 0.025 });
      nz(c, o, t, { type: "highpass", f0: 6000, dur: 0.6, vol: 0.06, a: 0.2 });
    },
    bless(c, o, t) {
      [79, 83, 86, 91].forEach((m, i) => voice(c, o, t + i * 0.05, 0.6, m, { wave: "bell", env: "bell", vol: 0.08 }));
      [55, 62, 67, 71].forEach((m) => voice(c, o, t, 0.7, m, { wave: "saw", env: "pad", vol: 0.025, chorus: true }));
    },
    prayer(c, o, t) {
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1600; f.connect(o);
      [60, 64, 67, 72].forEach((m) => voice(c, f, t, 0.9, m, { wave: "saw", env: "pad", vol: 0.04, chorus: true, vib: 0.3 }));
      voice(c, o, t + 0.3, 0.5, 96, { wave: "bell", env: "bell", vol: 0.06 });
      nz(c, o, t, { type: "highpass", f0: 7000, dur: 1.0, vol: 0.05, a: 0.4 });
    },
    meditate(c, o, t) {
      [1, 2.32, 3.9, 5.1].forEach((k, i) => tn(c, o, t, { f0: 110 * k, dur: 1.6 / (1 + i * 0.6), vol: 0.35 / (1 + i) }));
      nz(c, o, t + 0.1, { type: "bandpass", f0: 900, dur: 1.0, vol: 0.06, a: 0.4, q: 0.8 });
    },
    potion(c, o, t) {
      for (let i = 0; i < 4; i++) tn(c, o, t + i * 0.08, { f0: 260 + i * 40, f1: 520 + i * 60, dur: 0.06, vol: 0.18 });
      notes(c, o, t + 0.34, [84, 88, 91], 0.04, { wave: "bell", env: "bell", vol: 0.05 });
    },
    // --- посилення / захист ---
    buff(c, o, t) {
      notes(c, o, t, [60, 64, 67, 72, 76], 0.05, { wave: "p25", env: "pluck", vol: 0.09 });
      nz(c, o, t, { f0: 500, f1: 4000, dur: 0.3, vol: 0.12, q: 2 });
    },
    warcry(c, o, t) {
      tn(c, o, t, { wave: "saw", f0: 140, f1: 230, dur: 0.35, vol: 0.18, a: 0.04 });
      tn(c, o, t, { wave: "saw", f0: 147, f1: 240, dur: 0.35, vol: 0.14, a: 0.04 });
      nz(c, o, t, { f0: 600, f1: 1400, dur: 0.35, vol: 0.2, q: 2, a: 0.04 });
      notes(c, o, t + 0.25, [55, 62, 67], 0.0, { wave: "p25", env: "pluck", vol: 0.07, ring: 2 });
    },
    shield(c, o, t) {
      tn(c, o, t, { wave: "sq", f0: 110, dur: 0.6, vol: 0.06, a: 0.08 });
      tn(c, o, t, { f0: 660, f1: 1760, dur: 0.3, vol: 0.12, a: 0.05 });
      voice(c, o, t + 0.25, 0.5, 81, { wave: "bell", env: "bell", vol: 0.08 });
      voice(c, o, t + 0.25, 0.5, 88, { wave: "bell", env: "bell", vol: 0.05 });
    },
    stealth(c, o, t) {
      nz(c, o, t, { f0: 4000, f1: 500, dur: 0.4, vol: 0.2, q: 3 });
      tn(c, o, t, { f0: 900, f1: 300, dur: 0.4, vol: 0.06 });
    },
    haste(c, o, t) {
      nz(c, o, t, { f0: 800, f1: 6000, dur: 0.2, vol: 0.2, q: 3 });
      notes(c, o, t + 0.05, [72, 76, 79, 84, 88, 91], 0.03, { wave: "p12", env: "pluck", vol: 0.07 });
    },
    aura(c, o, t) {
      nz(c, o, t, { type: "lowpass", f0: 200, f1: 2200, dur: 0.5, vol: 0.4, a: 0.15 });
      [57, 64, 69].forEach((m) => voice(c, o, t, 0.6, m, { wave: "saw", env: "pad", vol: 0.03, chorus: true }));
    },
    // --- бій: загальні ---
    hit(c, o, t) {
      nz(c, o, t, { type: "lowpass", f0: 1800, dur: 0.05, vol: 0.5 });
      tn(c, o, t, { wave: "sq", f0: 220, f1: 80, dur: 0.06, vol: 0.12 });
    },
    crit(c, o, t) {
      SFX.hit(c, o, t);
      nz(c, o, t, { type: "highpass", f0: 3000, dur: 0.08, vol: 0.4 });
      tn(c, o, t, { wave: "p25", f0: 1760, f1: 880, dur: 0.15, vol: 0.08 });
    },
    hurt(c, o, t) {
      tn(c, o, t, { wave: "p25", f0: 330, f1: 110, dur: 0.15, vol: 0.14 });
      nz(c, o, t, { type: "lowpass", f0: 1200, dur: 0.08, vol: 0.4 });
    },
    miss(c, o, t) {
      nz(c, o, t, { f0: 900, f1: 2500, dur: 0.14, vol: 0.7, q: 1.5 });
    },
    claw(c, o, t) {
      for (let i = 0; i < 3; i++) nz(c, o, t + i * 0.045, { type: "highpass", f0: 2500, f1: 1200, dur: 0.05, vol: 0.35 });
    },
    bite(c, o, t) {
      nz(c, o, t, { type: "lowpass", f0: 1300, dur: 0.07, vol: 0.5 });
      tn(c, o, t, { wave: "sq", f0: 420, f1: 140, dur: 0.08, vol: 0.1 });
    },
    squish(c, o, t) {
      tn(c, o, t, { f0: 520, f1: 140, dur: 0.14, vol: 0.4 });
      nz(c, o, t, { type: "lowpass", f0: 700, dur: 0.1, vol: 0.3 });
      tn(c, o, t + 0.1, { f0: 300, f1: 700, dur: 0.05, vol: 0.15 });
    },
    dark(c, o, t) {
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 6;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2000, t + 0.25); f.frequency.exponentialRampToValueAtTime(200, t + 0.55);
      f.connect(o);
      tn(c, f, t, { wave: "saw", f0: 110, dur: 0.5, vol: 0.25, a: 0.05 });
      tn(c, f, t, { wave: "saw", f0: 116.5, dur: 0.5, vol: 0.25, a: 0.05 });
    },
    death(c, o, t) {
      tn(c, o, t, { wave: "p25", f0: 600, f1: 90, dur: 0.35, vol: 0.12 });
      nz(c, o, t + 0.05, { type: "lowpass", f0: 1500, f1: 200, dur: 0.35, vol: 0.35 });
    },
    // --- інтерфейс ---
    click(c, o, t) { tn(c, o, t, { wave: "sq", f0: 1200, dur: 0.025, vol: 0.06 }); },
    coins(c, o, t) {
      voice(c, o, t, 0.1, 95, { wave: "p25", env: "pluck", vol: 0.07 });
      voice(c, o, t + 0.07, 0.3, 100, { wave: "p25", env: "pluck", vol: 0.07, ring: 1.5 });
    },
    equip(c, o, t) {
      nz(c, o, t, { type: "lowpass", f0: 1500, dur: 0.06, vol: 0.4 });
      tn(c, o, t + 0.03, { f0: 1900, dur: 0.12, vol: 0.05 });
      tn(c, o, t + 0.03, { f0: 2850, dur: 0.1, vol: 0.03 });
    }
  };

  const SFX_GROUPS = [
    { title: "Атака зброєю", list: [["sword", "Меч"], ["dagger", "Кинджал"], ["axe", "Сокира"], ["bow", "Лук"], ["blunt", "Посох / удар щитом"], ["poison", "Отруйний клинок"]] },
    { title: "Атакуючі заклинання", list: [["fire", "Вогняна стріла"], ["fireblast", "Полум'яний вибух"], ["ice", "Крижаний спис"], ["wind", "Повітряне лезо"], ["storm", "Буревій"], ["earth", "Кам'яний кулак"], ["quake", "Землетрус"], ["holy", "Промінь світла"], ["smite", "Святий удар"]] },
    { title: "Відновлюючі", list: [["heal", "Цілюща хвиля"], ["bless", "Благословення"], ["prayer", "Молитва зцілення"], ["meditate", "Медитація"], ["potion", "Зілля"]] },
    { title: "Посилення та захист", list: [["buff", "Посилення"], ["warcry", "Бойовий клич / Лють"], ["shield", "Щит / Кам'яна шкіра"], ["stealth", "Тінь / Ухильність"], ["haste", "Попутний вітер"], ["aura", "Вогняна аура"]] },
    { title: "У бою", list: [["hit", "Влучання"], ["crit", "Критичний удар"], ["hurt", "Героя поранено"], ["miss", "Промах"], ["claw", "Кігті звіра"], ["bite", "Укус"], ["squish", "Слайм"], ["dark", "Темна магія ворога"], ["death", "Ворог переможений"]] },
    { title: "Інтерфейс", list: [["click", "Клік"], ["coins", "Монети"], ["equip", "Вдягнути річ"]] }
  ];

  // Навички (data/skills.js) → звук. [звук, кількість ударів]
  const SKILL_SFX = {
    sword_power: "sword", sword_double: ["sword", 2], sword_rally: "warcry",
    dagger_backstab: "dagger", dagger_poison: "poison", dagger_flurry: ["dagger", 4], dagger_evasion: "stealth",
    axe_chop: "axe", axe_break: "axe", axe_rage: "warcry",
    bow_aimed: "bow", bow_double: ["bow", 2], bow_eagle: "buff", bow_quick: "haste",
    staff_fireball: "fire", staff_frost: "ice", staff_shield: "shield",
    warrior_crush: "axe", warrior_cry: "warcry",
    knight_bash: "blunt", knight_stand: "shield",
    berserker_whirl: ["axe", 3], berserker_blood: "warcry",
    rogue_deadly: "dagger", rogue_shadow: "stealth",
    hunter_volley: ["bow", 3], hunter_pierce: "bow",
    fire_arrow: "fire", fire_blast: "fireblast", fire_aura: "aura",
    water_spear: "ice", water_heal: "heal", water_shield: "shield",
    wind_blade: "wind", wind_storm: "storm", wind_tail: "haste",
    earth_fist: "earth", earth_quake: "quake", earth_skin: "shield",
    paladin_smite: "smite", paladin_bless: "bless",
    priest_light: "holy", priest_prayer: "prayer",
    monk_strikes: ["blunt", 3], monk_meditate: "meditate"
  };
  const WEAPON_SFX = { sword: "sword", dagger: "dagger", axe: "axe", bow: "bow", staff: "blunt" };

  // ============================================================
  // ДВИГУН (живий звук)
  // ============================================================
  let E = null;           // { ctx, master, music, sfx }
  let localVol = null;    // гучність, якщо немає core.js
  let current = null;     // інстанс треку, що грає
  let currentId = null;
  let wanted = null;      // що вмикати після «розблокування» звуку
  let timer = null;
  let jingleTimer = null;
  const fading = [];

  function settings() {
    let s = {};
    if (RPG.getSettings) s = RPG.getSettings();
    else {
      try { s = JSON.parse(localStorage.getItem("rpg_settings") || "{}"); } catch (e) { s = {}; }
      if (localVol) s = Object.assign({}, s, { volume: localVol.master, musicVolume: localVol.music, sfxVolume: localVol.sfx, muted: localVol.muted });
    }
    return {
      master: s.volume != null ? s.volume : 70,
      music: s.musicVolume != null ? s.musicVolume : 60,
      sfx: s.sfxVolume != null ? s.sfxVolume : 80,
      muted: !!s.muted
    };
  }
  const curve = (v) => Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.6);

  function buildBuses(ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.005; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    const master = ctx.createGain(); master.connect(comp);
    const music = ctx.createGain(); music.connect(master);
    const sfx = ctx.createGain(); sfx.connect(master);
    return { ctx, master, music, sfx };
  }

  function applyVolume() {
    if (!E) return;
    const v = settings();
    const t = E.ctx.currentTime;
    E.master.gain.setTargetAtTime(v.muted ? 0 : curve(v.master), t, 0.05);
    E.music.gain.setTargetAtTime(curve(v.music) * 0.75, t, 0.05);
    E.sfx.gain.setTargetAtTime(curve(v.sfx), t, 0.05);
  }

  function ensure() {
    if (E) return E;
    if (!AC) return null;
    try {
      const ctx = new AC({ latencyHint: "interactive" });
      E = buildBuses(ctx);
      applyVolume();
      timer = setInterval(tick, 25);
    } catch (e) { E = null; }
    return E;
  }

  function startWanted() {
    if (!E || E.ctx.state !== "running" || !wanted) return;
    const w = wanted; wanted = null;
    if (w.id === currentId && !current) startTrack(w.id, w.fade);
  }
  function wake() {
    if (!E || document.hidden) return;
    if (E.ctx.state === "running") startWanted();
    else E.ctx.resume().then(startWanted).catch(() => {});
  }
  function unlock() {
    if (!ensure()) return;
    wake();
  }
  ["pointerdown", "keydown", "touchend"].forEach((ev) =>
    window.addEventListener(ev, unlock, { capture: true, passive: true }));

  document.addEventListener("visibilitychange", () => {
    if (!E) return;
    if (document.hidden) E.ctx.suspend();
    else wake();
  });

  function tick() {
    if (!E || E.ctx.state !== "running") return;
    const now = E.ctx.currentTime;
    const ahead = now + 0.15;
    if (current) {
      const I = current;
      if (I.next < now - 0.1) I.next = now + 0.05; // таймер «заснув» — не надолужуємо
      while (I.next < ahead) {
        if (!I.T.loop && I.step >= I.total) break;
        scheduleStep(I, I.step, I.next);
        I.step++;
        I.next += I.T.stepDur;
      }
    }
    for (let i = fading.length - 1; i >= 0; i--) {
      if (now > fading[i].until) { try { fading[i].gain.disconnect(); } catch (e) {} fading.splice(i, 1); }
    }
  }

  function fadeOut(I, sec) {
    if (!I) return;
    const t = E.ctx.currentTime;
    I.gain.gain.cancelScheduledValues(t);
    I.gain.gain.setValueAtTime(I.gain.gain.value, t);
    I.gain.gain.linearRampToValueAtTime(0, t + sec);
    fading.push({ gain: I.gain, until: t + sec + 3 });
  }

  // Гра — це кілька HTML-сторінок, і з кожним переходом звук починається заново.
  // Тож запам'ятовуємо, що й де грало, і на новій сторінці продовжуємо з того ж такту.
  const RESUME_KEY = "rpg_audio_resume";
  function readResume() {
    try {
      const r = JSON.parse(sessionStorage.getItem(RESUME_KEY) || "null");
      return r && Date.now() - r.at < 300000 ? r : null;
    } catch (e) { return null; }
  }
  window.addEventListener("pagehide", () => {
    try {
      if (!currentId || !TRACKS[currentId] || TRACKS[currentId].loop === false) return;
      // звук на цій сторінці так і не ввімкнувся (не було дотику) — зберігаємо попередню позицію
      const old = readResume();
      const step = current ? current.step : (old && old.id === currentId ? old.step : 0);
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ id: currentId, step, at: Date.now() }));
    } catch (e) {}
  });

  function startTrack(id, fade) {
    let sec = fade == null ? 1.2 : fade;
    fadeOut(current, sec);
    current = null;
    currentId = id;
    if (!id) return;
    const I = createInstance(E.ctx, E.music, id);
    if (!I) return;
    const rs = readResume();
    if (rs && rs.id === id && I.T.loop) {
      I.step = Math.floor(rs.step / 16) * 16 % I.total;   // з початку того самого такту
      sec = Math.min(sec, 0.5);
      try { sessionStorage.removeItem(RESUME_KEY); } catch (e) {}
    }
    const t = E.ctx.currentTime;
    I.gain.gain.setValueAtTime(0, t);
    I.gain.gain.linearRampToValueAtTime(1, t + Math.max(0.05, sec * 0.6));
    I.next = t + Math.min(0.3, sec * 0.3) + 0.05;
    current = I;
  }

  function play(id, opts) {
    opts = opts || {};
    if (id && !TRACKS[id]) return;
    if (jingleTimer) { clearTimeout(jingleTimer); jingleTimer = null; }
    if (id === currentId && current && !opts.restart) return;
    const e = ensure();
    if (!e || e.ctx.state !== "running") {
      fadeOut(current, 0.3);
      current = null;
      wanted = { id, fade: opts.fade };
      currentId = id;
      wake();
      return;
    }
    startTrack(id, opts.fade);
  }

  function stop(fade) { play(null, { fade }); wanted = null; currentId = null; }

  function jingle(id, after) {
    const back = after !== undefined ? after : (TRACKS[currentId] && TRACKS[currentId].loop !== false ? currentId : null);
    const e = ensure();
    if (!e || e.ctx.state !== "running" || !TRACKS[id]) { if (back) play(back); return; }
    startTrack(id, 0.25);
    const T = prep(id);
    const len = (T.bars * 16 * T.stepDur + 0.6) * 1000;
    if (jingleTimer) clearTimeout(jingleTimer);
    jingleTimer = setTimeout(() => {
      jingleTimer = null;
      if (currentId === id) { currentId = null; if (back) startTrack(back, 1.5); else startTrack(null, 0.5); }
    }, len);
  }

  function sfx(name, opts) {
    const f = SFX[name];
    if (!f) return;
    const e = ensure();
    if (!e) return;
    if (e.ctx.state !== "running") {
      if (!document.hidden) e.ctx.resume().then(() => sfx(name, opts)).catch(() => {});
      return;
    }
    const hits = (opts && opts.hits) || 1;
    const t0 = e.ctx.currentTime + 0.01;
    const out = e.ctx.createGain();
    out.gain.value = (opts && opts.vol != null) ? opts.vol : 1;
    out.connect(e.sfx);
    for (let i = 0; i < hits; i++) f(e.ctx, out, t0 + i * 0.13);
    setTimeout(() => { try { out.disconnect(); } catch (er) {} }, 4000 + hits * 150);
  }

  function skillSound(skill) {
    let id = skill, def = null;
    if (typeof skill === "object" && skill) { def = skill; id = skill.id; }
    let m = SKILL_SFX[id];
    if (!m) {
      def = def || (RPG.SKILLS && RPG.SKILLS[id]) || {};
      if (def.kind === "heal") m = "heal";
      else if (def.kind === "buff") m = "buff";
      else if (def.school) m = { fire: "fire", water: "ice", wind: "wind", earth: "earth" }[def.school];
      else m = WEAPON_SFX[Array.isArray(def.weapon) ? def.weapon[0] : def.weapon] || "hit";
    }
    if (Array.isArray(m)) sfx(m[0], { hits: m[1] });
    else sfx(m);
    return m;
  }

  function scene(o) {
    o = o || {};
    let id = null;
    if (o.boss) id = SCENES.boss;
    else if (o.screen === "menu") id = SCENES.menu;
    else if (o.screen === "combat" || o.screen === "battle") id = SCENES.combat[o.location] || (o.region === "dark" ? "battle_dk_edge" : "battle_forest");
    else if (o.screen === "city" || o.region === "city") id = SCENES.city[o.district] || SCENES.city.south;
    else id = SCENES.map[o.region] || SCENES.map.start;
    play(id);
    return id;
  }

  // Звук події бою (battle.js → ev.sound):
  //   "skill:<id>" — навичка, "weapon:<тип>" — звичайний удар героя,
  //   "enemy:<зброя>:<дієслово>" — удар ворога, або просто назва звуку ("miss", "dark", ...)
  const VERB_SFX = [
    [/дряпає|рве|роздирає|шматує/, "claw"], [/кусає|ікл|присмокт|жалить/, "bite"],
    [/хлюпає/, "squish"], [/ножем/, "dagger"], [/рубає/, "axe"], [/обпікає/, "fire"],
    [/торкається/, "dark"], [/хльоскає/, "whip"]
  ];
  function battleSound(ev) {
    if (!ev || !ev.sound) return;
    const snd = String(ev.sound);
    const [kind, a, b] = snd.split(":");
    if (kind === "skill") skillSound(a);
    else if (kind === "weapon") sfx(WEAPON_SFX[a] || "blunt");
    else if (kind === "enemy") {
      let name = WEAPON_SFX[a];
      if (!name) { const m = VERB_SFX.find(([re]) => re.test(b || "")); name = m ? m[1] : "blunt"; }
      if (name === "whip") name = "dagger";
      sfx(name);
      sfx("hurt", { vol: 0.6 });
    } else sfx(snd);
    if (ev.crit) sfx("crit", { vol: 0.8 });
  }

  // Продовжити трек з попередньої сторінки (Персонаж, Інвентар, Налаштування)
  function resume(fallback) {
    const rs = readResume();
    if (rs && TRACKS[rs.id]) { play(rs.id); return rs.id; }
    if (fallback) play(fallback);
    return fallback || null;
  }

  function setVolume(v) {
    if (RPG.setSettings) {
      const patch = {};
      if (v.master != null) patch.volume = v.master;
      if (v.music != null) patch.musicVolume = v.music;
      if (v.sfx != null) patch.sfxVolume = v.sfx;
      if (v.muted != null) patch.muted = v.muted;
      RPG.setSettings(patch);
    } else {
      // без core.js (головне меню, демо-сторінка) — лише в пам'яті сторінки
      const cur = settings();
      localVol = Object.assign({ master: cur.master, music: cur.music, sfx: cur.sfx, muted: cur.muted }, v);
    }
    applyVolume();
  }

  // ============================================================
  // ОФЛАЙН-РЕНДЕР (для перевірки та експорту у WAV)
  // ============================================================
  function renderTrack(id, seconds, sampleRate) {
    const T = prep(id);
    const sr = sampleRate || 44100;
    const dur = seconds || (T.bars * 16 * T.stepDur + (T.loop ? 0 : 2));
    const ctx = new OAC(2, Math.ceil(sr * (dur + 0.5)), sr);
    const B = buildBuses(ctx);
    B.music.gain.value = 0.75;
    const I = createInstance(ctx, B.music, id);
    let t = 0.05, s = 0;
    while (t < dur) {
      if (!T.loop && s >= I.total) break;
      scheduleStep(I, s, t);
      s++; t += T.stepDur;
    }
    return ctx.startRendering();
  }
  function renderSfx(name, hits) {
    const sr = 44100, ctx = new OAC(2, sr * 3, sr);
    const B = buildBuses(ctx);
    for (let i = 0; i < (hits || 1); i++) SFX[name](ctx, B.sfx, 0.05 + i * 0.13);
    return ctx.startRendering();
  }
  function toWav(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); data.setUint32(4, 36 + len * ch * 2, true); w(8, "WAVE"); w(12, "fmt ");
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true);
    data.setUint16(34, 16, true); w(36, "data"); data.setUint32(40, len * ch * 2, true);
    const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
    }
    return new Blob([data], { type: "audio/wav" });
  }

  RPG.audio = {
    play, stop, jingle, scene, sfx, unlock, resume, battleSound,
    skill: skillSound,
    attack: (weapon) => sfx(WEAPON_SFX[weapon] || "blunt"),
    setVolume, applyVolume,
    current: () => currentId,
    position: () => (current && E ? { step: current.step, bars: current.T.bars, loop: current.T.loop } : null),
    TRACKS, SCENES, SFX_GROUPS, SKILL_SFX,
    SFX_LIST: Object.keys(SFX),
    renderTrack, renderSfx, toWav,
    trackLength: (id) => { const T = prep(id); return T ? T.bars * 16 * T.stepDur : 0; }
  };
})(window.RPG);
