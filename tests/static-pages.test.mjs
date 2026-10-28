import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { parse as parseHtml } from 'parse5';
import { parse as parseJavaScript } from 'acorn';
import test from 'node:test';
import { prismNavigation } from '../scripts/prism-navigation.mjs';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const prismRoot = path.join(publicRoot, 'prism');
const pages = readdirSync(prismRoot).filter(name => name.endsWith('.html'));
const origin = 'http://127.0.0.1:8080';
const checkedScripts = new Set();

test('home and app launches preserve destinations when session storage is blocked', () => {
  for (const pageName of ['index.html', 'apps.html']) {
    const source = readFileSync(path.join(prismRoot, pageName), 'utf8');
    const start = source.indexOf('// ===== UV PROXY');
    const end = source.indexOf('// Quick links', start);
    assert.ok(start >= 0 && end > start, `${pageName}: browser controls are present`);
    for (const blocked of [false, true]) {
      const elements = new Map();
      const getElementById = id => {
        if (!elements.has(id)) {
          const classes = new Set();
          elements.set(id, {
            value: '', src: '', events: {},
            classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
            addEventListener(type, callback) { this.events[type] = callback; },
          });
        }
        return elements.get(id);
      };
      const context = {
        document: { getElementById },
        localStorage: { getItem: () => null },
        sessionStorage: { setItem() { if (blocked) throw new Error('Storage is unavailable'); } },
      };
      runInNewContext(source.slice(start, end), context);
      const destination = 'https://example.com/path?q=a%20b&other=two#section';
      context.openOverlay(destination);
      assert.equal(new URL(getElementById('proxy-iframe').src, origin).searchParams.get('url'), destination, `${pageName}: initial launch with blocked=${blocked}`);
      assert.equal(getElementById('proxy-overlay').classList.contains('open'), true);
      getElementById('overlay-url').value = 'https://example.org/next?a=1&b=2';
      getElementById('overlay-url').events.keydown({ key: 'Enter' });
      assert.equal(new URL(getElementById('proxy-iframe').src, origin).searchParams.get('url'), 'https://example.org/next?a=1&b=2', `${pageName}: overlay navigation with blocked=${blocked}`);
    }
  }
});

