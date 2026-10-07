# Feature Specification: Indonesian Language Capabilities for VitePress

**Feature Branch**: `001-indonesian-search-plugin`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: implementasikan salah satu, beberapa, atau semua dari kapabilitas di repo ini untuk pemenggalan kata, stemming, atau pencarian dalam bahasa Indonesia menjadi sebuah vitepress plugin:

> **Fork provenance (user clarification)**: For the listed repositories, the user maintains their own forks — every `https://github.com/mlengse/*` URL above is the user's own fork (`mlengse` GitHub account). Adopted capabilities therefore originate from the user's maintained forks; documentation (FR-023) and attribution must cite fork provenance rather than assuming the canonical upstream is the adopted source.
- https://github.com/mlengse/sastrawijs
- https://github.com/mlengse/hypher
- https://github.com/mlengse/hyphenation-patterns
- https://github.com/mlengse/hyphen
- https://github.com/mlengse/Hyphenopoly
- https://github.com/mlengse/docusaurus-search-local
- https://github.com/mlengse/lunr.js
- https://github.com/mlengse/stopwords-filter
- https://github.com/mlengse/snowball-js
- https://github.com/mlengse/lunr-languages
- https://github.com/ATQQ/sugar-blog/tree/master/packages/vitepress-plugin-pagefind

## Summary

Deliver a VitePress plugin that gives documentation sites first-class Indonesian language support in three capability areas:

1. **Search** — site search that understands Indonesian morphology (finds "berlari" when the user types "lari", and vice versa), ignores Indonesian stop words, and ranks results usefully.
2. **Stemming** — reduction of Indonesian words to their root form (kata dasar), usable both inside search and directly by site authors.
3. **Word syllabification (pemenggalan kata)** — correct Indonesian syllable breaking of words, usable for readable line-breaking/hyphenation and for exposing syllabified text to content.

The listed upstream projects are candidate capability sources; the plugin may adopt one, several, or all of them, or equivalent approaches, as long as the observable behavior in this spec is met.

## Clarifications

### Session 2026-10-07

- Q: For the capabilities the plugin already adopts, should I switch the runtime sources to your own `mlengse/*` forks, or keep the published npm packages and only update the documentation to name your forks as the adopted source lineage? → A: Full fork adoption — every capability that maps to a fork uses the user's fork at runtime; only non-listed capabilities remain third-party.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Indonesian-aware site search (Priority: P1)

A reader visits a VitePress documentation site and types an Indonesian query into the search box. Results include pages whose content contains morphological variants of the query word (derived forms, plural reduplication, root form), and stop words such as "yang", "dan", "di" do not dominate or pollute the ranking. Results are shown with title, page path, and a relevant snippet.

**Why this priority**: Search is the primary reader-facing value of the plugin; without it the plugin delivers no visible benefit to the majority of site visitors.

**Independent Test**: Build a sample VitePress site with a handful of Indonesian-language pages containing known stem/derivative pairs (e.g., "berlari", "lari", "pelari", "menyapu", "sapu"). Use the search UI with queries "lari" and "sapu" and verify that all semantically related pages appear in the results, ranked above unrelated pages.

**Acceptance Scenarios**:

1. **Given** a site with a page containing "Pengembangan berkelanjutan", **When** the reader searches "berkembang", **Then** the page appears in the results.
2. **Given** a query consisting only of Indonesian stop words (e.g., "yang dan di"), **When** the reader searches, **Then** the system does not return a meaningless full-result list and instead presents a clear, user-friendly outcome (e.g., a "no meaningful results" hint or results ranked by non-stop-word signal).
3. **Given** a page containing "buku-buku", **When** the reader searches "buku", **Then** the page appears in the results.
4. **Given** the site contains 500+ indexed pages, **When** the reader submits a query, **Then** results are displayed within 1 second on a typical laptop.
5. **Given** a reader with no JavaScript execution allowed, **When** they navigate the site, **Then** the site still builds and browses normally — search is progressively enhanced, not a build breaker.

---

### User Story 2 - Search works offline on the published site (Priority: P2)

The published site is a static bundle hosted on any static host. A reader can search without any server-side component, analytics service, or network API beyond fetching the site's own assets.

**Why this priority**: VitePress sites are static by contract; requiring a search backend would exclude most hosting setups and break the "drop-in plugin" expectation.

**Independent Test**: Build the site, serve the output directory with a plain static file server (no API), disconnect from the internet, and perform searches — results must still appear.

**Acceptance Scenarios**:

1. **Given** a statically served build of the site, **When** the reader searches, **Then** results are returned using only assets served from the site itself.
2. **Given** the first search on a cold page load, **When** the reader types and submits a query, **Then** any one-time index download does not block typing and completes within a couple of seconds on a typical connection.

---

### User Story 3 - Root-word (stemming) utility for site authors (Priority: P3)

A site author (or a content component) needs to reduce an Indonesian word to its root form programmatically — e.g., to build a glossary page, tag cloud, or related-term index in documentation.

