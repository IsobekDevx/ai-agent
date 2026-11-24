export type RollbackOptions = {
  list?: boolean
  dryRun?: boolean
  safe?: boolean
}

export async function rollback(
  _target?: string,
  _options?: RollbackOptions,
): Promise<void> {
  throw new Error('The ant-only rollback command is unavailable in this build')
}
