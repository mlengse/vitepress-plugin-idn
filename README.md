# vitepress-plugin-idn

Indonesian-first search, stemming, syllabification and hyphenation for
[VitePress](https://vitepress.dev). One registration line, zero required
configuration.

- Setup-free Indonesian search in the default-theme nav bar
  (`Ctrl/Cmd+K`, `/`)
- Offline, static-served index — works with no internet and no server
  (MiniSearch core)
- `stem()`, `syllabify()`, `hyphenateText()` exportable for author tools
- Optional client-side hyphenation of rendered content (soft hyphens)
- English as a secondary language (`language: 'en'`)

## Install

```sh
npm i vitepress-plugin-idn
```

## Quickstart (register the plugin)

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress'
import { idnPlugin } from 'vitepress-plugin-idn/node'

export default defineConfig({
  vite: {
    plugins: [idnPlugin()] // ← the only required line; every option is optional
  },
})
```

The plugin is available from `vitepress-plugin-idn/node`; the root entry
(`vitepress-plugin-idn`) is the client-safe utility entry and intentionally
does not pull in the Node/Vite plugin.

That is the complete setup for Indonesian search:

1. `npm run docs:dev` — the nav bar shows the search button; `Ctrl/Cmd+K`
   or `/` opens it.
2. `npm run docs:build` — the search index and UI ship inside the static
   bundle.

## Options

All options are optional; defaults give working Indonesian search.

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Master switch; `false` → no index, no UI |
| `language` | `'id'` | Site language: `'id'` or `'en'` |
| `include` | `['**/*.md']` | Page globs (relative to `srcDir`) to index; `exclude` is applied after |
| `exclude` | `[]` | Page globs to drop; frontmatter `search: false` always wins |
| `hyphenate.enabled` | `false` | Insert soft hyphens into rendered content |
| `hyphenate.selector` | `'.vp-doc p, .vp-doc li, .vp-doc td'` | Text containers |
| `hyphenate.minWordLength` | `6` | Words shorter than this are untouched |
| `ui` | `'nav'` | `'nav'` (default theme), `'external'` (host mounts `<IdnSearch />`), `false` (index only) |
| `translations` | — | Override any UI string |
| `minIndexSizeWarningMB` | `5` | Build warning threshold for the serialized index |

Failure behavior is always visible (never silent): unknown languages and
invalid setups fail/warn at build time, and runtime index mismatches show an
error state in the UI. See `specs/001-indonesian-search-plugin/` for the full
option contract.

## Custom themes: `ui: 'external'`

Third-party themes (or a custom `Layout`) can keep their own nav area and
embed the search dialog themselves:

```ts
// .vitepress/config.ts
import { idnPlugin } from 'vitepress-plugin-idn/node'

export default defineConfig({
  vite: { plugins: [idnPlugin({ ui: 'external' })] },
})
```

```vue
<!-- any theme component -->
<script setup lang="ts">
import { IdnSearch } from 'vitepress-plugin-idn/vue'
</script>

<template>
  <IdnSearch />
</template>
```

With `ui: 'external'` the plugin does not replace the theme's search button;
it only serves the index, options and the `IdnSearch` component.

## Author utilities (public API)

```ts
import {
  stem,          // 'berlari' -> 'lari'   (id, Nazief-Adriani / en, Snowball)
  syllabify,     // 'pemerintahan' -> 'pe-mer-in-ta-han'
  hyphenateText, // inserts U+00AD soft hyphens at break points
  tokenize,      // lowercase, diacritic-folded, stop-word-free terms
  isStopWord,
  getStopWords,
  IDN_VERSION,
} from 'vitepress-plugin-idn'
```

- `stem(word, 'id' | 'en')` and `syllabify(word, 'id' | 'en')` never throw and
  return their input unchanged when they cannot normalize it.
- `hyphenateText(text, { language, minWordLength })` never breaks URLs, digits
  or boundaries, is idempotent, and never throws.

## Upstream capabilities (FR-023)

| Component | Role | Status & reason |
| --- | --- | --- |
| [snowball-js](https://github.com/mlengse/snowball-js) | Snowball stemmer family | **Adopted from the fork** — consumed as `@mlengse/snowball-js` (MPL-1.1, published from the fork) for the `en` stem path (Snowball English / Porter2). Snowball's Indonesian rules are weaker than Nazief-Adriani for confix stripping, which is why `id` still uses sastrawijs. This re-adopts the engine the interim implementation had swapped for the official `stemmer` (Porter). |
| [sastrawijs](https://github.com/damzaky/sastrawijs) | Indonesian stemming (Nazief-Adriani) | **Adopted.** Runtime-sourced via the npm registry (`sastrawijs`) for now; FR-023 fork sourcing from the [mlengse fork](https://github.com/mlengse/sastrawijs) is pending fork publishing (`@mlengse/sastrawijs` not yet on the registry). Root-word provenance derives from kateglo.com (CC BY-NC-SA 3.0); this is flagged in `NOTICE`. The `stem()` contract is engine-agnostic, so the dictionary can be swapped behind the unchanged API if a non-commercial term is a blocker. |
| [hyphen](https://github.com/ytiurin/hyphen) | Hyphenation patterns (`id`, `en`) | **Adopted.** Runtime-sourced via the npm registry (`hyphen`) under ISC for the soft-hyphen line-break feature and the English syllable engines. FR-023 fork sourcing from the [mlengse fork](https://github.com/mlengse/hyphen) is pending a publishable package layout (`@mlengse/hyphen` not yet on the registry). |
| [stopwords-iso](https://github.com/stopwords-iso/stopwords-iso) | Stop-word lists | **Adopted** (MIT) — the `id`/`en` lists are vendored by `scripts/update-stopwords.ts`, regenerable, and attributed in `NOTICE`. |
| [vitepress-plugin-pagefind](https://github.com/cpl-coder/vitepress-plugin-pagefind) | External indexer | **Dropped.** Pagefind requires a separate binary and non-static asset pipeline; the spec needs a pure-build, static, same-origin index, which we build in-process instead. |
| [lunr.js](https://github.com/olivernn/lunr) / lunr-languages | Client search engine | **Dropped.** Replaced by [minisearch](https://github.com/lucaong/minisearch) (MIT), which offers pluggable processing (our stemming and stop-word pipeline) and a compact serialized index. |

## License & notices

MIT. License text and third-party attributions ship with the package
(`LICENSE`, `NOTICE`).