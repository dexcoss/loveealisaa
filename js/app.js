/* ============================================================================
 * WaveTogether — app.js
 * Главный модуль: SPA-роутер (hash), навигация, экраны
 * (лендинг/главная/комната/профиль/друзья/настройки), модальные окна,
 * склейка всех подсистем и точка входа.
 * ========================================================================== */
'use strict';

/* --------------------------- РОУТЕР И КАРКАС ------------------------------ */

/** Массив функций-очистителей для текущего экрана (интервалы/подписки). */
let screenCleanup = [];

const Router = {
  /** /landing | /home | /room/:id | /profile/:login? | /friends | /settings */
  parse() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { name: parts[0] || 'landing', param: parts[1] || null };
  },
  go(hash) { if (location.hash === hash) Router.render(true); else location.hash = hash; },

  render(force = false) {
    // Снос подписок и интервалов прошлого экрана
    screenCleanup.forEach(fn => { try { fn(); } catch (e) {} });
    screenCleanup = [];

    let { name, param } = this.parse();
    if (!Session.user && name !== 'landing') { location.hash = '#/landing'; return; }
    if (Session.user && name === 'landing') { location.hash = '#/home'; return; }

    renderShell(name);

    const screen = qs('#screen');
    screen.className = name === 'landing' ? '' : 'screen';
    const fn = Screens[name] || Screens.home;
    screen.replaceChildren(fn(param) || h('div', {}));
    Playback.renderDock();
    refreshNavBadges();
  }
};
window.addEventListener('hashchange', () => Router.render());

const onCleanup = (fn) => screenCleanup.push(fn);

/* ------------------------------ НАВИГАЦИЯ -------------------------------- */

function renderShell(route) {
  const app = qs('#app');
  if (!Session.user) { app.replaceChildren(h('main', { id: 'screen' })); return; }
  if (qs('.topnav')) return; // шелл уже построен — не дёргаем

  const navItems = [
    { route: 'home',     label: 'Главная',    ic: 'home' },
    { route: 'friends',  label: 'Друзья',     ic: 'users', badge: true },
    { route: 'profile',  label: 'Профиль',    ic: 'user' },
    { route: 'settings', label: 'Настройки',  ic: 'sliders' }
  ];

  const linkFor = (item) => h('a', {
    class: 'nav-link', href: '#/' + item.route,
    html: icon(item.ic, 18) + '<span>' + item.label + '</span>' + (item.badge ? '<span class="badge" data-badge="friends" hidden></span>' : '')
  });

  const topnav = h('nav', { class: 'topnav' },
    h('a', { class: 'topnav__logo', href: '#/home' },
      h('span', { html: icon('logo', 26) }),
      h('span', { class: 'logo-name', html: 'Wave<b>Together</b>' })),
    h('div', { class: 'topnav__links' }, navItems.map(linkFor)),
    h('div', { class: 'topnav__right' },
      h('button', { class: 'btn-icon', title: 'Поиск треков', html: icon('search', 19), onclick: () => Modals.search() }),
      h('button', { class: 'btn-icon', title: 'Внешний вид (скины)', html: icon('palette', 19), onclick: () => CustomDrawer.toggle() }),
      h('button', { class: 'btn-icon', title: 'Выйти', html: icon('logout', 19), onclick: doLogout }))
  );

  const mobilenav = h('nav', { class: 'mobilenav' },
    ...navItems.map(item => {
      const a = linkFor(item);
      return a;
    }),
    h('button', { class: 'nav-link', html: icon('palette', 18) + '<span>Стиль</span>', onclick: () => CustomDrawer.toggle() })
  );

  const screen = h('main', { id: 'screen', class: 'screen' });
  app.replaceChildren(topnav, screen, mobilenav);
}

/** Подсветка активного пункта меню. */
function markActiveNav(route) {
  qsa('.nav-link').forEach(a => {
    const href = a.getAttribute('href') || '';
    a.classList.toggle('is-active', href === '#/' + route);
  });
}

/** Бейджи: заявки в друзья. */
function refreshNavBadges() {
  const req = Friends.incoming().length;
  qsa('[data-badge="friends"]').forEach(b => { b.hidden = !req; b.textContent = req; });
}
Bus.on('friends', refreshNavBadges);
Bus.on('friend-req', refreshNavBadges);

function doLogout() {
  const v = Playback.view();
  if (v) Playback.stopAll();
  Users.logout();
  Custom.apply(); // применить guest-настройки
  location.hash = '#/landing';
}

/* ================================ ЭКРАНЫ ================================== */

const Screens = {};

/* ------------------------------ 1. ЛЕНДИНГ ------------------------------- */

Screens.landing = function () {
  document.title = 'WaveTogether — слушайте музыку вместе';
  const scr = h('div', { class: 'landing' });

  // ----- форма входа/регистрации -----
  let mode = 'login';
  const formWrap = h('div', {});
  const tabs = h('div', { class: 'auth-tabs' });

  const draw = () => {
    qsa('button', tabs).forEach(b => b.classList.toggle('is-active', b.dataset.m === mode));
    formWrap.replaceChildren(mode === 'login' ? loginForm() : registerForm());
  };
  tabs.replaceChildren(
    h('button', { dataset: { m: 'login' }, text: 'Войти', onclick: () => { mode = 'login'; draw(); } }),
    h('button', { dataset: { m: 'register' }, text: 'Создать аккаунт', onclick: () => { mode = 'register'; draw(); } })
  );

  const errBox = h('div', { class: 'field-err', style: { minHeight: '18px', marginBottom: '6px' } });

  function loginForm() {
    const inpL = h('input', { class: 'input', placeholder: 'milo', autocomplete: 'username' });
    const inpP = h('input', { class: 'input', placeholder: '········', type: 'password', autocomplete: 'current-password' });
    const submit = () => {
      try {
        Users.login(inpL.value, inpP.value);
        afterAuth();
      } catch (e) { errBox.textContent = e.message; }
    };
    inpP.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    return h('div', {},
      h('div', { class: 'field' }, h('label', { text: 'Логин' }), inpL),
      h('div', { class: 'field' }, h('label', { text: 'Пароль' }), inpP),
      errBox,
      h('button', { class: 'btn btn--primary btn--block btn--big', html: icon('heart', 19) + ' Войти', onclick: submit }),
      demoRow());
  }
  function registerForm() {
    const inpL = h('input', { class: 'input', placeholder: 'например, solnce' });
    const inpN = h('input', { class: 'input', placeholder: 'Как вас называть?' });
    const inpP = h('input', { class: 'input', placeholder: 'минимум 4 символа', type: 'password' });
    const submit = () => {
      try {
        const u = Users.register(inpL.value, inpP.value, inpN.value);
        Users.login(u.login, inpP.value);
        afterAuth(true);
      } catch (e) { errBox.textContent = e.message; }
    };
    return h('div', {},
      h('div', { class: 'field' }, h('label', { text: 'Логин' }), inpL),
      h('div', { class: 'field' }, h('label', { text: 'Имя' }), inpN),
      h('div', { class: 'field' }, h('label', { text: 'Пароль' }), inpP),
      errBox,
      h('button', { class: 'btn btn--primary btn--block btn--big', html: icon('sparkle', 19) + ' Создать аккаунт', onclick: submit }),
      h('p', { class: 'field-hint', style: { marginTop: '12px' }, text: 'Аккаунт живёт в вашем браузере (демо-хранилище localStorage).' }));
  }
  function demoRow() {
    return h('div', {},
      h('div', { class: 'demo-row', style: { marginTop: '16px' } },
        h('button', { class: 'btn btn--ghost btn--mini', text: '🦊 Демо: Milo', onclick: () => { Users.login('milo', '1234'); afterAuth(); } }),
        h('button', { class: 'btn btn--ghost btn--mini', text: '🐰 Демо: Luna', onclick: () => { Users.login('luna', '1234'); afterAuth(); } })),
      h('div', { class: 'demo-hint', html: '💡 <b>Магия синхронизации:</b> откройте эту страницу во <b>второй вкладке</b> и войдите под вторым демо-аккаунтом — play, пауза, чат и реакции будут летать между вкладками.' }));
  }
  draw();

  scr.append(
    h('div', { class: 'landing__hero' },
      h('div', {},
        h('div', { class: 'pulse-hearts' }, h('span', { html: icon('logo', 22) }), 'WaveTogether'),
        h('h1', { class: 'landing__title', html: 'Одна волна<br>на <span class="grad">двоих</span>' }),
        h('p', { class: 'landing__lead', text: 'Приватные комнаты для пар и друзей: слушайте музыку синхронно, болтайте в чате, собирайте общие плейлисты и оформляйте плеер так, как нравится именно вам.' }),
        h('div', { class: 'quick-actions' },
          h('div', { class: 'quick-action', style: { '--qa-c1': '#8b7cf6', '--qa-c2': '#f472b6' } },
            h('div', { class: 'qa-ic', html: icon('room', 22) }),
            h('div', {}, h('b', { text: 'Комнаты для двоих' }), h('span', { text: 'Код, ссылка — и вы на одной волне' }))),
          h('div', { class: 'quick-action', style: { '--qa-c1': '#38bdf8', '--qa-c2': '#34d399' } },
            h('div', { class: 'qa-ic', html: icon('globe', 22) }),
            h('div', {}, h('b', { text: 'Общая волна' }), h('span', { text: 'Радио, которое слушает весь сайт' }))),
          h('div', { class: 'quick-action', style: { '--qa-c1': '#f59e0b', '--qa-c2': '#f472b6' } },
            h('div', { class: 'qa-ic', html: icon('palette', 22) }),
            h('div', {}, h('b', { text: 'Скины как в Winamp' }), h('span', { text: '7 тем, акценты, плавающий плеер' }))))),
      h('div', { class: 'card auth-card' }, tabs, formWrap)),
    h('div', { class: 'feature-grid' },
      [['room', 'Синхронные комнаты', 'Play, пауза и перемотка — мгновенно у обоих.'],
       ['chat', 'Чат и реакции', 'Сообщения, эмодзи и летящие ❤️ 🔥 прямо на обложку.'],
       ['note', 'Волны настроений', 'Романтика, чилл, ночные вайбы — музыка не кончается.'],
       ['users', 'Друзья и приглашения', 'Заявки, онлайн-статусы и зов «в комнату» в один клик.'],
       ['sliders', 'Тотальная кастомизация', 'Темы, акценты, фоны, шрифты, визуализатор, раскладка.'],
       ['headphones', 'SoundCloud внутри', 'Треки играют через официальный виджет SoundCloud.']]
      .map(([ic, t, d]) => h('div', { class: 'card card--hover feature' },
        h('span', { html: icon(ic, 24) }), h('h3', { text: t }), h('p', { text: d }))))
  );
  return scr;
};

