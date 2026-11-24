#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const preloadPath = resolve(rootDir, 'src/shims/preload.mjs');
const entryPath = resolve(rootDir, 'src/entrypoints/cli.tsx');
const tsxCli = resolve(rootDir, 'node_modules/tsx/dist/cli.mjs');

const child = spawn(
  process.execPath,
  [tsxCli, '--import', preloadPath, entryPath, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
