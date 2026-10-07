# Implementation Plan: Indonesian Language Capabilities for VitePress

**Branch**: `master` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-indonesian-search-plugin/spec.md`

## Summary

Deliver a single-install VitePress plugin (`vitepress-plugin-idn`) that adds Indonesian-aware full-text search plus standalone stemming, syllabification, and hyphenation utilities. Technical approach (Phase 0 research, [research.md](./research.md)):

- **Architecture (R1)**: a standalone Vite plugin — augmenting VitePress's built-in local search is infeasible (its provider check and `__VP_LOCAL_SEARCH__` define are evaluated before third-party plugin hooks can run). The plugin serves its own search index via a virtual module and injects its search UI by aliasing the default theme's `./VPNavBarSearch.vue` (pattern proven by `vitepress-plugin-pagefind`; `VPNavBar.vue` renders the slot unconditionally).
- **Indexing (R2)**: re-render Markdown with VitePress's public `createMarkdownRenderer` (verified exported in vitepress 1.6.4) → heading-section records with anchors identical to built pages; works in dev (HMR) and build.
- **Language pipeline (R4–R6)**: MiniSearch (jev-chosen, 0.91) with one identical pipeline at index and query time: normalize → tokenize → stop words → reduplication reduction → stem (`sastrawijs` for id, `snowball-js` for en — both sourced from the user's `mlengse/*` forks per the FR-023 clarification). Hyphenation via `hyphen/id` soft hyphens (`mlengse/hyphen` fork); syllabification by in-package Indonesian CV rules. Language selectable per site, Indonesian default (FR-008, user answer B).

## Technical Context

**Language/Version**: TypeScript 5.x (ES2020 output, ESM + `.d.ts`); Node 18+ at build time

**Primary Dependencies**: peer `vitepress ^1.5 || ^1.6`, `vue ^3.3`; runtime `minisearch` (third-party), plus `sastrawijs`, `snowball-js`, `hyphen` **sourced from the user's forks** (`github.com/mlengse/*`); dev `vitest`, `tsup`, `eslint`, `tsc`, fixture `vitepress` site

**Adopted sources — fork sourcing (re-plan 2026-10-07, per spec Clarifications + FR-023)**:

- Indonesian stemming → `github.com/mlengse/sastrawijs`
- English stemming → `github.com/mlengse/snowball-js` — re-adopts the engine that the current implementation temporarily substituted with the third-party `stemmer` (Porter); that substitution is to be **reverted**, and `en`-stemming parity re-verified under FR-012 / SC-006
- Hyphenation → `github.com/mlengse/hyphen`
- Search engine → `minisearch` (third-party — NOT in the fork list)
- Stop words → vendored third-party `stopwords-iso` data (`mlengse/stopwords-filter` remains rejected)

**Storage**: static assets only — serialized index shipped as a lazily-imported JS chunk; no database (FR-005/FR-021: fully offline)

**Testing**: vitest (unit: contracts/public-api.md tables, 50-word golden stem list; integration: fixture-site build asserting alias, index chunk, deep links, warnings) + browser accessibility audit (axe/Lighthouse) against built fixture

**Target Platform**: Node 18+ build environment; evergreen browsers (Chrome/Firefox/Safari/Edge); 360 px mobile viewport supported

**Project Type**: library (VitePress/Vite plugin, npm package)

**Performance Goals**: results < 1 s after query on a 500-page site (SC-003); build overhead ≤ 20% vs. plugin-disabled baseline (SC-005); index chunk fetched only on first modal open (US2 S2)

**Constraints**: zero network at build (FR-021); zero-config single registration (FR-019); no silent build failures — warn/error instead (FR-020); accessible modal, no critical a11y violations (SC-009); scoping skip-list for hyphenation (`pre`/`code`/`a`/anchors, FR-017)

**Scale/Scope**: sites ≤ 1000 pages (target 500, index ≈ 1–2 MB typical / warn at 5 MB); one npm package; ~4 capability areas (search, stem, syllabify, hyphenate); 4 user stories P1–P4

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status: N/A — no enforceable gates.** `.specify/memory/constitution.md` is an unfilled placeholder template (verified 2026-10-07); `.specify/extensions.yml` registers **no hooks** (`hooks: {}`), so no before/after plan hooks are invoked for this phase. Baseline hygiene still applied: no secrets committed, all work tree-based, tests mandatory before Done (quickstart §10). *Recommendation: fill the constitution before implementation begins; this check must be re-run if that happens.*

**Re-check after Phase 1**: unchanged — all Phase 1 artifacts (research, data-model, contracts, quickstart) satisfy the baseline; no violations to justify → Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-indonesian-search-plugin/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R10, risks
├── data-model.md        # Phase 1 — 7 entities + validation rules
├── quickstart.md        # Phase 1 — scaffold + SC validation checklist
├── contracts/
│   ├── plugin-options.md    # registration, options schema, failure behavior
│   ├── public-api.md        # stem/syllabify/hyphenateText/tokenize contracts
│   └── search-behavior.md   # index envelope, matching, UI a11y, hyphenation runtime
├── spec.md              # feature specification (pre-existing)
├── checklists/
│   └── requirements.md  # all-pass requirements checklist (pre-existing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── node/                    # Vite plugin layer (Node-only)
│   ├── index.ts             # idnPlugin() factory, option validation (FR-020)
│   ├── configResolved.ts    # config.vitepress access, hook chaining (R1, G4)
│   ├── searchIndexPlugin.ts # virtual module, dev HMR rescan, build scan (R7)
│   └── markdown.ts          # createMarkdownRenderer + include preprocessor (R2)
├── core/                    # shared pipeline (Node + browser)
│   ├── pipeline.ts          # normalize→tokenize→stopwords→redup→stem (FR-012)
│   ├── stem.ts              # sastrawijs / snowball-js adapters (FR-011)
│   ├── syllabify.ts         # Indonesian CV rules (FR-015)
│   ├── hyphenate.ts         # hyphen/id pattern engine (FR-016)
│   ├── stopwords/
│   │   ├── id.ts            # vendored list (R5)
│   │   └── en.ts
│   └── types.ts
├── client/                  # browser-only
│   ├── Search.vue           # modal UI aliased over VPNavBarSearch (R1, R9)
│   ├── hyphenationRuntime.ts# post-mount soft-hyphen insertion (FR-017)
│   └── indexLoader.ts       # lazy chunk load + schema/language guard (FR-020)
├── vue.ts                   # public entry: <IdnSearch/> for ui:'external'
└── index.ts                 # public entry: stem, syllabify, hyphenateText, tokenize

playground/                  # fixture VitePress site (quickstart §3)
├── .vitepress/config.ts
└── *.md

scripts/
└── update-stopwords.ts      # regenerate vendored lists (R5)

tests/
├── unit/                    # public-api contract tables, golden stem/syllabify lists
├── contract/                # options validation, index envelope schema
└── integration/             # fixture build: alias, index chunk, anchors, warnings

tsup.config.ts  vitest.config.ts  eslint.config.js
```

**Structure Decision**: Single-package library (Option 1 shape, adapted). `src/node` vs `src/core` vs `src/client` split mirrors the three runtimes the plugin occupies (Vite config time, shared pipeline, browser); `playground/` + `tests/integration` provide the fixture-site evidence loop required by quickstart §4–§7. No backend/frontend or mobile structure applies.

## Complexity Tracking

> No Constitution Check violations to justify (see above — constitution is an unfilled template).
