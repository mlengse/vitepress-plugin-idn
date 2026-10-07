# Implementation Plan: Validasi Kemampuan Bahasa Indonesia terhadap KBBI secara Bertahap

**Branch**: `002-validasi-kbbi-berbertahap` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification dari `/speckit.specify`

## Summary

Perkakas pengukuran internal yang membandingkan `stem()` dan `syllabify()` di
`vitepress-plugin-idn` terhadap data KBBI sebagai sumber kebenaran, lalu
menghasilkan daftar cacat terklasifikasi yang diperbaiki dalam batch kecil
berurutan dengan pengaman regresi.

Teknis: satu skrip Node mengunduh **dua file lexicon** dari
`mlengse/kbbi-harvester-cdn` pada tag `data-v4`, menyimpannya sebagai snapshot
di luar git, lalu membandingkan bentuk kanonik tiap kata. Keluarannya berupa
laporan markdown (untuk humans membandingkan antar tahap) dan JSONL (untuk diproses
mesin). Snapshot adalah sumber kebenaran tunggal: setelah diambil, pengukuran
seluruhnya berjalan tanpa jaringan dan tanpa MCP. Tool MCP
`mlengse/kbbi-mcp-server` hanya dipakai sebagai sampling dan triase, tidak pernah
sebagai jalur massal.

Feature ini **tidak mengubah paket yang dipublikasikan**. Data KBBI tidak
pernah ikut terbundel (keputusan Q1 di spec).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js >= 20, ESM (`"type": "module"`)

**Primary Dependencies**: Tidak ada dependensi baru. Paket yang sudah ada
(`minisearch`, `hyphenasi`, `sastrawijs-ts`, `@mlengse/snowball-js`) tidak
 disentuh. Perkakas memakai API Node bawaan (`node:fs`, `node:path`,
`node:crypto`, global `fetch`).

**Storage**: Berkas. Snapshot dan keluaran di direktori `.kbbi/` yang
di-gitignore; hanya kasus regresi kurasi yang dikomit ke `tests/fixtures/`
(R3, R12).

**Testing**: Vitest 2.1.9 untuk kasus regresi kurasi; skrip Node mandiri untuk
pengukuran penuh (R7).

**Target Platform**: Node.js 20+ pada mesin pengembang. Tidak ada komponen
runtime, tidak ada platform baru.

**Project Type**: Pustaka npm dengan perkakas CLI internal. Klasifikasi tetap
satu proyek; tidak ada repositori kedua yang perlu dibuat.

**Performance Goals**:
- Pengukuran penuh (33.268 kata turunan + kamus pemenggalan) selesai dalam
  30 menit dari snapshot (SC-005).
- Pengukuran batch kecil (satu huruf) selesai dalam 60 detik.
- Skrip perkakas selesai memuat 33rb+ kata dalam waktu kurang dari 5 detik.

**Constraints**:
- Tidak boleh menambah ukuran paket Dependency dan dependensi runtime (SC-008).
- Tidak boleh memerlukan jaringan setelah snapshot diambil (FR-012).
- Tidak boleh mengubah API publik plugin (FR-017).
- Snapshot harus deterministik: tag + blob SHA + checksum isi (R2, FR-011).
- Pengukuran yang sama harus menghasilkan laporan yang sama persis (FR-013).
- `.specify/memory/constitution.md` masih berupa templat tanpa isi, sehingga
  tidak ada prinsip yang membatasi. Gerbang kualitas memakai yang sudah ada:
  `npm run lint`, `npm run typecheck`, `npm test` (R10).

**Scale/Scope**:
- 33.268 kata turunan untuk pengukuran akar kata.
- 11.170 kata dasar sebagai penanda kata dasar sah.
- Satu bundle kamus pemenggalan untuk pengukuran pemenggalan.
- Batas 20 temuan per tahap perbaikan, maksimal beberapa dozen tahap (SC-003).
- Perkakas handful berkas; tidak ada layanan, tidak ada database.

## Constitution Check

**Gate initial**: `.specify/memory/constitution.md` kini berisi konstitusi yang
terisi penuh, versi 1.0.0, diratifikasi 2026-10-07, dengan lima prinsip dan tiga
kelompok constraint. Pemeriksaan dilakukan per prinsip.

