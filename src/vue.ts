/**
 * `idnPlugin_vue` entry (T036): expose the same search UI as a mountable
 * component for `ui: 'external'` setups (FR-019, plugin-options.md).
 *
 * `import { IdnSearch } from 'vitepress-plugin-idn/vue'`
 */

export { default as IdnSearch } from './client/Search.vue'