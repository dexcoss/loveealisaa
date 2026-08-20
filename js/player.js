/* ============================================================================
 * WaveTogether — player.js
 * Всё, что связано с музыкой:
 *  1) Каталог треков (SoundCloud URL + метаданные + локальные обложки)
 *  2) Engine — движок воспроизведения через SoundCloud Widget API
 *     (iframe, SC.Widget: play/pause/seek/события). Если SoundCloud недоступен
 *     (нет сети, трек запретил встраивание) — включается «симулятор» на
 *     таймерах, чтобы интерфейс и синхронизация продолжали работать.
 *  3) Viz — canvas-визуализатор (полосы / волна / круг). Аудиопоток iframe
 *     закрыт политикой same-origin, поэтому спектр — красивая симуляция,
 *     синхронизированная с состоянием play/pause.
 *  4) GlobalWave — «общая волна», детерминированная радиостанция по времени.
 *  5) RoomPlayback — состояние комнаты + команды (play/pause/seek/...).
 *  6) Playback — контроллер-дирижёр: синхронизация Engine с состоянием,
 *     лидерство в комнате, док-плеер в 4 режимах.
 * ========================================================================== */
'use strict';

/* ============================ 1. КАТАЛОГ ТРЕКОВ ========================== */
/*
 * SoundCloud закрыл выдачу API-ключей, поэтому поиск по открытому API
 * недоступен. Мы идём по безопасному пути:
 *  - встроенный каталог курируемых треков (URL — публичные страницы SC,
 *    воспроизведение идёт через официальный Widget API, им QA/OAuth не нужен);
 *  - добавление ЛЮБОГО трека по ссылке через oEmbed (см. addTrackByUrl).
 * Если конкретный трек запретил встраивание — движок автоматически пометит
 * его «недоступным» и волна перейдёт к следующему (см. Engine).
 */

const MOODS = {
  romantic:  { label: 'Романтика',   color: '#ec5f93', desc: 'Нежные треки для двоих',    cover: 'assets/covers/romantic.jpg' },
  chill:     { label: 'Чилл',        color: '#38bdf8', desc: 'Спокойный фон и мягкий грув', cover: 'assets/covers/chill.jpg' },
  energetic: { label: 'Энергия',     color: '#f59e0b', desc: 'Заводит и не отпускает',     cover: 'assets/covers/energetic.jpg' },
  sad:       { label: 'Грусть',      color: '#8191c9', desc: 'Когда хочется погрустить',   cover: 'assets/covers/sad.jpg' },
  night:     { label: 'Ночной вайб', color: '#8b5cf6', desc: 'Город, неон и полночь',      cover: 'assets/covers/night.jpg' },
  lofi:      { label: 'Lo-Fi',       color: '#d99a5b', desc: 'Тёплый лоуфай под пледом',   cover: 'assets/covers/lofi.jpg' },
  pop:       { label: 'Поп',         color: '#f472b6', desc: 'Лёгкое и прилипчивое',       cover: 'assets/covers/pop.jpg' },
  mix:       { label: 'Микс',        color: '#34d399', desc: 'Всё сразу, как в радио',     cover: 'assets/covers/chill.jpg' }
};

