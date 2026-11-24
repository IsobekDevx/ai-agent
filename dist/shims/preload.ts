import fs from 'fs'
import Module from 'module'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const srcRoot = path.resolve(__dirname, '..')

// 1. Define global MACRO object expected by Claude Code source
;(globalThis as any).MACRO = {
  VERSION: '2.1.89-deepseek',
  PACKAGE_URL: '@anthropic-ai/claude-code',
  NATIVE_PACKAGE_URL: '@anthropic-ai/claude-code',
  FEEDBACK_CHANNEL: 'https://github.com/deepseek-ai',
  BUILD_TIME: '2026-11-23T00:00:00.000Z',
  VERSION_CHANGELOG: 'DeepSeek Native AI Coding Agent Migration',
  ISSUES_EXPLAINER: 'Report issues to your DeepSeek Coding Agent repository',
}

// 2. Hook CJS Module._resolveFilename for bun:bundle, bun:ffi, and src/*
const origResolveFilename = (Module as any)._resolveFilename
;(Module as any)._resolveFilename = function (
  request: string,
  parent: any,
  isMain: boolean,
  options: any,
) {
  if (request === 'bun:bundle') {
    return path.join(srcRoot, 'shims', 'bun-bundle.ts')
  }
  if (request === 'bun:ffi') {
    return path.join(srcRoot, 'shims', 'bun-ffi.ts')
  }
  if (request.startsWith('src/')) {
    const rel = request.slice(4).replace(/^\/+/, '')
    return origResolveFilename.call(
      this,
      path.join(srcRoot, rel),
      parent,
      isMain,
      options,
    )
  }
  return origResolveFilename.call(this, request, parent, isMain, options)
}

// 3. Register .md and .txt extension loaders for CJS require()
const extensions = (Module as any)._extensions
if (extensions) {
  for (const ext of ['.md', '.txt']) {
    extensions[ext] = function (module: any, filename: string) {
      const content = fs.readFileSync(filename, 'utf8')
      module.exports = content
    }
  }
}

// 4. Register ESM loader hook for bun:bundle, bun:ffi, and .md/.txt imports
const esmHooksCode = `
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const srcRoot = ${JSON.stringify(srcRoot)};

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'bun:bundle') {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(srcRoot, 'shims', 'bun-bundle.ts')).href,
    };
  }
  if (specifier === 'bun:ffi') {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(srcRoot, 'shims', 'bun-ffi.ts')).href,
    };
  }
  return nextResolve(specifier, context);
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
