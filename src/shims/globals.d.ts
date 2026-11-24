declare const MACRO: {
  VERSION: string
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL: string
  FEEDBACK_CHANNEL: string
  BUILD_TIME: string
  VERSION_CHANGELOG: string
  ISSUES_EXPLAINER: string
}

declare module "*.md" {
  const content: string
  export default content
}

declare module "*.txt" {
  const content: string
  export default content
}

declare module "bun:bundle" {
  export function feature(name: string): boolean
}
