# Evidence — SC-001…SC-010 (PR description lines)

Recorded `2026-10-07` against `0.1.0`. One evidence line per success criterion,
gathered by running quickstart §4–§9 (see `audit-accessibility.md` for the §7
browser-audit limitation).

- **SC-001** — Root/derivative retrieval: `tests/unit/test_search_pipeline.test.ts`
  `it('hits >= 90% of the curated 20 root/derivative queries')` passes; full
  `npx vitest run` green (10 files / 94 tests as of Phase 10; 91 before the
  `hyphenasi` adoption added its three cases).
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
  pages → `overhead=8.9% (PASS <=20%)`, with repeat runs at 16.9% and 10.1%.
  **The bench methodology was corrected during Phase 10** (see below); the
  earlier recorded 10.0% came from a comparison that was not measuring what it
  claimed.
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
  and an `en`-language no-throw batch (FR-013). Suite was 10 files / 91 tests
  at this point; 94 after Phase 10.
- **FR-023 `sastrawijs`/`hyphen` (adopted, 2026-10-07):** both forks are now
  published to the npm registry, so the pending state recorded earlier in this
  file is resolved. `sastrawijs` → `sastrawijs-ts@^1.0.1`
  (github.com/mlengse/sastrawijs-ts, MIT) and `hyphen` → `hyphenasi@^1.15.0`
  (github.com/mlengse/hyphenasi, ISC); both repositories were renamed and the
  old URLs redirect. Adopted upstream is no longer pending for any of the three
  fork-sourced capabilities.
- **Stemming parity (`id`):** `sastrawijs-ts` reproduces `sastrawijs@1.1.0`
  byte-for-byte across all 67 `tests/fixtures/stem-golden.json` entries
  (0 diffs, 100% SC-006 both ways), so `ID_CORRECTIONS` still applies unchanged
  and search index terms are unaffected. Switching also removed the critical
  `babel-plugin-transform-class-properties` advisory chain that the upstream
  package pulled in.
- **Hyphenation accuracy (`id`):** `hyphenasi/id` scored against the 110-word
  PUEBI golden list yields **11 invalid + 9 missed** break boundaries versus
  upstream `hyphen/id`'s **18 invalid + 44 missed**. The fork is the more
  accurate engine, not a regression: it repairs `jal-an`→`ja-lan`,
  `eko-no-mi`→`e-ko-no-mi`, `ber-jal-an`→`ber-ja-lan`, and its leading
  single-letter breaks (`a-ba-di`, `i-ngin`) are valid because Indonesian
  syllables may open with a vowel. Exactly one word regresses (`belajar` →
  `bel|a|jar` where `be|la|jar` is correct).
- **Node engine floor raised to `>=20` (T052):** `sastrawijs-ts` declares
  `engines.node: ">=20"`. Its shipped bundle was verified ES2020-only (no
  `??`/`.at()`/`structuredClone`/`Object.groupBy`/`findLast`), so the floor
  reflects its build toolchain, not a runtime need; Node 18 has been EOL since
  2025-04-30. `package.json` `engines` and `quickstart.md` §1 now state Node
  20+, superseding the plan's original "Node 18+" line.

## Commands (reference)

```powershell
npm run typecheck            # exit 0
npm run lint                 # exit 0 (eslint .)
npm test                     # 10 files / 94 tests pass
npm run bench                # SC-005 overhead <=20% PASS, SC-010 warning emitted
npm run verify:external      # package self-reference build (T036)
```

## Phase 10 — Convergence (T049, re-verified 2026-10-07)

- **CRITICAL / gate suite restored (T049):** the tree was unbuildable —
  `node_modules/@mlengse/` was absent, `npm ls` reported
  `UNMET DEPENDENCY @mlengse/snowball-js@^1.0.1` plus an extraneous
  `stemmer@2.0.1`, `tsc --noEmit` failed `TS2307` at `src/core/stem.ts:1`,
  and `vitest run` aborted in `tests/global-setup.ts` with
  `ERR_MODULE_NOT_FOUND` (0 tests collected). `npm ci` reconciled the tree;
  the stray `stemmer` is gone and `npm ls --depth=0` is clean.
