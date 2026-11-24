import type { Buffer } from "node:buffer"

export interface SharpInstance {
  metadata(): Promise<{ width: number; height: number; format: string }>
  resize(
    width: number,
    height: number,
    options?: { fit?: string; withoutEnlargement?: boolean },
  ): SharpInstance
  jpeg(options?: { quality?: number }): SharpInstance
  png(options?: {
    compressionLevel?: number
    palette?: boolean
    colors?: number
  }): SharpInstance
  webp(options?: { quality?: number }): SharpInstance
  toBuffer(): Promise<Buffer>
}

export type SharpFunction = (input: Buffer) => SharpInstance

export interface ClipboardImage {
  png: Buffer
  originalWidth: number
  originalHeight: number
  width: number
  height: number
}

export interface NativeImageProcessor {
  hasClipboardImage?: () => boolean
  readClipboardImage?: (
    maxWidth: number,
    maxHeight: number,
  ) => ClipboardImage | null
}

export const sharp: SharpFunction
export default sharp
export function getNativeModule(): NativeImageProcessor | null