function afterAuth(fresh = false) {
  Custom.apply(); // подтянуть личные настройки темы
  Playback.renderDock();
  toast(fresh ? 'Добро пожаловать в WaveTogether 💜' : 'С возвращением, ' + Session.user + '!', { type: 'success', icon: 'heart' });
  Presence.beat();
  location.hash = '#/home';
}

/* ------------------------------- 2. ГЛАВНАЯ ------------------------------- */

Screens.home = function () {
  document.title = 'WaveTogether — Главная';
  markActiveNav('home');
  const me = Users.get(Session.user);
  const scr = h('div', {});

  const rerender = debounce(() => Router.render(true), 180);
  onCleanup(Bus.on('rooms', rerender));
  onCleanup(Bus.on('friends', rerender));
  onCleanup(Bus.on('playlist', rerender));
  onCleanup(Bus.on('global', rerender));
  onCleanup(Bus.on('invite', rerender));
  const presenceTick = setInterval(() => { updateHomeDynamic(); }, 5000);
  onCleanup(() => clearInterval(presenceTick));

  // ---- Герой ----
  scr.append(
    h('section', { class: 'block' },
      h('div', { class: 'dash-hero card' },
        avatarEl(me.login, 62, true),
        h('div', { class: 'dash-hero__text' },
          h('h1', { class: 'page-title', text: 'Привет, ' + (me.name || me.login) + ' 👋' }),
          h('p', { class: 'page-sub', text: 'Кого сегодня зовём на одну волну?' })),
        h('div', { class: 'segmented' },
          h('button', { html: icon('plus', 15) + ' Комната', onclick: () => Modals.createRoom() }),
          h('button', { html: icon('link', 15) + ' По коду', onclick: () => Modals.joinByCode() }))),
      h('div', { class: 'quick-actions' },
        quickAction('room', 'Создать комнату', 'Приватная комната для пары', '#8b7cf6', '#f472b6', () => Modals.createRoom()),
        quickAction('globe', 'Слушать общую волну', 'Весь сайт — в одних наушниках', '#38bdf8', '#34d399', () => Playback.joinGlobal()),
        quickAction('users', 'Позвать друзей', 'Заявки и приглашения', '#f59e0b', '#ec5f93', () => Router.go('#/friends')))));

  // ---- Приглашения в комнаты (входящие) ----
  const invites = Invites.list();
  if (invites.length) {
    scr.append(blockWrap('Вас зовут на волну', 'send', invites.length,
      h('div', { class: 'card' },
        invites.slice().reverse().map(inv => h('div', { class: 'friend-row' },
          avatarEl(inv.from, 40, true),
          h('div', { class: 'friend-row__meta' },
            h('b', { text: inv.from }),
            h('span', { text: 'в комнату «' + inv.roomName + '» · ' + timeAgo(inv.ts) })),
          h('div', { class: 'friend-row__actions' },
            h('button', { class: 'btn btn--mini btn--primary', text: 'Войти', onclick: () => Invites.accept(inv) }),
            h('button', { class: 'btn-icon', title: 'Скрыть', html: icon('x', 14), onclick: () => { Invites.dismiss(inv.id); Router.render(true); } })))))));
  }

  // ---- Мои комнаты ----
  const myRooms = Rooms.byUser(Session.user);
  scr.append(blockWrap('Мои комнаты', 'room', myRooms.length,
    h('div', { class: 'grid grid--3' },
      myRooms.length ? myRooms.map(roomCard) : [
        h('div', { class: 'empty' },
          h('div', { html: icon('room', 30) }),
          h('div', { text: 'Пока пусто. Создайте комнату — и отправьте код любимому человеку.' }))]
    )));
  scr.lastChild.querySelector('.block__head').append(h('button', { class: 'btn btn--mini btn--ghost', html: icon('plus', 14) + ' Создать', onclick: () => Modals.createRoom() }));

  // ---- Общая волна ----
  scr.append(globalWaveCard());

  // ---- Друзья ----
  scr.append(friendsPreviewBlock());

  return scr;
};

function quickAction(ic, title, sub, c1, c2, fn) {
  return h('button', { class: 'quick-action', style: { '--qa-c1': c1, '--qa-c2': c2 }, onclick: fn },
    h('div', { class: 'qa-ic', html: icon(ic, 22) }),
    h('div', {}, h('b', { text: title }), h('span', { text: sub })));
}

function blockWrap(title, ic, count, ...content) {
  return h('section', { class: 'block' },
    h('div', { class: 'block__head' },
      h('span', { html: icon(ic, 20), style: { color: 'var(--accent)', display: 'flex' } }),
      h('h2', { text: title }),
      count !== undefined ? h('span', { class: 'count', text: String(count) }) : null,
      h('div', { class: 'spacer' })),
    ...content);
}

/** Карточка комнаты на дашборде. */
function roomCard(room) {
  const partner = room.members.find(m => m !== Session.user);
  const online = partner && Presence.inRoom(room.id, partner);
  const st = RoomPlayback.ensure(room);
  const curTrack = trackById(st.queue[st.index]);
  const el = h('div', { class: 'card card--hover room-card', tabindex: 0, role: 'button',
      style: { '--rc-c1': room.color || 'var(--accent)', '--rc-c2': room.color || 'var(--accent-2)' },
      onclick: () => Router.go('#/room/' + room.id),
      onkeydown: (e) => { if (e.key === 'Enter') Router.go('#/room/' + room.id); } },
    h('div', { class: 'room-card__icon', text: room.icon || '💞' }),
    h('div', { class: 'room-card__meta' },
      h('b', { text: room.name }),
      h('span', {
        html: partner
          ? esc(partner) + (online ? ' <span style="color:var(--ok)">● в комнате</span>' : ' · ' + (Presence.isOnline(partner) ? 'онлайн' : 'оффлайн'))
          : 'ждёт вторую половинку'
      }),
      h('span', {
        html: st.playing && curTrack
          ? `<span style="color:var(--accent)">▶</span> ${esc(curTrack.t)} — ${esc(curTrack.a)}`
          : 'пауза'
      })),
    h('div', { style: { textAlign: 'right' } },
      h('div', { class: 'room-card__code', text: room.code }),
      h('div', { style: { marginTop: '6px', color: 'var(--muted)' }, html: icon('mood', 14) + ' ' + (MOODS[room.mood] || MOODS.chill).label })));
  return el;
}

