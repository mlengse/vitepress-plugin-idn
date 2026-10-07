/**
 * Virtual module identity, shared by the node plugin and the client loader.
 * Lives in core so the client bundle never imports node/Vite modules (US2).
 */

export const VIRTUAL_ID = 'virtual:vitepress-plugin-idn/index'
export const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID

/** Client runtime options (language, translations) for the aliased Search.vue. */
export const OPTIONS_ID = 'virtual:vitepress-plugin-idn/options'
export const RESOLVED_OPTIONS_ID = '\0' + OPTIONS_ID

/** Client hyphenation runtime, imported for its side effect (T030, T031). */
export const HYPHENATE_RUNTIME_ID = 'virtual:vitepress-plugin-idn/hyphenate'
export const RESOLVED_HYPHENATE_RUNTIME_ID = '\0' + HYPHENATE_RUNTIME_ID

/** Proxy module wrapping `@theme/index` so the runtime loads in every theme (T031). */
export const THEME_PROXY_ID = '\0vitepress-plugin-idn:theme-proxy'

/** Package version surfaced in the UI (`data-idn-version` attribute) and diagnostics. */
export const IDN_VERSION = '0.1.0'
