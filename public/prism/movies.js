import { proxyLandingUrl, proxyPreference, prepareMovieProxy, proxiedVideoUrl, embeddedFailureMessage } from '/prism/movie-playback.js';
import { isSeries, normalizeEpisodes, seasonsFor, initialEpisode, adjacentEpisode, episodeLabel, episodeReleased, seriesPlayerUrl } from '/prism/series-state.js';

(() => {
  const $ = id => document.getElementById(id);
  let catalog = [], classics = [], seriesCatalog = [], seriesError = '';
  let contentType = new URLSearchParams(location.search).get('type') === 'series' ? 'series' : 'movie';
  let remoteResults = null, category = 'All', query = '', sort = 'popular', requestId = 0;
  let selected = null, selectedEpisode = null, selectedSeason = null, metadataError = '', metadataLoading = false;
  let returnFocus = null, playRequestId = 0, detailRequestId = 0;
  let saved = new Set(read('prism.watchlist', []));
  let savedMovies = read('prism.watchlistMovies', {});
  const metadataRequests = new Map();
  let playerWatchTimer = null;
  function clearPlayerWatch() { if (playerWatchTimer) clearInterval(playerWatchTimer); playerWatchTimer = null; }
  function watchPlayer(frame, token) {
    clearPlayerWatch();
    let passes = 0;
    function inspectWindow(target, depth = 0) {
      if (depth > 2) return '';
      try {
        const doc = target.document;
        let text = (doc?.body?.innerText || '').slice(0, 10000);
        for (const child of [...(doc?.querySelectorAll('iframe') || [])].slice(0, 5)) text += '\n' + inspectWindow(child.contentWindow, depth + 1);
        return text;
      } catch { return ''; }
    }
    const inspect = () => {
      if (token !== playRequestId || !frame.isConnected || ++passes > 12) { clearPlayerWatch(); return; }
      const message = embeddedFailureMessage(inspectWindow(frame.contentWindow));
      if (message) { $('playback-status').textContent = message; clearPlayerWatch(); }
    };
    playerWatchTimer = setInterval(inspect, 2500);
    frame.addEventListener('load', inspect);
  }

  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function status(message, error = false) { $('catalog-status').textContent = message; $('catalog-status').classList.toggle('media-error', error); }
  function defaultStatus() { return contentType === 'series' ? 'Choose a show, then explore its seasons and episodes.' : 'Browse the collection, or search any movie title.'; }
  function normalize(meta, fallbackType = contentType) {
    const genres = meta.genres || meta.genre || [];
    const type = isSeries(meta) || fallbackType === 'series' ? 'series' : 'movie';
    return {
      id: meta.id || meta.imdb_id, title: meta.name || meta.title,
      type, year: String(meta.releaseInfo || meta.year || '').slice(0, 4), genre: genres[0] || (type === 'series' ? 'TV Show' : 'Movie'), genres,
      poster: meta.poster, backdrop: meta.background || meta.backdrop || meta.poster,
      description: meta.description || '', rating: Number(meta.imdbRating ?? meta.rating) || null,
      tmdbId: meta.moviedb_id || meta.tmdbId || null, runtime: meta.runtime || '', source: 'Cinemeta',
      ...(Array.isArray(meta.videos) ? { episodes: normalizeEpisodes(meta.videos), episodesLoaded: true } : {}),
    };
  }
  function baseCatalog() { return contentType === 'series' ? seriesCatalog : [...catalog, ...classics]; }
  function matching() {
    const source = remoteResults ?? [...new Map([...baseCatalog(), ...Object.values(savedMovies).filter(item => (isSeries(item) ? 'series' : 'movie') === contentType)].map(item => [item.id, item])).values()];
    let list = [...source];
    if (category === 'Watchlist') list = list.filter(item => saved.has(item.id));
    else if (category === 'Classics') list = list.filter(item => item.src);
    else if (category !== 'All') list = list.filter(item => (item.genres || [item.genre]).includes(category));
    if (query && remoteResults === null) list = list.filter(item => (item.title + ' ' + item.description + ' ' + (item.genres || []).join(' ')).toLowerCase().includes(query.toLowerCase()));
    if (sort === 'az') list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sort === 'year') list.sort((a, b) => Number(b.year) - Number(a.year));
    return list;
  }
  function pills() {
    const wrap = $('category-pills'); wrap.replaceChildren();
    const names = ['All', 'Action', 'Adventure', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', ...(contentType === 'movie' ? ['Classics'] : ['Animation']), 'Watchlist'];
    for (const name of names) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cat-pill' + (name === category ? ' active' : ''); button.textContent = name; button.setAttribute('aria-pressed', String(name === category));
      button.addEventListener('click', () => { category = name; pills(); render(); }); wrap.append(button);
    }
  }
  function placeholder(title) { const div = document.createElement('div'); div.className = 'movie-placeholder'; div.textContent = title; return div; }
  function image(item, className) {
    const img = document.createElement('img'); img.src = item.poster; img.alt = item.title + ' poster'; img.className = className || ''; img.loading = 'lazy';
    img.addEventListener('error', () => { if (item.remotePoster && img.src !== item.remotePoster) { img.src = item.remotePoster; return; } img.replaceWith(placeholder(item.title)); }, { once: true }); return img;
  }
  function toggleSaved(item) {
    if (saved.has(item.id)) { saved.delete(item.id); delete savedMovies[item.id]; }
    else { saved.add(item.id); const { episodes, ...summary } = item; savedMovies[item.id] = { ...summary, episodesLoaded: false }; }
    write('prism.watchlist', [...saved]); write('prism.watchlistMovies', savedMovies); render();
    if (selected) $('save-movie').textContent = saved.has(selected.id) ? 'SAVED TO WATCHLIST' : 'SAVE TO WATCHLIST';
  }
  function card(item, index) {
    const wrap = document.createElement('article'); wrap.className = 'game-card movie-card'; wrap.style.animationDelay = Math.min(index * .025, .35) + 's';
    const link = document.createElement('a'); link.href = '#' + encodeURIComponent(item.id); link.style.cssText = 'color:inherit;text-decoration:none;display:flex;flex-direction:column;flex:1'; link.setAttribute('aria-label', 'View ' + item.title); link.addEventListener('click', event => { event.preventDefault(); show(item); });
    const thumb = document.createElement('div'); thumb.className = 'card-thumb'; thumb.append(image(item));
    const play = document.createElement('div'); play.className = 'play-btn'; play.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="#0a0805" aria-hidden="true"><path d="M4 2l10 6-10 6V2z"/></svg>'; thumb.append(play);
    const info = document.createElement('div'); info.className = 'card-info'; const title = document.createElement('h2'); title.className = 'card-title'; title.textContent = item.title;
    const meta = document.createElement('div'); meta.className = 'card-category'; const year = document.createElement('span'); year.textContent = (item.year || '') + ' · ' + (isSeries(item) ? 'TV · ' : '') + item.genre; meta.append(year);
    if (item.rating) { const rating = document.createElement('span'); rating.className = 'movie-rating'; rating.textContent = '★ ' + Number(item.rating).toFixed(1); meta.append(rating); }
    info.append(title, meta); link.append(thumb, info);
    const save = document.createElement('button'); save.type = 'button'; save.className = 'movie-save' + (saved.has(item.id) ? ' saved' : ''); save.textContent = saved.has(item.id) ? '✓' : '+'; save.setAttribute('aria-label', (saved.has(item.id) ? 'Remove ' : 'Save ') + item.title + (saved.has(item.id) ? ' from watchlist' : ' to watchlist')); save.setAttribute('aria-pressed', String(saved.has(item.id))); save.addEventListener('click', () => toggleSaved(item));
    wrap.append(link, save); return wrap;
  }
  function render() {
    const list = matching(), grid = $('main-grid'); grid.replaceChildren();
    $('movie-count').textContent = contentType === 'series' ? `${list.length} titles · ${seriesCatalog.length} TV shows` : `${list.length} titles · ${catalog.length} movies + ${classics.length} classics`;
    $('all-label').textContent = query ? `Results for “${query}”` : category === 'All' ? (contentType === 'series' ? 'Explore TV shows' : 'Explore the collection') : category;
    $('movie-hero').hidden = Boolean(query || category !== 'All' || !baseCatalog().length);
    if (!list.length) {
      const empty = document.createElement('div'); empty.className = 'empty-media'; const title = document.createElement('h2'); title.textContent = category === 'Watchlist' ? 'YOUR NEXT WATCH AWAITS' : 'NO TITLES FOUND'; const text = document.createElement('p'); text.textContent = category === 'Watchlist' ? 'Save a title with the + button to keep it here.' : seriesError && contentType === 'series' ? 'TV shows could not load. Try again or search for a show.' : 'Try another title, genre, or search term.'; empty.append(title, text);
      if (seriesError && contentType === 'series') { const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'gold-btn ghost-btn'; retry.textContent = 'TRY AGAIN'; retry.addEventListener('click', loadSeriesCatalog); empty.append(retry); } grid.append(empty);
    } else list.forEach((item, index) => grid.append(card(item, index)));
  }
  function hero() {
    const item = contentType === 'series' ? seriesCatalog.find(item => item.id === 'tt0121955') || seriesCatalog[0] : catalog.find(item => /project hail mary/i.test(item.title)) || catalog.find(item => Number(item.rating) >= 7.5 && item.backdrop) || catalog[0];
    if (!item) { $('movie-hero').hidden = true; return; }
    $('hero-image').src = item.backdrop; $('hero-title').textContent = item.title; $('hero-description').textContent = item.description; $('hero-meta').textContent = [item.year, ...(item.genres || []).slice(0, 2), item.rating ? '★ ' + item.rating : ''].filter(Boolean).join('   ·   ');
    $('hero-view').textContent = contentType === 'series' ? 'EXPLORE EPISODES →' : 'EXPLORE FILM →'; $('hero-view').onclick = () => show(item);
  }
  function switchType(value) {
    contentType = value; requestId++; query = ''; remoteResults = null; category = 'All'; $('search-input').value = '';
    $('search-input').placeholder = value === 'series' ? 'Search TV shows…' : 'Search movies…'; $('search-input').setAttribute('aria-label', value === 'series' ? 'Search TV shows' : 'Search movies');
    document.querySelectorAll('[data-media-type]').forEach(button => { const active = button.dataset.mediaType === value; button.setAttribute('aria-selected', String(active)); button.classList.toggle('active', active); });
    const url = new URL(location.href); url.searchParams.set('type', value); history.replaceState(null, '', url); pills(); hero(); render(); status(seriesError && value === 'series' ? seriesError : defaultStatus(), Boolean(seriesError && value === 'series'));
  }
  function close() { clearPlayerWatch(); playRequestId++; detailRequestId++; const dialog = $('movie-dialog'); if (dialog.open) dialog.close(); $('player-shell').replaceChildren(); $('player-shell').hidden = true; $('movie-detail').hidden = false; document.body.style.overflow = ''; selected = null; selectedEpisode = null; returnFocus?.focus(); }
  function updateDetails(item) { $('movie-title').textContent = item.title; $('movie-description').textContent = item.description || 'Explore this title in the Prism cinema.'; $('movie-meta').textContent = [item.year, item.runtime, (item.genres || [item.genre]).join(' / '), item.rating ? '★ ' + item.rating : ''].filter(Boolean).join('   ·   '); }
  async function loadMetadata(item, force = false) {
    if (!force && (item.src || (isSeries(item) ? item.episodesLoaded : item.tmdbId))) return item;
    const type = isSeries(item) ? 'series' : 'movie', key = type + ':' + item.id;
    let pending = metadataRequests.get(key);
    if (!pending || force) {
      pending = (async () => { const response = await fetch('/api/movies?type=' + type + '&id=' + encodeURIComponent(item.id), { signal: AbortSignal.timeout(20000) }); const data = await response.json(); if (!response.ok || !data.meta) throw new Error(data.error || 'Details could not load. Please try again.'); return data.meta; })();
      metadataRequests.set(key, pending); pending.finally(() => { if (metadataRequests.get(key) === pending) metadataRequests.delete(key); }).catch(() => {});
    }
    const meta = await pending, normalized = normalize(meta, type);
    if (!normalized.tmdbId) normalized.tmdbId = item.tmdbId;
    Object.assign(item, normalized);
    if (isSeries(item)) { item.episodes = normalizeEpisodes(meta.videos || []); item.episodesLoaded = true; }
    return item;
  }
  async function loadShowDetails(force = false) {
    const item = selected, token = ++detailRequestId; if (!isSeries(item)) return;
    metadataLoading = true; metadataError = ''; renderEpisodes();
    try {
      await loadMetadata(item, force); if (token !== detailRequestId || selected !== item) return;
      const savedEpisode = read('prism.episodes', {})[item.id]; selectedEpisode = initialEpisode(item.episodes || [], selectedEpisode || savedEpisode); selectedSeason = selectedEpisode?.season ?? null; updateDetails(item);
    } catch (error) { if (token !== detailRequestId || selected !== item) return; metadataError = error.message || 'The episode list could not load. Try again.'; }
    finally { if (token === detailRequestId && selected === item) { metadataLoading = false; renderEpisodes(); } }
  }
  function show(item) {
    clearPlayerWatch(); playRequestId++; selected = item; selectedEpisode = null; selectedSeason = null; metadataError = ''; metadataLoading = false; returnFocus = document.activeElement;
    $('dialog-title').textContent = isSeries(item) ? 'PRISM TV' : 'PRISM CINEMA'; updateDetails(item); $('poster-wrap').replaceChildren(image(item, 'dialog-poster')); $('save-movie').textContent = saved.has(item.id) ? 'SAVED TO WATCHLIST' : 'SAVE TO WATCHLIST';
    $('player-shell').replaceChildren(); $('player-shell').hidden = true; $('movie-detail').hidden = false; $('player-footer').hidden = true; $('modal-fs-btn').hidden = true; $('playback-status').textContent = ''; $('series-panel').hidden = !isSeries(item);
    $('play-movie').textContent = isSeries(item) ? '▶ PLAY EPISODE' : '▶ PLAY MOVIE'; $('play-movie').disabled = isSeries(item); $('episode-navigation').hidden = !isSeries(item); $('movie-dialog').showModal(); document.body.style.overflow = 'hidden';
    if (isSeries(item)) loadShowDetails();
    else { $('play-movie').focus(); if (!item.tmdbId && !item.src) loadMetadata(item).then(() => { if (selected === item) updateDetails(item); }).catch(() => {}); }
  }
  function saveEpisode() { if (!selected || !selectedEpisode) return; const positions = read('prism.episodes', {}); positions[selected.id] = { season: selectedEpisode.season, episode: selectedEpisode.episode }; write('prism.episodes', positions); }
  function renderEpisodes() {
    const visible = isSeries(selected); $('series-panel').hidden = !visible; $('episode-navigation').hidden = !visible; if (!visible) return;
    const episodes = selected.episodes || [], seasons = seasonsFor(episodes); $('season-select').replaceChildren();
    for (const season of seasons) { const option = document.createElement('option'); option.value = season; option.textContent = season === 0 ? 'Specials' : 'Season ' + season; $('season-select').append(option); }
    if (selectedSeason !== null) $('season-select').value = String(selectedSeason);
    $('season-select').disabled = metadataLoading || !seasons.length;
    $('episodes-status').textContent = metadataLoading ? 'Loading seasons and episodes…' : metadataError || (!episodes.length ? 'No episodes are listed for this show yet.' : `${episodes.filter(episode => episode.season === selectedSeason).length} episodes · Choose an episode to play`);
    $('episodes-status').classList.toggle('media-error', Boolean(metadataError)); $('retry-episodes').hidden = !metadataError && (metadataLoading || episodes.length > 0); $('retry-episodes').disabled = metadataLoading;
    $('episode-list').replaceChildren();
    for (const episode of episodes.filter(episode => episode.season === selectedSeason)) {
      const active = selectedEpisode?.season === episode.season && selectedEpisode?.episode === episode.episode, released = episodeReleased(episode);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'episode-card' + (active ? ' selected' : ''); button.disabled = !released; button.setAttribute('aria-pressed', String(active)); button.setAttribute('aria-label', `${episodeLabel(episode)} ${episode.title}${released ? '' : ' — Coming soon'}`);
      if (episode.thumbnail) { const img = document.createElement('img'); img.src = episode.thumbnail; img.alt = ''; img.loading = 'lazy'; img.addEventListener('error', () => img.remove(), { once: true }); button.append(img); }
      const copy = document.createElement('span'); copy.className = 'episode-copy'; const number = document.createElement('span'); number.className = 'episode-number'; number.textContent = episodeLabel(episode) + (!released ? ' · COMING SOON' : active ? ' · SELECTED' : ''); const title = document.createElement('strong'); title.textContent = episode.title; copy.append(number, title);
      if (episode.overview) { const overview = document.createElement('span'); overview.className = 'episode-overview'; overview.textContent = episode.overview; copy.append(overview); } button.append(copy); button.addEventListener('click', () => chooseEpisode(episode)); $('episode-list').append(button);
    }
    $('play-movie').disabled = metadataLoading || !selectedEpisode || !episodeReleased(selectedEpisode);
    $('current-episode').textContent = selectedEpisode ? `${episodeLabel(selectedEpisode)} · ${selectedEpisode.title}` : 'Choose an episode';
    const seasonEpisodes = episodes.filter(episode => episode.season === selectedSeason); $('previous-episode').disabled = !adjacentEpisode(seasonEpisodes, selectedEpisode, -1); $('next-episode').disabled = !adjacentEpisode(seasonEpisodes, selectedEpisode, 1);
  }
  function chooseEpisode(episode, start = true) { selectedEpisode = episode; selectedSeason = episode.season; saveEpisode(); renderEpisodes(); if (start) play(); }
  function playerUrl(item) {
    if (item.src) return item.src;
    const settings = read('prism.settings', {}); if (isSeries(item)) return seriesPlayerUrl(item, selectedEpisode, settings);
    const template = settings.provider || 'https://vidsrc.party/embed/movie/{id}'; if (template.includes('{id}') && !item.tmdbId) throw new Error('This title has no playback ID. Try another title.');
    const url = new URL(template.replaceAll('{id}', encodeURIComponent(item.tmdbId || '')).replaceAll('{imdb}', encodeURIComponent(item.id))); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Choose an HTTPS movie provider in Settings.'); return url.href;
  }
  function saveProxyMode(enabled) { const settings = read('prism.settings', {}); settings.proxyMovies = enabled; write('prism.settings', settings); syncProxyMode(enabled); }
  function syncProxyMode(enabled) { for (const [id, value] of [['movie-proxy-mode', true], ['movie-direct-mode', false]]) { const button = $(id); button.setAttribute('aria-pressed', String(value === enabled)); button.style.background = value === enabled ? 'rgba(201,168,76,.18)' : ''; button.style.color = value === enabled ? 'var(--gold-light)' : ''; button.style.borderColor = value === enabled ? 'var(--gold)' : ''; } }
  async function play(mode) {
    if (!selected) return;
    clearPlayerWatch();
    const item = selected, token = ++playRequestId, proxy = typeof mode === 'boolean' ? mode : proxyPreference(read('prism.settings', {}));
    if (typeof mode === 'boolean') saveProxyMode(mode); else syncProxyMode(proxy);
    const shell = $('player-shell'); $('play-movie').disabled = true; $('player-footer').hidden = false; $('playback-status').textContent = proxy ? 'Connecting proxy playback…' : 'Opening direct playback…';
    try {
      await loadMetadata(item); if (token !== playRequestId || selected !== item) return;
      if (isSeries(item) && !selectedEpisode) { selectedEpisode = initialEpisode(item.episodes || [], read('prism.episodes', {})[item.id]); selectedSeason = selectedEpisode?.season ?? null; renderEpisodes(); }
      if (selectedEpisode && !episodeReleased(selectedEpisode)) throw new Error('This episode has not been released yet. Choose an earlier episode.');
      const url = playerUrl(item), episode = isSeries(item) ? selectedEpisode : null;
      $('player-source').textContent = (episode ? `${episodeLabel(episode)} · ${episode.title}` : item.src ? 'Classic' : 'Movie') + ' · ' + (proxy ? 'Proxy playback' : 'Direct playback');
      const config = proxy ? await prepareMovieProxy() : null; if (token !== playRequestId || selected !== item) return;
      shell.replaceChildren();
      if (item.src) {
        const video = document.createElement('video'); video.controls = true; video.autoplay = true; video.playsInline = true; video.src = proxy ? proxiedVideoUrl(url, config) : url; video.setAttribute('aria-label', item.title);
        video.addEventListener('playing', () => { if (token === playRequestId) $('playback-status').textContent = ''; }); video.addEventListener('error', () => { if (token === playRequestId) $('playback-status').textContent = proxy ? 'This video could not play through the proxy. Retry the player or switch connection.' : 'This video could not play directly. Retry the player or switch connection.'; }); shell.append(video);
      } else {
        const frame = document.createElement('iframe'); frame.title = item.title + (episode ? ' — ' + episodeLabel(episode) + ' ' + episode.title : '') + ' video player'; frame.src = proxy ? proxyLandingUrl(url) : url; frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture'; frame.allowFullscreen = true; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
        frame.addEventListener('load', () => { if (token === playRequestId) $('playback-status').textContent = 'If playback stalls, retry or switch connection.'; }); frame.addEventListener('error', () => { if (token === playRequestId) $('playback-status').textContent = 'The player could not connect. Retry the player or switch connection.'; }); shell.append(frame); watchPlayer(frame, token);
      }
      $('movie-detail').hidden = true; shell.hidden = false; $('dialog-title').textContent = item.title.toUpperCase(); $('modal-fs-btn').hidden = false; if (episode) { saveEpisode(); renderEpisodes(); }
    } catch (error) { if (token === playRequestId) $('playback-status').textContent = error.message || 'Playback could not connect. Retry the player or switch connection.'; }
    finally { if (token === playRequestId) $('play-movie').disabled = isSeries(selected) && (!selectedEpisode || !episodeReleased(selectedEpisode)); }
  }
  async function onlineSearch() {
    query = $('search-input').value.trim(); const token = ++requestId, type = contentType; remoteResults = null; render(); if (!query) { status(defaultStatus()); return; } status('Searching ' + (type === 'series' ? 'TV shows' : 'the cinema') + '…');
    try {
      const response = await fetch('/api/movies?type=' + type + '&q=' + encodeURIComponent(query), { signal: AbortSignal.timeout(20000) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Search unavailable'); if (token !== requestId) return;
      const merged = new Map(baseCatalog().filter(item => item.title.toLowerCase().includes(query.toLowerCase())).map(item => [item.id, item])); for (const meta of data.metas || []) if (meta.poster && (meta.name || meta.title)) { const item = normalize(meta, type); merged.set(item.id, item); }
      remoteResults = [...merged.values()]; render(); status(`Search complete · ${remoteResults.length} titles found.`);
    } catch { if (token === requestId) status('Online search is unavailable. Showing matching titles from the collection.', true); }
  }
  async function loadSeriesCatalog() {
    try { status('Loading TV shows…'); const response = await fetch('/data/series.json', { cache: 'no-cache' }); if (!response.ok) throw new Error(); const data = await response.json(); seriesCatalog = (Array.isArray(data) ? data : data.metas || []).map(item => ({ ...item, type: 'series' })); seriesError = ''; if (contentType === 'series') { hero(); render(); status(defaultStatus()); } }
    catch { seriesError = 'TV shows could not load. Use Try Again or search for a show.'; if (contentType === 'series') { render(); status(seriesError, true); } }
  }

  $('search-form').addEventListener('submit', event => { event.preventDefault(); onlineSearch(); });
  $('search-input').addEventListener('input', () => { requestId++; query = $('search-input').value.trim(); remoteResults = null; render(); status(query ? 'Press Enter to search more ' + (contentType === 'series' ? 'TV shows.' : 'movie titles.') : defaultStatus()); });
  $('sort-select').addEventListener('change', event => { sort = event.target.value; render(); });
  document.querySelectorAll('[data-media-type]').forEach(button => button.addEventListener('click', () => switchType(button.dataset.mediaType)));
  $('modal-close-btn').addEventListener('click', close); $('movie-dialog').addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('movie-dialog').addEventListener('click', event => { if (event.target === $('movie-dialog')) { const rect = $('movie-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } });
  $('save-movie').addEventListener('click', () => { if (selected) toggleSaved(selected); }); $('play-movie').addEventListener('click', play);
  $('retry-player').addEventListener('click', () => play());
  $('movie-proxy-mode').addEventListener('click', () => play(true)); $('movie-direct-mode').addEventListener('click', () => play(false));
  $('modal-fs-btn').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('player-shell').requestFullscreen(); } catch {} });
  $('retry-episodes').addEventListener('click', () => loadShowDetails(true));
  $('season-select').addEventListener('change', event => { selectedSeason = Number(event.target.value); const episodes = (selected?.episodes || []).filter(episode => episode.season === selectedSeason); selectedEpisode = episodes.find(episode => episodeReleased(episode)) || episodes[0] || null; renderEpisodes(); if (!$('player-shell').hidden && selectedEpisode && episodeReleased(selectedEpisode)) play(); });
  $('previous-episode').addEventListener('click', () => { const episode = adjacentEpisode((selected?.episodes || []).filter(episode => episode.season === selectedSeason), selectedEpisode, -1); if (episode) chooseEpisode(episode); });
  $('next-episode').addEventListener('click', () => { const episode = adjacentEpisode((selected?.episodes || []).filter(episode => episode.season === selectedSeason), selectedEpisode, 1); if (episode) chooseEpisode(episode); });
  window.addEventListener('storage', event => { if (event.key === 'prism.watchlist' || event.key === 'prism.watchlistMovies') { saved = new Set(read('prism.watchlist', [])); savedMovies = read('prism.watchlistMovies', {}); render(); } });
  async function init() {
    const seriesPromise = loadSeriesCatalog();
    try {
      const responses = await Promise.all([fetch('/data/movies.json'), fetch('/data/classics.json')]); if (responses.some(response => !response.ok)) throw new Error(); [catalog, classics] = await Promise.all(responses.map(response => response.json()));
      await seriesPromise; switchType(contentType); $('load-bar').style.width = '100%'; setTimeout(() => $('load-bar').style.opacity = '0', 400);
    } catch { await seriesPromise; if (contentType === 'series' && seriesCatalog.length) switchType('series'); else { $('main-grid').textContent = 'The cinema could not load. Refresh the page to try again.'; status('Catalog unavailable', true); } }
  }
  if (typeof read('prism.settings', {}).proxyMovies !== 'boolean') saveProxyMode(true); else syncProxyMode(proxyPreference(read('prism.settings', {})));
  init();
})();
