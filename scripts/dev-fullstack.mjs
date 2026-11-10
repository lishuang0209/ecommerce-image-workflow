#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(root, 'apps/video-agent/backend');
const backendOnly = process.argv.includes('--backend-only');
const checkOnly = process.argv.includes('--check');
const port = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid port.`);
  return value;
};
const webPort = port('ECOMMERCE_WEB_PORT', 3020);
const videoPort = port('ECOMMERCE_VIDEO_PORT', 8000);
const packageManager = process.env.npm_execpath;
const checkPort = (value) => new Promise((resolveCheck, reject) => {
  const server = createServer();
  server.once('error', () => reject(new Error(`Port ${value} is occupied. Stop the existing service or choose another port.`)));
  server.listen(value, '127.0.0.1', () => server.close(resolveCheck));
});
try {
  if (!backendOnly && webPort === videoPort) throw new Error('Web and video ports must differ.');
  if (!existsSync(resolve(backend, 'api_server.py'))) throw new Error('Video service source is missing.');
  if (!backendOnly && !packageManager && !checkOnly) throw new Error('Run through npm run dev:all or pnpm dev:all.');
  if (spawnSync('uv', ['--version'], { stdio: 'ignore' }).status !== 0) throw new Error('Install uv before starting the video service.');
  await Promise.all([checkPort(videoPort), ...(!backendOnly ? [checkPort(webPort)] : [])]);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (checkOnly) {
  console.log(`Preflight passed: web ${webPort}, video ${videoPort}.`);
  process.exit(0);
}
const children = [];
const grouped = process.platform !== 'win32';
let stopping = false;
let killTimer;
const signalChild = (child, signal) => {
  if (!child.pid) return;
  try {
    if (grouped) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) { if (error.code !== 'ESRCH') console.error(error.message); }
};
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  children.forEach((child) => signalChild(child, 'SIGTERM'));
  killTimer = setTimeout(() => children.forEach((child) => signalChild(child, 'SIGKILL')), 5000);
  killTimer.unref();
};
const launch = (command, args, cwd, env) => {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit', detached: grouped });
  children.push(child);
  child.once('error', (error) => { console.error(error.message); stop(1); });
  child.once('exit', (code) => { if (!stopping) stop(code || 1); });
  return child;
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stop());
console.log(`Video service: http://127.0.0.1:${videoPort}`);
launch('uv', ['run', '--locked', 'python', 'api_server.py'], backend, { SFA_HOST: '127.0.0.1', SFA_PORT: String(videoPort) });
if (!backendOnly) {
  console.log(`Workspace: http://127.0.0.1:${webPort}`);
  const separator = process.env.npm_config_user_agent?.startsWith('pnpm/') ? [] : ['--'];
  launch(process.execPath, [packageManager, 'run', 'dev', ...separator, '--port', String(webPort)], root,
    { SHORTFILM_BASE_URL: `http://127.0.0.1:${videoPort}` });
}
await Promise.all(children.map((child) => new Promise((done) => child.once('close', done))));
clearTimeout(killTimer);
