import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/game-runtime/loader-ui.js', import.meta.url), 'utf8');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = new Map(); this.events = new Map();
    this.hidden = false; this.className = ''; this.textContent = ''; this.style = { values: new Map(), setProperty(key, value) { this.values.set(key, value); } };
    this.classList = { add: name => { const values = new Set(this.className.split(' ').filter(Boolean)); values.add(name); this.className = [...values].join(' '); }, contains: name => this.className.split(' ').includes(name) };
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, callback) { this.events.set(name, callback); }
}
function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) { const found = find(child, predicate); if (found) return found; }
  return null;
}
function harness({ title = 'Unity WebGL Player | Slope', motion = true, hidden = false, pageUrl = 'http://localhost:8080/game-pages/slope/index.html', baseURI = 'https://cdn.jsdelivr.net/gh/55gms/assets@commit/misc/slope/' } = {}) {
  const head = new Element('head'), body = new Element('body');
  const credits = new Element('p'); credits.textContent = 'Created by the original game author'; body.append(credits);
  const overlay = new Element(); overlay.id = 'game-loading'; overlay.hidden = hidden; body.append(overlay);
  const requests = []; let reloads = 0;
  const document = { head, body, title, baseURI, createElement: tag => new Element(tag), getElementById: id => find(head, node => node.id === id) || find(body, node => node.id === id) };
  const context = {
    document, URL, location: { origin: 'http://localhost:8080', href: pageUrl, reload() { reloads++; } },
    localStorage: { getItem: () => JSON.stringify({ motion }) }, fetch: (...args) => requests.push(args),
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'loader-ui.js' });
  const mount = () => context.LoaderUI.mount(overlay);
  const part = name => find(overlay, node => node.className.split(' ').includes('prism-loader-' + name));
  return { document, overlay, credits, requests, mount, part, get reloads() { return reloads; }, loader: context.LoaderUI };
}

test('mount uses the local stylesheet and title without fetching a catalog or changing game credits', () => {
  const h = harness(); h.overlay.dataset.title = '<Slope & Friends>';
  const api = h.mount();
  assert.deepEqual(Object.keys(api).sort(), ['busy', 'fail', 'ratio', 'set']);
  assert.equal(h.part('title').textContent, '<Slope & Friends>');
  assert.equal(h.document.head.children[0].href, 'http://localhost:8080/game-runtime/loader-ui.css');
  assert.equal(h.requests.length, 0);
  assert.equal(h.credits.textContent, 'Created by the original game author');
  assert.equal(h.document.body.children[0], h.credits);
  assert.equal(h.overlay.hidden, false);
  assert.equal(h.mount(), api, 'Mounting twice must retain the active loader state');
  assert.equal(h.document.head.children.length, 1);
});

test('real byte counts update accessible progress, and download completion waits for engine readiness', () => {
  const h = harness(), api = h.mount();
  api.set(1048576, 4194304, false);
  assert.equal(h.part('track').getAttribute('aria-valuenow'), '25');
  assert.equal(h.part('percent').textContent, '25%');
  assert.equal(h.part('amount').textContent, '1.0 MB of 4.0 MB');
  assert.equal(h.part('status').getAttribute('role'), 'status');
  assert.equal(h.overlay.dataset.state, 'downloading');
  api.set(4194304, 4194304, true);
  assert.equal(h.part('track').getAttribute('aria-valuenow'), '100');
  assert.equal(h.overlay.dataset.state, 'starting');
  assert.equal(h.overlay.hidden, false, 'Files downloaded does not mean the engine is running');
  h.overlay.hidden = true;
  api.busy('Finishing startup');
  assert.equal(h.overlay.hidden, true, 'Only the engine may reveal or hide its overlay');
});

