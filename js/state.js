/* ═══════════════════════════════════════
   state.js — Глобальний стан додатку
   Nodly
════════════════════════════════════════ */

const State = (() => {

  /* ── Стан ── */
  let _calcs       = {};   // { [id]: calcObject }
  let _currentId   = null; // id відкритого калькулятора
  let _nodes       = {};   // { [id]: nodeObject } — поточний редактор
  let _connections = [];   // [{ fromNode, fromSlot, toNode, toSlot }]
  let _history     = [];   // undo snapshots

  /* ── Undo ── */
  function _snapshot() {
    _history.push({
      nodes:       JSON.parse(JSON.stringify(_nodes)),
      connections: JSON.parse(JSON.stringify(_connections)),
    });
    if (_history.length > 10) _history.shift();
  }

  function undo() {
    if (!_history.length) return false;
    const snap   = _history.pop();
    _nodes       = snap.nodes;
    _connections = snap.connections;
    return true;
  }

  function canUndo() { return _history.length > 0; }

  /* ── Генератори id ── */
  function genCalcId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function genNodeId() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  /* ── Калькулятори ── */
  function setCalcs(list) {
    _calcs = {};
    list.forEach(c => { _calcs[c.id] = c; });
  }

  function getCalcs() {
    return _calcs;
  }

  function getCalc(id) {
    return _calcs[id] || null;
  }

  function addCalc(name = 'Без назви') {
    const id = genCalcId();
    _calcs[id] = {
      id,
      name,
      nodes:       {},
      connections: [],
      created:     Date.now(),
      updated:     Date.now(),
    };
    return _calcs[id];
  }

  function removeCalc(id) {
    delete _calcs[id];
  }

  function duplicateCalc(id) {
    const src = _calcs[id];
    if (!src) return null;
    const newId = genCalcId();
    _calcs[newId] = JSON.parse(JSON.stringify(src));
    _calcs[newId].id      = newId;
    _calcs[newId].name    = (src.name || 'Без назви') + ' (копія)';
    _calcs[newId].created = Date.now();
    _calcs[newId].updated = Date.now();
    // Перегенеруємо id вузлів щоб не було колізій
    const idMap = {};
    const newNodes = {};
    Object.values(_calcs[newId].nodes || {}).forEach(n => {
      const nid = genNodeId();
      idMap[n.id] = nid;
      newNodes[nid] = { ...n, id: nid };
    });
    _calcs[newId].nodes = newNodes;
    _calcs[newId].connections = (_calcs[newId].connections || []).map(c => ({
      ...c,
      fromNode: idMap[c.fromNode] || c.fromNode,
      toNode:   idMap[c.toNode]   || c.toNode,
    }));
    return _calcs[newId];
  }

  function updateCalcMeta(id, patch) {
    if (!_calcs[id]) return;
    Object.assign(_calcs[id], patch, { updated: Date.now() });
  }

  /* ── Поточний відкритий калькулятор ── */
  function getCurrentId() { return _currentId; }

  function openCalc(id) {
    // зберігаємо стан попереднього редактора
    _flushToCalc();

    _currentId   = id;
    const calc   = _calcs[id];
    _nodes       = calc ? JSON.parse(JSON.stringify(calc.nodes || {})) : {};
    _connections = calc ? JSON.parse(JSON.stringify(calc.connections || [])) : [];
    _history     = [];
  }

  function closeCalc() {
    _flushToCalc();
    _currentId   = null;
    _nodes       = {};
    _connections = [];
  }

  /* ── Вузли ── */
  function getNodes() { return _nodes; }

  function getNode(id) { return _nodes[id] || null; }

  function addNode(type, x, y) {
    _snapshot();
    const id = genNodeId();
    _nodes[id] = {
      id,
      type,
      x:           x ?? 40 + Math.random() * 320,
      y:           y ?? 40 + Math.random() * 400,
      customLabel: '',
      value:       '5',
      formula:     '',
      vars:        [],
      note:        '',
      photo:       null,  // base64 або null
      scale:       1,
    };
    if (type === 'formula') {
      _nodes[id].vars = Engine.parseVars(_nodes[id].formula);
    }
    if (window.App?.markDirty) App.markDirty();
    return _nodes[id];
  }

  function updateNode(id, patch) {
    if (!_nodes[id]) return;
    Object.assign(_nodes[id], patch);
    if (window.App?.markDirty) App.markDirty();
  }

  function removeNode(id) {
    _snapshot();
    delete _nodes[id];
    _connections = _connections.filter(
      c => c.fromNode !== id && c.toNode !== id
    );
    if (window.App?.markDirty) App.markDirty();
  }

  /* ── З'єднання ── */
  function getConnections() { return _connections; }

  function addConnection(fromNode, fromSlot, toNode, toSlot) {
    _snapshot();
    // видаляємо старе з'єднання до того ж входу
    _connections = _connections.filter(
      c => !(c.toNode === toNode && c.toSlot === toSlot)
    );
    _connections.push({ fromNode, fromSlot, toNode, toSlot });
    if (window.App?.markDirty) App.markDirty();
  }

  function removeConnectionsFor(nodeId, slot) {
    _connections = _connections.filter(
      c => !(c.toNode === nodeId && c.toSlot === slot)
    );
    if (window.App?.markDirty) App.markDirty();
  }

  function removeConnectionAt(idx) {
    _connections.splice(idx, 1);
    if (window.App?.markDirty) App.markDirty();
  }

  /* ── Синхронізація з об'єктом калькулятора ── */
  function _flushToCalc() {
    if (!_currentId || !_calcs[_currentId]) return;
    _calcs[_currentId].nodes       = JSON.parse(JSON.stringify(_nodes));
    _calcs[_currentId].connections = JSON.parse(JSON.stringify(_connections));
    _calcs[_currentId].updated     = Date.now();
    // Зберігаємо поточний viewport з Canvas
    if (window.Canvas?.getViewport) {
      _calcs[_currentId].viewport = Canvas.getViewport();
    }
  }

  /* ── Явне збереження ── */
  async function saveNow() {
    _flushToCalc();
    if (!_currentId || !_calcs[_currentId]) return;
    try {
      await DB.save(_calcs[_currentId]);
    } catch (e) {
      console.error('[State] Помилка saveNow:', e);
    }
  }

  /* ── Публічний API ── */
  return {
    genCalcId, genNodeId,
    setCalcs, getCalcs, getCalc, addCalc, removeCalc, updateCalcMeta,
    getCurrentId, openCalc, closeCalc,
    getNodes, getNode, addNode, updateNode, removeNode,
    getConnections, addConnection, removeConnectionsFor, removeConnectionAt,
    duplicateCalc,
    undo, canUndo,
    saveNow,
  };

})();