/** Карточка общей волны для дашборда. */
function globalWaveCard() {
  const { st, track, pos } = GlobalWave.current();
  const v = Playback.view();
  const listening = v && v.kind === 'global';

  const progress = h('input', { class: 'wt-range', type: 'range', min: 0, max: 1000, value: Math.round(pos / track.dur), disabled: '', dataset: { gbar: '' } });
  progress.style.setProperty('--val', (pos / (track.dur * 1000) * 100) + '%');
  const posT = h('time', { dataset: { gpos: '' }, text: fmtTime(pos) });

  const card = h('section', { class: 'block' },
    blockWrap('Общая волна', 'globe', undefined,
      h('div', { class: 'card wave-card' },
        h('div', { class: 'wave-card__bg', style: { backgroundImage: `url("${trackCover(track)}")` } }),
        h('div', { class: 'wave-card__in' },
          h('img', { class: 'wave-card__art', src: trackCover(track), alt: '' }),
          h('div', { class: 'wave-card__meta' },
            h('div', { class: 'live-line' }, h('span', { class: 'live-dot' }), 'В эфире · ' + GlobalWave.listeners() + ' слушают'),
            h('b', { text: track.t }),
            h('span', { text: track.a }),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' } }, posT, progress, h('time', { text: fmtTime(track.dur * 1000) })),
            h('div', { class: 'segmented', style: { marginTop: '10px' } },
              Object.entries(MOODS).filter(([k]) => k !== 'mix').map(([k, m]) =>
                h('button', {
                  class: st.mood === k ? 'is-active' : '', text: m.label, style: { fontSize: '12px', padding: '5px 11px' },
                  onclick: () => GlobalWave.setMood(k)
                })))),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 'none' } },
            listening
              ? h('button', { class: 'btn btn--ghost', html: icon('x', 16) + ' Отключиться', onclick: () => Playback.stopAll() })
              : h('button', { class: 'btn btn--primary', html: icon('play', 16) + ' Слушать', onclick: () => Playback.joinGlobal() }))))));
  // живое обновление таймера и полосы прогресса
  const tick = setInterval(() => {
    const c = GlobalWave.current();
    const el = qs('[data-gpos]');
    if (el) el.textContent = fmtTime(c.pos);
    const bar = qs('[data-gbar]');
    if (bar) {
      bar.value = Math.round(c.pos / c.track.dur);
      bar.style.setProperty('--val', (c.pos / (c.track.dur * 1000) * 100) + '%');
    }
  }, 3000);
  onCleanup(() => clearInterval(tick));
  return card;
}

/** Блок «Друзья» на дашборде. */
function friendsPreviewBlock() {
  const friends = Friends.list();
  const rows = friends.slice(0, 6).map(f => friendRow(f, { compact: true }));
  return blockWrap('Друзья', 'users', friends.length,
    h('div', { class: 'card' },
      rows.length ? rows : h('div', { class: 'empty' },
        h('div', { html: icon('users', 30) }),
        h('div', { text: 'Добавьте друзей, чтобы звать их в комнаты в один клик.' })),
      h('div', { style: { marginTop: rows.length ? '10px' : '0' } },
        h('button', { class: 'btn btn--ghost btn--mini', html: icon('plus', 14) + ' Найти друзей', onclick: () => Router.go('#/friends') }))));
}

/** Строка друга (используется и на дашборде, и на экране друзей). */
function friendRow(login, { compact = false } = {}) {
  const u = Users.get(login) || { login };
  const pres = Presence.get(login);
  const online = Presence.isOnline(login);
  const status = online
    ? (pres && pres.listening ? 'слушает: ' + pres.listening : 'онлайн')
    : pres ? 'был(а) ' + timeAgo(pres.ts) : 'оффлайн';

  const actions = h('div', { class: 'friend-row__actions' });
  const myRooms = Rooms.byUser(Session.user).filter(r => r.members.length < 2);
  if (myRooms.length) actions.append(h('button', {
    class: 'btn-icon', title: 'Пригласить в комнату', html: icon('send', 16),
    onclick: () => Modals.inviteFriend(login)
  }));
  actions.append(h('button', {
    class: 'btn-icon', title: 'Открыть профиль', html: icon('user', 16),
    onclick: () => Router.go('#/profile/' + login)
  }));
  if (!compact) {
    actions.prepend(h('button', {
      class: 'btn-icon', title: 'Комната на двоих', html: icon('room', 16),
      onclick: () => roomWithFriend(login)
    }));
    actions.append(h('button', {
      class: 'btn-icon', title: 'Удалить из друзей', html: icon('trash', 15),
      onclick: () => Modals.confirm('Удалить ' + login + ' из друзей?', () => { Friends.remove(login); })
    }));
  }
  return h('div', { class: 'friend-row', dataset: { friend: login } },
    avatarEl(login, 40, true),
    h('div', { class: 'friend-row__meta' },
      h('b', { text: u.name || login }),
      h('span', { text: status, style: online && pres && pres.listening ? { color: 'var(--accent)' } : null })),
    actions);
}

/** Создать комнату с конкретным другом и позвать его. */
function roomWithFriend(friend) {
  const me = Session.user;
  // ищем уже существующую общую комнату
  const existing = Rooms.byUser(me).find(r => r.members.length === 2 && r.members.includes(friend));
  if (existing) { Invites.send(friend, existing.id); Router.go('#/room/' + existing.id); return; }
  const u = Users.get(friend);
  const room = Rooms.create({ name: (Session.user + ' × ' + friend), icon: '💞', mood: 'chill' });
  room.members.push(friend);
  Rooms.save(room);
  Chat.system(room.id, 'Комната создана для ' + (u ? u.name || friend : friend) + ' 💌');
  Invites.send(friend, room.id);
  Router.go('#/room/' + room.id);
}

/** Живое обновление «онлайн»-строк на дашборде без полного ре-рендера. */
function updateHomeDynamic() {
  qsa('[data-friend]').forEach(row => {
    const login = row.dataset.friend;
    const pres = Presence.get(login);
    const online = Presence.isOnline(login);
    const statusEl = qs('.friend-row__meta span', row);
    if (!statusEl) return;
    statusEl.textContent = online
      ? (pres && pres.listening ? 'слушает: ' + pres.listening : 'онлайн')
      : (pres ? 'был(а) ' + timeAgo(pres.ts) : 'оффлайн');
    const dot = qs('.avatar__status', row);
    if (dot) dot.classList.toggle('online', online);
  });
}

/* ------------------------------- 3. КОМНАТА ------------------------------- */

Screens.room = function (roomId) {
  const room = Rooms.get(roomId);
  if (!room) {
    return h('div', { class: 'empty', style: { marginTop: '40px' } },
      h('div', { html: icon('room', 34) }),
      h('div', { text: 'Комната не найдена. Возможно, она была удалена.' }),
      h('div', { style: { marginTop: '12px' } },
        h('a', { class: 'btn', href: '#/home', text: 'На главную' })));
  }

  // Если не участник — пробуем вступить (по ссылке/коду)
  if (!room.members.includes(Session.user)) {
    try { Rooms.join(roomId); }
    catch (e) {
      return h('div', { class: 'empty', style: { marginTop: '40px' } },
        h('div', { html: icon('heart', 34) }),
        h('div', { text: e.message }),
        h('div', { style: { marginTop: '12px' } }, h('a', { class: 'btn', href: '#/home', text: 'На главную' })));
    }
  }

  const current = Rooms.get(roomId);
  document.title = 'WaveTogether — ' + current.name;
  markActiveNav(null);

  const scr = h('div', { class: 'room' });

  /* ---------------- Шапка комнаты ---------------- */
  const head = h('div', { class: 'room__head' },
    h('div', { class: 'room__badge', text: current.icon || '💞', style: { background: `linear-gradient(135deg, ${current.color || '#8b7cf6'}, color-mix(in srgb, ${current.color || '#8b7cf6'} 55%, #000))` } }),
    h('div', { class: 'room__head-meta' },
      h('h1', {}, current.name, roomTitleEditBtn(current)),
      h('div', { class: 'sub' },
        h('button', { class: 'room-card__code', title: 'Скопировать код', text: current.code, onclick: () => { copyText(current.code).then(ok => ok && toast('Код скопирован: ' + current.code, { type: 'success', icon: 'copy' })); } }),
        h('button', { class: 'btn btn--mini btn--ghost', html: icon('link', 13) + ' Скопировать ссылку', onclick: () => { copyText(location.origin + location.pathname + '#/room/' + current.id).then(ok => ok && toast('Ссылка на комнату скопирована', { type: 'success' })); } }))),
    h('div', { class: 'room__head-actions' },
      partnerPill(current),
      h('button', { class: 'btn btn--ghost btn--mini', html: icon('send', 14) + ' Позвать', onclick: () => Modals.inviteToRoom(current) }),
      h('button', { class: 'btn btn--ghost btn--mini', html: icon('sliders', 14) + ' Оформление', onclick: () => Modals.customizeRoom(current) }),
      h('button', { class: 'btn btn--ghost btn--mini btn--danger', html: icon('logout', 14) + ' Выйти', onclick: () => Modals.confirm('Выйти из комнаты «' + current.name + '»?', () => { Rooms.leave(current.id); if (Playback.source && Playback.source.roomId === current.id) Playback.stopAll(); Router.go('#/home'); }) })));
  scr.append(head);

  /* ---------------- Основная сетка: сцена + чат ---------------- */
  const main = h('div', { class: 'room__main' });
  const stageEl = h('div', { class: 'stage card' });
  const chatEl = h('div', {});
  main.append(stageEl, chatEl);
  scr.append(main);

  // Подключение воспроизведения комнаты как текущего источника
  Playback.enterRoom(current);
  Presence.beat();
  Chat.mount(chatEl, current);
  onCleanup(() => Chat.unmount(current.id));

  // Состояние → сцена рендерится целиком реактивно
  const renderStage = () => {
    stageEl.replaceChildren(buildStage(current));
    const v = Playback.view();
    if (v) Viz.setPlaying(v.playing);
  };
  renderStage();

  const freshRoom = () => Rooms.get(current.id) || current;
  onCleanup(Bus.on('room-state', ({ roomId: r }) => { if (r === current.id) renderStage(); }));
  onCleanup(Bus.on('room-look', ({ roomId: r }) => { if (r === current.id) Router.render(true); }));
  onCleanup(Bus.on('rooms', () => { if (!Rooms.get(current.id)) { toast('Комната была удалена', { icon: 'room' }); Router.go('#/home'); } }));
  onCleanup(Bus.on('playlist', () => renderStage()));
  onCleanup(Playback.onChange(() => updateStageProgress(freshRoom())));

  // Тик: прогресс, присутствие партнёра, «сердцебиение»
  const tick = setInterval(() => {
    updateStageProgress(current);
    updatePartnerPill(current);
  }, 1000);
  onCleanup(() => clearInterval(tick));

  return scr;
};

