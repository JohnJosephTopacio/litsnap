// Third-party licence notices (TERMS-5) and the licence allow-list (TERMS-6).
// Spec: docs/features/terms-page.md. Runs in Node (Vite build and the CI check), never in the browser.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/** Licences that don't oblige us to release LitSnap's own code. */
export const ALLOWED_LICENSES = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
]);

/** Reviewed one-off exceptions: package name → why it's acceptable. Empty for now. */
export const ALLOWED_PACKAGES: Record<string, string> = {};

/**
 * Whether an SPDX licence expression is acceptable. `A OR B` needs either side (we may choose),
 * `A AND B` needs both. Anything unrecognised, including a missing licence, is not allowed.
 */
export function isAllowedLicense(expression: string | undefined): boolean {
  const spdx = expression?.trim().replace(/^\((.*)\)$/, '$1');
  if (!spdx) return false;
  if (spdx.includes(' OR ')) return spdx.split(' OR ').some(isAllowedLicense);
  if (spdx.includes(' AND ')) return spdx.split(' AND ').every(isAllowedLicense);
  return ALLOWED_LICENSES.has(spdx);
}

/** One package from `pnpm licenses list --json`. */
interface PnpmLicensePackage {
  name: string;
  versions: string[];
  license?: string;
}

/** Problems in `pnpm licenses list --prod --recursive --json` output, one line per package. */
export function findDisallowed(report: Record<string, PnpmLicensePackage[]>): string[] {
  return Object.values(report)
    .flat()
    .filter((pkg) => !(pkg.name in ALLOWED_PACKAGES) && !isAllowedLicense(pkg.license))
    .map((pkg) => `${pkg.name}@${pkg.versions.join(', ')}: ${pkg.license ?? 'no licence'}`)
    .sort();
}

export interface Notice {
  name: string;
  /** Package version, or the source commit for vendored code. */
  version: string;
  /** SPDX identifier; for vendored code the licence text itself says which it is. */
  license: string;
  text: string;
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

function findLicenseFile(dir: string): string | undefined {
  const file = readdirSync(dir).find((name) => LICENSE_FILE.test(name));
  return file && join(dir, file);
}

/**
 * The package directory a bundled module came from, or undefined for our own code.
 * Handles pnpm's layout (`node_modules/.pnpm/x@1/node_modules/x/…`) and scoped packages.
 */
export function packageDirOf(moduleId: string): string | undefined {
  const id = moduleId.replace(/\\/g, '/').replace(/[?#].*$/, '');
  const marker = '/node_modules/';
  const at = id.lastIndexOf(marker);
  if (id.startsWith('\0') || at === -1) return undefined;
  const parts = id.slice(at + marker.length).split('/');
  const nameLength = parts[0]?.startsWith('@') ? 2 : 1;
  if (parts.length <= nameLength) return undefined;
  return id.slice(0, at + marker.length) + parts.slice(0, nameLength).join('/');
}

/** Notices for the npm packages behind the given bundled module ids. Throws if one has no licence file. */
export function packageNotices(moduleIds: Iterable<string>): Notice[] {
  const dirs = new Set<string>();
  for (const id of moduleIds) {
    const dir = packageDirOf(id);
    if (dir) dirs.add(dir);
  }
  return [...dirs].map((dir) => {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
      license?: string;
    };
    const file = findLicenseFile(dir);
    if (!file) throw new Error(`${pkg.name}@${pkg.version} has no licence file in ${dir}`);
    return {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? 'see text',
      text: readFileSync(file, 'utf8').trim(),
    };
  });
}

/**
 * Notices for every licence file under `vendorDir` (decision 0001). The version is the `Commit:`
 * recorded in the nearest `VENDORED.md` above the licence file.
 */
export function vendoredNotices(vendorDir: string): Notice[] {
  if (!existsSync(vendorDir)) return [];
  const files = readdirSync(vendorDir, { recursive: true, encoding: 'utf8' })
    .filter((path) => LICENSE_FILE.test(path.split(/[\\/]/).pop() ?? ''))
    .map((path) => join(vendorDir, path));

  return files.map((file) => {
    const dir = dirname(file);
    return {
      name: `${relative(vendorDir, dir).replace(/\\/g, '/')} (vendored)`,
      version: vendoredCommit(vendorDir, dir) ?? 'unknown commit',
      license: 'see text',
      text: readFileSync(file, 'utf8').trim(),
    };
  });
}

/** Walks up from `dir` to `vendorDir`, returning the commit from the first `VENDORED.md` found. */
function vendoredCommit(vendorDir: string, dir: string): string | undefined {
  const notes = join(dir, 'VENDORED.md');
  if (existsSync(notes)) {
    return /^\W*Commit\W*([0-9a-f]{7,40})/im.exec(readFileSync(notes, 'utf8'))?.[1];
  }
  return dir === vendorDir ? undefined : vendoredCommit(vendorDir, dirname(dir));
}

/** The `third-party-licenses.txt` served with the site, sorted by name. */
export function formatNotices(notices: Notice[]): string {
  const rule = '='.repeat(72);
  const sections = [...notices]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => `${rule}\n${n.name} ${n.version} (${n.license})\n${rule}\n\n${n.text}\n`);
  return [
    'Third-party software in LitSnap',
    '',
    'LitSnap includes the open-source software below. Each is used under its own licence,',
    'reproduced in full. LitSnap itself is not open source: all rights reserved.',
    '',
    ...sections,
  ].join('\n');
}
