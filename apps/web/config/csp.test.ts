// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, headersFile } from './csp';

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

  it('allows no remote hosts, so books cannot load remote resources', () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:|\*/);
  });
});

describe('headersFile', () => {
  it('applies the CSP to every path on Cloudflare Pages', () => {
    expect(headersFile()).toBe(`/*\n  Content-Security-Policy: ${CONTENT_SECURITY_POLICY}\n`);
  });
});
