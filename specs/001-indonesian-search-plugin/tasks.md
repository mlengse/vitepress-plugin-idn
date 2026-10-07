---

description: "Task list template for feature implementation"
---

# Tasks: Indonesian Language Capabilities for VitePress

**Input**: Design documents from `/specs/001-indonesian-search-plugin/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — explicitly required by spec.md (per-story Independent Test sections, SC-001/002/006/007 golden lists) and quickstart.md §6/§10.

**Organization**: Tasks grouped by user story (US1=P1, US2=P2, US3=P3, US4=P4) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Jev-approved parallelizable (decoupled files, no shared state)
- **[Story]**: US1–US4 mapping to spec.md user stories
- **[HIGH]**: Jev-scored `high` implementation risk (index plugin ≈0.64, search modal ≈0.63) — scheduled early in US1

## Path Conventions

Single-package library per plan.md: `src/`, `tests/`, `scripts/`, `playground/` at repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package skeleton, toolchain, fixture site

- [X] T001 Initialize npm package per plan.md structure: package.json (ESM, name `vitepress-plugin-idn`, exports map `.` → dist index and `./vue`), tsconfig.json (ES2020, strict), tsup.config.ts, and create src/ scripts/ tests/ directories
- [X] T002 Install dependencies per plan.md Technical Context: runtime `minisearch sastrawijs snowball-js hyphen`; dev `typescript vitest tsup eslint vitepress vue @types/node`
- [X] T003 [P] Configure linter in eslint.config.js (TypeScript rules, no-floating-promises)
- [X] T004 [P] Configure vitest in vitest.config.ts and create tests/unit tests/contract tests/integration directory skeletons
- [X] T005 [P] Scaffold fixture site per quickstart §3: playground/.vitepress/config.ts registering `idnPlugin()` from ../../src/node, plus fixture pages containing stem/derivative pairs (berlari/lari/pelari, menyapu/sapu, pengembangan/berkembang), one `search: false` page, one `<!--@include:-->` directive, and one long-Indonesian-word paragraph

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, language pipeline, plugin factory — blocks ALL user stories

- [X] T006 Implement src/core/types.ts: PluginOptions with verbatim defaults/validation from data-model.md §1 (`language: 'id' | 'en'` default `'id'`; `include` default `['**/*.md']`; `exclude` default `[]`; `hyphenate` default `{ enabled: false, selector: '.vp-doc p, .vp-doc li, .vp-doc td', minWordLength: 6 }`; `ui: 'nav' | 'external' | false` default `'nav'`; `minIndexSizeWarningMB` default `5`), SearchIndexEnvelope, IndexedSection, Query/QueryResult types per contracts/search-behavior.md
- [X] T007 Implement src/core/stem.ts: adapters over sastrawijs (`language: 'id'`) and snowball-js (`language: 'en'`); contract per contracts/public-api.md — deterministic, **never throws** (FR-013): `''`→`''`, unknown word → input returned
- [X] T008 Implement src/core/stopwords/id.ts and src/core/stopwords/en.ts (vendored lists, source stopwords-iso per research R5) plus generator scripts/update-stopwords.ts
- [X] T009 Implement src/core/pipeline.ts: `normalize → tokenize → drop stop words → reduce reduplication ("buku-buku" → "buku") → stem` — single implementation invoked by BOTH index and query paths (FR-012); tolerate punctuation/casing/whitespace and >100-char input (FR-009, spec edge cases)
- [X] T010 Implement src/node/index.ts `idnPlugin()` factory + src/node/configResolved.ts: access `config.vitepress`, compose (never replace) host `buildEnd`/`transformHead` hooks (contract G4), validation per contracts/plugin-options.md — unknown `language` → build **error** listing the value; 0 pages matched → build **warning**; zero network (FR-021); `enabled: false` → no index/UI but build succeeds (FR-020)

**Checkpoint**: Foundation ready — all user stories can begin; pipeline + types are the shared dependency DAG root.

---

## Phase 3: User Story 1 — Indonesian-aware site search (Priority: P1) 🎯 MVP

**Goal**: Reader gets ranked, morphology-aware results with title/path/snippet in the default theme's nav-bar search UI (FR-001–FR-004, FR-009, FR-010).

**Independent Test**: quickstart §4 dev scenario + spec US1 Independent Test: fixture pages with stem/derivative pairs; queries "lari", "sapu", "berkembang" surface related pages above unrelated; "yang dan di" → labeled stop-word outcome; 500-page build → <1 s (SC-003).

### Tests for User Story 1 (write FIRST — must fail before implementation)

- [X] T011 [US1] Create tests/unit/test_search_pipeline.test.ts: SC-001 20 curated root/derivative queries (≥90% top-10 hit rate), SC-002 stop-word-only query → `reason: 'stopwords-only'` (never full dump), reduplication symmetry ("buku-buku"↔"buku"), FR-009 punctuation/casing/whitespace cases
- [X] T012 [US1] Create tests/integration/test_search_build.test.ts: build playground fixture and assert — search button rendered (alias worked), index chunk emitted, `search: false` page excluded from index, result `#anchor` deep links resolve to built HTML headings, include-directive content indexed (R2 gap coverage)

