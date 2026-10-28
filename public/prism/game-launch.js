// Optional launch metadata must never keep the original game catalog waiting.
export async function loadGamePages(fetcher = globalThis.fetch, { timeoutMs = 3000 } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  try {
    const loading = (async () => {
      const response = await fetcher('/data/game-pages.json', { cache: 'no-cache', ...(controller ? { signal: controller.signal } : {}) });
      if (!response.ok) return {};
      const data = await response.json();
      if (data?.version !== 1 || !data.pages || typeof data.pages !== 'object' || Array.isArray(data.pages)) return {};
      return Object.fromEntries(Object.entries(data.pages).filter(([id, entry]) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && entry === '/game-pages/' + id + '/index.html'));
    })();
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => { controller?.abort(); reject(new Error('Optional game manifest timed out')); }, timeoutMs);
    });
    return await Promise.race([loading, deadline]);
  } catch { return {}; }
  finally { clearTimeout(timer); controller?.abort(); }
}

// Only the generated entry for this game may replace its original launch URL.
export function gameLaunchUrl(game, pages = {}) {
  const entry = pages?.[game.id];
  if (typeof game.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id) && entry === '/game-pages/' + game.id + '/index.html') return entry;
  return game.usesProxy ? '/browser.html?url=' + encodeURIComponent(game.url) : game.url;
}
