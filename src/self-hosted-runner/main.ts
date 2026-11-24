export async function selfHostedRunnerMain(
  _args: string[],
): Promise<void> {
  throw new Error('The self-hosted runner is unavailable in this build')
}
