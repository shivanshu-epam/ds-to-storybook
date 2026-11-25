import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { sha256, writeText } from '../util/core.ts';
import type { FileResponse, LocalVariablesResponse, NodesResponse, StyleMeta } from './types.ts';

export class FigmaHttpError extends Error {
  constructor(readonly status: number, readonly url: string, body: string) {
    super(`Figma API ${status} for ${url.replace(/\?.*/, '')}: ${body.slice(0, 200)}`);
  }
}

/** Figma asked for a wait too long to sit out: usually the token's plan allowance for REST reads is used up. */
export class FigmaRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number, readonly planTier?: string, readonly limitType?: string) {
    const until = new Date(Date.now() + retryAfterSeconds * 1000);
    const human = retryAfterSeconds >= 86400 ? `${Math.round(retryAfterSeconds / 3600)} hours` : retryAfterSeconds >= 3600 ? `${Math.round(retryAfterSeconds / 360) / 10} hours` : `${Math.round(retryAfterSeconds / 60)} minutes`;
    super([
      `Figma's rate limit for this token: it asks to wait ${human} (until about ${until.toISOString().slice(0, 16).replace('T', ' ')} UTC)${planTier || limitType ? ` [plan tier: ${planTier ?? '?'}, limit: ${limitType ?? '?'}]` : ''}.`,
      'Figma limits REST reads by the seat and plan of the token owner; low tiers allow only a few file reads.',
      'Options: use a token from an account with a Dev or Full seat on a paid plan; wait until then (responses already read are cached, so the next run continues); or read a file you own (duplicate a community file into your drafts).',
    ].join(' '));
  }
}

/** What the extractor needs from Figma; FigmaClient implements it, tests can pass a stub. */
export interface FigmaReader {
  file(fileKey: string, depth?: number, version?: string): Promise<FileResponse>;
  nodes(fileKey: string, ids: string[], version?: string, depth?: number): Promise<NodesResponse>;
  /** The file tree containing only the given nodes and their ancestors (finds the page of nested sets). */
  fileWithIds(fileKey: string, ids: string[], version?: string): Promise<FileResponse>;
  localVariables(fileKey: string): Promise<LocalVariablesResponse>;
  /** Local styles seen in the responses so far (keyed by style node id): the file's colour, text and effect styles. */
  seenStyles?(): Record<string, StyleMeta>;
}

/** Optional capability: rendering nodes to SVG (used by the generator for icons). */
export interface FigmaRenderer {
  images(fileKey: string, ids: string[], format: 'svg' | 'png', version?: string, scale?: number): Promise<{ images: Record<string, string | null> }>;
  fetchText(url: string): Promise<string>;
  fetchBinary(url: string): Promise<Buffer>;
}

export interface FigmaClientOptions {
  token: string;
  apiBase?: string;
  /** Directory for cached responses. Responses are cached per URL; pass refresh to bypass. */
  cacheDir: string;
  refresh?: boolean;
  /** Retries for rate limits (429), temporary server errors (5xx) and network failures. */
  maxRetries?: number;
  /** Longest rate-limit wait to sit out (default 300 s); a longer Retry-After stops with FigmaRateLimitError. */
  maxRateLimitWaitSeconds?: number;
  /** First backoff delay for 5xx and network retries (default 2000 ms). */
  retryBaseMs?: number;
  log?: (msg: string) => void;
}

/**
 * Minimal Figma REST client: X-Figma-Token auth, a response cache on disk,
 * and retries that honour Retry-After on HTTP 429 (Tier 1 limits are low).
 */
export class FigmaClient implements FigmaReader, FigmaRenderer {
  private readonly apiBase: string;

  constructor(private readonly opts: FigmaClientOptions) {
    this.apiBase = opts.apiBase ?? 'https://api.figma.com';
  }

  private readonly styles: Record<string, StyleMeta> = {};

  /** Figma lists the styles the returned nodes use; local ones are the design system's foundations. */
  private noteStyles<T extends { styles?: Record<string, StyleMeta>; nodes?: NodesResponse['nodes'] }>(res: T): T {
    const add = (m?: Record<string, StyleMeta>) => { for (const [id, s] of Object.entries(m ?? {})) if (!s.remote) this.styles[id] = s; };
    add(res.styles);
    for (const n of Object.values(res.nodes ?? {})) add(n?.styles);
    return res;
  }

  seenStyles(): Record<string, StyleMeta> {
    return { ...this.styles };
  }

  /** depth=2 returns pages plus their top-level children (component sets and doc frames on DS pages). */
  async file(fileKey: string, depth = 2, version?: string): Promise<FileResponse> {
    return this.noteStyles(await this.get<FileResponse>(`/v1/files/${fileKey}?depth=${depth}${version ? `&version=${encodeURIComponent(version)}` : ''}`));
  }

