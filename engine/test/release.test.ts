import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { VERSION } from '../src/version.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('release', () => {
  it('ships the CLI and the Claude Code plugin under one version', () => {
    const pkg = JSON.parse(read('../package.json')) as { version: string };
    const plugin = JSON.parse(read('../claude-plugin/.claude-plugin/plugin.json')) as { version: string };
    expect(plugin.version).toBe(pkg.version);
    expect(VERSION).toBe(pkg.version);
  });

  it('has a changelog entry for this version', () => {
    expect(read('../CHANGELOG.md')).toContain(`## ${VERSION}`);
  });

  it('installs the pinned npm version in the user workflow, not a checkout of the repository', () => {
    const workflow = read('../templates/github-workflow.yml');
    expect(workflow).toContain(`DS_SYNC_VERSION: '__DS_SYNC_VERSION__'`);
    expect(workflow).toContain('npm install --global --no-audit --no-fund "ds-sync@$DS_SYNC_VERSION"');
    expect(workflow).not.toMatch(/git clone|RUNNER_TEMP\/ds-sync/);
  });
});
