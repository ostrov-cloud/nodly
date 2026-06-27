/* ═══════════════════════════════════════
   modal.js — Модальні вікна
   Nodly (вставити перед app.js у index.html)
════════════════════════════════════════ */

const Modal = (() => {

  function open(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function close(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  /* ── Закриття по Escape ── */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal:not([hidden])').forEach(m => {
      m.hidden = true;
      if (m.id === 'modal-photo') Camera.stopCamera?.();
    });
  });

  return { open, close };

})();
