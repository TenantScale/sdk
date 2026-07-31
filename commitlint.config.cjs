module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Dependabot uses `deps`/`deps(dev)` as the commit type for dependency bumps.
    // Without this, every Dependabot PR fails commitlint once full history is
    // fetched (fetch-depth: 0 in CI).
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
        'deps',
      ],
    ],
  },
}

