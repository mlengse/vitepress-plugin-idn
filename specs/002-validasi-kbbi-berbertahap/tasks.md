---

description: "Task list for KBBI validation tooling"
---

# Tasks: Validasi Kemampuan Bahasa Indonesia terhadap KBBI secara Bertahap

**Input**: Dokumen desain dari `/specs/002-validasi-kbbi-berbertahap/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tugas test disertakan. Konstitusi v1.0.1 Prinsip V mewajibkan tiga lapis
test yang tidak saling menggantikan, dan tugas ini menyentuh `tests/unit/`.

**Organization**: Tugas dikelompokkan per user story agar setiap story dapat
dikerjakan, diuji, dan dikirim sebagai increment yang berdiri sendiri.

## Format: `[ID] [P?] [Story] Deskripsi`

- **[P]**: Bisa jalan paralel (berkas berbeda, tanpa dependensi)
- **[Story]**: User story pemilik tugas (US1 s.d. US5)
- Sertakan path berkas yang persis

## Konvensi Path

- Perkakas: `tools/kbbi/`
- Entry point: `scripts/kbbi-validate.mjs`
- Test: `tests/unit/`
- Fixture: `tests/fixtures/`
- Data kerja: `.kbbi/` (di-gitignore, tidak pernah dikomit)

> **Catatan kepatuhan.** Tidak ada tugas di bawah ini yang mengubah `src/`
> selain T031 dan T032, dan keduanya dijalankan sebagai bagian dari tahap
> perbaikan yang tercatat. Perkakas `tools/kbbi/` berada di luar tiga lapisan
> runtime (Prinsip III) dan tidak boleh diimpor dari `src/`.

---

## Phase 1: Setup (Infrastruktur Bersama)

**Purpose**: Menciptakan struktur perkakas dan titik masuknya

- [X] T001 Tambahkan `.kbbi/` ke `.gitignore` supaya snapshot, laporan, temuan, dan catatan tahap tidak pernah masuk git (FR-018, R3, R12)
- [X] T002 Buat `tools/kbbi/types.ts` berisi tipe bersama turunan `data-model.md`: `Snapshot`, `SnapshotFile`, `CanonicalWord`, `CanonicalSyllable`, `Measurement`, `Defect`, `RegressionCase`, `Stage`. Berkas ini hanya deklarasi tipe, tanpa kode runtime (FR-017)
- [X] T003 Buat `scripts/kbbi-validate.mjs` sebagai entry point tipis yang meneruskan argv ke `tools/kbbi/cli.ts`, mengikuti pola yang sudah dipakai `scripts/update-stopwords.ts` (FR-017)

**Checkpoint**: `node scripts/kbbi-validate.mjs --help` berjalan tanpa error

---

## Phase 2: Foundational (Prasyarat Blocking)

**Purpose**: Inferi yang WAJIB selesai sebelum user story mana pun dapat mulai

> **KRITIS**: Tidak ada pekerjaan user story yang boleh dimulai sebelum fase ini selesai

- [X] T004 Implementasikan `tools/kbbi/snapshot.ts`: unduh `lexicon/derived_to_root_with_kelas.json` dan `hyphenation/kbbi_vi_hyphenation_dict.json` dari tag `data-v4`, verifikasi `blobSha` terhadap tabel di `research.md` R2, hitung `sha256`, lalu tulis `.kbbi/snapshot/data-v4/manifest.json`. **Tolak** snapshot bila `blobSha` tidak cocok (R2, `contracts/snapshot-format.md`) (FR-011, FR-014)
- [X] T005 [P] Implementasikan `tools/kbbi/corpus.ts`: muat snapshot ke bentuk kanonik.WAJIB menjalankan kelima aturan kanonik R8 - (1) `toLowerCase()` pada kata dan pemenggalan, (2) hapus spasi luar, (3) tanda titik pada pemenggalan menjadi tanda hubung, (4) tanda hubung pada kata majemuk dipertahankan, (5) reduplikasi dipertahankan utuh (FR-006)
- [X] T006 [P] Implementasikan `tools/kbbi/report.ts`: tulis dua bentuk keluaran sesuai `contracts/report-format.md` - markdown dan JSONL ke `.kbbi/reports/`. JSONL WAJIB mengurutkan kunci tetap, `null` eksplisit, dan baris terurut `word` menaik (FR-002, FR-014)
- [X] T007 [P] Tulis `tests/unit/test_kbbi_canonical.test.ts` untuk aturan kanonik `tools/kbbi/corpus.ts`. **WAJIB gagal sebelum T005 diimplementasikan.** Kasus wajib: `"At.lan.tik"` menjadi `at-lan-tik`, `a.has` menjadi `a-has`, `abu-abo` tetap `abu-abo`, `ayam-ayaman` tetap utuh (FR-006)
- [X] T008 [P] Tulis `tests/unit/test_kbbi_taxonomy.test.ts` untuk taksonomi cacat. **WAJIB gagal sebelum diimplementasikan.** Kasus wajib dari `contracts/defect-taxonomy.md`: jumlah suku kata sama dengan batas berbeda harus menjadi `syllable-boundary-shift`, bukan `syllable-count-diff`; `reference-missing` tidak boleh muncul untuk kata yang ada di kamus pemenggalan (FR-003)
- [X] T009 Implementasikan `tools/kbbi/compare.ts`: bandingkan bentuk kanonik plugin dengan bentuk kanonik referensi, lalu klasifikasikan memakai urutan taksonomi R9. **WAJIB** menulis `accuracy` bernilai `null` bila `tested` bernilai nol (FR-016), dan total `tested + referenceMissing + excluded` tidak boleh melebihi jumlah kata dalam cakupan
- [X] T010 Implementasikan `tools/kbbi/cli.ts` dengan perintah `snapshot` dan `measure --capability stem|syllable --scope all|<huruf>`, parsing argumen, dan kode keluar non-nol saat gagal (FR-004)

**Checkpoint**: Fondasi siap - user story dapat mulai

---

## Phase 3: User Story 1 - Mengukur akurasi kata dasar terhadap KBBI (Priority: P1) - MVP

**Goal**: Angka kecocokan akar kata beserta daftar kata yang berbeda, terhadap referensi KBBI

**Independent Test**: Jalankan `node scripts/kbbi-validate.mjs measure --capability stem --scope m`. Laporan harus menyebut jumlah diuji, jumlah cocok, tingkat kecocokan, dan memuat setiap perbedaan lengkap dengan hasil plugin, hasil KBBI, dan sumber datanya.

- [X] T012 [US1] Baca `lexicon/derived_to_root_with_kelas.json` di `tools/kbbi/corpus.ts` dan bangun `CanonicalWord` dengan `referenceRoot` dan `kelasKata` per kata turunan (FR-001, FR-020)
- [X] T013 [US1] Terapkan aturan pemetaan akar ganda di `tools/kbbi/compare.ts`: kata yang punya beberapa pemetaan memakai **entri teratas yang memiliki pemetaan akar, sesuai urutan file**, sama seperti aturan `cari_kata_dasar` (keputusan klarifikasi 2026-10-07) (FR-001)
- [X] T014 [US1] Klasifikasikan kata dasar sah di `tools/kbbi/compare.ts` sebagai `root-word-self` dan hitung sebagai **cocok**, bukan kegagalan (FR-003)
- [X] T015 [US1] Klasifikasikan kata yang tidak ada di snapshot sebagai `reference-missing` dengan `triageNote` yang menyebut kata tidak ditemukan, dan keluarkan dari pembilang (FR-003, FR-006)
- [X] T016 [US1] Terapkan idempotensi di `tools/kbbi/compare.ts`: kunci `(capability, word, referenceOutput)`. Menjalankan cakupan yang sama tidak boleh menambah baris duplikat dan tidak boleh mengubah hasil (FR-005)
- [X] T017 [US1] Tambahkan pecahan per huruf awal dan per kelas kata ke `Measurement.byLetter` dan `Measurement.byKelasKata` di `tools/kbbi/report.ts` (FR-020)
- [X] T018 [US1] Pastikan kepala laporan memuat versi snapshot `data-v4` beserta `blobSha`, cakupan, dan waktu pengukuran di `tools/kbbi/report.ts` (FR-014)
- [X] T019 [US1] Jalankan `measure --capability stem --scope m`, konfirmasi akurasi SC-001 terukur pada batch, dan konfirmasi tidak ada kata serapan yang diperlakukan sebagai kegagalan

**Checkpoint**: US1 berfungsi penuh dan dapat diuji sendiri. Ini MVP.

---

## Phase 4: User Story 2 - Mengukur akurasi pemenggalan terhadap KBBI (Priority: P2)

**Goal**: Angka kecocokan pemenggalan pada dua stratum, dengan klasifikasi jenis kesalahan

**Independent Test**: Jalankan `node scripts/kbbi-validate.mjs measure --capability syllable --scope m`. Laporan harus memuat blok `Per stratum`, dan kata dengan jumlah suku kata sama tetapi batas berbeda harus berlabel pergeseran batas.

- [X] T020 [US2] Normalkan pemenggalan referensi dari notasi titik ke tanda hubung di `tools/kbbi/corpus.ts`, dan turunkan huruf kapital seperti pada `"atlantik": "At.lan.tik"` (R5, R8) (FR-006)
- [X] T021 [US2] Terapkan aturan stratum di `tools/kbbi/corpus.ts`: kata berstratum `loan` bila pemenggalan KBBI-nya memuat onset `kn`, `kw`, `kh`, `gh`, `ph`, `ps`, `sy`, `tr`, `tw`, `bl`, `br`, `dr`, `fl`, `fr`, `gl`, `gr`, `str`, `spr`, `skr`, `skl`, `spl`; selain itu `core` (FR-004, SC-002)
- [X] T022 [US2] Klasifikasikan selisih pemenggalan di `tools/kbbi/compare.ts`: jumlah suku kata sama menjadi `syllable-boundary-shift`, jumlah berbeda menjadi `syllable-count-diff`, keduanya diperiksa **sebelum** kelas `candidate-bug` (R9) (FR-007)
- [X] T023 [US2] Larangan keras di `tools/kbbi/compare.ts`: **jangan pernah** membuat temuan untuk kata berstratum `loan`, dan **jangan pernah** mengusulkan perbaikan atas tabel onset di `src/core/syllabify.ts` (keputusan klarifikasi 2026-10-07, R5) (FR-003, SC-002)
- [X] T024 [US2] Tambahkan blok `Per stratum` hanya pada laporan `syllable` di `tools/kbbi/report.ts`, dengan baris `core` sebagai satu-satunya gerbang kelulusan dan baris `loan` untuk transparansi saja (SC-002)
- [X] T025 [US2] Jalankan `measure --capability syllable --scope m`, konfirmasi blok `Per stratum` muncul, dan konfirmasi nol temuan berasal dari stratum `loan` (FR-001, FR-007)

**Checkpoint**: US1 dan US2 berfungsi saling independen

---

## Phase 5: User Story 3 - Memperbaiki cacat bertahap tanpa regresi (Priority: P3)

**Goal**: Siklus plan - perbaiki - verify - promote dengan pengaman regresi yang tidak dapat dilewati

**Independent Test**: Bentuk satu tahap dari temuan terbuka, perbaiki, verifikasi, lalu promotions. Kasus regresi dari tahap sebelumnya harus dijalankan ulang dan tetap lulus, dan tingkat kecocokan total tidak boleh turun.

- [X] T026 [P] [US3] Tulis `tests/unit/test_kbbi_stages.test.ts` untuk gerbang tahap di `tools/kbbi/stages.ts`. **WAJIB gagal sebelum T027 diimplementasikan.** Kasus wajib: tahap berisi lebih dari 20 temuan ditolak; tahap bercampur dua kapabilitas ditolak; `promote` ditolak bila status belum `passed` (FR-008, FR-010)
- [X] T027 [US3] Implementasikan `tools/kbbi/stages.ts` perintah `plan --capability X --max N`: batasi 20 temuan per tahap (SC-003), satu kapabilitas per tahap, dan hanya temuan berkelas yang dihitung kegagalan yang boleh masuk
- [X] T028 [US3] Implementasikan gerbang G1, G2, dan G3 di `tools/kbbi/stages.ts`: G1 `regressions` kosong; G2 akurasi akhir tidak lebih rendah dari akurasi awal pada kedua kapabilitas; G3 seluruh `gatesRun` lulus termasuk satu entri `build-full` (FR-010, `contracts/stage-workflow.md`)
- [X] T029 [US3] Implementasikan perintah `revert` di `tools/kbbi/stages.ts`: kembalikan temuan tahap ke `open`, kosongkan `stage`, dan tarik kasus regresi yang tidak lagi berlaku dengan alasan tercatat (FR-022)
- [X] T030 [US3] Implementasikan perintah `promote` di `tools/kbbi/stages.ts`: tandai temuan `fixed`, buat `RegressionCase` untuk setiap temuan `fixed` (FR-009), dan perbarui fixture kurasi `tests/fixtures/kbbi-regression-stem.json` dan `tests/fixtures/kbbi-regression-syllable.json` dalam bentuk array `[word, expected]` mengikuti `tests/fixtures/stem-golden.json`
- [X] T031 [US3] Terapkan penandaan `contractLocked` di `tools/kbbi/compare.ts`: bernilai true bila perbaikannya mengubah hasil untuk kata di tabel contoh kontrak `specs/001-indonesian-search-plugin/contracts/public-api.md`, kata di golden fixture, atau entri `OVERRIDES` di `src/core/syllabify.ts` (FR-023, SC-013)
- [X] T032 [US3] Implementasikan kewajiban pembaruan kontrak di `tools/kbbi/stages.ts`: `promote` menolak `contractLocked` bila kontrak, test, dan jejak alasan di bagian `## Clarifications` pada `spec.md` belum ketiganya diperbarui (FR-023, SC-013, keputusan klarifikasi 2026-10-07)
- [X] T033 [US3] Perbaiki sepuluh temuan teratas tahap pertama di `src/core/stem.ts`, dan perbarui golden fixture `tests/fixtures/stem-golden.json` **hanya jika** perbaikannya memang mengubahnya, dengan alasan yang dinyatakan (Prinsip V) (SC-001)
- [X] T034 [US3] Hilangkan kontradiksi yang sudah ada di `tests/unit/test_stem_golden.test.ts`: assertion `ratio >= 0.85` mati secara logis karena assertion berikutnya menuntut seluruh 50 pasangan benar. **Hapus** assertion 85% yang redundan, jangan melemahkan pemeriksaan kecocokan persis (SC-001)
- [X] T035 [US3] Jalankan `plan`, perbaiki, `verify`, dan `promote` untuk `stage-01`, lalu konfirmasi tingkat kecocokan total tidak turun (SC-004)

