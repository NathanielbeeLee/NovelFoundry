export function readNovelFoundryEnv(
  suffix: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  // Preserve existing data paths and launch configuration during renaming.
  return env[`NOVELFOUNDRY_${suffix}`] ?? env[`AI_NOVEL_${suffix}`];
}
