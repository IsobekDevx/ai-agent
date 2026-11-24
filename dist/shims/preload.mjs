import fs from 'fs'
import Module from 'module'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import * as esbuild from 'esbuild'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const srcRoot = path.resolve(__dirname, '..')

// 1. Define global MACRO object expected by Claude Code source
globalThis.MACRO = {
  VERSION: '2.1.89-deepseek',
  PACKAGE_URL: '@anthropic-ai/claude-code',
  NATIVE_PACKAGE_URL: '@anthropic-ai/claude-code',
  FEEDBACK_CHANNEL: 'https://github.com/deepseek-ai',
  BUILD_TIME: '2026-11-23T00:00:00.000Z',
  VERSION_CHANGELOG: 'DeepSeek Native AI Coding Agent Migration',
  ISSUES_EXPLAINER: 'Report issues to your DeepSeek Coding Agent repository',
}

const SHIM_MAP = {
  'bun:bundle': path.join(srcRoot, 'shims', 'bun-bundle.mjs'),
  'bun:ffi': path.join(srcRoot, 'shims', 'bun-ffi.mjs'),
  'color-diff-napi': path.join(srcRoot, 'native-ts', 'color-diff', 'index.ts'),
  'image-processor-napi': path.join(srcRoot, 'native-ts', 'image-processor', 'index.ts'),
  'modifiers-napi': path.join(srcRoot, 'native-ts', 'modifiers', 'index.ts'),
  'url-handler-napi': path.join(srcRoot, 'native-ts', 'url-handler', 'index.ts'),
  'audio-capture-napi': path.join(srcRoot, 'shims', 'audio-capture-napi.mjs'),
  '@ant/claude-for-chrome-mcp': path.join(srcRoot, 'shims', 'pkgs', '@ant', 'claude-for-chrome-mcp', 'index.mjs'),
  '@ant/computer-use-mcp': path.join(srcRoot, 'shims', 'pkgs', '@ant', 'computer-use-mcp', 'index.mjs'),
  '@ant/computer-use-mcp/sentinelApps': path.join(srcRoot, 'shims', 'pkgs', '@ant', 'computer-use-mcp', 'sentinelApps.mjs'),
  '@ant/computer-use-mcp/types': path.join(srcRoot, 'shims', 'pkgs', '@ant', 'computer-use-mcp', 'types.mjs'),
  '@ant/computer-use-input': path.join(srcRoot, 'shims', 'pkgs', '@ant', 'computer-use-input', 'index.mjs'),
  '@ant/computer-use-swift': path.join(srcRoot, 'shims', 'pkgs', '@ant', 'computer-use-swift', 'index.mjs'),
  '@anthropic-ai/mcpb': path.join(srcRoot, 'shims', 'pkgs', '@anthropic-ai', 'mcpb', 'index.mjs'),
  '@anthropic-ai/sandbox-runtime': path.join(srcRoot, 'shims', 'pkgs', '@anthropic-ai', 'sandbox-runtime', 'index.mjs'),
  '@anthropic-ai/claude-agent-sdk': path.join(srcRoot, 'shims', 'pkgs', '@anthropic-ai', 'claude-agent-sdk', 'index.mjs'),
}

function resolveTsFile(candidatePath) {
  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    return candidatePath
  }
  const base = candidatePath.endsWith('.js')
    ? candidatePath.slice(0, -3)
    : candidatePath
  for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
    if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) {
      return base + ext
    }
  }
  for (const idx of ['index.ts', 'index.tsx', 'index.js', 'index.mjs']) {
    const idxPath = path.join(base, idx)
    if (fs.existsSync(idxPath)) {
      return idxPath
    }
  }
  return null
}

// 2. Hook CJS Module._resolveFilename
const origResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (Object.prototype.hasOwnProperty.call(SHIM_MAP, request)) {
    return SHIM_MAP[request]
  }
  if (request.startsWith('src/')) {
    const rel = request.slice(4).replace(/^\/+/, '')
    const resolved = resolveTsFile(path.join(srcRoot, rel))
    if (resolved) return resolved
  }
  if (request.startsWith('.') && parent && parent.filename) {
    const parentDir = path.dirname(parent.filename)
    const resolved = resolveTsFile(path.resolve(parentDir, request))
    if (resolved) return resolved
  }
  return origResolveFilename.call(this, request, parent, isMain, options)
}

// 3. Register .md and .txt extension loaders for CJS require()
const extensions = Module._extensions
if (extensions) {
  for (const ext of ['.md', '.txt']) {
    extensions[ext] = function (mod, filename) {
      const content = fs.readFileSync(filename, 'utf8')
      mod.exports = content
    }
  }
}

// 4. Register ESM loader hook
const esmHooksCode = `
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const SHIM_MAP = ${JSON.stringify(SHIM_MAP)};

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(SHIM_MAP, specifier)) {
    const target = SHIM_MAP[specifier];
    if (target.endsWith('.mjs')) {
      return {
        shortCircuit: true,
        url: pathToFileURL(target).href,
      };
    }
    return nextResolve(pathToFileURL(target).href, context);
  }
  if (specifier.endsWith('.d.ts')) {
    return {
      shortCircuit: true,
      url: 'data:text/javascript,export {};',
    };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && context.parentURL && context.parentURL.startsWith('file:')) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidate = path.resolve(parentDir, specifier);
      for (const ext of ['.js', '.mjs', '.ts', '.tsx']) {
        if (fs.existsSync(candidate + ext)) {
          return nextResolve(pathToFileURL(candidate + ext).href, context);
        }
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.md') || url.endsWith('.txt')) {
    const filePath = fileURLToPath(url);
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export default ' + JSON.stringify(content) + ';',
    };
  }
  return nextLoad(url, context);
}
`

if (typeof Module.register === 'function') {
  const dataUrl = `data:text/javascript;base64,${Buffer.from(esmHooksCode).toString('base64')}`
  Module.register(dataUrl, pathToFileURL(__filename))
}
