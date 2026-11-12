import { dirname, resolve } from 'node:path';

import type { GenerateConfig } from './generate/index.ts';
import { expandHome, readJson } from './util/core.ts';

/**
 * How a Figma component property maps to code:
 * - "propName": maps to that prop
 * - null: intentionally has no code equivalent (reported as info)
 * - false: a confirmed code gap — code should support it but does not (reported as a warning)
 */
export type PropMapEntry = string | null | false;

/** Role of a Figma variant axis. `state` axes become states, not props. */
export type AxisRole = 'variant' | 'state';

export interface ComponentTarget {
  /** Stable id of the spec, e.g. "ds.button". */
  id: string;
  archetype: string;
  figma: {
    page: string;
    componentSet: { id: string; name: string };
    docFrames?: string[];
  };
  /** Code to compare against (drift report). Optional: discovered components have none. */
  code?: {
    /** Path inside the repo. */
    file: string;
    export: string;
    stories?: string;
    css?: string;
    mdx?: string;
  };
  /** Figma property name (without the #id suffix) -> code prop name. */
  propMap?: Record<string, PropMapEntry>;
  /** Figma variant axis name -> role. Axes named State/Interaction default to `state`. */
  axisRoles?: Record<string, AxisRole>;
  /** Figma state value -> code expression, e.g. {"Disabled": "disabled", "Error-Selected": "error+checked"}. */
  stateMap?: Record<string, string | null>;
}

export interface Config {
  figma: { fileKey: string; apiBase?: string };
  repo: {
    path: string;
    /** Exported Figma variables (repo-relative), used when the Variables REST API is unavailable. */
    figmaVariables?: string;
    /** CSS files that define token custom properties (repo-relative). */
    tokenCss?: string[];
  };
  components: ComponentTarget[];
  /** Scenario 2: generate a fresh Storybook project from Figma. */
  generate?: GenerateConfig;
}

export interface LoadedConfig extends Config {
  /** Absolute directory the config file lives in. */
  baseDir: string;
  /** Absolute repo path. */
  repoDir: string;
}

export function loadConfig(path: string): LoadedConfig {
  const abs = resolve(path);
  const config = readJson<Config>(abs);
  if (!config.figma?.fileKey) throw new Error(`${path}: figma.fileKey is required`);
  if (!config.repo?.path) throw new Error(`${path}: repo.path is required`);
  if (!Array.isArray(config.components) || config.components.length === 0) throw new Error(`${path}: components[] is empty`);
  const baseDir = dirname(abs);
  return { ...config, baseDir, repoDir: resolve(baseDir, expandHome(config.repo.path)) };
}
