import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sha256, writeText } from '../util/core.ts';
import type { FileResponse, LocalVariablesResponse, NodesResponse } from './types.ts';

export class FigmaHttpError extends Error {
  constructor(readonly status: number, readonly url: string, body: string) {
    super(`Figma API ${status} for ${url.replace(/\?.*/, '')}: ${body.slice(0, 200)}`);
  }
}

/** What the extractor needs from Figma; FigmaClient implements it, tests can pass a stub. */
export interface FigmaReader {
  file(fileKey: string, depth?: number): Promise<FileResponse>;
  nodes(fileKey: string, ids: string[], version?: string): Promise<NodesResponse>;
  localVariables(fileKey: string): Promise<LocalVariablesResponse>;
}

/** Optional capability: rendering nodes to SVG (used by the generator for icons). */
export interface FigmaRenderer {
  images(fileKey: string, ids: string[], format: 'svg' | 'png', version?: string): Promise<{ images: Record<string, string | null> }>;
  fetchText(url: string): Promise<string>;
}

export interface FigmaClientOptions {
  token: string;
  apiBase?: string;
  /** Directory for cached responses. Responses are cached per URL; pass refresh to bypass. */
  cacheDir: string;
  refresh?: boolean;
  /** Maximum number of 429 retries before giving up. */
  maxRetries?: number;
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

  /** depth=2 returns pages plus their top-level children (component sets and doc frames on DS pages). */
  file(fileKey: string, depth = 2): Promise<FileResponse> {
    return this.get(`/v1/files/${fileKey}?depth=${depth}`);
  }

  nodes(fileKey: string, ids: string[], version?: string): Promise<NodesResponse> {
    const params = new URLSearchParams({ ids: ids.join(',') });
    if (version) params.set('version', version);
    return this.get(`/v1/files/${fileKey}/nodes?${params}`);
  }

  /** Enterprise plans only. Callers must handle a 403 and fall back. */
  localVariables(fileKey: string): Promise<LocalVariablesResponse> {
    return this.get(`/v1/files/${fileKey}/variables/local`);
  }

  images(fileKey: string, ids: string[], format: 'svg' | 'png', version?: string): Promise<{ images: Record<string, string | null> }> {
    const params = new URLSearchParams({ ids: ids.join(','), format });
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

  private async get<T>(path: string): Promise<T> {
    const url = this.apiBase + path;
    const cacheFile = join(this.opts.cacheDir, `${sha256(url).slice(0, 24)}.json`);
    if (!this.opts.refresh && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8')) as T;

    const maxRetries = this.opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { 'X-Figma-Token': this.opts.token } });
      if (res.status === 429 && attempt < maxRetries) {
        const wait = Number(res.headers.get('retry-after') ?? '60');
        this.opts.log?.(`Figma rate limit hit; waiting ${wait}s (retry ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      const body = await res.text();
      if (!res.ok) throw new FigmaHttpError(res.status, url, body);
      writeText(cacheFile, body);
      return JSON.parse(body) as T;
    }
  }
}
