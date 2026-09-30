export function readNovelFoundryEnv(
  suffix: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  // Preserve existing launch configuration; an explicit current value wins.
  return env[`NOVELFOUNDRY_${suffix}`] ?? env[`AI_NOVEL_${suffix}`];
}
