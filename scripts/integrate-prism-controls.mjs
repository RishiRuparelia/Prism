import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prismNavigation } from "./prism-navigation.mjs";

const project = resolve(import.meta.dirname, "..");
const reference = resolve(project, "../prism-reference/main");
const destination = resolve(project, "public/prism");
mkdirSync(destination, { recursive: true });

function navigation(html) {
  return prismNavigation(html.replace(/href="games\.html"/g, 'href="/prism/games.html"')
    .replace(/href="settings\.html"/g, 'href="/prism/settings.html"')
    .replace(/href="apps\.html"/g, 'href="/prism/movies.html"')
    .replace(/\bAPPS\b/g, "MOVIES")
    .replace(/(<li><a href="\/prism\/settings\.html")/, '<li><a href="/prism/chat.html">CHAT</a></li>\n    $1'));
}
for (const page of ["games", "settings"]) {
  let html = readFileSync(resolve(reference, `${page}.html`), "utf8");
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<meta name="(?:description|keywords)"[^>]*>/g, "");
  html = html.replace(/<link rel="icon"[^>]*>/g, '<link rel="icon" href="/favicon.svg">');
  html = html.replace(/<!-- SEO facts[\s\S]*?<\/div>/, "");
  html = navigation(html).replace("</head>", '<link rel="stylesheet" href="/prism/controls.css">\n</head>');
  if (page === "games") {
    html = html.replace('<h1 class="page-title">GAMES</h1>', '<h1 class="page-title">LEARNING</h1>')
      .replace('<p class="section-label" id="all-label">All Games</p>', '<p class="section-label" id="all-label">Learning collection</p>');
  }
  if (page === "settings") {
    html = html.replace('Prevents extensions from seeing what you do. Hides everything from your history when searching.', 'Open this page inside an about:blank tab. Your browser and network can still record activity.');
    html = html.replace('Prevents extensions (such as GoGuardian) from closing the tab by showing the "Leave Site?" popup.', 'Ask before leaving this page when the browser supports a navigation warning.');
    html = html.replace(/<span class="material-symbols-outlined"[^>]*>open_in_new<\/span>/g, "↗");
    html = html.replace(/<img id="cancel"[^>]*>/g, "×");
    html = html.replace('<div class="settings">', `<div class="settings">
        <div class="setting prism-personal">
          <p id="name">Your Prism</p>
          <p>A few personal touches for browsing, movie nights, and the chat lounge.</p>
          <div class="prism-fields">
            <label for="prism-display-name">Display name</label><input id="prism-display-name" maxlength="24" placeholder="Explorer">
            <label for="prism-engine">Search engine</label><select id="prism-engine"><option value="duckduckgo">DuckDuckGo</option><option value="google">Google</option></select>
            <label for="prism-provider">Movie player URL</label><input id="prism-provider" placeholder="https://vidsrc.party/embed/movie/{id}">
            <small>Use {id} for the TMDB ID or {imdb} for the IMDb ID. Playback depends on the selected provider.</small>
            <label class="prism-check-row"><input id="prism-motion" type="checkbox" checked> Animate the scene</label>
          </div>
          <p class="prism-status" id="prism-settings-status" role="status"></p>
        </div>`);
  }
  html = html.replace("</body>", `<script src="/prism/prism-${page}.js" defer></script>\n</body>`);
  writeFileSync(resolve(destination, `${page}.html`), html);
}
console.log("Prism games and settings pages prepared from upstream HTML.");
