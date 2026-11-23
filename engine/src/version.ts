// The ds-sync version, read from its own package.json (src/ and dist/ sit next to it).
import { readFileSync } from 'node:fs';

export const VERSION: string = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
