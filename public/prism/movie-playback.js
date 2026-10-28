import { prepareProxy } from './browser-runtime.js';

function checkedUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Choose an HTTP or HTTPS movie player in Settings.');
  return url.href;
}

export function proxyLandingUrl(destination) {
  return '/prism/go.html?url=' + encodeURIComponent(checkedUrl(destination));
}

export function proxyPreference(settings) {
  return settings?.proxyMovies !== false;
}

export function embeddedFailureMessage(text = '') {
  if (/this site is not available|no available server|there is no (?:running )?application|(?:502\s+bad gateway|503\s+service unavailable)|coolify[\s\S]{0,120}(?:unavailable|not available)/i.test(text)) {
    return 'This player is unavailable. Retry the player or switch connection.';
  }
  if (/sandbox(?:ed)? (?:is )?not allowed|sandbox(?:ed)? (?:iframe|embedding) (?:is )?(?:not allowed|blocked)/i.test(text)) {
    return 'This player does not support embedded playback here. Retry the player or switch connection.';
  }
  return '';
}

export async function prepareMovieProxy({
  navigator = globalThis.navigator,
  secureContext = globalThis.isSecureContext,
  config = globalThis.__uv$config,
  fetch = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  if (!secureContext || !navigator?.serviceWorker) {
    throw new Error('Proxy playback needs HTTPS or localhost. Choose Direct to try playback here.');
  }
  if (!config?.prefix || typeof config.encodeUrl !== 'function') {
    throw new Error('The movie proxy could not load. Refresh Prism, or choose Direct.');
  }
  try {
    return await prepareProxy({ navigator, secureContext, config, fetch, timeoutMs, requireController: true });
  } catch (error) {
    throw new Error('Proxy playback could not start. Refresh Prism, or choose Direct.', { cause: error });
  }
}

export function proxiedVideoUrl(destination, config) {
  return config.prefix + config.encodeUrl(checkedUrl(destination));
}