**Checkpoint**: Seluruh user story berfungsi saling independen

---

## Phase 6: User Story 4 - Menjalankan pengukuran secara deterministik tanpa jaringan (Priority: P4)

**Goal**: Pengukuran yang dapat diulang byte per byte dan berjalan tanpa jaringan

**Independent Test**: Matikan jaringan, jalankan `measure` dari snapshot yang sama, dan bandingkan byte JSONL dengan hasil sebelumnya. HARUS identik.

- [X] T036 [US4] Implementasikan titik lanjutan di `tools/kbbi/compare.ts` dan `tools/kbbi/snapshot.ts`: pengukuran yang terhenti dilanjutkan dari kata terakhir yang selesai, kata yang belum sempat diproses tidak boleh tercatat sebagai gagal (FR-015)
- [X] T037 [US4] Terapkan penandaan pengukuran terputus di `tools/kbbi/report.ts`: blok peringatan eksplisit dan `partial: true`, dan angka total **dilarang** dipakai sebagai angka final (FR-014)
- [X] T038 [US4] Implementasikan `tools/kbbi/mcp.ts` sebagai adapter opsional untuk tool MCP `mlengse/kbbi-mcp-server`, memakai `cari_kata_dasar`, `pemenggalan_kata`, `kelas_kata`, dan `analisis_imbuhan` untuk sampling dan triase saja. Jalur massal **tidak boleh** pernah memanggilnya (R6, FR-012)
- [X] T039 [US4] Terapkan perilaku saat MCP hilang di `tools/kbbi/cli.ts`: berhenti dengan pesan yang menjelaskan penyebab dan jalan keluar berupa snapshot, tanpa melaporkan angka kecocokan apa pun (FR-016)
- [X] T040 [US4] Pastikan jalur snapshot sepenuhnya lokal di `tools/kbbi/corpus.ts`: tidak ada panggilan jaringan setelah `snapshot` selesai (FR-012)
- [X] T041 [US4] Verifikasi determinisme: jalankan `measure --capability stem --scope m` dua kali, konfirmasi JSONL identik byte per byte, lalu jalankan sekali lagi tanpa jaringan dan konfirmasi angkanya sama (FR-013, SC-005, SC-007)

