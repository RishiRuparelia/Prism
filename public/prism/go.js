const status = document.querySelector('#status');
const retry = document.querySelector('#retry');
let starting = false;

async function start() {
  if (starting) return;
  starting = true;
  retry.hidden = true;
  status.textContent = 'Bending the light. Connecting to your destination…';
  try {
    const { prepareProxy, readProxyDestination } = await import('/prism/browser-runtime.js');
    const destination = readProxyDestination(location.search);
    const config = await prepareProxy();
    location.replace(config.prefix + config.encodeUrl(destination));
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'The destination could not be opened. Try again.';
    retry.hidden = false;
  } finally { starting = false; }
}

retry.addEventListener('click', start);
start();
