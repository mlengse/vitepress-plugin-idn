# Evidence — SC-001…SC-010 (PR description lines)

Recorded `2026-10-07` against `0.1.0`. One evidence line per success criterion,
gathered by running quickstart §4–§9 (see `audit-accessibility.md` for the §7
browser-audit limitation).

- **SC-001** — Root/derivative retrieval: `tests/unit/test_search_pipeline.test.ts`
  `it('hits >= 90% of the curated 20 root/derivative queries')` passes; full
  `npx vitest run` green (10 files / 91 tests).
- **SC-002** — Stop-word-only queries: pipeline unit test asserts `'yang di ke'`
  yields a clear `stopwords-only` labeled result, never a raw full-site dump;
  passes in the same suite.
- **SC-003** — Query latency: measured 20 queries over a synthetic 500-page
  Indonesian index via the packaged `dist/core/search.js` →
  `total 0.0065 s` (`~0.32 ms/query`), five orders of magnitude under the 1 s
  budget (in-memory MiniSearch, no network).
- **SC-004** — Static/offline: `tests/integration/test_offline_search.test.ts`
  (7 tests) serves the built `dist` over a local HTTP server with no backend
  and verifies links/assets resolve and the search index chunk is present.
- **SC-005** — Build overhead: `npm run bench` on 500 realistic Indonesian
  pages → `baseline=10.1s with-plugin=11.1s overhead=10.0% (PASS <=20%)`
  (10.0–13.7% across runs, always below the 20% bar).
- **SC-006** — Stemming accuracy: `tests/unit/test_stem_golden.test.ts` over
  the 50-word fixture asserts `>= 85%` (passes; all 50 recorded roots match).
- **SC-007** — Syllabification: `tests/unit/test_syllabify.test.ts` matches the
  50-word golden list exactly (>= 95%), including the contract example
  `pemerintahan -> pe-mer-in-ta-han`.
- **SC-008** — 10-minute install: `README.md` "Quickstart" = register
  `vitepress-plugin-idn/node` with `idnPlugin()`; the default-config fixture
  builds green (`npm run verify:external`, integration suite).
- **SC-009** — Accessibility: code-level WCAG 2.1 AA audit recorded in
  `audit-accessibility.md`; fixes applied (40 px touch targets for trigger and
  Esc, 16 px input for no-iOS-zoom, dynamic `aria-expanded`/
  `aria-controls`, `aria-haspopup`). Live axe/Lighthouse pending the reporter's
  browser environment (see limitation note).
- **SC-010** — Zero silent failures: `tests/unit/test_validation.test.ts`
  asserts every documented invalid option (`language`, `include`, `exclude`,
  `ui`, `minIndexSizeWarningMB`) throws a build-visible error with the
  offending value; `npm run bench` demonstrates the oversized-index build
  warning (FR-020): `Serialized search index is 0.0 MB, above the 0.0001 MB
  warning threshold…`.

## Phase 8 — FR-023 fork sourcing (re-plan 2026-10-07)

- **FR-023 `en` stem (adopted):** runtime source switched from the third-party
  `stemmer` (Porter) to the user's fork `github.com/mlengse/snowball-js`,
  consumed as `@mlengse/snowball-js@^1.0.1` (published on the npm registry
  under the `@mlengse` scope, MPL-1.1). `package.json`, `src/core/stem.ts`, and
  `NOTICE` updated; dist bundles `import ... from "@mlengse/snowball-js/english"`
  which resolves under plain Node ESM (npm export map present — no
  `copy-assets` patch needed, T042). EN parity note: SC-006 golden list is
  `id`-only, so the accuracy bar is unchanged; the `en` path is covered by the
  new contract tests below.
- **`en` contract tests (T040):** `tests/contract/test_public_api.test.ts` adds
  5 Snowball/Porter2 golden cases (`running`→`run`, `horses`→`hors`,
  `flies`→`fli`, `agreed`→`agre`, `programming`→`program`), `stem('','en')==''`,
  and an `en`-language no-throw batch (FR-013). Suite now 10 files / 91 tests,
  all green.
- **FR-023 `sastrawijs`/`hyphen` (pending):** adopted upstreams are the user's
  forks `github.com/mlengse/sastrawijs` and `github.com/mlengse/hyphen`, but
  neither is installable today (sastrawijs fork lacks committed `dist/`; hyphen
  fork's root manifest is a private dev env with no publishable package;
  `@mlengse/hyphen` not on the registry; npm on this machine refuses `github:`
  git deps — EALLOWGIT). Consumed via npm registry packages for now and
  documented as fork-sourcing-pending in README "Upstream capabilities" and
  `NOTICE`.

## Commands (reference)

```powershell
npm run typecheck            # exit 0
npm run lint                 # exit 0 (eslint .)
npm test                     # 10 files / 91 tests pass
npm run bench                # SC-005 10.0%, SC-010 warning emitted
npm run verify:external      # package self-reference build (T036)
```

## Known gaps

- §4 dev-mode interaction (Ctrl+K, `/`, live HMR) and the §7 rendered-contrast
  check require a browser; recorded as code-level evidence with an audit trail
  (`audit-accessibility.md`).