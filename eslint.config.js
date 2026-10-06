import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'playground/.vitepress/dist/**', 'playground/.vitepress/cache/**', 'coverage/**'] },
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