### Implementation for User Story 1

- [X] T013 [US1] Implement src/node/markdown.ts: wrapper over VitePress public `createMarkdownRenderer(srcDir, options, base, logger)` + include-directive preprocessor (`<!--@include: file-->`, `<<< file`) per research R2
- [X] T014 [US1] [HIGH] Implement src/node/searchIndexPlugin.ts: virtual module `virtual:vitepress-plugin-idn/index`; dev `.md` hotUpdate rescan (FR-006); build scan honoring include/exclude globs + `frontmatter.search: false` (FR-007); heading-section splitting with built-page-identical anchors; MiniSearch serialization + SearchIndexEnvelope (`schemaVersion`, `language`, `stopWordsSnapshot`, `generatedAt`); size warning at `minIndexSizeWarningMB` (FR-020)
- [X] T015 [US1] Implement src/client/indexLoader.ts: lazy dynamic import of index chunk; on `schemaVersion`/`language` mismatch → visible UI error state + console error, never silent empty results (FR-020, SC-010)
- [X] T016 [US1] [HIGH] Implement src/client/Search.vue to contracts/search-behavior.md: `role="dialog"` + `aria-modal` + labelled input; `Ctrl/Cmd+K` and `/` open (not while typing); `Esc`/backdrop close with focus restore; `↑`/`↓`/`Enter` over `role="listbox"` with `aria-selected`; focus trap; empty-state and stop-word-only messages (FR-010); `aria-busy` loading; results show title/path/snippet with match highlight (FR-001); 360 px mobile layout (FR-022)
- [X] T017 [US1] Wire nav-bar injection in src/node/index.ts: `resolve.alias` mapping `./VPNavBarSearch.vue` → src/client/Search.vue (research R1); when alias target not found in theme (non-default theme) → build **warning** suggesting `ui: 'external'` (contracts/plugin-options.md)
- [X] T018 [US1] Run fixture dev + build: confirm T011/T012 pass, record SC-001/SC-002 evidence, and quickstart §4 items 1–6

**Checkpoint**: US1 fully functional — this is the MVP (stop here and validate per Implementation Strategy).

---

## Phase 4: User Story 2 — Search works offline on the published site (Priority: P2)

**Goal**: Static bundle searches with no server/API/internet; index download is one-time, lazy, non-blocking (FR-005, SC-004).

**Independent Test**: spec US2 Independent Test — serve `playground/dist` with a plain static file server, disconnect network, search succeeds; assert zero cross-origin requests.

### Tests for User Story 2

- [X] T019 [US2] Create tests/integration/test_offline_search.test.ts: build fixture → serve dist via plain static server → assert (a) all search assets same-origin, (b) no network beyond static hosting, (c) results returned with external network blocked, (d) index chunk NOT requested on initial page load (lazy: US2 Scenario 2), (e) site HTML content renders with JS disabled (US1 Scenario 5 / progressive enhancement)

### Implementation for User Story 2