/** Кнопка-карандаш у названия комнаты. */
function roomTitleEditBtn(room) {
  return h('button', { class: 'btn-icon', style: { width: '34px', height: '34px' }, title: 'Переименовать', html: icon('edit', 15),
    onclick: async () => {
      const name = await Modals.prompt('Название комнаты', room.name);
      if (name !== null) Rooms.customize(room.id, { name });
    } });
}

/** Пилюля партнёра с присутствием. */
function partnerPill(room) {
  const partner = room.members.find(m => m !== Session.user);
  const el = h('div', { class: 'partner-pill' + (partner ? '' : ' waiting'), dataset: { partnerPill: room.id } });
  if (!partner) {
    el.append(h('div', { class: 'avatar', style: { '--sz': '34px', fontSize: '15px' }, text: '?' }),
      h('div', { class: 'txt' }, 'Ждём вторую', h('small', { text: 'отправьте код или ссылку' })));
  } else {
    const inRoom = Presence.inRoom(room.id, partner);
    const pres = Presence.get(partner);
    el.append(avatarEl(partner, 34, true),
      h('div', { class: 'txt' },
        partner,
        h('small', {
          text: inRoom ? (pres && pres.listening ? '♪ слушает с вами' : 'в комнате') : (Presence.isOnline(partner) ? 'онлайн' : 'не в сети'),
          style: inRoom ? { color: 'var(--ok)' } : null
        })));
  }
  return el;
}

function updatePartnerPill(room) {
  const el = qs('[data-partner-pill="' + room.id + '"]');
  if (!el) return;
  const fresh = partnerPill(Rooms.get(room.id) || room);
  el.replaceWith(fresh);
}

/* ---------- Сцена комнаты (плеер + волна + реакции + очередь) ---------- */

function buildStage(room) {
  const st = RoomPlayback.ensure(room);
  const track = trackById(st.queue[st.index]) || TRACKS[0];
  const pos = RoomPlayback.position(st);
  const partner = room.members.find(m => m !== Session.user);
  const beating = partner && Presence.inRoom(room.id, partner) && st.playing;

  const coverBox = h('div', { class: 'stage__coverbox' },
    h('img', { class: 'stage__cover' + (beating ? ' is-beating' : ''), src: trackCover(track), alt: 'Обложка', draggable: 'false' }),
    h('div', { class: 'fx-layer' })
  );

  /* Источник: волна / плейлист */
  const srcSeg = h('div', { class: 'segmented' },
    h('button', {
      class: st.source.kind === 'wave' ? 'is-active' : '', html: icon('wave', 15) + ' Волна',
      onclick: () => { if (st.source.kind !== 'wave') RoomPlayback.command(room, 'wave', { mood: room.mood || 'chill' }); Chat.system(room.id, Session.user + ' включил(а) волну «' + (MOODS[room.mood] || MOODS.chill).label + '»'); }
    }),
    h('button', {
      class: st.source.kind === 'playlist' ? 'is-active' : '', html: icon('note', 15) + ' Плейлист',
      onclick: () => Modals.pickPlaylistForRoom(room)
    }));

  const moodRow = h('div', { class: 'stage__moodline' },
    h('span', { class: 'lbl', text: 'Настроение' }),
    Object.entries(MOODS).filter(([k]) => k !== 'mix').map(([k, m]) =>
      h('button', {
        class: 'chip' + ((st.source.kind === 'wave' ? st.source.mood : room.mood) === k ? ' is-active' : ''),
        style: { '--mood-color': m.color },
        html: '<span class="dot"></span>' + m.label,
        onclick: () => {
          Rooms.customize(room.id, { mood: k });
          RoomPlayback.command(room, 'wave', { mood: k });
          Chat.system(room.id, Session.user + ' сменил(а) настроение волны на «' + m.label + '»');
        }
      })));

  /* Прогресс */
  const seek = h('input', {
    class: 'wt-range', type: 'range', min: 0, max: 1000, dataset: { stSeek: '' },
    oninput: (e) => e.target.style.setProperty('--val', (e.target.value / 10) + '%'),
    onchange: (e) => RoomPlayback.command(room, 'seek', { ms: (track.dur * 1000) * e.target.value / 1000 })
  });
  seek.value = Math.round(pos / (track.dur * 1000) * 1000);
  seek.style.setProperty('--val', (pos / (track.dur * 1000) * 100) + '%');

  /* Управление */
  const controls = h('div', { class: 'controls' },
    h('div', { class: 'controls__side' },
      h('button', { class: 'btn-icon' + (st.shuffle ? ' is-active' : ''), title: 'Перемешать', html: icon('shuffle', 18), onclick: () => RoomPlayback.command(room, 'shuffle') }),
      h('button', { class: 'btn-icon', title: 'Назад', html: icon('prev', 20), onclick: () => Playback.cmdPrev() })),
    h('button', {
      class: 'btn-icon btn-icon--main btn-icon--lg', title: st.playing ? 'Пауза' : 'Играть',
      html: icon(st.playing ? 'pause' : 'play', 24),
      onclick: () => RoomPlayback.command(room, 'toggle')
    }),
    h('div', { class: 'controls__side' },
      h('button', { class: 'btn-icon', title: 'Вперёд', html: icon('next', 20), onclick: () => RoomPlayback.command(room, 'next') }),
      h('button', { class: 'btn-icon' + (st.repeat ? ' is-active' : ''), title: 'Зациклить очередь', html: icon('repeat', 18), onclick: () => RoomPlayback.command(room, 'repeat') })));

  const volDef = Custom.get().volume || 80;
  const volRow = h('div', { class: 'vol-row' },
    h('span', { html: icon('volume', 16) }),
    h('input', {
      class: 'wt-range', type: 'range', min: 0, max: 100, value: volDef,
      oninput: (e) => { Playback.setVolume(+e.target.value); e.target.style.setProperty('--val', e.target.value + '%'); }
    }));
  volRow.querySelector('input').style.setProperty('--val', volDef + '%');

  /* Реакции + добавить в плейлист */
  const reactionRow = h('div', { class: 'reaction-row' },
    ['❤️', '🔥', '👏', '😮'].map(e => h('button', {
      class: 'reaction-btn', text: e, title: 'Реакция на трек',
      onclick: () => Chat.sendReaction(room.id, e)
    })));

  const viz = h('canvas', { class: 'viz-canvas' });
  if (Custom.get().visualizer !== 'off') Viz.attach(viz);

  /* Очередь «Далее» */
  const upNext = [];
  for (let i = st.index; i < Math.min(st.queue.length, st.index + 6); i++) {
    const tr = trackById(st.queue[i]);
    if (!tr) continue;
    upNext.push(h('div', {
      class: 'queue-item' + (i === st.index ? ' is-current' : ''),
      onclick: () => RoomPlayback.command(room, 'playIndex', { i })
    },
      h('img', { src: trackCover(tr), alt: '' }),
      h('div', { class: 'qi-meta' }, h('b', { text: tr.t }), h('span', { text: tr.a })),
      h('time', { text: fmtTime(tr.dur * 1000) })));
  }

  const srcLabel = st.source.kind === 'wave'
    ? 'Волна: ' + (MOODS[st.source.mood] || MOODS.chill).label
    : 'Плейлист: ' + ((Playlists.get(st.source.playlistId) || {}).name || '—');

  return h('div', {},
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' } },
      srcSeg,
      h('button', { class: 'btn-icon', title: 'Добавить трек в плейлист', html: icon('plus', 20), onclick: () => Modals.addToPlaylist(track.id, room) })),
    moodRow,
    coverBox,
    viz,
    h('div', { class: 'track-info' },
      h('div', { class: 'now-playing-tag' },
        h('span', { html: icon('wave', 13) }), 'Сейчас играет',
        h('span', { class: 'eq-mini' + (st.playing ? '' : ' is-paused'), dataset: { eqMini: '' }, html: '<span></span><span></span><span></span><span></span>' })),
      h('b', { text: track.t }),
      h('span', { text: track.a })),
    h('div', { class: 'progress' },
      seek,
      h('div', { class: 'progress__times' },
        h('span', { dataset: { stPos: '' }, text: fmtTime(pos) }),
        h('span', { dataset: { stDur: '' }, text: fmtTime(track.dur * 1000) }))),
    controls,
    volRow,
    reactionRow,
    h('div', { class: 'stage__foot' },
      h('span', { class: 'sc-credit', html: 'Источник: ' + esc(srcLabel) + ' · аудио — SoundCloud' }),
      h('button', {
        class: 'btn btn--mini btn--ghost',
        html: icon('globe', 14) + ' На общую волну',
        onclick: () => Playback.joinGlobal()
      },
      )),
    h('div', { class: 'queue' },
      h('div', { class: 'block__head', style: { marginTop: '18px' } },
        h('span', { html: icon('note', 17), style: { color: 'var(--accent)', display: 'flex' } }),
        h('h2', { text: 'Далее', style: { fontSize: '15px' } }),
        h('div', { class: 'spacer' }),
        st.source.kind === 'playlist' ? h('button', { class: 'btn btn--mini btn--ghost', html: icon('edit', 13) + ' Редактировать', onclick: () => { const pl = Playlists.get(st.source.playlistId); if (pl) Modals.playlistEditor(pl.id); } }) : null),
      upNext.length ? upNext : h('div', { class: 'empty', text: 'Очередь пуста — добавьте треков ❤️' })));
}

