// Narrow transformations for the pinned 55GMS game entry pages. Engine code and
// game author credits remain unchanged; PRISM owns the shared loading interface.
export const SOURCE_COMMIT = '183754e50598d4dab26b9107404d983ca562833b';
export const SOURCE_ARCHIVE_SHA256 = '4093aa890d23f57560a3a2caf042709e05df712fb14d634bb09be854afbbcbb8';
export const SHARED_RUNTIME = Object.freeze({
  '/assets/js/loader-ui.js': '/game-runtime/loader-ui.js',
  '/assets/js/game-loader.js': '/game-runtime/game-loader.js',
  '/assets/js/game-parts.js': '/game-runtime/game-parts.js',
  '/assets/js/cdn-compat.js': '/game-runtime/cdn-compat.js',
  '/assets/js/unity-cdn-loader.js': '/game-runtime/unity-cdn-loader.js',
  '/assets/css/game-loader.css': '/game-runtime/game-loader.css',
  '/assets/css/unity-cdn-loader.css': '/game-runtime/unity-cdn-loader.css',
});
const SITE_SCRIPTS = new Set(['/assets/js/save-agent.js', '/assets/js/script.js']);

function attribute(tag, name) {
  const match = tag.match(new RegExp('\\b' + name + '\\s*=\\s*(["\\\'])(.*?)\\1', 'i'));
  return match?.[2];
}
function pathname(source) {
  try { return new URL(source, 'https://55gms.com').pathname; } catch { return ''; }
}
function stringLiteral(value) {
  // A literal closing script tag would terminate the outer parser-inserted script.
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

// Root-relative URLs follow a page's external <base>, too. Parser-insert the
// helper at its original position with an absolute same-origin URL: classic
// scripts stay blocking, module scripts remain deferred, and currentScript's
// data-title stays available to GameLoader.
function runtimeTag(tag, name, path) {
  const marker = '__PRISM_GAME_ORIGIN__';
  const updated = tag.replace(new RegExp('\\b' + name + '\\s*=\\s*(["\\\'])(.*?)\\1', 'i'),
    name + '="' + marker + path + '?v=prism-1"');
  const [before, after] = updated.split(marker);
  return '<script data-prism-runtime="' + path.split('/').at(-1) + '">document.write(' +
    stringLiteral(before) + ' + location.origin + ' + stringLiteral(after) + ');</script>';
}

export function isSharedLoaderPage(html) {
  return /<script\b[^>]*\bsrc\s*=\s*["']\/assets\/js\/(?:loader-ui|game-loader|unity-cdn-loader)\.js(?:[?"'])/i.test(html);
}

export function gameSourcePath(game) {
  if (!game?.sourcePath || !/^\/misc\/[a-zA-Z0-9_./%?=&+-]+$/.test(game.sourcePath) ||
      /(?:^|\/)\.\.(?:\/|$)/.test(game.sourcePath)) throw new Error('Invalid catalog game source path');
  const url = new URL(game.sourcePath, 'https://55gms.com');
  let path = url.pathname;
  if (path.endsWith('/')) path += 'index.html';
  if (!path.endsWith('.html') || !path.startsWith('/misc/')) throw new Error('Expected a catalog HTML entry');
  return { path, search: url.search };
}

export function gameEntryUrl(game) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game?.id || '') || game.id.length > 100) {
    throw new Error('Invalid game id');
  }
  return '/game-pages/' + game.id + '/index.html' + gameSourcePath(game).search;
}

export function transformGamePage(html, game) {
  if (!isSharedLoaderPage(html)) throw new Error('Entry does not use a supported shared loader');
  const { path } = gameSourcePath(game);
  gameEntryUrl(game); // Validate the output id before any caller writes files.
  let output = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, tag => {
    const source = attribute(tag, 'src');
    if (!source) return tag;
    const path = pathname(source);
    if (source.startsWith('/') && !source.startsWith('//') && SITE_SCRIPTS.has(path)) return '';
    if (/^https:\/\/cdn\.jsdelivr\.net\/gh\/55gms\/gms-ads@[^/]+\/embed\/dist\/sdk\.min\.js(?:[?#]|$)/i.test(source)) return '';
    if (source.startsWith('/') && !source.startsWith('//') && SHARED_RUNTIME[path]) {
      return runtimeTag(tag, 'src', SHARED_RUNTIME[path]);
    }
    return tag;
  });
  output = output.replace(/<link\b[^>]*>/gi, tag => {
    const source = attribute(tag, 'href');
    const path = source && pathname(source);
    return source?.startsWith('/') && !source.startsWith('//') && SHARED_RUNTIME[path]
      ? runtimeTag(tag, 'href', SHARED_RUNTIME[path]) : tag;
  });
  // This one upstream page uses absolute engine URLs and has no <base>. Keep
  // incidental relative assets resolving to its original pinned source folder.
  if (!/<base\b/i.test(output)) {
    const base = 'https://cdn.jsdelivr.net/gh/55gms/55GMS@' + SOURCE_COMMIT + '/static' + path.replace(/[^/]+$/, '');
    output = output.replace(/<head\b[^>]*>/i, tag => tag + '\n  <base href="' + base + '">');
  }
  output = output.replace(/(<title\b[^>]*>)([^<]*)(<\/title>)/gi,
    (_, open, title, close) => open + title.replace(/\s*[|–-]\s*55GMS\b/gi, ' | PRISM') + close);
  // Fail rather than silently retaining an unexpected application helper.
  if (/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']\/assets\/(?:js|css)\//i.test(output)) {
    throw new Error('Unmapped site helper in ' + game.id);
  }
  return '<!-- Imported from 55GMS ' + SOURCE_COMMIT + '; shared runtime adapted for PRISM. AGPL-3.0; see /credits.html. -->\n' + output;
}

