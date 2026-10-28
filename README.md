# Prism

## Cloudflare Worker version

The updated Cloudflare application is in [`cloudflare-worker/`](cloudflare-worker/). It includes the clean root-page navigation, **Learning** and **Educational Apps** section labels, and the existing games, apps, movies, chat, and settings features.

Start at the root of a connected domain, such as `https://prism.s2004826.workers.dev/`. Ordinary section navigation stays inside the root page's full-window frame. Internal page URLs still work directly, and refreshing the root returns to the homepage. The section labels do not change proxy functionality or the domain's filtering category.

From the repository root, use Node.js 22.13 or newer and run:

```sh
cd cloudflare-worker
npm ci
npm test
npm run build
```

The build generates the corresponding source ZIP and produces `dist/server` and `dist/client`. Follow [`cloudflare-worker/CLOUDFLARE.md`](cloudflare-worker/CLOUDFLARE.md) to deploy those files to your existing Worker with its existing D1 database. Committing this source does not deploy it by itself.

The original Node application remains at the repository root, with its frontend in `main/`. The Cloudflare version has its own package manifest, build scripts, and [AGPL-3.0 license and third-party notices](cloudflare-worker/THIRD_PARTY.md). See [the original license](LICENSE) for the original application.

## Original credit notice

Credit must be given if or else DMCA