**Checkpoint**: US1 s.d. US4 berfungsi; US4 menutup determinisme

---

## Phase 7: User Story 5 - Menjamin perbaikan tidak merusak pencarian (Priority: P5)

**Goal**: Perbaikan kata dasar dan pemenggalan tidak boleh merusak hasil pencarian

**Independent Test**: Bangun indeks dari dokumen berkpasangan kata turunan dan akar memakai `createIndex` dan `search` dari `src/core/search.ts`, lalu cari di kedua arah.

- [X] T042 [P] [US5] Tulis `tests/unit/test_kbbi_search_regression.test.ts` sebagai **tingkat 1**: memakai `createIndex` dan `search` dari `src/core/search.ts` tanpa build playground, menguji setiap kasus regresi akar kata dari `tests/fixtures/kbbi-regression-stem.json` (FR-019 tingkat 1, keputusan klarifikasi 2026-10-07)
- [X] T043 [US5] Tambahkan pengujian dua arah di `tests/unit/test_kbbi_search_regression.test.ts`: mencari akar harus menemukan dokumen yang memuat bentuk turunannya, dan mencari bentuk turunan harus menemukan dokumennya (US5) (FR-019)
- [X] T044 [US5] Implementasikan gate `build-full` tingkat 2 di `tools/kbbi/stages.ts`: satu build playground penuh pada akhir tiap tahap, dan tahap tidak boleh dinyatakan lulus tanpanya (FR-019 tingkat 2, SC-014)
- [X] T045 [US5] Hubungkan kegagalan tingkat 1 dan tingkat 2 ke kondisi gagal yang sama seperti G1 di `tools/kbbi/stages.ts` (FR-010)
- [X] T046 [US5] Jalankan `npm test` dan konfirmasi tingkat 1 hijau tanpa build tambahan, lalu jalankan `verify` dan konfirmasi `build-full` tercatat pada `gatesRun` (SC-014)