/** Встроенный каталог. dur — длительность в секундах (примерная, для UI). */
const TRACKS = [
  // --- Романтика ---
  { id: 'jk-love-mode',    t: 'Love Mode',        a: 'Joakim Karud',     u: 'https://soundcloud.com/joakimkarud/love-mode',        dur: 152, moods: ['romantic', 'lofi'] },
  { id: 'dy-could-you',    t: 'Could You',        a: 'Dyalla',           u: 'https://soundcloud.com/dyallas/could-you',            dur: 165, moods: ['romantic', 'chill'] },
  { id: 'lk-btp',          t: 'By The Pool',      a: 'LAKEY INSPIRED',   u: 'https://soundcloud.com/lakeyinspired/by-the-pool',    dur: 163, moods: ['romantic', 'chill'] },
  { id: 'lk-thinking',     t: 'Thinking Of You',  a: 'LAKEY INSPIRED',   u: 'https://soundcloud.com/lakeyinspired/thinking-of-you',dur: 180, moods: ['romantic', 'sad'] },
  { id: 'jk-dreams',       t: 'Dreams',           a: 'Joakim Karud',     u: 'https://soundcloud.com/joakimkarud/dreams-1',         dur: 166, moods: ['chill', 'romantic', 'lofi'] },

  // --- Чилл ---
  { id: 'jk-waves',        t: 'Waves',            a: 'Joakim Karud',     u: 'https://soundcloud.com/joakimkarud/waves',            dur: 157, moods: ['chill', 'lofi'] },
  { id: 'lk-better-days',  t: 'Better Days',      a: 'LAKEY INSPIRED',   u: 'https://soundcloud.com/lakeyinspired/better-days',    dur: 162, moods: ['chill', 'lofi', 'pop'] },
  { id: 'forss-flicker',   t: 'Flickermood',      a: 'Forss',            u: 'https://soundcloud.com/forss/flickermood',            dur: 208, moods: ['chill', 'night'] },
  { id: 'ejr-origin',      t: 'Origin',           a: 'Electric Joy Ride',u: 'https://soundcloud.com/nocopyrightsounds/electric-joy-ride-origin-ncs-release', dur: 218, moods: ['chill'] },
  { id: 'bff-layers',      t: 'Layers',           a: 'Broke For Free',   u: 'https://soundcloud.com/broke-for-free/broke-for-free-layers', dur: 210, moods: ['chill', 'sad'] },
  { id: 'tobu-hope',       t: 'Hope',             a: 'Tobu',             u: 'https://soundcloud.com/nocopyrightsounds/tobu-hope-ncs-release', dur: 285, moods: ['chill', 'pop'] },

  // --- Энергия ---
  { id: 'aw-fade',         t: 'Fade',             a: 'Alan Walker',      u: 'https://soundcloud.com/nocopyrightsounds/alan-walker-fade-ncs-release', dur: 262, moods: ['energetic', 'night'] },
  { id: 'aw-spectre',      t: 'Spectre',          a: 'Alan Walker',      u: 'https://soundcloud.com/nocopyrightsounds/alan-walker-spectre-ncs-release', dur: 230, moods: ['energetic'] },
  { id: 'dk-invincible',   t: 'Invincible',       a: 'DEAF KEV',         u: 'https://soundcloud.com/nocopyrightsounds/deaf-kev-invincible-ncs-release', dur: 273, moods: ['energetic', 'night'] },
  { id: 'dh-nekozilla',    t: 'Nekozilla',        a: 'Different Heaven', u: 'https://soundcloud.com/nocopyrightsounds/different-heaven-nekozilla-ncs-release', dur: 179, moods: ['energetic', 'pop'] },
  { id: 'jy-arrow',        t: 'Arrow',            a: 'Jim Yosef',        u: 'https://soundcloud.com/nocopyrightsounds/jim-yosef-arrow-ncs-release', dur: 187, moods: ['energetic'] },
  { id: 'vex-heroes',      t: 'Masked Heroes',    a: 'Vexento',          u: 'https://soundcloud.com/vexento/vexento-masked-heroes', dur: 200, moods: ['energetic', 'pop'] },

  // --- Грусть ---
  { id: 'bff-old',         t: 'Something Old',    a: 'Broke For Free',   u: 'https://soundcloud.com/broke-for-free/something-old', dur: 203, moods: ['sad', 'chill'] },
  { id: 'dy-city',         t: 'City Lights',      a: 'Dyalla',           u: 'https://soundcloud.com/dyallas/city-lights',          dur: 170, moods: ['sad', 'night'] },
  { id: 'lk-miss',         t: 'I Found Me',       a: 'LAKEY INSPIRED',   u: 'https://soundcloud.com/lakeyinspired/i-found-me',     dur: 175, moods: ['sad', 'lofi'] },

  // --- Ночной вайб ---
  { id: 'ahrix-nova',      t: 'Nova',             a: 'Ahrix',            u: 'https://soundcloud.com/nocopyrightsounds/ahrix-nova-ncs-release', dur: 268, moods: ['night', 'chill'] },
  { id: 'dis-blank',       t: 'Blank',            a: 'Disfigure',        u: 'https://soundcloud.com/nocopyrightsounds/disfigure-blank-ncs-release', dur: 209, moods: ['night', 'energetic'] },
  { id: 'lensko-circles',  t: 'Circles',          a: 'Lensko',           u: 'https://soundcloud.com/nocopyrightsounds/lensko-circles-ncs-release', dur: 262, moods: ['night', 'chill'] },
  { id: 'lk-monroe',       t: 'Monroe',           a: 'LAKEY INSPIRED',   u: 'https://soundcloud.com/lakeyinspired/monroe',         dur: 158, moods: ['night', 'lofi'] },

  // --- Поп ---
  { id: 'cartoon-onon',    t: 'On & On',          a: 'Cartoon, Daniel Levi', u: 'https://soundcloud.com/nocopyrightsounds/cartoon-on-on-feat-daniel-levi-ncs-release', dur: 208, moods: ['pop', 'energetic'] },
  { id: 'janji-heroes',    t: 'Heroes Tonight',   a: 'Janji, Johnning',  u: 'https://soundcloud.com/nocopyrightsounds/janji-heroes-tonight-feat-johnningncs-release', dur: 209, moods: ['pop', 'energetic'] },
  { id: 'jk-great-days',   t: 'Great Days',       a: 'Joakim Karud',     u: 'https://soundcloud.com/joakimkarud/great-days',       dur: 154, moods: ['pop', 'chill'] }
];

/** Найти трек по id — во встроенном каталоге либо в пользовательских. */
function trackById(id) {
  return TRACKS.find(t => t.id === id)
      || (DB.get('wt_custom_tracks', []) || []).find(t => t.id === id)
      || null;
}

/** Поиск по локальному каталогу (название/исполнитель/настроение). */
function searchTracks(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = TRACKS.concat(DB.get('wt_custom_tracks', []));
  return all.filter(t =>
    t.t.toLowerCase().includes(q) ||
    t.a.toLowerCase().includes(q) ||
    t.moods.some(m => MOODS[m] && MOODS[m].label.toLowerCase().includes(q))
  ).slice(0, 20);
}

/** Обложка трека: его cover или обложка первого настроения. */
function trackCover(t) {
  if (!t) return MOODS.chill.cover;
  if (t.cover) return t.cover;
  return (MOODS[t.moods[0]] || MOODS.chill).cover;
}

/**
 * Добавить трек по ссылке на SoundCloud через oEmbed (ключ не нужен).
 * Возвращает Promise<Track>. При недоступности oEmbed создаёт запись
 * с данными из самой ссылки.
 */
async function addTrackByUrl(url) {
  url = url.trim();
  if (!/^https?:\/\/(www\.)?(on\.)?soundcloud\.com\//i.test(url)) {
    throw new Error('Это не похоже на ссылку SoundCloud');
  }
  if (url.includes('on.soundcloud.com')) {
    // короткие ссылки: раскрыть без сети нельзя — принимаем как есть
  }
  const id = 'cust_' + hashInt(url).toString(36);
  const existing = trackById(id);
  if (existing) return existing;

  let meta = null;
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(url), { signal: ctrl.signal });
    clearTimeout(tm);
    if (res.ok) meta = await res.json();
  } catch (e) { /* сеть недоступна — создадим запись по ссылке */ }

  // Фоллбэк: вытаскиваем исполнителя и название из slug ссылки
  const parts = new URL(url, location.href).pathname.split('/').filter(Boolean);
  const slugT = (parts[1] || 'Трек').replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
  const slugA = (parts[0] || 'SoundCloud').replaceAll('-', ' ');

  const track = {
    id,
    t: meta ? (meta.title || slugT).slice(0, 80) : slugT,
    a: meta ? (meta.author_name || slugA) : slugA,
    u: url,
    cover: meta && meta.thumbnail_url ? meta.thumbnail_url.replace('-t500x500', '-t500x500') : null,
    dur: 180,
    moods: ['chill']
  };
  const list = DB.get('wt_custom_tracks', []);
  list.push(track);
  DB.set('wt_custom_tracks', list);
  return track;
}

/* ======================= 2. ДВИЖОК (SoundCloud Widget) =================== */

