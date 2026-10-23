// menu.js — логіка меню: кнопка «Назад» і підтвердження виходу

document.addEventListener('DOMContentLoaded', () => {

  // ---- Музика головного меню (audio.js) ----------------------------
  if (document.body.dataset.page === 'index' && window.RPG && RPG.audio) RPG.audio.play('menu');

  // ---- Кнопки «Назад» (data-back) --------------------------------
  // Налаштування: повертаємо туди, звідки їх відкрили
  // (settings.html?from=character → character.html).
  // Якщо в налаштуваннях імпортували сейв — гра вже завантажена,
  // тож ведемо на сторінку персонажа.
  // Інші сторінки: якщо є історія — крок назад, інакше href (головне меню).
  const BACK_TARGETS = {
    index:     '../index.html',
    game:      'game.html',
    character: 'character.html',
    inventory: 'inventory.html',
    maps:      'maps.html'
  };

  function settingsBackTarget() {
    if (document.body.dataset.gameLoaded === '1') return 'character.html';
    const from = new URLSearchParams(location.search).get('from');
    if (from && BACK_TARGETS[from]) return BACK_TARGETS[from];
    // Невідомо, звідки прийшли: є активна гра — до персонажа, інакше в меню
    const hasGame = window.RPG && RPG.getCurrentSlot && RPG.getCurrentSlot();
    return hasGame ? 'character.html' : '../index.html';
  }

  document.querySelectorAll('[data-back]').forEach(link => {
    link.addEventListener('click', event => {
      if (document.body.dataset.page === 'settings') {
        event.preventDefault();
        location.href = settingsBackTarget();
        return;
      }
      const cameFromGame = document.referrer && history.length > 1;
      if (cameFromGame) {
        event.preventDefault();
        history.back();
      }
    });
  });

  // ---- Вихід з гри (тільки на головному меню) ---------------------
  const exitBtn = document.getElementById('exit-btn');
  const dialog  = document.getElementById('exit-dialog');
  if (!exitBtn || !dialog) return;

  const text    = document.getElementById('exit-text');
  const actions = document.getElementById('exit-actions');

  exitBtn.addEventListener('click', () => dialog.showModal());

  document.getElementById('exit-no').addEventListener('click', () => dialog.close());

  document.getElementById('exit-yes').addEventListener('click', () => {
    // Браузер дозволяє закрити вкладку тільки якщо її відкрив скрипт.
    // window.close() нічого не повертає, тому перевіряємо window.closed
    // трохи згодом: якщо вікно не закрилось (телефон, встановлений застосунок) —
    // показуємо прощання і кнопку повернення в меню.
    text.textContent = 'Дякуємо за гру!';
    actions.hidden = true;
    window.close();
    setTimeout(() => {
      if (window.closed) return;
      text.textContent = 'Дякуємо за гру! Закрити вікно самостійно браузер не дозволяє — тепер застосунок можна закрити.';
      document.getElementById('exit-yes').hidden = true;
      document.getElementById('exit-no').textContent = 'Повернутися в меню';
      actions.hidden = false;
    }, 300);
  });

  // Після «Повернутися в меню» діалог знову має питати «Вийти з гри?»
  dialog.addEventListener('close', () => {
    text.textContent = 'Вийти з гри?';
    document.getElementById('exit-yes').hidden = false;
    document.getElementById('exit-no').textContent = 'Ні, залишитись';
    actions.hidden = false;
  });
});