**Why this priority**: Stemming is explicitly requested as a capability and is also the backbone of search quality, but as a directly exposed utility it serves a smaller audience than search.

**Independent Test**: From plugin-provided capabilities, call the stemming function with known words ("berlari" → "lari", "memadamkan" → "padam") and assert outputs.

**Acceptance Scenarios**:

1. **Given** the plugin is installed, **When** the author stems "berlari", **Then** the root "lari" is returned.
2. **Given** the plugin is installed, **When** the author stems an unknown or non-Indonesian word, **Then** a sensible, non-throwing result is returned (original word or documented fallback).
3. **Given** the plugin is installed, **When** the author stems a stop word, **Then** behavior is documented and deterministic.

---

### User Story 4 - Indonesian syllabification / hyphenation (Priority: P4)

A reader views a page with long Indonesian words in narrow columns (sidebars, tables, mobile). The site owner wants words broken at correct Indonesian syllable boundaries — either as hyphenation during line wrapping or as explicitly syllabified text in content components.

**Why this priority**: Improves typography and readability but is not required for the site to function; lower impact than search and stemming.

**Independent Test**: Render content containing long Indonesian words in a constrained-width container with hyphenation enabled and verify breaks occur only at valid Indonesian syllable boundaries (e.g., "pemer-in-tahan", never "pe-merin-ta-han" incorrectly placed).

**Acceptance Scenarios**:

1. **Given** hyphenation is enabled by the plugin, **When** a long Indonesian word must wrap across lines, **Then** the break occurs at a valid Indonesian syllable boundary and a hyphen is displayed.
2. **Given** a component or helper that syllabifies text, **When** given "pemerintahan", **Then** it returns "pe-mer-in-ta-han" (per Indonesian syllabification rules: CV-V-CV, V-V, V-CV, CV-CV).
3. **Given** a word shorter than the minimum break length, **When** syllabification or hyphenation is applied, **Then** the word is left intact.

---

### Edge Cases

- Query contains mixed Latin characters, digits, and punctuation (e.g., "vitepress 4.0!"): system strips/handles punctuation without crashing.
- Query contains a word with an affix that produces no valid root (e.g., "menyapukan" if unmapped): search degrades gracefully to prefix/exact matching rather than dropping the term.
- Reduplicated/hyphenated forms ("anak-anak", "buku-buku") queried with and without the reduplication.
- Empty query, whitespace-only query, and very long query (>100 characters): UI prevents or handles gracefully.
- Site content in non-Indonesian pages mixed with Indonesian pages: only Indonesian-processed behavior applies where configured; other pages are not corrupted.
- Very large sites (1000+ pages): build time and index size remain within acceptable limits (see Success Criteria); if the index is too large, plugin must warn clearly rather than silently produce a broken search.
- Language detection conflicts: a page explicitly marked for another language is excluded from Indonesian processing rules.
- Build fails partway: partial/missing search index must never cause the VitePress build to succeed with a broken search silently — a clear build-time warning or error is required.

## Requirements *(mandatory)*

### Functional Requirements

**Search**

- **FR-001**: The plugin MUST provide a search experience within VitePress that returns ranked results with page title, path, and content snippet.
- **FR-002**: Search MUST match morphological variants of Indonesian query terms — searching a root form finds derived forms and searching a derived form finds the root form (stem-based matching).
- **FR-003**: Search MUST ignore or de-prioritize Indonesian stop words so that stop-word-only queries do not yield meaningless result sets.
- **FR-004**: Search MUST handle Indonesian plural reduplication ("buku-buku") symmetrically with the singular form.
- **FR-005**: Search MUST run entirely client-side against assets shipped with the built site; no external search service or server API may be required.
- **FR-006**: The plugin MUST index the site's Markdown-derived content (headings, body text) at build time and refresh the index on rebuild.
- **FR-007**: The plugin MUST allow site authors to configure which parts of the site are indexed (e.g., by path include/exclude patterns) with sensible defaults (index everything).
- **FR-008**: The plugin MUST support Indonesian and English as selectable processing languages, configurable per site, with Indonesian as the default; the selected language determines stemming and stop-word behavior applied during indexing and querying.
- **FR-009**: Query input MUST tolerate punctuation, mixed casing, and extra whitespace without errors.
- **FR-010**: When no meaningful results exist, the search UI MUST show a clear empty-state message rather than an unranked dump of all pages.

**Stemming**

- **FR-011**: The plugin MUST provide a stemming capability that reduces common Indonesian affixed words to their root form (e.g., "berlari"→"lari", "memadamkan"→"padam", "pemerintahan"→"perintah").
- **FR-012**: Stemming MUST be applied consistently both inside search indexing/querying and in the author-facing utility so results do not diverge.
- **FR-013**: Stemming MUST never throw on arbitrary input; unknown words, empty strings, and non-Indonesian text must return a deterministic documented result.
- **FR-014**: The author-facing stemming capability MUST be usable from site content/components without requiring authors to import internal implementation details.

**Syllabification / Hyphenation**

