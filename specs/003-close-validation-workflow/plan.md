# Implementation Plan: Close Validation Workflow Completion Gap

**Branch**: `003-close-validation-workflow` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-close-validation-workflow/spec.md`

## Summary

Menutup lubang workflow spec 002: (A) beri temuan non-kegagalan (`reference-missing`, `data-divergence`, `root-word-self`) jalur penutup CLI yang tidak mensyaratkan keanggotaan tahap, dan (B) definisikan kriteria selesai spec 002 secara eksplisit. Keduanya sekuensial — A dulu, B setelah.

## Technical Context

**Language/Version**: TypeScript (Node.js ≥20, sama dengan repo)

**Primary Dependencies**: Node.js `fs/promises`, `tools/kbbi/` existing modules (stages.ts, compare.ts, cli.ts, types.ts)

**Storage**: `.kbbi/defects/open.jsonl` (defect store), `.kbbi/stages/*.json` (stage files)

**Testing**: vitest (test suite existing `tests/unit/test_kbbi_*.test.ts`)

**Target Platform**: Node.js CLI (`node scripts/kbbi-validate.mjs`)

**Project Type**: Internal development tooling (bukan runtime plugin)

**Performance Goals**: N/A — tooling internal, bukan hot path

**Constraints**: Toolkitting KBBI harus tetap di luar jalur paket yang dipublikasikan (FR-017/SC-008); tidak menambah dependensi runtime

**Scale/Scope**: 5.932 temuan `reference-missing`, 26.463 temuan syllable, 31.881 total temuan open

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pass | Justification |
|-----------|------|---------------|
| I. Spec-Driven & Contract-First | PASS | Feature ini origin sebagai spec (003-close-validation-workflow). Perubahan pada spec 002 (kriteria selesai) dilakukan melalui amendmen spec, bukan edit langsung. |
| II. Offline & Static-Only | PASS | Tidak menyentuh runtime plugin. Perkakas KBBI tetap dev-time only. |
| III. Runtime Layer Separation | PASS | Tidak menyentuh `src/core`, `src/client`, atau `src/node`. Perubahan hanya di `tools/kbbi/` dan `specs/002`. |
| IV. Deterministic Language Pipeline | PASS | Tidak mengubah pipeline stemming/syllabification. |
| V. Test-Gated Quality | PASS | Perubahan pada `tools/kbbi/` diuji via `tests/unit/test_kbbi_*.test.ts` yang existing. |

**Status: LULUS.** Tidak ada pelanggaran yang perlu dibenarkan.

## Project Structure

### Documentation (this feature)

```text
specs/003-close-validation-workflow/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── defect-taxonomy.md  # Updated taxonomy (if needed)
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
tools/kbbi/
├── cli.ts               # commandDismiss — extend for non-failure findings
├── stages.ts            # dismissStageFindings — allow stage=null for non-failure
├── compare.ts            # FAILURE_CLASSES — reference for understanding
├── types.ts              # Defect, DefectClass — may need status update
└── ...

scripts/
└── kbbi-validate.mjs    # CLI wrapper — may need argument handling update

specs/002-validasi-kbbi-berbertahap/
└── spec.md              # Add explicit completion criterion (Option B)

tests/unit/
├── test_kbbi_stages.test.ts   # Existing — extend for non-failure dismiss
└── test_kbbi_cli_snapshot.test.ts  # Existing — may need update
```

**Structure Decision**: Internal tooling — changes confined to `tools/kbbi/` and `specs/`. No new project structure needed.

## Constitution Check (Post-Design Re-evaluation)

| Principle | Pass | Justification |
|-----------|------|---------------|
| I. Spec-Driven & Contract-First | PASS | Perintah triase didokumentasikan di `contracts/triage-command.md`. Kriteria selesai ditulis di spec 002. |
| II. Offline & Static-Only | PASS | Perintah triase hanya membaca/menulis berkas lokal. |
| III. Runtime Layer Separation | PASS | Tidak ada perubahan pada `src/`. |
| IV. Deterministic Language Pipeline | PASS | Tidak ada perubahan pada pipeline. |
| V. Test-Gated Quality | PASS | Perintah triase diuji via `tests/unit/test_kbbi_stages.test.ts`. |

**Status: LULUS.** Konstitusi tidak terdampak oleh desain Phase 1.

## Complexity Tracking

No violations to track.
