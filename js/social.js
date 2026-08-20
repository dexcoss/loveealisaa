/* ============================================================================
 * WaveTogether — social.js
 * Социальный слой: регистрация/вход (эмуляция на localStorage), профили,
 * аватары, друзья и заявки, комнаты и приглашения, присутствие (онлайн),
 * плейлисты (личные + совместные комнаты), статистика прослушиваний,
 * а также засев демо-аккаунтов для мгновенного погружения.
 * ========================================================================== */
'use strict';

/* ================================ ПОЛЬЗОВАТЕЛИ ============================= */

/** Пары градиентов для аватаров — выбирается по хэшу логина. */
const AVATAR_GRADS = [
  ['#8b7cf6', '#f472b6'], ['#38bdf8', '#34d399'], ['#fb923c', '#f472b6'],
  ['#f59e0b', '#8b5cf6'], ['#22d3ee', '#8b7cf6'], ['#34d399', '#a3e635'],
  ['#f472b6', '#fb7185'], ['#a78bfa', '#7dd3fc']
];

const Users = {
  /** Все пользователи: { login: user }. */
  map() { return DB.get('wt_users', {}); },
  get(login) {
    if (!login) return null;
    return this.map()[login] || null;
  },
  save(user) {
    const map = this.map();
    map[user.login] = user;
    DB.set('wt_users', map);
    return user;
  },
  exists(login) { return login in this.map(); },

  /** Регистрация. Возвращает user или бросает ошибку с русским текстом. */
  register(login, pass, name) {
    login = (login || '').trim().toLowerCase();
    if (!/^[a-zа-яё0-9_.-]{2,20}$/iu.test(login)) throw new Error('Логин: 2–20 символов — буквы, цифры, ._-');
    if ((pass || '').length < 4) throw new Error('Пароль — минимум 4 символа');
    if (this.exists(login)) throw new Error('Такой логин уже занят');
    const user = this.save({
      login, pass,
      name: (name || '').trim() || login,
      avatar: '🎧',
      status: 'только что завёл(а) волну 🌊',
      createdAt: Date.now()
    });
    DB.set('wt_friends_' + login, []);
    Bus.send('users', { reason: 'new', login });
    return user;
  },

  /** Вход. Возвращает user или бросает ошибку. */
  login(login, pass) {
    login = (login || '').trim().toLowerCase();
    const u = this.get(login);
    if (!u) throw new Error('Пользователь не найден');
    if (u.pass !== pass) throw new Error('Неверный пароль');
    Session.user = login;
    return u;
  },

  logout() { Session.user = null; },

  /** Обновить профиль текущего пользователя. */
  updateMe(patch) {
    const me = this.get(Session.user);
    if (!me) return null;
    const next = { ...me, ...patch };
    this.save(next);
    Bus.send('users', { reason: 'update', login: me.login });
    return next;
  },

  /** Поиск пользователей по логину/имени (кроме меня). */
  search(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return [];
    return Object.values(this.map())
      .filter(u => u.login !== Session.user)
      .filter(u => u.login.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q))
      .slice(0, 12);
  }
};

/** DOM-элемент аватара по логину (градиент + эмодзи + точка онлайна). */
function avatarEl(login, size = 40, withStatus = false) {
  const u = Users.get(login);
  const g = AVATAR_GRADS[hashInt(login || 'x') % AVATAR_GRADS.length];
  const el = h('div', {
    class: 'avatar',
    style: { '--sz': size + 'px', '--av-c1': g[0], '--av-c2': g[1] },
    text: (u && u.avatar) || '🎧',
    title: u ? u.name || u.login : login
  });
  if (withStatus) {
    el.append(h('span', { class: 'avatar__status' + (Presence.isOnline(login) ? ' online' : '') }));
  }
  return el;
}

/* ================================ ПРИСУТСТВИЕ ============================== */