const Engine = (() => {
  // Треки, по которым SC отказал в воспроизведении (на сессию)
  const DEAD = new Set(DB.get('wt_dead_tracks', []));

  const ev = { play: [], pause: [], finish: [], progress: [], ready: [] };
  const on = (k, f) => ev[k] && ev[k].push(f);
  const emit = (k, ...a) => (ev[k] || []).forEach(f => { try { f(...a); } catch (e) { console.error('Engine listener:', e); } });

  let backend = 'none';          // 'sc' | 'sim' | 'none'
  let widget = null;             // SC.Widget
  let currentTrack = null;
  let volume = 80;
  let isPlaying = false;         // фактическое состояние (по событиям виджета/симулятора)
  let lastWidgetPos = 0;         // последняя известная позиция виджета, мс
  let wantAutoplay = false;
  let loadToken = 0;
  let pendingOffset = 0;         // позиция, которую применим после READY
  let settled = false;           // виджет ответил на текущую загрузку
  let settleTimeout = null;      // таймер «виджет не отвечает»

  // --- Симулятор (запасной бэкенд) ---
  let sim = null;                // { playing, base, pausedAt }
  let simTimer = null;

  /** Динамическая подгрузка api.js SoundCloud с таймаутом. */
  let apiPromise = null;
  function loadSCApi() {
    if (window.SC && window.SC.Widget) return Promise.resolve(true);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://w.soundcloud.com/player/api.js';
      const to = setTimeout(() => { fail(); }, 8000);
      function fail() { clearTimeout(to); resolve(false); apiPromise = Promise.resolve(false); }
      s.onload = () => { clearTimeout(to); resolve(true); };
      s.onerror = fail;
      document.head.append(s);
    });
    return apiPromise;
  }

  /** URL iframe-виджета. Визуал виджета скрыт — у нас свой плеер. */
  function widgetUrl(t, autoplay) {
    return 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(t.u)
      + '&auto_play=' + (autoplay ? 'true' : 'false')
      + '&hide_related=true&show_comments=false&show_user=false&show_reposts=false'
      + '&visual=false&buying=false&sharing=false&download=false&show_artwork=false&show_playcount=false&liking=false';
  }

  /** Отметить трек «недоступным», чтобы волны его пропускали. */
  function markDead(t) {
    if (!t) return;
    DEAD.add(t.id);
    DB.set('wt_dead_tracks', Array.from(DEAD));
    console.warn('[WT] Трек недоступен для встраивания:', t.t);
    Bus.send('track-dead', { id: t.id });
  }

  /** Перевооружить сторож таймаута загрузки виджета. */
  function armSettleGuard() {
    settled = false;
    clearTimeout(settleTimeout);
    settleTimeout = setTimeout(() => {
      if (!settled && currentTrack) {
        markDead(currentTrack);
        startSim(currentTrack, pendingOffset, wantAutoplay);
      }
    }, 9000);
  }

  /** Создать iframe + SC.Widget ровно один раз, привязать события. */
  function createWidget(t, autoplay) {
    const holder = qs('#sc-holder');
    holder.innerHTML = '';
    const iframe = h('iframe', {
      width: '220', height: '130', frameborder: 'no', scrolling: 'no',
      allow: 'autoplay; encrypted-media',
      src: widgetUrl(t, autoplay),
      title: 'SoundCloud player'
    });
    holder.append(iframe);
    try { widget = SC.Widget(iframe); } catch (e) { widget = null; }
    if (!widget) return false;

    armSettleGuard();
    widget.bind(SC.Widget.Events.READY, () => {
      settled = true; clearTimeout(settleTimeout);
      backend = 'sc';
      widget.setVolume(volume);
      if (pendingOffset > 1000) widget.seekTo(pendingOffset);
      if (!wantAutoplay) setTimeout(() => { try { widget.pause(); } catch (e) {} }, 160);
      emit('ready');
    });
    widget.bind(SC.Widget.Events.PLAY, () => { isPlaying = true; emit('play'); });
    widget.bind(SC.Widget.Events.PAUSE, () => { isPlaying = false; emit('pause'); });
    widget.bind(SC.Widget.Events.FINISH, () => { isPlaying = false; emit('finish'); });
    widget.bind(SC.Widget.Events.PLAY_PROGRESS, (d) => {
      if (d && typeof d.currentPosition === 'number') {
        lastWidgetPos = d.currentPosition;
        emit('progress', { position: lastWidgetPos });
      }
    });
    widget.bind(SC.Widget.Events.ERROR, () => {
      clearTimeout(settleTimeout);
      if (currentTrack) { markDead(currentTrack); startSim(currentTrack, pendingOffset, wantAutoplay); }
    });
    return true;
  }

  /** Загрузить трек. offset — мс, autoplay — начать сразу. */
  async function load(t, { offset = 0, autoplay = true } = {}) {
    const token = ++loadToken;
    currentTrack = t;
    lastWidgetPos = offset;
    pendingOffset = offset;
    wantAutoplay = autoplay;
    stopSim();

    const useSC = !!(t.u) && !DEAD.has(t.id) && await loadSCApi();
    if (token !== loadToken) return; // во время ожидания загрузили другой трек

    if (useSC) {
      backend = 'sc';
      if (widget) {
        // Виджет уже жив: перезагружаем ТРЕК В ТОМ ЖЕ iframe — так autoplay
        // при автопереходе волны не режется политикой браузера.
        armSettleGuard();
        try {
          widget.load(t.u, {
            auto_play: autoplay, hide_related: true, show_comments: false,
            show_user: false, show_reposts: false, visual: false, buying: false,
            sharing: false, download: false, show_artwork: false
          });
        } catch (e) {
          markDead(t); startSim(t, offset, autoplay);
        }
        return;
      }
      if (!createWidget(t, autoplay)) startSim(t, offset, autoplay);
    } else {
      destroyWidget();
      startSim(t, offset, autoplay);
    }
  }

  /* ------------------------- Симулятор ------------------------- */
  function startSim(t, offset = 0, autoplay = true) {
    destroyWidget();
    backend = 'sim';
    sim = { playing: autoplay, base: performance.now() - offset, pausedAt: offset };
    emit('ready');
    if (autoplay) { isPlaying = true; emit('play'); }
    simLoop();
  }
  function simLoop() {
    clearTimeout(simTimer);
    if (!sim || !currentTrack) return;
    const dur = currentTrack.dur * 1000;
    const pos = simPosition();
    emit('progress', { position: pos });
    if (sim.playing && pos >= dur) {
      sim.playing = false; sim.pausedAt = dur; isPlaying = false;
      emit('finish');
      return;
    }
    simTimer = setTimeout(simLoop, 300);
  }
  function simPosition() {
    if (!sim) return 0;
    const dur = currentTrack ? currentTrack.dur * 1000 : 0;
    return clamp(sim.playing ? performance.now() - sim.base : sim.pausedAt, 0, dur);
  }
  function stopSim() { clearTimeout(simTimer); sim = null; }

  function destroyWidget() {
    if (widget) { try { /* у SC.Widget нет destroy, убираем iframe */ } catch (e) {} }
    widget = null;
    const holder = qs('#sc-holder');
    if (holder) holder.innerHTML = '';
    isPlaying = false;
    backend = 'none';
  }

  return {
    on, load,
    play() {
      if (backend === 'sc' && widget) { try { widget.play(); } catch (e) {} }
      else if (backend === 'sim' && sim && !sim.playing) {
        sim.playing = true; sim.base = performance.now() - sim.pausedAt;
        isPlaying = true; emit('play'); simLoop();
      }
    },
    pause() {
      if (backend === 'sc' && widget) { try { widget.pause(); } catch (e) {} }
      else if (backend === 'sim' && sim && sim.playing) {
        sim.playing = false; sim.pausedAt = simPosition();
        isPlaying = false; emit('pause');
      }
    },
    seekTo(ms) {
      lastWidgetPos = ms;
      if (backend === 'sc' && widget) { try { widget.seekTo(ms); } catch (e) {} }
      else if (backend === 'sim' && sim) {
        sim.pausedAt = ms; if (sim.playing) sim.base = performance.now() - ms;
        emit('progress', { position: ms }); simLoop();
      }
    },
    setVolume(v) {
      volume = clamp(Math.round(v), 0, 100);
      if (backend === 'sc' && widget) { try { widget.setVolume(volume); } catch (e) {} }
    },
    stop() { stopSim(); destroyWidget(); currentTrack = null; },
    /** Текущая позиция движка (приблизительно). */
    positionMs() { return backend === 'sim' ? simPosition() : lastWidgetPos; },
    get playing() { return isPlaying; },
    get track() { return currentTrack; },
    get backendName() { return backend; },
    /** Помечен ли трек недоступным. */
    isDead: (id) => DEAD.has(id)
  };
})();

