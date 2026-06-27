/* ═══════════════════════════════════════
   sharing.js — Експорт / Імпорт JSON
   Nodly
════════════════════════════════════════ */

const Sharing = (() => {

  let _selectedExportIds = [];

  /* ── Вибір калькуляторів перед якістю фото ── */
  function exportJSON() {
    const calcs = State.getCalcs();
    const ids = Object.keys(calcs);
    if (!ids.length) {
      alert('Немає калькуляторів для експорту.');
      return;
    }

    _selectedExportIds = ids;
    const list = document.getElementById('export-calc-list');
    if (!list) {
      alert('Не знайдено вікно вибору калькуляторів. Оновіть index.html.');
      return;
    }

    list.innerHTML = ids.map(id => {
      const c = calcs[id];
      return `
        <label class="export-calc-row">
          <input type="checkbox" class="export-calc-check" value="${_esc(id)}" checked />
          <span class="export-calc-name">${_esc(c.name || 'Без назви')}</span>
        </label>`;
    }).join('');

    Modal.open('modal-export-select');
  }

  function selectAllExport(checked) {
    document.querySelectorAll('.export-calc-check').forEach(ch => { ch.checked = checked; });
  }

  function nextExportStep() {
    _selectedExportIds = Array.from(document.querySelectorAll('.export-calc-check:checked')).map(ch => ch.value);
    if (!_selectedExportIds.length) {
      alert('Вибери хоча б один калькулятор.');
      return;
    }
    Modal.close('modal-export-select');
    setTimeout(() => Modal.open('modal-export'), 0);
  }

  /* ── Виконати експорт після вибору якості ── */
  async function doExport() {
    Modal.close('modal-export');

    const quality = document.querySelector('input[name="export-quality"]:checked')?.value || 'original';
    const calcs  = State.getCalcs();
    let data = JSON.parse(JSON.stringify(_selectedExportIds.map(id => calcs[id]).filter(Boolean)));

    if (quality === 'optimized') {
      for (const calc of data) {
        for (const node of Object.values(calc.nodes || {})) {
          if (node.photo) node.photo = await Camera.compress(node.photo, 0.7, 800);
        }
      }
    }

    const json = JSON.stringify({ version: 2, exportedAt: Date.now(), calcs: data }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.length === 1 ? `${_safeFileName(data[0].name || 'nodly-export')}.json` : 'nodly-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Імпорт JSON ── */
  function importJSON() {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        await _processImport(json);
      } catch (err) {
        console.error('[Sharing] Помилка імпорту:', err);
        alert('Не вдалося прочитати файл. Переконайтесь що це файл Nodly (.json).');
      }
    };
    input.click();
  }

  async function _processImport(json) {
    // підтримка формату { version, calcs: [...] }
    const list = Array.isArray(json)
      ? json
      : Array.isArray(json.calcs) ? json.calcs : null;

    if (!list) {
      alert('Невірний формат файлу.');
      return;
    }

    const existing = State.getCalcs();
    const toSave   = [];

    for (const calc of list) {
      if (!calc.id || !calc.name) continue;

      // вирішуємо конфлікт id
      let id = calc.id;
      if (existing[id]) {
        id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      }

      const imported = {
        ...calc,
        id,
        updated: Date.now(),
      };

      State.getCalcs()[id] = imported;
      toSave.push(imported);
    }

    if (!toSave.length) {
      alert('У файлі не знайдено калькуляторів.');
      return;
    }

    await DB.saveMany(toSave);
    App.renderSidebar();
    alert(`Імпортовано ${toSave.length} калькулятор${toSave.length === 1 ? '' : 'и'}.`);
  }

  function _esc(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _safeFileName(v) {
    return String(v ?? 'nodly-export')
      .replace(/[^a-zA-Zа-яА-ЯіїєґІЇЄҐ0-9_\- ]/g, '')
      .trim() || 'nodly-export';
  }

  /* ── Публічний API ── */
  return { exportJSON, selectAllExport, nextExportStep, doExport, importJSON };

})();
