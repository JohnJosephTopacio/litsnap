// TERMS-6: fails when a production dependency has a licence outside the allow-list.
// Usage (root `pnpm check:licenses`): pnpm licenses list --prod --recursive --json | node <this file>
// Runs with Node's built-in TypeScript support, so no build step is needed.
import { readFileSync } from 'node:fs';
import { findDisallowed } from './licenses.ts';

const report = JSON.parse(readFileSync(0, 'utf8')) as Parameters<typeof findDisallowed>[0];
const problems = findDisallowed(report);

if (problems.length > 0) {
  console.error('Production dependencies with licences that need review:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Allowed licences and per-package exceptions: apps/web/config/licenses.ts');
  process.exit(1);
}

const count = Object.values(report).flat().length;
console.log(`Licence check passed: ${String(count)} production packages, all allowed.`);
