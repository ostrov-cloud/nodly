/* ═══════════════════════════════════════
   canvas.js — Канвас, з'єднання, drag
   Nodly
════════════════════════════════════════ */

const Canvas = (() => {

  const canvasEl = document.getElementById('canvas');
  const svgEl    = document.getElementById('svg-layer');
  const worldEl  = document.getElementById('world');

  let _dragging   = null;   // id вузла що тягнемо
  let _dragOffset = { x: 0, y: 0 };
  let _connecting = null;   // { nodeId, slot } — початок з'єднання
  let _tempLine   = null;   // SVG лінія-прев'ю
  let _viewport = { x: 0, y: 0, scale: 1 };
  let _panning = null;
  let _resizing = null;     // { nodeId, startX, startWidth }



  function screenToWorld(clientX, clientY) {
    const cr = canvasEl.getBoundingClientRect();
    return {
      x: (clientX - cr.left - _viewport.x) / _viewport.scale,
      y: (clientY - cr.top  - _viewport.y) / _viewport.scale,
    };
  }

  function setNodeTransform(el, x, y) {
    const id = el.id.replace('node-', '');
    const n = State.getNode(id);
    const nodeScale = n?.scale || 1;
    // Позиція відносно world-контейнера (viewport застосовується до world)
    el.style.left = '0px';
    el.style.top  = '0px';
    el.style.transform = `translate(${x}px, ${y}px) scale(${nodeScale})`;
    el.style.transformOrigin = '0 0';
    el.style.width = n?.nodeWidth ? n.nodeWidth + 'px' : '';
  }

  function applyViewport() {
    if (!_prevW) {
      const cr = canvasEl.getBoundingClientRect();
      _prevW = cr.width;
      _prevH = cr.height;
    }
    // Один transform на весь world — ноди не дрейфують
    worldEl.style.transform = `translate(${_viewport.x}px, ${_viewport.y}px) scale(${_viewport.scale})`;
    worldEl.style.transformOrigin = '0 0';
    // Оновлюємо nodeWidth для кожної ноди (тільки width, не transform)
    worldEl.querySelectorAll('.node').forEach(el => {
      const id = el.id.replace('node-', '');
      const n = State.getNode(id);
      if (n) {
        el.style.width = n.nodeWidth ? n.nodeWidth + 'px' : '';
      }
    });
    drawConnections();
  }

  function getViewportCenter() {
    const cr = canvasEl.getBoundingClientRect();
    return screenToWorld(cr.left + cr.width / 2, cr.top + cr.height / 2);
  }

  function zoomAt(clientX, clientY, factor) {
    const before = screenToWorld(clientX, clientY);
    _viewport.scale = Math.min(2.5, Math.max(0.35, _viewport.scale * factor));
    const cr = canvasEl.getBoundingClientRect();
    _viewport.x = clientX - cr.left - before.x * _viewport.scale;
    _viewport.y = clientY - cr.top  - before.y * _viewport.scale;
    applyViewport();
  }

  /* ══════════════════════════════════════
     DRAG — перетягування вузлів
  ══════════════════════════════════════ */

  function onDragStart(e, nodeId) {
    const forbidden = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];
    if (forbidden.includes(e.target.tagName))        return;
    if (e.target.classList.contains('port'))         return;
    if (e.target.closest('.node-resize-handle'))     return;  // блокуємо drag під час resize

    _dragging = nodeId;
    const cr  = canvasEl.getBoundingClientRect();
    const n   = State.getNode(nodeId);

    const p = screenToWorld(e.clientX, e.clientY);
    _dragOffset.x = p.x - n.x;
    _dragOffset.y = p.y - n.y;

    document.addEventListener('pointermove', onDrag);
    document.addEventListener('pointerup',   onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);
    e.preventDefault();
  }

  function onDrag(e) {
    if (!_dragging) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const x = p.x - _dragOffset.x;
    const y = p.y - _dragOffset.y;

    State.updateNode(_dragging, { x, y });

    const el = document.getElementById('node-' + _dragging);
    if (el) setNodeTransform(el, x, y);

    drawConnections();
  }

  function onDragEnd() {
    _dragging = null;
    document.removeEventListener('pointermove', onDrag);
    document.removeEventListener('pointerup',   onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);
  }

  /* ════════════════════════════
     RESIZE — ширина вузла
  ════════════════════════════ */

  function onResizeStart(e, nodeId) {
    e.stopPropagation();
    e.preventDefault();
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
    const el = document.getElementById('node-' + nodeId);
    if (!el) return;
    const n = State.getNode(nodeId);
    const factor = (_viewport.scale || 1) * (n?.scale || 1);
    const currentW = el.getBoundingClientRect().width / factor;
    _resizing = { nodeId, startX: e.clientX, startWidth: currentW };
    document.addEventListener('pointermove', _onResizeMove);
    document.addEventListener('pointerup',   _onResizeEnd);
    document.addEventListener('pointercancel', _onResizeEnd);
  }

  function _onResizeMove(e) {
    if (!_resizing) return;
    const { nodeId, startX, startWidth } = _resizing;
    const n = State.getNode(nodeId);
    const factor = (_viewport.scale || 1) * (n?.scale || 1);
    const dx = (e.clientX - startX) / factor;
    const newW = Math.max(200, Math.round(startWidth + dx));
    State.updateNode(nodeId, { nodeWidth: newW });
    const el = document.getElementById('node-' + nodeId);
    if (el) el.style.width = newW + 'px';
    drawConnections();
  }

  function _onResizeEnd() {
    _resizing = null;
    document.removeEventListener('pointermove', _onResizeMove);
    document.removeEventListener('pointerup',   _onResizeEnd);
    document.removeEventListener('pointercancel', _onResizeEnd);
  }


  /* ══════════════════════════════════════
     CONNECTIONS — з'єднання між вузлами
  ══════════════════════════════════════ */

  function portPos(nodeId, slot) {
    const el =
      document.getElementById(`port-out-${nodeId}-${slot}`) ||
      document.getElementById(`port-in-${nodeId}-${slot}`);
    if (!el) return null;
    const cr = canvasEl.getBoundingClientRect();
    const pr = el.getBoundingClientRect();
    // Координати відносно лівого верхнього кута канвасу (SVG не трансформується)
    return {
      x: pr.left + pr.width  / 2 - cr.left,
      y: pr.top  + pr.height / 2 - cr.top,
    };
  }

  function makeCurve(f, t, color, markerId) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx   = Math.max(Math.abs(t.x - f.x) * 0.5, 40);
    path.setAttribute('d',
      `M${f.x},${f.y} C${f.x + dx},${f.y} ${t.x - dx},${t.y} ${t.x},${t.y}`
    );
    path.setAttribute('fill',         'none');
    path.setAttribute('stroke',       color);
    path.setAttribute('stroke-width', '5');
    path.setAttribute('opacity',      '0.45');
    // marker-end removed (arrow broken after coord system change)
    return path;
  }

  function drawConnections() {
    svgEl.querySelectorAll('.conn-line, .conn-temp').forEach(e => e.remove());

    State.getConnections().forEach((c, idx) => {
      const f = portPos(c.fromNode, c.fromSlot);
      const t = portPos(c.toNode,   c.toSlot);
      if (!f || !t) return;

      // Невидима широка лінія для кліку (hitbox)
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const dx  = Math.max(Math.abs(t.x - f.x) * 0.5, 40);
      const d   = `M${f.x},${f.y} C${f.x+dx},${f.y} ${t.x-dx},${t.y} ${t.x},${t.y}`;
      hit.setAttribute('d', d);
      hit.setAttribute('fill',         'none');
      hit.setAttribute('stroke',       'transparent');
      hit.setAttribute('stroke-width', '18');
      hit.style.cursor = 'pointer';
      hit.style.pointerEvents = 'all';  // пробиваємось через pointer-events:none на svg-layer
      hit.dataset.connIdx = idx;
      hit.classList.add('conn-line');
      hit.addEventListener('click', _onConnLineClick);
      hit.addEventListener('pointerdown', _onConnLineClick);
      svgEl.appendChild(hit);

      const path = makeCurve(f, t, 'var(--green)', null);
      path.classList.add('conn-line');
      path.dataset.connIdx = idx;
      path.style.cursor = 'pointer';
      path.addEventListener('click', _onConnLineClick);
      path.style.pointerEvents = 'all';
      svgEl.appendChild(path);
    });
  }

  function _onConnLineClick(e) {
    e.stopPropagation();
    const idx = parseInt(e.currentTarget.dataset.connIdx, 10);
    const conns = State.getConnections();
    const c = conns[idx];
    if (!c) return;
    // Видаляємо зразу (confirm не працює на iOS Safari)
    State.removeConnectionAt(idx);
    Nodes.compute();
    drawConnections();
    updatePortStates();
    if (window.App?.markDirty) App.markDirty();
  }

  function startConnect(nodeId, slot, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (_connecting) {
      finishConnect(nodeId, slot);
      return;
    }
    _connecting          = { nodeId, slot };
    canvasEl.style.cursor = 'crosshair';
    canvasEl.addEventListener('pointermove', onConnectMove);
    document.addEventListener('pointerup', onConnectEnd, { once: true });
  }

  function onConnectMove(e) {
    svgEl.querySelectorAll('.conn-temp').forEach(x => x.remove());
    // Використовуємо canvas-relative coords (як portPos), а не world coords
    const cr = canvasEl.getBoundingClientRect();
    const mx = e.clientX - cr.left;
    const my = e.clientY - cr.top;
    const f  = portPos(_connecting.nodeId, _connecting.slot);
    if (!f) return;

    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', f.x); ln.setAttribute('y1', f.y);
    ln.setAttribute('x2', mx);  ln.setAttribute('y2', my);
    ln.setAttribute('stroke',           'var(--blue)');
    ln.setAttribute('stroke-width',     '5');
    ln.setAttribute('stroke-dasharray', '6,3');
    ln.setAttribute('opacity',          '0.5');
    ln.classList.add('conn-temp');
    svgEl.appendChild(ln);
  }



  function onConnectEnd(e) {
    if (!_connecting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const port = el?.closest?.('.port');
    if (port?.id) {
      const parts = port.id.split('-');
      const nodeId = parts[2];
      const slot = parts.slice(3).join('-');
      finishConnect(nodeId, slot);
    } else {
      cancelConnect();
    }
  }

  function finishConnect(nodeId, slot) {
    canvasEl.removeEventListener('pointermove', onConnectMove);
    svgEl.querySelectorAll('.conn-temp').forEach(x => x.remove());
    canvasEl.style.cursor = '';

    if (!_connecting) return;
    const a = _connecting;
    const b = { nodeId, slot };
    _connecting = null;

    const aOut = a.slot === 'val' || a.slot === 'result';
    const bOut = b.slot === 'val' || b.slot === 'result';

    let fromNode, fromSlot, toNode, toSlot;

    if (aOut && !bOut) {
      fromNode = a.nodeId; fromSlot = a.slot;
      toNode   = b.nodeId; toSlot   = b.slot;
    } else if (!aOut && bOut) {
      fromNode = b.nodeId; fromSlot = b.slot;
      toNode   = a.nodeId; toSlot   = a.slot;
    } else {
      return; // обидва виходи або обидва входи — ігноруємо
    }

    if (fromNode === toNode) return; // петля

    State.addConnection(fromNode, fromSlot, toNode, toSlot);
    Nodes.compute();
    drawConnections();
    updatePortStates();
  }

  function cancelConnect() {
    canvasEl.removeEventListener('pointermove', onConnectMove);
    svgEl.querySelectorAll('.conn-temp').forEach(x => x.remove());
    canvasEl.style.cursor = '';
    _connecting = null;
  }

  function updatePortStates() {
    document.querySelectorAll('.port-in, .port-out').forEach(p => {
      p.classList.remove('connected');
    });
    State.getConnections().forEach(c => {
      const o = document.getElementById(`port-out-${c.fromNode}-${c.fromSlot}`);
      const i = document.getElementById(`port-in-${c.toNode}-${c.toSlot}`);
      if (o) o.classList.add('connected');
      if (i) i.classList.add('connected');
    });
  }



  canvasEl.addEventListener('pointerdown', (e) => {
    if (e.target !== canvasEl && e.target !== svgEl && !svgEl.contains(e.target)) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    _panning = { sx: e.clientX, sy: e.clientY, vx: _viewport.x, vy: _viewport.y };
    canvasEl.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('pointermove', (e) => {
    if (!_panning) return;
    _viewport.x = _panning.vx + e.clientX - _panning.sx;
    _viewport.y = _panning.vy + e.clientY - _panning.sy;
    applyViewport();
  });

  document.addEventListener('pointerup', () => {
    if (!_panning) return;
    _panning = null;
    canvasEl.style.cursor = '';
  });

  canvasEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9);
  }, { passive: false });

  /* ── Клік на порожній канвас — скасувати з'єднання ── */
  canvasEl.addEventListener('click', (e) => {
    if (_connecting && (e.target === canvasEl || e.target === svgEl)) {
      cancelConnect();
    }
  });

  /* ── Центрування виду на всіх нодах ── */
  function fitToNodes(padding) {
    padding = padding ?? 60;
    const nodes = Object.values(State.getNodes());
    if (!nodes.length) return;

    // Знаходимо бокс всіх нод (за збереженими x/y)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const el = document.getElementById('node-' + n.id);
      // апрокс розміру вузла через offsetWidth/offsetHeight
      const w = el ? el.offsetWidth  * (n.scale || 1) : 200;
      const h = el ? el.offsetHeight * (n.scale || 1) : 120;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    });

    const nodesW = maxX - minX;
    const nodesH = maxY - minY;
    const cr     = canvasEl.getBoundingClientRect();
    const availW = cr.width  - padding * 2;
    const availH = cr.height - padding * 2;

    const scale = Math.min(
      availW / nodesW,
      availH / nodesH,
      1.2           // не збільшувати понад 100%
    );

    _viewport.scale = Math.max(0.35, Math.min(2.5, scale));
    _viewport.x = padding + (availW - nodesW * _viewport.scale) / 2 - minX * _viewport.scale;
    _viewport.y = padding + (availH - nodesH * _viewport.scale) / 2 - minY * _viewport.scale;

    applyViewport();
  }

  /* ── Центрування на одну ноду ── */
  function fitToNode(id) {
    const el = document.getElementById('node-' + id);
    if (!el) return;
    const cr  = canvasEl.getBoundingClientRect();
    const er  = el.getBoundingClientRect();
    // ѿкщо нода поза канвасом — повернемо її в центр
    const nodeCX = er.left + er.width  / 2 - cr.left;
    const nodeCY = er.top  + er.height / 2 - cr.top;
    _viewport.x += cr.width  / 2 - nodeCX;
    _viewport.y += cr.height / 2 - nodeCY;
    applyViewport();
  }

  /* ── Viewport get/set (для збереження/відновлення) ── */
  function getViewport() {
    return { ..._viewport };
  }

  function setViewport(vp) {
    if (!vp) return;
    _viewport.x     = vp.x     ?? 0;
    _viewport.y     = vp.y     ?? 0;
    _viewport.scale = vp.scale ?? 1;
    applyViewport();
  }

  /* ── Resize / orientation-change: зберігаємо world-центр ── */
  let _resizeTimer = null;
  let _prevW = 0, _prevH = 0;

  function _onResize(delay) {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      const cr  = canvasEl.getBoundingClientRect();
      const newW = cr.width;
      const newH = cr.height;

      // Якщо розміри відомі — зберігаємо точку яка була в центрі
      // Корекція лише якщо змінилась ШИРИНА (height-only = address bar)
      if (_prevW > 0 && newW !== _prevW) {
        const worldCX = (_prevW / 2 - _viewport.x) / _viewport.scale;
        _viewport.x   = newW / 2 - worldCX * _viewport.scale;
      }

      _prevW = newW;
      _prevH = newH;
      applyViewport();
    }, delay);
  }

  window.addEventListener('resize',            () => _onResize(80));
  window.addEventListener('orientationchange', () => _onResize(220));

  // Ініціалізуємо _prevW/_prevH після відкриття калькулятора
  function initSize() {
    const cr = canvasEl.getBoundingClientRect();
    _prevW   = cr.width;
    _prevH   = cr.height;
  }


  /* ══════════════════════════════════════
     AUTO-ARRANGE — авто-розкладка нод
  ══════════════════════════════════════ */

  function arrangeNodes() {
    const nodes = Object.values(State.getNodes());
    if (!nodes.length) return;
    const conns = State.getConnections();
    const gapX = 360, gapY = 240, padX = 40, padY = 40;

    // Топологічне сортування: визначаємо глибину (колонку) кожної ноди
    const depth = {};
    nodes.forEach(n => depth[n.id] = 0);

    // Кожна нода розміщується на 1 правіше за своїми джерелами
    let changed = true;
    for (let iter = 0; iter < nodes.length && changed; iter++) {
      changed = false;
      conns.forEach(c => {
        const d = (depth[c.fromNode] ?? 0) + 1;
        if (d > (depth[c.toNode] ?? 0)) {
          depth[c.toNode] = d;
          changed = true;
        }
      });
    }

    // Групуємо ноди по колонках (depth)
    const cols = {};
    nodes.forEach(n => {
      const d = depth[n.id] ?? 0;
      if (!cols[d]) cols[d] = [];
      cols[d].push(n);
    });

    // Розставляємо
    Object.entries(cols).forEach(([col, colNodes]) => {
      colNodes.forEach((n, row) => {
        State.updateNode(n.id, {
          x: padX + Number(col) * gapX,
          y: padY + row * gapY,
          nodeWidth: null,
        });
      });
    });

    applyViewport();
    setTimeout(() => fitToNodes(60), 50);
    drawConnections();
  }
  /* ── Публічний API ── */
  return {
    onDragStart,
    drawConnections,
    startConnect,
    finishConnect,
    cancelConnect,
    updatePortStates, applyViewport, screenToWorld, getViewportCenter, fitToNodes, fitToNode,
    getViewport, setViewport, initSize,
    onResizeStart, arrangeNodes,
  };

})();
