import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const at = process.argv.indexOf('--port');
const port = at >= 0 ? Number(process.argv[at + 1]) : 8080;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Choose a port between 1024 and 65535.');
mkdirSync('.local', { recursive: true });
const statePath = '.local/server.json', lockPath = '.local/server.lock';
const instanceId = randomUUID();
const state = { pid: process.pid, instanceId, port, url: `http://127.0.0.1:${port}`, project: root, processStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), startedAt: new Date().toISOString(), phase: 'initializing' };
function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } }
function readJson(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } }
function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const lock = openSync(lockPath, 'wx');
      writeFileSync(lock, JSON.stringify({ pid: process.pid, instanceId })); closeSync(lock); return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = readJson(lockPath);
      if (existing?.pid && alive(existing.pid)) throw Error('PRISM is already running or setting up. Read .local/server.log or stop that instance before starting another.');
      try { unlinkSync(lockPath); } catch (removeError) { if (removeError.code !== 'ENOENT') throw removeError; }
    }
  }
  throw Error('Another PRISM launch is in progress. Please try again shortly.');
}
function saveState(phase) {
  state.phase = phase;
  const temp = `${statePath}.${instanceId}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2)); renameSync(temp, statePath);
}
function cleanup() {
  for (const file of [statePath, lockPath]) {
    if (readJson(file)?.instanceId === instanceId) { try { unlinkSync(file); } catch {} }
  }
}
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`Local setup failed (exit ${result.status ?? 'unknown'}). See the output above.`);
}

acquireLock();
process.on('exit', cleanup);
try {
  await new Promise((resolve, reject) => {
    const check = createServer();
    check.once('error', () => reject(Error(`Port ${port} is already in use. Stop the existing server or choose --port another-number.`)));
    check.listen(port, '127.0.0.1', () => check.close(resolve));
  });
  saveState('building');
  run(['scripts/copy-proxy-assets.mjs']);
  run(['scripts/page-icons.mjs']);
  run(['scripts/run-framework.mjs', 'build']);
  saveState('database');
  // Baseline setup is idempotent and preserves messages across restarts.
  const baseline = readFileSync('drizzle/0000_tiresome_skrulls.sql', 'utf8').replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ').replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS ');
  writeFileSync('.local/initialize.sql', baseline);
  run(['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', '.wrangler/state', '--file', '.local/initialize.sql']);
  const child = spawn(process.execPath, ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0'], { cwd: root, stdio: 'inherit', windowsHide: true });
  state.workerPid = child.pid;
  saveState('starting');
  console.log(`PRISM local address: http://127.0.0.1:${port}/`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(); });
  child.once('error', error => { console.error('PRISM local server could not start:', error.message); process.exit(1); });
  child.once('exit', code => { process.exit(code ?? 0); });
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