- [X] T020 [US2] In src/node/searchIndexPlugin.ts ensure index is emitted as a separate lazily-imported chunk (not inlined into entry) via `build.rollupOptions.output.manualChunks` or dynamic-import natural splitting; verify chunk referenced only from src/client/indexLoader.ts
- [X] T021 [US2] Run T019 to green and record SC-004 evidence; confirm dev-mode HMR index (FR-006) still works after chunking change via quickstart §4 item 3

**Checkpoint**: US1 + US2 both independently verified — published-site search is complete.

---

## Phase 5: User Story 3 — Root-word (stemming) utility (Priority: P3)

**Goal**: Authors call `stem()` from content/components with documented, deterministic, non-throwing behavior (FR-011–FR-014).

**Independent Test**: spec US3 Independent Test — call stem with "berlari"→"lari", "memadamkan"→"padam" and assert; plus SC-006 golden list.

### Tests for User Story 3

- [X] T022 [US3] Create tests/contract/test_public_api.test.ts asserting contracts/public-api.md tables verbatim: `berlari→lari`, `memadamkan→padam`, `pemerintahan→perintah`, `menyukai→suka`; `''→''`; unknown `xyzzy→xyzzy`; mixed-input fuzz batch never throws (FR-013)
- [X] T023 [US3] Create tests/fixtures/stem-golden.json (50-word list covering meN-, ber-, peN-, di-, ter-, -kan, -an, -i per SC-006) and tests/unit/test_stem_golden.test.ts asserting ≥85% correctness; include stop-word stem case asserting documented deterministic behavior (US3 AC3)

### Implementation for User Story 3

- [X] T024 [US3] Implement src/index.ts public entry exporting `stem(word, language?)`, `tokenize(text, language?)`, `IDN_VERSION` (re-export from src/core, no deep imports required — FR-014); add TSDoc documenting stop-word and unknown-word behavior
- [X] T025 [US3] Add fixture theme component playground/.vitepress/theme/AuthorUtils.vue importing `stem` from the package public entry to build a glossary list, and assert it in tests/integration/test_author_utility.test.ts (FR-014 end-to-end)

**Checkpoint**: US3 independently verified via T022/T023/T025.

---

## Phase 6: User Story 4 — Syllabification / hyphenation (Priority: P4)

**Goal**: Correct Indonesian syllable breaking for line-wrapping (soft hyphens) and explicit syllabified text (FR-015–FR-018).

**Independent Test**: spec US4 Independent Test — constrained-width fixture container breaks only at valid Indonesian boundaries; `syllabify("pemerintahan")` → `"pe-mer-in-ta-han"`.

### Tests for User Story 4

- [X] T026 [US4] Create tests/fixtures/syllabify-golden.json (50-word list per SC-007) and tests/unit/test_syllabify.test.ts: exact expectations `pemerintahan → pe-mer-in-ta-han` (FR-018, US4 AC2), ≥95% golden-list accuracy (SC-007), word shorter than minimum length left intact (US4 AC3)
- [X] T027 [US4] Create tests/unit/test_hyphenate.test.ts: soft hyphens (`U+00AD`) inserted only at valid `hyphen/id` break points (FR-016), idempotent re-run, URLs/code-like tokens and `minWordLength` threshold untouched (FR-017, US4 AC3)

### Implementation for User Story 4

