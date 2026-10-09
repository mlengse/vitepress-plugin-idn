# Data Model: Close Validation Workflow Completion Gap

**Feature**: 003-close-validation-workflow | **Date**: 2026-10-10

## Entities

### Defect (existing — no schema change)

Satu perbedaan antara hasil plugin dan hasil referensi.

| Field | Type | Description |
|-------|------|-------------|
| `word` | string | Kata yang diuji |
| `capability` | `stem` \| `syllable` | Kapabilitas yang diuji |
| `pluginOutput` | string | Hasil plugin |
| `referenceOutput` | string | Hasil referensi KBBI |
| `class` | DefectClass | Kelas cacat (lihat defect-taxonomy) |
| `status` | `open` \| `fixed` \| `dismissed` | Status temuan |
| `stage` | string \| null | Tahap tempat diperbaiki; `null` jika belum pernah di-plan |
| `triageNote` | string | Alasan triase (wajib untuk `data-divergence`, `reference-missing`, `root-word-self`) |
| `withdrawnReason` | string? | Alasan penarikan kasus regresi |

**Status transitions**:
- `open` → `fixed`: melalui tahap perbaikan yang passed dan di-promote
- `open` → `dismissed`: melalui `dismiss` (dengan alasan) — **existing**, hanya untuk temuan dalam tahap
- `open` → `dismissed`: melalui perintah triase non-kegagalan (dengan alasan) — **NEW**, untuk temuan non-kegagalan tanpa tahap

### NonFailureClosure (new concept)

Penutupan temuan non-kegagalan tanpa keanggotaan tahap.

| Field | Type | Description |
|-------|------|-------------|
| `capability` | `stem` \| `syllable` | Kapabilitas temuan yang akan ditutup |
| `class` | DefectClass | Kelas non-kegagalan: `reference-missing`, `data-divergence`, `root-word-self` |
| `words` | string[] | Daftar kata yang akan ditutup (kosong = semua yang cocok) |
| `reason` | string | Alasan penutupan (wajib, FR-022) |

**Validation rules**:
- `reason` tidak boleh kosong — penolakan tanpa alasan melanggar FR-022
- Hanya temuan dengan `status: open` dan `stage: null` yang dapat ditutup
- `triageNote` diisi otomatis: `Ditutup lewat triase non-kegagalan: {reason}`

### CompletionCriterion (new concept)

Kriteria selesai spec 002.

| Field | Type | Description |
|-------|------|-------------|
| `allFindingsClosed` | boolean | `true` bila tidak ada temuan berstatus `open` |
| `finalStemAccuracy` | number | Akurasi stem terakhir yang diukur |
| `finalSyllableAccuracy` | number | Akurasi syllable terakhir yang diukur |
| `completedAt` | string? | ISO-8601 timestamp ketika kriteria terpenuhi |

**Completion rule**: Spec 002 "selesai" bila `allFindingsClosed = true`. Akurasi dicatat sebagai plafon terakhir, bukan gerbang penghalang.