  async nodes(fileKey: string, ids: string[], version?: string, depth?: number): Promise<NodesResponse> {
    const params = new URLSearchParams({ ids: ids.join(',') });
    if (version) params.set('version', version);
    if (depth) params.set('depth', String(depth));
    return this.noteStyles(await this.get<NodesResponse>(`/v1/files/${fileKey}/nodes?${params}`));
  }

  async fileWithIds(fileKey: string, ids: string[], version?: string): Promise<FileResponse> {
    const params = new URLSearchParams({ ids: ids.join(',') });
    if (version) params.set('version', version);
    return this.noteStyles(await this.get<FileResponse>(`/v1/files/${fileKey}?${params}`));
  }

  /** Enterprise plans only. Callers must handle a 403 and fall back. */
  localVariables(fileKey: string): Promise<LocalVariablesResponse> {
    return this.get(`/v1/files/${fileKey}/variables/local`);
  }

  images(fileKey: string, ids: string[], format: 'svg' | 'png', version?: string, scale?: number): Promise<{ images: Record<string, string | null> }> {
    const params = new URLSearchParams({ ids: ids.join(','), format });
    if (scale) params.set('scale', String(scale));
    if (format === 'svg') params.set('svg_outline_text', 'true');
    if (version) params.set('version', version);
    return this.get(`/v1/images/${fileKey}?${params}`);
  }

  /** Fetches a rendered asset (an S3 URL from the images endpoint), cached by URL path. */
  async fetchText(url: string): Promise<string> {
    const cacheFile = join(this.opts.cacheDir, 'assets', `${sha256(url.replace(/\?.*/, '')).slice(0, 24)}.txt`);
    if (existsSync(cacheFile)) return readFileSync(cacheFile, 'utf8');
    const res = await fetch(url);
    if (!res.ok) throw new FigmaHttpError(res.status, url, await res.text());
    const text = await res.text();
    writeText(cacheFile, text);
    return text;
  }

  /** Fetches a rendered image (an S3 URL from the images endpoint) as bytes, cached by URL path. */
  async fetchBinary(url: string): Promise<Buffer> {
    const cacheFile = join(this.opts.cacheDir, 'assets', `${sha256(url.replace(/\?.*/, '')).slice(0, 24)}.bin`);
    if (existsSync(cacheFile)) return readFileSync(cacheFile);
    const res = await fetch(url);
    if (!res.ok) throw new FigmaHttpError(res.status, url, await res.text());
    const bytes = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, bytes);
    return bytes;
  }

  /** 2s, 6s, 18s… (overridable for tests through retryBaseMs). */
  private backoff(attempt: number): number {
    return (this.opts.retryBaseMs ?? 2000) * 3 ** attempt;
  }

  private async wait(ms: number, message: string): Promise<void> {
    this.opts.log?.(message);
    await new Promise((r) => setTimeout(r, ms));
  }

  private async get<T>(path: string): Promise<T> {
    const url = this.apiBase + path;
    const cacheFile = join(this.opts.cacheDir, `${sha256(url).slice(0, 24)}.json`);
    if (!this.opts.refresh && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8')) as T;

    const maxRetries = this.opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { headers: { 'X-Figma-Token': this.opts.token } });
      } catch (err) {
        // Network failure: retry with backoff, then give up.
        if (attempt >= maxRetries) throw err;
        await this.wait(this.backoff(attempt), `Network error reaching Figma; retrying (${attempt + 1}/${maxRetries})`);
        continue;
      }
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after') ?? '60');
        // Figma limits REST calls by the token owner's seat and plan. A short wait is a burst limit; a long one
        // (hours or days) is the plan's allowance running out: waiting is no answer, so stop and say so.
        const maxWait = this.opts.maxRateLimitWaitSeconds ?? 300;
        if (wait > maxWait || attempt >= maxRetries) {
          await res.text();
          throw new FigmaRateLimitError(wait, res.headers.get('x-figma-plan-tier') ?? undefined, res.headers.get('x-figma-rate-limit-type') ?? undefined);
        }
        await this.wait(wait * 1000, `Figma rate limit hit; waiting ${wait}s (retry ${attempt + 1}/${maxRetries})`);
        continue;
      }
      // Temporary server errors ("please try again later"): retry with backoff.
      if ([500, 502, 503, 504].includes(res.status) && attempt < maxRetries) {
        await res.text();
        await this.wait(this.backoff(attempt), `Figma returned ${res.status}; retrying (${attempt + 1}/${maxRetries})`);
        continue;
      }
      const body = await res.text();
      if (!res.ok) throw new FigmaHttpError(res.status, url, body);
      writeText(cacheFile, body);
      return JSON.parse(body) as T;
    }
  }
}
