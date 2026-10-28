# Prism

The complete current PRISM application is at the repository root, including Movies and TV, Learning (games), Educational Apps, chat, settings, catalogs, local artwork, and the Worker backend.

**Application/build directory: the repository root (`.`).** Run the commands below from the directory containing `package.json`.

[Complete file index](FILES.md) · [Deployment instructions](CLOUDFLARE.md)

## Site files

| Feature | Files |
| --- | --- |
| Homepage and clean root navigation | [Root page](app/page.tsx), [home interface](public/prism/index.html) |
| Movies and TV | [Movies/TV page](public/prism/movies.html), [catalog interface](public/prism/movies.js), [movie API](app/api/movies/route.ts) |
| Movie player and TV episode state | [Player behavior](public/prism/movie-playback.js), [series state](public/prism/series-state.js) |
| Movie, TV, and classics catalogs | [Movies](public/data/movies.json), [TV series](public/data/series.json), [classics](public/data/classics.json) |
| Learning / games | [Games page](public/prism/games.html), [games interface](public/prism/prism-games.js), [games catalog](public/data/games.json), [local launch map](public/data/game-pages.json) |
| Educational Apps | [Apps page](public/prism/apps.html) |
| Chat | [Chat page](public/prism/chat.html), [chat client](public/prism/chat.js), [chat API](app/api/chat/route.ts), [database](db/) |
| Settings | [Settings page](public/prism/settings.html), [settings behavior](public/prism/prism-settings.js), [preferences](public/prism/preferences.js) |
| Images, icons, and styles | [Local artwork](public/media/), [public assets](public/), [page styles](public/prism/) |
| Browser and Worker | [Browser page](public/browser.html), [browser client](public/browser.js), [Worker source](worker/) |
| Build, catalog updates, and tests | [Scripts](scripts/), [tests](tests/), [package manifest](package.json) |
| Credits and licenses | [Third-party notices](THIRD_PARTY.md), [project license](LICENSE), [credits page](public/credits.html) |

## StaticDelivr entry

