# vitepress-plugin-idn Constitution

## Core Principles

### I. Spec-Driven & Contract-First (NON-NEGOTIABLE)

Every capability MUST originate as an artifact under `specs/<NNN-feature>/` before
implementation begins: `spec.md`, `research.md`, `data-model.md`, `contracts/*.md`,
`plan.md`, `tasks.md`. The documents in `specs/<NNN-feature>/contracts/` are the
normative source of truth for the public API, the plugin option schema, the index
envelope, and search/UI behavior.

- A function that appears in `contracts/public-api.md` with a contract example
  table MUST have at least one test asserting each example. A contract example
  that no test covers is a defect, not a documentation aspiration.
- Implementation MUST NOT silently diverge from a contract. Any behavior change
  updates the contract in the same commit as the code.
- Code MUST NOT add behavior that no spec artifact authorizes. New capability
  requires a new or amended spec first.
- `.specify/` and `specs/` artifacts MUST NOT be edited by implementation
  tasks to retro-fit already-written code; a spec change is a design change.

**Rationale:** this package exposes a public API consumed by third-party site
authors. The contract tables are the promise; undocumented drift is the single
most expensive failure mode for a published library.

### II. Offline & Static-Only Operation (NON-NEGOTIABLE)

The plugin MUST operate as a pure build-time + static-asset system.

- No network access at build time beyond dependency installation.
- No search backend, hosted index, database, or telemetry service at runtime.
- The search index ships as a serialized static asset inside the built bundle and
  MUST be fetched from the same origin only.
- Search is progressive enhancement: a site MUST build and browse normally with
  JavaScript execution disabled, and the plugin MUST NOT become a build breaker.
- No blocking network call on the critical path. The index chunk loads lazily on
  first interaction and MUST NOT block typing.

**Rationale:** VitePress sites are static by contract. Any server-side or
network dependency silently excludes the large majority of hosting setups and
breaks the single-registration drop-in expectation (FR-005, FR-019, FR-021).

### III. Runtime Layer Separation (NON-NEGOTIABLE)

The three runtimes the plugin occupies MUST stay separated, mirroring
`src/node` (Vite config time), `src/core` (shared pipeline), and `src/client`
(browser).

- `src/core` MUST NOT import `node:*` builtins, Vite, or VitePress modules. It
  runs in both Node and the browser.
- `src/client` MUST NOT import from `src/node`. Browser code MUST reach shared
  behavior only through `src/core`.
- The root entry (`vitepress-plugin-idn`) MUST remain client-safe: it MUST NOT
  pull in the Vite plugin. The Vite plugin is reachable only via
  `vitepress-plugin-idn/node`; the UI component only via
  `vitepress-plugin-idn/vue`.
- Site authors MUST NOT need `internal/` or deep imports to use a documented
  utility.
- Cross-layer communication that the browser needs (virtual module ids, shared
  constants) MUST be declared in `src/core/constants.ts`, never duplicated.

**Rationale:** violating this produces a bundle that builds in Node and fails in
the browser — a class of bug that typecheck and lint both miss, because the error
only appears at Vite client-bundle time (see `audit-accessibility.md` and the
`parseEnvelopeFromChunk` extraction workaround in the integration tests).

### IV. Deterministic Language Pipeline

One pipeline, both sides. Term production is a single function shared by index
time and query time: normalize → tokenize → stop words → reduplication reduction
→ stem.

- Index-time and query-time term production MUST be the same code path. Divergent
  copies are forbidden.
- The public utilities (`stem`, `syllabify`, `hyphenateText`, `tokenize`) MUST be
  pure, synchronous, side-effect free, and MUST NOT throw for any input —
  including wrong types, `null`, `undefined`, and empty strings.
- Un-normalizable input MUST return the input unchanged or a documented
  deterministic fallback. Silent coercion to a wrong-but-plausible value is a
  bug.
- `hyphenateText` MUST be idempotent and MUST NOT alter URLs, digits, code-like
  tokens, or whitespace/punctuation runs.
- Language is explicit (`'id'` default, `'en'` secondary) and MUST be threaded
  through every stage; a stage MUST NOT assume Indonesian.
- Stop-word lists are vendored and regenerable via `scripts/update-stopwords.ts`.

**Rationale:** determinism is what makes the golden fixtures, the contract
tables, and the search relevance guarantees checkable. A pipeline that throws or
diverges turns every quality criterion into an untestable claim (FR-011–FR-018).

### V. Test-Gated Quality (NON-NEGOTIABLE)

No change is Done until it is verified by an executable check. `npm test`
(vitest), `npm run typecheck`, and `npm run lint` MUST all pass at the commit that
lands the change.

- Three test tiers are mandatory and non-substitutable:
  - `tests/unit/` — pure function behavior and golden fixtures
    (`tests/fixtures/stem-golden.json`, `syllabify-golden.json`).
  - `tests/contract/` — public API surface, option validation, index envelope
    schema.
  - `tests/integration/` — a real fixture-site build (`playground/`) asserting
    the nav alias, the index chunk, deep links, and build-time warnings.
- Golden fixtures MUST be updated only as an explicit, reviewed act with a stated
  reason — never as a side effect of a failing run.
- `tsc --noEmit` does NOT check `.vue` files. A change to a Vue SFC is verified
  by eslint (`vue-eslint-parser`) AND by an integration build.
