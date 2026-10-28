import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const placeholder = '00000000-0000-4000-8000-000000000000';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function contained(root, target) {
  const value = relative(root, target);
  return value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value);
}

function configPath(directory, target) {
  const value = relative(directory, target).split(sep).join('/');
  return value.startsWith('.') ? value : './' + value;
}

async function atomicWrite(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

/** Prepare local configuration only. This function never runs Wrangler or fetch. */
export async function prepareCloudflare({ root = projectRoot, name = 'prism', databaseId, databaseName = 'prism-chat' } = {}) {
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Choose a Worker name of 1–63 lowercase letters, digits, or hyphens, starting with a letter.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(databaseName)) throw new Error('Choose a database name of 1–63 letters, digits, underscores, or hyphens.');
  if (typeof databaseId !== 'string' || !uuid.test(databaseId) || databaseId.toLowerCase() === placeholder || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(databaseId)) {
    throw new Error('Pass the real database UUID returned by `npx wrangler d1 create prism-chat` as --database-id.');
  }
  root = resolve(root);
  const serverDirectory = join(root, 'dist', 'server');
  const builtFile = join(serverDirectory, 'wrangler.json');
  let built;
  try { built = JSON.parse(await readFile(builtFile, 'utf8')); }
  catch { throw new Error('The Cloudflare build is missing or invalid. Run `npm run build` first.'); }
  if (built.no_bundle !== true || typeof built.main !== 'string' || !Array.isArray(built.rules) ||
    typeof built.assets?.directory !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(built.compatibility_date || '')) {
    throw new Error('The generated Worker configuration is incomplete. Run `npm run build` again.');
  }
  const main = resolve(serverDirectory, built.main);
  const baseDirectory = built.base_dir ? resolve(serverDirectory, built.base_dir) : dirname(main);
  const assetsDirectory = resolve(serverDirectory, built.assets.directory);
  if (!contained(serverDirectory, main) || !contained(serverDirectory, baseDirectory) || !contained(join(root, 'dist', 'client'), assetsDirectory)) {
    throw new Error('The generated build paths point outside dist/server or dist/client. Rebuild before preparing deployment.');
  }
  try {
    if (!(await stat(main)).isFile() || !(await stat(assetsDirectory)).isDirectory()) throw new Error('Missing build output');
  } catch { throw new Error('Worker JavaScript or client assets are missing. Run `npm run build` first.'); }
  const migrationsDirectory = join(root, 'drizzle');
  const migrations = await readdir(migrationsDirectory).catch(() => []);
  if (!migrations.some(file => /^\d+.*\.sql$/.test(file))) throw new Error('No SQL migrations were found in drizzle/.');

  const directory = join(root, '.cloudflare');
  // Copy only runtime build fields. Never carry .env data, tokens, account
  // credentials, template bindings, or a Sites project identity into this file.
  const config = {
    name,
    main: configPath(directory, main),
    base_dir: configPath(directory, baseDirectory),
    compatibility_date: built.compatibility_date,
    ...(Array.isArray(built.compatibility_flags) ? { compatibility_flags: built.compatibility_flags } : {}),
    no_bundle: true,
    find_additional_modules: true,
    preserve_file_names: true,
    rules: built.rules,
    assets: { ...built.assets, directory: configPath(directory, assetsDirectory) },
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: databaseId.toLowerCase(), migrations_dir: configPath(directory, migrationsDirectory) }],
    workers_dev: true,
    observability: { enabled: true },
  };
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'wrangler.json');
  await atomicWrite(file, JSON.stringify(config, null, 2) + '\n');
  return { file, config };
}

function argumentsFrom(values) {
  const result = {};
  const flags = { '--name': 'name', '--database-id': 'databaseId', '--database-name': 'databaseName' };
  for (let i = 0; i < values.length; i++) {
    const key = flags[values[i]];
    if (!key || !values[i + 1] || values[i + 1].startsWith('--')) throw new Error('Usage: node scripts/prepare-cloudflare.mjs --name prism --database-id YOUR-D1-UUID [--database-name prism-chat]');
    if (result[key] !== undefined) throw new Error(`Do not repeat ${values[i]}.`);
    result[key] = values[++i];
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).includes('--help')) {
    console.log('Usage: node scripts/prepare-cloudflare.mjs --name prism --database-id YOUR-D1-UUID [--database-name prism-chat]\nCreates .cloudflare/wrangler.json from the existing build. No login, account changes, database creation, or deployment.');
  } else {
    try {
      const { file } = await prepareCloudflare(argumentsFrom(process.argv.slice(2)));
      console.log(`Cloudflare configuration prepared: ${file}\nNothing was uploaded. Follow CLOUDFLARE.md to migrate the database and deploy when ready.`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
