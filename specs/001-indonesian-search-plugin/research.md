# Phase 0 Research: Indonesian Language Capabilities for VitePress

**Feature**: `specs/001-indonesian-search-plugin` | **Date**: 2026-10-07

All unknowns from the plan's Technical Context are resolved below. No NEEDS CLARIFICATION items remain.

---

## R1. Integration architecture: standalone plugin vs. augmenting VitePress local search

**Decision**: Build a standalone Vite plugin that (a) generates and serves its own Indonesian-aware search index via a virtual module, and (b) injects its own search UI by aliasing the default theme's `VPNavBarSearch.vue` component (the proven pattern used by `vitepress-plugin-pagefind`).

**Rationale**:

- Augmenting VitePress's built-in local search (setting `themeConfig.search.provider = 'local'` programmatically) is **infeasible** from a Vite plugin: `localSearchPlugin(siteConfig)` evaluates `provider === 'local'` when VitePress constructs its plugin array, and the `__VP_LOCAL_SEARCH__` define is computed in VitePress's own `config()` hook — both run **before** any third-party plugin hook could mutate `siteConfig.site.themeConfig`. Verified against vitepress 1.6.4 source (`src/node/plugin.ts`, `src/node/plugins/localSearchPlugin.ts`).
- Spec FR-019 (single registration, zero required configuration) rules out asking users to set `themeConfig.search` themselves.
- Verified in source that `VPNavBar.vue` renders `<VPNavBarSearch />` **unconditionally**, and `vitepress-plugin-pagefind` successfully replaces it via a Vite `resolve.alias` on the exact specifier `./VPNavBarSearch.vue`. Our component therefore renders regardless of search-provider defines.

**Alternatives considered**:

| Alternative | Why rejected |
|---|---|
| Force `themeConfig.search.provider='local'` + custom `miniSearch.options` | Mutation happens too late (see Rationale); also would trigger VitePress's own index build in parallel |
| Post-build Pagefind indexing (`vitepress-plugin-pagefind` style) | Pagefind cannot apply custom Indonesian stemming **at index time** (only query-time `customSearchQuery`), so FR-002 stem-based matching cannot be met |
| User-side two-step setup (`defineConfig` wrapper + theme component import) | Violates FR-019 zero-config requirement |
| `transformHtml`-injected floating search script (theme-agnostic) | Works for any theme but requires building a fully accessible modal from scratch with no theme styling; kept as documented escape hatch (`ui: 'external'`) for third-party themes, not the default path |

**Residual risk**: the alias depends on VitePress's internal import specifier `./VPNavBarSearch.vue`. Mitigation: peer-dependency range pinned to tested VitePress majors (`^1.5.0 || ^1.6.0`), integration test builds a fixture site and asserts the search button exists — a specifier change fails CI immediately.

---

## R2. Index generation: Markdown re-render vs. parsing built HTML

**Decision**: Re-render Markdown sources with VitePress's **publicly exported** `createMarkdownRenderer(srcDir, options, base, logger)` (verified present in vitepress 1.6.4's `dist/node/index.d.ts` export list), mirroring the official `localSearchPlugin` approach: split rendered HTML into heading sections, index `title`/`titles`/`text` per section.

**Rationale**:

- Identical renderer → identical heading anchors and slugification as the built site (index deep links cannot drift).
- Works uniformly in **dev and build** (HTML parsing only works after SSG, leaving dev search blind).
- Respects `frontmatter: search: false` and user markdown config for free.
- No dependency on private VitePress internals for rendering.

**Alternatives considered**:

| Alternative | Why rejected |
|---|---|
| Parse `dist/**/*.html` at `buildEnd` | No index during `vitepress dev`; adds a post-SSG parsing stage; equal anchor fidelity but strictly less capable |
| Own `markdown-it` pipeline with reimplemented slugify | Duplicates VitePress behavior; drift risk with custom markdown plugins |

