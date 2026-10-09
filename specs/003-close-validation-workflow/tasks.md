# Tasks: Close Validation Workflow Completion Gap

**Input**: Design documents from `/specs/003-close-validation-workflow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks included for US1 (triage command) — written before implementation per TDD.

**Organization**: Tasks grouped by user story for independent implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing state before changes

- [X] T001 Verify existing test suite passes: `npm test` — all green before any changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core logic that MUST be complete before user story implementation

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Add `NON_FAILURE_CLASSES` constant next to `FAILURE_CLASSES` in `tools/kbbi/compare.ts` — a readonly set containing `'reference-missing'`, `'data-divergence'`, `'root-word-self'`. Export it for use by stages.ts and cli.ts. (Deviation: placed in `compare.ts` rather than `types.ts` so it sits beside `FAILURE_CLASSES` and `countsFailure`, which it mirrors.)
- [X] T003 Add `triageNonFailureFindings` function to `tools/kbbi/stages.ts` — accepts `{ capability, class, words?, reason }`, loads defect store, filters for `status: 'open'` + `stage: null` + matching capability + matching class, validates reason is non-empty (throw StageError if empty), sets status to `'dismissed'` with `withdrawnReason` and `triageNote: 'Ditutup lewat triase non-kegagalan: {reason}'`, writes store. Returns count of dismissed findings.

**Checkpoint**: Foundation ready — triage logic exists and is testable

---

## Phase 3: User Story 1 — Tutup temuan non-kegagalan tanpa tahap (Priority: P1) — MVP

**Goal**: Every open finding has a valid CLI path to change its status, including non-failure classes

**Independent Test**: Run `node scripts/kbbi-validate.mjs triage --capability syllable --class reference-missing --reason "test"` and verify findings change to `dismissed`

### Tests for User Story 1

> **NOTE**: Write these tests FIRST, ensure they FAIL before implementation

- [X] T004 [US1] Add unit tests for `triageNonFailureFindings` in `tests/unit/test_kbbi_stages.test.ts` — cases: (a) dismisses matching non-failure findings, (b) rejects empty reason with StageError, (c) ignores findings with non-null stage, (d) ignores findings with wrong capability, (e) respects `--word` filter when provided
- [X] T005 [US1] Add CLI snapshot test for `triage` command in `tests/unit/test_kbbi_cli_snapshot.test.ts` — verify USAGE string includes triage command

### Implementation for User Story 1

- [X] T006 [US1] Add `commandTriage` function to `tools/kbbi/cli.ts` — parses `--capability`, `--class`, `--word`, `--reason` flags; validates class is in `NON_FAILURE_CLASSES`; calls `triageNonFailureFindings`; logs count of dismissed findings
- [X] T007 [US1] Add `triage` case to `runCli` switch in `tools/kbbi/cli.ts` — route to `commandTriage`
- [X] T008 [US1] Update USAGE string in `tools/kbbi/cli.ts` — add `kbbi-validate triage --capability stem|syllable --class <kelas> [--word "a,b"] --reason "alasan"` line
- [X] T009 [US1] Verify `scripts/kbbi-validate.mjs` passes through the `triage` command — update if the wrapper needs explicit command routing

**Checkpoint**: US1 complete — `triage` command works end-to-end, all tests pass

---

## Phase 4: User Story 2 — Definisikan kriteria selesai spec 002 (Priority: P2)

**Goal**: Spec 002 has an explicit, verifiable completion criterion

**Independent Test**: Read `specs/002-validasi-kbbi-berbertahap/spec.md` and verify a "Completion Criterion" section exists with measurable conditions

### Implementation for User Story 2

- [X] T010 [US2] Add "Completion Criterion" section to `specs/002-validasi-kbbi-berbertahap/spec.md` — state: spec 002 is "selesai" when (a) every finding in `open.jsonl` has status `fixed` or `dismissed` with recorded reason, and (b) final accuracy is recorded as the last measured ceiling. Accuracy SC-001/SC-002 are pursuit targets, not blocking gates.
- [X] T011 [US2] Update `specs/002-validasi-kbbi-berbertahap/contracts/stage-workflow.md` — add note that non-failure findings are closed via `triage` command, not via stage workflow; reference `contracts/triage-command.md` from spec 003

**Checkpoint**: US2 complete — completion criterion is written and verifiable

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [X] T012 Run full validation: `npm run lint && npm run typecheck && npm test` — all must pass
- [X] T013 Update `specs/003-close-validation-workflow/quickstart.md` — add triage command examples if not already present from Phase 1
- [X] T014 Update `specs/002-validasi-kbbi-berbertahap/quickstart.md` — add reference to completion criterion and triage command for closing non-failure findings

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — triage command needs `triageNonFailureFindings`
- **US2 (Phase 4)**: Depends on US1 — completion criterion references triage command; can be done in parallel with US1 by different agent but jev_decide found file conflict risk
- **Polish (Phase 5)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependencies on US2
- **US2 (P2)**: Can start after Foundational — logically after US1 (references triage command) but no hard code dependency

### Within Each User Story

- Tests (T004, T005) written and FAIL before implementation (T006-T009)
- Core logic (T002, T003) before CLI (T006-T008)
- CLI before integration (T009)

### Parallel Opportunities

- No parallel tasks identified — jev_decide rejected all candidate pairs (probability < 0.5 for each)
- All tasks are sequential due to file dependencies and shared state

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test triage command independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 → Test independently → Deploy/Demo (MVP!)
3. Add US2 → Test independently → Deploy/Demo
4. Each story adds value without breaking previous stories

---

## Notes

- No [P] tasks — all sequential per jev_decide analysis
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently

---

## Phase 6: Convergence

**Purpose**: Close the gap found by `/speckit.converge` (2026-10-10) — US1/AC4 names `status` as its observable, but `commandStatus` reports only last-measured accuracy and stage ids, never open findings or their closure-path coverage, so AC4 and SC-001 cannot be demonstrated from the CLI.

- [X] T015 [US1] Add a test in `tests/unit/test_kbbi_cli_snapshot.test.ts` that asserts `status` reports the count of `open` findings and a closure-path breakdown (findings with a valid CLI path vs. findings without one), using a seeded defect store — written first and FAILING before T016. (Observable: US1 Acceptance Scenario 4 — "menjalankan `status` → tidak ada temuan `open` tanpa jalur penutup yang valid".)
- [X] T016 [US1] Extend `commandStatus` in `tools/kbbi/cli.ts` to load the open defect store (`loadDefectStore`) and report, per capability, the open-finding count and closure-path coverage: a finding has a path when its class is non-failure (`NON_FAILURE_CLASSES` → `triage`) or it is a failure class that still reproduces (`isStillReproducing` → stage workflow); report the count lacking a path so SC-001 is verifiable. Keep it read-only and offline (Constitution II/III).
  - Result: `node scripts/kbbi-validate.mjs status` on the live store prints `temuan : 31861 terbuka, 31659 punya jalur penutup, 202 tanpa jalur penutup`.
- [X] T017 [US1] Provide a closure path for open failure-class findings that no longer reproduce, so FR-001/SC-001 reach 100%. **Evidence (2026-10-10)**: the live `.kbbi/defects/open.jsonl` holds 31,861 open findings, 202 of which have no executable path — they are failure-class findings with `stage: null` that no longer reproduce, so `planStage` excludes them, `commandTriage` rejects them (non-failure only), and `dismissStageFindings` rejects them (stage membership required). **Decision needed**: the mechanism (recommended: reconcile such findings to `fixed` when `measure` confirms they no longer mismatch, mirroring the stage `promote` outcome; alternative: allow `triage`/`dismiss` on any open finding with `stage: null` and a recorded reason). Add a regression test and assert `status` reaches `0 tanpa jalur penutup`. (jev_decide P=0.73 with the measured count; jev_choose picks the reconcile-to-`fixed` mechanism at P=0.87.)
  - Result: `reconcileNonReproducing` added to `tools/kbbi/stages.ts` (reuses `isStillReproducing`, injectable predicate), wired into `commandMeasure` after `mergeDefects`; 4 unit tests added. Read-only check against the live store: `reconcileNonReproducing` maps exactly 202 findings to `fixed` — the same 202 `status` reported as "tanpa jalur penutup". After the next `measure` run, `status` reaches `0 tanpa jalur penutup`.

---

## Phase 7: Convergence

**Purpose**: Close the gaps found by `/speckit.converge` (2026-10-10, run after T017). T017 gave stale failure findings a `measure`-based closure path, but the T016 observability and the triage contract were not reconciled with it.

- [X] T018 (CRITICAL) Align the triage rejection messages so code and contract agree: `contracts/triage-command.md` (Penolakan table) names `kelas {class} bukan kelas non-kegagalan` and `alasan wajib diisi: penolakan tanpa alasan melanggar FR-022`, but `commandTriage` in `tools/kbbi/cli.ts` emits `--class harus salah satu dari reference-missing, data-divergence, root-word-self, bukan "…".` and, for a missing flag, `--reason wajib diisi.`. Fix whichever side is wrong in one change and add a unit test asserting the invalid-`--class` rejection message. per Prinsip I (contradicts)
  - Result: code changed to emit the contract's exact wording. `commandTriage` now throws `kelas {class} bukan kelas non-kegagalan` and, for a missing or blank `--reason`, `alasan wajib diisi: penolakan tanpa alasan melanggar FR-022`; `triageNonFailureFindings` messages aligned to `contracts/triage-command.md` (trailing periods dropped). 2 unit tests added in `tests/unit/test_kbbi_cli_snapshot.test.ts`. Live runs confirm all three Penolakan rows verbatim.
- [X] T019 Reconcile the `status` closure-path classification with T017: `hasClosurePath` (`tools/kbbi/cli.ts`) returns `isStillReproducing(defect)` for a stage-null failure-class finding, so one that no longer reproduces is counted as `tanpa jalur penutup` even though `measure` → `reconcileNonReproducing` now closes it. Count that measure-based path (making `status` reach `0 tanpa jalur penutup` by construction) or relabel the metric as "menunggu rekonsiliasi", and refresh the stale doc comment (`cli.ts` ~L424-426) plus the T015 test in `tests/unit/test_kbbi_cli_snapshot.test.ts`, whose "the one case with no path" premise predates T017. per FR-001/SC-001 (partial)
  - Result: `hasClosurePath` now counts the measure-based path for stage-null failure-class findings — every open finding has a valid closure path, so `status` reports `0 tanpa jalur penutup` by construction. Stale doc comment and the T015 test refreshed; `isStillReproducing` (no longer referenced) dropped from `cli.ts` imports and the test's stages mock. Live `status` → `31659 terbuka, 31659 punya jalur penutup, 0 tanpa jalur penutup`. Validation: lint + typecheck clean, 198 tests pass.

