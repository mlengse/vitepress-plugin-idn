# Quickstart: Close Validation Workflow Completion Gap

**Feature**: 003-close-validation-workflow | **Date**: 2026-10-10

## Prerequisites

- Node.js ≥20
- Dependencies installed (`npm install`)
- Snapshot KBBI sudah diambil (`node scripts/kbbi-validate.mjs snapshot`)
- Pengukuran sudah dijalankan (`node scripts/kbbi-validate.mjs measure --capability syllable --scope all`)

## Validasi US1 — Tutup temuan non-kegagalan tanpa tahap

### 1. Cek temuan reference-missing

```bash
node scripts/kbbi-validate.mjs status
```

Catat jumlah temuan `open` (terutama `reference-missing`).

### 2. Tutup semua reference-missing untuk syllable

```bash
node scripts/kbbi-validate.mjs triage \
  --capability syllable \
  --class reference-missing \
  --reason "Kata tidak ditemukan di kamus pemenggalan KBBI. Bukan kegagalan plugin."
```

**Expected**: Perintah berhasil, jumlah temuan `reference-missing` berubah menjadi `dismissed`.

### 3. Verifikasi tidak ada yang tertinggal

```bash
node scripts/kbbi-validate.mjs status
```

**Expected**: Tidak ada temuan `open` dengan kelas `reference-missing`.

### 4. Tutup kata spesifik

```bash
node scripts/kbbi-validate.mjs triage \
  --capability stem \
  --class data-divergence \
  --word "antui" \
  --reason "Onset non-Indonesia, di luar cakupan permanen."
```

**Expected**: Hanya kata `antui` yang berstatus `dismissed`.

### 5. Validasi penolakan tanpa alasan

```bash
node scripts/kbbi-validate.mjs triage \
  --capability syllable \
  --class reference-missing \
  --reason ""
```

**Expected**: Perintah menolak dengan pesan `alasan wajib diisi`.

## Validasi US2 — Kriteria selesai spec 002

### 1. Cek kriteria selesai sudah tertulis di spec

Baca `specs/002-validasi-kbbi-berbertahap/spec.md` — bagian §Completion Criterion harus ada.

**Expected**: Kriteria selesai tertulis eksplisit dan dapat diverifikasi.

### 2. Verifikasi semua temuan sudah tertutup

Setelah menjalankan triase untuk semua kelas non-kegagalan dan memproses semua temuan failure class:

```bash
node scripts/kbbi-validate.mjs status
```

**Expected**: Tidak ada temuan `open`. Akurasi terakhir tercatat.

### 3. Verifikasi spec 002 memenuhi kriteria selesai

Baca `specs/002-validasi-kbbi-berbertahap/spec.md` — pastikan akurasi terakhir dicatat sebagai plafon terakhir.

**Expected**: Spec 002 dapat dinyatakan selesai — semua temuan tertutup, akurasi tercatat.

## Gerbang repositori

```bash
npm run lint
npm run typecheck
npm test
```

Semua harus lulus sebelum feature dinyatakan selesai.