- VitePress-version-specific behavior MUST be pinned with a comment or test, not
  left as folklore.

**Rationale:** integration tests that build the fixture site are the only layer
that catches virtual-module resolution, alias-target, and SFC bundling failures.
Without them, the package ships broken.

## Constraints: Performance & Scale Budgets

These are pass/fail gates on the `playground/` fixture, not aspirations.

- Query results MUST render in under 1 second on a site of 500 pages.
- Build time overhead MUST be no more than 20% versus the same site without the
  plugin, at 500 pages.
- The serialized index MUST warn at build time above
  `minIndexSizeWarningMB` (default 5 MB) rather than emit a silently broken
  search.
- Target scale is sites up to 1000 pages; beyond that, warn clearly.

## Constraints: Accessibility (WCAG 2.1 AA)

The search UI is a first-class reader surface, not a build artifact.

- Keyboard accessibility is mandatory: open, navigate, activate, and close MUST
  be fully operable from the keyboard, with focus trapped while open and
  restored to the trigger on close.
- The dialog MUST expose correct ARIA semantics (`role="dialog"`,
  `role="combobox"`, `role="listbox"`, `aria-activedescendant`, `aria-busy`).
- Interactive touch targets MUST be at least 40 px.
- Colors MUST come from VitePress design tokens with `var(--vp-.)` fallbacks so
  the default theme's AA-compliant palette is preserved.
- Highlighted snippets MUST escape `&`, `<`, and `>` before markup insertion.
  Raw content injection is forbidden.
- A code-level WCAG review is recorded per release in
  `specs/<NNN-feature>/audit-accessibility.md`. Rendered contrast and keyboard
  behavior require a real browser run; the code review does not substitute for
  it and MUST NOT be claimed to have done so.

## Constraints: Licensing, Provenance & Attribution

- Adopted third-party or forked capability MUST have a license permitting
  redistribution. MIT, ISC, Apache-2.0, BSD and MPL-1.1 are acceptable; a
  non-commercial (NC) or share-alike-only term requires an explicit written
  decision recorded in `NOTICE` before adoption.
- Every adopted component MUST be attributed in `README.md` (upstream capability
  table) and in `NOTICE`, including the exact fork or package consumed.
- Capabilities mapped to a fork MUST be runtime-sourced from that fork, and the
  documentation MUST cite fork provenance rather than implying canonical upstream
  is the adopted source.
- Dropped or replaced components MUST stay in the README table with the reason,
  so the decision is auditable.
- Where a dataset carries a non-commercial term (e.g. kateglo.com), the flag MUST
  be surfaced and a drop-in replacement identified.

## Development Workflow & Quality Gates

Order of work, enforced per feature:

1. **Specify** — `spec.md` with user stories, FR-xxx, SC-xxx, and out-of-scope.
2. **Plan** — research decisions (R-n), data model, contracts, project structure.
   The plan MUST record a Constitution Check.
3. **Tasks** — dependency-ordered `tasks.md`; every task maps to at least one FR
   or SC.
4. **Implement** — one task at a time, smallest diff that satisfies its
   acceptance criteria.
5. **Verify** — tests, typecheck, lint, then the success criteria from
   `specs/<NNN-feature>/quickstart.md`.

Quality gates:

- A task is not Done until its verification steps are executed and recorded.
- Manual browser verification steps stay manual until an automated check exists;
  they MUST be reported as unverified rather than assumed.
- The requirements checklist in `specs/<NNN-feature>/checklists/requirements.md`
  MUST be all-pass before a feature is declared complete.
- `NOTES.md` carries cross-session handoff state. It is a working note, not
  governance, and MUST NOT be treated as a substitute for the constitution.

## Governance

This constitution supersedes conventions stated in `README.md`, `NOTES.md`, plan
prose, and individual task notes. Where they conflict, the constitution wins and
the conflicting document MUST be corrected in the same change.

**Amendment procedure**

1. Propose the change with its rationale and its version-bump classification.
2. Classify the bump: MAJOR for a principle removal or redefinition that breaks
   existing implementations; MINOR for a new principle or a materially expanded
   constraint; PATCH for clarification, wording, or typo fixes.
3. Amend this file only. Template source files under `.specify/templates/` and
   other versioned template layers MUST NOT be written back to.
4. Record the impact in the Sync Impact Report at the top of the file, then
   remove that report before committing.
5. Any feature whose implementation would violate an active principle MUST either
   be brought into compliance or MUST have the principle amended first. The
   constitution is not retrofitted to excuse shipped code.

**Versioning policy**

Semantic versioning on this document, independent of the npm package version.
`CONSTITUTION_VERSION` increments by one segment per amendment using the MAJOR /
MINOR / PATCH rules above. Ambiguous bumps MUST be argued explicitly in the Sync
Impact Report before finalizing.

**Compliance review**

- Every plan MUST include a Constitution Check section stating pass/fail per
  principle, before research begins and again after design.
- Any deviation MUST be recorded in the plan's Complexity Tracking table with the
  principle it touches and the justification for accepting it.
- `/speckit-converge` and code review MUST treat an unconstitutioned or
  contract-drifting change as a blocking finding.
- Compliance is enforced by tests, typecheck, and lint wherever mechanizable.
  Where it is not, it is a review obligation and MUST be stated as such rather
  than assumed satisfied.

**Version**: 1.0.1 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
