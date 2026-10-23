import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { noHtmlInjection } from './apps/web/config/eslint-no-html-injection.ts';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.wrangler/**',
      '**/worker-configuration.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
      // Third-party code keeps upstream formatting (decision 0001).
      'apps/web/vendor/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    // Book text must never become HTML in our UI (RD-25, decision 0002).
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: noHtmlInjection,
  },
  {
    files: ['*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