The public entry URL is [PRISM on StaticDelivr](https://cdn.staticdelivr.com/gh/RishiRuparelia/Prism/main/index.svg).

The root [index.svg](index.svg) uses an SVG `foreignObject` containing an iframe pointed at the [existing Cloudflare Worker](https://prism.s2004826.workers.dev/). The PRISM interface, API requests, and service worker run on that Worker's origin. The SVG contains no backend implementation or credentials, and the Worker must remain reachable.

Deploy normal application changes to the same Worker using [CLOUDFLARE.md](CLOUDFLARE.md). Changes to the SVG entry itself require committing and pushing `index.svg` to GitHub; the CDN's cached copy may need to refresh before the `main` URL reflects them. Publishing the entry file does not deploy or replace the Worker or its chat database.

## Local hosting

Open http://127.0.0.1:8080/ on this computer. The local version does not require ChatGPT sign-in and uses its own persistent chat database.

The root page contains the PRISM interface in a full-window, same-origin frame. Starting at `/` keeps the outer browser address at the current domain when navigating the Learning, Educational Apps, Movies, Chat, and Settings sections. The existing internal page and API paths are unchanged. Refreshing the root returns to the homepage; opening an internal page URL directly still shows that path. Section names are presentation changes and do not change the site's functionality or filtering category.

Run `./Start-Prism.ps1` from PowerShell to build and launch in the background, and `./Stop-Prism.ps1` to stop it. For terminal output, use `npm run local`. Pass `-- --port 8081` to npm, or `-Port 8081` to the PowerShell launcher, to change ports. Local chat data stays in `.wrangler/state/`; logs and process details stay in `.local/`.

Movies default to Proxy playback, with Direct available in the player and a saved preference in Settings. Retry Player reconnects the selected movie or episode without losing the selected connection. Obvious hosting failures in proxied players show recovery guidance. Movie playback remains inside Prism. Game, app, movie, chat, and settings pages use SVG and ICO favicons; Chat also has its own speech-bubble tab icon. The local server binds to loopback; this address is accessible only on the host computer.

Publishing source to GitHub and deploying the Worker are separate steps. Use the deployment guide below to update your live Worker.

### Browser runtime

The active browser assets use `/assets/runtime/`, and the configured transport is `/api/transport/`. The previous `/uv/` files and `/bare/` transport remain available for cached pages and existing tabs. Both transport URLs use the same Bare v3 protocol, target validation, and cookie handling. The service worker remains at `/sw.js` with root scope because direct movie playback needs the page to be controlled.

Browser startup checks worker activation and transport compatibility with bounded waits and retry support. Home and app launches include the destination in the inner frame URL, so blocking session storage does not lose the address. These implementation changes do not establish or guarantee a different category in a school or network filter.

For your own Cloudflare account, follow [the Windows deployment guide](CLOUDFLARE.md). It uses Workers, Static Assets, and D1, with a local configuration helper and a deployment dry run.

TV Shows is available beside Movies, with a saved 50-show collection and live search. South Park is pinned first. Opening a show fetches its season/episode catalog; episode choices and Proxy/Direct mode are saved on this device. The TV provider URL is configurable in Settings with `{id}`, `{season}`, and `{episode}` placeholders. Use `npm run series:sync` to refresh the saved collection. Episode playback depends on the configured external provider.

The original Prism frontend, connected to a browser proxy, 500-game arcade, movie library, settings, and shared lounge. The animated Egyptian scene, gold styling, Cinzel/Rajdhani typography, and original games/settings layouts come directly from RishiRuparelia/Prism at commit 534ba600d55f384626ecc2356f023d681c03b24b. Backend hosting uses Vinext on Cloudflare Workers and D1.

## Run

Requires Node 22.13+.

```powershell
npm ci
node scripts/copy-proxy-assets.mjs
npm run dev
```

Open the printed local URL (normally http://127.0.0.1:5173).

## Features

- Ultraviolet 2 browser rewriting with an included Bare v3 HTTP/WebSocket Worker transport; no external proxy server is required.
- Complete 500-game 55gms catalog, search, categories, recent games, and saved favorites.
- Cinemeta movie discovery and live search, external movie player, and three direct-play Internet Archive classics.
- Shared persistent lounge, gaming, and movie-night chat rooms, refreshed every 3.5 seconds. No seeded messages or simulated users.
- Native Prism settings and additional display name, search engine, movie player, and motion preferences.

## Build and check

```powershell
npm test
npx tsc --noEmit
npm run build
```

For the local D1 database after building:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_tiresome_skrulls.sql
```

For standalone Cloudflare hosting, the preparation helper connects the `DB` binding to your existing D1 database. `.openai/hosting.json` supplies the build's binding names and does not contain a hosted project identity or account credentials.

## Prism game loading screens

The shared loader used by 151 imported catalog games now runs through local entry pages and a Prism gold presentation adapter. The game's engine still reports download progress and decides when the loading screen disappears. Native game loaders and original author credits remain with their games; large binary assets still load from the original CDN addresses.

Generated entry pages live in `public/game-pages/`, with the launch map in `public/data/game-pages.json`. Engine helpers and Prism's presentation live in `public/game-runtime/`. Normal builds use these saved files and do not download the game library again. To regenerate the imported pages from the pinned application archive in `outputs/source/`, run `npm.cmd run games:import`.

For an already configured Cloudflare deployment, rebuild and deploy with the existing configuration, then purge the Bunny Pull Zone cache and reload the browser. See [the update instructions](CLOUDFLARE.md#update-the-existing-site-later).

The importer expects the exact archive named `55GMS-183754e50598d4dab26b9107404d983ca562833b.zip` and verifies its SHA-256. To regenerate a fresh checkout, download [that pinned application archive](https://codeload.github.com/55gms/55GMS/zip/183754e50598d4dab26b9107404d983ca562833b) into `outputs/source/` with that filename. The generated pages are committed, so ordinary builds need no archive download.

## Data and original sources

`npm run catalog:sync` refreshes catalogs and selected images. `node scripts/sync-catalog.mjs --source` also downloads the full pinned upstream application ZIP into outputs/source; that optional download is not included in this directory. The separate upstream binary assets remain linked; they are not bundled or claimed to be self-hosted. Individual game availability depends on those hosts.

The imported catalog contains 501 original entries: 500 games and one game-request form. Original catalog and exact provenance are in public/data/games-source.json and catalog-info.json. All 500 normalized source paths were verified against the pinned source tree. Header checks passed for Slope, Subway Surfers, and 2048; the entire library was not individually played.

55gms currently uses Scramjet/Epoxy/Wisp on a Node server. Rooster uses Ultraviolet 2 with a Bare v3 Worker so the proxy can run on the supplied hosting platform without a raw TCP Wisp server. It supports public HTTP(S) destinations and WebSockets on standard web ports. Advanced anti-bot checks, DRM, some browser APIs, and site-specific rewriting may not work. WebSocket relay needs broader runtime compatibility testing. DNS checks do not pin the upstream connection's resolved address.

Movie metadata comes from Cinemeta, with TMDB IDs used for playback. Settings exposes the movie provider template; default is https://vidsrc.party/embed/movie/{id}, matching the current 55gms player source pattern. Video availability depends on that external provider. The three direct-play classics were checked with real HTTP 206 range responses.

## Source license

AGPL-3.0; see LICENSE and THIRD_PARTY.md. `/credits.html` identifies sources and provides the corresponding source ZIP. `npm run build` regenerates that archive automatically; `npm run source:package` can also create it separately. Original creators retain their rights to artwork and game/media content. No upstream API keys or credentials are embedded.

## Original credit notice

Credit must be given if or else DMCA

