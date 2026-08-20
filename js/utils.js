/* ============================================================================
 * WaveTogether — utils.js
 * Вспомогательные утилиты: хранилище (localStorage), сессия (sessionStorage,
 * чтобы демо могло работать в двух вкладках под разными пользователями),
 * шина событий между вкладками (BroadcastChannel), DOM-хелперы, тосты,
 * форматирование времени и набор кастомных stroke-иконок (inline SVG, 24x24).
 * ========================================================================== */
'use strict';

/* ============================== ХРАНИЛИЩЕ ================================= */

/** Обёртка над localStorage: имитация «базы данных» приложения. */
const DB = {
  /** Прочитать значение по ключу (JSON). Если нет — fallback. */
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      console.warn('DB.get ошибка:', key, e);
      return fallback;
    }
  },
  /** Записать значение по ключу (JSON). */
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn('DB.set ошибка (переполнение?):', key, e); }
  },
  /** Удалить ключ. */
  remove(key) { try { localStorage.removeItem(key); } catch (e) {} },
  /**
   * Атомарное обновление: читает, прогоняет через fn, сохраняет результат.
   * Возвращает новое значение.
   */
  update(key, fn, fallback = null) {
    const cur = DB.get(key, fallback);
    const next = fn(cur);
    const val = next === undefined ? cur : next;
    DB.set(key, val);
    return val;
  }
};

/**
 * Сессия — на вкладку (sessionStorage). Именно поэтому можно открыть сайт
 * в двух вкладках и войти под двумя разными пользователями одновременно —
 * синхронизация между ними идёт через Bus и общий localStorage.
 */
const Session = {
  /** Текущий пользователь (логин) или null. */
  get user() { return sessionStorage.getItem('wt_session'); },
  set user(name) {
    if (name) sessionStorage.setItem('wt_session', name);
    else sessionStorage.removeItem('wt_session');
  }
};

/* ===================== ШИНА СОБЫТИЙ МЕЖДУ ВКЛАДКАМИ ====================== */

/**
 * Bus — шина real-time событий. Все вкладки одного браузера обмениваются
 * сообщениями через BroadcastChannel; старые браузеры — через событие storage.
 * Обработчики получают событие и в своей вкладке тоже (единая модель реакции).
 */
const Bus = (() => {
  /** @type {Map<string, Set<Function>>} */
  const handlers = new Map();
  let bc = null;
  try { if ('BroadcastChannel' in window) bc = new BroadcastChannel('wt_bus_v1'); }
  catch (e) { bc = null; }

  const dispatch = (data) => {
    if (!data || !data.type) return;
    const set = handlers.get(data.type);
    if (set) set.forEach(fn => { try { fn(data.payload, data); } catch (e) { console.error('Bus handler:', e); } });
    const anySet = handlers.get('*');
    if (anySet) anySet.forEach(fn => { try { fn(data.payload, data); } catch (e) { console.error('Bus handler:', e); } });
  };

  if (bc) {
    bc.onmessage = (ev) => dispatch(ev.data);
  } else {
    // Фоллбэк для браузеров без BroadcastChannel
    window.addEventListener('storage', (ev) => {
      if (ev.key === 'wt_bus' && ev.newValue) {
        try { dispatch(JSON.parse(ev.newValue)); } catch (e) {}
      }
    });
  }

  return {
    /** Подписаться на тип события. Возвращает функцию отписки. */
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
    /** Отправить событие всем вкладкам (и своей). */
    send(type, payload = {}) {
      const msg = { type, payload, t: Date.now() };
      dispatch(msg);
      try {
        if (bc) bc.postMessage(msg);
        else DB.set('wt_bus', { ...msg, _r: Math.random() });
      } catch (e) { console.warn('Bus.send:', e); }
    }
  };
})();

/* ================================ ХЕЛПЕРЫ ================================= */