const Presence = (() => {
  const KEY = 'wt_presence';

  /** «Семафор» текущего пользователя: онлайн + что слушает + где. */
  function beat() {
    const me = Session.user;
    if (!me) return;
    const all = DB.get(KEY, {});
    const v = Playback.view();
    const roomId = v && v.kind === 'room' ? v.room.id : null;
    all[me] = {
      ts: Date.now(),
      listening: v && v.playing ? `${v.track.t} — ${v.track.a}` : null,
      roomId,
      page: location.hash.split('/')[1] || 'home'
    };
    DB.set(KEY, all);

    // Комнатное присутствие (сердцебиение комнаты)
    const activeRoom = roomIdFromHash() || roomId;
    if (activeRoom) {
      const rp = DB.get('wt_presence_room_' + activeRoom, {});
      rp[me] = Date.now();
      DB.set('wt_presence_room_' + activeRoom, rp);
    }
  }
  const roomIdFromHash = () => {
    const p = location.hash.split('/');
    return p[1] === 'room' ? p[2] : null;
  };

  setInterval(beat, 4000);

  return {
    beat,
    get: (login) => DB.get(KEY, {})[login] || null,
    isOnline: (login) => {
      const p = DB.get(KEY, {})[login];
      return !!p && Date.now() - p.ts < 15000;
    },
    /** В комнате ли конкретный пользователь (по сердцебиению комнаты). */
    inRoom: (roomId, login) => {
      const p = DB.get('wt_presence_room_' + roomId, {})[login];
      return !!p && Date.now() - p.ts < 10000;
    },
    roomMap: (roomId) => DB.get('wt_presence_room_' + roomId, {})
  };
})();

/* ================================= ДРУЗЬЯ ================================= */

const Friends = {
  list(login = Session.user) { return DB.get('wt_friends_' + login, []); },
  isFriend(a, b) { return this.list(a).includes(b); },
  incoming(login = Session.user) { return DB.get('wt_friend_req_' + login, []); },
  outgoing(login = Session.user) { return DB.get('wt_friend_out_' + login, []); },

  /** Отправить заявку. */
  sendRequest(to) {
    const me = Session.user;
    if (!me || to === me) throw new Error('Это вы 🙂');
    if (!Users.exists(to)) throw new Error('Такого пользователя нет');
    if (this.isFriend(me, to)) throw new Error('Вы уже друзья');
    if (this.incoming(me).find(r => r.from === to)) { this.accept(to); return 'accepted'; }
    if (this.outgoing(me).includes(to)) throw new Error('Заявка уже отправлена');
    DB.update('wt_friend_req_' + to, (l = []) => (l.push({ from: me, ts: Date.now() }), l), []);
    DB.update('wt_friend_out_' + me, (l = []) => (l.push(to), l), []);
    Bus.send('friend-req', { to, from: me });
    Bus.send('friends', { reason: 'req' });
    return 'sent';
  },

  /** Принять заявку (от кого-то). */
  accept(from) {
    const me = Session.user;
    DB.update('wt_friend_req_' + me, (l = []) => l.filter(r => r.from !== from), []);
    DB.update('wt_friend_out_' + from, (l = []) => l.filter(x => x !== me), []);
    DB.update('wt_friends_' + me, (l = []) => (l.includes(from) ? l : (l.push(from), l)), []);
    DB.update('wt_friends_' + from, (l = []) => (l.includes(me) ? l : (l.push(me), l)), []);
    Bus.send('friend-yes', { to: from, from: me });
    Bus.send('friends', { reason: 'accept' });
  },

  /** Отклонить входящую заявку. */
  decline(from) {
    const me = Session.user;
    DB.update('wt_friend_req_' + me, (l = []) => l.filter(r => r.from !== from), []);
    DB.update('wt_friend_out_' + from, (l = []) => l.filter(x => x !== me), []);
    Bus.send('friends', { reason: 'decline' });
  },

  /** Удалить из друзей. */
  remove(other) {
    const me = Session.user;
    DB.update('wt_friends_' + me, (l = []) => l.filter(x => x !== other), []);
    DB.update('wt_friends_' + other, (l = []) => l.filter(x => x !== me), []);
    Bus.send('friends', { reason: 'remove' });
  }
};

/* ================================= КОМНАТЫ ================================= */

