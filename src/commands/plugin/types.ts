export type ViewState =
  | { type: "menu" }
  | { type: "discover" }
  | { type: "installed" }
  | { type: "marketplaces" }
  | { type: "add-marketplace" }
  | { type: "browse-marketplace"; marketplace?: string }
  | { type: "plugin-details"; plugin?: any }
  | { type: string; [key: string]: any }

export type PluginSettingsProps = {
  onDone: (result?: string) => void
  [key: string]: any
}