| Prinsip / Constraint | Status | Bukti kepatuhan |
| --- | --- | --- |
| I. Spec-Driven & Contract-First | **LULUS dengan syarat** | Semua artefak ada di `specs/002-.../`; `tasks.md` menyusul di Phase 2. Syarat dijelaskan di bawah. |
| II. Offline & Static-Only Operation | **LULUS** | Perkakas tidak masuk build maupun runtime. Pengambilan snapshot adalah aksi pemelihara, bukan waktu build. Keputusan Q1 diperkuat oleh prinsip ini. |
| III. Runtime Layer Separation | **LULUS** | `tools/kbbi/` berada di luar tiga lapisan runtime. Perkakas mengimpor `src/core`, bukan sebaliknya. |
| IV. Deterministic Language Pipeline | **LULUS** | Perkakas memanggil `stem` dan `syllabify` tanpa mengubahnya. FR-013 mensyaratkan pengukuran deterministik, sejalan dengan prinsip. |
| V. Test-Gated Quality | **LULUS dengan deviasi tercatat** | Ketiga lapis test yang diwajibkan konstitusi tetap dipakai. Deviasi: pengukuran penuh tidak masuk vitest, dan verifikasi pencarian dipecah dua tingkat agar tidak membebani setiap `npm test` dengan build penuh. Dicatat di Complexity Tracking. |
| Constraint: Performance & Scale | **LULUS** | Tidak menyentuh jalur query atau build. |
| Constraint: Accessibility | **TIDAK BERLAKU** | Tidak ada permukaan UI yang disentuh. |
| Constraint: Licensing & Attribution | **LULUS dengan tindakan** | Lisensi data ISC memenuhi daftar yang diperbolehkan. Atribusi wajib di `README.md` dan `NOTICE` (SC-009). |
| Development Workflow | **LULUS** | Urutan specify-plan-tasks-verify diikuti; quickstart memuat langkah verifikasi. |
| Governance | **LULUS** | Constitution Check dicatat di sini dan diulang setelah desain. |

**Syarat pada Prinsip I - KBBI menang, kontrak mengikuti.**

`contracts/public-api.md` memuat tabel contoh kontrak untuk `stem` yang
ditandai "must hold in tests", dan satu contoh untuk `syllabify`:
`'pemerintahan'  'pe-mer-in-ta-han'`. Contoh `syllabify` itu bahkan
di-hardcode pada `OVERRIDES` di `src/core/syllabify.ts:69`.

Arti prinsip I: "Implementation MUST NOT silently diverge from a contract." KBBI
adalah rujukan linguistik yang menjadi otoritas akhir atas kebenaran, sedangkan
kontrak adalah janji kepada penulis situs pihak ketiga. Keputusan pengguna pada sesi
2026-10-07: ketika keduanya bertentangan, **KBBI yang benar dan kontrak yang diperbarui**.

Prinsip I tetap dipatuhi lewat jalur yang konstitusinya sendiri tetapkan: "Any behavior
change updates the contract in the same commit as the code." Karena itu `contract-locked` tidak
lagi memblokir perbaikan, melainkan **membebankan pembaruan kontrak**. Algoritme,
kontrak, dan test diperbarui sebagai satu paket; pembaruan tanpa jejak di
bagian Clarifications pada `spec.md` dianggap belum lengkap.

Hal yang sama berlaku untuk golden fixture. `tests/fixtures/stem-golden.json`
berisi 50 pasangan kurasi yang saat ini diuji **semuanya harus benar**
(`test_stem_golden.test.ts:33`). Prinsip V menyatakan golden fixture hanya boleh
diubah sebagai tindakan tinjauan eksplisit dengan alasan yang dinyatakan - sekarang hal
itu menjadi bagian dari paket perbaikan yang sama.

### Post-design re-check (Phase 1 selesai)

| Yang diperiksa | Hasil |
| --- | --- |
| Dependensi runtime bertambah? | Tidak. Nol dependensi baru. |
| API publik berubah? | Tidak pada feature ini. Kontrak feature 001 tidak tersentuh oleh perkakas. |
| Kontrak bisa berubah lewat perbaikan? | Ya, tetapi hanya bersama pembaruan kontrak, test, dan jejak di Clarifications (FR-023, SC-013). |
| Data pihak ketiga masuk paket? | Tidak. `.kbbi/` di-gitignore dan tidak ada di `files` package.json. |
| Gerbang quality circumvented? | Tidak. Stage gate hanya membaca hasil, tidak membuat aturan. |
| Struktur proyek berubah? | Tidak. Hanya menambah `tools/kbbi/` yang tidak masuk build. |
**Status: LULUS.** Tidak ada pelanggaran yang belum dijelaskan di sini,
sehingga bagian Complexity Tracking di bawah hanya memuat satu deviasi yang dicatat.

## Project Structure

### Documentation (this feature)

