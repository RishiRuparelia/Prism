import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archiveName = 'rooster-source.zip';
const ignoredNames = new Set([
  'node_modules', '.git', '.agents', '.codex', '.wrangler', '.vinext', '.next',
  '.sites-runtime', '.local', '.cloudflare', 'outputs', 'dist', 'build', 'out',
  'work', 'coverage', 'logs', '.DS_Store', 'next-env.d.ts',
]);

function excluded(name) {
  return ignoredNames.has(name) || name.toLowerCase() === archiveName ||
    /^(?:\.env|\.dev\.vars|\.pnp(?:\.|$))/i.test(name) ||
    /(?:\.pem|\.tsbuildinfo)$/i.test(name) || /\.log(?:\.|$)/i.test(name);
}

function inspect(file) {
  try { return lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

/** Package this project only, without a staging directory or external ZIP tools. */
export function packageSource({ root = projectRoot } = {}) {
  root = resolve(root);
  const files = Object.create(null);
  function collect(directory, prefix = '') {
    for (const name of readdirSync(directory).sort()) {
      if (excluded(name)) continue;
      const source = join(directory, name);
      const info = lstatSync(source);
      if (info.isSymbolicLink()) continue;
      const entry = prefix + name;
      if (info.isDirectory()) collect(source, entry + '/');
      else if (info.isFile()) {
        files[entry] = [readFileSync(source), { os: 3, attrs: (info.mode & 0o777) << 16 }];
      }
    }
  }

  const publicDirectory = join(root, 'public');
  const publicInfo = inspect(publicDirectory);
  if (publicInfo && !publicInfo.isDirectory()) throw new Error('The public directory must be a real directory, not a symlink.');
  const file = join(publicDirectory, archiveName);
  const outputInfo = inspect(file);
  if (outputInfo && !outputInfo.isFile()) throw new Error('The source archive output must be a regular file, not a symlink.');

  collect(root);
  const archive = zipSync(files, { level: 6 });
  mkdirSync(publicDirectory, { recursive: true });
  const descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW || 0), 0o644);
  try { writeFileSync(descriptor, archive); }
  finally { closeSync(descriptor); }
  return { file, entries: Object.keys(files).length, bytes: archive.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { file, entries } = packageSource();
  console.log(`Corresponding source ZIP created at ${file} (${entries} files).`);
}
