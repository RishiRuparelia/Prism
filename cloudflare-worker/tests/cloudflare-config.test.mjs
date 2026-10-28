import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { prepareCloudflare } from '../scripts/prepare-cloudflare.mjs';

const databaseId = '12345678-1234-4abc-8def-123456789abc';
async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'prism-cloudflare-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['dist/server', 'dist/client', 'drizzle', '.openai']) await mkdir(join(root, dir), { recursive: true });
  const built = { name: 'rooster', main: 'index.js', no_bundle: true, compatibility_date: '2026-05-15', compatibility_flags: ['nodejs_compat'], rules: [{ type: 'ESModule', globs: ['**/*.js'] }], assets: { directory: '../client', not_found_handling: 'none' }, vars: { SECRET_TOKEN: 'must-not-copy' }, account_id: 'must-not-copy', d1_databases: [{ binding: 'DB', database_id: '00000000-0000-4000-8000-000000000000' }] };
  await writeFile(join(root, 'dist/server/wrangler.json'), JSON.stringify(built));
  await writeFile(join(root, 'dist/server/index.js'), 'export default { fetch() { return new Response("PRISM"); } };');
  await writeFile(join(root, 'dist/client/index.html'), '<h1>PRISM</h1>');
  await writeFile(join(root, 'drizzle/0000_chat.sql'), 'CREATE TABLE chat_messages (id TEXT);');
  await writeFile(join(root, '.openai/hosting.json'), '{"project_id":"preserve-this"}');
  return { root, built };
}

test('rebases build and migration paths, retains modules, and uses the real DB binding', async (context) => {
  const { root, built } = await fixture(context);
  const { file, config } = await prepareCloudflare({ root, name: 'prism', databaseId });
  const directory = join(root, '.cloudflare');
  assert.equal(file, join(directory, 'wrangler.json'));
  assert.equal(resolve(directory, config.main), join(root, 'dist/server/index.js'));
  assert.equal(resolve(directory, config.base_dir), join(root, 'dist/server'));
  assert.equal(resolve(directory, config.assets.directory), join(root, 'dist/client'));
  assert.equal(resolve(directory, config.d1_databases[0].migrations_dir), join(root, 'drizzle'));
  assert.equal(config.no_bundle, true);
  assert.equal(config.find_additional_modules, true);
  assert.deepEqual(config.rules, built.rules);
  assert.equal(config.d1_databases[0].database_id, databaseId);
  assert.equal(config.d1_databases[0].binding, 'DB');
  assert.equal(config.d1_databases[0].database_name, 'prism-chat');
  assert.equal(config.assets.not_found_handling, 'none');
});

test('does not copy credentials or alter the Sites identity or generated build', async (context) => {
  const { root, built } = await fixture(context);
  await prepareCloudflare({ root, databaseId });
  const output = await readFile(join(root, '.cloudflare/wrangler.json'), 'utf8');
  assert.doesNotMatch(output, /must-not-copy|SECRET_TOKEN|account_id|project_id|vars/);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'dist/server/wrangler.json'), 'utf8')), built);
  assert.equal(await readFile(join(root, '.openai/hosting.json'), 'utf8'), '{"project_id":"preserve-this"}');
  await prepareCloudflare({ root, databaseId, name: 'prism-updated' });
  assert.equal(JSON.parse(await readFile(join(root, '.cloudflare/wrangler.json'), 'utf8')).name, 'prism-updated');
  assert.deepEqual((await readdir(join(root, '.cloudflare'))).sort(), ['wrangler.json']);
});

test('rejects template UUIDs, invalid names, and missing builds before writing a config', async (context) => {
  const { root } = await fixture(context);
  await assert.rejects(prepareCloudflare({ root, databaseId: '00000000-0000-4000-8000-000000000000' }), /real database UUID/);
  await assert.rejects(prepareCloudflare({ root, databaseId, name: '../bad-name' }), /Worker name/);
  await assert.rejects(prepareCloudflare({ root, databaseId, databaseName: 'bad name' }), /database name/);
  await assert.rejects(prepareCloudflare({ root: join(root, 'missing'), databaseId }), /npm run build/);
  await assert.rejects(readFile(join(root, '.cloudflare/wrangler.json')), { code: 'ENOENT' });
});

test('refuses build paths outside the generated output', async (context) => {
  const { root, built } = await fixture(context);
  built.main = '../../scripts/private.js';
  await writeFile(join(root, 'dist/server/wrangler.json'), JSON.stringify(built));
  await assert.rejects(prepareCloudflare({ root, databaseId }), /outside dist/);
});
