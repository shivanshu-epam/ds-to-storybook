// The Figma modes of the current story-test run (set per Vitest project in vitest.config.ts; empty = the defaults).
export const testModes: Record<string, string> = JSON.parse(import.meta.env.VITE_DS_MODES ?? '{}');

/** True when this run uses one of these mode sets. {} means the default modes. */
export function inModes(...sets: Record<string, string>[]): boolean {
  return sets.some((set) => (Object.keys(set).length ? Object.entries(set).every(([k, v]) => testModes[k] === v) : Object.keys(testModes).length === 0));
}
