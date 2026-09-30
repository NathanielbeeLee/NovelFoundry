function readNovelFoundryEnv(suffix, env = process.env) {
  // An explicitly set current value, including an empty value, wins.
  return env[`NOVELFOUNDRY_${suffix}`] ?? env[`AI_NOVEL_${suffix}`];
}

module.exports = { readNovelFoundryEnv };
