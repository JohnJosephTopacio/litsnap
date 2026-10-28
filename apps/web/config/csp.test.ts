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

  it('allows remote hosts only in connect-src, so books cannot load remote resources', () => {
    const others = CONTENT_SECURITY_POLICY.split('; ').filter((d) => !d.startsWith('connect-src '));
    expect(others.join('; ')).not.toMatch(/https?:|\*/);
  });

  it('CLIENT-8: lets our code fetch the lookup Worker (decision 0003)', () => {
    expect(directive('connect-src')?.split(' ')).toContain(LOOKUP_ORIGIN);
    expect(new URL(LOOKUP_ORIGIN).origin).toBe(LOOKUP_ORIGIN);
    expect(LOOKUP_ORIGIN).toMatch(/^https:\/\//);
  });

  it('GRID-9: lets our code fetch images from Wikimedia, and books still load none (decision 0005)', () => {
    expect(directive('connect-src')).toBe(
      `connect-src 'self' blob: ${LOOKUP_ORIGIN} https://upload.wikimedia.org`,
    );
    expect(directive('img-src')).toBe("img-src 'self' blob: data:");
  });
});

describe('headersFile', () => {
  it('applies the CSP to every path on Cloudflare Pages', () => {
    expect(headersFile()).toBe(`/*\n  Content-Security-Policy: ${CONTENT_SECURITY_POLICY}\n`);
  });
});
