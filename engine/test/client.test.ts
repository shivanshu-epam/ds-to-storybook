import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FigmaClient, FigmaHttpError, FigmaRateLimitError } from '../src/figma/client.ts';

const client = (maxRetries = 3) => new FigmaClient({ token: 't', cacheDir: mkdtempSync(join(tmpdir(), 'ds-client-')), maxRetries, retryBaseMs: 1 });
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('FigmaClient retries', () => {
  it('retries temporary server errors, then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(500, { err: 'Error retrieving file, please try again later' }))
      .mockResolvedValueOnce(reply(503, {}))
      .mockResolvedValueOnce(reply(200, { name: 'F', version: '1', lastModified: '', document: { id: '0:0', name: 'D', type: 'DOCUMENT' } }));
    vi.stubGlobal('fetch', fetchMock);
    const file = await client().file('KEY');
    expect(file.name).toBe('F');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries network failures', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(reply(200, { nodes: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client().nodes('KEY', ['1:1'])).resolves.toEqual({ nodes: {} });
  });

  it('gives up after maxRetries and does not retry client errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => reply(500, {})));
    await expect(client(2).file('KEY')).rejects.toBeInstanceOf(FigmaHttpError);
    const forbidden = vi.fn().mockImplementation(async () => reply(403, { err: 'Forbidden' }));
    vi.stubGlobal('fetch', forbidden);
    await expect(client().localVariables('KEY')).rejects.toMatchObject({ status: 403 });
    expect(forbidden).toHaveBeenCalledTimes(1);
  });

  it('stops at once when Figma asks for a long wait (the plan allowance is used up), and says why', async () => {
    const limited = vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '399949', 'x-figma-plan-tier': 'starter', 'x-figma-rate-limit-type': 'low' } }));
    vi.stubGlobal('fetch', limited);
    const err = await client().file('KEY').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FigmaRateLimitError);
    expect((err as Error).message).toMatch(/wait 111 hours .*plan tier: starter, limit: low.*Dev or Full seat/);
    expect(limited).toHaveBeenCalledTimes(1);
  });
});
