export type SpinnerMode =
  | "requesting"
  | "thinking"
  | "responding"
  | "tool-input"
  | "tool-use"
  | "idle"
  | string

export type RGBColor = {
  r: number
  g: number
  b: number
}
