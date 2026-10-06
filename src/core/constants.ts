/**
 * Virtual module identity, shared by the node plugin and the client loader.
 * Lives in core so the client bundle never imports node/Vite modules (US2).
 */

export const VIRTUAL_ID = 'virtual:vitepress-plugin-idn/index'
export const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID

/** Client runtime options (language, translations) for the aliased Search.vue. */
export const OPTIONS_ID = 'virtual:vitepress-plugin-idn/options'
export const RESOLVED_OPTIONS_ID = '\0' + OPTIONS_ID
