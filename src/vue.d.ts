/**
 * Static type declaration for the `vitepress-plugin-idn/vue` entry (T036).
 *
 * The runtime entry is `dist/vue.js`, which re-exports the component compiled
 * from `./client/Search.vue` at build time (`scripts/build-vue-entry.mjs`)
 * into `dist/client/Search.js`. That output is plain ESM - no `.vue` specifier
 * reaches Node's ESM loader or a non-Vite bundler - and `vue` is its only
 * runtime dependency; site options arrive through the plugin's
 * `__IDN_OPTIONS__` define. A compiled component cannot be type-emitted by
 * tsup, so this declaration is the public component contract.
 */

import type { Component } from 'vue'

/** The search dialog as a mountable component for `ui: 'external'` setups. */
export declare const IdnSearch: Component