- [X] T028 [US4] Implement src/core/syllabify.ts: Indonesian CV-V, V-V, V-CV, CV-CV rule engine per data-model.md §7; never throws; words < 3 chars returned unchanged
- [X] T029 [US4] Implement src/core/hyphenate.ts: Liang algorithm over `hyphen/id` patterns from the `hyphen` package (research R6); language-switchable (`id`/`en`)
- [X] T030 [US4] Implement src/client/hyphenationRuntime.ts: runs post-mount (no hydration mismatch), scoped to `hyphenate.selector`; absolute skip list `pre`, `code`, `a`, `.header-anchor`, `[data-no-hyphen]` enforced regardless of selector (FR-017); `minWordLength` respected; idempotent
- [X] T031 [US4] Wire `hyphenate` options in src/node/index.ts: when `hyphenate.enabled` inject runtime (script/virtual module) into the VitePress layout; add fixture page with long words in a constrained container and assert valid boundary breaks in tests/integration/test_hyphenation_build.test.ts (US4 AC1)
- [X] T032 [US4] Export `syllabify` and `hyphenateText` from src/index.ts (FR-014, FR-018) with TSDoc examples matching contracts/public-api.md

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T033 [P] Write README.md + NOTICE: <10-minute default install walkthrough (SC-008), and FR-023 "Upstream capabilities" table — sastrawijs, snowball-js, hyphen, stopwords-iso, vitepress-plugin-pagefind, lunr.js, lunr-languages: adopted/replaced/dropped + reason, including the sastrawijs/kateglo CC-BY-NC-SA license note and mitigation (research R4); notice-files attribution for stopwords-iso (research R5)
- [X] T034 [P] Run Lighthouse/axe accessibility audit on the built fixture with search modal open (quickstart §7): zero critical/serious violations, keyboard navigation complete, 360×740 viewport usable with ≥40 px touch targets (SC-008, SC-009, FR-022); fix findings in src/client/Search.vue
- [X] T035 Create scripts/bench-build.ts: measure playground build with vs without `idnPlugin()` and assert overhead ≤ 20% (SC-005); also demonstrate oversized-index warning by running with `minIndexSizeWarningMB: 0.0001` (FR-020, quickstart §5.4)
- [X] T036 Verify `ui: 'external'` escape hatch: export `<IdnSearch />` from src/vue.ts, mount in fixture, confirm search works without the alias (research R1 residual risk / R9)
- [X] T037 Run full toolchain gates: `tsc --noEmit`, `eslint .`, `vitest run` all green (quickstart §10)
- [X] T038 Execute quickstart.md §4–§9 end-to-end and record one evidence line per success criterion SC-001…SC-010 for the PR description

---

## Phase 8: Fork Sourcing Alignment (FR-023 re-plan, 2026-10-07)

**Context**: The feature shipped (T001–T038) against published npm packages. A spec re-plan (Clarifications 2026-10-07 + research R3/R4/R6, data-model §6) now mandates that adopted capabilities be runtime-sourced from the user's own `github.com/mlengse/*` forks (FR-023). This phase aligns the implementation with that decision.

**Note**: switching the `en` stemmer changes index terms for `language:'en'` sites — a full rebuild is required; no `schemaVersion` bump (the FR-020/SC-010 mismatch guard still covers stale chunks).

