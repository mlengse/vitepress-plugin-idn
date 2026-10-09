# Feature Specification: Close Validation Workflow Completion Gap

**Feature Branch**: `003-close-validation-workflow`

**Created**: 2026-10-10

**Status**: Draft

**Input**: Decision handoff from `.specify/assessments/repo-gap-analysis/decision.md` — Option A (tutup jalur penutup temuan non-kegagalan) lalu Option B (definisikan ulang kriteria selesai spec 002), sekuensial.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Tutup temuan non-kegagalan tanpa tahap (Priority: P1)

Seorang kontributor menjalankan `kbbi-validate` dan menemukan 5.932 temuan berkelas `reference-missing` yang tidak dapat diubah statusnya — tidak bisa masuk tahap (bukan failure class) dan tidak bisa di-dismiss (tidak punya stage). Kontributor harus bisa menutup temuan-temuan ini dengan alasan terdokumentasi, tanpa harus membuat tahap perbaikan, agar SC-011 (nol temuan terbuka tanpa penjelasan) dapat dicapai.

**Why this priority**: Ini "smallest thing that could work" — membuat setiap temuan `open` memiliki jalur penutup yang valid. Tanpa ini, spec 002 tidak pernah dapat dinyatakan selesai.

**Independent Test**: Dapat diuji secara independen dengan menjalankan perintah penutup pada temuan `reference-missing` dan memverifikasi status berubah menjadi `dismissed` dengan alasan tercatat. Nilai yang diberikan: setiap temuan memiliki jalur penutup yang dapat dieksekusi.

**Acceptance Scenarios**:

1. **Given** temuan berkelas `reference-missing` dengan status `open` dan `stage: null`, **When** kontributor menjalankan perintah penutup dengan alasan, **Then** temuan berstatus `dismissed` dengan alasan tercatat dan `triageNote` terisi
2. **Given** temuan berkelas `data-divergence` atau `root-word-self` dengan status `open`, **When** kontributor menjalankan perintah penutup dengan alasan, **Then** temuan berstatus `dismissed` dengan alasan tercatat
3. **Given** kontributor menjalankan perintah penutup tanpa alasan, **When** perintah dieksekusi, **Then** perintah menolak dengan pesan yang menyebut kewajiban alasan (FR-022)
4. **Given** semua temuan non-kegagalan sudah ditutup, **When** kontributor menjalankan `status`, **Then** tidak ada temuan `open` tanpa jalur penutup yang valid

---

### User Story 2 — Definisikan kriteria selesai spec 002 (Priority: P2)

Setelah US1 selesai, kontributor dan pemilik repo perlu tahu kapan spec 002 dinyatakan "selesai". Saat ini SC-011 mewajibkan nol temuan terbuka tanpa penjelasan, tetapi asumsi §341 menyatakan akurasi SC-001/SC-002 adalah plafon — tidak ada keputusan eksplisit yang menyelesaikan ketegangan ini. Kriteria selesai harus tertulis di spec 002 dan dapat diverifikasi.

**Why this priority**: US1 membuat penutup temuan mungkin; US2 membuat "selesai" terdefinisi. Keduanya diperlukan agar spec 002 dapat ditutup, tetapi US1 lebih kecil dan tidak bergantung pada US2.

**Independent Test**: Dapat diuji secara independen dengan memverifikasi bahwa spec 002 memuat kriteria selesai yang eksplisit dan bahwa kriteria tersebut dapat diverifikasi (bukan tersirat). Nilai yang diberikan: kontributor dapat menilai sisa kerja dan menentukan kapan spec selesai.

**Acceptance Scenarios**:

1. **Given** spec 002 sudah diperbarui dengan kriteria selesai, **When** seorang kontributor membaca spec, **Then** kriteria selesai tertulis secara eksplisit dan dapat diverifikasi
2. **Given** kriteria selesai sudah tertulis, **When** semua temuan sudah ditutup (fixed atau dismissed dengan alasan), **Then** spec 002 memenuhi kriteria selesai dan dapat dinyatakan selesai
3. **Given** kriteria selesai sudah tertulis, **When** akurasi masih di bawah target SC-001/SC-002 tetapi semua temuan sudah tertutup, **Then** spec tetap dapat dinyatakan selesai — akurasi dicatat sebagai plafon terakhir, bukan gerbang penghalang

