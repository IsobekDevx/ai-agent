// Minimal declarations for the Bun APIs used by this Node-compatible build.
// Runtime detection remains in application code; these types do not add a Bun
// dependency or claim that the APIs are available under Node.js.
interface BunSocket<Data> {
  data: Data
  write(data: Uint8Array): number
  end(): void
}

interface BunListenOptions<Data> {
  hostname?: string
  port?: number
  socket: {
    open?: (socket: BunSocket<Data>) => void
    data?: (socket: BunSocket<Data>, data: Buffer) => void
    drain?: (socket: BunSocket<Data>) => void
    close?: (socket: BunSocket<Data>) => void
    error?: (socket: BunSocket<Data>, error: Error) => void
  }
}

interface BunServer<Data> {
  readonly port: number
  stop(closeActiveConnections?: boolean): void
}

interface BunSpawnOptions {
  argv0?: string
  cwd?: string
  env?: Record<string, string | undefined>
  stdin?: 'inherit' | 'ignore' | 'pipe' | Blob | ArrayBufferView | string
  stdout?: 'inherit' | 'ignore' | 'pipe'
  stderr?: 'inherit' | 'ignore' | 'pipe'
}

interface BunSubprocess {
  readonly stdout: ReadableStream<Uint8Array> | null
  readonly stderr: ReadableStream<Uint8Array> | null
  readonly exited: Promise<number>
  kill(signal?: number | string): void
}

interface BunWrapAnsiOptions {
  hard?: boolean
  wordWrap?: boolean
  trim?: boolean
}

declare const Bun: {
  embeddedFiles: readonly unknown[]
  gc(force?: boolean): void
  generateHeapSnapshot(format: 'v8', type: 'arraybuffer'): ArrayBuffer
  hash(
    input: string | ArrayBuffer | ArrayBufferView,
    seed?: number | bigint,
  ): number | bigint
  listen<Data>(options: BunListenOptions<Data>): BunServer<Data>
  semver: {
    order(versionA: string, versionB: string): -1 | 0 | 1
    satisfies(version: string, range: string): boolean
  }
  spawn(command: readonly string[], options?: BunSpawnOptions): BunSubprocess
  stringWidth(
    input: string,
    options?: { ambiguousIsNarrow?: boolean },
  ): number
  which(
    command: string,
    options?: { PATH?: string; cwd?: string },
  ): string | null
  wrapAnsi(
    input: string,
    columns: number,
    options?: BunWrapAnsiOptions,
  ): string
  YAML: {
    parse(input: string): unknown
  }
  readonly WebView?: unknown
}
