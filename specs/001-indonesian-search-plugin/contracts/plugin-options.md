# Contract: Plugin Registration & Options

**Package**: `vitepress-plugin-idn` (working name) | **Spec**: FR-007, FR-008, FR-016–FR-020

## Registration (single step, zero required config — FR-019)

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress'
import { idnPlugin } from 'vitepress-plugin-idn'

export default defineConfig({
  vite: {
    plugins: [idnPlugin()] // ← the only required line; all options optional
  }
})
```

**Guarantees**

- G1: `idnPlugin()` with no arguments yields working Indonesian search, default-theme nav-bar search button, and Indonesian language processing.
- G2: The plugin never modifies files outside VitePress's normal build output; dev mode only serves virtual modules.
- G3: The plugin performs no network requests at build time (FR-021).
- G4: Existing `buildEnd`/`transformHead` hooks composed by the host are chained, not replaced.

## Options schema

```ts
export interface IdnPluginOptions {
  /** Master switch. false → no index, no UI; build still succeeds. Default: true */
  enabled?: boolean

  /** Site processing language: stemmer, stop words, hyphenation. Default: 'id' */
  language?: 'id' | 'en'

  /** Only pages matching these globs (relative to srcDir) are indexed. Default: ['**/*.md'] */
  include?: string[]
  /** Removed after include. frontmatter `search: false` always wins. Default: [] */
  exclude?: string[]

  /** Client-side soft-hyphen insertion. Default: { enabled: false, ... } */
  hyphenate?: {
    enabled?: boolean
    /** CSS selector of text containers. Default: '.vp-doc p, .vp-doc li, .vp-doc td' */
    selector?: string
    /** Words shorter than this are untouched. Default: 6 */
    minWordLength?: number
  }

  /**
   * 'nav'      → alias search UI into default theme nav bar (default)
   * 'external' → no alias; host mounts <IdnSearch /> (third-party themes)
   * false      → index only, no UI
   */
  ui?: 'nav' | 'external' | false

  /** Override UI copy. Keys documented in public-api.md. */
  translations?: Partial<IdnTranslations>

  /** Warn when serialized index exceeds this size (MB). Default: 5 */
  minIndexSizeWarningMB?: number
}
```

## Validation & failure behavior (FR-020, SC-010)

| Condition | Behavior |
|---|---|
| Unknown `language` value | Build **error** at plugin init with the offending value listed |
| Invalid glob / no pages matched after include/exclude | Build **warning** ("0 pages indexed") |
| Index exceeds `minIndexSizeWarningMB` | Build **warning** with remediation hint (`include`/`exclude`) |
| Client index schema/language mismatch at runtime | Visible UI error state + console error |
| Host already uses `themeConfig.search.provider: 'algolia'` | Build **warning**; nav UI still injected per `ui` option (documented) |
| Non-default theme with `ui: 'nav'` | Alias silently matches nothing → build **warning** suggesting `ui: 'external'` |

## Compatibility

| Peer | Range |
|---|---|
| `vitepress` | `^1.5.0 \|\| ^1.6.0` (alias target `./VPNavBarSearch.vue` tested per fixture build) |
| `vite` | provided by vitepress (no direct peer) |
| `vue` | `^3.3` (provided by host theme) |
