export const dlopen = () => {
  throw new Error("bun:ffi is not available in Node.js runtime")
}
export const FFIType = {}
export const ptr = () => 0
export const CString = class {}
