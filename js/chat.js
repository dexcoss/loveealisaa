/* ============================================================================
 * WaveTogether — chat.js
 * Чат комнаты в реальном времени:
 *  - текстовые сообщения + эмодзи-полоса;
 *  - реакции на треки ❤️🔥👏😮 — улетают вверх поверх обложки у обоих;
 *  - системные записи (кто вошёл, что включили);
 *  - персистентность в localStorage + мгновенная доставка через Bus
 *    между вкладками.
 * ========================================================================== */
'use strict';

/* ---------------------------- ХРАНИЛИЩЕ ЧАТА ----------------------------- */

const ChatStore = {
  key: (roomId) => 'wt_chat_' + roomId,
  /** Список сообщений комнаты (массив, до 250 шт). */
  list(roomId) { return DB.get(this.key(roomId), []); },
  /** Добавить сообщение. Не рассылает Bus — это делает Chat. */
  append(roomId, msg) {
    const list = this.list(roomId);
    list.push(msg);
    while (list.length > 250) list.shift();
    DB.set(this.key(roomId), list);
    return msg;
  },
  /** Отметить прочитанным (для будущих бейджей). */
  markRead(roomId, user) {
    DB.set('wt_chat_read_' + roomId + '_' + user, Date.now());
  }
};

/* ------------------- ЛЕТАЮЩИЕ РЕАКЦИИ ПОВЕРХ ОБЛОЖКИ --------------------- */

const ReactionFX = {
  /** Запустить эмодзи вверх от элемента (обложки). Emoji × n. */
  fly(emoji, anchor) {
    if (!anchor || !anchor.isConnected) return;
    let layer = qs('.fx-layer', anchor);
    if (!layer) {
      layer = h('div', { class: 'fx-layer' });
      anchor.append(layer);
    }
    if (qs('.fx-fly', layer)) { /* не спамим: не больше одной волны раз в миг */ }
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const node = h('span', {
        class: 'fx-fly',
        text: emoji,
        style: {
          left: (22 + Math.random() * 56) + '%',
          animationDelay: (Math.random() * .5) + 's',
          '--fx-drift': ((Math.random() - .5) * 90).toFixed(0) + 'px',
          '--fx-rot': ((Math.random() - .5) * 40).toFixed(0) + 'deg',
          fontSize: (21 + Math.random() * 13).toFixed(0) + 'px'
        }
      });
      layer.append(node);
      setTimeout(() => node.remove(), 3200);
    }
  }
};

/* ------------------------------- МОДУЛЬ ЧАТА ------------------------------ */