**Known gap + mitigation**: VitePress pre-processes include directives (`<!--@include: file-->`, `<<< file`) *before* markdown rendering; `createMarkdownRenderer` alone does not expand them. Mitigation: implement a small include-expansion preprocessor (regex-level parity with VitePress's `processIncludes`) and cover it with an integration test using an included file.

---

## R3. Search engine

**Decision**: **MiniSearch** (MIT) — third-party, **not** part of the user's fork list (fork sourcing, FR-023).

**Rationale**: Jev classifier chose minisearch at **0.91** over lunr (0.02), flexsearch (0.03), pagefind (0.04). It exposes `tokenize`/`processTerm`/`extractField` (constructor) and `searchOptions` (query time), letting the *same* Indonesian pipeline run at index and query time (FR-002/FR-012); it is the engine VitePress's own local search uses, so its static-JSON index pattern is proven at exactly this scale; small bundle; pure JS, offline.

**Alternatives considered**: lunr (no Indonesian support anywhere in its ecosystem, maintenance mode); flexsearch (harder-to-control scoring, heavier config); pagefind (cannot stem at index time — see R1).

---

## R4. Stemming

**Decision** (fork-sourced per FR-023 clarification):

- **Indonesian**: `sastrawijs` — from the user's fork `github.com/mlengse/sastrawijs` (JavaScript port of Sastrawi, Nazief–Adriani algorithm, MIT).
- **English**: `snowball-js` — from the user's fork `github.com/mlengse/snowball-js` (Snowball stemmers), used when `language: 'en'`.

**Rationale**: sastrawijs is the only maintained JS Nazief–Adriani implementation in the candidate list; its dictionary-driven approach matches the spec's expected outputs ("berlari"→"lari", "pemerintahan"→"perintah"). Snowball covers English for FR-008 option B. The user's clarification states these adoptations come from their own `mlengse/*` forks.

**Alternatives considered**: `stemmer` (Porter, third-party) — the interim `en` engine actually wired into the current implementation; superseded by the fork decision and to be reverted under FR-023 (plan re-plan 2026-10-07). Also considered: `snowball-js`'s Indonesian stemmer (weaker than Nazief–Adriani for confix stripping); `ts-sastrawi` (second Sastrawi lineage, not in the fork list).

**Licensing risk (open, mitigated)**: Sastrawi's root-word dictionary derives from kateglo.com under **CC-BY-NC-SA 3.0** (non-commercial). Mitigation: (1) verify `sastrawijs` bundled dictionary license before release; (2) if incompatible with the package's intended license, ship an independently sourced root-word list behind the same `stem()` contract — the contract (FR-011/FR-013) is engine-agnostic. Documented in FR-023 evidence and the README "Upstream capabilities" section.

---

## R5. Stop words

**Decision**: **Vendor** compact `id` and `en` stop-word arrays into the package (source: `stopwords-iso` collections — third-party data, NOT fork-sourced; the user's `mlengse/stopwords-filter` fork remains **rejected**), generated by a maintainer script (`scripts/update-stopwords.*`), attributed in `NOTICE`.

**Rationale**: only the two selected languages ship to the client (small bundle, tree-shakeable); no runtime dependency on a stop-word package with an uncertain API (the `mlengse/stopwords-filter` fork's interface was not verifiable from the repo list alone); lists are plain data — the filtering behavior (FR-003) is ours either way.

**Alternatives considered**: `stopwords-filter` fork (API unverified), `stopword` npm package (62 languages, ISO-639-3 codes, adds a dependency for two static lists).

---

## R6. Hyphenation & syllabification

**Decision**:

- **Hyphenation (FR-016/017)**: `hyphen` package — from the user's fork `github.com/mlengse/hyphen` — using its Indonesian patterns `hyphen/id` (TeX `hyph-id` patterns, Liang algorithm) to insert soft hyphens (`U+00AD`) client-side, scoped to a configured selector, skipping `pre`, `code`, `a`, and heading anchors.
- **Syllabification (FR-015/018)**: deterministic rule-based Indonesian CV syllabifier implemented in-package (CV-V, V-V, V-CV, CV-CV), because the spec demands exact output ("pemerintahan" → "pe-mer-in-ta-han") independent of hyphenation-point heuristics. Tests cross-check syllabifier output against `hyphen/id` break points.

**Rationale**: browser `hyphens: auto` is unreliable for Indonesian (Chromium ships no `id` hyphenation dictionary), so soft-hyphen insertion in JS is the dependable route; `hyphen` is the only candidate with confirmed, packaged Indonesian patterns (`hyphen/id`) and a synchronous API usable in both Node and browser.

**Alternatives considered**: `hypher` + `hyphenation-patterns` (Indonesian pattern availability in that repo not confirmed); `Hyphenopoly` (heavier, DOM-rewriting, aimed at full-document processing); native `hyphens: auto` alone (unreliable per above).

---

## R7. Dev & build index delivery

**Decision**: Virtual module `virtual:vitepress-plugin-idn/index` exporting the serialized MiniSearch index; served by our plugin's `load()`:

- **dev**: initial scan at `configureServer`, re-scan on `.md` `hotUpdate` (HMR), following `localSearchPlugin`'s proven flow;
- **build**: scan during the client build's `load()` phase; the index lands in a separate lazily-imported chunk so it never blocks first paint (US2 Scenario 2).

**Rationale**: identical mechanism to VitePress's own local search — no custom static-asset plumbing, works offline (SC-004) because the index is just another same-origin asset.

**Alternatives considered**: `buildEnd` writing `search-index.json` into `outDir` (extra file plumbing, no dev story); precompress/split indexes (optimization, deferred — see Scale note).

---

## R8. Language scope (spec FR-008, user answer: Option B)

**Decision**: Site-level option `language: 'id' | 'en'` (default `'id'`). It selects the stemmer, stop-word list, and hyphenation patterns applied uniformly at index time and query time. No per-page language switching in v1 (spec scopes it per site).

---

## R9. UI behavior & accessibility

**Decision**: Own Vue 3 search modal component (`Search.vue`) aliased over `VPNavBarSearch.vue`, modeled on `VPLocalSearchBox` semantics: opens with `Ctrl/Cmd+K` and `/` (when not typing in an input), `Esc` closes, arrow keys move the active result, `Enter` navigates, focus is trapped in the modal and restored to the trigger on close, every control has an accessible name, and an explicit empty-state message covers stop-word-only / no-result queries (FR-010, SC-009).

**Rationale**: we cannot inherit VitePress's local-search box (R1), so accessibility must be built in and verified with a Lighthouse/axe audit (SC-009).

---

## R10. Tooling, packaging, testing

**Decision**:

- **Language**: TypeScript, target ES2020, published as ESM + `.d.ts` (VitePress configs are ESM; peer `vitepress: ^1.5 || ^1.6`).
- **Build**: `tsup` (single-pass bundling, externalizes `vitepress`/`vue`).
- **Testing**: `vitest` for unit (stem/syllabify/tokenize/stopwords contracts) and integration (build a fixture VitePress site in-repo, assert index chunk, search button presence, and query results); browser-based accessibility audit (Lighthouse/axe) against the built fixture for SC-009.
- **Lint/typecheck**: `eslint` + `tsc --noEmit` in CI.

**Rationale**: no existing tooling in the repo to conform to (greenfield — verified via CodeGraph: no indexed source). Vitest integrates with Vite natively; fixture-site integration tests are how vitepress plugins are reliably tested.

---

## Scale & performance budget (feeds SC-003/SC-005)

- Target sites: ≤ 1000 pages. Section-level index (heading granularity) keeps records small; MiniSearch JSON for a 500-page docs site is typically ~1–2 MB uncompressed and served with host-side gzip/brotli (same profile as VitePress local search, measured ~1.9 MB / 850 pages in published benchmarks).
- Index chunk is dynamically imported only when the modal first opens → query latency budget (< 1 s) applies after load; US2 Scenario 2's "a couple of seconds" covers the one-time fetch.
- Build overhead ≤ 20% (SC-005): one extra markdown render pass over `siteConfig.pages`, same cost class as VitePress's own local-search indexing; skipped when `search.enabled: false`.
- Oversized-index warning (FR-020): if serialized index > 5 MB, emit a build-time warning suggesting `include`/`exclude` narrowing.

## Open risks (not blocking planning)

| Risk | Mitigation |
|---|---|
| sastrawijs dictionary license (CC-BY-NC-SA) | R4 mitigation; swap root list behind unchanged `stem()` contract |
| VitePress internal specifier change (`VPNavBarSearch.vue`) | Pinned peer range + fixture integration test |
| Include-directive gap in index rendering | R2 preprocessor + integration test |
| Third-party (non-default) themes | Documented escape hatch: `ui: 'external'` mount snippet |
