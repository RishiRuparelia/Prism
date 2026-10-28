// Run against the local production Worker: node tests/proxy-live.mjs [origin]
import assert from 'node:assert/strict';

const origin = process.argv[2] || 'http://127.0.0.1:8080';
let firstManifest;
for (const base of ['/api/transport/', '/bare/']) {
const info = await fetch(new URL(base, origin), { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
assert.equal(info.status, 200);
assert.equal(info.headers.get('location'), null);
const manifest = await info.json();
assert.deepEqual(manifest.versions, ['v3']);
assert.equal(manifest.project.name, 'PRISM');
if (firstManifest) assert.deepEqual(manifest, firstManifest);
else firstManifest = manifest;
const media = await fetch(new URL(`${base}v3/`, origin), {
  headers: {
    'x-bare-url': 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    'x-bare-headers': JSON.stringify({ Range: 'bytes=0-31' }),
  },
  signal: AbortSignal.timeout(20_000),
});
assert.equal(media.status, 200);
assert.equal(media.headers.get('x-bare-status'), '206');
const metadata = JSON.parse(media.headers.get('x-bare-headers'));
assert.match(metadata['content-range'], /^bytes 0-31\/\d+$/);
assert.match(metadata['content-type'], /video/);
assert.equal((await media.arrayBuffer()).byteLength, 32);
console.log(`${base} live media range: 206, correct Content-Range, 32 video bytes.`);

const endpoint = new URL(`${base}v3/`, origin);
endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
await new Promise((resolve, reject) => {
  const socket = new WebSocket(endpoint);
  socket.binaryType = 'arraybuffer';
  const timeout = setTimeout(() => finish(new Error('WebSocket transport timed out.')), 20_000);
  let established = false;
  let textEchoed = false;
  let binaryEchoed = false;
  let complete = false;
  function finish(error) {
    if (complete) return;
    complete = true;
    clearTimeout(timeout);
    socket.close();
    error ? reject(error) : resolve();
  }
  socket.addEventListener('open', () => socket.send(JSON.stringify({
    type: 'connect', remote: 'wss://echo.websocket.org/', protocols: [], headers: {}, forwardHeaders: [],
  })));
  socket.addEventListener('error', () => finish(new Error('WebSocket transport failed.')));
  socket.addEventListener('close', () => { if (!complete) finish(new Error('WebSocket transport closed before verification.')); });
  socket.addEventListener('message', (event) => {
    try {
      if (!established) {
        const data = JSON.parse(event.data);
        assert.equal(data.type, 'open');
        established = true;
        console.log('Live WebSocket: Bare handshake opened.');
        socket.send('prism-proxy-echo');
      } else if (event.data === 'prism-proxy-echo') {
        textEchoed = true;
        console.log('Live WebSocket: text echo received.');
        socket.send(new Uint8Array([3, 1, 4]));
      } else if (event.data instanceof ArrayBuffer) {
        assert.deepEqual(new Uint8Array(event.data), new Uint8Array([3, 1, 4]));
        binaryEchoed = true;
        console.log('Live WebSocket: binary echo received.');
        // A fetch handshake timeout must not terminate an established tunnel.
        setTimeout(() => {
          try {
            assert.equal(socket.readyState, WebSocket.OPEN);
            assert.equal(textEchoed && binaryEchoed, true);
            finish();
          } catch (error) { finish(error); }
        }, 9_000);
      }
    } catch (error) { finish(error); }
  });
});
console.log(`${base} live WebSocket: text and binary echoes preserved; tunnel stayed open.`);
}