const Chat = (() => {
  /** Активные панели: roomId → {listEl, unsub} */
  const panels = new Map();

  /** Отправка текстового сообщения. */
  function sendText(roomId, text) {
    text = (text || '').trim();
    if (!text || !Session.user) return;
    if (text.length > 600) text = text.slice(0, 600);
    const msg = { id: uid('msg'), user: Session.user, text, ts: Date.now(), type: 'msg' };
    ChatStore.append(roomId, msg);
    Bus.send('chat', { roomId, msg });
  }

  /** Реакция на текущий трек (короткое сообщение + анимация). */
  function sendReaction(roomId, emoji) {
    const v = Playback.view();
    const msg = {
      id: uid('rxn'), user: Session.user, text: emoji, ts: Date.now(), type: 'reaction',
      trackId: v && v.track ? v.track.id : null
    };
    ChatStore.append(roomId, msg);
    Bus.send('chat', { roomId, msg });
    if (typeof Stats !== 'undefined') Stats.bump('reactions', 1);
    // локальная анимация сразу (своим сообщением мы тоже радуемся)
    ReactionFX.fly(emoji, qs('.stage__coverbox'));
  }

  /** Системное сообщение (вход в комнату, смена волны и т.п.). Пишет только инициатор. */
  function system(roomId, text) {
    const msg = { id: uid('sys'), user: Session.user || 'system', text, ts: Date.now(), type: 'system' };
    ChatStore.append(roomId, msg);
    Bus.send('chat', { roomId, msg });
  }

  /** Рендер одного сообщения. */
  function msgEl(msg) {
    if (msg.type === 'system') {
      return h('div', { class: 'msg msg--system' }, h('span', { text: msg.text }));
    }
    const me = msg.user === Session.user;
    if (msg.type === 'reaction') {
      return h('div', { class: 'msg msg--reaction' },
        h('div', { class: 'msg__bubble' },
          h('span', { html: esc(msg.user === Session.user ? 'Вы' : esc(msg.user)) + ' ' }),
          h('big', { text: msg.text }),
          h('span', { text: ' ' + timeAgo(msg.ts) })
        ));
    }
    const u = typeof Users !== 'undefined' ? Users.get(msg.user) : null;
    return h('div', { class: 'msg' + (me ? ' msg--me' : '') },
      typeof avatarEl === 'function' ? avatarEl(msg.user, 30) : null,
      h('div', { class: 'msg__body' },
        h('div', { class: 'msg__who' },
          h('span', { text: me ? 'Вы' : (u ? u.name || msg.user : msg.user) }),
          h('span', { text: timeAgo(msg.ts) })),
        h('div', { class: 'msg__bubble', text: msg.text })));
  }

  /**
   * Смонтировать панель чата в контейнер.
   * @param {HTMLElement} root — .chat карточка, внутрь всё построим
   * @param {object} room
   */
  function mount(root, room) {
    unmount(room.id);
    root.classList.add('chat', 'card');
    root.innerHTML = '';

    const partner = room.members.find(m => m !== Session.user);
    const headName = h('span', { text: partner ? 'Чат с ' + partner : 'Чат комнаты' });

    const listEl = h('div', { class: 'chat__list' });
    ChatStore.list(room.id).forEach(m => listEl.append(msgEl(m)));
    ChatStore.markRead(room.id, Session.user);

    const scrollDown = (smooth = true) =>
      listEl.scrollTo({ top: listEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });

    // Быстрые эмодзи
    const EMOJI = ['😂', '😍', '😮', '🎉', '👍', '😭', '🙌', '🤝'];
    const emojiRow = h('div', { class: 'chat__emoji' },
      EMOJI.map(e => h('button', {
        text: e, title: 'Отправить ' + e,
        onclick: () => sendText(room.id, e)
      })));

    const input = h('input', {
      class: 'input', placeholder: 'Сообщение…', maxlength: 600,
      onkeydown: (e) => { if (e.key === 'Enter') { sendText(room.id, input.value); input.value = ''; } }
    });
    const sendBtn = h('button', {
      class: 'btn-icon btn-icon--main', title: 'Отправить', html: icon('send', 19),
      onclick: () => { sendText(room.id, input.value); input.value = ''; input.focus(); }
    });

    root.append(
      h('div', { class: 'chat__head' },
        h('span', { html: icon('chat', 19) }),
        h('div', {}, h('b', { text: 'Чат' }), h('br'), headName)),
      listEl, emojiRow,
      h('div', { class: 'chat__input' }, input, sendBtn)
    );
    scrollDown(false);

    // Доставка новых сообщений (и с этой вкладки — Bus лупит и локально)
    const unsub = Bus.on('chat', ({ roomId, msg }) => {
      if (roomId !== room.id) return;
      const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120;
      listEl.append(msgEl(msg));
      if (nearBottom || msg.user === Session.user) scrollDown();
      ChatStore.markRead(room.id, Session.user);

      // Реакция партнёра → летит поверх обложки
      if (msg.type === 'reaction' && msg.user !== Session.user) {
        ReactionFX.fly(msg.text, qs('.stage__coverbox'));
      }
    });

    panels.set(room.id, { root, unsub });
  }

  function unmount(roomId) {
    const p = panels.get(roomId);
    if (p) { p.unsub(); panels.delete(roomId); }
  }

  return { mount, unmount, sendText, sendReaction, system };
})();

// Примечание: отписка панелей чата происходит централизованно —
// экран комнаты регистрирует Chat.unmount в своём screenCleanup (app.js).
