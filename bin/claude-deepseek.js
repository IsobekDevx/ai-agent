#!/usr/bin/env node
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const preload = path.join(rootDir, 'src', 'shims', 'preload.mjs')
const builtEntry = path.join(rootDir, 'dist', 'claude-deepseek.mjs')
const hasBuiltEntry = existsSync(builtEntry)
const entry = hasBuiltEntry
  ? builtEntry
  : path.join(rootDir, 'src', 'entrypoints', 'cli.tsx')
const args = hasBuiltEntry
  ? [entry, ...process.argv.slice(2)]
  : [tsxCli, '--import', preload, entry, ...process.argv.slice(2)]

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    CLAUDE_CODE_USE_DEEPSEEK: process.env.CLAUDE_CODE_USE_DEEPSEEK ?? '1',
  },
})
const forwardedSignals = ['SIGINT', 'SIGTERM', 'SIGHUP']
const forwardSignal = signal => {
  if (!child.killed) child.kill(signal)
}
const signalForwarders = forwardedSignals.map(signal => {
  const forwarder = () => forwardSignal(signal)
  process.on(signal, forwarder)
  return { signal, forwarder }
})

let settled = false
const finish = (code, signal) => {
  if (settled) return
  settled = true
  for (const { signal, forwarder } of signalForwarders) {
    process.removeListener(signal, forwarder)
  }
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 1
}

child.once('error', error => {
  console.error(error.message)
  finish(1, null)
})
child.once('close', finish)