/* ======================== 3. ВИЗУАЛИЗАТОР (CANVAS) ======================= */

const Viz = (() => {
  /** @type {Map<HTMLCanvasElement, CanvasRenderingContext2D>} */
  const canvases = new Map();
  let mode = 'bars';
  let playing = false;
  let raf = null;
  let energy = 0;                 // «разгон» анимации 0..1
  let accent = '#8b7cf6', accent2 = '#f472b6';
  let lastColorRead = 0;

  function readColors() {
    const now = performance.now();
    if (now - lastColorRead < 800) return;
    lastColorRead = now;
    const cs = getComputedStyle(document.documentElement);
    accent = cs.getPropertyValue('--accent').trim() || accent;
    accent2 = cs.getPropertyValue('--accent-2').trim() || accent2;
  }

  function sizeOf(c) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 300, hgt = c.clientHeight || 70;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr);
    }
    const ctx = canvases.get(c);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, hgt, ctx };
  }

  /** Псевдо-спектр: сумма синусов с разными фазами — выглядит «музыкально». */
  const spec = (t, i, n) => {
    const x = i / n;
    const v = Math.abs(Math.sin(t * 2.2 + x * 9.1) * 0.55
                     + Math.sin(t * 3.7 + x * 21.4) * 0.30
                     + Math.sin(t * 1.3 + x * 3.3) * 0.15);
    return Math.pow(v, 1.4);
  };

  function drawBars(size, t) {
    const { w, hgt, ctx } = size;
    ctx.clearRect(0, 0, w, hgt);
    const N = 44, bw = w / N;
    const g = ctx.createLinearGradient(0, hgt, 0, 0);
    g.addColorStop(0, accent); g.addColorStop(1, accent2);
    ctx.fillStyle = g;
    for (let i = 0; i < N; i++) {
      const v = 0.08 + spec(t, i, N) * 0.92 * energy + 0.02;
      const bh = Math.max(2, hgt * v * 0.96);
      const x = i * bw + bw * 0.22;
      const wdt = bw * 0.56;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, hgt - bh, wdt, bh, wdt / 2);
      else ctx.rect(x, hgt - bh, wdt, bh);
      ctx.fill();
    }
  }

  function drawWave(size, t) {
    const { w, hgt, ctx } = size;
    ctx.clearRect(0, 0, w, hgt);
    const mid = hgt / 2;
    [[accent, 1, 0], [accent2, .55, 1.6]].forEach(([col, alpha, phase]) => {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const env = Math.sin((x / w) * Math.PI);          // затухание к краям
        const amp = env * (10 + 26 * energy) * (0.3 + 0.7 * spec(t + phase, x, w));
        const y = mid + Math.sin(t * 3.1 + x * 0.045 + phase) * amp;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1;
    });
  }

  function drawCircle(size, t) {
    const { w, hgt, ctx } = size;
    ctx.clearRect(0, 0, w, hgt);
    const cx = w / 2, cy = hgt / 2;
    const R = Math.min(w, hgt) * 0.30;
    // внутреннее свечение
    const glow = ctx.createRadialGradient(cx, cy, R * .2, cx, cy, R * 1.8);
    glow.addColorStop(0, accent + '55'); glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, hgt);
    const N = 64;
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const v = 0.12 + spec(t, i, N) * 0.88 * energy + 0.02;
      const r2 = R + R * 0.55 * v;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.strokeStyle = i % 2 ? accent : accent2;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = accent; ctx.globalAlpha = .5; ctx.lineWidth = 1.4; ctx.stroke(); ctx.globalAlpha = 1;
  }

  function frame() {
    raf = null;
    if (canvases.size === 0) return;
    readColors();
    const t = performance.now() / 1000;
    energy += ((playing ? 1 : 0) - energy) * 0.07;
    canvases.forEach((ctx, c) => {
      if (!c.isConnected) { canvases.delete(c); return; }
      if (mode === 'off') { ctx.clearRect(0, 0, c.width, c.height); return; }
      const size = sizeOf(c);
      if (mode === 'bars') drawBars(size, t);
      else if (mode === 'wave') drawWave(size, t);
      else if (mode === 'circle') drawCircle(size, t);
    });
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  return {
    attach(c) { if (c && !canvases.has(c)) { canvases.set(c, c.getContext('2d')); kick(); } },
    detach(c) { canvases.delete(c); },
    setMode(m) { mode = m; canvases.forEach((ctx, c) => ctx.clearRect(0, 0, c.width, c.height)); kick(); },
    setPlaying(p) { playing = p; kick(); },
    get mode() { return mode; }
  };
})();