const Rooms = {
  map() { return DB.get('wt_rooms', {}); },
  get(id) { return this.map()[id] || null; },
  list() { return Object.values(this.map()); },
  byUser(login) { return this.list().filter(r => r.members.includes(login)); },

  save(room) {
    const map = this.map();
    map[room.id] = room;
    DB.set('wt_rooms', map);
    Bus.send('rooms', { reason: 'save', roomId: room.id });
    return room;
  },

  /** Создать комнату. creator автоматически становится первым участником. */
  create({ name, icon, mood, color }) {
    const me = Session.user;
    if (!me) throw new Error('Нужно войти');
    const id = uid('room');
    const room = this.save({
      id,
      code: Rooms.genCode(),
      name: (name || '').trim() || 'Наша комната',
      icon: icon || '💞',
      mood: mood || 'romantic',
      color: color || '#8b7cf6',
      members: [me],
      createdBy: me,
      createdAt: Date.now()
    });
    RoomPlayback.ensure(room);
    Chat.system(id, 'Комната создана — ждём вторую половинку 💫');
    return room;
  },

  /** Читаемый код приглашения. */
  genCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    const rnd = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    for (let i = 0; i < 6; i++) s += A[Math.floor(rnd() * A.length)];
    return s;
  },

  /** Войти в комнату по объекту (если место есть). */
  join(id) {
    const me = Session.user;
    const room = this.get(id);
    if (!room) throw new Error('Комната не найдена — проверьте код или ссылку');
    if (!room.members.includes(me)) {
      if (room.members.length >= 2) throw new Error('Комната уже занята парой 💔');
      room.members.push(me);
      this.save(room);
      Chat.system(id, me + ' присоединился(лась) к комнате ✨');
    }
    return room;
  },

  joinByCode(code) {
    code = (code || '').trim().toUpperCase();
    const room = this.list().find(r => r.code === code);
    if (!room) throw new Error('Комната с кодом ' + (code || '—') + ' не найдена');
    return this.join(room.id);
  },

  leave(id) {
    const me = Session.user;
    const room = this.get(id);
    if (!room) return;
    room.members = room.members.filter(m => m !== me);
    if (room.members.length === 0) {
      // комната пуста — удаляем всё, включая чат и состояние
      const map = this.map(); delete map[id]; DB.set('wt_rooms', map);
      DB.remove(RoomPlayback.key(id)); DB.remove(ChatStore.key(id));
      Bus.send('rooms', { reason: 'delete', roomId: id });
    } else {
      this.save(room);
      Chat.system(id, me + ' вышел(ла) из комнаты');
    }
  },

  /** Обновить внешний вид комнаты (название/иконка/цвет/настроение). */
  customize(id, patch) {
    const room = this.get(id);
    if (!room) return;
    this.save({ ...room, ...patch });
    Bus.send('room-look', { roomId: id });
  }
};

/* ============================== ПРИГЛАШЕНИЯ ================================ */

const Invites = {
  key: (login) => 'wt_invites_' + login,
  list(login = Session.user) { return DB.get(this.key(login), []); },

  /** Отправить приглашение другу в комнату. */
  send(to, roomId) {
    const me = Session.user;
    const room = Rooms.get(roomId);
    if (!room) return;
    const inv = { id: uid('inv'), roomId, from: me, ts: Date.now(), roomName: room.name };
    DB.update(this.key(to), (l = []) => (l.push(inv), l.slice(-8)), []);
    Bus.send('invite', { to, inv });
    toast('Приглашение отправлено: ' + to, { type: 'success', icon: 'send' });
  },

  dismiss(id) {
    DB.update(this.key(Session.user), (l = []) => l.filter(i => i.id !== id), []);
  },

  accept(inv) {
    try {
      const room = Rooms.join(inv.roomId);
      this.dismiss(inv.id);
      location.hash = '#/room/' + room.id;
    } catch (e) {
      this.dismiss(inv.id);
      toast(e.message, { type: 'error' });
    }
  }
};

// Тосты входящих событий: приглашения и заявки в друзья
Bus.on('invite', ({ to, inv }) => {
  if (to !== Session.user) return;
  toast(`${inv.from} зовёт вас в комнату «${inv.roomName}»`, {
    icon: 'room', timeout: 15000,
    actions: [
      { label: 'Войти', kind: 'primary', fn: () => Invites.accept(inv) },
      { label: 'Позже', fn: () => {} }
    ]
  });
});
Bus.on('friend-req', ({ to, from }) => {
  if (to !== Session.user) return;
  toast(from + ' хочет добавить вас в друзья', {
    icon: 'users', timeout: 13000,
    actions: [
      { label: 'Принять', kind: 'primary', fn: () => { Friends.accept(from); toast('Теперь вы друзья с ' + from, { type: 'success' }); } },
      { label: 'Отклонить', fn: () => Friends.decline(from) }
    ]
  });
});
Bus.on('friend-yes', ({ to, from }) => {
  if (to !== Session.user) return;
  toast(from + ' принял(а) вашу заявку — теперь вы друзья 💞', { type: 'success', icon: 'heart' });
});