test('unknown file sizes report received bytes without inventing a percentage', () => {
  const h = harness(), api = h.mount();
  assert.equal(h.part('track').getAttribute('aria-valuenow'), null);
  api.set(2097152, 0, false);
  assert.equal(h.part('track').getAttribute('aria-valuenow'), null);
  assert.equal(h.part('percent').textContent, '');
  assert.equal(h.part('amount').textContent, '2.0 MB downloaded');
  assert.equal(h.overlay.dataset.state, 'loading');
  api.busy('Unpacking game files');
  assert.equal(h.part('status').textContent, 'Unpacking game files');
  assert.equal(h.part('amount').textContent, '');
  assert.equal(h.part('track').getAttribute('aria-valuenow'), null);
});

test('engine ratios clamp out-of-range values and invalid byte counts remain indeterminate', () => {
  const h = harness(), api = h.mount();
  api.ratio(.687, false);
  assert.equal(h.part('track').getAttribute('aria-valuenow'), '68');
  api.ratio(20, false);
  assert.equal(h.part('track').getAttribute('aria-valuenow'), '100');
  assert.equal(h.overlay.dataset.state, 'downloading', 'A large progress ratio alone must not signal engine readiness');
  api.set(-100, 100, false);
  assert.equal(h.part('track').getAttribute('aria-valuenow'), '0');
  assert.equal(h.part('amount').textContent, '0 B of 100 B');
  api.set(NaN, Infinity, false);
  assert.equal(h.part('track').getAttribute('aria-valuenow'), null);
  assert.equal(h.part('amount').textContent, '');
  api.ratio(-1, false);
  assert.equal(h.part('percent').textContent, '');
  api.ratio(0, true);
  assert.equal(h.part('percent').textContent, '100%');
  assert.equal(h.overlay.dataset.state, 'starting');
});

test('errors show an explicit retry action and late progress cannot erase the error', () => {
  const h = harness(), api = h.mount(); api.fail();
  assert.equal(h.overlay.dataset.state, 'error');
  assert.equal(h.part('progress').hidden, true);
  assert.equal(h.part('error').hidden, false);
  assert.equal(h.part('retry').hidden, false);
  assert.equal(h.overlay.hidden, false);
  api.set(1, 1, true); api.ratio(1, true); api.busy('Late update');
  assert.equal(h.overlay.dataset.state, 'error');
  assert.equal(h.part('status').textContent, 'Your game could not load');
  h.part('retry').events.get('click')();
  assert.equal(h.reloads, 1);
});

test('both engine overlay IDs preserve hidden state, honor reduced motion, and share one stylesheet', () => {
  const h = harness({ hidden: true, motion: false, title: 'Crazy Cattle 3D | 55GMS' });
  h.mount().set(0, 0, true);
  assert.equal(h.overlay.hidden, true);
  assert.equal(h.overlay.dataset.motion, 'reduced');
  assert.equal(h.part('title').textContent, 'Crazy Cattle 3D');
  const unityOverlay = new Element(); unityOverlay.id = 'unity-cdn-loading'; unityOverlay.dataset.title = 'Amazing Rope Police';
  h.document.body.append(unityOverlay);
  const ui = h.loader.mount(unityOverlay); ui.ratio(.5);
  assert.equal(find(unityOverlay, node => node.className === 'prism-loader-percent').textContent, '50%');
  assert.equal(unityOverlay.hidden, false);
  assert.equal(h.document.head.children.length, 1);
});


test('SVG gradients resolve against the local document when a game uses an external asset base', () => {
  const h = harness({ pageUrl: 'http://localhost:8080/game-pages/slope/index.html?mode=one&level=(2)#old', baseURI: 'https://cdn.example/game/' });
  h.mount();
  const svg = h.part('mark').innerHTML;
  assert.match(svg, /url\(&quot;http:\/\/localhost:8080\/game-pages\/slope\/index\.html\?mode=one&amp;level=\(2\)#prism-face-0&quot;\)/);
  assert.match(svg, /#prism-shadow-0&quot;/);
  assert.match(svg, /#prism-ray-0&quot;/);
  assert.doesNotMatch(svg, /url\(#|cdn\.example|#old/);
});
