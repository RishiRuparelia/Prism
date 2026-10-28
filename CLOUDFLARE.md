# Put PRISM online with Cloudflare

Follow these steps in **Windows PowerShell**. Copy one command block at a time, press **Enter**, and wait for it to finish. Stop at an error and check the troubleshooting table below.

PRISM uses **Cloudflare Workers** for the site and proxy, and **D1** for chat. You get an HTTPS `workers.dev` address without buying a domain or changing DNS. [Cloudflare address documentation](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

**Nothing has been deployed automatically. Step 10 is the command that publishes the site.**

## 1. Sign in to Cloudflare

Open the [Cloudflare dashboard](https://dash.cloudflare.com/). Create an account if needed, verify your email, and sign in. Start with the **Free** plan. Keep this browser open. [Cloudflare getting-started guide](https://developers.cloudflare.com/workers/get-started/dashboard/).

## 2. Open PowerShell in the correct folder

Press the **Windows key**, type **PowerShell**, and open it. Find your cloned Prism folder in File Explorer and copy its full folder path. An administrator window is not needed for the project commands.

```powershell
$prismFolder = Read-Host 'Paste the full path of your Prism folder containing package.json'
Set-Location -LiteralPath ($prismFolder.Trim('"'))
Get-Location
Test-Path .\package.json
Test-Path .\scripts\prepare-cloudflare.mjs
```

The location should be the cloned repository root, the folder containing package.json. Both checks should print **True**. Fix the folder first if either prints False.

## 3. Check Node.js

```powershell
node --version
npm.cmd --version
```

Use **Node 22.13 or newer**. Node **v22.19.0** already meets that minimum; updating it is optional.

The `.cmd` endings in this guide avoid PowerShell's script-policy errors with `npm.ps1` and `npx.ps1`. [Wrangler setup requirements](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

### Optional: update Node on Windows

1. Stop the local PRISM server. From this project folder, run `.\Stop-Prism.ps1` if you started it with the supplied launcher. Close other running Node tools.
2. Open the [official Node.js download page](https://nodejs.org/en/download).
3. Choose **LTS**, **Windows**, your computer's architecture, and **Windows Installer (.msi)**. Most Windows PCs use x64; choose ARM64 for an ARM device.
4. Run the installer. Keep npm and the PATH option enabled. Follow the installer prompts; optional native-build tools are not required just for these steps.
5. Close PowerShell completely and open a new window. Repeat step 2, then run `node --version` and `npm.cmd --version` again.

Use the LTS version shown on that official page; a fixed version number in an older guide can become outdated.

## 4. Check project dependencies

```powershell
Test-Path .\node_modules
```

If **True** and this copy has been working with the current package files, continue. For a fresh clone, changed package.json/package-lock.json, or a **False** result, install the project's packages:

```powershell
npm.cmd ci
```

Wait until installation finishes. After a Node upgrade, reinstall only if package or build errors require it. Wrangler is already included among this project's dependencies. [Wrangler installation documentation](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

## 5. Connect Wrangler to your account

```powershell
npx.cmd wrangler login
```

A browser tab opens. Sign in to the Cloudflare account from step 1, select **Allow**, then return to PowerShell and wait for success. If no tab opens, copy the login URL printed in the terminal into your browser.

Check the account:

```powershell
npx.cmd wrangler whoami
```

Confirm that your account information appears. Use this same account for the database and Worker. [Official login and account commands](https://developers.cloudflare.com/workers/wrangler/commands/general/).

## 6. Find or create the chat database

Check first so you do not create duplicates:

```powershell
npx.cmd wrangler d1 list
```

If **prism-chat** appears, copy its UUID/ID from that row. If it does not appear, create it once:

```powershell
npx.cmd wrangler d1 create prism-chat --update-config=false
```

Copy the `database_id` printed by the creation command. Use your **real ID**, not an example or the temporary ID from an earlier dry run. [D1 create/list reference](https://developers.cloudflare.com/d1/wrangler-commands/).

Store it in this PowerShell window:

```powershell
$prismDatabaseId = Read-Host 'Paste the database_id for prism-chat, then press Enter'
```

When prompted, paste only the UUID, without labels, quotation marks, or braces. Keep this window open. If you reopen PowerShell, repeat step 2 and this `Read-Host` command.

## 7. Build and prepare the configuration

```powershell
npm.cmd run build
```

Wait for a successful build. Then:

```powershell
node scripts/prepare-cloudflare.mjs --name prism --database-id $prismDatabaseId
Test-Path .\.cloudflare\wrangler.json
```

Look for **Cloudflare configuration prepared** and **True**. The helper creates local configuration; it uploads nothing.

It uses Worker **prism**, database **prism-chat**, and binding **DB**. It connects the build and migration folders for you. Do not edit `.openai/hosting.json`, `vite.config.ts`, or the generated files inside `dist`. [Wrangler configuration reference](https://developers.cloudflare.com/workers/wrangler/configuration/).

## 8. Create the online chat tables

```powershell
npx.cmd wrangler d1 migrations apply prism-chat --remote --config .cloudflare/wrangler.json
```

Check that the listed database is **prism-chat**, then answer **y** when asked to apply migrations. Success means the chat tables are ready. If no migrations remain, they are already current.

This tracks completed migrations, so future runs apply only new ones. Keep the SQL's existing Drizzle comments. [D1 migration documentation](https://developers.cloudflare.com/d1/reference/migrations/).

Online chat uses this remote database. Messages from your local `.wrangler/state` database are not uploaded automatically.

## 9. Check the upload without publishing

```powershell
npx.cmd wrangler deploy --config .cloudflare/wrangler.json --dry-run --outdir .cloudflare/dry-run
```

It should show the upload size, **DB** binding, and **--dry-run: exiting now**. Nothing is published. [Dry-run documentation](https://developers.cloudflare.com/workers/wrangler/bundling/).

Check the current build rather than relying on measurements from an earlier release. A dry run checks packaging; it does not verify production traffic capacity or external game and movie hosts.

## 10. Publish PRISM

**This command uploads the site and makes it publicly reachable:**

```powershell
npx.cmd wrangler deploy --config .cloudflare/wrangler.json
```

Wait for success, then copy the HTTPS URL Wrangler prints. An address might look like:

```text
https://prism.YOUR-SUBDOMAIN.workers.dev
```

That is an **example format**, not your address. Open your actual root URL, ending in **/**. The root page keeps section navigation inside a full-window frame, so the outer address stays at the domain. Use this root entry point on Bunny or a custom domain, too. [Deployment command reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy).

You can find it later in the Cloudflare dashboard under **Workers & Pages → prism**, using its **Visit** link or `workers.dev` address. [workers.dev guide](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## 11. Check your live site

1. Open **/** and visit Learning, Educational Apps, Movies, Chat, and Settings.
2. Open **Chat**, send a message, reload, and confirm it remains.
3. Enter **https://example.com** in PRISM's proxy box. Example Domain should appear.
4. Open **Movies** and check TV Shows and South Park's seasons and episodes.
5. Launch Slope from Learning and check its PRISM loading screen.

If the proxy fails, open **/api/transport/** on the same deployed hostname. It should return JSON containing `"versions":["v3"]`. PRISM needs both its static files and Worker APIs; uploading only `public` is insufficient. [Cloudflare's combined assets/Worker setup](https://developers.cloudflare.com/workers/static-assets/).

The active browser assets are served from **/assets/runtime/** and use **/api/transport/**. Legacy **/uv/** assets and **/bare/** remain available for older tabs. Keep the server and assets together so the browser configuration and transport agree. Third-party players can reject requests or become unavailable independently of PRISM.

## Update the existing site later

Publishing source to GitHub does not update the live Worker. Get the updated source into your checkout first. An existing Bunny address continues to work when its origin still points to the same Worker hostname.

If `.cloudflare/wrangler.json` already exists from your first deployment, keep it. It already contains the Worker name and chat database binding. Open PowerShell and run each command after the previous one succeeds:

```powershell
$prismFolder = Read-Host 'Paste the full path of your Prism folder containing package.json'
Set-Location -LiteralPath ($prismFolder.Trim('"'))
Test-Path .\.cloudflare\wrangler.json
```

The check should print **True**. Then rebuild and check the upload:

```powershell
npm.cmd run build
npx.cmd wrangler deploy --config .cloudflare/wrangler.json --dry-run --outdir .cloudflare/dry-run
```

If both succeed, publish:

```powershell
npx.cmd wrangler deploy --config .cloudflare/wrangler.json
```

When deployment succeeds, open the Bunny dashboard, select your existing Pull Zone, use **Purge Cache**, then refresh the website with **Ctrl + F5**. Keep the same Worker, database, and Pull Zone. The loading-screen update adds no database migration. [Bunny cache-purge guide](https://bunny.net/docs/cdn/purge-cache).

If dependencies changed, run `npm.cmd ci` before building. If a later update includes a new database migration, apply it before deploying:

```powershell
npx.cmd wrangler d1 migrations apply prism-chat --remote --config .cloudflare/wrangler.json
```

If the config check prints **False**, find the existing database ID with `npx.cmd wrangler d1 list`, then repeat steps 6–7 to recreate the configuration with that same database. Reusing the database preserves online chat. Recreate the configuration when deployment names or generated runtime settings change. [Deployment reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy).

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Scripts disabled / `npm.ps1` or `npx.ps1` blocked | Use **npm.cmd** and **npx.cmd** as shown. No execution-policy change is needed. |
| `package.json` missing / wrong folder | Repeat step 2. Both `Test-Path` checks must return True. |
| Node, npm, or npx not recognized | Install Node with npm/PATH enabled. Close and reopen PowerShell. |
| Old Node version after installing | Open a fresh terminal. Run `where.exe node` to find older installations taking precedence. |
| Native-package error after switching to Node 24 or another version | Stop the local server, run **npm.cmd ci**, then retry the build. |
| Database already exists | Run **npx.cmd wrangler d1 list** and use the existing prism-chat UUID. |
| Invalid UUID | Paste only your actual database ID, without labels, braces, or placeholder text. |
| Missing build or `.cloudflare/wrangler.json` | Finish step 7. This generated config is excluded from Git. |
| Unauthorized / wrong account | Repeat login and whoami. Database and Worker must use the same account. |
| Several accounts and Wrangler cannot choose | Set **$env:CLOUDFLARE_ACCOUNT_ID = 'YOUR-REAL-ACCOUNT-ID'** using the actual account ID shown by whoami, then retry. The quoted text is a placeholder. |
| Chat database/table error | Confirm the database ID and rerun step 8. Deployment alone does not create tables. |
| Old loading screen after deployment | Purge Bunny's cache, hard-refresh, and confirm the updated manifest and game-runtime assets were deployed. |
| Proxy failure | Check HTTPS and **/api/transport/**, then test example.com before a media provider. |
| Quota or CPU-limit error | Check Worker Metrics/Logs and the current limits below. |

Account/binding details are covered in the [Wrangler configuration reference](https://developers.cloudflare.com/workers/wrangler/configuration/). Request, CPU, and database quotas still apply. [Current Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

A direct `workers.dev` deployment is public by default. The private audience setting from Sites is not copied to it.

For an existing Worker or database with different names, pass their actual values using `--name` and `--database-name` when preparing the configuration, and use that database name in migration commands. The helper keeps the generated module rules and compatibility settings. The build regenerates `/rooster-source.zip` before copying assets so the credits page serves the corresponding source. Generated deployment configuration, local databases, dependency directories, and build output remain outside the committed source.