- **Root cause of 5 integration failures found and fixed:** T025/T031 were
  phantom completions. `.gitignore` matched the bare `.vitepress/` pattern,
  which ignored `playground/.vitepress/` **including its `theme/` source**, so
  `AuthorUtils.vue` / `Layout.vue` / `index.ts` were never committed
  (`git log -S AuthorUtils` shows the symbol only in test and config diffs).
  With the theme absent, 4 `test_author_utility` assertions and 1
  `test_hyphenation_build` assertion failed on missing
  `data-idn-version` / `idn-author-utils` markup. `.gitignore` now ignores only
  `.vitepress/cache/` and `.vitepress/dist/`, and the three fixture-theme files
  are tracked. Verified: `git check-ignore` leaves the theme untracked-but-
  includable while still ignoring `dist/` and `cache/`.
- **Silent SSR degradation avoided:** the first theme attempt used
  `Layout: () => import('./Layout.vue')`, which VitePress does not await during
  SSR — the page rendered as `<div id="app">[object Promise]</div>` (1868-byte
  HTML) while the build still exited 0. A static import restores full SSR
  (8963-byte HTML with all utilities baked in). This is a silent-failure mode
  of exactly the kind SC-010 forbids.
- **Fixture data corrected:** `tokenize` demo input was `ekonomi` (stems to
  `ekonomi`), but the contract expectation in
  `tests/integration/test_author_utility.test.ts` is `ekonomis`. Both stem
  unchanged, so the input is now `ekonomis` to match the asserted output.
- **Gate results after the fix (all from a clean `npm ci`):**
- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm test` → **10 files / 94 tests passed** (91 pre-existing + 3 added for
  the `hyphenasi` adoption)
- `npm run build` → exit 0; dist imports `hyphenasi/id` / `hyphenasi/en`, and
  `scripts/copy-assets.mjs` now asserts no bare `hyphen/` import survives
- `npm run verify:external` → `IdnSearch compiled from real package entry
  into 1 asset(s)`; `ui:external` package self-reference build OK (T036)
- `npm run bench` → `pages=500 baseline=30.6s with-plugin=33.3s
    overhead=8.9% (PASS <=20%, SC-005; median of 3 interleaved samples, same
    theme both arms)`; oversized-index warning emitted (FR-020)
- **SC-005 bench methodology fixed.** The Phase 10 dependency swap made
  `npm run bench` intermittently report 46.4% and 29.7% (FAIL). Two defects
  in `scripts/bench-build.mjs` were the cause, neither of them a real
  performance regression:
  1. *Asymmetric arms.* The `without` variant overwrote the fixture theme with
     a plain `DefaultTheme`, but the `with` variant kept the custom theme that
     mounts `<AuthorUtils/>`. The two arms therefore compiled **different
     sites**, charging the plugin for fixture-only compile work (AuthorUtils,
     the layout wrapper, its slot plumbing). Both arms now use the plain theme;
     the WITH arm still exercises the `VPNavBarSearch.vue` alias, so Search.vue
     is genuinely compiled and the sole difference between arms is the plugin.
  2. *Best-of-2 on a noisy arm.* The baseline build is the noisy one (observed
     21–32 s across runs) while the with-plugin build was stable (30–33 s).
     Best-of-N takes the minimum, which systematically understates a noisy
     baseline and inflates the ratio. Replaced with the **median of 3
     interleaved samples** (without → with → without → with …) so a lull in
     machine load cannot land entirely inside one arm's window.
  After the fix, three consecutive runs pass at 8.9% / 16.9% / 10.1%. Note the
  honest reading: the margin under the 20% bar is real but not generous, and
  on a heavily loaded machine a single median-of-3 can still land in the high
  teens.
- Plain Node ESM resolution confirmed for all three runtime deps:
  `hyphenasi/id`, `sastrawijs-ts`, `@mlengse/snowball-js/english`

## Known gaps

- §4 dev-mode interaction (Ctrl+K, `/`, live HMR) and the §7 rendered-contrast
  check require a browser; recorded as code-level evidence with an audit trail
  (`audit-accessibility.md`).