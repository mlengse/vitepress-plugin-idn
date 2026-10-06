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
- [ ] T018 [US1] Run fixture dev + build: confirm T011/T012 pass, record SC-001/SC-002 evidence, and quickstart §4 items 1–6

**Checkpoint**: US1 fully functional — this is the MVP (stop here and validate per Implementation Strategy).

---

## Phase 4: User Story 2 — Search works offline on the published site (Priority: P2)

**Goal**: Static bundle searches with no server/API/internet; index download is one-time, lazy, non-blocking (FR-005, SC-004).

**Independent Test**: spec US2 Independent Test — serve `playground/dist` with a plain static file server, disconnect network, search succeeds; assert zero cross-origin requests.

### Tests for User Story 2

- [ ] T019 [US2] Create tests/integration/test_offline_search.test.ts: build fixture → serve dist via plain static server → assert (a) all search assets same-origin, (b) no network beyond static hosting, (c) results returned with external network blocked, (d) index chunk NOT requested on initial page load (lazy: US2 Scenario 2), (e) site HTML content renders with JS disabled (US1 Scenario 5 / progressive enhancement)

### Implementation for User Story 2

- [ ] T020 [US2] In src/node/searchIndexPlugin.ts ensure index is emitted as a separate lazily-imported chunk (not inlined into entry) via `build.rollupOptions.output.manualChunks` or dynamic-import natural splitting; verify chunk referenced only from src/client/indexLoader.ts
- [ ] T021 [US2] Run T019 to green and record SC-004 evidence; confirm dev-mode HMR index (FR-006) still works after chunking change via quickstart §4 item 3

**Checkpoint**: US1 + US2 both independently verified — published-site search is complete.

---

## Phase 5: User Story 3 — Root-word (stemming) utility (Priority: P3)

**Goal**: Authors call `stem()` from content/components with documented, deterministic, non-throwing behavior (FR-011–FR-014).

**Independent Test**: spec US3 Independent Test — call stem with "berlari"→"lari", "memadamkan"→"padam" and assert; plus SC-006 golden list.

### Tests for User Story 3

- [ ] T022 [US3] Create tests/contract/test_public_api.test.ts asserting contracts/public-api.md tables verbatim: `berlari→lari`, `memadamkan→padam`, `pemerintahan→perintah`, `menyukai→suka`; `''→''`; unknown `xyzzy→xyzzy`; mixed-input fuzz batch never throws (FR-013)
- [ ] T023 [US3] Create tests/fixtures/stem-golden.json (50-word list covering meN-, ber-, peN-, di-, ter-, -kan, -an, -i per SC-006) and tests/unit/test_stem_golden.test.ts asserting ≥85% correctness; include stop-word stem case asserting documented deterministic behavior (US3 AC3)

### Implementation for User Story 3

- [ ] T024 [US3] Implement src/index.ts public entry exporting `stem(word, language?)`, `tokenize(text, language?)`, `IDN_VERSION` (re-export from src/core, no deep imports required — FR-014); add TSDoc documenting stop-word and unknown-word behavior
- [ ] T025 [US3] Add fixture theme component playground/.vitepress/theme/AuthorUtils.vue importing `stem` from the package public entry to build a glossary list, and assert it in tests/integration/test_author_utility.test.ts (FR-014 end-to-end)

**Checkpoint**: US3 independently verified via T022/T023/T025.

---

## Phase 6: User Story 4 — Syllabification / hyphenation (Priority: P4)

**Goal**: Correct Indonesian syllable breaking for line-wrapping (soft hyphens) and explicit syllabified text (FR-015–FR-018).

**Independent Test**: spec US4 Independent Test — constrained-width fixture container breaks only at valid Indonesian boundaries; `syllabify("pemerintahan")` → `"pe-mer-in-ta-han"`.

### Tests for User Story 4

- [ ] T026 [US4] Create tests/fixtures/syllabify-golden.json (50-word list per SC-007) and tests/unit/test_syllabify.test.ts: exact expectations `pemerintahan → pe-mer-in-ta-han` (FR-018, US4 AC2), ≥95% golden-list accuracy (SC-007), word shorter than minimum length left intact (US4 AC3)
- [ ] T027 [US4] Create tests/unit/test_hyphenate.test.ts: soft hyphens (`U+00AD`) inserted only at valid `hyphen/id` break points (FR-016), idempotent re-run, URLs/code-like tokens and `minWordLength` threshold untouched (FR-017, US4 AC3)

### Implementation for User Story 4

- [ ] T028 [US4] Implement src/core/syllabify.ts: Indonesian CV-V, V-V, V-CV, CV-CV rule engine per data-model.md §7; never throws; words < 3 chars returned unchanged
- [ ] T029 [US4] Implement src/core/hyphenate.ts: Liang algorithm over `hyphen/id` patterns from the `hyphen` package (research R6); language-switchable (`id`/`en`)
- [ ] T030 [US4] Implement src/client/hyphenationRuntime.ts: runs post-mount (no hydration mismatch), scoped to `hyphenate.selector`; absolute skip list `pre`, `code`, `a`, `.header-anchor`, `[data-no-hyphen]` enforced regardless of selector (FR-017); `minWordLength` respected; idempotent
- [ ] T031 [US4] Wire `hyphenate` options in src/node/index.ts: when `hyphenate.enabled` inject runtime (script/virtual module) into the VitePress layout; add fixture page with long words in a constrained container and assert valid boundary breaks in tests/integration/test_hyphenation_build.test.ts (US4 AC1)
- [ ] T032 [US4] Export `syllabify` and `hyphenateText` from src/index.ts (FR-014, FR-018) with TSDoc examples matching contracts/public-api.md

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T033 [P] Write README.md + NOTICE: <10-minute default install walkthrough (SC-008), and FR-023 "Upstream capabilities" table — sastrawijs, snowball-js, hyphen, stopwords-iso, vitepress-plugin-pagefind, lunr.js, lunr-languages: adopted/replaced/dropped + reason, including the sastrawijs/kateglo CC-BY-NC-SA license note and mitigation (research R4); notice-files attribution for stopwords-iso (research R5)
- [ ] T034 [P] Run Lighthouse/axe accessibility audit on the built fixture with search modal open (quickstart §7): zero critical/serious violations, keyboard navigation complete, 360×740 viewport usable with ≥40 px touch targets (SC-008, SC-009, FR-022); fix findings in src/client/Search.vue
- [ ] T035 Create scripts/bench-build.ts: measure playground build with vs without `idnPlugin()` and assert overhead ≤ 20% (SC-005); also demonstrate oversized-index warning by running with `minIndexSizeWarningMB: 0.0001` (FR-020, quickstart §5.4)
- [ ] T036 Verify `ui: 'external'` escape hatch: export `<IdnSearch />` from src/vue.ts, mount in fixture, confirm search works without the alias (research R1 residual risk / R9)
- [ ] T037 Run full toolchain gates: `tsc --noEmit`, `eslint .`, `vitest run` all green (quickstart §10)
- [ ] T038 Execute quickstart.md §4–§9 end-to-end and record one evidence line per success criterion SC-001…SC-010 for the PR description

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