/* =============================== ПЛЕЙЛИСТЫ ================================= */

const Playlists = {
  mineKey: (login = Session.user) => 'wt_playlists_' + login,
  sharedKey: (roomId) => 'wt_playlist_shared_' + roomId,

  /** Мои плейлисты. */
  mine(login = Session.user) { return DB.get(this.mineKey(login), []); },

  /** Совместный плейлист комнаты (создаётся лениво). */
  shared(roomId) {
    let pl = DB.get(this.sharedKey(roomId));
    if (!pl) {
      pl = { id: 'shared_' + roomId, name: 'Наш совместный плейлист', trackIds: [], roomId, createdAt: Date.now() };
      DB.set(this.sharedKey(roomId), pl);
    }
    return pl;
  },

  /** Найти плейлист по id: среди моих или совместных моих комнат. */
  get(id) {
    let pl = this.mine().find(p => p.id === id);
    if (pl) { pl.scope = 'me'; return pl; }
    for (const r of Rooms.byUser(Session.user)) {
      pl = DB.get(this.sharedKey(r.id));
      if (pl && pl.id === id) { pl.scope = 'room'; return pl; }
    }
    return null;
  },

  save(pl) {
    if (pl.roomId) {
      DB.set(this.sharedKey(pl.roomId), pl);
      Bus.send('playlist', { scope: 'room', roomId: pl.roomId });
    } else {
      const list = this.mine();
      const i = list.findIndex(p => p.id === pl.id);
      if (i >= 0) list[i] = pl; else list.push(pl);
      DB.set(this.mineKey(), list);
      Bus.send('playlist', { scope: 'user', owner: Session.user });
    }
    return pl;
  },

  create(name) {
    const pl = this.save({ id: uid('pl'), name: (name || '').trim() || 'Без названия', trackIds: [], createdAt: Date.now() });
    return pl;
  },

  remove(id) {
    const pl = this.get(id);
    if (pl && pl.roomId) { pl.trackIds = []; this.save(pl); return; } // совместный не удаляем, чистим
    DB.set(this.mineKey(), this.mine().filter(p => p.id !== id));
    Bus.send('playlist', { scope: 'user', owner: Session.user });
  },

  /** Добавить трек в плейлист (без дублей). */
  addTrack(id, trackId) {
    const pl = this.get(id);
    if (!pl) throw new Error('Плейлист не найден');
    if (pl.trackIds.includes(trackId)) { toast('Трек уже в этом плейлисте', { icon: 'note' }); return pl; }
    pl.trackIds.push(trackId);
    this.save(pl);
    return pl;
  },

  removeTrack(id, trackId) {
    const pl = this.get(id);
    if (!pl) return;
    pl.trackIds = pl.trackIds.filter(t => t !== trackId);
    this.save(pl);
  },

  /** Переместить трек (drag&drop): from → to. */
  moveTrack(id, from, to) {
    const pl = this.get(id);
    if (!pl) return;
    const [item] = pl.trackIds.splice(from, 1);
    pl.trackIds.splice(to, 0, item);
    this.save(pl);
  },

  rename(id, name) {
    const pl = this.get(id);
    if (!pl) return;
    pl.name = (name || '').trim() || pl.name;
    this.save(pl);
  },

  /** Обложка плейлиста = обложка первого трека (или fallback настроения). */
  cover(pl) {
    if (!pl || !pl.trackIds.length) return MOODS.chill.cover;
    return trackCover(trackById(pl.trackIds[0]));
  }
};

/* =============================== СТАТИСТИКА ================================ */

const Stats = (() => {
  const key = (login = Session.user) => 'wt_stats_' + login;

  function get(login = Session.user) {
    return DB.get(key(login), { seconds: 0, tracks: 0, reactions: 0, messages: 0 });
  }
  function bump(field, n = 1) {
    if (!Session.user || n === 0) return;
    const st = get();
    st[field] = (st[field] || 0) + n;
    DB.set(key(), st);
  }

  // Время слушания: инкремент каждые 15 секунд, пока играет музыка
  setInterval(() => {
    const v = Playback.view();
    if (v && v.playing && Session.user) bump('seconds', 15);
  }, 15000);

  // Счёт треков: на каждый новый трек при проигрывании
  let lastTrack = null;
  Playback.onChange((v) => {
    if (v && v.playing && v.track.id !== lastTrack) {
      lastTrack = v.track.id;
      bump('tracks');
    }
    if (!v) lastTrack = null;
  });

  return {
    get, bump,
    /** Красивое «3 ч 20 мин» / «45 мин». */
    fmt(seconds) {
      const m = Math.round((seconds || 0) / 60);
      if (m < 60) return m + ' мин';
      const ha = Math.floor(m / 60);
      return ha + ' ч ' + (m % 60 ? (m % 60) + ' мин' : '');
    }
  };
})();

