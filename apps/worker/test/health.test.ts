import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { HealthResponse } from '@litsnap/shared';

describe('GET /health', () => {
  it('reports the worker is up', async () => {
    const response = await exports.default.fetch('http://example.com/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual<HealthResponse>({
      status: 'ok',
      service: 'litsnap-worker',
    });
  });

  it('returns 404 for unknown routes', async () => {
    const response = await exports.default.fetch('http://example.com/nope');

    expect(response.status).toBe(404);
  });
});
