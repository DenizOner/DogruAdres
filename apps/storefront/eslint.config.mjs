// Next.js 15.5 / ESLint 9: reuse the installed upstream rules and parsers.
// Bun isolates transitive dependencies. Resolve Next's plugins from its
// own installed package, while keeping Storybook's app-local plugin scope.
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
const nextCompat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  resolvePluginsRelativeTo: dirname(require.resolve('eslint-config-next/package.json')),
  recommendedConfig: js.configs.recommended,
});
const storybookCompat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  ...nextCompat.extends('next/core-web-vitals', 'next/typescript'),
  ...storybookCompat.extends('plugin:storybook/recommended'),
  { ignores: ['.next/**', 'out/**', 'storybook-static/**', 'node_modules/**'] },
];

export default eslintConfig;
