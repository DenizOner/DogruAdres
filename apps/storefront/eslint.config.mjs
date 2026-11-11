// Next.js 15.5 / ESLint 9: use the bundled Next and TypeScript parsers.
// Keep Storybook's existing recommended rules; do not suppress build errors.
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  ...compat.config({
    extends: [
      'next/core-web-vitals',
      'next/typescript',
      'plugin:storybook/recommended',
    ],
  }),
  {
    ignores: ['.next/**', 'out/**', 'storybook-static/**', 'node_modules/**'],
  },
];
