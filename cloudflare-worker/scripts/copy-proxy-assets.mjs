import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'node_modules/@titaniumnetwork-dev/ultraviolet/dist');
const output = path.join(root, 'public/uv');
mkdirSync(output, { recursive: true });
for (const file of ['uv.bundle.js','uv.client.js','uv.handler.js','uv.sw.js','uv.bundle.js.LICENSE.txt']) {
  if (!existsSync(path.join(dir, file))) throw new Error(`Ultraviolet asset ${file} is missing. Install dependencies before copying proxy assets.`);
  cpSync(path.join(dir, file), path.join(output, file));
}
writeFileSync(path.join(output, 'uv.config.js'), `self.__uv$config = { prefix: '/service/', bare: '/bare/', encodeUrl: Ultraviolet.codec.xor.encode, decodeUrl: Ultraviolet.codec.xor.decode, handler: '/uv/uv.handler.js', client: '/uv/uv.client.js', bundle: '/uv/uv.bundle.js', config: '/uv/uv.config.js', sw: '/uv/uv.sw.js' };\n`);
console.log('Ultraviolet browser assets copied.');
