import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'node_modules/@titaniumnetwork-dev/ultraviolet/dist');
const legacyOutput = path.join(root, 'public/uv');
const runtimeOutput = path.join(root, 'public/assets/runtime');
const runtimeFiles = {
  'uv.bundle.js': 'engine.js',
  'uv.client.js': 'client.js',
  'uv.handler.js': 'handler.js',
  'uv.sw.js': 'worker.js',
  'uv.bundle.js.LICENSE.txt': 'LICENSE.txt',
};
for (const file of Object.keys(runtimeFiles)) {
  if (!existsSync(path.join(dir, file))) throw new Error(`Ultraviolet asset ${file} is missing. Install dependencies before copying proxy assets.`);
}
mkdirSync(legacyOutput, { recursive: true });
mkdirSync(runtimeOutput, { recursive: true });
for (const [file, runtimeFile] of Object.entries(runtimeFiles)) {
  cpSync(path.join(dir, file), path.join(legacyOutput, file));
  cpSync(path.join(dir, file), path.join(runtimeOutput, runtimeFile));
}
// Preserve the vendor bundle and the filename referenced by its license notice.
cpSync(path.join(dir, 'uv.bundle.js.LICENSE.txt'), path.join(runtimeOutput, 'uv.bundle.js.LICENSE.txt'));
writeFileSync(path.join(runtimeOutput, 'config.js'), `self.__uv$config = { prefix: '/service/', bare: '/api/transport/', encodeUrl: Ultraviolet.codec.xor.encode, decodeUrl: Ultraviolet.codec.xor.decode, handler: '/assets/runtime/handler.js', client: '/assets/runtime/client.js', bundle: '/assets/runtime/engine.js', config: '/assets/runtime/config.js', sw: '/assets/runtime/worker.js' };\n`);
// Cached pages can keep using their original scripts and transport endpoint.
writeFileSync(path.join(legacyOutput, 'uv.config.js'), `self.__uv$config = { prefix: '/service/', bare: '/bare/', encodeUrl: Ultraviolet.codec.xor.encode, decodeUrl: Ultraviolet.codec.xor.decode, handler: '/uv/uv.handler.js', client: '/uv/uv.client.js', bundle: '/uv/uv.bundle.js', config: '/uv/uv.config.js', sw: '/uv/uv.sw.js' };\n`);
console.log('PRISM runtime assets and legacy browser assets copied.');
