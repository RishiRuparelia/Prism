(() => {
  const $ = id => document.getElementById(id);
  const rooms = {
    lounge: { title: 'THE LOUNGE', description: 'A place to meet between worlds.' },
    gaming: { title: 'GAMING', description: 'Find a game. Share a discovery.' },
    'movie-night': { title: 'MOVIE NIGHT', description: 'Good films deserve good company.' },
  };
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }
  function prefs() {
    const value = read('prism.settings', {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function displayName() {
    const name = prefs().name;
    return typeof name === 'string' && name.trim() ? name.trim().slice(0, 24) : 'Explorer';
  }
  function saveName() {
    const settings = prefs();
    settings.name = $('chat-name').value.trim();
    try { localStorage.setItem('prism.settings', JSON.stringify(settings)); } catch {}
  }
  function newClientId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      }
    } catch {}
    return 'client-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  let clientId;
  try {
    clientId = localStorage.getItem('prism.chatClientId');
    if (!clientId || !/^[a-zA-Z0-9_-]{8,80}$/.test(clientId)) {
      clientId = newClientId();
      localStorage.setItem('prism.chatClientId', clientId);
    }
  } catch { clientId = newClientId(); }

  let room = new URLSearchParams(location.search).get('room') || 'lounge';
  if (!rooms[room]) room = 'lounge';
  let fingerprint = '', pending = false, generation = 0, sequence = 0, initial = true;
  let activeRefresh = null, currentMessages = [], sendError = null;
  // Keep confirmed writes visible until a subsequent read includes them.
  const confirmed = new Map();
  $('chat-name').value = displayName();
  function connection(text, state = '') {
    $('connection-status').textContent = text;
    $('connection-status').className = 'connection-status ' + state;
  }
  function notice(text) { $('chat-status').textContent = text; }
  function controller() { return typeof AbortController === 'function' ? new AbortController() : null; }

  async function requestJson(url, options = {}, requestController = controller(), timeoutMs = 12000) {
    let timer;
    const operation = (async () => {
      const response = await fetch(url, { ...options, ...(requestController ? { signal: requestController.signal } : {}) });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); }
      catch {
        const signIn = response.status === 401 || response.status === 403 || /sign.?in|log.?in|authentication required/i.test(raw.slice(0, 4000));
        if (signIn) throw new Error('Sign in or reopen Prism to join the chat. Your draft is still here.');
        throw new Error('Chat returned a page instead of message data. Reload Prism and try again.');
      }
      if (!response.ok) throw new Error(data?.error || `Chat is unavailable (${response.status}). Try again shortly.`);
      return data;
    })();
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('The chat connection timed out. Try again shortly.'));
        requestController?.abort();
      }, timeoutMs);
    });
    try { return await Promise.race([operation, timeout]); }
    finally { clearTimeout(timer); }
  }
  function validMessage(message) {
    return message && typeof message.id === 'string' && typeof message.name === 'string' && typeof message.text === 'string' && Number.isFinite(message.createdAt);
  }
  function mergeMessages(messages, acknowledge = false) {
    const merged = new Map(messages.filter(validMessage).map(message => [message.id, message]));
    for (const [id, entry] of confirmed) {
      if (entry.room !== room) continue;
      if (merged.has(id)) { if (acknowledge) confirmed.delete(id); }
      else merged.set(id, entry.message);
    }
    return [...merged.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).slice(-50);
  }
  function renderMessages(messages) {
    const wrap = $('chat-messages');
    const next = messages.map(message => message.id).join('|');
    if (next === fingerprint && !initial) return;
    const nearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 100;
    const previous = new Set([...wrap.querySelectorAll('[data-id]')].map(element => element.dataset.id));
    wrap.replaceChildren();
    fingerprint = next;
    if (!messages.length) {
      const empty = document.createElement('div'); empty.className = 'chat-empty';
      const h = document.createElement('h3'); h.textContent = 'THE ROOM IS YOURS';
      const p = document.createElement('p'); p.textContent = 'No messages yet. Start the conversation.';
      empty.append(h, p); wrap.append(empty);
    }
    for (const message of messages) {
      const article = document.createElement('article');
      article.className = 'chat-message' + (!previous.has(message.id) && !initial ? ' new-message' : '');
      article.dataset.id = message.id;
      const avatar = document.createElement('div'); avatar.className = 'chat-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = (message.name || '?').slice(0, 1).toUpperCase();
      const body = document.createElement('div'), head = document.createElement('div'); head.className = 'chat-message-head';
      const name = document.createElement('span'); name.className = 'chat-author'; name.textContent = message.name;
      const date = new Date(message.createdAt), time = document.createElement('time'); time.className = 'chat-time';
      if (!Number.isNaN(date.getTime())) { time.dateTime = date.toISOString(); time.textContent = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); time.title = date.toLocaleString(); }
      const text = document.createElement('p'); text.className = 'chat-text'; text.textContent = message.text;
      head.append(name, time); body.append(head, text); article.append(avatar, body); wrap.append(article);
    }
    if (nearBottom || initial) wrap.scrollTop = wrap.scrollHeight;
    initial = false;
  }
  function showConnected() {
    if (sendError?.room === room) {
      connection('CANNOT SEND', 'error');
      notice(sendError.message);
    } else {
      connection('CONNECTED', 'online');
      if (!pending) notice('');
    }
  }
  async function refresh({ force = false } = {}) {
    if (document.hidden || activeRefresh && !force) return;
    if (activeRefresh) activeRefresh.controller?.abort();
    const token = generation, requestRoom = room, requestSequence = ++sequence, requestController = controller();
    activeRefresh = { sequence: requestSequence, controller: requestController };
    try {
      const data = await requestJson('/api/chat?room=' + encodeURIComponent(requestRoom), { cache: 'no-store' }, requestController);
      if (token !== generation || activeRefresh?.sequence !== requestSequence) return;
      if (!Array.isArray(data.messages)) throw new Error('Chat returned an unexpected response.');
      currentMessages = mergeMessages(data.messages, true);
      renderMessages(currentMessages);
      showConnected();
    } catch (error) {
      if (token !== generation || activeRefresh?.sequence !== requestSequence) return;
      connection('RECONNECTING', 'error');
      notice(error.message || 'Chat could not load. Trying again shortly.');
      if (initial) {
        const wrap = $('chat-messages'); wrap.replaceChildren();
        const empty = document.createElement('div'); empty.className = 'chat-empty';
        const h = document.createElement('h3'); h.textContent = 'CONNECTING TO THE ROOM';
        const p = document.createElement('p'); p.textContent = 'Messages will appear when the connection is ready.';
        empty.append(h, p); wrap.append(empty);
      }
    } finally {
      // A superseded request must never unlock a newer in-flight request.
      if (activeRefresh?.sequence === requestSequence) activeRefresh = null;
    }
  }
  function selectRoom(value) {
    if (!rooms[value]) return;
    activeRefresh?.controller?.abort(); activeRefresh = null;
    room = value; generation++; fingerprint = ''; initial = true; currentMessages = [];
    $('room-title').textContent = rooms[room].title; $('room-description').textContent = rooms[room].description;
    document.querySelectorAll('.room-btn').forEach(button => { const active = button.dataset.room === room; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    const url = new URL(location.href); url.searchParams.set('room', room); history.replaceState(null, '', url);
    $('chat-messages').replaceChildren();
    const loadingText = document.createElement('p'); loadingText.className = 'catalog-loading'; loadingText.textContent = 'ENTERING THE ROOM…'; $('chat-messages').append(loadingText);
    connection('CONNECTING'); notice('');
    refresh();
  }
  $('chat-compose').addEventListener('submit', async event => {
    event.preventDefault(); if (pending) return;
    const text = $('message-input').value.trim(), name = $('chat-name').value.trim();
    if (!name || name.length > 24) { notice('Choose a name between 1 and 24 characters.'); $('chat-name').focus(); return; }
    if (!text || text.length > 1000) { notice('Write a message between 1 and 1,000 characters.'); return; }
    pending = true; saveName(); $('send-message').disabled = true; notice('Sending…');
    const sendRoom = room, sendGeneration = generation;
    try {
      const data = await requestJson('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: sendRoom, name, text, clientId }) }, controller(), 15000);
      if (!validMessage(data.message)) throw new Error('Chat did not confirm your message. Check the room before retrying.');
      confirmed.set(data.message.id, { room: sendRoom, message: data.message });
      if (sendRoom === room && sendGeneration === generation) {
        sendError = null;
        if ($('message-input').value.trim() === text) $('message-input').value = '';
        updateCount();
        currentMessages = mergeMessages([...currentMessages, data.message]);
        renderMessages(currentMessages);
        connection('CONNECTED', 'online'); notice('');
        $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
        // Refresh immediately even if a previous poll was still running.
        refresh({ force: true });
      }
    } catch (error) {
      sendError = { room: sendRoom, message: error.message || 'Your message could not be sent. Your draft is still here.' };
      if (sendRoom === room && sendGeneration === generation) { connection('CANNOT SEND', 'error'); notice(sendError.message); }
    } finally {
      pending = false; $('send-message').disabled = false;
      if (sendRoom === room && sendGeneration === generation) $('message-input').focus();
    }
  });
  function updateCount() { $('character-count').textContent = $('message-input').value.length + ' / 1000'; }
  $('message-input').addEventListener('input', updateCount);
  $('message-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chat-compose').requestSubmit(); } });
  $('chat-name').addEventListener('change', saveName);
  document.querySelectorAll('.room-btn').forEach(button => button.addEventListener('click', () => selectRoom(button.dataset.room)));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh({ force: true }); });
  window.addEventListener('storage', event => { if (event.key === 'prism.settings') $('chat-name').value = displayName(); });
  selectRoom(room);
  setInterval(refresh, 3500);
})();