**Checkpoint**: Kelima user story berfungsi saling independen

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T047 [P] Tambahkan atribusi data KBBI beserta lisensi ISC ke `README.md` (tabel kapabilitas upstream) dan ke `NOTICE`, menyebut repositori persis yang dikonsumsi (SC-009, Constraint Licensing)
- [X] T048 [P] Buktikan ukuran paket tidak bertambah di `scripts/verify-external.mjs`: jalankan `npm run build` lalu `npm pack --dry-run`, konfirmasi tidak ada berkas `.kbbi/` maupun data lexicon KBBI dalam paket (SC-008, FR-018)
- [X] T049 Pastikan `tools/kbbi/` tidak pernah diimpor dari `src/`, dan tidak masuk `tsup` maupun peta `exports` di `package.json` (Prinsip III, FR-017)
- [X] T050 Perbarui `specs/002-validasi-kbbi-berbertahap/quickstart.md` agar cocok dengan perilaku akhir yang benar-benar terimplementasi (SC-010)
- [X] T051 Jalankan pengukuran penuh `measure --capability stem --scope all` dan `measure --capability syllable --scope all` dari snapshot, rekam baseline akurasi akhir (SC-001, SC-002)
- [X] T052 Lengkapi setiap temuan yang tersisa dengan alasan triase tercatat, atau statuskan sebagai keterbatasan diketahui beserta alasan teknis dan baseline-nya (SC-006, SC-011, SC-012, FR-022)
- [X] T053 Jalankan seluruh langkah validasi `quickstart.md` dari awal sampai akhir dan catat hasilnya (SC-005)
- [X] T054 Ulangi Constitution Check terhadap konstitusi v1.0.1 di `specs/002-validasi-kbbi-berbertahap/plan.md`, konfirmasi tiap prinsip tetap LULUS setelah implementasi (Governance, Compliance review) (FR-021)
- [X] T055 Konfirmasi `checklists/requirements.md` tetap 16 dari 16 lulus pada spec yang sudah direvisi (SC-010)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Tidak ada dependensi - dapat langsung dimulai
- **Foundational (Phase 2)**: Bergantung pada Phase 1 - **MEMBLOKIR semua user story**
- **User Stories (Phase 3 s.d. 7)**: Semua bergantung pada Phase 2
  - US1 (P1) dan US2 (P2) dapat berjalan berurutan atau paralel setelah Phase 2
  - US3 bergantung pada US1 dan US2 karena memperbaiki temuan dari keduanya
  - US4 dapat berjalan paralel dengan US1 dan US2
  - US5 bergantung pada US3 karena memverifikasi hasil perbaikannya
