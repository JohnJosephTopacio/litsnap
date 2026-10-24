// @vitest-environment node
// TERMS-5 (notices) and TERMS-6 (allow-list) from docs/features/terms-page.md.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findDisallowed,
  formatNotices,
  isAllowedLicense,
  packageDirOf,
  packageNotices,
  vendoredNotices,
} from './licenses';

const temps: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'litsnap-licenses-'));
  temps.push(dir);
  return dir;
}
function write(path: string, content: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('TERMS-6: licence allow-list', () => {
  it.each(['MIT', 'ISC', 'BSD-3-Clause', 'Apache-2.0', '(MIT OR GPL-3.0)', 'MIT AND ISC'])(
    'allows %s',
    (license) => {
      expect(isAllowedLicense(license)).toBe(true);
    },
  );

  it.each(['GPL-3.0', 'AGPL-3.0-only', 'LGPL-2.1', 'MIT AND GPL-3.0', 'UNKNOWN', '', undefined])(
    'rejects %s',
    (license) => {
      expect(isAllowedLicense(license)).toBe(false);
    },
  );

  it('names each disallowed package with its version and licence', () => {
    const report = {
      MIT: [{ name: 'react', versions: ['19.3.1'], license: 'MIT' }],
      'GPL-3.0': [{ name: 'copyleft-lib', versions: ['2.0.0'], license: 'GPL-3.0' }],
      Unknown: [{ name: 'mystery', versions: ['1.0.0'] }],
    };

    expect(findDisallowed(report)).toEqual([
      'copyleft-lib@2.0.0: GPL-3.0',
      'mystery@1.0.0: no licence',
    ]);
  });
});

describe('TERMS-5: licence notices', () => {
  it.each([
    ['/repo/node_modules/.pnpm/react@19.3.1/node_modules/react/index.js', 'react'],
    ['C:\\repo\\node_modules\\.pnpm\\idb@8\\node_modules\\idb\\build\\index.js', 'idb'],
    ['/repo/node_modules/@scope/pkg/dist/x.js?commonjs-exports', '@scope/pkg'],
  ])('finds the package directory of %s', (id, name) => {
    expect(packageDirOf(id)?.endsWith(`/node_modules/${name}`)).toBe(true);
  });

  it.each(['/repo/apps/web/src/App.tsx', '\0vite/modulepreload-polyfill.js'])(
    'treats %s as our own code',
    (id) => {
      expect(packageDirOf(id)).toBeUndefined();
    },
  );

  it('reads name, version, licence and full text, once per package', () => {
    const pkg = join(tempDir(), 'node_modules', 'tiny');
    write(join(pkg, 'package.json'), '{"name":"tiny","version":"1.2.3","license":"MIT"}');
    write(join(pkg, 'LICENSE'), 'MIT License\n\nCopyright (c) Tiny Authors\n');

    expect(packageNotices([join(pkg, 'a.js'), join(pkg, 'lib', 'b.js')])).toEqual([
      {
        name: 'tiny',
        version: '1.2.3',
        license: 'MIT',
        text: 'MIT License\n\nCopyright (c) Tiny Authors',
      },
    ]);
  });

  it('fails the build when a bundled package has no licence file', () => {
    const pkg = join(tempDir(), 'node_modules', 'bare');
    write(join(pkg, 'package.json'), '{"name":"bare","version":"0.1.0","license":"MIT"}');

    expect(() => packageNotices([join(pkg, 'index.js')])).toThrow(/bare@0.1.0 has no licence file/);
  });

  it('includes every licence under vendor/, with the commit from VENDORED.md', () => {
    const vendor = join(tempDir(), 'vendor');
    write(join(vendor, 'foliate-js', 'VENDORED.md'), '# foliate-js\n\n- Commit: `78914aef4466`\n');
    write(join(vendor, 'foliate-js', 'LICENSE'), 'MIT License (foliate)');
    write(join(vendor, 'foliate-js', 'vendor', 'zip.js', 'LICENSE'), 'BSD 3-Clause (zip.js)');

    const notices = vendoredNotices(vendor);

    expect(notices.map((n) => [n.name, n.version, n.text]).sort()).toEqual([
      ['foliate-js (vendored)', '78914aef4466', 'MIT License (foliate)'],
      ['foliate-js/vendor/zip.js (vendored)', '78914aef4466', 'BSD 3-Clause (zip.js)'],
    ]);
  });

  it('is empty when nothing is vendored yet', () => {
    expect(vendoredNotices(join(tempDir(), 'vendor'))).toEqual([]);
  });

  it('formats notices sorted by name, each with its full text', () => {
    const text = formatNotices([
      { name: 'zeta', version: '1.0.0', license: 'ISC', text: 'ISC text' },
      { name: 'alpha', version: '2.0.0', license: 'MIT', text: 'MIT text' },
    ]);

    expect(text.indexOf('alpha 2.0.0 (MIT)')).toBeLessThan(text.indexOf('zeta 1.0.0 (ISC)'));
    expect(text).toContain('MIT text');
    expect(text).toContain('ISC text');
    expect(text).toContain('all rights reserved');
  });
});