/** Быстрый querySelector / querySelectorAll. */
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Генератор коротких уникальных id: uid('msg') -> 'msg_lx3f9a2b1'. */
const uid = (prefix = 'id') =>
  prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Ограничение числа диапазоном. */
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Экранирование строки для безопасной вставки в HTML. */
const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** Debounce: откладывает вызов до затишья. */
function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/**
 * DOM-билдер: h('div', {class:'x', text:'привет', onclick:fn}, дети...).
 * Возвращает готовый HTMLElement.
 */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Формат «мм:сс» из миллисекунд. */
const fmtTime = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return m + ':' + String(s).padStart(2, '0');
};

/** Хвостовое склонение: plural(5, 'минуту','минуты','минут'). */
const plural = (n, one, few, many) => {
  const m = Math.abs(n) % 100, d = m % 10;
  if (m > 10 && m < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
};

/** «только что», «5 мин назад», «2 ч назад», дата. */
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 20e3) return 'только что';
  if (diff < 60e3) return Math.round(diff / 1e3) + ' ' + plural(Math.round(diff / 1e3), 'секунду', 'секунды', 'секунд') + ' назад';
  if (diff < 3600e3) { const m = Math.round(diff / 60e3); return m + ' ' + plural(m, 'минуту', 'минуты', 'минут') + ' назад'; }
  if (diff < 86400e3) { const h2 = Math.round(diff / 3600e3); return h2 + ' ' + plural(h2, 'час', 'часа', 'часов') + ' назад'; }
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** djb2-хэш строки в uint32 (для детерминированных перемешиваний). */
function hashInt(str) {
  let h2 = 5381;
  for (let i = 0; i < str.length; i++) h2 = ((h2 << 5) + h2 + str.charCodeAt(i)) >>> 0;
  return h2;
}

/** Детерминированный PRNG (mulberry32) — одинаковый порядок на всех вкладках. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Перемешивание Фишера–Йетса с зерном (одинаково на всех клиентах). */
function seededShuffle(arr, seed) {
  const rnd = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Копирование текста в буфер обмена (с фоллбэком). */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); return true; }
    catch (e2) { return false; }
    finally { ta.remove(); }
  }
}

/* ================================ ТОСТЫ =================================== */

/**
 * Всплывающее уведомление.
 * @param {string} msg текст
 * @param {object} opts { type: 'info'|'success'|'error', icon: имя иконки,
 *                        actions: [{label, kind, fn}], timeout: мс }
 */
function toast(msg, opts = {}) {
  const root = qs('#toast-root') || document.body;
  const el = h('div', { class: 'toast toast--' + (opts.type || 'info') },
    h('div', { class: 'toast__ic', html: icon(opts.icon || (opts.type === 'error' ? 'x' : opts.type === 'success' ? 'check' : 'note'), 20) }),
    h('div', { class: 'toast__msg', text: msg })
  );
  if (opts.actions) {
    const row = h('div', { class: 'toast__actions' });
    opts.actions.forEach(a => row.append(h('button', {
      class: 'btn btn--mini ' + (a.kind === 'primary' ? 'btn--primary' : ''),
      text: a.label,
      onclick: () => { a.fn && a.fn(); dismiss(); }
    })));
    el.append(row);
  }
  root.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  let closed = false;
  const dismiss = () => {
    if (closed) return; closed = true;
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 350);
  };
  el.addEventListener('click', (e) => { if (e.target === el) dismiss(); });
  setTimeout(dismiss, opts.timeout || (opts.actions ? 12000 : 3400));
  return dismiss;
}

/* ============================ ИКОНКИ (SVG) ================================ */
/* Все иконки — кастомные, в едином стиле: тонкая линия (stroke 1.7),
   скруглённые концы, viewBox 24x24, currentColor. */