- **Polish (Phase 8)**: Bergantung pada seluruh user story yang dikehendaki

### User Story Dependencies

- **User Story 1 (P1)**: Dapat mulai setelah Phase 2 - tanpa dependensi story lain
- **User Story 2 (P2)**: Dapat mulai setelah Phase 2 - tanpa dependensi story lain
- **User Story 3 (P3)**: Memerlukan Phase 2 dan secara praktis memerlukan US1 serta US2, karena memperbaiki temuan yang mereka hasilkan
- **User Story 4 (P4)**: Dapat mulai setelah Phase 2 - dapat berjalan paralel dengan US1 dan US2
- **User Story 5 (P5)**: Memerlukan Phase 2, dan memverifikasi output US3

### Penjelasan pemisahan snapshot

Akuisisi snapshot (T004) berada di **Phase 2**, bukan Phase 6, walaupun US4 yang
berbicara tentang snapshot. Alasannya: US1 dan US2 sama-sama memerlukan data
referensi, jadi snapshot adalah prasyarat yang memblokir, bukan kontribusi unik
US4. Kontribusi unik US4 adalah **determinisme dan jaminan tanpa jaringan**:
titik lanjutan, penandaan terputus, adapter MCP opsional, dan verifikasi
byte-identik.

### Within Each User Story

