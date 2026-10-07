import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.vitepress/**',
      'playground/.vitepress/dist/**',
      'playground/.vitepress/cache/**',
      'coverage/**',
      // T049: the KBBI validation toolkit lives outside the published package,
      // but it is still linted and typechecked. Only its generated workdir is
      // ignored - the snapshot data must never reach git or the package.
      '.kbbi/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.vue'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: { ...globals.browser },
      parser: vueParser,
      parserOptions: { parser: tseslint.parser },
    },
  },
)