/** Лёгкое обновление прогресса/эквалайзера без перерисовки стейджа. */
function updateStageProgress(room) {
  const st = RoomPlayback.get(room.id);
  if (!st) return;
  let track = trackById(st.queue[st.index]);
  if (!track) return;
  const pos = RoomPlayback.position(st);
  const dur = track.dur * 1000;
  const posEl = qs('[data-st-pos]');
  if (posEl) posEl.textContent = fmtTime(pos);
  const seek = qs('[data-st-seek]');
  if (seek && document.activeElement !== seek) {
    seek.value = Math.round(pos / dur * 1000);
    seek.style.setProperty('--val', (pos / dur * 100) + '%');
  }
  // эквалайзер «играет/пауза»
  qsa('[data-eq-mini]').forEach(e => e.classList.toggle('is-paused', !st.playing));
  // «сердцебиение» обложки
  const partner = room.members.find(m => m !== Session.user);
  const cover = qs('.stage__cover');
  if (cover) {
    const beating = partner && Presence.inRoom(room.id, partner) && st.playing;
    cover.classList.toggle('is-beating', beating);
  }
}

/* -------------------------------- 4. ПРОФИЛЬ ------------------------------ */

Screens.profile = function (login) {
  const who = login || Session.user;
  const u = Users.get(who);
  if (!u) return h('div', { class: 'empty' }, h('div', { text: 'Пользователь не найден' }));
  const mine = who === Session.user;
  document.title = 'WaveTogether — ' + (u.name || who);
  if (mine) markActiveNav('profile');

  const st = Stats.get(who);
  const friendsN = Friends.list(who).length;
  const pres = Presence.get(who);

  const scr = h('div', {});

  const statusEl = h('div', { class: 'status-edit' },
    h('span', { text: u.status || '—' }),
    mine ? h('button', { title: 'Изменить статус', html: icon('edit', 14), onclick: async () => {
      const s2 = await Modals.prompt('Ваш статус', u.status || '');
      if (s2 !== null) { Users.updateMe({ status: s2 }); Router.render(true); }
    } }) : null);

  scr.append(h('section', { class: 'card profile__head' },
    avatarEl(who, 96, true),
    h('div', { class: 'profile__who' },
      h('b', { text: u.name || who }),
      h('div', { style: { color: 'var(--muted)', fontSize: '13px' } }, '@' + who, pres && pres.listening ? h('span', { text: ' · ♪ ' + pres.listening, style: { color: 'var(--accent)' } }) : null),
      statusEl,
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } },
        mine ? h('button', { class: 'btn btn--ghost btn--mini', html: icon('image', 14) + ' Сменить аватар', onclick: () => Modals.avatarPicker() }) : null,
        mine ? h('button', { class: 'btn btn--ghost btn--mini', html: icon('edit', 14) + ' Изменить имя', onclick: async () => {
          const n = await Modals.prompt('Отображаемое имя', u.name || '');
          if (n !== null) { Users.updateMe({ name: n }); Router.render(true); }
        } }) : null,
        !mine && !Friends.isFriend(Session.user, who)
          ? h('button', { class: 'btn btn--primary btn--mini', html: icon('plus', 14) + ' В друзья', onclick: () => { try { Friends.sendRequest(who); toast('Заявка отправлена', { type: 'success' }); } catch (e) { toast(e.message, { type: 'error' }); } } })
          : null,
        !mine ? h('button', { class: 'btn btn--ghost btn--mini', html: icon('send', 14) + ' Пригласить в комнату', onclick: () => Modals.inviteFriend(who) }) : null)),
    mine ? h('div', { style: { marginLeft: 'auto' } },
      h('button', { class: 'btn btn--ghost', html: icon('logout', 16) + ' Выйти', onclick: doLogout })) : null));

  scr.append(h('div', { class: 'stat-grid' },
    statCard(Stats.fmt(st.seconds), 'на волне'),
    statCard(String(st.tracks || 0), plural(st.tracks || 0, 'трек', 'трека', 'треков') + ' сыграно'),
    statCard(String(st.reactions || 0), 'реакций'),
    statCard(String(friendsN), plural(friendsN, 'друг', 'друга', 'друзей'))));

  // Плейлисты (полный менеджер у себя, просмотр у чужого)
  scr.append(playlistsBlock(who, mine));
  return scr;
};

const statCard = (big, label) => h('div', { class: 'card stat' }, h('b', { text: big }), h('span', { text: label }));

/** Блок плейлистов профиля. */
function playlistsBlock(who, mine) {
  const list = Playlists.mine(who);
  const sharedRooms = mine ? Rooms.byUser(who) : [];

  const content = h('div', { class: 'card' });
  if (list.length === 0 && sharedRooms.length === 0) {
    content.append(h('div', { class: 'empty' },
      h('div', { html: icon('note', 30) }),
      h('div', { text: mine ? 'Плейлистов пока нет. Нажмите «+» во время трека в комнате!' : 'У пользователя нет плейлистов' })));
  }
  list.forEach(pl => {
    const row = playlistRow(pl, mine);
    if (!mine) row.onclick = () => Modals.playlistViewOnly(pl);
    content.append(row);
  });
  sharedRooms.forEach(rm => {
    const pl = Playlists.shared(rm.id);
    const row = playlistRow(pl, true);
    qs('.pl-row__meta span', row).textContent = '👥 совместный с ' + rm.name + ' · ' + pl.trackIds.length + ' ' + plural(pl.trackIds.length, 'трек', 'трека', 'треков');
    content.append(row);
  });

  const block = blockWrap('Плейлисты', 'note', list.length + sharedRooms.length, content);
  if (mine) block.querySelector('.block__head').append(h('button', {
    class: 'btn btn--mini btn--ghost', html: icon('plus', 14) + ' Новый плейлист',
    onclick: async () => {
      const name = await Modals.prompt('Название плейлиста', 'Мой плейлист');
      if (name === null) return;
      Playlists.create(name);
      Router.render(true);
    }
  }));
  return block;
}

/** Строка плейлиста. */
function playlistRow(pl, editable) {
  const tracks = pl.trackIds.map(trackById).filter(Boolean);
  const cover = Playlists.cover(pl);
  return h('div', { class: 'pl-row', onclick: () => Modals.playlistEditor(pl.id, !editable) },
    h('div', { class: 'pl-row__cover--stack', style: { width: '46px', height: '46px', borderRadius: '11px' } },
      tracks.slice(0, 4).length
        ? tracks.slice(0, 4).map(t => h('img', { src: trackCover(t), alt: '' }))
        : h('img', { src: cover, alt: '' })),
    h('div', { class: 'pl-row__meta' },
      h('b', { text: pl.name }),
      h('span', { text: pl.trackIds.length + ' ' + plural(pl.trackIds.length, 'трек', 'трека', 'треков') })),
    editable ? h('div', { class: 'pl-row__actions' },
      h('button', { class: 'btn-icon', title: 'Редактировать', html: icon('edit', 15), onclick: (e) => { e.stopPropagation(); Modals.playlistEditor(pl.id, !editable); } })) : null);
}

