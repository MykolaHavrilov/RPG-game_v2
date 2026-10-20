// ============================================================
// stats.js — АТРИБУТИ персонажа та їхній вплив на бій
//   Сила (str), Спритність (agi), Інтелект (int),
//   Витривалість (vit), Дух (spi)
//
// Атрибути зберігаються в сейві: save.character.attrs
// За кожен новий рівень персонаж отримує POINTS_PER_LEVEL вільних очок
// (save.character.freePoints), які гравець вкладає на сторінці «Персонаж».
// Речі теж можуть давати атрибути: stats: { str: 1, agi: 1 }.
//
// Підключається ПІСЛЯ data/classes.js і ДО character.js.
// ============================================================

(function (RPG) {
  const ATTRS = {
    str: "Сила",
    agi: "Спритність",
    int: "Інтелект",
    vit: "Витривалість",
    spi: "Дух"
  };

  // Скільки вільних очок дається за кожен новий рівень
  const POINTS_PER_LEVEL = 3;

  // Верхні межі (у відсотках), щоб не було 100% криту чи блоку
  const CAP = {
    critFromAttr: 30,   // атрибути додають до криту не більше +30%
    blockFromAttr: 25,  // атрибути дають блок не більше 25%
    dodgeFromAttr: 20,  // атрибути дають ухилення не більше 20%
    crit: 60,           // загальний шанс криту (з речами) — макс. 60%
    dodge: 40,          // загальний шанс ухилитися — макс. 40%
    speed: 60,          // максимальна швидкість атаки
    block: 50           // загальний шанс блоку (з щитом) — макс. 50%
    // Крит, ухилення і швидкість можуть перевищити ліміт ЛИШЕ завдяки
    // бонусам легендарних речей (див. calcStats у character.js)
  };

  // «М'яке» зростання: перші очки дають багато, далі все менше,
  // значення ніколи не перевищить cap. k — скільки очок дає половину cap.
  function soft(points, k, cap) {
    if (points <= 0) return 0;
    return cap * points / (points + k);
  }

  // Що дають атрибути. Результат ДОДАЄТЬСЯ до характеристик професії.
  //   hp/mp            — максимум здоров'я та мани
  //   attack / magic   — фізична шкода / сила заклинань
  //   defense          — зменшує фізичну шкоду, magicDefense — магічну
  //   speed            — хто б'є першим + шанс додаткового швидкого удару
  //   crit, blockPhys, blockMag — шанси у відсотках
  //   hpRegen / mpRegen — скільки відновлюється кожні 10 секунд
  function attrBonuses(a) {
    return {
      hp:           a.vit * 10,
      mp:           a.int * 6 + a.spi * 2,
      attack:       a.str * 2 + a.agi * 0.5,
      magic:        a.int * 2 + a.spi * 0.5,
      defense:      a.vit * 1 + a.str * 0.5,
      magicDefense: a.spi * 1 + a.int * 0.3,
      speed:        a.agi * 0.5,
      crit:         soft(a.agi, 100, CAP.critFromAttr),
      dodge:        soft(a.agi, 150, CAP.dodgeFromAttr),
      blockPhys:    soft(a.agi * 0.5 + a.str * 0.5, 120, CAP.blockFromAttr),
      blockMag:     soft(a.spi, 120, CAP.blockFromAttr),
      hpRegen:      1 + a.vit * 0.5,
      mpRegen:      1 + a.spi * 0.5 + a.int * 0.2
    };
  }

  // Сталі бонуси атрибутів за рівні (classes.js → levelAttrs, changeBonus).
  // Рахуються по всьому шляху професій: попередні (classHistory) + поточна.
  // Нічого не зберігається в сейві — завжди обчислюється, тож зміна чисел
  // у classes.js одразу застосовується і до старих персонажів.
  function levelAttrs(save) {
    const ch = save.character;
    const out = {};
    for (const key in ATTRS) out[key] = 0;
    const path = [...(ch.classHistory || []), { classId: ch.classId, level: ch.level }];
    path.forEach((step, i) => {
      const cls = RPG.getClass(step.classId);
      const levels = Math.max(0, (step.level || 1) - 1);
      for (const key in cls.levelAttrs || {}) out[key] += cls.levelAttrs[key] * levels;
      if (i > 0) for (const key in cls.changeBonus || {}) out[key] += cls.changeBonus[key];
    });
    return out;
  }

  // «+1 Сила, +1 Спритність» — для повідомлень
  function describeAttrs(obj, times = 1) {
    return Object.entries(obj || {})
      .filter(([, v]) => v)
      .map(([k, v]) => `+${v * times} ${ATTRS[k] || k}`)
      .join(", ");
  }

  // Атрибути персонажа + сталі бонуси за рівні + бонуси з усіх вдягнених речей
  function totalAttrs(save) {
    const own = save.character.attrs || {};
    const byLevel = levelAttrs(save);
    const total = {};
    for (const key in ATTRS) total[key] = (own[key] || 0) + byLevel[key];
    for (const slot in save.equipment) {
      const st = RPG.itemStats(save.equipment[slot]);   // з урахуванням рідкості
      for (const key in st) {
        if (key in ATTRS) total[key] += st[key];
      }
    }
    return total;
  }

  // Вкласти одне вільне очко в атрибут
  function addAttrPoint(save, key) {
    const ch = save.character;
    if (!ATTRS[key] || !(ch.freePoints > 0)) return false;
    ch.attrs[key] = (ch.attrs[key] || 0) + 1;
    ch.freePoints--;
    return true;
  }

  Object.assign(RPG, { ATTRS, POINTS_PER_LEVEL, STAT_CAP: CAP, soft, attrBonuses, levelAttrs, describeAttrs, totalAttrs, addAttrPoint });
})(window.RPG);