/* ===================== 4. ОБЩАЯ ВОЛНА (глобальное радио) ================= */

const GlobalWave = (() => {
  const KEY = 'wt_global_v1';

  /** Псевдо-случайное число слушателей — «живой» счётчик радио. */
  const listeners = () => 118 + (hashInt('g' + Math.floor(Date.now() / 12000)) % 46);

  function queueFor(mood) {
    const ids = TRACKS
      .filter(t => mood === 'mix' ? true : t.moods.includes(mood))
      .filter(t => !Engine.isDead(t.id))
      .map(t => t.id);
    return seededShuffle(ids, hashInt('global-' + mood));
  }

  function ensure() {
    let st = DB.get(KEY);
    if (!st) { st = { mood: 'mix', index: 0, startTs: Date.now(), queue: queueFor('mix'), playing: true }; DB.set(KEY, st); }
    return st;
  }

  /** Промотать состояние по реальному времени (работает на всех вкладках одинаково). */
  function advance(st) {
    if (!st.playing) return st;
    let changed = false, guard = 0;
    while (guard++ < 30) {
      const tr = trackById(st.queue[st.index]);
      const dur = ((tr ? tr.dur : 181)) * 1000;
      if (Date.now() - st.startTs >= dur) {
        st.index = (st.index + 1) % Math.max(1, st.queue.length);
        if (st.index === 0) st.queue = seededShuffle(st.queue, hashInt('greshuffle-' + st.startTs));
        st.startTs += dur;
        changed = true;
      } else break;
    }
    if (changed) DB.set(KEY, st);
    return st;
  }

  function current(depth = 0) {
    let st = advance(ensure());
    let track = trackById(st.queue[st.index]);
    if (!track && depth < 3) {          // вся очередь «умерла» — пересоберём
      st = { mood: st.mood, index: 0, startTs: Date.now(), queue: queueFor(st.mood), playing: true };
      DB.set(KEY, st);
      return current(depth + 1);
    }
    if (!track) track = TRACKS[0];      // жёсткий фоллбэк
    return { st, track, pos: clamp(Date.now() - st.startTs, 0, track.dur * 1000) };
  }

  return {
    current, listeners, queueFor,
    get mood() { return ensure().mood; },
    setMood(mood) {
      DB.set(KEY, { mood, index: 0, startTs: Date.now(), queue: queueFor(mood), playing: true });
      Bus.send('global', { reason: 'mood' });
    },
    /** Перескочить трек для всех слушателей общей волны. */
    skip() {
      const st = advance(ensure());
      st.index = (st.index + 1) % st.queue.length;
      st.startTs = Date.now();
      DB.set(KEY, st);
      Bus.send('global', { reason: 'skip' });
    }
  };
})();

/* ==================== 5. СОСТОЯНИЕ КОМНАТЫ (ROOM PLAYBACK) =============== */

const RoomPlayback = (() => {
  const key = (id) => 'wt_roomstate_' + id;

  /** Детерминированная очередь волны: одинаковая у обоих участников. */
  function waveQueue(roomId, mood) {
    const ids = TRACKS
      .filter(t => t.moods.includes(mood) && !Engine.isDead(t.id))
      .map(t => t.id);
    return seededShuffle(ids, hashInt('wave-' + roomId + '-' + mood));
  }

  function ensure(room) {
    let st = DB.get(key(room.id));
    if (!st) {
      const mood = room.mood || 'chill';
      st = {
        source: { kind: 'wave', mood },
        queue: waveQueue(room.id, mood),
        index: 0, playing: false, posMs: 0,
        updatedAt: Date.now(), updatedBy: Session.user || 'system',
        shuffle: false, repeat: true
      };
      DB.set(key(room.id), st);
    }
    return st;
  }

  /** Абсолютная позиция с учётом течения времени. */
  function position(st) {
    const tr = trackById(st.queue[st.index]);
    const dur = (tr ? tr.dur : 181) * 1000;
    const pos = st.playing ? st.posMs + (Date.now() - st.updatedAt) : st.posMs;
    return clamp(pos, 0, dur);
  }

  /** Записать состояние и оповестить все вкладки. */
  function write(roomId, st, reason) {
    st.updatedBy = Session.user || st.updatedBy;
    DB.set(key(roomId), st);
    Bus.send('room-state', { roomId, st, reason });
    return st;
  }

  /** Следующий индекс с учётом shuffle/repeat. */
  function nextIndex(st, dir) {
    const len = st.queue.length;
    if (len === 0) return 0;
    if (st.shuffle && dir !== 0) {
      if (len < 2) return st.index;
      let i = st.index;
      while (i === st.index) i = Math.floor(Math.random() * len);
      return i;
    }
    let i = st.index + dir;
    if (st.repeat) i = ((i % len) + len) % len;
    else i = clamp(i, 0, len - 1);
    return i;
  }

  /**
   * Команды управления воспроизведением. Каждая команда — перезапись
   * состояния + broadcast. Все вкладки комнаты подхватывают изменение.
   */
  function command(room, cmd, arg = {}) {
    let st = ensure(room);
    const now = Date.now();
    switch (cmd) {
      case 'toggle':
        if (st.playing) { st.posMs = position(st); st.playing = false; }
        else { st.playing = true; }
        st.updatedAt = now; break;
      case 'play':
        st.playing = true; st.updatedAt = now; break;
      case 'pause':
        st.posMs = position(st); st.playing = false; st.updatedAt = now; break;
      case 'seek':
        st.posMs = clamp(arg.ms || 0, 0, (trackById(st.queue[st.index]) || { dur: 181 }).dur * 1000);
        st.updatedAt = now; break;
      case 'next':
        st.index = nextIndex(st, 1); st.posMs = 0; st.updatedAt = now;
        st.playing = arg.keepPlaying !== undefined ? arg.keepPlaying : true; break;
      case 'prev':
        st.index = nextIndex(st, -1); st.posMs = 0; st.updatedAt = now; break;
      case 'playIndex':
        st.index = clamp(arg.i, 0, Math.max(0, st.queue.length - 1));
        st.posMs = 0; st.playing = true; st.updatedAt = now; break;
      case 'wave':
        st = { ...st, source: { kind: 'wave', mood: arg.mood }, queue: waveQueue(room.id, arg.mood), index: 0, posMs: 0, playing: true, updatedAt: now };
        break;
      case 'playlist':
        st = { ...st, source: { kind: 'playlist', playlistId: arg.playlistId, scope: arg.scope }, queue: arg.queue.slice(), index: 0, posMs: 0, playing: true, updatedAt: now };
        break;
      case 'shuffle': st.shuffle = !st.shuffle; break;
      case 'repeat': st.repeat = !st.repeat; break;
    }
    return write(room.id, st, cmd);
  }

  /** Вставить трек сразу после текущего (и, по желанию, сразу включить). */
  function insertNext(room, trackId, playNow = false) {
    const st = ensure(room);
    st.queue.splice(st.index + 1, 0, trackId);
    if (playNow) { st.index++; st.posMs = 0; st.playing = true; }
    st.updatedAt = Date.now();
    return write(room.id, st, 'insert');
  }

  /** Автопереход: если трек по времени закончился — переключить. */
  function autoAdvance(room) {
    const st = ensure(room);
    if (!st.playing || st.queue.length === 0) return false;
    const tr = trackById(st.queue[st.index]);
    if (!tr) return false;
    if (position(st) >= tr.dur * 1000) {
      command(room, 'next', { keepPlaying: true });
      return true;
    }
    return false;
  }

  return { ensure, get: (id) => DB.get(key(id)), position, command, autoAdvance, waveQueue, key, insertNext };
})();