- [X] T039 Update `package.json` runtime dependencies to fork-sourced packages (FR-023). **PARTIAL — snowball-js done, sastrawijs/hyphen deferred per user decision (2026-10-07, option 1)**: `@mlengse/snowball-js@^1.0.1` (fork-published, npm registry) replaced `stemmer` and is fully wired (npm install green). `github:mlengse/sastrawijs` and `github:mlengse/hyphen` are NOT installable — npm on this machine refuses git deps (`EALLOWGIT`), and neither fork ships installable artifacts (sastrawijs fork has no committed `dist/`; hyphen fork's root package.json is a `private` dev env with no `name`/`main`/`exports`, built output `./package` not committed; `@mlengse/hyphen` not on the registry). Kept on npm registry with README/NOTICE fork-sourcing-pending notes per option 1.
- [X] T040 [P] Write-test-first `en`-stem contract tests in `tests/contract/test_public_api.test.ts`: 5-word golden set matching `@mlengse/snowball-js` English (Snowball/Porter2) output (`running`→`run`, `horses`→`hors`, `flies`→`fli`, `agreed`→`agre`, `programming`→`program`), `stem('','en')==''`, and a `language:'en'` no-throw batch (FR-013). Verified against the fork: `new EnglishStemmer()` + `setCurrent/stem/getCurrent`.
- [X] T041 Implement the `en` adapter in `src/core/stem.ts` using `@mlengse/snowball-js/english`; `id` adapter, `ID_CORRECTIONS`, and cache untouched; `stemmer` import dropped. Note: the fork's published d.ts declares a factory while the runtime CJS is a constructor — adapter casts accordingly (`as unknown as new () => Stemmer`).
- [X] T042 Update `scripts/copy-assets.mjs`: **NO CHANGE REQUIRED** — `@mlengse/snowball-js` ships an `exports` map (`import` condition → real `.mjs`), so dist's `import ... from "@mlengse/snowball-js/english"` resolves under plain Node ESM; the `hyphen` directory-import patch is retained (hyphen still npm for now). Build verified via `npm run build` (exit 0).
- [X] T043 [P] Update `README.md` "Upstream capabilities" table (FR-023) and the `stem` API comment: snowball-js row is now **Adopted from `github.com/mlengse/snowball-js`** (`@mlengse/snowball-js`, MPL-1.1) for the `en` path — "Dropped. Replaced by stemmer" wording removed; sastrawijs and hyphen rows cite the `mlengse/*` forks as adopted upstreams with fork-publishing-pending notes; minisearch/stopwords-iso stay third-party; kateglo provenance note retained.
- [X] T044 [P] Update `NOTICE`: `stemmer` entry removed; replaced by `@mlengse/snowball-js` (MPL-1.1, homepage `github.com/mlengse/snowball-js`, used for `en` Snowball/Porter2 stemming); sastrawijs and hyphen entries gained fork-provenance notes (FR-023 re-plan) stating npm-registry consumption until the forks publish; stopwords-iso/minisearch attribution unchanged.
- [X] T045 Run the full gate suite and record fork-sourcing evidence: `npm run typecheck` (0), `npm run lint` (0), `npm test` (10 files / 91 tests, +7 `en`), `npm run bench` (SC-005 overhead 10.0% PASS ≤20%), `npm run verify:external` (packaged `@mlengse/snowball-js/english` resolves under plain Node ESM). Evidence appended to `specs/001-indonesian-search-plugin/evidence.md` (§ Phase 8 — FR-023 fork sourcing).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T003/T004/T005 parallel after T001+T002
- **Foundational (Phase 2)**: depends on Setup; **BLOCKS all user stories**
  - Internal order: T006 → (T007, T008) → T009 → T010
- **US1 (Phase 3)**: depends on Foundational only
- **US2 (Phase 4)**: depends on US1 (chunking/lazy-load work extends `searchIndexPlugin.ts` built in T014/T015)
- **US3 (Phase 5)**: depends on Foundational only (T007); can run in parallel with US1/US2
- **US4 (Phase 6)**: depends on Foundational only (T006, T010); can run in parallel with US1/US2/US3
- **Polish (Phase 7)**: depends on all desired stories; T033/T034 parallel, T037 gates before T038
- **Fork Sourcing (Phase 8)**: depends on Phase 7 (all stories complete) — re-aligns the shipped implementation's runtime sources to the `mlengse/*` forks per the FR-023 re-plan; T040‖T043‖T044 parallel after T039

### User Story Dependencies

- **US1 (P1)**: Foundational → complete (MVP)
- **US2 (P2)**: Foundational + US1's index plugin/loader
- **US3 (P3)**: Foundational only — independent of US1/US2
- **US4 (P4)**: Foundational only — independent of US1/US2/US3

### Parallel Opportunities (Jev-validated)

- Setup: `T003 ‖ T004 ‖ T005` (jev 0.69 ✓)
- Polish: `T033 ‖ T034` (jev 0.69 ✓)
- Cross-story (after Foundational): `US3 ‖ US4 ‖ US1` — but note jev returned **no** for `Search.vue ‖ searchIndexPlugin.ts` (0.45), `syllabify ‖ hyphenate` (0.25), `contract tests ‖ integration tests` (0.28) — treat those as sequential within an agent.

---

## Parallel Example: User Story 1

```text
# Tests first (sequential — both touch nothing but their own files, but jev declined pairing):
Task T011: tests/unit/test_search_pipeline.test.ts
Task T012: tests/integration/test_search_build.test.ts

# Implementation chain (file-disjoint but contract-coupled — run sequentially):
Task T013: src/node/markdown.ts
Task T014: src/node/searchIndexPlugin.ts   [HIGH]
Task T015: src/client/indexLoader.ts
Task T016: src/client/Search.vue           [HIGH]
Task T017: alias wiring in src/node/index.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1 → **STOP AND VALIDATE** (quickstart §4 + T011/T012 evidence)
3. Deliverable: working Indonesian-aware search in the default theme

### Incremental Delivery

1. Setup + Foundational → shared pipeline ready
2. US1 → MVP search (SC-001, SC-002 evidence)
3. US2 → offline/static proof (SC-004)
4. US3 → author utility (SC-006)
5. US4 → typography features (SC-007)
6. Polish → SC-003/005/008/009/010 evidence + docs (FR-023)

### Risk-First Scheduling

The two Jev-`high` tasks (T014 index plugin, T016 search modal) sit at the front of US1 — the riskiest work is proven before any lower-priority story starts.

---

## Notes

- Every task: checkbox + sequential ID + exact file path; story labels only inside user-story phases.
- Spec edge cases (mixed digits/punctuation queries, unmapped affixes degrading to prefix match, language-marked pages excluded) are covered by T011/T012 fixtures.
- Commit after each task or logical group; stop at any checkpoint to validate the story independently.
- T001–T038 record the shipped feature (all complete) against npm-published dependencies; Phase 8 (T039–T045) is the FR-023 fork-sourcing re-plan delta added on 2026-10-07 — P1/P2/P3/P4 story scoping is unchanged, only runtime sources differ (research R3/R4/R6).

---

## Phase 9: Convergence

- [X] T046 Source Indonesian stemming from the `sastrawijs` fork at runtime: publish `@mlengse/sastrawijs` to the npm registry (or commit `dist/` to the fork branch), then switch `package.json` dependency from `sastrawijs@^1.1.0` to the fork-published registry package and align `src/core/stem.ts` imports per FR-023 (partial). **BLOCKED (re-checked 2026-10-07): `@mlengse/sastrawijs` E404 on npm; fork master has 0 committed `dist/` files. Re-run when the fork publishes.** **RESOLVED by T050 (Phase 10, 2026-10-07)** — the fork published under a different name than anticipated: unscoped `sastrawijs-ts@1.0.1` from `github.com/mlengse/sastrawijs-ts` (repo renamed; MIT). `package.json` and `src/core/stem.ts` now source from it, the obsolete `src/types/sastrawijs.d.ts` shim is gone, and the 67-word golden list is byte-identical.
- [X] T047 Source hyphenation from the `hyphen` fork at runtime: make the `mlengse/hyphen` fork publishable (`@mlengse/hyphen` with a proper name/main/exports + built `package/`), then switch `package.json` dependency from `hyphen@^1.14.1` to the fork-published registry package, re-verify `scripts/copy-assets.mjs` deep-import patch, and update `README`/`NOTICE` pending notes per FR-023 / research R6 (partial). **BLOCKED (re-checked 2026-10-07): `@mlengse/hyphen` E404 on npm; fork master has 0 committed `package/` entries. Re-run when the fork ships a publishable package.** **RESOLVED by T051 (Phase 10, 2026-10-07)** — published as unscoped `hyphenasi@1.15.0` from `github.com/mlengse/hyphenasi` (ISC), again under a different name than anticipated. All three import sites switched, a `src/types/hyphenasi.d.ts` ambient declaration replaces `@types/hyphen`, the `copy-assets.mjs` deep-import rewrite is replaced by a build-time guard, and the Indonesian patterns measure as more accurate than upstream (11 invalid / 9 missed boundaries vs 18 / 44 across the 110-word PUEBI list).
- [X] T048 Update quickstart.md §2 scaffold install to the working dependency set (`npm i minisearch @mlengse/snowball-js sastrawijs hyphen` — registry) with a fork-publishing note for sastrawijs/hyphen runtime sourcing per plan "Adopted sources — fork sourcing" (contradicts)

---

## Phase 10: Convergence

- [X] T049 CRITICAL — Restore a resolvable dependency tree so the gate suite runs: `node_modules/@mlengse/` is absent and `npm ls` reports `UNMET DEPENDENCY @mlengse/snowball-js@^1.0.1` plus extraneous `stemmer@2.0.1`, so `tsc --noEmit` fails `TS2307` at `src/core/stem.ts:1` and `vitest run` aborts in `tests/global-setup.ts` with `ERR_MODULE_NOT_FOUND` (0 tests collected) — contradicting the recorded green gates in T045 / `evidence.md` (contradicts, T037, T045, SC-010). Run a clean `npm ci` (or `npm install`) to reconcile `package-lock.json` with `package.json`, drop the leftover `stemmer`, and re-run `npm run typecheck`, `npm run lint`, `npm test`, `npm run bench`, `npm run verify:external` recording real output in `evidence.md`. **DONE (2026-10-07)**: `npm ci` clean, stray `stemmer` gone; all gates green (typecheck 0, lint 0, 10 files/91 tests, build 0, verify:external OK, bench overhead 4.8% PASS). Also fixed the phantom completion behind 5 integration failures: `.gitignore`'s bare `.vitepress/` pattern hid `playground/.vitepress/theme/`, so T025/T031's `AuthorUtils.vue`/`Layout.vue`/`index.ts` were never committed; narrowed the ignore to `cache/`+`dist/` and recreated the theme (needs a static `Layout` import — a lazy import silently SSRs to `[object Promise]`). Evidence: `evidence.md` § Phase 10.
- [X] T050 Source Indonesian stemming from the published `sastrawijs` fork: switch `package.json` from `sastrawijs@^1.1.0` to `sastrawijs-ts@^1.0.1` and align `src/core/stem.ts:2`; delete the now-obsolete `src/types/sastrawijs.d.ts` shim (the fork ships a `types` condition in its `exports` map) per FR-023 / T039 / T046 (contradicts). Verified parity: 0 stem diffs vs the current engine across all 67 `tests/fixtures/stem-golden.json` entries with the existing `ID_CORRECTIONS` layer, 100% SC-006 accuracy both ways — re-confirm via `tests/unit/test_stem_golden.test.ts` and `tests/contract/test_public_api.test.ts` after the switch. **DONE (2026-10-07)**: dep switched, `src/core/stem.ts` imports `sastrawijs-ts`, `src/types/sastrawijs.d.ts` deleted (fork ships `types` in its `exports` map), comments updated. Parity confirmed in-suite — full run 94/94 green, so all 67 golden entries and the contract tables still hold. Also clears the critical `sastrawijs` advisory chain (upstream pulls `babel-plugin-transform-class-properties`); `npm ls` shows the fork only.
- [X] T051 Source hyphenation from the published `hyphenasi` fork: switch `package.json` from `hyphen@^1.14.1` to `hyphenasi@^1.15.0` and update the three import sites (`src/core/hyphenate.ts:17-18`, `src/core/syllabify.ts:21`); add an ambient module declaration for `hyphenasi/id` and `hyphenasi/en` (the package ships no per-subpath `.d.ts`, so `strict` typecheck fails `TS7016`); retarget or retire the `hyphen/(id|en)` deep-import rewrite at `scripts/copy-assets.mjs:32` (`hyphenasi` resolves via its own `exports` map); and adjudicate the verified pattern divergence — `hyphenasi/id` differs from `hyphen/id` on 20 of 110 golden-list words, introducing leading single-letter breaks (`i-ngin`, `a-ba-di`, `o-rang`) that conflict with US4 AC1's "valid Indonesian syllable boundary" and SC-007 — per FR-023 / T047 (contradicts). **DONE (2026-10-07)**: all three import sites switched; `@types/hyphen` dropped in favour of a new `src/types/hyphenasi.d.ts` ambient declaration; `scripts/copy-assets.mjs` rewrite replaced by a guard that throws if any `hyphen/` import survives into `dist/`. **Divergence adjudicated — the original finding was WRONG in direction.** Scored both engines against the 110-word PUEBI golden list (`tests/fixtures/syllabify-golden.json`): upstream `hyphen/id` = 18 invalid + 44 missed boundaries; fork `hyphenasi/id` = **11 invalid + 9 missed**. The fork's leading single-letter breaks (`a-ba-di`, `i-ngin`, `o-rang`) are *correct* Indonesian — a vowel may open a syllable — and it repairs real upstream defects (`jal-an`→`ja-lan`, `eko-no-mi`→`e-ko-no-mi`, `ber-jal-an`→`ber-ja-lan`). Exactly one word regresses (`belajar`: `bel|a|jar` vs the correct `be|la|jar`). Adopted. Note hyphenation and syllabification are deliberately different systems (documented deviation in contracts/public-api.md), so their break sets are NOT expected to match; 3 new tests lock in the fork's behaviour and a ≥0.6 boundary-overlap check against the in-package syllabifier.
- [X] T052 Reconcile the declared Node engine range with the fork requirement: `sastrawijs-ts` publishes `engines.node: ">=20"` while `package.json:63` declares `"node": ">=18"` and plan Technical Context states Node 18+; raising the floor silently contradicts the plan, so decide and document one of (raise `engines`/`quickstart.md` §1 prerequisite) or (pin a `sastrawijs-ts` release compatible with 18) per plan Technical Context / T039 (contradicts). **DONE (2026-10-07) — floor raised to `>=20`.** No Node-18-compatible `sastrawijs-ts` release exists (only 1.0.0/1.0.1 published, both `>=20`), and Node 18 has been EOL since 2025-04-30. The fork's shipped bundle was verified ES2020-only (no `??`/`.at()`/`structuredClone`/`Object.groupBy`/`findLast`), so its `engines` reflects its rollup/babel build toolchain rather than a runtime need. `package.json` `engines` and `quickstart.md` §1 updated; the plan's original "Node 18+" line is superseded and the deviation is recorded in `evidence.md`. **Override point**: if Node 18 support is a hard requirement, the fork must publish a release declaring `<20` — that is a decision for the maintainer, not something this repo can assert.
- [X] T053 Rewrite FR-023 attribution for the published forks: `README.md:120-121`, `NOTICE:24-39`, `quickstart.md:15`, and `evidence.md:59-66` all still describe `sastrawijs`/`hyphen` fork sourcing as "pending publication"; restate them as adopted from `github.com/mlengse/sastrawijs-ts` (npm `sastrawijs-ts`, MIT) and `github.com/mlengse/hyphenasi` (npm `hyphenasi`, ISC), note the upstream→fork rename, and retain the kateglo CC-BY-NC-SA provenance note per FR-023 / T043 / T044 (partial). **DONE (2026-10-07)**: all four files rewritten. README's table now lists `sastrawijs-ts` and `hyphenasi` as adopted-from-the-fork with npm coordinates, the repo rename, the byte-identical stem parity, and the measured hyphenation accuracy improvement; `NOTICE` entries 1/2/4 carry fork provenance plus the rename and supersede the "until published" wording; `quickstart.md` §2 install line is `minisearch @mlengse/snowball-js sastrawijs-ts hyphenasi`; `evidence.md`'s pending bullet is replaced with the adopted state. Kateglo CC-BY-NC-SA note and the `stem()` swap-behind-the-contract mitigation retained verbatim.
- [X] T054 Pin and re-verify the fixed `@mlengse/snowball-js` release: bump the range to `^1.0.2` (the published `d.ts` factory / CJS runtime constructor fix), confirm whether the `as unknown as new () => EnStemmer` cast at `src/core/stem.ts:25` is still required against 1.0.2's `dist/languages/english.d.mts`, and re-run the `en` golden set from T040 (`running`→`run`, `horses`→`hors`, `flies`→`fli`, `agreed`→`agre`, `programming`→`program`) per FR-013 / FR-023 / T041 (partial). **DONE (2026-10-07)**: range is `^1.0.2` and resolves to `1.0.2`. **The cast is still required** — 1.0.2's `dist/languages/english.d.mts` still declares `declare function EnglishStemmer(): Stemmer` (a factory), so a bare `new EnglishStemmer()` fails with TS7009 under `strict`; the runtime CJS/ESM bundle is a genuine constructor. Verified all 5 `en` golden cases pass through the adapter (`running`→`run`, `horses`→`hors`, `flies`→`fli`, `agreed`→`agre`, `programming`→`program`), and the reason is now documented at the cast site so it is not mistaken for dead code.
