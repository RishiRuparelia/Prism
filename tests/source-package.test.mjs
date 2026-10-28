import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { unzipSync } from 'fflate';
import { packageSource } from '../scripts/package-source.mjs';

async function fixture(context) {
  const directory = await mkdtemp(join(tmpdir(), 'prism-source-package-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'project');
  await mkdir(root);
  const put = async (name, content = 'fixture') => {
    const file = join(root, name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  };
  return { directory, root, put };
}

test('creates a genuine ZIP containing source, configuration, and binary assets', async (context) => {
  const { root, put } = await fixture(context);
  await put('app/page.tsx', 'export default function Home() {}');
  await put('.openai/hosting.json', '{"d1":"DB","r2":null}');
  const asset = Buffer.from([0, 1, 128, 255, 0, 32]);
  await put('public/content/lesson.bin', asset);
  const result = packageSource({ root });
  const archive = await readFile(result.file);
  assert.equal(archive.readUInt32LE(0), 0x04034b50, 'ZIP local-file signature');
  const entries = unzipSync(archive);
  assert.deepEqual(Object.keys(entries).sort(), ['.openai/hosting.json', 'app/page.tsx', 'public/content/lesson.bin']);
  assert.equal(Buffer.from(entries['app/page.tsx']).toString(), 'export default function Home() {}');
  assert.deepEqual(Buffer.from(entries['public/content/lesson.bin']), asset);
  assert.equal(result.entries, 3);
  assert.equal(result.bytes, archive.length);
});

test('excludes secrets, dependencies, generated files, local state, and previous ZIPs recursively', async (context) => {
  const { root, put } = await fixture(context);
  await put('README.md', 'Source to distribute');
  const excluded = [
    '.env', '.env.production', '.dev.vars', 'cert.pem', 'server.log', 'npm-debug.log.1',
    'node_modules/dependency.js', '.git/config', '.agents/session.json', '.codex/session.json',
    '.wrangler/state/chat.sqlite', '.vinext/state.json', '.next/server.js', '.sites-runtime/state.json',
    '.local/server.json', '.cloudflare/wrangler.json', 'dist/client.js', 'build/client.js',
    'out/client.js', 'work/temporary.js', 'coverage/lcov.info', 'logs/session.txt',
    'outputs/source-package/stale.js', 'next-env.d.ts', 'cache.tsbuildinfo',
    'public/rooster-source.zip',
  ];
  for (const name of excluded) {
    await put(name, 'must not be published');
    await put('nested/' + name, 'must not be published');
  }
  const { file } = packageSource({ root });
  assert.deepEqual(Object.keys(unzipSync(await readFile(file))), ['README.md']);
});

test('rebuilding replaces the archive without retaining deleted source or stale staging files', async (context) => {
  const { root, put } = await fixture(context);
  await put('removed.js', 'old source');
  await put('kept.js', 'first version');
  const { file } = packageSource({ root });
  await unlink(join(root, 'removed.js'));
  await put('kept.js', 'updated version');
  await put('outputs/source-package/removed.js', 'old staging contents');
  packageSource({ root });
  const entries = unzipSync(await readFile(file));
  assert.deepEqual(Object.keys(entries), ['kept.js']);
  assert.equal(Buffer.from(entries['kept.js']).toString(), 'updated version');
  assert.equal(await readFile(join(root, 'outputs/source-package/removed.js'), 'utf8'), 'old staging contents', 'packaging does not delete existing files');
});

test('does not follow a symlinked directory into files outside the project', async (context) => {
  const { directory, root, put } = await fixture(context);
  await put('README.md', 'Source to distribute');
  const outside = join(directory, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'private.txt'), 'not project source');
  try { await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'ENOSYS', 'EACCES'].includes(error.code)) { context.skip('This platform does not permit creating symlink fixtures.'); return; }
    throw error;
  }
  const { file } = packageSource({ root });
  assert.deepEqual(Object.keys(unzipSync(await readFile(file))), ['README.md']);
});