/* ================= 6. КОНТРОЛЛЕР ВОСПРОИЗВЕДЕНИЯ + ДОК ==================== */

const Playback = (() => {
  let source = null;              // {kind:'room', roomId} | {kind:'global'}
  let engineKey = null;           // ключ «что сейчас загружено в движок»
  let changeHooks = [];           // колбэки подписчиков (UI)
  let globalMutedLocal = false;   // локальная пауза общей волны
  let lastVol = 80;

  /* ---- Текущее «представление» — то, что должен играть движок ---- */
  function view() {
    if (!source) return null;
    if (source.kind === 'global') {
      const { st, track, pos } = GlobalWave.current();
      return {
        kind: 'global', track,
        playing: st.playing && !globalMutedLocal,
        pos, dur: track.dur * 1000,
        label: 'Общая волна', rightLabel: GlobalWave.listeners() + ' слушают'
      };
    }
    const room = typeof Rooms !== 'undefined' ? Rooms.get(source.roomId) : null;
    if (!room) return null;
    const st = RoomPlayback.ensure(room);
    let track = trackById(st.queue[st.index]);
    if (!track) { RoomPlayback.autoAdvance(room); return null; }
    return {
      kind: 'room', room, st, track,
      playing: st.playing,
      pos: RoomPlayback.position(st),
      dur: track.dur * 1000,
      label: room.name,
      rightLabel: st.source.kind === 'wave'
        ? 'Волна: ' + (MOODS[st.source.mood] || MOODS.chill).label
        : 'Плейлист'
    };
  }

  const onChange = (fn) => { changeHooks.push(fn); return () => { changeHooks = changeHooks.filter(f => f !== fn); }; };
  const notify = (v) => { changeHooks.forEach(f => { try { f(v || view()); } catch (e) { console.error(e); } }); };

  /* -------------------- Синхронизация движка -------------------- */
  async function syncEngine(force = false) {
    const v = view();
    if (!v) { if (engineKey) { Engine.stop(); engineKey = null; } Viz.setPlaying(false); return; }
    const key = source.kind + ':' + (source.kind === 'room' ? source.roomId : 'global') + ':' + v.track.id;

    if (key === engineKey && !force) {
      // Трек тот же: только поправить дрейф/состояние
      const drift = Engine.positionMs() - v.pos;
      if (Math.abs(drift) > 1600) Engine.seekTo(v.pos);
      if (v.playing && !Engine.playing) Engine.play();
      if (!v.playing && Engine.playing) Engine.pause();
      Viz.setPlaying(v.playing);
      return;
    }

    engineKey = key;
    await Engine.load(v.track, { offset: v.pos, autoplay: v.playing });
    Engine.setVolume(lastVol);
    Viz.setPlaying(v.playing);
  }

  // События движка
  Engine.on('play', () => { Viz.setPlaying(true); notify(); });
  Engine.on('pause', () => { Viz.setPlaying(false); notify(); });
  // Когда виджет/симулятор готов — дожимаем желаемое состояние
  // (например, если команду play дали ещё до окончания загрузки трека)
  Engine.on('ready', () => { syncEngine(); notify(); });
  Engine.on('finish', () => {
    if (!source) return;
    if (source.kind === 'global') { syncEngine(true); return; }
    const room = Rooms.get(source.roomId);
    if (!room) return;
    if (isLeader(room)) RoomPlayback.autoAdvance(room);   // лидер переключает для всех
    syncEngine();
    notify();
  });
  Engine.on('progress', () => { paintTimes(); });

  /* ------------------- Лидерство и тиканье -------------------- */
  /** Лидер комнаты = первый в отсортированном списке живых участников. */
  function isLeader(room) {
    if (!Session.user) return false;
    const pres = DB.get('wt_presence_room_' + room.id, {});
    const alive = room.members.filter(u => Date.now() - (pres[u] || 0) < 10000);
    if (!alive.length) return false;
    return alive.slice().sort()[0] === Session.user;
  }

  // Периодическая сверка: лидер комнаты двигает волну, движок — дрейф
  setInterval(() => {
    if (!source) return;
    if (source.kind === 'room') {
      const room = Rooms.get(source.roomId);
      if (!room) return;
      if (isLeader(room) && RoomPlayback.autoAdvance(room)) return; // переключилось само
      syncEngine();
    } else {
      syncEngine();
    }
  }, 2500);

  /* ---------------- Приём событий из других вкладок ---------------- */
  Bus.on('room-state', ({ roomId, st, reason }) => {
    if (!source || source.kind !== 'room' || source.roomId !== roomId) {
      // Не слушаем эту комнату — но обновим док, если виджет смотрит на неё
      notify();
      return;
    }
    // Слушаем эту комнату: применяем изменения к движку
    const v = view();
    if (!v) return;
    const sameTrack = engineKey && engineKey.endsWith(':' + v.track.id);
    if (sameTrack && reason === 'seek') Engine.seekTo(v.pos);
    if (sameTrack && reason === 'pause' && Engine.positionMs() - v.pos < 500) {
      // корректируем микродрейф при паузе
    }
    syncEngine();
    notify();
  });
  Bus.on('global', () => { if (source && source.kind === 'global') { globalMutedLocal = false; syncEngine(true); } notify(); });
  Bus.on('track-dead', () => { /* обложки/очереди пересоберутся сами на тике */ });

  /* -------------------- Управление источником -------------------- */
  function enterRoom(room) {
    source = { kind: 'room', roomId: room.id };
    globalMutedLocal = false;
    syncEngine(true);
    notify();
  }
  function joinGlobal() {
    source = { kind: 'global' };
    globalMutedLocal = false;
    syncEngine(true);
    notify();
    toast('Вы на общей волне — слушаете вместе со всеми', { icon: 'globe' });
  }
  function stopAll() {
    source = null; engineKey = null;
    Engine.stop(); Viz.setPlaying(false);
    notify();
  }

  /** Команды из UI, в зависимости от источника. */
  function cmdToggle() {
    const v = view(); if (!v) return;
    if (v.kind === 'global') {
      globalMutedLocal = !globalMutedLocal;
      if (globalMutedLocal) Engine.pause();
      else syncEngine(true);
      notify();
    } else {
      RoomPlayback.command(v.room, 'toggle');
    }
  }
  function cmdNext() {
    const v = view(); if (!v) return;
    if (v.kind === 'global') GlobalWave.skip();
    else RoomPlayback.command(v.room, 'next');
  }
  function cmdPrev() {
    const v = view(); if (!v) return;
    if (v.kind === 'global') return;                       // радио назад не крутится
    const st = v.st;
    // если прошло >4 сек — сначала в начало трека (как в плеерах)
    if (v.pos > 4000) RoomPlayback.command(v.room, 'seek', { ms: 0 });
    else RoomPlayback.command(v.room, 'prev');
  }
  function cmdSeek(fraction) {
    const v = view(); if (!v) return;
    if (v.kind === 'global') return;                       // общую волну мотать нельзя
    RoomPlayback.command(v.room, 'seek', { ms: fraction * v.dur });
  }
  function setVolume(val) {
    lastVol = val;
    Engine.setVolume(val);
    if (Session.user && typeof Custom !== 'undefined') Custom.set({ volume: val });
  }

  /* ======================= ДОК-ПЛЕЕР (UI) ======================= */

  let dockEl = null, paintTimer = null;

  /** Обновить только цифры/ползунки (не перестраивая DOM). */
  function paintTimes() {
    if (!dockEl || dockEl.hidden) return;
    const v = view(); if (!v) return;
    const pos = clamp(v.pos, 0, v.dur);
    qsa('[data-dock-pos]', dockEl).forEach(el => el.textContent = fmtTime(pos));
    qsa('[data-dock-dur]', dockEl).forEach(el => el.textContent = fmtTime(v.dur));
    qsa('input[data-dock-seek]', dockEl).forEach(r => {
      if (document.activeElement !== r) {
        r.value = Math.round(pos / v.dur * 1000);
        r.style.setProperty('--val', (pos / v.dur * 100) + '%');
      }
    });
  }

  /** Полная перерисовка дока. */
  function renderDock() {
    if (!dockEl) dockEl = qs('#player-dock');
    const v = view();
    const settings = typeof Custom !== 'undefined' ? Custom.get() : { playerMode: 'bar', visualizer: 'bars' };

    if (!v || !Session.user || location.hash.replace('#/', '').split('/')[0] === 'landing' || !location.hash) {
      dockEl.hidden = true;
      document.body.classList.remove('has-dock-bar');
      return;
    }
    dockEl.hidden = false;

    const mode = settings.playerMode || 'bar';
    dockEl.className = 'dock dock--' + mode;
    document.body.classList.toggle('has-dock-bar', mode === 'bar' && (settings.playerPos || 'bottom') === 'bottom');

    const cover = trackCover(v.track);
    const playIc = v.playing ? 'pause' : 'play';

    // Блоки, общие для режимов
    const artImg = h('img', {
      class: 'dock__art', src: cover, alt: '',
      onclick: () => { if (v.kind === 'room') location.hash = '#/room/' + v.room.id; }
    });
    const meta = h('div', {
      class: 'dock__meta',
      onclick: () => { if (v.kind === 'room') location.hash = '#/room/' + v.room.id; }
    },
      h('b', { text: v.track.t }),
      h('span', { text: v.track.a })
    );
    const seek = h('input', {
      class: 'wt-range', type: 'range', min: 0, max: 1000,
      value: Math.round(v.pos / v.dur * 1000),
      dataset: { dockSeek: '1' }, disabled: v.kind === 'global' ? '' : null,
      oninput: (e) => e.target.style.setProperty('--val', (e.target.value / 10) + '%'),
      onchange: (e) => { cmdSeek(e.target.value / 1000); }
    });
    const times = h('div', { class: 'dock__progress' },
      h('time', { dataset: { dockPos: '1' }, text: fmtTime(v.pos) }),
      seek, h('time', { dataset: { dockDur: '1' }, text: fmtTime(v.dur) }));

    const btnToggle = h('button', { class: 'btn-icon btn-icon--main', title: v.playing ? 'Пауза' : 'Играть', html: icon(playIc, 20), onclick: cmdToggle });
    const btnPrev = v.kind === 'room' ? h('button', { class: 'btn-icon', html: icon('prev', 19), title: 'Назад', onclick: cmdPrev }) : null;
    const btnNext = h('button', { class: 'btn-icon', html: icon('next', 19), title: 'Вперёд', onclick: cmdNext });
    const btns = h('div', { class: 'dock__btns' }, btnPrev, btnToggle, btnNext);

    const vol = h('div', { class: 'dock__vol' },
      h('span', { html: icon('volume', 17) }),
      h('input', {
        class: 'wt-range', type: 'range', min: 0, max: 100, value: lastVol,
        oninput: (e) => { setVolume(+e.target.value); e.target.style.setProperty('--val', e.target.value + '%'); }
      })
    );

    const srcLabel = h('div', {
      class: 'dock__src',
      html: icon(v.kind === 'global' ? 'globe' : 'heart', 14) + `<span>${esc(v.label)} · ${esc(v.rightLabel || '')}</span>`,
      onclick: () => { if (v.kind === 'room') location.hash = '#/room/' + v.room.id; }
    });

    const closeBtn = h('button', {
      class: 'btn-icon', title: 'Остановить', html: icon('x', 16), onclick: stopAll
    });

    /* --- Режимы представления --- */
    if (mode === 'bar') {
      dockEl.replaceChildren(h('div', { class: 'dock__inner' },
        artImg, meta, btns, times, srcLabel, vol, closeBtn));
    } else if (mode === 'widget') {
      const viz = settings.visualizer !== 'off'
        ? h('canvas', { class: 'viz-canvas', style: { height: '44px', margin: 0, flexBasis: '100%', order: 4 } }) : null;
      dockEl.replaceChildren(h('div', { class: 'dock__inner' },
        artImg, meta, btns, times, viz, closeBtn));
      if (viz) Viz.attach(viz);
    } else if (mode === 'float') {
      const win = h('div', {});
      const artF = artImg.cloneNode(); artF.src = cover; artF.className = 'dock__art';
      artF.style.width = '58px'; artF.style.height = '58px';
      const vizF = settings.visualizer !== 'off'
        ? h('canvas', { class: 'viz-canvas', style: { height: '46px' } }) : null;
      win.append(
        h('div', { class: 'float__bar' },
          h('span', { html: icon('move', 15) }),
          h('span', { text: 'WAVETOGETHER' }),
          h('span', { style: { flex: 1 } }),
          h('button', { class: 'btn-icon', style: { width: '26px', height: '26px', background: 'rgba(0,0,0,.18)' }, html: icon('x', 13), onclick: stopAll })
        ),
        h('div', { class: 'float__body' },
          h('div', { class: 'dock__row' }, artF,
            h('div', { class: 'dock__meta' }, h('b', { text: v.track.t }), h('span', { text: v.track.a })),
            h('span', { class: 'eq-mini' + (v.playing ? '' : ' is-paused'), html: '<span></span><span></span><span></span><span></span>' })),
          vizF, times, h('div', { class: 'dock__btns', style: { justifyContent: 'center' } }, btnPrev, btnToggle, btnNext), vol
        )
      );
      dockEl.replaceChildren(win);
      if (vizF) Viz.attach(vizF);
      restoreFloatPos(dockEl);
      makeDraggable(dockEl, qs('.float__bar', dockEl));
    } else if (mode === 'full') {
      const vizBig = settings.visualizer !== 'off'
        ? h('canvas', { class: 'full__viz' }) : null;
      dockEl.replaceChildren(
        h('button', { class: 'btn-icon full__close', html: icon('x', 22), onclick: stopAll }),
        h('img', { class: 'full__art', src: cover, alt: '' }),
        vizBig,
        h('div', { class: 'full__info' },
          h('div', { class: 'now-playing-tag' }, h('span', { html: icon('wave', 14) }), (v.kind === 'global' ? 'Общая волна' : v.label)),
          h('b', { text: v.track.t }),
          h('span', { text: v.track.a })),
        h('div', { class: 'full__progress' }, times),
        h('div', { class: 'full__controls' }, btnPrev, btnToggle, btnNext, vol)
      );
      if (vizBig) Viz.attach(vizBig);
    }

    // Авто-подкраска ползунков
    qsa('.wt-range', dockEl).forEach(r => {
      if (!r.dataset.dockSeek) r.style.setProperty('--val', (r.value / (r.max || 100) * 100) + '%');
    });
  }

  /* Плавающее окно: перетаскивание и сохранение позиции */
  function restoreFloatPos(el) {
    const s = Custom.get().floatPos;
    if (s && typeof s.x === 'number') {
      el.style.left = clamp(s.x, 0, (innerWidth - 360)) + 'px';
      el.style.top = clamp(s.y, 0, (innerHeight - 200)) + 'px';
    } else {
      el.style.left = 'auto'; el.style.right = '24px'; el.style.bottom = 'calc(var(--nav-h) + 76px)'; el.style.top = 'auto';
    }
  }
  function makeDraggable(win, handle) {
    if (!handle) return;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      const rect = win.getBoundingClientRect();
      win.style.right = 'auto'; win.style.bottom = 'auto';
      const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
      const move = (ev) => {
        win.style.left = clamp(ev.clientX - offX, 0, innerWidth - rect.width) + 'px';
        win.style.top = clamp(ev.clientY - offY, 0, innerHeight - 60) + 'px';
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        const r2 = win.getBoundingClientRect();
        if (typeof Custom !== 'undefined') Custom.set({ floatPos: { x: Math.round(r2.left), y: Math.round(r2.top) } });
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  // Тик для плавного прогресса дока
  setInterval(paintTimes, 800);

  /* Перерисовки дока по событиям */
  Bus.on('room-state', () => scheduleRender());
  Bus.on('global', () => scheduleRender());
  Bus.on('chat', () => {});
  window.addEventListener('wt-custom', () => scheduleRender());
  window.addEventListener('hashchange', () => scheduleRender());
  const scheduleRender = debounce(() => { renderDock(); }, 40);

  return {
    view, onChange, enterRoom, joinGlobal, stopAll,
    cmdToggle, cmdNext, cmdPrev, cmdSeek, setVolume,
    renderDock, isLeader,
    setVolumeInit: (v) => { lastVol = v; },
    get source() { return source; }
  };
})();
