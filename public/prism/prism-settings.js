(() => {
  const $ = id => document.getElementById(id);
  const defaults = { name: "Explorer", engine: "duckduckgo", provider: "https://vidsrc.party/embed/movie/{id}", tvProvider: "https://vidsrc.party/embed/tv/{id}/{season}/{episode}", motion: true, proxyMovies: true };
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
  let settings = { ...defaults, ...read("prism.settings", {}) };
  const status = $("prism-settings-status");
  let statusTimer;
  function flash(text, error = false) { clearTimeout(statusTimer); status.textContent = text; status.style.color = error ? "#ff7788" : "#81c784"; statusTimer = setTimeout(() => { status.textContent = ""; }, 3000); }
  function save() { localStorage.setItem("prism.settings", JSON.stringify(settings)); flash("Saved. Your Prism, your way."); }
  $("prism-display-name").value = typeof settings.name === "string" ? settings.name : "Explorer";
  $("prism-engine").value = ["google","duckduckgo"].includes(settings.engine) ? settings.engine : "duckduckgo";
  $("prism-provider").value = typeof settings.provider === "string" ? settings.provider : defaults.provider;
  $("prism-tv-provider").value = typeof settings.tvProvider === "string" ? settings.tvProvider : defaults.tvProvider;
  $("prism-motion").checked = settings.motion !== false;
  $("prism-proxy-movies").checked = settings.proxyMovies !== false;
  $("prism-display-name").oninput = event => { settings.name = event.target.value.slice(0,24); save(); };
  $("prism-display-name").onblur = event => { settings.name = event.target.value.trim() || "Explorer"; event.target.value = settings.name; localStorage.setItem("prism.settings",JSON.stringify(settings)); };
  $("prism-engine").onchange = event => { settings.engine = event.target.value; save(); };
  $("prism-motion").onchange = event => { settings.motion = event.target.checked; save(); };
  $("prism-proxy-movies").onchange = event => { settings.proxyMovies = event.target.checked; save(); };
  $("prism-provider").onchange = event => {
    const value = event.target.value.trim();
    try { const url = new URL(value.replaceAll("{id}","123").replaceAll("{imdb}","tt1234567")); if (!["https:","http:"].includes(url.protocol)) throw new Error(); settings.provider = value; save(); }
    catch { flash("Enter an HTTP or HTTPS player URL.", true); }
  };
  $("prism-tv-provider").onchange = event => {
    const value = event.target.value.trim();
    try {
      const sample = value.replaceAll("{id}","2190").replaceAll("{imdb}","tt0121955").replaceAll("{season}","1").replaceAll("{episode}","1");
      const url = new URL(sample);
      if (!["https:","http:"].includes(url.protocol) || !value.includes("{season}") || !value.includes("{episode}")) throw new Error();
      settings.tvProvider = value; save();
    } catch { flash("Use an HTTP or HTTPS URL with {season} and {episode}.", true); }
  };

  for (const id of ["ab_cloak", "quick_links", "auto_cloak", "anti_close"]) {
    const input = $(id); if (!input) continue;
    const key = `prism_${id}`;
    input.checked = read(key, id === "quick_links");
    input.onchange = () => {
      localStorage.setItem(key, JSON.stringify(input.checked));
      const saved = input.closest(".setting")?.querySelector("#saved");
      if (saved) { saved.style.opacity = "1"; setTimeout(() => { saved.style.opacity = "0"; }, 1800); }
      if (id === "quick_links") $("quick_links").closest(".setting").querySelector(".quickies").style.display = input.checked ? "block" : "none";
      if (id === "anti_close") flash(input.checked ? "Navigation warning enabled where your browser supports it." : "Navigation warning disabled.");
    };
  }
  const quickies = document.querySelector(".quickies");
  quickies.style.display = $("quick_links").checked ? "block" : "none";
  quickies.querySelector(".add").onclick = () => {
    const raw = prompt("Quick link address", "https://"); if (!raw) return;
    let url; try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); if (!["http:","https:"].includes(url.protocol)) throw new Error(); } catch { flash("That link address is invalid.",true); return; }
    const name = prompt("Quick link name",url.hostname); if (!name?.trim()) return;
    const links = read("prism_quick_link_details",[]); links.push({name:name.trim().slice(0,50),url:url.href}); localStorage.setItem("prism_quick_link_details",JSON.stringify(links)); flash("Quick link saved.");
  };
  quickies.querySelector(".rm").onclick = () => {
    const links = read("prism_quick_link_details",[]); if (!links.length) { flash("No custom quick links saved yet."); return; }
    const choice = prompt(`Which quick link should be removed?\n${links.map((link,i) => `${i+1}. ${link.name}`).join("\n")}`);
    if (choice === null) return;
    const index = Number(choice) - 1; if (!Number.isInteger(index) || index < 0 || index >= links.length) { flash("Choose a number from the list.",true); return; }
    links.splice(index,1); localStorage.setItem("prism_quick_link_details",JSON.stringify(links)); flash("Quick link removed.");
  };

  function refreshCloak() {
    $("cloakTitle").textContent = localStorage.getItem("prism_tab_title") || "none";
    $("cloakIcon").textContent = localStorage.getItem("prism_tab_icon") || "none";
    $("removeBtn").style.display = localStorage.getItem("prism_tab_title") || localStorage.getItem("prism_tab_icon") ? "inline-flex" : "none";
  }
  const custom = $("details").querySelector("#detailBtn");
  custom.onclick = () => {
    const title = prompt("Tab title when this page is hidden",localStorage.getItem("prism_tab_title") || ""); if (title === null) return;
    const icon = prompt("Tab icon URL (optional)",localStorage.getItem("prism_tab_icon") || ""); if (icon === null) return;
    if (icon.trim()) { try { const url = new URL(icon.trim()); if (!["https:","http:"].includes(url.protocol)) throw new Error(); localStorage.setItem("prism_tab_icon",url.href); } catch { flash("Use an HTTP or HTTPS icon URL.",true); return; } } else localStorage.removeItem("prism_tab_icon");
    if (title.trim()) localStorage.setItem("prism_tab_title",title.trim().slice(0,150)); else localStorage.removeItem("prism_tab_title");
    refreshCloak(); flash("Tab appearance saved.");
  };
  $("removeBtn").onclick = () => { localStorage.removeItem("prism_tab_title"); localStorage.removeItem("prism_tab_icon"); refreshCloak(); flash("Tab appearance reset."); };
  refreshCloak();
  $("openBlank").onclick = () => {
    const tab = window.open("about:blank", "_blank"); if (!tab) { flash("Your browser blocked the new tab.",true); return; }
    tab.document.title = "PRISM";
    tab.document.body.style.cssText = "margin:0;height:100vh;background:#0a0805;overflow:hidden";
    const frame = tab.document.createElement("iframe"); frame.src = location.href; frame.style.cssText = "border:0;width:100%;height:100%;display:block"; frame.allow = "fullscreen; autoplay"; tab.document.body.append(frame);
  };

  const display = $("keybind-display"), keyText = $("keybind-text"), urlInput = $("panic-url"), active = $("panic-active");
  let recording = false, combo = null, panic = read("prism_panic",null);
  function showPanic() { active.style.display = panic ? "flex" : "none"; if (panic) { keyText.textContent = panic.key; urlInput.value = panic.url; $("panic-active-key").textContent = panic.key; combo = panic.combo; } else keyText.textContent = "Click to set…"; }
  showPanic();
  display.onclick = () => { recording = true; display.classList.add("recording"); keyText.textContent = "Press any key…"; display.focus(); };
  display.onkeydown = event => {
    if (!recording) return; event.preventDefault(); event.stopPropagation(); if (["Control","Alt","Shift","Meta"].includes(event.key)) return;
    const key = event.key === " " ? "SPACE" : event.key.toUpperCase();
    const label = [event.ctrlKey && "Ctrl",event.altKey && "Alt",event.shiftKey && "Shift",event.metaKey && "Meta",key].filter(Boolean).join(" + ");
    combo = { key, ctrl:event.ctrlKey, alt:event.altKey, shift:event.shiftKey, meta:event.metaKey, label }; keyText.textContent = label; recording = false; display.classList.remove("recording");
  };
  display.onblur = () => { if (recording) { recording = false; display.classList.remove("recording"); keyText.textContent = combo?.label || panic?.key || "Click to set…"; } };
  $("keybind-clear").onclick = () => { localStorage.removeItem("prism_panic"); panic = null; combo = null; showPanic(); $("panic-status").textContent = "Cleared"; };
  $("panic-save").onclick = () => {
    if (!combo) { $("panic-status").textContent = "Set a keybind first"; return; }
    let url; try { const raw = urlInput.value.trim(); url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); if (!["http:","https:"].includes(url.protocol) || !raw) throw new Error(); } catch { $("panic-status").textContent = "Enter a valid website address"; return; }
    panic = { key:combo.label,url:url.href,combo }; localStorage.setItem("prism_panic",JSON.stringify(panic)); showPanic(); $("panic-status").textContent = "Saved!"; $("panic-status").style.opacity = "1";
  };
  document.addEventListener("keydown",event => {
    if (recording || !panic?.combo) return; const c = panic.combo;
    if ((event.key === " " ? "SPACE" : event.key.toUpperCase()) === c.key && event.ctrlKey === c.ctrl && event.altKey === c.alt && event.shiftKey === c.shift && event.metaKey === c.meta) { event.preventDefault(); location.href = panic.url; }
  });

  const data = document.createElement("div"); data.className = "prism-settings-data";
  const exportButton = document.createElement("button"); exportButton.textContent = "EXPORT SETTINGS"; exportButton.onclick = () => { const blob = new Blob([JSON.stringify({settings,favorites:read("prism.favorites",[])},null,2)],{type:"application/json"}); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "prism-settings.json"; link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000); };
  const importButton = document.createElement("button"); importButton.textContent = "IMPORT"; const file = document.createElement("input"); file.type = "file"; file.accept = "application/json"; importButton.onclick = () => file.click(); file.onchange = async () => { try { if (!file.files[0]) return; const imported = JSON.parse(await file.files[0].text()); if (!imported.settings || typeof imported.settings !== "object") throw new Error(); const result = {...defaults}; for (const key of Object.keys(defaults)) if (typeof imported.settings[key] === typeof defaults[key]) result[key] = imported.settings[key]; localStorage.setItem("prism.settings",JSON.stringify(result)); if (Array.isArray(imported.favorites)) localStorage.setItem("prism.favorites",JSON.stringify(imported.favorites.filter(id => typeof id === "string"))); location.reload(); } catch { flash("That settings file could not be imported.",true); } };
  data.append(exportButton,importButton,file); document.querySelector(".prism-personal").append(data);
})();