- Test WAJIB ditulis dan gagal sebelum implementasi diimplementasikan
- Tipe dan bentuk kanonik sebelum perbandingan
- Perbandingan sebelum pelaporan
- Gerbang tahap sebelum promosi
- Story selesai sebelum pindah ke prioritas berikutnya

### Parallel Opportunities

- T001, T002, T003 pada Phase 1 saling independen
- T005, T006, T007, T008 pada Phase 2 saling independen setelah T002 selesai (berkas berbeda, direktori keluaran berbeda)
- T026 pada Phase 5 dapat berjalan paralel dengan Phase 6 dan Phase 7
- T042 pada Phase 7 dapat berjalan paralel dengan Phase 6
- T047 dan T048 pada Phase 8 saling independen

---

## Parallel Example: Phase 2 Foundational

```bash
# Setelah T002 (types.ts) selesai, jalankan bersama:
Task: "Implementasikan tools/kbbi/corpus.ts: muat snapshot ke bentuk kanonik"
Task: "Implementasikan tools/kbbi/report.ts: tulis markdown dan JSONL"
Task: "Tulis tests/unit/test_kbbi_canonical.test.ts"
Task: "Tulis tests/unit/test_kbbi_taxonomy.test.ts"
```

Berkas berbeda: `corpus.ts`, `report.ts`, dan dua berkas test. Direktori keluaran
berbeda: `corpus.ts` membaca `snapshot/`, `report.ts` menulis `reports/`.

