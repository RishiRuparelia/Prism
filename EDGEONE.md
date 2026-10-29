# PRISM on EdgeOne

**Live entry:** [Open PRISM](https://prism-9ce5bpee.edgeone.dev/)

This project uses **Direct Upload**. EdgeOne hosts a small HTML frame; the application, proxy, chat database, APIs, and service worker remain on the [existing Cloudflare Worker](https://prism.s2004826.workers.dev/). Chat connectivity and an external proxy page were checked inside the frame while the browser address stayed on EdgeOne.

## Update the PRISM application

Deploy application changes to the same Cloudflare Worker using [CLOUDFLARE.md](CLOUDFLARE.md), then refresh the EdgeOne page. The frame loads that Worker, so these updates appear without uploading another EdgeOne ZIP.

The Worker must remain reachable. No database, API keys, environment variables, or backend functions are needed on EdgeOne.

## Update the EdgeOne entry

Use this flow when changing the frame's destination, favicon, or direct-open fallback:

1. Edit the files in `edgeone/`: **index.html**, **favicon.svg**, and **edgeone.json**.
2. Recreate **outputs/prism-edgeone.zip** from those three files. Put them at the archive's outermost level, without an enclosing `edgeone/` folder. The ZIP is generated locally and excluded from Git.
3. Sign in to EdgeOne and open the existing PRISM project.
4. Choose **New Deployment**, upload the ZIP, and wait for deployment success. No install or build command runs.
5. Refresh [the stable entry address](https://prism-9ce5bpee.edgeone.dev/) and check the page.

Pushing files to GitHub alone does **not** redeploy this Direct Upload project. [Official Direct Upload guide](https://pages.edgeone.ai/document/direct-upload).

## Optional: create a separate Git-connected project

For automatic entry deployments from GitHub, create a new project and import **RishiRuparelia/Prism**, branch **main**, with:

| Setting | Value |
| --- | --- |
| Root Directory | `edgeone` |
| Framework Preset | **Other** |
| Build / Installation Commands | Both blank |
| Output Directory | `.` |
| Environment Variables | None |

A Direct Upload project cannot switch to Git integration. The separate Git project receives its own assigned address; pushes then update its entry automatically. Application changes still deploy to Cloudflare. [Git import](https://pages.edgeone.ai/document/importing-a-git-repository) · [Build settings](https://pages.edgeone.ai/document/build-guide).

If an upload produces 404, check the ZIP layout. If the frame is empty, use **Open directly** to check the Worker.

