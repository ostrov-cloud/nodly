/* ═══════════════════════════════════════
   nodes.js — Рендер і логіка вузлів
   Nodly
════════════════════════════════════════ */

const Nodes = (() => {

  const canvasEl = document.getElementById('canvas');

  /* ── Допоміжна: екранування HTML ── */
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Токенізатор формули: ділить рядок на {type:'var'|'text', text} ── */
  function _tokenizeFormula(formula, vars) {
    if (!vars.length) return [{ type: 'text', text: formula }];
    // Сортуємо за довжиною (довші спочатку, щоб 'ab' не розбивалось на 'a'+'b')
    const sorted = [...vars].sort((a, b) => b.length - a.length);
    const tokens = [];
    let rem = formula;
    while (rem.length) {
      let earliest = -1, found = null;
      for (const v of sorted) {
        // Шукаємо тільки цілі токени (не частину слова/числа)
        let idx = 0;
        while (idx < rem.length) {
          const i = rem.indexOf(v, idx);
          if (i === -1) break;
          const before = i === 0 ? '' : rem[i - 1];
          const after  = i + v.length < rem.length ? rem[i + v.length] : '';
          const ok = !/[a-zA-Z0-9_]/.test(before) && !/[a-zA-Z0-9_]/.test(after);
          if (ok && (earliest === -1 || i < earliest)) { earliest = i; found = v; }
          idx = i + 1;
        }
      }
      if (earliest === -1) { tokens.push({ type: 'text', text: rem }); break; }
      if (earliest > 0) tokens.push({ type: 'text', text: rem.slice(0, earliest) });
      tokens.push({ type: 'var', text: found });
      rem = rem.slice(earliest + found.length);
    }
    return tokens;
  }

  /* ── Прикрашаємо оператори ── */
  function _prettifyOp(text) {
    return text.replace(/\*/g, '×');
  }

  /* ── Конфіг типів вузлів ── */
  const TYPE = {
    number:  { icon: 'ti-123',           color: 'var(--blue)',  label: 'Число'    },
    formula: { icon: 'ti-math-function', color: 'var(--green)', label: 'Формула'  },
    output:  { icon: 'ti-flag',          color: 'var(--amber)', label: 'Результат'},
    note:    { icon: 'ti-note',          color: 'var(--amber)', label: 'Нотатка'  },
  };

  /* ══════════════════════════════════════
     РЕНДЕР одного вузла
  ══════════════════════════════════════ */

  function render(id) {
    const old = document.getElementById('node-' + id);
    if (old) old.remove();

    const n  = State.getNode(id);
    if (!n) return;
    const t  = TYPE[n.type] || TYPE.number;

    /* ── Тіло вузла залежно від типу ── */
    let body = '';

    if (n.type === 'number') {
      body = `
        <div class="node-row number-row">
          <input class="node-input number-input" type="number" value="${esc(n.value)}"
            oninput="Nodes.onNumberInput('${id}', this.value)"
            onpointerdown="event.stopPropagation()"
            onclick="event.stopPropagation()"/>
          <span class="port-label out-label">Вихід</span>
          <div class="port port-out" id="port-out-${id}-val"
            onpointerdown="Canvas.startConnect('${id}','val', event)" title="Вихід"></div>
        </div>`;

    } else if (n.type === 'formula') {
      const vars      = n.vars || [];
      const varCount  = vars.length || 1;
      // Ширина ноди: кожна змінна мін 72px, але не менше 220px
      const nodeW     = Math.max(220, varCount * 72);
      // Фонт формули зростає з шириною
      const fSize     = Math.min(34, Math.max(18, Math.round(nodeW / 7)));
      const resVal    = n.result !== undefined ? Engine.fmt(n.result) : '?';

      // Кожна змінна: ім'я зверху, порт знизу
      const varSlots = vars.map(v => `
        <div class="fnd-slot">
          <span class="fnd-slot-name">${esc(v)}</span>
          <div class="port port-in" id="port-in-${id}-${esc(v)}"
            onpointerdown="Canvas.startConnect('${id}','${esc(v)}', event)"></div>
        </div>`).join('');

      body = `
        <div class="fnd-formula-area">
          <input class="fnd-formula-big" type="text" value="${esc(n.formula)}"
            placeholder="a + b"
            style="font-size:${fSize}px"
            oninput="Nodes.onFormulaInput('${id}', this.value)"
            onmousedown="event.stopPropagation()"
            onclick="event.stopPropagation()"/>
        </div>
        <div class="fnd-bottom-row">
          ${varSlots}
          <div class="fnd-output-slot">
            <span class="fnd-eq-label">=&thinsp;<span class="fnd-res" id="result-${id}">${esc(resVal)}</span></span>
            <div class="port port-out" id="port-out-${id}-result"
              onpointerdown="Canvas.startConnect('${id}','result', event)"></div>
          </div>
        </div>`;

    } else if (n.type === 'output') {
      body = `
        <div class="node-row">
          <div class="port port-in" id="port-in-${id}-in"
            onpointerdown="Canvas.startConnect('${id}','in', event)"></div>
          <span class="port-label">вхід</span>
          <span class="node-result output" id="result-${id}">
            ${n.in !== undefined ? Engine.fmt(n.in) : '—'}
          </span>
        </div>`;

    } else if (n.type === 'note') {
      body = `
        <textarea class="note-textarea" placeholder="Напишіть нотатку..."
          onmousedown="event.stopPropagation()"
          onclick="event.stopPropagation()"
          oninput="Nodes.onNoteInput('${id}', this.value)"
        >${esc(n.note || '')}</textarea>`;
    }

    /* ── Фото над нодою + фо��о панель ── */
    const photoTop = (n.type !== 'note' && n.photo)
      ? `<img class="node-photo-top" src="${n.photo}" alt="Фото" onclick="Camera.openModal('${id}')"/>`
      : '';
    const photoPanel = (n.type !== 'note') ? _buildPhotoPanel(id, n) : '';

    /* ── Кнопка фото — для всіх нод, окрім нотаток ── */
    const photoBtn = (n.type !== 'note') ? `
      <button class="node-btn ${n.photo ? 'photo-active' : ''}"
        onclick="Camera.openModal('${id}')" title="Фото">
        <i class="ti ti-camera" aria-hidden="true"></i>
      </button>` : '';

    /* ── Збираємо вузол ── */
    const el = document.createElement('div');
    el.className = 'node' + (n.type === 'note' ? ' note' : '');
    el.id        = 'node-' + id;
    el.style.left = '0px';
    el.style.top  = '0px';
    el.style.transform = `translate(${n.x}px, ${n.y}px) scale(${n.scale || 1})`;
    el.style.transformOrigin = '0 0';

    el.innerHTML = `
      <div class="node-header${n.type === 'note' ? ' note-header' : ''}">
        <i class="ti ${t.icon} node-header-icon node-header-icon-lg" aria-hidden="true"
          style="color:${t.color}"></i>
        <div class="node-label-static">${t.label}</div>
        <div class="node-header-actions">
          <select class="node-scale-select" onchange="Nodes.setScale('${id}', Number(this.value))" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation()">
            <option value="0.75" ${(n.scale||1)===0.75?'selected':''}>S</option>
            <option value="1" ${(n.scale||1)===1||!n.scale?'selected':''}>M</option>
            <option value="1.25" ${(n.scale||1)===1.25?'selected':''}>L</option>
            <option value="1.5" ${(n.scale||1)===1.5?'selected':''}>XL</option>
          </select>
          ${photoBtn}
          <button class="node-btn close"
            onclick="Nodes.remove('${id}')" aria-label="Видалити">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      ${photoTop}
      <div class="node-body">${body}</div>
      ${photoPanel}
      <div class="node-resize-handle"
        onpointerdown="Canvas.onResizeStart(event,'${id}')"
        title="Змінити ширину">
        <i class="ti ti-arrows-diagonal" aria-hidden="true"></i>
      </div>`;

    el.addEventListener('pointerdown', (e) => Canvas.onDragStart(e, id));
    // Додаємо в world-контейнер, не прямо в canvas
    const worldEl = document.getElementById('world');
    (worldEl || canvasEl).appendChild(el);
    Canvas.applyViewport?.();
    Canvas.updatePortStates();
  }



  /* ── Фото панель ── */
  function _buildPhotoPanel(id, n) {
    if (!n._photoOpen || n.photo) return '';
    return `
      <div class="node-photo-panel">
        <div class="photo-placeholder" onclick="Camera.openModal('${id}')">
          <i class="ti ti-camera-plus" aria-hidden="true"></i>
          <span>Додати фото</span>
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════
     ПОДІЇ ВУЗЛІВ
  ══════════════════════════════════════ */

  function onNumberInput(id, val) {
    State.updateNode(id, { value: val });
    compute();
    if (Canvas.applyViewport) Canvas.applyViewport();
  }

  function onFormulaInput(id, val) {
    const newVars = Engine.parseVars(val);
    const oldVars = State.getNode(id)?.vars || [];

    const removed = oldVars.filter(v => !newVars.includes(v));
    removed.forEach(v => State.removeConnectionsFor(id, v));

    State.updateNode(id, { formula: val, vars: newVars });

    const varsChanged =
      newVars.length !== oldVars.length ||
      newVars.some((v, i) => v !== oldVars[i]);

    if (varsChanged) {
      // Зберігаємо позицію курсору в інпуті до ререндеру
      const inputEl = document.querySelector(`#node-${id} .fnd-formula-big`);
      const selStart = inputEl?.selectionStart ?? val.length;
      const selEnd   = inputEl?.selectionEnd   ?? val.length;

      render(id);
      Canvas.applyViewport();

      // Повертаємо фокус і позицію курсору
      const newInput = document.querySelector(`#node-${id} .fnd-formula-big`);
      if (newInput) {
        newInput.focus();
        try { newInput.setSelectionRange(selStart, selEnd); } catch (_) {}
      }
    } else {
      // Змінні не змінились — оновлюємо лише hint без ререндеру вузла
      const hint = document.querySelector(`#node-${id} .formula-hint`);
      if (hint) {
        hint.textContent = 'змінні: ' +
          (newVars.length ? newVars.join(', ') : '—');
      }
    }

    compute();
    Canvas.drawConnections();
    Canvas.updatePortStates();
  }

  function onLabelInput(id, val) {
    State.updateNode(id, { customLabel: val });
  }

  function onNoteInput(id, val) {
    State.updateNode(id, { note: val });
  }

  /* ══════════════════════════════════════
     ДОД��ТИ / ВИДА��ИТИ
  ══════════════════════════════════════ */

  function add(type, x, y) {
    const n = State.addNode(type, x, y);
    render(n.id);
    Canvas.applyViewport();
    compute();
    Canvas.drawConnections();
  }

  function remove(id) {
    const el = document.getElementById('node-' + id);
    if (el) el.remove();
    State.removeNode(id);
    compute();
    Canvas.drawConnections();
    Canvas.updatePortStates();
  }

  function removePhoto(id) {
    State.updateNode(id, { photo: null });
    render(id);
    Canvas.drawConnections();
  }

  function setPhoto(id, base64, originalBase64) {
    const patch = { photo: base64 };
    if (originalBase64 !== undefined) patch.originalPhoto = originalBase64;
    State.updateNode(id, patch);
    render(id);
    Canvas.drawConnections();
  }

  function toggleVars(id, e) {
    if (e) { e.stopPropagation(); }
    const n = State.getNode(id);
    if (!n) return;
    const wasOpen = n._varsOpen ?? false;
    State.updateNode(id, { _varsOpen: !wasOpen });
    // Перемалюємо CSS без повного ре-рендеру
    const listEl   = document.getElementById('vars-list-' + id);
    const btnEl    = document.querySelector(`#node-${id} .vars-toggle`);
    const iconEl   = btnEl?.querySelector('i');
    if (listEl) listEl.classList.toggle('vars-hidden', wasOpen);
    if (iconEl) {
      iconEl.classList.toggle('ti-chevron-down', wasOpen);
      iconEl.classList.toggle('ti-chevron-up',   !wasOpen);
    }
    Canvas.drawConnections();
  }

  function setScale(id, scale) {
    State.updateNode(id, { scale });
    render(id);
    Canvas.drawConnections();
    if (Canvas.applyViewport) Canvas.applyViewport();
  }

  function togglePhotoPanel(id) {
    const n = State.getNode(id);
    if (!n) return;
    State.updateNode(id, { _photoOpen: !n._photoOpen });
    render(id);
    Canvas.drawConnections();
  }

  /* ══════════════════════════════════════
     ОНОВЛЕННЯ ЗНАЧЕНЬ (без повного ререндеру)
  ══════════════════════════════════════ */

  function applyVals(vals) {
    const nodes = State.getNodes();
    Object.values(nodes).forEach(n => {
      // кешуємо значення у стані
      if (n.type === 'formula') {
        const r = vals[n.id + '_result'];
        State.updateNode(n.id, { result: r });
        const el = document.getElementById('result-' + n.id);
        if (el) el.textContent = r !== undefined ? Engine.fmt(r) : '?';

        (n.vars || []).forEach(v => {
          const vv = vals[n.id + '_' + v];
          State.updateNode(n.id, { ['_v_' + v]: vv });
          const ve = document.getElementById('val-' + n.id + '-' + v);
          if (ve) ve.textContent = vv !== undefined ? Engine.fmt(vv) : '?';
        });
      }

      if (n.type === 'output') {
        const r = vals[n.id + '_in'];
        State.updateNode(n.id, { in: r });
        const el = document.getElementById('result-' + n.id);
        if (el) el.textContent = r !== undefined ? Engine.fmt(r) : '—';
      }
    });
  }

  /* ══════════════════════════════════════
     COMPUTE
  ══════════════════════════════════════ */

  function compute() {
    const vals = Engine.compute(State.getNodes(), State.getConnections());
    applyVals(vals);
    Canvas.drawConnections();
  }

  /* ══════════════════════════════════════
     ВІДМАЛ��ВАТИ ВСІ ВУЗЛИ
  ══════════════════════════════════════ */

  function renderAll() {
    canvasEl.querySelectorAll('.node').forEach(el => el.remove());
    Object.keys(State.getNodes()).forEach(id => render(id));
    compute();
  }

  /* ── Публічний API ── */
  return {
    render, renderAll, compute,
    add, remove, removePhoto, setPhoto, togglePhotoPanel, setScale, toggleVars,
    onNumberInput, onFormulaInput, onLabelInput, onNoteInput,
  };

})();