---

## Parallel Example: User Story 1

```bash
# Jalankan bersama setelah Phase 2 selesai:
Task: "Jalankan measure --capability stem --scope m dan konfirmasi laporan"
```

Tidak ada paralel lain di US1 karena seluruh tugas menyentuh `corpus.ts`,
`compare.ts`, dan `report.ts` yang saling berurutan.

---

## Parallel Example: User Story 2

Tidak ada paralel di US2. T021 dan T023 sama-sama menyentuh `corpus.ts` dan
`compare.ts`; mengubahnya bersamaan berisiko konflik berkas.

---

## Parallel Example: User Story 5

```bash
# Jalankan bersama:
Task: "Tulis tests/unit/test_kbbi_search_regression.test.ts sebagai tingkat 1"
Task: "Implementasikan gate build-full tingkat 2 di tools/kbbi/stages.ts"
```

Berkas berbeda dan tidak saling mengimpor.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Selesaikan Phase 1: Setup
2. Selesaikan Phase 2: Foundational (KRITIS - memblokir semua story)
3. Selesaikan Phase 3: User Story 1
4. **BERHENTI dan VALIDASI**: Uji US1 secara independen
5. Demo bila sudah siap

### Incremental Delivery

1. Selesaikan Setup + Foundational - fondasi siap
2. Tambah US1 - uji independen - **MVP**
3. Tambah US2 - uji independen - demo
4. Tambah US4 - uji independen - demo (determinisme)
5. Tambah US3 - uji independen - demo (perbaikan bertahap)
6. Tambah US5 - uji independen - demo (penjaga pencarian)
7. Tiap story menambah nilai tanpa merusak story sebelumnya

### Parallel Team Strategy

Dengan beberapa pengembang:

1. Tim menyelesaikan Setup + Foundational bersama
2. Setelah Foundational selesai:
   - Pengembang A: US1
   - Pengembang B: US2
   - Pengembang C: US4
3. US3 dimulai setelah US1 dan US2 menghasilkan temuan
4. US5 dimulai setelah US3 menghasilkan kasus regresi

---

## Notes

- [P] berarti berkas berbeda, tanpa dependensi
- Label [Story] memetakan tugas ke user story untuk keterlacakan
- Setiap user story harus dapat diselesaikan dan diuji sendiri
- Verifikasi bahwa test gagal sebelum implementasi
- Commit setelah setiap tugas atau grup logis
- Berhenti di checkpoint mana pun untuk memvalidasi story secara independen
- Hindari: tugas kabur, konflik berkas sama, dependensi lintas-story yang merusak kemandirian
- **Klarifikasi 2026-10-07 yang tertanam di tugas ini**: KBBI menang atas kontrak
  (T032), onset cluster tidak diperbaiki (T023), pemetaan akar ganda memakai
  entri teratas (T013), verifikasi pencarian dua tingkat (T042, T044)

---

## Phase 9: Convergence

- [X] T056 Perbaiki klaim `--force` yang menyesatkan pada perintah `snapshot` di `tools/kbbi/cli.ts`: entah implementasikan refresh yang benar-benar mengambil ulang (mis. `snapshot --force` yang tetap memanggil `captureSnapshot` meski snapshot sudah ada), atau ganti pesannya agar menunjuk langkah nyata (hapus `.kbbi/snapshot/` lalu jalankan `snapshot`), lalu hapus spread no-op `...(flags['force'] !== undefined ? {} : {})` per US4/AC4 (contradicts)
- [X] T057 Selaraskan contoh bentuk JSONL di `contracts/report-format.md` dengan keluaran nyata: cantumkan kunci `contractLocked` di antara `stage` dan `firstSeenRun` (dan samakan contoh `data-model.md` §4 yang menghilangkan `stage`), serta dokumentasikan baris kepala `Cakupan` yang disyaratkan FR-014 dan sudah ditulis oleh `tools/kbbi/report.ts` per Constitution I (partial)
