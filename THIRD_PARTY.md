# Third-party sources

## 55GMS game catalog and source

The imported game catalog comes from [55gms/55GMS](https://github.com/55gms/55GMS), specifically `static/assets/json/load/g.json`. The repository's LICENSE is GNU Affero General Public License version 3; a copy is included in this project's `LICENSE`. The upstream `package.json` has a conflicting ISC field; this project follows the actual repository license.

The complete imported snapshot has 501 catalog records: 500 game entries and one upstream game request form. Rooster displays the 500 games. The original records, including the request form, are preserved in `public/data/games-source.json`. `catalog-info.json` records the exact commit, timestamp, and source URLs. The normalization script resolves upstream shared launcher `link` parameters to the actual game document and preserves authors, proxy flags, thumbnails, and source paths.

Games are loaded from upstream source addresses or the external publishers specified in the catalog. Catalog import does not imply that game binaries have been copied to this deployment. Modern 55GMS game documents load binary assets from the separate [55gms/assets](https://github.com/55gms/assets) repository, often using commit-pinned jsDelivr URLs. Individual games, artwork, and assets retain their own author and publisher rights; the portal's AGPL license does not replace those rights.

To refresh all catalog metadata and selected thumbnails, run `node scripts/sync-catalog.mjs`. To also download a full source snapshot of the 55GMS application into `outputs/source/`, run `node scripts/sync-catalog.mjs --source`. This downloads the current application snapshot, including its game loader documents, rather than its multi-gigabyte Git history. The separate game asset repository is linked in `catalog-info.json` and is not downloaded by this command.

Source code is available through this project checkout, including the imported catalog, normalization script, and retained upstream license. If distributing a modified network-served AGPL application, retain the corresponding source and license information.

The 151 local game entry documents and engine helpers in `public/game-pages/` and `public/game-runtime/` derive from upstream commit `183754e50598d4dab26b9107404d983ca562833b`. The importer preserves game initialization and CDN asset bases, adapts shared helper paths, and replaces the portal loading-screen presentation with Prism code. Known 55GMS account/site scripts and its shared advertising SDK are omitted from these entries. Individual game SDKs, native loading screens, and author credits remain. The importer, generated launch map, and adapted runtime are included in the corresponding source archive.

## Movie metadata and playback

Movie discovery metadata is obtained from the public [Cinemeta catalog](https://v3-cinemeta.strem.io/catalog/movie/top.json), part of the Stremio ecosystem. Its [addon protocol](https://github.com/Stremio/stremio-addon-sdk/tree/master/docs) documents catalog and metadata responses. Movie titles, descriptions, artwork, and ratings retain their original rights. Cinemeta is a metadata service, not a video host. The cached catalog requires no third-party API credential. No API keys from the reference website have been copied.

Reference implementation research: current `55GMS/static/misc/media/js/player.js` constructs `https://vidsrc.party/embed/movie/{tmdbId}` or `https://vidsrc.party/embed/tv/{tmdbId}/{season}/{episode}`, then loads that provider through its proxy. Metadata comes from TMDB. Historical releases used other providers, so older release notes may not reflect the current source. External playback availability is controlled by the selected provider and may differ by title or region.

Three direct-play classics are also available in `public/data/classics.json`. The Internet Archive item metadata marks these editions as public domain:

- [Nosferatu (1922)](https://archive.org/details/Nosferatu1922)
- [The General (1926)](https://archive.org/details/The_General_Buster_Keaton)
- [His Girl Friday (1940)](https://archive.org/details/HisGirlFriday)

Each classic record retains its item source URL and license URL. Video is streamed from Internet Archive and is not copied into this repository. Cached selected movie posters, backdrops, and game thumbnails are used as catalog artwork; their upstream URLs are preserved in the records.
# Prism frontend

The frontend is adapted directly from [RishiRuparelia/Prism](https://github.com/RishiRuparelia/Prism), pinned at `534ba600d55f384626ecc2356f023d681c03b24b`. Original copyright (c) 2026 RishiRuparelia; MIT license retained at `public/prism/LICENSE.txt`. The original scene, layout, typography, and styling are preserved. Changes connect the proxy, replace game data, add movies/chat, repair script initialization, and remove advertising, analytics, and unrelated badge scripts.

