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
  timeoutMs = 15000,
} = {}) {
  if (!secureContext || !navigator?.serviceWorker) {
    throw new Error('Proxy playback needs HTTPS or localhost. Choose Direct to try playback here.');
  }
  if (!config?.prefix || typeof config.encodeUrl !== 'function') {
    throw new Error('The movie proxy could not load. Refresh Prism, or choose Direct.');
  }
  let timeout;
  let listener;
  let finished = false;
  const activate = async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    if (finished) return config;
    await navigator.serviceWorker.ready;
    if (finished) return config;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => {
        listener = () => {
          if (navigator.serviceWorker.controller) resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', listener);
        listener();
      });
    }
    return config;
  };
  try {
    return await Promise.race([
      activate(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Proxy playback did not connect. Try again, or choose Direct.')), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (/Proxy playback/.test(error?.message || '')) throw error;
    throw new Error('Proxy playback could not start. Refresh Prism, or choose Direct.');
  } finally {
    finished = true;
    clearTimeout(timeout);
    if (listener) navigator.serviceWorker.removeEventListener('controllerchange', listener);
  }
}

export function proxiedVideoUrl(destination, config) {
  return config.prefix + config.encodeUrl(checkedUrl(destination));
}