/* ============================== ДЕМО-ДАННЫЕ ================================ */

/**
 * Засев демо-мира: аккаунты с паролем 1234 (milo & luna — пара), дружба,
 * комната «Наш уголок» с кодом LOVE26, плейлисты и немного истории чата.
 */
function seedDemo() {
  if (DB.get('wt_seeded_v4')) return;

  const mk = (login, name, avatar, status) => Users.save({
    login, pass: '1234', name, avatar, status, createdAt: Date.now() - 86400000 * 5
  });

  mk('milo', 'Milo', '🦊', 'ловлю волны с тобой 🌊');
  mk('luna', 'Luna', '🐰', 'мой плейлист = мой дневник');
  mk('artem', 'Артём', '🐼', 'lo-fi forever');
  mk('sofia', 'София', '🦉', 'ночная сова');
  mk('lexa', 'Лёха', '🐱', 'это трек? это шедевр');
  ['milo', 'luna', 'artem', 'sofia', 'lexa'].forEach(l => DB.set('wt_friends_' + l, []));

  // Дружба: milo↔luna, milo↔artem, luna↔sofia
  const bond = (a, b) => {
    DB.update('wt_friends_' + a, (l = []) => (l.push(b), l));
    DB.update('wt_friends_' + b, (l = []) => (l.push(a), l));
  };
  bond('milo', 'luna'); bond('milo', 'artem'); bond('luna', 'sofia');
  // Входящая заявка для milo — чтобы было что показать на экране «Друзья»
  DB.set('wt_friend_req_milo', [{ from: 'lexa', ts: Date.now() - 3600000 }]);
  DB.set('wt_friend_out_lexa', ['milo']);

  // Комната пары
  const room = Rooms.save({
    id: 'room_demo1', code: 'LOVE26', name: 'Наш уголок', icon: '💜',
    mood: 'romantic', color: '#8b7cf6', members: ['milo', 'luna'],
    createdBy: 'milo', createdAt: Date.now() - 86400000 * 2
  });
  RoomPlayback.ensure(room);

  // История чата
  const now = Date.now();
  const demoMsgs = [
    { user: 'milo', text: 'Настроение на вечер: «романтика»? 🌙', ts: now - 5400000 },
    { user: 'luna', text: 'Идеально. Добавила пару треков в наш плейлист 💜', ts: now - 5300000 },
    { user: 'milo', text: '🔥', ts: now - 5200000, type: 'reaction' },
    { user: 'luna', text: 'Этот прямо в сердце', ts: now - 5100000 },
    { user: 'luna', text: '❤️', ts: now - 5000000, type: 'reaction' }
  ].map(m => ({ id: uid('msg'), type: 'msg', ...m }));
  demoMsgs.splice(2, 0, { id: uid('sys'), user: 'system', text: 'luna включила волну «Романтика»', ts: now - 5350000, type: 'system' });
  DB.set(ChatStore.key(room.id), demoMsgs);

  // Плейлисты демо-пользователей
  DB.set('wt_playlists_milo', [
    { id: 'pl_demo1', name: 'Наши вечера', trackIds: ['jk-love-mode', 'dy-could-you', 'lk-btp', 'jk-dreams'], createdAt: now - 86400000 },
    { id: 'pl_demo2', name: 'Утро с кофе', trackIds: ['jk-waves', 'lk-better-days'], createdAt: now - 80000000 }
  ]);
  DB.set('wt_playlists_luna', [
    { id: 'pl_demo3', name: 'Ночной город', trackIds: ['ahrix-nova', 'lk-monroe', 'forss-flicker', 'dis-blank'], createdAt: now - 70000000 }
  ]);
  // Совместный плейлист комнаты
  DB.set(Playlists.sharedKey(room.id), {
    id: 'shared_' + room.id, name: 'Наш совместный плейлист',
    trackIds: ['jk-love-mode', 'cartoon-onon', 'jk-dreams'], roomId: room.id, createdAt: now - 60000000
  });

  DB.set('wt_seeded_v4', Date.now());
}
