# Quickstart & Validation Plan

**Spec**: SC-001–SC-010 | Validates research R1–R10 and all contracts.

## 1. Prerequisites

- Node 20+ / npm 10+ — the adopted Indonesian stemmer `sastrawijs-ts`
  (github.com/mlengse/sastrawijs-ts) declares `engines.node: ">=20"`, so the
  package floor moved from the plan's original Node 18+ to Node 20+. Node 18 is
  EOL (2025-04-30). The fork's shipped bundle is ES2020-only, so this reflects
  its build toolchain rather than a runtime limitation (T052).
- Repo: `C:\Users\anjan\dev\vitepress-plugin-idn` (greenfield, branch `master`)

## 2. Scaffold (one-time)

```powershell
npm create vite@latest . -- --template vanilla-ts   # if scaffolding over the empty repo
npm i -D vitest tsup @types/node eslint typescript
npm i minisearch @mlengse/snowball-js sastrawijs-ts hyphenasi   # runtime deps (FR-023) — all three language engines are registry-published from the user's mlengse forks
npm i -D vitepress vue                                # fixture site + peer verification
```

## 3. Register the plugin (FR-019)

```ts
// playground/.vitepress/config.ts
import { defineConfig } from 'vitepress'
import { idnPlugin } from '../../src/node'

export default defineConfig({
  title: 'IdnTest', lang: 'en',
  vite: { plugins: [idnPlugin()] }        // zero-config, Indonesian default
})
```

Fixture content: ≥ 6 pages, one `search: false` page, one `<!--@include:-->` directive, Indonesian prose (`berlari`, `pemerintahan`, `buku-buku`), one long paragraph for hyphenation.

## 4. Dev validation (FR-006, FR-009)

```powershell
npm run playground:dev
```

1. Nav bar shows the search button (R1 alias worked).
2. Type `berlari` → results surface sections containing `berlari`-derived terms (FR-002).
3. Edit a page, save → HMR rescans; new term finds without restart (FR-006).
4. Search `yang di ke` → "all stop words" message, **not** a raw dump (SC-002).
5. `search: false` page never appears in results (FR-007).
6. Hotkeys `Ctrl+K`, `/`; `Esc`; arrows + `Enter` (contracts/search-behavior.md).

## 5. Build validation (FR-005, FR-006, SC-004, SC-005)

```powershell
npm run playground:build     # record duration vs. baseline build (plugin disabled) → SC-005 ≤ 20%
npm run playground:preview
```

1. In devtools → Network: all search assets are same-origin; **zero external requests** while searching (SC-004, FR-021).
2. Result links deep-link to correct `#anchors` (R2).
3. Disable network (DevTools offline) → search still returns results (US2, FR-005).
4. Fixture includes a > 5 MB-index scenario OR set `minIndexSizeWarningMB: 0.0001` → build **warns** (FR-020).

## 6. Public API validation (FR-011, FR-013–FR-015, SC-006, SC-007)

```powershell
npx vitest run
```

- Unit tests assert the contract tables in `contracts/public-api.md` verbatim:
  `berlari→lari`, `memadamkan→padam`, `pemerintahan→perintah`, `menyukai→suka`,
  `pemerintahan→pe-mer-in-ta-han`, unknown/`''` pass-through, no-throw fuzz batch.
- 50-word stem correctness list (SC-006 ≥ 85%) checked in `tests/fixtures/stem-golden.json`.
- Syllabify list (SC-007) exact-match; JSON export path documented (FR-014).

## 7. Accessibility & mobile (SC-008, SC-009, FR-022)

```powershell
npm run playground:preview
# run Lighthouse/axe audit against the open modal
```

- Target: **zero** critical/serious violations (contrast, names, roles, keyboard).
- 360 × 740 viewport: modal usable, touch targets ≥ 40 px.

## 8. Utility exposure check (FR-014)

Confirm `import { stem, syllabify } from 'vitepress-plugin-idn'` works from a `.vitepress/theme` component (built bundle, no deep imports).

## 9. Docs / evidence (FR-023)

README section "Upstream capabilities": for each of sastrawijs, snowball-js, hyphen, stopwords-iso, vitepress-plugin-pagefind, lunr.js — one line on adopted vs. replaced vs. dropped, plus the sastrawijs license note (R4 risk). Attribution must cite the `mlengse/*` forks as the adopted sources (FR-023 fork sourcing).

## 10. Definition of done

All §4–§9 checks pass; `vitest`, `tsc --noEmit`, `eslint` green; every SC has an observed evidence line in the PR description.
