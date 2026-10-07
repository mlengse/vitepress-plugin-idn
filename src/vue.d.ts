/**
 * Static type declaration for the `vitepress-plugin-idn/vue` entry (T036).
 *
 * The runtime entry is `dist/vue.js`, which re-exports `<IdnSearch />` from
 * `./client/Search.vue` (the raw SFC ships with the package; consumer sites
 * compile it through their own Vue/Vite pipeline). A `.vue` module cannot be
 * type-emitted by tsup, so this declaration is the public component contract.
 */

import type { Component } from 'vue'

/** The search dialog as a mountable component for `ui: 'external'` setups. */
export declare const IdnSearch: Component