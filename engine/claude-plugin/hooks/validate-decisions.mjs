#!/usr/bin/env node
// PostToolUse hook: when Claude writes or edits ds-sync.decisions.json, run "ds-sync decisions validate".
// Exit 2 shows the errors to Claude so it fixes them before going on. Every other file: exit 0, no output.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let file = '';
try { file = JSON.parse(input)?.tool_input?.file_path ?? ''; } catch { process.exit(0); }
if (basename(file) !== 'ds-sync.decisions.json') process.exit(0);

const dir = dirname(file);
const root = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const bundled = join(root, '..', 'dist', 'cli.js');
const [cmd, args] = existsSync(bundled) ? [process.execPath, [bundled]] : ['npx', ['--no-install', 'ds-sync']];
const config = join(dir, 'ds-sync.config.json');
const r = spawnSync(cmd, [...args, 'decisions', 'validate', ...(existsSync(config) ? ['--config', config] : [])], { cwd: dir, encoding: 'utf8' });
if (r.status === 0) process.exit(0);
const output = `${r.stderr ?? ''}${r.stdout ?? ''}`;
if (!/Decisions: \d+ set/.test(output)) {
  // The validator itself could not run (ds-sync not installed here): say so, but do not block Claude.
  process.stderr.write(`Could not run "ds-sync decisions validate" (install ds-sync in this project to validate decisions automatically).\n`);
  process.exit(1);
}
process.stderr.write(`ds-sync decisions validate failed for ${file}. Fix these before continuing:\n${r.stderr || r.stdout}`);
process.exit(2);
