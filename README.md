# Prism

**The complete updated site is in [cloudflare-worker/](cloudflare-worker/).** It includes Movies and TV, Learning (games), Educational Apps, chat, settings, catalogs, local artwork, browser assets, and the server code.

**Application/build directory: `cloudflare-worker`**

[Browse every project file](cloudflare-worker/FILES.md) · [Deployment instructions](cloudflare-worker/CLOUDFLARE.md) · [Project README](cloudflare-worker/README.md)

## Current site files

| Feature | Files |
| --- | --- |
| Homepage and clean root navigation | [Root page](cloudflare-worker/app/page.tsx), [home interface](cloudflare-worker/public/prism/index.html) |
| Movies and TV | [Movies/TV page](cloudflare-worker/public/prism/movies.html), [catalog interface](cloudflare-worker/public/prism/movies.js), [movie API](cloudflare-worker/app/api/movies/route.ts) |
| Movie player and TV episode state | [Player behavior](cloudflare-worker/public/prism/movie-playback.js), [series state](cloudflare-worker/public/prism/series-state.js) |
| Movie, TV, and classics catalogs | [Movies](cloudflare-worker/public/data/movies.json), [TV series](cloudflare-worker/public/data/series.json), [classics](cloudflare-worker/public/data/classics.json) |
| Learning / games | [Games page](cloudflare-worker/public/prism/games.html), [games interface](cloudflare-worker/public/prism/prism-games.js), [games catalog](cloudflare-worker/public/data/games.json) |
| Educational Apps | [Apps page](cloudflare-worker/public/prism/apps.html) |
| Chat | [Chat page](cloudflare-worker/public/prism/chat.html), [chat client](cloudflare-worker/public/prism/chat.js), [chat API](cloudflare-worker/app/api/chat/route.ts), [database](cloudflare-worker/db/) |
| Settings | [Settings page](cloudflare-worker/public/prism/settings.html), [settings behavior](cloudflare-worker/public/prism/prism-settings.js), [preferences](cloudflare-worker/public/prism/preferences.js) |
| Images, icons, and styles | [Local artwork](cloudflare-worker/public/media/), [public assets](cloudflare-worker/public/), [page styles](cloudflare-worker/public/prism/) |
| Browser and Worker | [Browser page](cloudflare-worker/public/browser.html), [browser client](cloudflare-worker/public/browser.js), [Worker source](cloudflare-worker/worker/) |
| Build, catalog updates, and tests | [Scripts](cloudflare-worker/scripts/), [tests](cloudflare-worker/tests/), [package manifest](cloudflare-worker/package.json) |
| Credits and licenses | [Third-party notices](cloudflare-worker/THIRD_PARTY.md), [project license](cloudflare-worker/LICENSE), [credits page](cloudflare-worker/public/credits.html) |

The movie and game catalogs reference external playback and game providers. This repository contains the application code, catalog records, and bundled assets; external videos and third-party game distributions remain at their providers.

## Build the current application

From the repository root, use Node.js 22.13 or newer and run:

```sh
cd cloudflare-worker
npm ci
npm test
npm run build
```

The build generates the corresponding source ZIP and produces `dist/server` and `dist/client`. Follow [CLOUDFLARE.md](cloudflare-worker/CLOUDFLARE.md) to deploy the complete application to a Worker with its D1 database. The `public/` files are part of the app; the API and proxy features also require the server.

Start at the root of your connected domain. Ordinary section navigation stays inside the root page's full-window frame. Internal page URLs still work directly, and refreshing the root returns to the homepage. Section labels do not change proxy functionality or a domain's filtering category.

Committing source to GitHub does not deploy the live Worker by itself. Moving this version to a different hosting platform requires adapting its Worker runtime and database bindings.

## Original Node application

The older Node application remains at the repository root, with its frontend in [main/](main/). Its root `package.json` and hosting configuration belong to that older application. To work with the updated site and its Movies/TV feature, open [cloudflare-worker/](cloudflare-worker/).

The updated application has its own package manifest, build scripts, and [AGPL-3.0 license and third-party notices](cloudflare-worker/THIRD_PARTY.md). See the [original license](LICENSE) for the original application.

## Original credit notice

Credit must be given if or else DMCA
