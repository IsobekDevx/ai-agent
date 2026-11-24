// Match the command loader's async signature without reading workflow files or
// registering commands in CLI-only builds.
export async function getWorkflowCommands(_cwd) {
  return []
}