function descendants(node) {
  return [node, ...(node.childNodes || []).flatMap(descendants), ...(node.content ? descendants(node.content) : [])];
}
function attributes(node) { return Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value])); }
function localFile(url, pageName, context) {
  assert.ok(url.startsWith('/') && !url.startsWith('//'), `${pageName}: ${context} must use a root-relative local URL: ${url}`);
  const parsed = new URL(url, origin);
  const file = path.resolve(publicRoot, '.' + decodeURIComponent(parsed.pathname));
  assert.ok(file.startsWith(publicRoot), `${pageName}: ${context} must stay inside public/`);
  assert.ok(existsSync(file) && statSync(file).isFile(), `${pageName}: missing ${context}: ${parsed.pathname}`);
  return file;
}
function checkScript(file) {
  if (checkedScripts.has(file)) return;
  checkedScripts.add(file);
  const source = readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /openplayer/i, `${path.basename(file)}: obsolete OpenPlayer must be absent`);
  const tree = parseJavaScript(source, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const statement of tree.body) {
    if (!['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(statement.type) || !statement.source) continue;
    const specifier = statement.source.value;
    if (/^https?:/.test(specifier)) continue;
    const imported = specifier.startsWith('/')
      ? localFile(specifier, path.basename(file), 'module import')
      : path.resolve(path.dirname(file), specifier);
    assert.ok(existsSync(imported), `${path.basename(file)}: missing import ${specifier}`);
    checkScript(imported);
  }
}

test('every Prism page has one valid SVG/ICO icon pair and existing root-relative assets', () => {
  assert.ok(pages.includes('index.html') && pages.includes('chat.html') && pages.includes('movies.html'));
  for (const pageName of pages) {
    const source = readFileSync(path.join(prismRoot, pageName), 'utf8');
    assert.doesNotMatch(source, /openplayer/i, `${pageName}: obsolete OpenPlayer must be absent`);
    const nodes = descendants(parseHtml(source));
    const links = nodes.filter(node => node.tagName === 'link').map(attributes);
    const icons = links.filter(link => link.rel === 'icon');
    const alternateIcons = links.filter(link => link.rel === 'alternate icon');
    assert.equal(icons.length, 1, `${pageName}: expected exactly one primary icon`);
    assert.equal(alternateIcons.length, 1, `${pageName}: expected exactly one fallback icon`);
    assert.equal(links.filter(link => link.rel === 'shortcut icon').length, 0, `${pageName}: no duplicate legacy icon`);
    assert.equal(icons[0].type, 'image/svg+xml', `${pageName}: primary icon should be SVG`);
    const expected = pageName === 'chat.html' ? 'chat-icon' : 'favicon';
    assert.equal(new URL(icons[0].href, origin).pathname, `/${expected}.svg`, `${pageName}: icon identity`);
    assert.equal(new URL(alternateIcons[0].href, origin).pathname, `/${expected}.ico`, `${pageName}: fallback icon identity`);
    for (const link of links) {
      if (!['icon', 'alternate icon', 'apple-touch-icon', 'stylesheet'].includes(link.rel)) continue;
      if (/^https:\/\//.test(link.href)) {
        assert.equal(new URL(link.href).hostname, 'fonts.googleapis.com', `${pageName}: unexpected external stylesheet`);
        continue;
      }
      const file = localFile(link.href, pageName, link.rel);
      if (link.rel === 'icon') assert.match(readFileSync(file, 'utf8'), /<svg\b/, `${pageName}: SVG icon must contain SVG`);
      if (link.rel === 'alternate icon') {
        const bytes = readFileSync(file);
        assert.equal(bytes.readUInt16LE(2), 1, `${pageName}: fallback must be a real ICO file`);
        assert.ok(bytes.length > 22, `${pageName}: fallback icon must contain image data`);
      }
    }
    for (const node of nodes.filter(node => node.tagName === 'script')) {
      const attrs = attributes(node);
      if (attrs.src) {
        const file = localFile(attrs.src, pageName, 'script');
        if (file.startsWith(prismRoot + path.sep)) checkScript(file);
      } else {
        const inline = (node.childNodes || []).map(child => child.value || '').join('');
        if (inline.trim()) parseJavaScript(inline, { ecmaVersion: 'latest', sourceType: attrs.type === 'module' ? 'module' : 'script' });
      }
    }
  }
});

test('main Prism navigation links consistently target existing pages on the same local origin', () => {
  const expected = ['/prism/apps.html', '/prism/games.html', '/prism/movies.html', '/prism/chat.html', '/prism/settings.html'];
  for (const pageName of pages.filter(name => name !== 'go.html')) {
    const document = parseHtml(readFileSync(path.join(prismRoot, pageName), 'utf8'));
    const navigation = descendants(document).find(node => node.tagName === 'nav');
    assert.ok(navigation, `${pageName}: main navigation missing`);
    const hrefs = descendants(navigation).filter(node => node.tagName === 'a').map(node => attributes(node).href);
    for (const href of expected) {
      assert.equal(hrefs.filter(value => value === href).length, 1, `${pageName}: expected one navigation link to ${href}`);
      localFile(href, pageName, 'navigation target');
    }
    for (const href of hrefs) {
      assert.ok(href === '/' || href.startsWith('/prism/'), `${pageName}: navigation must use local root paths: ${href}`);
      assert.equal(new URL(href, origin).origin, origin);
    }
    for (const section of ['apps', 'chat']) {
      const link = descendants(navigation).find(node => node.tagName === 'a' && attributes(node).href === `/prism/${section}.html`);
      const icons = descendants(link).filter(node => node.tagName === 'svg');
      assert.equal(icons.length, 1, `${pageName}: ${section} needs one visible inline navigation symbol`);
      assert.equal(attributes(icons[0]).width, '12', `${pageName}: ${section} icon should match the other 12px navigation symbols`);
      assert.equal(attributes(icons[0])['aria-hidden'], 'true', `${pageName}: decorative ${section} icon should not repeat the label for screen readers`);
    }
  }
});

test('navigation icon generation is repeatable and mobile CSS retains the navigation symbols', () => {
  const original = '<nav><ul><li><a href="/prism/movies.html">MOVIES</a></li><li><a class="active" href="/prism/chat.html">CHAT</a></li></ul></nav>';
  const once = prismNavigation(original);
  assert.equal(prismNavigation(once), once, 'Repeated builds must not duplicate links or symbols');
  const navigation = descendants(parseHtml(once)).find(node => node.tagName === 'nav');
  for (const section of ['apps', 'chat']) {
    const links = descendants(navigation).filter(node => node.tagName === 'a' && attributes(node).href === `/prism/${section}.html`);
    assert.equal(links.length, 1);
    assert.equal(descendants(links[0]).filter(node => node.tagName === 'svg').length, 1);
  }
  for (const file of ['controls.css', 'enhancements.css']) {
    assert.doesNotMatch(readFileSync(path.join(prismRoot, file), 'utf8'), /\.nav-links\s+a\s+svg\s*\{[^}]*display\s*:\s*none/i, `${file}: mobile navigation must retain its symbols`);
  }
});