/* -------------------------------- 5. ДРУЗЬЯ ------------------------------- */

Screens.friends = function () {
  document.title = 'WaveTogether — Друзья';
  markActiveNav('friends');
  const scr = h('div', {});

  const rerender = debounce(() => Router.render(true), 150);
  onCleanup(Bus.on('friends', rerender));
  onCleanup(Bus.on('users', rerender));
  const presenceTick = setInterval(() => updateHomeDynamic(), 5000);
  onCleanup(() => clearInterval(presenceTick));

  // Поиск новых друзей
  const results = h('div', { class: 'card', style: { marginTop: '12px' }, hidden: true });
  const searchInput = h('input', {
    class: 'input', placeholder: 'Поиск по логину или имени…',
    oninput: debounce(() => {
      const found = Users.search(searchInput.value);
      results.hidden = found.length === 0;
      results.replaceChildren(...found.map(u => h('div', { class: 'friend-row' },
        avatarEl(u.login, 40, true),
        h('div', { class: 'friend-row__meta' }, h('b', { text: u.name || u.login }), h('span', { text: '@' + u.login + ' · ' + (u.status || '') })),
        h('div', { class: 'friend-row__actions' },
          Friends.isFriend(Session.user, u.login)
            ? h('span', { class: 'count', text: 'уже в друзьях' })
            : h('button', { class: 'btn btn--mini btn--primary', html: icon('plus', 14) + ' В друзья', onclick: () => { try { Friends.sendRequest(u.login); } catch (e) { toast(e.message, { type: 'error' }); } } })))));
    }, 250)
  });

  scr.append(h('div', { class: 'card' },
    h('div', { class: 'block__head', style: { marginBottom: '10px' } },
      h('span', { html: icon('search', 19), style: { color: 'var(--accent)', display: 'flex' } }),
      h('h2', { text: 'Найти друзей' })),
    searchInput, results));

  // Входящие заявки
  const inc = Friends.incoming();
  if (inc.length) {
    scr.append(blockWrap('Заявки в друзья', 'users', inc.length,
      h('div', { class: 'card' },
        inc.map(r => h('div', { class: 'friend-row' },
          avatarEl(r.from, 40, true),
          h('div', { class: 'friend-row__meta' }, h('b', { text: r.from }), h('span', { text: timeAgo(r.ts) })),
          h('div', { class: 'friend-row__actions' },
            h('button', { class: 'btn btn--mini btn--primary', text: 'Принять', onclick: () => Friends.accept(r.from) }),
            h('button', { class: 'btn btn--mini', text: 'Отклонить', onclick: () => Friends.decline(r.from) })))))));
  }

  // Друзья
  const friends = Friends.list();
  scr.append(blockWrap('Мои друзья', 'users', friends.length,
    h('div', { class: 'card' },
      friends.length ? friends.map(f => friendRow(f)) : h('div', { class: 'empty' },
        h('div', { html: icon('users', 30) }),
        h('div', { text: 'Пока одинокое сердце. Найдите кого-нибудь через поиск выше 💜' })))));
  return scr;
};

/* ------------------------------ 6. НАСТРОЙКИ ------------------------------ */

Screens.settings = function () {
  document.title = 'WaveTogether — Настройки';
  markActiveNav('settings');
  const me = Users.get(Session.user);
  const scr = h('div', {});

  scr.append(h('h1', { class: 'page-title', text: 'Настройки' }),
    h('p', { class: 'page-sub', text: 'Аккаунт, внешний вид и данные. Скины и цвета можно крутить и в боковой панели — она правее ☝️' }));

  const grid = h('div', { class: 'settings-grid' });

  // Аккаунт
  const passNew = h('input', { class: 'input', type: 'password', placeholder: 'Новый пароль (от 4 символов)' });
  grid.append(h('div', { class: 'card set-section' },
    h('h3', {}, h('span', { html: icon('user', 16) }), 'Аккаунт'),
    h('div', { class: 'set-row' }, avatarEl(me.login, 44, true),
      h('div', { class: 'set-row__txt' }, h('b', { text: me.name || me.login }), h('span', { text: '@' + me.login })),
      h('button', { class: 'btn btn--mini btn--ghost', text: 'Аватар', onclick: () => Modals.avatarPicker() })),
    h('div', { class: 'field' }, h('label', { text: 'Сменить пароль' }), passNew),
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button', {
        class: 'btn btn--mini btn--primary', text: 'Сохранить пароль',
        onclick: () => {
          if (passNew.value.length < 4) { toast('Пароль — минимум 4 символа', { type: 'error' }); return; }
          Users.updateMe({ pass: passNew.value });
          passNew.value = '';
          toast('Пароль обновлён', { type: 'success' });
        }
      }),
      h('button', { class: 'btn btn--mini btn--ghost btn--danger', text: 'Выйти', onclick: doLogout }))));

  // Внешний вид — та же начинка, что и в drawer (переиспользуем секции)
  const styleCard = h('div', { class: 'card set-section' },
    h('h3', {}, h('span', { html: icon('palette', 16) }), 'Внешний вид'),
    CustomDrawer.buildSections ? CustomDrawer.buildSections() : null,
    h('button', { class: 'btn btn--ghost btn--block', html: icon('palette', 16) + ' Открыть большую панель скинов', onclick: () => CustomDrawer.open() }));
  grid.append(styleCard);

  // Данные
  grid.append(h('div', { class: 'card set-section' },
    h('h3', {}, h('span', { html: icon('sliders', 16) }), 'Данные и хранилище'),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__txt' }, h('b', { text: 'Demo-хранилище' }), h('span', { text: 'Всё живёт в localStorage вашего браузера' })),
      h('button', {
        class: 'btn btn--mini btn--ghost', text: 'Скопировать JSON',
        onclick: async () => {
          const dump = {};
          for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('wt_')) dump[k] = DB.get(k); }
          await copyText(JSON.stringify(dump, null, 2));
          toast('Данные скопированы в буфер', { type: 'success', icon: 'copy' });
        }
      })),
    h('div', { class: 'set-row' },
      h('div', { class: 'set-row__txt' }, h('b', { text: 'Сбросить мир WaveTogether' }), h('span', { text: 'Удалит ВСЕ данные из этого браузера' })),
      h('button', { class: 'btn btn--mini btn--danger btn--ghost', text: 'Очистить всё', onclick: () =>
        Modals.confirm('Точно удалить все данные WaveTogether из браузера?', () => {
          Object.keys(localStorage).filter(k => k.startsWith('wt_')).forEach(k => localStorage.removeItem(k));
          location.reload();
        }) }))));

  scr.append(grid);
  return scr;
};

/* ============================ МОДАЛЬНЫЕ ОКНА ============================== */

