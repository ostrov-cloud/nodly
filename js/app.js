/* ═══════════════════════════════════════
   app.js — Ініціалізація, роутинг
   Nodly
════════════════════════════════════════ */

window.App = (() => {

  let _isDirty = false;
  let _touchStartX = null;
  let _touchStartY = null;
  let _renameTimer = null;
  let _renameStarted = false;
  let _addAt = null;
  let _canvasPressTimer = null;

  /* ══════════════════════════════════════
     ІНІЦІАЛІЗАЦІЯ
  ══════════════════════════════════════ */

  async function init() {
    try {
      const list = await DB.getAll();
      State.setCalcs(list);
    } catch (e) {
      console.error('[App] Помилка завантаження з DB:', e);
    }
    renderSidebar();
    _bindSwipe();
    bindCanvasLongPress();
  }

  /* ══════════════════════════════════════
     САЙДБАР
  ══════════════════════════════════════ */

  function renderSidebar() {
    const list  = document.getElementById('calc-list');
    const calcs = State.getCalcs();
    const ids   = Object.keys(calcs).sort(
      (a, b) => (calcs[b].updated || 0) - (calcs[a].updated || 0)
    );

    if (!ids.length) {
      list.innerHTML = `
        <div class="calc-list-empty">
          <i class="ti ti-calculator" aria-hidden="true"></i>
          <p>Ще немає калькуляторів.<br>Натисни «Новий калькулятор».</p>
        </div>`;
      return;
    }

    list.innerHTML = ids.map(id => {
      const c   = calcs[id];
      const cnt = Object.keys(c.nodes || {}).length;
      const active = id === State.getCurrentId() ? 'active' : '';
      return `
        <div class="calc-item ${active}" onclick="App.openCalc('${id}')">
          <div class="calc-item-icon">
            <i class="ti ti-calculator" aria-hidden="true"></i>
          </div>
          <div class="calc-item-info">
            <div class="calc-item-name"
              onpointerdown="App.sidebarRenamePressStart('${id}', event)"
              onpointerup="App.clearSidebarRenamePress()"
              onpointerleave="App.clearSidebarRenamePress()">${_esc(c.name || 'Без назви')}</div>
            <div class="calc-item-meta">
              ${cnt} вузл${cnt === 1 ? '' : cnt < 5 ? 'и' : 'ів'}
            </div>
          </div>
          <button class="calc-item-dup"
            onclick="App.duplicateCalc('${id}', event)"
            aria-label="Дублювати">
            <i class="ti ti-copy" aria-hidden="true"></i>
          </button>
          <button class="calc-item-del"
            onclick="App.confirmDelete('${id}', event)"
            aria-label="Видалити">
            <i class="ti ti-trash" aria-hidden="true"></i>
          </button>
        </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════
     СТВОРИТИ / ВІДКРИТИ / ЗАКРИТИ
  ══════════════════════════════════════ */

  async function createCalc() {
    if (State.getCurrentId() && !(await _confirmUnsaved())) return;

    const calc = State.addCalc('Без назви');
    await DB.save(calc);

    _openEditor(calc.id);
  }

  async function openCalc(id) {
    clearSidebarRenamePress();
    if (_renameStarted) { _renameStarted = false; return; }
    if (State.getCurrentId() === id) {
      document.getElementById('sidebar')?.classList.add('sidebar-hidden');
      _setFloatingBtnsVisible(true);
      document.getElementById('welcome-screen').style.display = 'none';
      document.getElementById('editor').style.display = 'flex';
      return;
    }
    if (State.getCurrentId() && !(await _confirmUnsaved())) return;
    _openEditor(id);
  }

  function _openEditor(id) {
    State.openCalc(id);

    const calc = State.getCalc(id);
    document.getElementById('editor-name').value = calc?.name || '';

    // перемикаємо екрани
    document.getElementById('welcome-screen').style.display = 'none';
    const editor = document.getElementById('editor');
    editor.style.display = 'flex';

    // Малюємо вузли
    Nodes.renderAll();

    // Відновлюємо збережений viewport (або центруємо якщо немає)
    if (calc?.viewport) {
      Canvas.setViewport(calc.viewport);
    } else {
      Canvas.setViewport({ x: 0, y: 0, scale: 1 });
      // Якщо є ноди і вьюпорт не збережено — поцентруємо
      const nodes = Object.values(State.getNodes());
      if (nodes.length) Canvas.fitToNodes();
    }

    // Ініціалізуємо розміри канвасу для _onResize
    requestAnimationFrame(() => Canvas.initSize?.());

    document.getElementById('sidebar')?.classList.add('sidebar-hidden');
    _setFloatingBtnsVisible(true);
    _isDirty = false;
    renderSidebar();
  }

  async function closeSidebar(skipConfirm = false) {
    if (!skipConfirm && !(await _confirmUnsaved())) return;
    document.getElementById('sidebar')?.classList.remove('sidebar-hidden');
    _setFloatingBtnsVisible(false);
  }

  function markDirty() {
    _isDirty = true;
  }

  async function save() {
    await State.saveNow();
    _isDirty = false;
    _toast('Збережено ✓');
    renderSidebar();
  }

  async function _confirmUnsaved() {
    if (!_isDirty) return true;
    const shouldSave = confirm('Зберегти зміни?');
    if (shouldSave) await save();
    else _isDirty = false;
    return true;
  }

  function _toast(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:fixed;right:20px;bottom:82px;background:#179E74;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:60;font-weight:600;';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  function _bindSwipe() {
    document.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      if (t.clientX <= 30) { _touchStartX = t.clientX; _touchStartY = t.clientY; }
    }, { passive: true });
    document.addEventListener('touchend', e => {
      if (_touchStartX === null) return;
      const t = e.changedTouches[0];
      if (t.clientX - _touchStartX > 60 && Math.abs(t.clientY - _touchStartY) < 80) closeSidebar(false);
      _touchStartX = _touchStartY = null;
    }, { passive: true });
  }


  function _setFloatingBtnsVisible(v) {
    ['btn-add-node','btn-undo','btn-fit','btn-save'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = v ? '' : 'none';
    });
  }

  function undoAction() {
    if (!State.canUndo()) return;
    State.undo();
    Nodes.renderAll();
    Canvas.applyViewport();
    Canvas.drawConnections();
    Canvas.updatePortStates();
  }

  /* ── Панель навігації по нодах ── */
  const NODE_TYPE_META = {
    number:  { icon: 'ti-123',           label: 'Число',     color: 'var(--blue)'  },
    formula: { icon: 'ti-math-function', label: 'Формула',   color: 'var(--green)' },
    output:  { icon: 'ti-flag',          label: 'Результат', color: 'var(--amber)' },
    note:    { icon: 'ti-note',          label: 'Нотатка',   color: 'var(--amber)' },
  };

  function toggleHelp() {
    const ov = document.getElementById('help-overlay');
    if (!ov) return;
    if (ov.hidden) {
      ov.hidden = false;
      // Закрити по кліку поза модального вікна
      ov._closeHandler = (e) => {
        if (!document.getElementById('help-modal').contains(e.target)) {
          toggleHelp();
        }
      };
      setTimeout(() => ov.addEventListener('pointerdown', ov._closeHandler), 10);
    } else {
      ov.hidden = true;
      if (ov._closeHandler) ov.removeEventListener('pointerdown', ov._closeHandler);
    }
  }

  function toggleFitPanel() {
    const ov = document.getElementById('fit-overlay');
    if (!ov) return;
    const isOpen = ov.classList.contains('active');
    if (isOpen) { closeFitPanel(); return; }

    // Будуємо список нод
    const nodes  = Object.values(State.getNodes());
    const list   = document.getElementById('fit-list');
    if (!list) return;

    if (!nodes.length) {
      list.innerHTML = '<p class="fit-empty">Немає вузлів на канвасі</p>';
    } else {
      const allRow = `<button class="fit-row fit-row-all" onclick="Canvas.fitToNodes();App.closeFitPanel()">
        <i class="ti ti-layout-distribute-vertical" style="color:var(--text-3)"></i>
        <span>Центрувати всі ноди</span>
      </button>
      <button class="fit-row fit-row-arrange" onclick="Canvas.arrangeNodes();App.closeFitPanel()">
        <i class="ti ti-layout-grid" style="color:var(--blue)"></i>
        <span>Авто-впорядкувати</span>
      </button>`;

      const rows = nodes.map(n => {
        const m   = NODE_TYPE_META[n.type] || NODE_TYPE_META.number;
        const lbl = n.customLabel || m.label;
        const val = n.type === 'number'  ? n.value
                  : n.type === 'formula' ? (n.result !== undefined ? n.result : '?')
                  : n.type === 'output'  ? (n.in     !== undefined ? n.in     : '—')
                  : '';
        const valStr = val !== '' ? `<span class="fit-row-val">${_esc(String(val))}</span>` : '';
        return `<button class="fit-row" onclick="Canvas.fitToNode('${n.id}');App.closeFitPanel()">
          <i class="ti ${m.icon}" style="color:${m.color}"></i>
          <span class="fit-row-name">${_esc(lbl)}</span>
          ${valStr}
        </button>`;
      }).join('');

      list.innerHTML = allRow + rows;
    }

    ov.classList.add('active');
  }

  function closeFitPanel() {
    const ov = document.getElementById('fit-overlay');
    if (ov) ov.classList.remove('active');
  }

  function toggleAddMenu(x = null, y = null) {
    if (x !== null && y !== null) _addAt = { x, y };
    else _addAt = Canvas.getViewportCenter?.() || null;
    const ov = document.getElementById('add-node-overlay');
    if (ov) ov.classList.toggle('active');
  }

  function closeAddMenu() {
    const ov = document.getElementById('add-node-overlay');
    if (ov) ov.classList.remove('active');
  }

  function addNodeFromMenu(type) {
    closeAddMenu();
    const pos = _addAt || Canvas.getViewportCenter?.() || null;
    Nodes.add(type, pos?.x, pos?.y);
    _addAt = null;
  }

  function bindCanvasLongPress() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    canvas.addEventListener('pointerdown', e => {
      if (e.target !== canvas && e.target.id !== 'svg-layer') return;
      clearTimeout(_canvasPressTimer);
      _canvasPressTimer = setTimeout(() => {
        _addAt = Canvas.screenToWorld?.(e.clientX, e.clientY) || null;
        const ov = document.getElementById('add-node-overlay');
        if (ov) ov.classList.add('active');
      }, 650);
    });
    ['pointerup','pointermove','pointerleave','pointercancel'].forEach(ev => {
      canvas.addEventListener(ev, () => clearTimeout(_canvasPressTimer));
    });
  }

  /* ══════════════════════════════════════
     ВИДАЛЕННЯ
  ══════════════════════════════════════ */

  function confirmDelete(id, e) {
    e.stopPropagation();

    const calc = State.getCalc(id);
    const name = calc?.name || 'Без назви';

    document.getElementById('modal-confirm-text').textContent =
      `Видалити «${name}»? Це незворотня дія.`;

    const btn = document.getElementById('modal-confirm-ok');
    btn.onclick = () => deleteCalc(id);

    Modal.open('modal-confirm');
  }

  async function duplicateCalc(id, e) {
    if (e) e.stopPropagation();
    const newCalc = State.duplicateCalc(id);
    if (!newCalc) return;
    await DB.save(newCalc);
    renderSidebar();
    _toast('Дубль створено ✓');
  }

  async function deleteCalc(id) {
    Modal.close('modal-confirm');

    try {
      await DB.remove(id);
    } catch (e) {
      console.error('[App] Помилка видалення з DB:', e);
    }

    State.removeCalc(id);

    // якщо видаляємо відкритий — поверта��мось на welcome
    if (State.getCurrentId() === id) {
      State.closeCalc();
      document.getElementById('editor').style.display       = 'none';
      document.getElementById('welcome-screen').style.display = 'flex';
    }

    _isDirty = false;
    renderSidebar();
  }


  function clearSidebarRenamePress() {
    if (_renameTimer) clearTimeout(_renameTimer);
    _renameTimer = null;
  }

  function sidebarRenamePressStart(id, e) {
    e.stopPropagation();
    const target = e.currentTarget;
    clearSidebarRenamePress();
    _renameStarted = false;
    _renameTimer = setTimeout(() => {
      _renameStarted = true;
      startSidebarRename(id, target);
    }, 650);
  }

  function startSidebarRename(id, wrap) {
    const calc = State.getCalc(id);
    if (!calc || !wrap) return;
    const oldName = calc.name || 'Без назви';
    wrap.classList.add('editing');
    wrap.innerHTML = `<input class="calc-rename-input" value="${_esc(oldName)}" />`;

    const input = wrap.querySelector('input');
    input.focus();
    input.select();

    const finish = async (saveChanges) => {
      const newName = input.value.trim() || 'Без назви';
      if (saveChanges && newName !== oldName) {
        State.updateCalcMeta(id, { name: newName });
        if (State.getCurrentId() === id) {
          const editorName = document.getElementById('editor-name');
          if (editorName) editorName.value = newName;
          markDirty();
        } else {
          await DB.save(State.getCalc(id));
        }
      }
      renderSidebar();
    };

    input.addEventListener('click', ev => ev.stopPropagation());
    input.addEventListener('pointerdown', ev => ev.stopPropagation());
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') finish(true);
      if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* ══════════════════════════════════════
     НАЗВА КАЛЬКУЛЯТОРА
  ══════════════════════════════════════ */

  function saveCalcName(val) {
    const id = State.getCurrentId();
    if (!id) return;
    State.updateCalcMeta(id, { name: val || 'Без назви' });
    renderSidebar();
    markDirty();
  }

  // exportPNG removed

  /* ── Допоміжна ── */
  function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Запуск ── */
  document.addEventListener('DOMContentLoaded', init);

  /* ── Зберегти перед закриттям вкладки ── */
  window.addEventListener('beforeunload', (e) => {
    if (!_isDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ── Публічний API ── */
  return {
    init, renderSidebar,
    createCalc, openCalc,
    confirmDelete, deleteCalc, duplicateCalc,
    saveCalcName, sidebarRenamePressStart, clearSidebarRenamePress, startSidebarRename,
    markDirty, save, closeSidebar, toggleAddMenu, closeAddMenu, addNodeFromMenu, undoAction,
    toggleFitPanel, closeFitPanel, toggleHelp,
  };

})();
