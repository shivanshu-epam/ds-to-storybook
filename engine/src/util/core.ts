import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

/** Canonical JSON: object keys sorted, so equal data always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function sha256(value: unknown): string {
  const text = typeof value === 'string' ? value : canonicalJson(value);
  return createHash('sha256').update(text).digest('hex');
}

export function expandHome(path: string): string {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : path;
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function writeJson(path: string, value: unknown): void {
  writeText(path, JSON.stringify(value, null, 2) + '\n');
}

/**
 * Loads KEY=VALUE lines from a .env file into process.env without overriding
 * variables already set. Values are never logged.
 */
export function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    const [, key, raw] = m;
    if (key && process.env[key] === undefined) process.env[key] = raw?.replace(/^['"]|['"]$/g, '') ?? '';
  }
}

/** "Has leading icon#12:3" -> "Has leading icon" (Figma suffixes non-variant property names with an id). */
export function stripPropertyId(name: string): string {
  return name.replace(/#[\d:]+$/, '');
}

/** Loose key for matching names across Figma and code: "Has leading-Icon" -> "hasleadingicon". */
export function looseKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function camelCase(name: string): string {
  const words = name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/);
  return words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join('');
}
