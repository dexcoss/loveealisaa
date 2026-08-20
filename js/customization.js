/* ============================================================================
 * WaveTogether — customization.js
 * «Родная душа Winamp»: глубокая кастомизация интерфейса.
 *  - 7 тем-скинов (CSS-переменные в themes.css) + кастомный цвет акцента;
 *  - 4 режима плеера: бар, виджет в углу, плавающее окно, весь экран;
 *  - визуализатор: полосы / волна / круг / выкл;
 *  - фоны: градиенты, картинки-галерея, загрузка своего изображения;
 *  - шрифты, раскладка (чат слева/справа, плеер сверху/снизу);
 *  - эффекты: «сердцебиение» обложки, свечение, частицы, анимации;
 *  - все настройки — в localStorage, применяются ливом, без перезагрузки.
 * ========================================================================== */
'use strict';

/* ------------------------------ СПРАВОЧНИКИ ------------------------------ */

const THEMES = {
  noir:    { name: 'Dark Noir',      bg: '#0b0e1a', panel: '#141a2e', accent: '#8b7cf6', accent2: '#f472b6' },
  pink:    { name: 'Soft Pink',      bg: '#fdf1f5', panel: '#ffffff', accent: '#ec5f93', accent2: '#a78bfa' },
  cyber:   { name: 'Neon Cyber',     bg: '#05070f', panel: '#0b1120', accent: '#22d3ee', accent2: '#f0abfc' },
  pastel:  { name: 'Pastel Dream',   bg: '#f3f0fb', panel: '#ffffff', accent: '#a78bfa', accent2: '#7dd3fc' },
  winamp:  { name: 'Winamp Retro',   bg: '#191921', panel: '#26262f', accent: '#8ce800', accent2: '#ff7f27' },
  ocean:   { name: 'Ocean Blue',     bg: '#04101f', panel: '#0a2036', accent: '#38bdf8', accent2: '#34d399' },
  sunset:  { name: 'Sunset Warm',    bg: '#160b10', panel: '#241118', accent: '#fb923c', accent2: '#f472b6' }
};

