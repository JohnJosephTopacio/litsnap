// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, headersFile } from './csp';
import { LOOKUP_ORIGIN } from './lookup';

function directive(name: string) {
  return CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith(`${name} `));
}

describe('CONTENT_SECURITY_POLICY', () => {
  it('only allows our own scripts (decision 0002)', () => {
    expect(directive('script-src')).toBe("script-src 'self'");
  });

  it('blocks everything not explicitly allowed, and framing by other sites', () => {
    expect(directive('default-src')).toBe("default-src 'none'");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('allows no remote hosts except the Worker, so books cannot load remote resources', () => {
    const others = CONTENT_SECURITY_POLICY.split('; ').filter((d) => !d.startsWith('connect-src '));
    expect(others.join('; ')).not.toMatch(/https?:|\*/);
  });

  it('CLIENT-8: lets our code fetch exactly the lookup Worker (decision 0003)', () => {
    expect(directive('connect-src')).toBe(`connect-src 'self' blob: ${LOOKUP_ORIGIN}`);
    expect(new URL(LOOKUP_ORIGIN).origin).toBe(LOOKUP_ORIGIN);
    expect(LOOKUP_ORIGIN).toMatch(/^https:\/\//);
  });
});

describe('headersFile', () => {
  it('applies the CSP to every path on Cloudflare Pages', () => {
    expect(headersFile()).toBe(`/*\n  Content-Security-Policy: ${CONTENT_SECURITY_POLICY}\n`);
  });
});