```text
specs/002-validasi-kbbi-berbertahap/
├── plan.md              # dokumen ini
├── spec.md              # spesifikasi (dari /speckit.specify)
├── research.md          # Phase 0 - 12 keputusan desain
├── data-model.md        # Phase 1 - entitas dan aturan validasinya
├── quickstart.md        # Phase 1 - panduan validasi end-to-end
├── contracts/
│   ├── snapshot-format.md      # bentuk manifest + payload snapshot
│   ├── report-format.md        # bentuk laporan md dan JSONL
│   ├── defect-taxonomy.md       # taksonomi cacat dan aturan triase
│   └── stage-workflow.md       # siklus hidup tahap dan gerbang regresi
├── checklists/
│   └── requirements.md  # checklist kualitas spesifikasi (20/20)
└── tasks.md             # Phase 2 - dibuat oleh /speckit-tasks
```

### Source Code (repository root)

Struktur yang sudah ada tetap utuh. Yang ditambahkan hanya satu direktori
perkakas, di luar jalur build:

```text
src/                       # tidak berubah
├── core/
│   ├── stem.ts            # target pengukuran akar kata
│   ├── syllabify.ts       # target pengukuran pemenggalan
│   ├── pipeline.ts        # tidak berubah
│   └── search.ts          # tidak berubah
├── node/                  # tidak berubah
└── client/                # tidak berubah

tools/kbbi/                # BARU - di luar paket, di luar build
├── snapshot.ts            # ambil + pin dataset, tulis manifest
├── corpus.ts              # muat snapshot ke bentuk kanonik, stratified
├── compare.ts             # stemming + pemenggalan, klasifikasi cacat
├── report.ts              # tulis md + jsonl
├── stages.ts              # pecah temuan jadi tahap, gerbang regresi
├── mcp.ts                 # adapter opsional untuk tool MCP
├── cli.ts                 # antarmuka perintah
└── types.ts               # tipe bersama tools/kbbi

scripts/
└── kbbi-validate.mjs      # BARU - entry point tipis ke tools/kbbi/cli.ts

tests/
├── fixtures/
│   ├── stem-golden.json        # ada - TIDAK diubah
│   ├── syllabify-golden.json   # ada - TIDAK diubah
│   ├── kbbi-regression-stem.json     # BARU - kasus regresi kurasi akar kata
│   └── kbbi-regression-syllable.json # BARU - kasus regresi kurasi pemenggalan
└── unit/
    ├── test_stem_golden.test.ts       # ada - TIDAK diubah
    ├── test_syllabify.test.ts         # ada - TIDAK diubah
    ├── test_kbbi_canonical.test.ts    # BARU - aturan bentuk kanonik (R8)
    ├── test_kbbi_taxonomy.test.ts     # BARU - aturan triase (R9)
    └── test_kbbi_stages.test.ts       # BARU - stage gate (FR-010)

.kbbi/                     # BARU - di-gitignore, tidak pernah dikomit
├── snapshot/data-v4/
├── reports/
├── defects/
└── stages/
```

**Structure Decision**: Satu repositori, satu paket. Perkakas validasi diletakkan
di `tools/kbbi/`, bukan di `src/`, karena tiga alasan yang saling menguatkan:

1. FR-017 melarang perkakas masuk jalur paket. `tsup` hanya membuild `src/`,
   jadi `tools/` otomatis keluar.
2. FR-018 melarang data KBBI terbundel. `package.json` `files` hanya
   `dist` dan `NOTICE`, dan `.kbbi/` tidak ada di sana.
3. Perkakas ini tidak diekspor ke pengguna akhir, jadi tidak perlu ada di
   `exports` map.

Entrypoint berupa skrip tipis `scripts/kbbi-validate.mjs` mengikuti pola
`scripts/update-stopwords.ts` yang sudah ada di repositori, sehingga contributor
tidak perlu belajar jalur baru.

`.kbbi/` di-gitignore, bukan di `tests/fixtures/`, karena isinya 4,9 MB data
pihak ketiga yang sengaja tidak dikomit (R3). Yang dikomit hanya kasus regresi
kurasi - puluhan pasangan, bukan 33rb.

## Catatan Temuan yang Mempengaruhi Implementasi

Empat hal ditemukan saat menelusuri kode dan data, dan harus diketahui
sebelum `/speckit-tasks` dijalankan:

1. **Onset cluster non-Indonesia di `src/core/syllabify.ts:32` dan `:62`.**
   Tabel memuat `kn`, `kw`, `kh`, `gh`, `ph`, `tr`, `tw` yang tidak ada dalam
   fonotaktik Indonesia, sehingga kecocokan pada kata serapan menjadi tidak bermakna.
   Keputusan 2026-10-07 (pilihan C): **tidak diperbaiki.** Daftar onset itu
   dipakai sebagai alat klasifikasi stratum (R5), bukan sebagai daftar cacat.
   Perkakas tidak boleh melaporkan temuan atas hal ini.