const ICON_PATHS = {
  logo: '<path d="M12 20.5s-7.5-5-7.5-10.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7.5 3.1c0 5.4-7.5 10.4-7.5 10.4z"/>'
      + '<path d="M7 11h1.7l.9-1.9 1.3 3.7 1-2.4.5.5H16" stroke-linecap="round"/>',
  play: '<path d="M7.5 5.2v13.6L18.8 12z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1.5" fill="currentColor" stroke="none"/>'
       + '<rect x="13.9" y="5" width="3.6" height="14" rx="1.5" fill="currentColor" stroke="none"/>',
  next: '<path d="M5.5 6v12L13 12z" fill="currentColor" stroke="none"/><rect x="15.5" y="6" width="3" height="12" rx="1.2" fill="currentColor" stroke="none"/>',
  prev: '<path d="M18.5 6v12L11 12z" fill="currentColor" stroke="none"/><rect x="5.5" y="6" width="3" height="12" rx="1.2" fill="currentColor" stroke="none"/>',
  heart: '<path d="M12 20.5s-7.5-5-7.5-10.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7.5 3.1c0 5.4-7.5 10.4-7.5 10.4z"/>',
  heartFill: '<path d="M12 20.5s-7.5-5-7.5-10.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7.5 3.1c0 5.4-7.5 10.4-7.5 10.4z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M4.5 6A3.5 3.5 0 0 1 8 2.5h8A3.5 3.5 0 0 1 19.5 6v6a3.5 3.5 0 0 1-3.5 3.5h-6L5.5 20v-4.1A3.5 3.5 0 0 1 4.5 13z"/>',
  send: '<path d="M21 3.5 10.8 13.7M21 3.5l-6.7 17-3.5-6.8L3.5 10.5z"/>',
  user: '<path d="M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  users: '<path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M2.5 20.3a6.5 6.5 0 0 1 13 0"/><path d="M16.5 4.6a3.5 3.5 0 0 1 0 6.4M18.5 14.2a6.5 6.5 0 0 1 3 6.1"/>',
  sliders: '<path d="M4 7h7m5 0h4M4 12h2m5 0h9M4 17h11m5 0h.5"/><circle cx="13.5" cy="7" r="2.2"/><circle cx="8.5" cy="12" r="2.2"/><circle cx="17.5" cy="17" r="2.2"/>',
  note: '<path d="M9 18.5V6l10-2.2v11.6"/><circle cx="6.4" cy="18.5" r="2.6"/><circle cx="16.4" cy="15.4" r="2.6"/>',
  wave: '<path d="M4 14v-4M8 17V7M12 20V4M16 17V7M20 14v-4"/>',
  room: '<path d="M5 20.5V5.3A2.3 2.3 0 0 1 7.3 3h9.4A2.3 2.3 0 0 1 19 5.3v15.2M3 20.5h18M12 12.2v.6"/>',
  search: '<circle cx="11" cy="11" r="6.8"/><path d="M20.5 20.5 16.2 16.2"/>',
  volume: '<path d="M11.5 5.4 6.8 8.8H4a.8.8 0 0 0-.8.8v4.8a.8.8 0 0 0 .8.8h2.8l4.7 3.4a.6.6 0 0 0 1-.5V6a.6.6 0 0 0-1-.6z"/><path d="M15.3 9.3a4.2 4.2 0 0 1 0 5.4M17.8 6.8a8 8 0 0 1 0 10.4"/>',
  volumeX: '<path d="M11.5 5.4 6.8 8.8H4a.8.8 0 0 0-.8.8v4.8a.8.8 0 0 0 .8.8h2.8l4.7 3.4a.6.6 0 0 0 1-.5V6a.6.6 0 0 0-1-.6z"/><path d="M15.5 9.5l5 5m0-5-5 5"/>',
  shuffle: '<path d="M15 4.5h5v5"/><path d="M3.5 19.5 20 4.5M15 19.5h5v-5"/><path d="M3.5 4.5 9 9.6m4.2 4.2L20 19.5"/>',
  repeat: '<path d="M17 2.5l3 3-3 3"/><path d="M4 11.5v-2a4 4 0 0 1 4-4h12"/><path d="M7 21.5l-3-3 3-3"/><path d="M20 12.5v2a4 4 0 0 1-4 4H4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5A1.2 1.2 0 0 1 10.7 3.2h2.6a1.2 1.2 0 0 1 1.2 1.3V7M6.5 7l.8 12.4a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20l1.1-4.3L16.6 4.2a2.15 2.15 0 0 1 3 3L8.1 18.9z"/><path d="M13.8 6.8l3 3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5.5 14.5h-.3A2.2 2.2 0 0 1 3 12.3V5.2A2.2 2.2 0 0 1 5.2 3h7.1a2.2 2.2 0 0 1 2.2 2.2v.3"/>',
  link: '<path d="M9.5 14.5l5-5"/><path d="M7.8 11 5.6 13.2a3.9 3.9 0 0 0 5.5 5.5l2.2-2.2"/><path d="M16.2 13l2.2-2.2a3.9 3.9 0 0 0-5.5-5.5l-2.2 2.2"/>',
  arrowL: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  home: '<path d="M4 11.5 12 4l8 7.5M6.5 9.5V19A1.5 1.5 0 0 0 8 20.5h8a1.5 1.5 0 0 0 1.5-1.5v-9.5"/>',
  chevronD: '<path d="M6 9.5l6 6 6-6"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4.5 18.5 10 13l3.5 3.5L18 12l1.5 1.5"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 1.5-2-.5-1.2.2-2.5 1.7-2.5h2a3.3 3.3 0 0 0 3.3-3.3C20.4 7.6 16.7 3.5 12 3.5z"/><circle cx="7.5" cy="10.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="16.5" cy="10.5" r="1.15" fill="currentColor" stroke="none"/>',
  sparkle: '<path d="M12 4l1.7 4.8L18.5 10.5l-4.8 1.7L12 17l-1.7-4.8L5.5 10.5l4.8-1.7z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.2-3.9-8.5s1.3-6.2 3.9-8.5z"/>',
  headphones: '<path d="M4.5 15.5v-1.8a7.5 7.5 0 0 1 15 0v1.8"/><rect x="3.2" y="14" width="4.2" height="6.4" rx="1.8"/><rect x="16.6" y="14" width="4.2" height="6.4" rx="1.8"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  logout: '<path d="M14 4h-7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M10 12h10.5m0 0-3.2-3.2M20.5 12l-3.2 3.2"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  drag: '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 16V4.5m0 0L7.5 9M12 4.5 16.5 9"/><path d="M4.5 15.5v2.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5v-2.5"/>',
  mood: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5a5.2 5.2 0 0 0 7 0"/><path d="M9 9.6v.6M15 9.6v.6"/>',
  skip: '<path d="M5.5 6v12L13 12z" fill="currentColor" stroke="none"/><rect x="15.5" y="6" width="3" height="12" rx="1.2" fill="currentColor" stroke="none"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.2 2.2-5.1 3.5-7.2.8-1.2 1.3-2.6 1.5-4.1 2.5 1 4 3 4.6 5 .7-.5 1.2-1.3 1.4-2.3 1.4 1.6 2 3.6 2 5.6 0 3.6-2.6 6.2-6.5 6.2z"/>',
  eye: '<path d="M2.8 12S6.5 5.8 12 5.8 21.2 12 21.2 12 17.5 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>',
  move: '<path d="M12 2.5v19M12 2.5 8.8 5.7M12 2.5l3.2 3.2M12 21.5l-3.2-3.2M12 21.5l3.2-3.2M2.5 12h19M2.5 12l3.2-3.2M2.5 12l3.2 3.2M21.5 12l-3.2-3.2M21.5 12l-3.2 3.2"/>',
};

/**
 * Возвращает inline-SVG иконки. icon('play', 24, 'my-class')
 * Все иконки наследуют currentColor.
 */
function icon(name, size = 24, cls = '') {
  const inner = ICON_PATHS[name] || ICON_PATHS.note;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" `
    + `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" `
    + `aria-hidden="true">${inner}</svg>`;
}
