# Research: Close Validation Workflow Completion Gap

**Feature**: 003-close-validation-workflow | **Date**: 2026-10-10

## R1 — Jalur penutup temuan non-kegagalan

**Decision**: Tambah perintah `triage` (atau perluas `dismiss`) yang menutup temuan non-kegagalan tanpa mensyaratkan `--stage`. Perintah menerima `--class` (atau `--capability` + `--word`) dan `--reason`, lalu mengubah status temuan yang cocok menjadi `dismissed` dengan alasan tercatat.

**Rationale**: 
- `planStage` menyaring via `countsFailure(defect.class)` — `reference-missing`, `data-divergence`, `root-word-self` tidak bisa masuk tahap (stages.ts:460-506)
- `dismissStageFindings` mensyaratkan `defect.stage === stage.id` — temuan non-kegagalan selalu `stage: null` (stages.ts:551-586)
- Perintah baru harus tetap mewajibkan alasan (FR-022) dan mencatat `triageNote`

**Alternatives considered**:
- *Naikkan `reference-missing` ke failure class*: ditolak — akan mengubah makna taksonomi dan membuat 5.932 temuan masuk tahap perbaikan yang tidak bisa diperbaiki
- *Buat tahap khusus "triase"*: ditolak — melanggar batas satu kapabilitas per tahap dan menambah kompleksitas workflow
- *Edit manual `open.jsonl`*: ditolak — tidak ada jejak, tidak ada validasi, melanggar FR-022

## R2 — Kriteria selesai spec 002

**Decision**: Spec 002 dinyatakan "selesai" bila: (a) setiap temuan di `open.jsonl` berstatus `fixed` atau `dismissed` dengan alasan tercatat, dan (b) akurasi terakhir tercatat di spec sebagai plafon. Akurasi SC-001/SC-002 adalah plafon yang dikejar, bukan gerbang penghalang.

**Rationale**:
- SC-011 mewajibkan nol temuan terbuka tanpa penjelasan — ini hanya dapat dicapai jika setiap temuan punya jalur penutup (R1)
- Asumsi §341 menyatakan akurasi adalah plafon — ini bertentangan dengan SC-011 jika "selesai" berarti akurasi 98%/97%
- Kriteria baru menyelesaikan ketegangan: "selesai" = semua temuan tertutup, akurasi dicatat sebagai hasil akhir

**Alternatives considered**:
- *"Selesai" = akurasi 98%/97%*: ditolak — tidak dapat dicapai dalam rasionalitas workflow yang ada (±1.323 tahap untuk syllable saja)
- *"Selesai" = semua temuan fixed (tanpa dismiss)*: ditolak — FR-022 secara eksplisiz mengizinkan dismiss dengan alasan; menolak dismiss akan menahan perbaikan yang sah
- *Biarkan tidak terdefinisi*: ditolak — kontributor tidak dapat menilai sisa kerja

## R3 — Cakupan perubahan kode

**Decision**: Perubahan pada `tools/kbbi/cli.ts` (perintah baru atau perluasan `dismiss`), `tools/kbbi/stages.ts` (logika penutupan non-kegagalan), dan `specs/002-validasi-kbbi-berbertahap/spec.md` (kriteria selesai). Tidak ada perubahan pada `src/core/`, `src/client/`, atau `src/node/`.

**Rationale**: Feature ini murni tooling/spec — tidak menyentuh runtime plugin. Konstitusi III (Runtime Layer Separation) dan II (Offline & Static-Only) tidak terdampak.

**Alternatives considered**:
- *Perbaiki algoritma stemming/syllabification untuk mengurangi temuan*: ditolak — di luar scope feature ini; keputusan skala (Option C) ditangguhkan sampai kriteria selesai ada
