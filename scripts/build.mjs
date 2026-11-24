#!/usr/bin/env node
/**
 * Build & verification script for claude-deepseek.
 * Produces the dist/ bundle and launcher executable while preserving runtime shims.
 */
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  rmSync,
} from 'node:fs'
import path, { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = resolve(rootDir, 'dist')

mkdirSync(distDir, { recursive: true })

// 1. Transpile and bundle the core DeepSeek API & adapter layer to verify zero syntax/bundle issues
await esbuild.build({
  entryPoints: [
    resolve(rootDir, 'src/services/api/deepseekClient.ts'),
    resolve(rootDir, 'src/services/api/deepseekAdapter.ts'),
    resolve(rootDir, 'src/services/api/deepseek.ts'),
    resolve(rootDir, 'src/utils/model/providers.ts'),
  ],
  outdir: resolve(distDir, 'deepseek'),
  bundle: false,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
})

// 2. Copy preload shim and create dist/cli.js launcher
copyFileSync(
  resolve(rootDir, 'src/shims/preload.mjs'),
  resolve(distDir, 'preload.mjs'),
)

const launcherCode = `#!/usr/bin/env node
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
`

const distCliPath = resolve(distDir, 'cli.js')
writeFileSync(distCliPath, launcherCode, 'utf-8')
chmodSync(distCliPath, 0o755)

if (!existsSync(distCliPath)) {
  console.error('Build failed: dist/cli.js was not generated.')
  process.exit(1)
}

const fullBundlePath = path.join(distDir, 'cli.bundle.mjs')
const builtEntryPath = path.join(distDir, 'claude-deepseek.mjs')
rmSync(fullBundlePath, { force: true })
rmSync(builtEntryPath, { force: true })

await esbuild.build({
  entryPoints: [resolve(rootDir, 'src/entrypoints/cli.tsx')],
  outfile: fullBundlePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  alias: {
    'bun:bundle': resolve(rootDir, 'src/shims/bun-bundle.mjs'),
    'color-diff-napi': resolve(rootDir, 'src/native-ts/color-diff/index.ts'),
  },
  external: [
    'bun:ffi',
    'audio-capture-napi',
    'image-processor-napi',
    'modifiers-napi',
    'url-handler-napi',
    '@ant/*',
    '@anthropic-ai/mcpb',
    '@anthropic-ai/sandbox-runtime',
    '@anthropic-ai/claude-agent-sdk',
  ],
  loader: {
    '.md': 'text',
    '.txt': 'text',
  },
  banner: {
    js: [
      "import { createRequire as __buildCreateRequire } from 'node:module';",
      'const require = __buildCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  define: {
    MACRO: JSON.stringify({
      VERSION: '2.1.89-deepseek',
      PACKAGE_URL: 'claude-deepseek',
      NATIVE_PACKAGE_URL: 'claude-deepseek',
      FEEDBACK_CHANNEL: 'https://github.com/deepseek-ai',
      BUILD_TIME: new Date().toISOString(),
      VERSION_CHANGELOG: 'DeepSeek Native AI Coding Agent Migration',
      ISSUES_EXPLAINER: 'Report issues to your DeepSeek Coding Agent repository',
    }),
  },
  plugins: [
    {
      name: 'reconstructed-imports',
      setup(builder) {
        builder.onResolve(
          { filter: /^jsonc-parser(?:\/lib\/esm\/main\.js)?$/ },
          () => ({
            path: resolve(rootDir, 'node_modules/jsonc-parser/lib/esm/main.js'),
          }),
        )
        builder.onResolve({ filter: /\.d\.ts$/ }, args => ({
          path: args.path,
          namespace: 'empty-declaration',
        }))
        builder.onLoad(
          { filter: /.*/, namespace: 'empty-declaration' },
          () => ({
            contents: 'export {}',
            loader: 'js',
          }),
        )
        builder.onResolve({ filter: /^\.{1,2}\// }, args => {
          const target = resolve(args.resolveDir, args.path)
          const candidates = /\.(?:js|jsx|mjs)$/.test(target)
            ? [
                target,
                ...['.js', '.jsx', '.mjs', '.ts', '.tsx'].map(extension =>
                  target.replace(/\.(?:js|jsx|mjs)$/, extension),
                ),
              ]
            : [
                target,
                `${target}.js`,
                `${target}.jsx`,
                `${target}.mjs`,
                `${target}.ts`,
                `${target}.tsx`,
              ]
          if (
            candidates.some(
              candidate =>
                existsSync(candidate) ||
                ['.js', '.jsx', '.mjs', '.ts', '.tsx'].some(extension =>
                  existsSync(path.join(candidate, `index${extension}`)),
                ),
            )
          ) {
            return undefined
          }
          console.warn(
            `[build] Missing optional module left external: ${args.path} (${path.relative(rootDir, args.importer)})`,
          )
          return { path: args.path, external: true }
        })
      },
    },
  ],
})

cpSync(resolve(rootDir, 'src/shims'), resolve(distDir, 'shims'), {
  recursive: true,
})
cpSync(resolve(rootDir, 'src/native-ts'), resolve(distDir, 'native-ts'), {
  recursive: true,
})
writeFileSync(
  builtEntryPath,
  "import './shims/preload.mjs';\nawait import('./cli.bundle.mjs');\n",
  'utf-8',
)

console.log(
  'Build succeeded: dist/claude-deepseek.mjs, dist/cli.js and dist/deepseek/* generated.',
)