const FONTS = {
  inter:   { name: 'Inter',       css: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif" },
  jakarta: { name: 'Jakarta',     css: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" },
  mono:    { name: 'Моно',        css: "'JetBrains Mono', 'Courier New', monospace" },
  serif:   { name: 'С засечками', css: "Georgia, 'Times New Roman', serif" },
  system:  { name: 'Системный',   css: "system-ui, -apple-system, 'Segoe UI', sans-serif" }
};

const ACCENT_PRESETS = ['#8b7cf6', '#ec5f93', '#f59e0b', '#34d399', '#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#22d3ee', '#e879f9'];

const BG_PRESETS = [
  { id: 'default',   name: 'Тема',     kind: 'class', cls: 'bg--default' },
  { id: 'aurora',    name: 'Аврора',   kind: 'class', cls: 'bg--aurora' },
  { id: 'dunes',     name: 'Дюны',     kind: 'class', cls: 'bg--dunes' },
  { id: 'deepsea',   name: 'Глубина',  kind: 'class', cls: 'bg--deepsea' },
  { id: 'meadow',    name: 'Луг',      kind: 'class', cls: 'bg--meadow' },
  { id: 'img-aurora',name: 'Сияние',   kind: 'image', src: 'assets/bg/aurora.jpg' },
  { id: 'img-lofi',  name: 'Комната',  kind: 'image', src: 'assets/bg/lofi-room.jpg' }
];

/* --------------------------- НАСТРОЙКИ: ЯДРО ------------------------------ */

const Custom = (() => {
  const DEFAULTS = {
    theme: 'noir',
    accent: null,                // null = акцент темы
    playerMode: 'bar',           // bar | widget | float | full
    playerPos: 'bottom',         // bottom | top (для bar)
    visualizer: 'bars',          // bars | wave | circle | off
    bg: { type: 'preset', id: 'default', value: null },
    font: 'inter',
    chatSide: 'right',           // right | left
    effects: { heartbeat: true, glow: true, particles: true, anim: true },
    floatPos: null,              // {x,y} плавающего плеера
    volume: 80
  };

  const key = () => 'wt_settings_' + (Session.user || 'guest');

  function get() {
    const saved = DB.get(key(), {});
    // глубокое слияние с дефолтами (для effects и bg)
    return {
      ...DEFAULTS, ...saved,
      effects: { ...DEFAULTS.effects, ...(saved.effects || {}) },
      bg: { ...DEFAULTS.bg, ...(saved.bg || {}) }
    };
  }

  function set(patch) {
    const cur = get();
    const next = { ...cur, ...patch };
    if (patch.effects) next.effects = { ...cur.effects, ...patch.effects };
    if (patch.bg) next.bg = { ...cur.bg, ...patch.bg };
    DB.set(key(), next);
    apply();
    return next;
  }

  function reset() {
    DB.remove(key());
    apply();
  }

  /** Применить настройки к документу — это и есть «живое превью». */
  function apply() {
    const s = get();
    const rootEl = document.documentElement;

    rootEl.dataset.theme = THEMES[s.theme] ? s.theme : 'noir';
    rootEl.dataset.font = FONTS[s.font] ? s.font : 'inter';
    rootEl.dataset.chatside = s.chatSide;
    rootEl.dataset.playerpos = s.playerPos;
    rootEl.dataset.anim = s.effects.anim ? 'on' : 'off';
    rootEl.dataset.glow = s.effects.glow ? 'on' : 'off';
    rootEl.dataset.heartbeat = s.effects.heartbeat ? 'on' : 'off';

    // Кастомный акцент поверх темы
    if (s.accent && /^#[0-9a-f]{6}$/i.test(s.accent)) {
      rootEl.style.setProperty('--accent', s.accent);
    } else {
      rootEl.style.removeProperty('--accent');
    }

    applyBg(s);

    if (typeof Viz !== 'undefined') Viz.setMode(s.visualizer);

    // Запоминаем «последние» настройки для мгновенного применения при загрузке
    DB.set('wt_last_settings', { theme: s.theme, font: s.font, accent: s.accent, chatSide: s.chatSide, playerPos: s.playerPos });

    Particles.setEnabled(s.effects.particles);

    window.dispatchEvent(new CustomEvent('wt-custom'));
  }

  /** Фон: preset-класс / картинка галереи / свой dataURL. */
  function applyBg(s) {
    const layer = qs('#bg-layer');
    if (!layer) return;
    const allCls = BG_PRESETS.map(b => b.cls).filter(Boolean);
    layer.classList.remove(...allCls, 'has-image');
    layer.style.backgroundImage = '';

    if (s.bg.type === 'custom' && s.bg.value) {
      layer.className = 'has-image';
      layer.id = 'bg-layer';
      layer.style.backgroundImage = `url("${s.bg.value}")`;
      return;
    }
    const preset = BG_PRESETS.find(b => b.id === s.bg.id) || BG_PRESETS[0];
    if (preset.kind === 'class') layer.classList.add(preset.cls);
    else {
      layer.classList.add('has-image');
      layer.style.backgroundImage = `url("${preset.src}")`;
    }
  }

  return { get, set, reset, apply };
})();

/* ------------------------------ ЧАСТИЦЫ (FX) ------------------------------ */

const Particles = (() => {
  let enabled = true;
  let raf = null;
  let parts = [];
  const FORMS = ['♥', '♪', '♫', '·'];

  function loop(canvas, ctx) {
    raf = null;
    if (!enabled) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }

    const dpr = window.devicePixelRatio || 1;
    const W = innerWidth, H = innerHeight;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr; canvas.height = H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--accent').trim() || '#8b7cf6';

    // Пополняем до скромных 24 частиц
    if (parts.length < 24 && Math.random() < .25) {
      parts.push({
        x: Math.random() * W,
        y: H + 20,
        vy: .25 + Math.random() * .55,
        sway: Math.random() * Math.PI * 2,
        sw: .2 + Math.random() * .7,
        size: Math.random() < .7 ? 3 + Math.random() * 7 : 12 + Math.random() * 9,
        ch: Math.random() < .55 ? '·' : FORMS[Math.floor(Math.random() * 3)],
        a: .12 + Math.random() * .3
      });
    }

    const t = performance.now() / 1000;
    parts = parts.filter(p => p.y > -30);
    for (const p of parts) {
      p.y -= p.vy;
      const x = p.x + Math.sin(t * p.sw + p.sway) * 14;
      ctx.globalAlpha = p.a * Math.min(1, (H - p.y) / 120 + .2);
      ctx.fillStyle = accent;
      ctx.font = `700 ${p.size}px ${p.ch === '·' ? 'serif' : 'inherit'}`;
      ctx.fillText(p.ch, x, p.y);
    }
    ctx.globalAlpha = 1;

    raf = requestAnimationFrame(() => loop(canvas, ctx));
  }

  return {
    setEnabled(on) {
      enabled = on;
      if (raf) return;
      const canvas = qs('#fx-particles');
      if (!canvas) return;
      raf = requestAnimationFrame(() => loop(canvas, canvas.getContext('2d')));
    }
  };
})();

/* ------------------------- DRAWER «ВНЕШНИЙ ВИД» --------------------------- */

const CustomDrawer = (() => {
  let openState = false;

  function isOpen() { return openState; }

  function open() {
    openState = true;
    qs('#custom-scrim').hidden = false;
    const drawer = qs('#custom-drawer');
    drawer.hidden = false;
    drawer.classList.remove('is-closing');
    render();
  }
  function close() {
    openState = false;
    const drawer = qs('#custom-drawer');
    drawer.classList.add('is-closing');
    qs('#custom-scrim').hidden = true;
    setTimeout(() => { drawer.hidden = true; }, 240);
  }
  function toggle() { openState ? close() : open(); }

  qs('#custom-scrim').addEventListener('click', close);

  /* ------------------------- РЕНДЕР СОДЕРЖИМОГО ------------------------- */

  function section(title, ic, ...body) {
    return h('div', { class: 'set-section' },
      h('h3', {}, h('span', { html: icon(ic, 16) }), title), ...body);
  }

  /**
   * Собрать все секции настроек внешнего вида (используется и в drawer,
   * и на экране «Настройки» — DRY).
   */
  function buildSections() {
    const s = Custom.get();
    return h('div', {},
      // ---------- Темы ----------
      section('Тема интерфейса', 'palette', themeGrid(s)),

      // ---------- Акцент ----------
      section('Цвет акцента', 'sparkle', accentPicker(s)),

      // ---------- Плеер ----------
      section('Стиль плеера', 'note',
        h('div', { class: 'segmented' },
          segBtn('Бар', s.playerMode === 'bar', () => Custom.set({ playerMode: 'bar' })),
          segBtn('Виджет', s.playerMode === 'widget', () => Custom.set({ playerMode: 'widget' })),
          segBtn('Плавающий', s.playerMode === 'float', () => Custom.set({ playerMode: 'float' })),
          segBtn('Во весь экран', s.playerMode === 'full', () => Custom.set({ playerMode: 'full' }))
        ),
        s.playerMode === 'bar' ? h('div', { class: 'segmented', style: { marginTop: '10px' } },
          segBtn('Снизу', s.playerPos === 'bottom', () => Custom.set({ playerPos: 'bottom' })),
          segBtn('Сверху', s.playerPos === 'top', () => Custom.set({ playerPos: 'top' }))
        ) : h('p', { class: 'field-hint', style: { marginTop: '8px' }, text: s.playerMode === 'float'
          ? 'Перетащите плавающий плеер за его «шапку» — как окно Winamp.'
          : 'Виджет живёт в углу и не мешает листать ленту.' })),

      // ---------- Визуализатор ----------
      section('Визуализация музыки', 'wave',
        h('div', { class: 'segmented' },
          segBtn('Полосы', s.visualizer === 'bars', () => Custom.set({ visualizer: 'bars' })),
          segBtn('Волна', s.visualizer === 'wave', () => Custom.set({ visualizer: 'wave' })),
          segBtn('Круг', s.visualizer === 'circle', () => Custom.set({ visualizer: 'circle' })),
          segBtn('Выкл', s.visualizer === 'off', () => Custom.set({ visualizer: 'off' })))),

      // ---------- Фон ----------
      section('Фон', 'image', bgGallery(s)),

      // ---------- Шрифт ----------
      section('Шрифт', 'edit', h('div', { class: 'font-pills' },
        Object.entries(FONTS).map(([id, f]) =>
          h('button', {
            class: 'font-pill' + (s.font === id ? ' is-active' : ''),
            style: { fontFamily: f.css }, text: f.name,
            onclick: () => Custom.set({ font: id })
          })))),

      // ---------- Раскладка ----------
      section('Раскладка комнаты', 'sliders',
        h('div', { class: 'segmented' },
          segBtn('Чат справа', s.chatSide === 'right', () => Custom.set({ chatSide: 'right' })),
          segBtn('Чат слева', s.chatSide === 'left', () => Custom.set({ chatSide: 'left' })))),

      // ---------- Эффекты ----------
      section('Анимации и эффекты', 'heart',
        switchRow('«Сердцебиение» обложки', 'Когда вы слушаете вместе, обложка мягко пульсирует', s.effects.heartbeat, (v) => Custom.set({ effects: { heartbeat: v } })),
        switchRow('Свечение вокруг обложки', 'Мягкий ореол в цвете акцента', s.effects.glow, (v) => Custom.set({ effects: { glow: v } })),
        switchRow('Летающие частицы', 'Нежные сердечки и ноты на фоне', s.effects.particles, (v) => Custom.set({ effects: { particles: v } })),
        switchRow('Анимации интерфейса', 'Плавные переходы и микродвижения', s.effects.anim, (v) => Custom.set({ effects: { anim: v } })))
    );
  }

  function render() {
    const drawer = qs('#custom-drawer');
    const body = h('div', { class: 'drawer__body' },
      buildSections(),
      h('div', { class: 'set-section' },
        h('button', { class: 'btn btn--ghost btn--block', html: icon('x', 16) + ' Сбросить все настройки', onclick: () => { Custom.reset(); } }))
    );

    drawer.replaceChildren(
      h('div', { class: 'drawer__head' },
        h('span', { html: icon('palette', 22) }),
        h('div', {},
          h('h2', { text: 'Внешний вид' }),
          h('div', { class: 'sub', text: 'Всё применяется мгновенно — смотрите живое превью' })),
        h('button', { class: 'btn-icon', html: icon('x', 18), onclick: close })),
      body
    );
  }

  /* --- под-виджеты --- */

  const segBtn = (label, active, fn) =>
    h('button', { class: active ? 'is-active' : '', text: label, onclick: fn });

  function themeGrid(s) {
    return h('div', { class: 'theme-grid' },
      Object.entries(THEMES).map(([id, t]) =>
        h('button', {
          class: 'theme-swatch' + (s.theme === id ? ' is-active' : ''),
          onclick: () => Custom.set({ theme: id })
        },
          h('div', { class: 'preview', style: { background: t.bg } },
            h('div', { class: 'bar b1', style: { background: t.panel, border: '1px solid ' + t.accent + '55' } }),
            h('div', { class: 'bar b2', style: { background: t.accent } }),
            h('div', { class: 'bar b3', style: { background: t.accent2 } })),
          h('span', { class: 'name', text: t.name }))));
  }

  function accentPicker(s) {
    const input = h('input', {
      class: 'color-input', type: 'color',
      value: s.accent || (THEMES[s.theme] || THEMES.noir).accent,
      oninput: (e) => Custom.set({ accent: e.target.value })
    });
    return h('div', { class: 'accent-row' },
      h('div', { class: 'accent-presets' },
        ACCENT_PRESETS.map(c => h('button', {
          class: 'accent-dot' + ((s.accent || '').toLowerCase() === c ? ' is-active' : ''),
          style: { background: c }, title: c,
          onclick: () => Custom.set({ accent: c })
        }))),
      input,
      s.accent ? h('button', { class: 'btn btn--mini', text: 'По теме', onclick: () => Custom.set({ accent: null }) }) : null
    );
  }

  function bgGallery(s) {
    const grid = h('div', { class: 'bg-grid' });
    BG_PRESETS.forEach(b => {
      const active = s.bg.type === 'preset' && s.bg.id === b.id;
      const el = h('button', {
        class: 'bg-thumb' + (active ? ' is-active' : ''),
        onclick: () => Custom.set({ bg: { type: 'preset', id: b.id, value: null } })
      }, h('span', { text: b.name }));
      if (b.kind === 'image') {
        el.style.backgroundImage = `url("${b.src}")`;
      } else {
        // Мини-превью через CSS-фон самой страницы невозможно — рисуем градиент вручную
        const previews = {
          default: 'linear-gradient(135deg,#0b0e1a,#1b2140)',
          aurora: 'linear-gradient(135deg,#12102b,#3b1e63 60%,#0d3b4f)',
          dunes: 'linear-gradient(135deg,#2b1608,#7a3c12)',
          deepsea: 'linear-gradient(135deg,#011c2b,#0a4a63)',
          meadow: 'linear-gradient(135deg,#08230f,#2c5d1d)'
        };
        el.style.background = previews[b.id] || previews.default;
      }
      grid.append(el);
    });
    // Кастомная загрузка
    const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    const up = h('button', { class: 'bg-thumb bg-thumb--upload' + (s.bg.type === 'custom' ? ' is-active' : '') },
      s.bg.type === 'custom' && s.bg.value
        ? null
        : h('span', { html: icon('upload', 18) }),
      h('span', { text: s.bg.type === 'custom' ? 'Свой фон ✓' : 'Своя картинка' }));
    if (s.bg.type === 'custom' && s.bg.value) up.style.backgroundImage = `url("${s.bg.value}")`;
    up.onclick = () => file.click();
    file.onchange = () => {
      const f = file.files[0];
      if (!f) return;
      if (f.size > 1_300_000) { toast('Картинка тяжеловата для localStorage — выберите до ~1.2 МБ', { type: 'error' }); return; }
      const rd = new FileReader();
      rd.onload = () => Custom.set({ bg: { type: 'custom', id: 'custom', value: rd.result } });
      rd.readAsDataURL(f);
    };
    grid.append(up, file);
    return grid;
  }

  function switchRow(title, sub, on, fn) {
    const sw = h('label', { class: 'switch' },
      h('input', { type: 'checkbox' }),
      h('span', { class: 'track' }));
    const inp = qs('input', sw);
    inp.checked = on;
    inp.addEventListener('change', () => fn(inp.checked));
    return h('div', { class: 'set-row' },
      h('div', { class: 'set-row__txt' }, h('b', { text: title }), h('span', { text: sub })),
      sw);
  }

  // Перерисовывать drawer, когда настройки поменялись (и он открыт)
  window.addEventListener('wt-custom', () => { if (openState) render(); });

  return { open, close, toggle, isOpen, render, buildSections };
})();
