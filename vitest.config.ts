import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    {
      name: 'raw-md-txt-loader',
      load(id) {
        const cleanId = id.split('?')[0]!
        if (cleanId.endsWith('.md') || cleanId.endsWith('.txt')) {
          const content = readFileSync(cleanId, 'utf8')
          return `export default ${JSON.stringify(content)};`
        }
        if (cleanId.endsWith('.d.ts')) {
          return 'export {};'
        }
        return null
      },
    },
  ],
  resolve: {
    alias: [
      { find: 'bun:bundle', replacement: resolve(__dirname, 'src/shims/bun-bundle.mjs') },
      { find: 'bun:ffi', replacement: resolve(__dirname, 'src/shims/bun-ffi.mjs') },
      { find: 'audio-capture-napi', replacement: resolve(__dirname, 'src/shims/audio-capture-napi.mjs') },
      { find: 'color-diff-napi', replacement: resolve(__dirname, 'src/native-ts/color-diff/index.ts') },
      { find: 'image-processor-napi', replacement: resolve(__dirname, 'src/native-ts/image-processor/index.ts') },
      { find: 'modifiers-napi', replacement: resolve(__dirname, 'src/native-ts/modifiers/index.ts') },
      { find: 'url-handler-napi', replacement: resolve(__dirname, 'src/native-ts/url-handler/index.ts') },
      { find: 'yoga-layout-prebuilt', replacement: resolve(__dirname, 'src/native-ts/yoga-layout/index.ts') },
      { find: '@ant/claude-for-chrome-mcp', replacement: resolve(__dirname, 'src/shims/pkgs/@ant/claude-for-chrome-mcp/index.mjs') },
      { find: '@ant/computer-use-mcp/sentinelApps', replacement: resolve(__dirname, 'src/shims/pkgs/@ant/computer-use-mcp/sentinelApps.mjs') },
      { find: '@ant/computer-use-mcp/types', replacement: resolve(__dirname, 'src/shims/pkgs/@ant/computer-use-mcp/types.mjs') },
      { find: '@ant/computer-use-mcp', replacement: resolve(__dirname, 'src/shims/pkgs/@ant/computer-use-mcp/index.mjs') },
      { find: '@ant/computer-use-input', replacement: resolve(__dirname, 'src/shims/pkgs/@ant/computer-use-input/index.mjs') },
      { find: '@ant/computer-use-swift', replacement: resolve(__dirname, 'src/shims/pkgs/@ant/computer-use-swift/index.mjs') },
      { find: '@anthropic-ai/mcpb', replacement: resolve(__dirname, 'src/shims/pkgs/@anthropic-ai/mcpb/index.mjs') },
      { find: '@anthropic-ai/sandbox-runtime', replacement: resolve(__dirname, 'src/shims/pkgs/@anthropic-ai/sandbox-runtime/index.mjs') },
      { find: '@anthropic-ai/claude-agent-sdk', replacement: resolve(__dirname, 'src/shims/pkgs/@anthropic-ai/claude-agent-sdk/index.mjs') },
      { find: /^src\/(.*)$/, replacement: resolve(__dirname, 'src/$1') },
    ],
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/shims/preload.mjs'],
    include: [
      'tests/**/*.test.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
