const icons = {
  apps: '<svg class="nav-item-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true" focusable="false"><rect x="1" y="1" width="3.7" height="3.7" rx=".7"/><rect x="7.3" y="1" width="3.7" height="3.7" rx=".7"/><rect x="1" y="7.3" width="3.7" height="3.7" rx=".7"/><rect x="7.3" y="7.3" width="3.7" height="3.7" rx=".7"/></svg>',
  chat: '<svg class="nav-item-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10.8 5.4a4.7 4.7 0 0 1-4.9 4.3c-.7 0-1.4-.1-2-.4L1.3 11l.7-3A4 4 0 0 1 1 5.4a4.7 4.7 0 0 1 4.9-4.3 4.7 4.7 0 0 1 4.9 4.3Z"/><path d="M3.6 5.5h.1m2.2 0H6m2.2 0h.1" stroke-width="1.5"/></svg>',
};

const labels = { games: 'LEARNING', apps: 'EDUCATIONAL APPS' };

/** Preserve navigation destinations and icons while applying the visible labels. */
export function prismNavigation(html) {
  return html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, navigation => {
    navigation = navigation.replace(/(<a\b(?=[^>]*\bclass=["'][^"']*\bnav-logo\b[^"']*["'])[^>]*\bhref=["'])\/(["'])/gi, '$1/prism/index.html$2');
    if (navigation.includes('/prism/movies.html') && !navigation.includes('/prism/apps.html')) {
      navigation = navigation.replace(/<li>(\s*<a\b[^>]*href=["']\/prism\/movies\.html["'])/i, '<li><a href="/prism/apps.html">APPS</a></li><li>$1');
    }
    for (const [page, icon] of Object.entries(icons)) {
      const anchor = new RegExp('(<a\\b[^>]*href=["\"]/prism/' + page + '\\.html["\"][^>]*>)([\\s\\S]*?)(</a>)', 'gi');
      navigation = navigation.replace(anchor, (match, open, content, close) => /<svg\b/i.test(content) ? match : `${open}${icon}\n      ${content.trim()}${close}`);
    }
    for (const [page, label] of Object.entries(labels)) {
      const anchor = new RegExp('(<a\\b[^>]*href=["\']/prism/' + page + '\\.html["\'][^>]*>)([\\s\\S]*?)(</a>)', 'gi');
      const originalLabel = new RegExp('(^|>)(\\s*)' + page + '(\\s*)$', 'i');
      navigation = navigation.replace(anchor, (match, open, content, close) => `${open}${content.replace(originalLabel, (_, prefix, before, after) => `${prefix}${before}${label}${after}`)}${close}`);
    }
    return navigation;
  });
}