---

### Edge Cases

- Apa terjadi pada temuan yang sudah masuk tahap (stage !== null) ketika perintah penutup non-kegagalan dijalankan? → Perintah harus menolak atau mengabaikan, karena temuan dalam tahap harus diselesaikan melalui workflow tahap yang ada.
- Bagaimana perintah penutup menangani kata yang sama dengan `referenceOutput` berbeda (idempotency)? → `defectKey` harus tetap unik per kapabilitas + kata + referensi.
- Apakah perubahan pada kriteria selesai memerlukan amendmen konstitusi? → Tidak — ini klarifikasi/penulisan ulang §Assumptions, bukan prinsip baru.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem WAJIB menyediakan jalur penutup yang dapat dieksekusi untuk setiap temuan berstatus `open`, termasuk kelas non-kegagalan (`reference-missing`, `data-divergence`, `root-word-self`).
- **FR-002**: Sistem WAJIB mengizinkan temuan non-kegagalan ditutup tanpa mensyaratkan keanggotaan tahap (`stage: null`), selama alasan terdokumentasi.
- **FR-003**: Setiap penutupan temuan non-kegagalan WAJIB mencatat alasan (FR-022) — penolakan tanpa alasan ditolak oleh perkakas.
- **FR-004**: Spec 002 WAJIB memuat kriteria selesai yang eksplisit dan dapat diverifikasi, yang menyelesaikan ketegangan antara SC-011 (nol temuan terbuka) dan §Assumptions §341 (akurasi sebagai plafon).
- **FR-005**: Kriteria selesai WAJIB menyatakan bahwa akurasi SC-001/SC-002 dicatat sebagai plafon terakhir, bukan gerbang penghalang, selama semua temuan sudah tertutup.
- **FR-006**: Perubahan pada spec 002 (kriteria selesai) WAJIB dilakukan melalui proses amendmen spec, bukan melalui edit langsung oleh task implementasi.

### Key Entities

- **Defect (temuan)**: Satu perbedaan antara hasil plugin dan hasil referensi, dengan status `open` | `fixed` | `dismissed`. Kelas non-kegagalan: `reference-missing`, `data-divergence`, `root-word-self`.
- **Stage (tahap)**: Satu batch perbaikan berisi maksimal 20 temuan failure class. Temuan non-kegagalan tidak masuk tahap.
- **Completion criterion (kriteria selesai)**: Kondisi yang harus dipenuhi agar spec 002 dinyatakan selesai — tertulis eksplisit di spec.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% temuan `open` di `.kbbi/defects/open.jsonl` memiliki jalur penutup CLI yang valid (baseline: `reference-missing` = 5.932 temuan tanpa jalur penutup per 2026-10-10).
- **SC-002**: Kriteria selesai spec 002 tertulis secara eksplisit dan dapat diverifikasi (baseline: tidak ada kriteria selesai eksplisit per 2026-10-10).
- **SC-003**: Jumlah tahap yang diperlukan untuk menyelesaikan temuan syllable berada dalam rentang rasional untuk satu kontributor (baseline: ±1.323 tahap dengan batas 20 temuan/tahap) — baru bermakna setelah SC-002 terpenuhi.

## Assumptions

- `reference-missing` perlu ditutup (dismissed dengan alasan), bukan cukup dilaporkan sebagai keterbatasan diketahui — keputusan ini diambil karena SC-011 mewajibkan nol temuan terbuka tanpa penjelasan.
- Kriteria selesai baru tidak dianggap amendmen prinsip konstitusi — hanya klarifikasi/penulisan ulang §Assumptions.
- Batas 20 temuan/tahap tidak dinaikkan dalam feature ini — keputusan skala (Option C) ditangguhkan sampai kriteria selesai eksplisit ada.
- Perubahan pada spec 002 dilakukan melalui proses amendmen spec yang sesuai dengan konstitusi.
- Toolkitting KBBI (`tools/kbbi/`) tetap berada di luar jalur paket yang dipublikasikan (FR-017/SC-008) — perubahan pada perkakas tidak menambah dependensi runtime.
