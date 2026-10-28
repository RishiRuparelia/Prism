# Put PRISM on Cloudflare

Use **Cloudflare Workers with Static Assets and D1** for this project. The Worker runs the proxy and live catalog APIs; D1 stores shared chat messages. The build uploads the website, artwork, and proxy browser files together. [Cloudflare documents this combined assets-and-Worker setup here.](https://developers.cloudflare.com/workers/static-assets/)

These commands deploy from your computer. The preparation helper writes local configuration; publishing the repository to GitHub does not deploy the live Worker.

## 1. Open PowerShell in the repository root

```powershell
node --version
```

Run all commands from the cloned repository's root, the directory containing `package.json`. Use `.` or leave the root-directory setting empty in build integrations that default to the repository root. Use Node.js 22.13 or newer. If you are setting up a fresh copy, install its dependencies first:

```powershell
npm ci
```

## 2. Sign in to your Cloudflare account

```powershell
npx wrangler login
```

A browser window opens. Sign in and allow Wrangler to manage your account. If Wrangler asks you to choose an account later, select the same account throughout these steps. Authentication is handled by Wrangler; do not put account tokens into the project files. [Wrangler login documentation](https://developers.cloudflare.com/workers/wrangler/commands/general/#login).

## 3. Choose the chat database

When updating an existing Prism Worker, use its existing D1 database so chat messages stay in the same database:

```powershell
npx wrangler d1 list
```

Copy its name and `database_id` UUID. Create a database only when setting up a new deployment that does not have one:

```powershell
npx wrangler d1 create prism-chat --update-config=false
```

Copy the `database_id` UUID printed by the create command. The commands below use `prism-chat`; pass `--database-name` to the preparation helper if your existing database has a different name. [Cloudflare D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## 4. Build and prepare the deployment configuration

Replace `PASTE-YOUR-DATABASE-UUID` with that real ID, leaving the quotation marks around it:

```powershell
npm run build
node scripts/prepare-cloudflare.mjs --name prism --database-id 'PASTE-YOUR-DATABASE-UUID'
```

The helper creates `.cloudflare/wrangler.json`. It connects the `DB` binding to your database and points Wrangler at `dist/server`, `dist/client`, and `drizzle`. It retains the generated JavaScript module rules and runtime compatibility settings. The `.cloudflare` directory ignores its generated contents in Git. It does not modify `.openai/hosting.json`, `vite.config.ts`, or the build output. [Wrangler configuration reference](https://developers.cloudflare.com/workers/wrangler/configuration/).

For a different Worker or database name:

```powershell
node scripts/prepare-cloudflare.mjs --name my-prism --database-name my-prism-chat --database-id 'PASTE-YOUR-DATABASE-UUID'
```

Use the matching database name in the migration command below.

## 5. Set up chat tables in the remote database

```powershell
npx wrangler d1 migrations apply prism-chat --remote --config .cloudflare/wrangler.json
```

Confirm the listed migration when prompted. This applies the SQL in `drizzle/` and records completed migrations, so later runs apply only new ones. The existing Drizzle `statement-breakpoint` comments can stay in the SQL files. Use this migration command instead of repeatedly executing the baseline SQL file. [Cloudflare migration documentation](https://developers.cloudflare.com/d1/reference/migrations/).

The remote chat database starts empty. Messages from your local `.wrangler/state` database are separate and are not uploaded by deployment.

## 6. Check the upload locally, then publish when ready

This command packages and checks the Worker without uploading it:

```powershell
npx wrangler deploy --config .cloudflare/wrangler.json --dry-run --outdir .cloudflare/dry-run
```

When you want the site online, run:

```powershell
npx wrangler deploy --config .cloudflare/wrangler.json
```

Wrangler prints the actual HTTPS address when deployment succeeds. Open its root address, such as `https://prism.YOUR-SUBDOMAIN.workers.dev/`. The root page keeps ordinary section navigation inside a full-window frame, so the outer address stays at the domain. Use the same root entry point on any connected CDN/custom domain. [Wrangler deployment documentation](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy).

## Updating PRISM

After changing source files, build again, regenerate the config with the same names and database ID, apply any pending migrations, then deploy again. Keep using the same D1 database to retain chat messages. If you delete `.cloudflare`, rerun the helper to recreate it.

Do not upload only the `public/` directory through a static upload form: this project also needs the built Worker for `/bare/` and `/api/` requests. The `workers.dev` deployment is publicly reachable by default; the owner-only Sites access setting is not copied to a direct Cloudflare deployment.

If chat returns a database error, confirm that `DB` points to the correct D1 UUID and step 5 completed. If proxy pages fail, check `/bare/` on your deployed address; it should return JSON advertising `v3`. Third-party media availability still depends on the provider, and some providers can reject Worker connections.

The build regenerates `/rooster-source.zip` before copying static assets, so the credits page serves the corresponding source for that build. Generated assets, deployment configuration, local databases, and dependency directories are excluded from Git. Run the dry-run command against your current build to check its packaging and size before deployment.

Cloudflare's Free plan request, CPU, and database quotas still apply. A packaging check does not verify production traffic capacity or third-party player availability. [Current Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
