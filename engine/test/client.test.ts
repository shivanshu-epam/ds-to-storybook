import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FigmaClient, FigmaHttpError } from '../src/figma/client.ts';

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
});
