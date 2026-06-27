/* ═══════════════════════════════════════
   engine.js — Обчислення формул
   Nodly
════════════════════════════════════════ */

const Engine = (() => {

  /* ── Зарезервовані слова (не є змінними) ── */
  const RESERVED = new Set([
    'sin', 'cos', 'tan', 'sqrt', 'abs', 'log', 'exp',
    'pow', 'ceil', 'floor', 'round', 'min', 'max',
    'pi', 'e', 'Math',
  ]);

  /* ── Витягти змінні з формули ── */
  // Символи що утворюють слово (латиниця + кирилиця + цифри + _)
  const WC = '[a-zA-Z\u0400-\u04FF0-9_]';
  const WB_START = `(?<!${WC})`; // не-слово перед
  const WB_END   = `(?!${WC})`;  // не-слово після

  function parseVars(formula) {
    const re = new RegExp(
      `${WB_START}[a-zA-Z\u0400-\u04FF][a-zA-Z\u0400-\u04FF0-9_]*${WB_END}`,
      'gu'
    );
    const matches = formula.match(re) || [];
    return [...new Set(matches.filter(m => !RESERVED.has(m)))];
  }

  /* ── Підготувати вираз до eval ── */
  function _prepare(formula) {
    return formula
      .replace(/\bpi\b/g,    'Math.PI')
      .replace(/\be\b/g,     'Math.E')
      .replace(/\bsqrt\b/g,  'Math.sqrt')
      .replace(/\babs\b/g,   'Math.abs')
      .replace(/\bsin\b/g,   'Math.sin')
      .replace(/\bcos\b/g,   'Math.cos')
      .replace(/\btan\b/g,   'Math.tan')
      .replace(/\blog\b/g,   'Math.log')
      .replace(/\bexp\b/g,   'Math.exp')
      .replace(/\bpow\b/g,   'Math.pow')
      .replace(/\bceil\b/g,  'Math.ceil')
      .replace(/\bfloor\b/g, 'Math.floor')
      .replace(/\bround\b/g, 'Math.round')
      .replace(/\bmin\b/g,   'Math.min')
      .replace(/\bmax\b/g,   'Math.max');
  }

  /* ── Обчислити формулу з підстановкою змінних ── */
  function evalFormula(formula, varMap) {
    let expr = _prepare(formula);

    // підставляємо значення змінних (WB_START/WB_END підтримують кирилицю)
    for (const [key, val] of Object.entries(varMap)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`${WB_START}${escaped}${WB_END}`, 'gu');
      expr = expr.replace(re, val);
    }

    try {
      // eslint-disable-next-line no-new-func
      const result = Function('"use strict"; return (' + expr + ')')();
      return typeof result === 'number' ? result : NaN;
    } catch {
      return NaN;
    }
  }

  /* ── Форматувати число для відображення ── */
  function fmt(v) {
    if (v === undefined || v === null || isNaN(v)) return '?';
    const n = parseFloat(v);
    if (Math.abs(n) >= 1e9)              return n.toExponential(3);
    if (Math.abs(n) >= 1e6)              return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
    if (Math.abs(n) < 0.0001 && n !== 0) return n.toExponential(3);
    return parseFloat(n.toFixed(8)).toString();
  }

  /* ── Головний прохід обчислення всього графу ── */
  function compute(nodes, connections) {
    const vals = {};

    // початкові значення числових вузлів
    Object.values(nodes).forEach(n => {
      if (n.type === 'number') {
        const v = parseFloat(n.value);
        vals[n.id + '_val'] = isNaN(v) ? 0 : v;
      }
    });

    // ітеративне поширення значень по з'єднаннях
    let changed = true;
    let iter    = 0;

    while (changed && iter < 30) {
      changed = false;
      iter++;

      // передаємо значення по з'єднаннях
      connections.forEach(c => {
        const srcKey = c.fromNode + '_' + c.fromSlot;
        const dstKey = c.toNode   + '_' + c.toSlot;
        if (vals[srcKey] !== undefined && vals[dstKey] !== vals[srcKey]) {
          vals[dstKey] = vals[srcKey];
          changed = true;
        }
      });

      // обчислюємо формульні вузли
      Object.values(nodes).forEach(n => {
        if (n.type !== 'formula') return;

        const varMap   = {};
        let   allReady = n.vars.length > 0;

        n.vars.forEach(v => {
          const val = vals[n.id + '_' + v];
          if (val !== undefined) varMap[v] = val;
          else allReady = false;
        });

        if (allReady || n.vars.length === 0) {
          const r = evalFormula(n.formula, varMap);
          if (!isNaN(r) && vals[n.id + '_result'] !== r) {
            vals[n.id + '_result'] = r;
            changed = true;
          }
        }
      });
    }

    return vals;
  }

  /* ── Публічний API ── */
  return { parseVars, evalFormula, fmt, compute };

})();