- **FR-015**: The plugin MUST provide Indonesian syllabification that follows standard Indonesian syllable rules (CV-V, V-V, V-CV, CV-CV patterns; affix-aware where applicable).
- **FR-016**: The plugin MUST be able to apply Indonesian hyphenation so that browsers break long words at valid syllable boundaries when content overflows its container.
- **FR-017**: Hyphenation MUST be scoped — it applies only to configured content/elements and must not alter code blocks, URLs, or identifiers.
- **FR-018**: The plugin MUST expose a way to obtain syllabified text (e.g., "pemerintahan" → "pe-mer-in-ta-han") for use in content/components.

**General / Integration**

- **FR-019**: The plugin MUST be installable and usable as a standard VitePress plugin with a single registration step and zero required configuration (works with defaults out of the box).
- **FR-020**: The plugin MUST NOT break a VitePress build; all failure modes (unsupported content, oversized index, misconfiguration) MUST surface as clear build-time warnings or errors, never silent corruption.
- **FR-021**: The plugin MUST NOT require network access at build time beyond installing dependencies.
- **FR-022**: Search UI MUST be keyboard-accessible and usable on narrow (mobile) viewports.
- **FR-023**: The plugin MUST document which upstream capabilities were adopted and which were replaced with equivalent approaches, and why. Adopted capabilities that map to a listed fork MUST be runtime-sourced from, and attributed with, their fork provenance (`github.com/mlengse/*`) per the user clarification in Input.

### Key Entities

- **Query**: The reader's typed search string; normalized (casing, punctuation, whitespace) before processing.
- **Indexed Page**: A site page's derived search record — title, path, headings, tokenized/normalized content, and stem forms.
- **Search Index**: The collection of indexed pages, built at site build time and consumed client-side.
- **Stem Map**: The association between a surface word form and its Indonesian root form, produced by the stemming capability.
- **Syllabification Pattern**: Rules/patterns determining valid Indonesian syllable boundaries for a word.
- **Plugin Configuration**: Author-supplied options controlling index scope, language processing toggles, hyphenation scope, and UI options.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader searching a root form (e.g., "lari") finds pages containing derived forms ("berlari", "pelari") in the top 10 results for at least 90% of a curated set of 20 common Indonesian root/derivative test queries.
- **SC-002**: Stop-word-only queries return zero or clearly-labeled results 100% of the time — never an unfiltered full-site dump.
- **SC-003**: Search results appear in under 1 second after query submission on a typical laptop for a site of up to 500 pages.
- **SC-004**: The published site remains fully functional as a static bundle — search works with no internet connection and no server beyond static file hosting.
- **SC-005**: Site build time increases by no more than 20% compared to the same site without the plugin (for up to 500 pages).
- **SC-006**: Stemming returns the correct root for at least 85% of a curated 50-word Indonesian test list covering common prefixes/suffixes (meN-, ber-, peN-, di-, ter-, -kan, -an, -i).
- **SC-007**: Syllabification matches linguistically correct Indonesian syllabification for at least 95% of a curated 50-word test list.
- **SC-008**: A new user can install and register the plugin and get working Indonesian search with default configuration in under 10 minutes using only the README.
- **SC-009**: The search UI passes an accessibility check (keyboard navigation, labeled controls, readable contrast) with no critical violations.
- **SC-010**: Zero silent failures: every documented failure mode produces a visible warning or error during build or at runtime.

## Assumptions

- The target VitePress sites are static-exported documentation sites; no SSR search backend is assumed or required.
- The listed upstream repositories are optional capability sources — the plugin may bundle, wrap, reimplement, or replace any of them as long as the observable requirements are met; licensing of adopted components must permit redistribution (permissive/open-source license).
- The `mlengse/*` repositories listed in Input are the user's own forks, maintained under the `mlengse` GitHub account, and are the **adopted runtime source** for the capabilities they map to: Indonesian stemming (`sastrawijs`), hyphenation (`hyphen`), and English stemming (`snowball-js`). Forks already rejected as capability sources (`hypher`, `hyphenation-patterns`, `Hyphenopoly`, `docusaurus-search-local`, `lunr.js`, `lunr-languages`, `stopwords-filter`) remain dropped. Capabilities not present in the fork list (e.g. the search engine implemented over `minisearch`) are adopted third-party. Attribution (FR-023 / NOTICE) must name the fork.
- Indonesian is the default language; English is the only additional supported language in v1 (see FR-008); all other languages are out of scope.
- Readers use modern evergreen browsers; legacy browser support (IE11 etc.) is out of scope.
- Search covers page text content and headings; it does not cover code-comment semantics, images, or PDFs in v1.
- Indexing happens at build time; content changes require a rebuild (no live/crawling index).
- Syllabification targets Indonesian orthography (not language-specific exception lists for loanwords in v1).
- Default behavior with no configuration must be useful: full-site index, Indonesian processing on, search UI integrated into the VitePress layout.

## Out of Scope (v1)

- Server-side or hosted search services.
- Spell checking / grammar checking.
- Full-text search of non-Markdown assets (PDF, images).
- Real-time index updates without rebuild.
- GUI settings panel for configuration.