2. **Kasus kapital di sumber referensi.** `"atlantik": "At.lan.tik"` di
   `kbbi_vi_hyphenation_dict.json`. Tanpa normalisasi ke huruf kecil, ribuan
   temuan palsu akan muncul. Wajib ditangani di bentuk kanonik (R8).
3. **Ketidakkonsistenan yang sudah ada di
   `tests/unit/test_stem_golden.test.ts`.** Test itu meminta `ratio >= 0.85`
   sekaligus `every recorded pair stems to the recorded root`, yang secara
   logika berarti 100%. Bukan feature ini yang harus memperbaikinya, tapi
   perkakas ini tidak boleh memperluas file tersebut; kasus regresi KBBI
   masuk ke fixture terpisah agar tidak menambah ambiguitas yang sudah ada.
4. **Pemetaan akar ganda pada satu entri KBBI.** Sebuah entri bisa punya lebih
   dari satu akar yang mungkin. Keputusan 2026-10-07: pakai entri teratas sesuai
   urutan file, sama dengan aturan `cari_kata_dasar`. Ini menjaga determinisme
   FR-013 dan mencegah selisih palsu akibat dua aturan pemecahan yang berbeda.


## Complexity Tracking

| Deviasi | Prinsip yang disentuh | Mengapa dibutuhkan | Alternatif sederhana yang ditolak dan alasannya |
| --- | --- | --- | --- |
| Perkakas pengukuran penuh dijalankan sebagai skrip Node, bukan sebagai test vitest, dan verifikasi pencarian dipecah menjadi pemeriksaan cepat tingkat unit plus satu build penuh per tahap. | V. Test-Gated Quality | Pengukuran menutupi 33rb+ kata dan harus dapat dijalankan berulang kali tanpa build playground. `tests/global-setup.ts` menjalankan `npx vitepress build playground` pada setiap kali test jalan, sehingga satu build penuh per percobaan akan membuat perulangan perbaikan tidak layak. | Menaruhnya di `tests/unit/` ditolak karena setiap `npm test` akan menanggung build penuh. Melakukan build penuh pada setiap perbaikan ditolak karena build penuh hanya perlu dibayar sekali per tahap. Ketiga lapis test yang diwajibkan Prinsip V tetap dipakai. R7, R10. |

Verifikasi tetap berupa pemeriksaan yang dapat dieksekusi dan dicatat: `snapshot`,
`measure`, `verify`, dan `promote` adalah perintah yang mengembalikan kode keluar,
dan langkah validasinya tercatat di `quickstart.md`. Sesuai Prinsip V, langkah manual
yang belum otomatis dilaporkan sebagai belum terverifikasi, bukan diasumsikan selesai.

Satu-satunya deviasi. Tidak ada perubahan pada API publik, dependensi runtime,
atau struktur lapisan runtime.

## Post-implementation Constitution Check (T054)

Diulang terhadap konstitusi **v1.0.1** setelah seluruh tahap implementasi, bukan
hanya setelah desain. Setiap baris menyebut bukti yang dapat dieksekusi, bukan
persepsi.