const Modals = (() => {
  const root = () => qs('#modal-root');

  function open(node, { wide = false } = {}) {
    const scrim = h('div', { class: 'modal-scrim' });
    const modal = h('div', { class: 'modal' + (wide ? ' modal--wide' : '') }, node);
    scrim.append(modal);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
    root().replaceChildren(scrim);
    return modal;
  }
  function close() { root().replaceChildren(); }

  /** Базовая модалка с заголовком и телом. */
  function base(title, body, foot = null) {
    return open(h('div', {},
      h('div', { class: 'modal__head' },
        h('h3', { text: title }),
        h('button', { class: 'btn-icon', html: icon('x', 17), onclick: close })),
      h('div', { class: 'modal__body' }, body),
      foot ? h('div', { class: 'modal__foot' }, foot) : null));
  }

  /* --- confirm / prompt --- */
  function confirm(text, onYes) {
    base('Подтвердите', h('p', { text }), [
      h('button', { class: 'btn', text: 'Отмена', onclick: close }),
      h('button', { class: 'btn btn--primary btn--danger', text: 'Да', onclick: () => { close(); onYes(); } })
    ]);
  }
  function prompt(title, value = '') {
    return new Promise(resolve => {
      const inp = h('input', { class: 'input', value });
      base(title, h('div', { class: 'field' }, inp), [
        h('button', { class: 'btn', text: 'Отмена', onclick: () => { close(); resolve(null); } }),
        h('button', { class: 'btn btn--primary', text: 'Готово', onclick: () => { close(); resolve(inp.value.trim()); } })
      ]);
      setTimeout(() => inp.focus(), 50);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { close(); resolve(inp.value.trim()); } });
    });
  }

  /* --- Создание комнаты --- */
  function createRoom() {
    const name = h('input', { class: 'input', placeholder: 'Например: Наши вечера' });
    let mood = 'romantic';
    const moodRow = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
      Object.entries(MOODS).filter(([k]) => k !== 'mix').map(([k, m]) => {
        const c = h('button', {
          class: 'chip' + (k === mood ? ' is-active' : ''), style: { '--mood-color': m.color },
          html: '<span class="dot"></span>' + m.label,
          onclick: () => { mood = k; qsa('.chip', moodRow).forEach(x => x.classList.remove('is-active')); c.classList.add('is-active'); }
        });
        return c;
      }));
    const icons = ['💞', '💜', '🌙', '🔥', '🌊', '🎧', '🌸', '✨'];
    let iconPick = '💞';
    const iconRow = h('div', { class: 'avatar-pick', style: { gridTemplateColumns: 'repeat(8, 1fr)' } },
      icons.map(e => {
        const b = h('button', {
          class: e === iconPick ? 'is-active' : '', text: e,
          onclick: () => { iconPick = e; qsa('button', iconRow).forEach(x => x.classList.remove('is-active')); b.classList.add('is-active'); }
        });
        return b;
      }));

    base('Новая комната', h('div', {},
      h('div', { class: 'field' }, h('label', { text: 'Название' }), name),
      h('div', { class: 'field' }, h('label', { text: 'Настроение волны' }), moodRow),
      h('div', { class: 'field' }, h('label', { text: 'Иконка комнаты' }), iconRow)), [
      h('button', { class: 'btn', text: 'Отмена', onclick: close }),
      h('button', {
        class: 'btn btn--primary', html: icon('heart', 16) + ' Создать',
        onclick: () => {
          const room = Rooms.create({ name: name.value, mood, icon: iconPick, color: (MOODS[mood] || MOODS.chill).color });
          close();
          toast('Комната «' + room.name + '» создана — код ' + room.code, { type: 'success', icon: 'room' });
          Router.go('#/room/' + room.id);
        }
      })
    ]);
  }

  /* --- Вход по коду --- */
  function joinByCode() {
    const inp = h('input', { class: 'input', placeholder: 'Например: LOVE26', style: { textTransform: 'uppercase', letterSpacing: '.2em', fontFamily: "'JetBrains Mono', monospace" } });
    base('Присоединиться по коду', h('div', { class: 'field' },
      h('label', { text: 'Код комнаты (6 символов)' }), inp,
      h('div', { class: 'field-hint', text: 'Попросите код у половинки — он показан в шапке комнаты.' })), [
      h('button', { class: 'btn', text: 'Отмена', onclick: close }),
      h('button', {
        class: 'btn btn--primary', text: 'Войти',
        onclick: () => {
          try { const room = Rooms.joinByCode(inp.value); close(); Router.go('#/room/' + room.id); }
          catch (e) { toast(e.message, { type: 'error' }); }
        }
      })
    ]);
    setTimeout(() => inp.focus(), 50);
  }

  /* --- Пригласить друга: выбрать мою комнату --- */
  function inviteFriend(login) {
    const rooms = Rooms.byUser(Session.user).filter(r => r.members.length < 2);
    base('Позвать ' + login + ' на волну', rooms.length
      ? h('div', { class: 'grid' }, rooms.map(r => h('button', {
          class: 'quick-action', style: { '--qa-c1': r.color || 'var(--accent)' },
          onclick: () => { Invites.send(login, r.id); close(); }
        },
        h('div', { class: 'qa-ic', text: r.icon || '💞' }),
        h('div', {}, h('b', { text: r.name }), h('span', { text: 'код ' + r.code })))))
      : h('div', { class: 'empty', html: icon('room', 26) + '<div style="margin-top:8px">Нет свободных комнат. Создайте новую!</div>' }));
  }

  /* --- Пригласить кого-нибудь в конкретную комнату --- */
  function inviteToRoom(room) {
    const candidates = Friends.list().filter(f => !room.members.includes(f));
    base('Позвать в «' + room.name + '»',
      candidates.length
        ? h('div', {}, candidates.map(f => h('div', { class: 'friend-row' },
            avatarEl(f, 36, true),
            h('div', { class: 'friend-row__meta' }, h('b', { text: f })),
            h('button', { class: 'btn btn--mini btn--primary', text: 'Позвать', onclick: () => { Invites.send(f, room.id); close(); } }))))
        : h('div', { class: 'empty', text: 'Все ваши друзья уже здесь (или друзей пока нет)' }));
  }

  /* --- Кастомизация комнаты --- */
  function customizeRoom(room) {
    const name = h('input', { class: 'input', value: room.name });
    const icons = ['💞', '💜', '🌙', '🔥', '🌊', '🎧', '🌸', '✨', '🍷', '🏠'];
    let iconPick = room.icon || '💞';
    const iconRow = h('div', { class: 'avatar-pick' },
      icons.map(e => h('button', {
        class: e === iconPick ? 'is-active' : '', text: e,
        onclick: (ev) => { iconPick = e; qsa('button', iconRow).forEach(x => x.classList.remove('is-active')); ev.currentTarget.classList.add('is-active'); }
      })));
    const color = h('input', { class: 'color-input', type: 'color', value: room.color || '#8b7cf6' });
    base('Оформление комнаты', h('div', {},
      h('div', { class: 'field' }, h('label', { text: 'Название' }), name),
      h('div', { class: 'field' }, h('label', { text: 'Иконка' }), iconRow),
      h('div', { class: 'field' }, h('label', { text: 'Цвет комнаты' }), color)), [
      h('button', { class: 'btn', text: 'Отмена', onclick: close }),
      h('button', { class: 'btn btn--primary', text: 'Сохранить', onclick: () => {
        Rooms.customize(room.id, { name: name.value.trim() || room.name, icon: iconPick, color: color.value });
        close();
      } })
    ]);
  }

  /* --- Добавить трек в плейлист --- */
  function addToPlaylist(trackId, room = null) {
    const options = [
      ...Playlists.mine().map(p => ({ p, label: null })),
      ...(room ? [{ p: Playlists.shared(room.id), label: 'совместный' }] : [])
    ];
    const list = h('div', {}, options.map(({ p, label }) =>
      h('div', { class: 'pl-row', onclick: () => {
          Playlists.addTrack(p.id, trackId);
          close();
          toast('Добавлено в «' + p.name + '»', { type: 'success', icon: 'check' });
        } },
        h('img', { class: 'pl-row__cover', src: Playlists.cover(p), alt: '' }),
        h('div', { class: 'pl-row__meta' },
          h('b', { text: p.name }),
          h('span', { text: (label ? '👥 ' + label + ' · ' : '') + p.trackIds.length + ' ' + plural(p.trackIds.length, 'трек', 'трека', 'треков') })))),
      h('button', { class: 'btn btn--ghost btn--block', style: { marginTop: '8px' }, html: icon('plus', 15) + ' Новый плейлист', onclick: async () => {
          const nm = await prompt('Название плейлиста', 'Мой плейлист');
          if (nm === null) return;
          const pl = Playlists.create(nm);
          Playlists.addTrack(pl.id, trackId);
          close();
          toast('Создан «' + pl.name + '» и трек добавлен', { type: 'success' });
        } }));
    base('В плейлист', list);
  }

  /* --- Выбрать плейлист как источник комнаты --- */
  function pickPlaylistForRoom(room) {
    const options = [...Playlists.mine(), { ...Playlists.shared(room.id), _shared: true }];

    const rows = options.map(p => h('div', {
      class: 'pl-row',
      onclick: () => {
        if (!p.trackIds.length) { toast('В плейлисте пока пусто — добавьте треки кнопкой +', { icon: 'note' }); return; }
        RoomPlayback.command(room, 'playlist', { playlistId: p.id, scope: p.roomId ? 'room' : 'me', queue: p.trackIds });
        Chat.system(room.id, Session.user + ' поставил(а) плейлист «' + p.name + '»');
        close();
      }
    },
      h('img', { class: 'pl-row__cover', src: Playlists.cover(p), alt: '' }),
      h('div', { class: 'pl-row__meta' },
        h('b', { text: (p._shared ? '👥 ' : '') + p.name }),
        h('span', { text: p.trackIds.length + ' ' + plural(p.trackIds.length, 'трек', 'трека', 'треков') }))));

    const addRow = h('div', {
      class: 'friend-row', style: { cursor: 'pointer' },
      onclick: () => { close(); search(null); }
    },
      h('div', { class: 'friend-row__meta' },
        h('b', { text: '＋ Найти и добавить треки…' })));

    base('Поставить плейлист в комнате', h('div', {}, rows, addRow));
  }

  /* --- Редактор плейлиста: порядок (DnD), удаление, запуск --- */
  function playlistEditor(plId, readonly = false) {
    const pl = Playlists.get(plId);
    if (!pl) { toast('Плейлист не найден', { type: 'error' }); return; }
    const inRoom = Playback.source && Playback.source.kind === 'room' ? Rooms.get(Playback.source.roomId) : null;
    const mySingleRoom = Rooms.byUser(Session.user)[0];

    const wrap = h('div', {});
    const draw = () => {
      const cur = Playlists.get(plId);
      wrap.replaceChildren(
        h('div', { class: 'friend-row', style: { borderBottom: '1px solid var(--border)', marginBottom: '8px' } },
          h('img', { class: 'pl-row__cover', src: Playlists.cover(cur), alt: '' }),
          h('div', { class: 'friend-row__meta' },
            h('b', { text: cur.name }),
            h('span', { text: cur.trackIds.length + ' ' + plural(cur.trackIds.length, 'трек', 'трека', 'треков') })),
          readonly ? null : h('div', { class: 'friend-row__actions' },
            h('button', { class: 'btn-icon', title: 'Переименовать', html: icon('edit', 15), onclick: async () => {
              const n = await prompt('Название плейлиста', cur.name);
              if (n !== null) { Playlists.rename(plId, n); draw(); }
            } }),
            h('button', { class: 'btn-icon', title: 'Удалить плейлист', html: icon('trash', 15), onclick: () =>
              Modals.confirm('Удалить плейлист «' + cur.name + '»?', () => { Playlists.remove(plId); close(); Router.render(true); }) }))),
        cur.trackIds.length === 0
          ? h('div', { class: 'empty', text: 'Пусто. Добавьте треки через поиск или кнопку + в комнате.' })
          : h('div', {}, cur.trackIds.map((tid, i) => trackRow(cur, tid, i, draw, readonly))),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' } },
          (inRoom || mySingleRoom) && !readonly ? h('button', {
            class: 'btn btn--primary btn--mini', html: icon('play', 14) + ' Слушать в комнате',
            onclick: () => {
              const room = inRoom || mySingleRoom;
              if (!cur.trackIds.length) { toast('Плейлист пуст', { type: 'error' }); return; }
              RoomPlayback.command(room, 'playlist', { playlistId: cur.id, scope: cur.roomId ? 'room' : 'me', queue: cur.trackIds });
              Chat.system(room.id, Session.user + ' поставил(а) плейлист «' + cur.name + '»');
              close();
              Router.go('#/room/' + room.id);
            }
          }) : null,
          readonly ? null : h('button', { class: 'btn btn--ghost btn--mini', html: icon('search', 14) + ' Найти треки', onclick: () => { close(); search(cur.id); } })));
    };
    draw();
    base('Плейлист', wrap, null);
  }

  /** Строка трека в редакторе с drag&drop. */
  function trackRow(pl, tid, index, redraw, readonly) {
    const t = trackById(tid);
    if (!t) return h('div', {});
    const row = h('div', { class: 'tr-row', draggable: readonly ? 'false' : 'true' },
      readonly ? null : h('span', { class: 'drag-handle', html: icon('drag', 16) }),
      h('img', { src: trackCover(t), alt: '' }),
      h('div', { class: 'tr-row__meta' }, h('b', { text: t.t }), h('span', { text: t.a })),
      h('time', { text: fmtTime(t.dur * 1000) }),
      readonly ? null : h('button', { class: 'btn-icon', style: { width: '30px', height: '30px' }, title: 'Убрать', html: icon('x', 14),
        onclick: () => { Playlists.removeTrack(pl.id, tid); redraw(); } }));

    if (!readonly) {
      row.addEventListener('dragstart', (e) => {
        row.classList.add('is-dragging');
        e.dataTransfer.setData('text/plain', String(index));
      });
      row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const from = +e.dataTransfer.getData('text/plain');
        if (Number.isNaN(from) || from === index) return;
        Playlists.moveTrack(pl.id, from, index);
        redraw();
      });
    }
    return row;
  }

  /* --- Поиск треков (каталог + ссылка SoundCloud) --- */
  function search(addToPlaylistId = null) {
    const inRoom = Playback.source && Playback.source.kind === 'room' ? Rooms.get(Playback.source.roomId) : null;

    const results = h('div', {});
    const drawResults = (q) => {
      const found = q ? searchTracks(q) : TRACKS.slice(0, 8); // по умолчанию — «популярное»
      results.replaceChildren(
        q ? [] : h('p', { class: 'field-hint', style: { margin: '0 4px 8px' }, text: 'Популярное на волнах:' }),
        ...found.map(t => trackResultRow(t)),
        q && !found.length ? h('div', { class: 'empty', text: 'В каталоге не нашлось. Попробуйте вставить ссылку SoundCloud ниже.' }) : null);
    };
    function trackResultRow(t) {
      return h('div', { class: 'tr-row' },
        h('img', { src: trackCover(t), alt: '' }),
        h('div', { class: 'tr-row__meta' },
          h('b', { text: t.t }),
          h('span', { text: t.a + ' · ' + t.moods.map(m => MOODS[m].label).join(', ') })),
        h('time', { text: fmtTime(t.dur * 1000) }),
        h('div', { class: 'friend-row__actions' },
          addToPlaylistId ? h('button', {
            class: 'btn-icon', title: 'В плейлист', html: icon('plus', 16),
            onclick: () => { Playlists.addTrack(addToPlaylistId, t.id); toast('Добавлено', { type: 'success' }); }
          }) : null,
          inRoom ? h('button', {
            class: 'btn-icon', title: 'Играть следующим в комнате', html: icon('play', 16),
            onclick: () => {
              RoomPlayback.insertNext(inRoom, t.id, true);
              Chat.system(inRoom.id, Session.user + ' добавил(а) в очередь «' + t.t + '»');
              close();
            }
          }) : null));
    }

    const inp = h('input', {
      class: 'input', placeholder: 'Название, исполнитель или настроение…',
      oninput: debounce((e) => drawResults(e.target.value), 200)
    });

    const urlInp = h('input', { class: 'input', placeholder: 'https://soundcloud.com/artist/track' });
    const urlBtn = h('button', {
      class: 'btn btn--mini btn--primary', text: 'Загрузить',
      onclick: async () => {
        urlBtn.disabled = true; urlBtn.textContent = 'Ищем…';
        try {
          const t = await addTrackByUrl(urlInp.value);
          toast('Трек найден: ' + t.t, { type: 'success' });
          drawResults(t.t);
        } catch (e) { toast(e.message, { type: 'error' }); }
        urlBtn.disabled = false; urlBtn.textContent = 'Загрузить';
      }
    });

    drawResults('');
    base('Поиск музыки', h('div', {},
      h('div', { class: 'field' }, inp),
      results,
      h('div', { class: 'field', style: { marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '14px' } },
        h('label', { text: '…или вставьте ссылку на SoundCloud' }),
        h('div', { style: { display: 'flex', gap: '8px' } }, urlInp, urlBtn)),
      h('p', { class: 'field-hint', text: 'Воспроизведение идёт через официальный виджет SoundCloud.' })), null);
    setTimeout(() => inp.focus(), 60);
  }

  /* --- Просмотр чужого плейлиста (read-only, без поиска в хранилище) --- */
  function playlistViewOnly(pl) {
    base('Плейлист: ' + pl.name,
      h('div', {},
        pl.trackIds.length === 0 ? h('div', { class: 'empty', text: 'Пусто' })
        : pl.trackIds.map(tid => {
            const t = trackById(tid);
            return t ? h('div', { class: 'tr-row' },
              h('img', { src: trackCover(t), alt: '' }),
              h('div', { class: 'tr-row__meta' }, h('b', { text: t.t }), h('span', { text: t.a })),
              h('time', { text: fmtTime(t.dur * 1000) })) : null;
          })));
  }

  /* --- Выбор аватара --- */
  const AVATARS = ['🦊','🐰','🐼','🦉','🐱','🐶','🦉','🐨','🐯','🦁','🐸','🐙','🦄','🐝','🌸','🌙','⭐','🔥','🎧','💜','💛','💚','🩵','🧡'];
  function avatarPicker() {
    const grid = h('div', { class: 'avatar-pick' },
      AVATARS.map(e => h('button', {
        text: e, class: Users.get(Session.user).avatar === e ? 'is-active' : '',
        onclick: () => { Users.updateMe({ avatar: e }); close(); toast('Аватар обновлён', { type: 'success' }); Router.render(true); }
      })));
    base('Выберите аватар', grid);
  }

  return { open, close, confirm, prompt, createRoom, joinByCode, inviteFriend, inviteToRoom, customizeRoom, addToPlaylist, pickPlaylistForRoom, playlistEditor, playlistViewOnly, search, avatarPicker, base };
})();

/* ============================ ТОЧКА ВХОДА ================================= */

function boot() {
  seedDemo();

  // Настройки темы/эффектов текущего пользователя
  Custom.apply();
  Playback.setVolumeInit(Custom.get().volume || 80);

  // Мгновенное присутствие
  Presence.beat();

  // Если хэш не задан — определим стартовый экран
  if (!location.hash) {
    location.hash = Session.user ? '#/home' : '#/landing';
    return; // hashchange сам перерисует
  }
  Router.render();
}

// Поддерживаем док и бейджи при любых изменениях мира
Bus.on('playlist', () => Playback.renderDock());
Bus.on('rooms', () => Playback.renderDock());
Bus.on('*', () => { /* мягкий keep-alive */ });

document.addEventListener('DOMContentLoaded', boot);
