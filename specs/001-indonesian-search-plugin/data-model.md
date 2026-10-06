# Phase 1 Data Model: Indonesian Language Capabilities for VitePress

**Feature**: `specs/001-indonesian-search-plugin` | **Date**: 2026-10-07

Derived from the entities in [spec.md](./spec.md#key-entities). These are logical structures — field types describe shape and validation, not storage technology.

---

## 1. PluginOptions (configuration entity)

Root configuration passed to the plugin factory. Everything has a default; an empty options object must produce a fully working Indonesian site search (FR-019).

| Field | Type | Default | Validation rules (from FRs) |
|---|---|---|---|
| `enabled` | boolean | `true` | When `false`, no index is built and no UI is injected; build must still succeed (FR-020). |
| `language` | `'id' \| 'en'` | `'id'` | Selects stemmer, stop-word list, hyphenation patterns (FR-008, R8). Unknown value → build-time error (FR-020). |
| `include` | string[] (path globs) | `['**/*.md']` | Only matching pages are indexed (FR-007). |
| `exclude` | string[] (path globs) | `[]` | Applied after `include`. `frontmatter.search: false` always wins (FR-007). |
| `hyphenate` | `{ enabled: boolean, selector: string, minWordLength: number }` | `{ enabled: false, selector: '.vp-doc p, .vp-doc li, .vp-doc td', minWordLength: 6 }` | Scoping required by FR-017; selector must never match `pre`/`code`/`a` (enforced by runtime skip list regardless of selector). |
| `ui` | `'nav' \| 'external' \| false` | `'nav'` | `'nav'` = alias into default theme nav bar; `'external'` = no alias, host mounts the exported component; `false` = index only (FR-019, R1). |
| `translations` | `{ placeholder, noResults, stopwordHint, ... }` | English strings + Indonesian defaults when `language: 'id'` | UI copy must exist for empty state (FR-010). |
| `minIndexSizeWarningMB` | number | `5` | Oversized index → build warning, never silence (FR-020, R10). |

**State**: configuration is immutable after Vite config resolution; no transitions.

---

## 2. IndexedPage

A site page selected for indexing (input: one `.md` source; output: 0..n IndexedSection records).

| Field | Rules |
|---|---|
| `path` | Site-absolute URL path derived exactly like VitePress (`rewrites` applied, `.md` → `.html`/cleanUrls) — must equal the built page's route (FR-006). |
| `language` | Copied from `PluginOptions.language` (site-level in v1). |
| `title` | Page title (frontmatter `title` or first heading). |
| `sections` | 1..n; a page excluded by include/exclude/frontmatter yields 0 records. |

**Transitions**: `discovered → rendered → sectioned → indexed`; on dev file change a section re-enters `discovered` (HMR path, R7).

---

## 3. IndexedSection (search record)

Heading-granularity record — the unit stored in the index and returned in results (FR-001).

| Field | Type | Validation |
|---|---|---|
| `id` | string | `path` or `path#anchor`; anchor taken from rendered heading — must resolve on the built page (FR-001, R2). Unique across the site. |
| `title` | string | Heading text, HTML-stripped. |
| `titles` | string[] | Ancestor heading chain (breadcrumb for display). |
| `text` | string | HTML-stripped body text of the section; may be empty → record skipped (mirrors VitePress local search). |
| `terms` | string[] | Derived: normalized tokens after the language pipeline (FR-002/003/004). Never hand-authored. |

---

## 4. SearchIndex

Serialized artifact served through the virtual module (R7) and loaded client-side.

| Field | Rules |
|---|---|
| `schemaVersion` | integer; client refuses (with a clear message, FR-020) to search a mismatched version. |
| `language` | Must equal the runtime's `PluginOptions.language` — a mismatch is a build error, not a silent degradation (FR-020). |
| `sections` | All IndexedSection records. |
| `stopWordsSnapshot` | The stop-word list hash — guards against query-time/index-time divergence (FR-012). |
| `generatedAt` | ISO timestamp (diagnostics only). |

**State transitions**: `building → ready → (HMR) building → ready`; never observable in a `building` state — the client awaits the current module version (FR-020: no partial reads).

**Validation on load**: `schemaVersion` match → deserialize into MiniSearch (`loadJSON`) → queryable. Failure at any step surfaces a visible console error + UI error state, never a silent empty result (SC-010).

---

## 5. Query & QueryResult

| Query field | Rules |
|---|---|
| `text` | Raw user input. Normalized: trim, collapse whitespace, strip punctuation edges (FR-009). Empty/whitespace-only → UI does not submit (edge case). |
| `language` | From index `language`. |

Pipeline (identical order at index time and query time — FR-012):

`normalize → tokenize → (drop stop words) → reduce reduplication ("buku-buku" → "buku") → stem → match`

| QueryResult field | Rules |
|---|---|
| `hits` | Ordered by MiniSearch relevance with VitePress-like boosts (title > titles > text). |
| `hit` | `{ id, title, titles, snippet, score }`; snippet highlights the matched term (FR-001). |
| `reason` | `'results' \| 'empty' \| 'stopwords-only'` — drives the empty-state message (FR-010, SC-002). |

**Special transition**: if every token is a stop word, the pipeline short-circuits to `reason: 'stopwords-only'` **before** matching (SC-002 — never an unfiltered dump).

---

## 6. StemMap (conceptual)

The word → root association produced by the language stemmer.

| Rule | Source |
|---|---|
| Deterministic: same input + language → same output | FR-013 |
| Never throws; unknown/empty/non-language input returns input (or documented fallback) | FR-013 |
| Same function used for index and query sides | FR-012 |
| Example expectations: `berlari→lari`, `memadamkan→padam`, `pemerintahan→perintah` | FR-011, SC-006 |

No persistence: computed on demand in Node (indexing) and browser (query).

---

## 7. SyllabificationPattern

| Rule | Source |
|---|---|
| Applies CV-V, V-V, V-CV, CV-CV rules for `language: 'id'` | FR-015 |
| Output format: hyphen-separated (`pe-mer-in-ta-han`) | FR-018 |
| Words shorter than `minWordLength` returned intact | Edge case (spec) |
| Never throws on arbitrary input | FR-013 by analogy, UI safety |

Hyphenation (line-breaking) uses `hyphen/id` soft-hyphen insertion and is scoped by `PluginOptions.hyphenate` — it never modifies text inside `pre`, `code`, `a`, or `.header-anchor` regardless of selector (FR-017).

---

## Entity relationship summary

```text
PluginOptions ──selects──> language ('id'|'en')
      │                        │
      │ include/exclude        ├── selects StemMap implementation (stemmer)
      ▼                        ├── selects stop-word list
IndexedPage ──1..n──> IndexedSection ──terms──> pipeline ──> SearchIndex
                                                     ▲              │
Query ────────── same pipeline (FR-012) ────────────┘              │
                                                                   ▼
                                                     client load → QueryResult → Search UI
```
