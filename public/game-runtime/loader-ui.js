/* Prism presentation adapter for the upstream LoaderUI.mount contract.
   Downloading, game initialization, and overlay.hidden belong to the engine. */
window.LoaderUI = (() => {
  const mounted = new WeakMap();
  let sequence = 0;
  const MB = 1048576;
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const clamp = value => Math.min(1, number(value));
  const bytes = value => value >= MB ? `${(value / MB).toFixed(1)} MB` : value >= 1024 ? `${Math.round(value / 1024)} KB` : `${Math.round(value)} B`;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function styles() {
    let link = document.getElementById('prism-loader-styles');
    if (!link) {
      link = document.createElement('link');
      link.id = 'prism-loader-styles';
      link.rel = 'stylesheet';
      // A game's <base> points to its asset CDN. Never resolve this relatively.
      link.href = new URL('/game-runtime/loader-ui.css', location.origin).href;
      document.head.appendChild(link);
    }
  }

  function titleFor(overlay) {
    return String(overlay.dataset.title || document.title || '')
      .replace(/^Unity WebGL Player\s*\|\s*/i, '')
      .replace(/\s*\|\s*55GMS\s*$/i, '').trim() || 'Your game';
  }

  function svgPaint(id) {
    const page = new URL(location.href || '/', location.origin);
    page.hash = id;
    const attribute = page.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Absolute, quoted paint URLs ignore a game's external asset <base>.
    return 'url(&quot;' + attribute + '&quot;)';
  }

  function mount(overlay) {
    if (mounted.has(overlay)) return mounted.get(overlay);
    styles();
    overlay.classList.add('prism-loader');
    overlay.removeAttribute('aria-live');
    overlay.removeAttribute('aria-atomic');
    overlay.setAttribute('role', 'region');
    overlay.setAttribute('aria-label', 'Game loading');
    try {
      const preferences = JSON.parse(localStorage.getItem('prism.settings') || '{}');
      if (preferences?.motion === false) overlay.dataset.motion = 'reduced';
    } catch { /* Loading works when browser storage is unavailable. */ }

    const card = element('div', 'prism-loader-card');
    const mark = element('div', 'prism-loader-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = `<svg viewBox="0 0 260 184" xmlns="http://www.w3.org/2000/svg" focusable="false">
      <defs>
        <linearGradient id="prism-face-${sequence}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4d88e"/><stop offset="1" stop-color="#9b7130"/></linearGradient>
        <linearGradient id="prism-shadow-${sequence}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9d7739"/><stop offset="1" stop-color="#3e2b15"/></linearGradient>
        <linearGradient id="prism-ray-${sequence}"><stop stop-color="#f5deb0" stop-opacity="0"/><stop offset="1" stop-color="#f5deb0" stop-opacity=".8"/></linearGradient>
      </defs>
      <ellipse cx="130" cy="164" rx="103" ry="9" fill="#c9a84c" opacity=".07"/>
      <path d="M9 51 118 56" stroke="${svgPaint(`prism-ray-${sequence}`)}" stroke-width="1.5"/>
      <g class="prism-loader-rays" fill="none" stroke-width="1.2">
        <path d="m137 65 111 13" stroke="#efc76a" opacity=".55"/>
        <path d="m137 65 110 30" stroke="#e9a05c" opacity=".4"/>
        <path d="m137 65 104 49" stroke="#a6bb82" opacity=".35"/>
        <path d="m137 65 93 68" stroke="#77b0be" opacity=".3"/>
      </g>
      <path d="M130 25 36 160 135 139Z" fill="${svgPaint(`prism-face-${sequence}`)}" stroke="#dec17d" stroke-width=".8"/>
      <path d="m130 25 94 135-89-21Z" fill="${svgPaint(`prism-shadow-${sequence}`)}" stroke="#aa8445" stroke-width=".8"/>
      <path d="M36 160h188l-89-21Z" fill="#725026" opacity=".5"/>
      <g stroke="#6f4b24" stroke-width=".7" opacity=".4"><path d="m113 50 34 0M96 75h68M79 100h102M62 125h136M46 149h55"/><path d="m114 51-5 24m17 0-4 25m-20 0-4 25m32 0-4 16M83 125l-5 25"/></g>
      <path d="m130 25 5 114" stroke="#ffe2a0" stroke-width="1" opacity=".7"/>
      <circle class="prism-loader-tip" cx="130" cy="25" r="3" fill="#fff1c5"/>
      <path d="M130 11v7m0 14v7m-14-14h7m14 0h7" stroke="#e4bf69" opacity=".35"/>
    </svg>`;
    const brand = element('p', 'prism-loader-brand', 'PRISM');
    const eyebrow = element('p', 'prism-loader-eyebrow', 'THE NEXT WORLD AWAITS');
    const title = element('h1', 'prism-loader-title', titleFor(overlay));
    title.id = `prism-game-title-${++sequence}`;
    overlay.setAttribute('aria-labelledby', title.id);
    const progress = element('div', 'prism-loader-progress');
    const track = element('div', 'prism-loader-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'Game download progress');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const fill = element('span', 'prism-loader-fill'); track.appendChild(fill);
    const counters = element('div', 'prism-loader-counters'); counters.setAttribute('aria-hidden', 'true');
    const amount = element('span', 'prism-loader-amount');
    const percent = element('span', 'prism-loader-percent'); counters.append(amount, percent);
    const status = element('p', 'prism-loader-status', 'Preparing your game…');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    const error = element('p', 'prism-loader-error', 'A game file could not be loaded. Retry to download it again.'); error.hidden = true;
    const retry = element('button', 'prism-loader-retry', 'RETRY GAME'); retry.type = 'button'; retry.hidden = true;
    retry.addEventListener('click', () => location.reload());
    progress.append(track, counters); card.append(mark, brand, eyebrow, title, progress, status, error, retry);
    overlay.replaceChildren(card);
    let failed = false;

    function state(name, message) {
      overlay.dataset.state = name;
      if (status.textContent !== message) status.textContent = message;
    }
    function indeterminate(message) {
      track.removeAttribute('aria-valuenow');
      track.setAttribute('aria-valuetext', 'Download progress is not yet known');
      percent.textContent = '';
      state('loading', message);
    }
    function determinate(value) {
      const fraction = clamp(value);
      const whole = Math.floor(fraction * 100);
      fill.style.setProperty('--prism-progress', String(fraction));
      track.setAttribute('aria-valuenow', String(whole));
      track.setAttribute('aria-valuetext', `${whole}% downloaded`);
      percent.textContent = `${whole}%`;
    }
    function set(loadedValue, totalValue, done = false) {
      if (failed) return;
      const loaded = number(loadedValue), total = number(totalValue);
      if (done) {
        determinate(1);
        amount.textContent = total > 0 ? `${bytes(total)} downloaded` : loaded > 0 ? `${bytes(loaded)} downloaded` : '';
        state('starting', 'Starting your game…');
      } else if (total > 0) {
        determinate(loaded / total);
        amount.textContent = `${bytes(Math.min(loaded, total))} of ${bytes(total)}`;
        state('downloading', loaded > 0 ? 'Downloading game files…' : 'Preparing your game…');
      } else {
        amount.textContent = loaded > 0 ? `${bytes(loaded)} downloaded` : '';
        indeterminate(loaded > 0 ? 'Downloading game files…' : 'Preparing your game…');
      }
    }
    function ratio(value, done = false) {
      if (failed) return;
      amount.textContent = '';
      if (done) { determinate(1); state('starting', 'Starting your game…'); }
      else if (number(value) > 0) { determinate(value); state('downloading', 'Downloading game files…'); }
      else indeterminate('Preparing your game…');
    }
    function busy(text = 'Loading your game…') {
      if (failed) return;
      amount.textContent = '';
      indeterminate(String(text || 'Loading your game…'));
    }
    function fail() {
      failed = true;
      state('error', 'Your game could not load');
      progress.hidden = true; error.hidden = false; retry.hidden = false;
    }
    const api = { set, ratio, busy, fail };
    mounted.set(overlay, api);
    set(0, 0, false);
    return api;
  }
  return { mount };
})();
