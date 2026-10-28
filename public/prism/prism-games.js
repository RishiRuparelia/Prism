(() => {
  let allGames = [], activeCategory = "All", searchQuery = "", sortMode = "default";
  const favoriteKey = "prism.favorites";
  let favorites = [];
  try { favorites = JSON.parse(localStorage.getItem(favoriteKey) || "[]"); } catch {}
  if (!Array.isArray(favorites)) favorites = [];
  const $ = id => document.getElementById(id);
  const featuredNames = ["minecraft", "subway surfers", "slope", "retro bowl", "drive mad", "basketball stars"];
  function loadBar(value) { $("load-bar").style.width = `${value}%`; }
  async function init() {
    loadBar(35);
    try {
      const response = await fetch("/data/games.json");
      if (!response.ok) throw new Error(`Catalog unavailable (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("The game catalog is invalid.");
      allGames = data.map(g => ({ ...g, title: g.name || g.title, thumbnail: g.image, category: g.category || "Arcade", featured: featuredNames.includes((g.name || "").toLowerCase()) }));
      categories(); render(); loadBar(100);
      setTimeout(() => { $("load-bar").style.opacity = "0"; }, 500);
    } catch (error) {
      $("game-count").textContent = "The arcade could not load.";
      $("empty-state").style.display = "flex";
      $("empty-msg").textContent = error.message;
      const retry = document.createElement("button"); retry.className = "prism-error-action"; retry.textContent = "TRY AGAIN"; retry.onclick = () => location.reload(); $("empty-state").append(retry);
      loadBar(100);
    }
  }
  function categories() {
    const container = $("category-pills"); container.replaceChildren();
    ["All", "Favorites", ...[...new Set(allGames.map(g => g.category))].sort()].forEach(cat => {
      const button = document.createElement("button"); button.className = "cat-pill" + (activeCategory === cat ? " active" : ""); button.textContent = cat; button.onclick = () => { activeCategory = cat; categories(); render(); }; container.append(button);
    });
  }
  function filtered() {
    let list = allGames.filter(g => (activeCategory === "All" || activeCategory === "Favorites" && favorites.includes(g.id) || g.category === activeCategory) && g.title.toLowerCase().includes(searchQuery));
    if (sortMode === "az") list.sort((a,b) => a.title.localeCompare(b.title));
    if (sortMode === "za") list.sort((a,b) => b.title.localeCompare(a.title));
    if (sortMode === "category") list.sort((a,b) => a.category.localeCompare(b.category));
    return list;
  }
  function render() {
    const list = filtered(), showFeatured = activeCategory === "All" && !searchQuery && sortMode === "default";
    $("featured-section").classList.toggle("hidden", !showFeatured || !list.some(g => g.featured));
    $("featured-grid").replaceChildren(); $("main-grid").replaceChildren();
    list.forEach((game, i) => (showFeatured && game.featured ? $("featured-grid") : $("main-grid")).append(card(game, i)));
    $("game-count").textContent = `${list.length} of ${allGames.length} games`;
    $("all-label").textContent = searchQuery ? `Results for “${$("search-input").value.trim()}”` : activeCategory === "All" ? "Learning collection" : activeCategory;
    $("empty-state").style.display = list.length ? "none" : "flex";
    $("empty-msg").textContent = activeCategory === "Favorites" ? "Tap the heart on a game to save it here." : "Try another title or category.";
  }
  function card(game, index) {
    const element = document.createElement("article"); element.className = "game-card"; element.tabIndex = 0; element.setAttribute("role", "button"); element.setAttribute("aria-label", `Play ${game.title}`); element.style.animationDelay = `${Math.min(index * .015, .3)}s`;
    element.onclick = () => openGame(game); element.onkeydown = event => { if (event.target === element && ["Enter", " "].includes(event.key)) { event.preventDefault(); openGame(game); } };
    const thumb = document.createElement("div"); thumb.className = "card-thumb";
    const image = document.createElement("img"); image.src = game.thumbnail; image.alt = game.title; image.loading = "lazy"; image.onerror = () => { const placeholder = document.createElement("div"); placeholder.className = "thumb-placeholder"; placeholder.textContent = game.title.slice(0,2).toUpperCase(); image.replaceWith(placeholder); }; thumb.append(image);
    const play = document.createElement("div"); play.className = "play-btn"; play.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="#0a0805"><path d="M4 2l10 6-10 6V2z"/></svg>'; thumb.append(play);
    const favorite = document.createElement("button"); favorite.className = `prism-favorite${favorites.includes(game.id) ? " saved" : ""}`; favorite.textContent = favorites.includes(game.id) ? "♥" : "♡"; favorite.setAttribute("aria-label", `${favorites.includes(game.id) ? "Unsave" : "Save"} ${game.title}`); favorite.onclick = event => { event.preventDefault(); event.stopPropagation(); favorites = favorites.includes(game.id) ? favorites.filter(id => id !== game.id) : [...favorites,game.id]; localStorage.setItem(favoriteKey, JSON.stringify(favorites)); render(); }; thumb.append(favorite);
    const info = document.createElement("div"); info.className = "card-info"; const title = document.createElement("div"); title.className = "card-title"; title.textContent = game.title; const category = document.createElement("div"); category.className = "card-category"; category.textContent = game.category; info.append(title, category); element.append(thumb, info); return element;
  }
  function openGame(game) { $("modal-title").textContent = game.title.toUpperCase(); $("game-frame").src = game.usesProxy ? `/browser.html?url=${encodeURIComponent(game.url)}` : game.url; $("modal-backdrop").classList.add("open"); document.body.style.overflow = "hidden"; }
  function close() { $("modal-backdrop").classList.remove("open"); $("game-frame").src = "about:blank"; document.body.style.overflow = ""; }
  $("modal-close-btn").onclick = close; $("modal-backdrop").onclick = event => { if (event.target === $("modal-backdrop")) close(); };
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  $("modal-fs-btn").onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else $("game-frame").requestFullscreen().catch(() => {}); };
  $("search-input").oninput = event => { searchQuery = event.target.value.trim().toLowerCase(); render(); };
  $("sort-select").onchange = event => { sortMode = event.target.value; render(); };
  init();
})();
