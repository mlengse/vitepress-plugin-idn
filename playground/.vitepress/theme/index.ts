/**
 * Fixture theme (T025/T031).
 *
 * Extends the VitePress default theme and swaps in a layout that appends
 * `AuthorUtils` to the `layout-bottom` slot. Because VitePress SSRs the layout,
 * the author utilities' computed output is baked into the static HTML and
 * asserted by `tests/integration/test_author_utility.test.ts` without a
 * browser.
 *
 * The layout is imported statically: a lazy `() => import(...)` is not awaited
 * during SSR and degrades the whole page to `[object Promise]`.
 */

import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'

export default {
  extends: DefaultTheme,
  Layout,
} satisfies Theme