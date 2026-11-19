// public/js/bloom-bear.js
// Bloom Bear: sleeping avatar that wakes on hover and opens a chat about the current plant.

(function () {
  var root = document.getElementById('bear-chat');
  if (!root) return;

  // ---- Avatar images (edit names/extension here if yours differ) ----
  var BASE = root.dataset.avatarBase || '/assets/avatar/';
  var IMAGES = {
    offline:  BASE + 'BloomBear-Offline.png',
    asleep:   BASE + 'BloomBear-Asleep.png',
    ready:    BASE + 'BloomBear-Ready.png',
    thinking: BASE + 'BloomBear-Thinking.png',
    talking:  BASE + 'BloomBear-Talking.png'
  };

  var btn = document.getElementById('bear-btn');
  var img = document.getElementById('bear-img');
  var panel = document.getElementById('bear-panel');
  var closeBtn = document.getElementById('bear-close');
  var list = document.getElementById('bear-messages');
  var form = document.getElementById('bear-form');
  var input = document.getElementById('bear-input');
  var sendBtn = document.getElementById('bear-send');

  var plantName = root.dataset.plantName || 'this plant';
  var plant = {
    commonName: root.dataset.plantName || '',
    scientificName: root.dataset.scientific || '',
    family: root.dataset.family || '',
    commonType: root.dataset.type || '',
    iucnStatus: root.dataset.iucn || ''
  };

  var history = []; // {role: 'user' | 'model', text}
  var isOpen = false;
  var busy = false;
  var offline = false;
  var talkTimer = null;

  // Preload so state changes never flicker
  Object.keys(IMAGES).forEach(function (k) { var p = new Image(); p.src = IMAGES[k]; });

  function setState(state) {
    img.src = IMAGES[state];
    root.dataset.state = state;
  }

  function restingState() {
    if (offline) return 'offline';
    return isOpen ? 'ready' : 'asleep';
  }

  // ---- Hover: asleep -> ready (only while closed) ----
  btn.addEventListener('mouseenter', function () {
    if (!isOpen && !offline) setState('ready');
  });
  btn.addEventListener('focus', function () {
    if (!isOpen && !offline) setState('ready');
  });
  btn.addEventListener('mouseleave', function () {
    if (!isOpen) setState(restingState());
  });
  btn.addEventListener('blur', function () {
    if (!isOpen) setState(restingState());
  });

  // ---- Open / close ----
  function openChat() {
    isOpen = true;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    if (!list.children.length) greet();
    setState(restingState());
    input.focus();
  }

  function closeChat() {
    isOpen = false;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
    clearTimeout(talkTimer);
    setState(restingState());
  }

  btn.addEventListener('click', function () {
    if (isOpen) closeChat(); else openChat();
  });
  closeBtn.addEventListener('click', closeChat);

  // ---- Messages ----
  function addMessage(role, text) {
    var el = document.createElement('div');
    el.className = 'bear-msg ' + (role === 'user' ? 'bear-msg-user' : 'bear-msg-bear');
    el.textContent = text; // textContent keeps it safe from injected HTML
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
    return el;
  }

  function talkFor(text) {
    // Talking while the reply is "spoken", scaled to its length
    var ms = Math.min(4500, Math.max(1500, text.length * 35));
    setState('talking');
    clearTimeout(talkTimer);
    talkTimer = setTimeout(function () { setState(restingState()); }, ms);
  }

  function greet() {
    var text = 'Hi! What do you want to know about ' + plantName + '?';
    addMessage('bear', text);
    talkFor(text);
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value;
    sendBtn.disabled = value;
  }

  // ---- Send ----
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;

    input.value = '';
    addMessage('user', text);
    setBusy(true);
    setState('thinking');
    var typing = addMessage('bear', '…');
    typing.classList.add('bear-typing');

    fetch('/api/plant-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history, plant: plant })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        typing.remove();
        if (!r.ok || !r.data.reply) throw new Error((r.data && r.data.error) || 'error');
        offline = false;
        history.push({ role: 'user', text: text });
        history.push({ role: 'model', text: r.data.reply });
        addMessage('bear', r.data.reply);
        talkFor(r.data.reply);
      })
      .catch(function () {
        typing.remove();
        offline = true;
        addMessage('bear', "I can't reach my thinking cap right now. Try again in a bit!");
        setState('offline');
      })
      .then(function () {
        setBusy(false);
        if (!offline) input.focus();
        // let the bear recover from offline on the next attempt
        offline = false;
      });
  });
})();