| Prinsip / Constraint | Status | Bukti yang dapat dijalankan |
| --- | --- | --- |
| I. Spec-Driven & Contract-First | **LULUS** | Semua artefak ada di `specs/002-.../`. Satu perubahan kontrak terjadi pada sesi ini - `firstSeenRun` pada JSONL laporan menjadi `null` dan lock dibatasi per kapabilitas - dan keduanya **diselaraskan pada perubahan yang sama** di `contracts/report-format.md` serta `contracts/defect-taxonomy.md`, dengan alasannya tercatat pada bagian `## Clarifications` di `spec.md`. Itu persis jalur yang konstitusi tetapkan ("Any behavior change updates the contract in the same commit as the code"). Tidak ada nilai contoh kontrak yang berubah. |
| II. Offline & Static-Only Operation | **LULUS** | Diuji dengan proxy hitam (`HTTP_PROXY=127.0.0.1:9`): `measure --capability stem --scope m` tetap menghasilkan angka yang sama. Hanya `snapshot` yang menyentuh jaringan, dan itu aksi pemelihara. Tidak ada dependensi jaringan runtime maupun build yang baru. |
| III. Runtime Layer Separation | **LULUS** | Diverifikasi dengan `node` yang memindai `src/` dan `tests/`: tidak ada berkas yang mengimpor `tools/` atau membaca payload KBBI. `tsup.config.ts` hanya membuild `src/`; peta `exports` tidak menyebut `tools/`; `package.json` `files` tetap `["dist","NOTICE"]`; `npm pack --dry-run` menghasilkan 20 berkas / 454.891 byte tanpa `.kbbi/` maupun lexicon (dicek otomatis di `scripts/verify-external.mjs`). |
| IV. Deterministic Language Pipeline | **LULUS** | `stem()` tetap murni dan tidak melempar; jalur index dan query tetap berbagi `processToken`. Pengukuran diverifikasi byte-identik: dua kali `measure --capability stem --scope all` menghasilkan `.jsonl` dengan SHA yang sama. Perubahan `stem()` pada sesi ini diukur bersih: 215 kata berubah, 215 membaik, **0 regresi** pada 33.268 kata turunan. |
| V. Test-Gated Quality | **LULUS dengan deviasi yang sama seperti dicatat** | `npm run lint`, `npm run typecheck`, `npm test` (14 berkas, 173 test) semuanya hijau pada perubahan ini. Ketiga lapis test tetap dipakai. Deviasi yang sudah dicatat di Complexity Tracking tetap berlaku dan tidak bertambah. Golden fixture **tidak** diubah, jadi Prinsip V tidak perlu dilonggarkan; assertion
 85% yang mati secara logis justru **dihapus** (T034), bukan dilonggarkan. |
| Constraint: Performance & Scale Budgets | **LULUS** | Tidak menyentuh jalur query maupun build. Pengukuran penuh 33rb + 74rb kata selesai 1-2 detik dari snapshot, jauh di bawah anggaran 30 menit (SC-005). |
| Constraint: Accessibility | **TIDAK BERLAKU** | Tidak ada permukaan UI yang disentuh. Tidak ada `audit-accessibility.md` yang perlu ditulis untuk feature ini, dan tidak ada klaim yang dibuat tentangnya. |
| Constraint: Licensing & Attribution | **LULUS** | Lisensi data ISC memenuhi daftar yang diperbolehkan. Atribusi KBBI ditambahkan ke tabel kapabilitas upstream di `README.md` dan ke entri 6 dan 7 di `NOTICE`, menyebut tag dan blob SHA persis yang dikonsumsi, plus pernyataan eksplisit bahwa datanya tidak pernah ikut terbundel. |
| Development Workflow | **LULUS** | Urutan specify-plan-tasks-implement-verify diikuti; quickstart diperbarui agar cocok dengan perilaku yang benar-benar terimplementasikan (T050) dan seluruh langkahnya dijalankan (T053). |
| Governance | **LULUS** | Constitution Check dicatat di sini dan diulang setelah implementasi. Deviasi Prinsip V tetap tercatat di Complexity Tracking, tidak disembunyikan. |

**Status: LULUS.** Tidak ada pelanggaran yang belum dijelaskan.

### Yang diketahui masih di bawah target, dan mengapa itu bukan pelanggaran

SC-001 (98% akar kata) dan SC-002 (97% pemenggalan) **tidak tercapai**: hasil
terukur 82,57% dan 68,73%. Ini bukan pelanggaran konstitusi, dan bukan juga
kelembagaan yang disembunyikan. `spec.md` sendiri menyatakan kedua angka itu
"plafon yang dikejar algoritma, bukan langkah menuju penyelesaian", dengan
FR-022 sebagai mekanisme yang sah untuk menutup selisih yang tidak dapat
dijelaskan algoritma. Setiap temuan terbuka punya kelas, jumlah, alasan teknis,
dan baseline akurasi saat ditemukan; tidak ada satu pun yang ditutup tanpa
alasan (SC-011, SC-012). Aturan yang menaikkan angka dengan mengorbankan kata
lain diuji dan **ditolak** karena 19 regresi nyata, dan itu tercatat.

Perbaikan yang berhasil justru menunjukkan bahwa plafon itu tidak tercapai karena
batas leksikal, bukan karena tidak ada usaha: perbaikan sisa-imbuhan
menghasilkan 215 perbaikan dengan nol regresi, dan bentuk `balakan` versus
`dempetkan` membuktikan bahwa sisanya tidak dapat dipisahkan tanpa leksikon akar
yang FR-021 larang ikut terbundel.

## Next

Feature selesai diimplementasikan. Tahap perbaikan berikutnya dimulai dengan
`node scripts/kbbi-validate.mjs plan --capability stem --max 20`, yang hanya
memilih temuan yang masih tereproduksi.
