# Quickstart: Validasi KBBI

**Feature**: 002-validasi-kbbi-berbertahap

Panduan menjalankan dan memvalidasi perkakas. Dokumen ini **bukan** panduan
implementasi - kode ada di `tools/kbbi/` dan entry point-nya
`scripts/kbbi-validate.mjs`.

Dokumen ini diselaraskan dengan perilaku yang benar-benar terimplementasi pada
2026-10-07 (T050). Angka di bawah bukan placeholder: semuanya hasil pengukuran
nyata dari snapshot `data-v4`.

## Prasyarat

| Kebutuhan | Keterangan |
| --- | --- |
| Node.js 22.18+ | `node --version`. Perkakas.internal memakai *type stripping* bawaan Node. Paket yang dipublikasikan sendiri tetap mendukung Node >= 20; batasan ini hanya berlaku untuk perkakas validasi. |
| Dependensi terpasang | `npm install` sudah dijalankan |
| Jaringan | **Hanya** untuk langkah 1. Setelah itu tidak perlu. |
| MCP | **Opsional.** Pengukuran penuh tidak memerlukannya. |

Verifikasi cepat:

```bash
node --version      # harus >= 22.18
npm --version
```

## Langkah 1 - Ambil snapshot (sekali)

```bash
node scripts/kbbi-validate.mjs snapshot
```

Yang terjadi: tag `data-v4` dibaca sebagai pohon Git, setiap blob SHA dibandingkan
dengan tabel di `specs/002-validasi-kbbi-berbertahap/research.md`, lalu enam
berkas diunduh dari `kbbi-harvester-cdn@data-v4`, di-checksum, dan manifest
ditulis ke `.kbbi/snapshot/data-v4/manifest.json`.

**Bila blob SHA tidak cocok**, snapshot **ditolak** dengan pesan yang menyebut
nilai yang diharapkan dan yang ditemukan. Itu yang menangkap kasus tag salah;
melanjutkan dengan data yang tidak terverifikasi tidak ada jalurnya.

**Hasil yang diharapkan**:

```text
lexicon/derived_to_root_with_kelas.json: 2.756.704 bytes, sha256 6c1b55b9f2c1
...
Snapshot data-v4 tersimpan: 6 berkas.
Entri: 33268 kata turunan, 11170 kata dasar, 73768 entri pemenggalan.
```

Sekitar 4,9 MB. Perintah ini idempoten: snapshot yang checksum-nya sudah cocok
tidak diunduh ulang.

## Langkah 2 - Ukur akar kata (batch kecil)

Mulai dari satu huruf agar cepat:

```bash
node scripts/kbbi-validate.mjs measure --capability stem --scope m
```

**Hasil yang diharapkan**: dua berkas di `.kbbi/reports/`:

```text
stem-m-20261007T171246Z.md
stem-m-20261007T171246Z.jsonl
```

Memo ini hanya melaporkan kegagalan, ditambah blok ringkasan yang memuat
`Snapshot`, `Cardinality`, `Cakupan`, `Dijalankan`, dan `Akurasi`.

**Cek cepat** - buka markdown dan pastikan:

1. Kepala memuat `data-v4` beserta blob SHA.
2. `Diuji` lebih besar dari nol.
3. `Akurasi` ada dan berformat persen Indonesia (misal `82,44%`).
4. `Di luar cakupan` punya rincian per alasan (`compound-or-reduplication`,
   `stratum-loan`), sehingga tidak ada kata yang hilang diam-diam.

## Langkah 3 - Ukur pemenggalan

```bash
node scripts/kbbi-validate.mjs measure --capability syllable --scope m
```

**Perhatikan**: laporan pemenggalan memuat blok `Per stratum` yang laporan akar
kata tidak punya. Angka yang jadi acuan ada di baris `core`.

Kata berstratum `loan` **tidak pernah** menjadi temuan dan tidak pernah
menggagalkan gerbang; angka mereka tetap dilaporkan untuk transparansi (R5).

## Langkah 4 - Ukur seluruh corpus

```bash
node scripts/kbbi-validate.mjs measure --capability stem --scope all
node scripts/kbbi-validate.mjs measure --capability syllable --scope all
```

Waktu yang diharapkan: **di bawah 30 menit** untuk keduanya dari snapshot
(SC-005). Pada mesin pengembangan beide perintah selesai dalam **1-2 detik**.

Baseline yang tercatat pada 2026-10-07:

| Kapabilitas | Diuji | Akurasi | Target SC |
| --- | --- | --- | --- |
| `stem` | 29.865 | 82,57% | 98% |
| `syllable` (inti) | 65.653 | 68,73% | 97% |

Kedua angka masih **di bawah** plafonnya, dan itu memang hasil yang
direkamkan: selisih yang tersisa butuh kamus akar KBBI yang tidak boleh ikut
terbundel (FR-021), sehingga dicatat sebagai keterbatasan diketahui beserta
alasannya (FR-022, SC-012), bukan dikoreksi dengan menebak.

## Langkah 5 - Uji determinisme

Ini yang membedakan pengukuran nyata dari angka yang kebetulan cocok.

```bash
node scripts/kbbi-validate.mjs measure --capability stem --scope m
```

**Hasil yang diharapkan**: berkas `.jsonl` yang baru **identik byte per byte**
dengan yang sebelumnya; hanya blok waktu pada markdown yang berbeda.

Bila JSONL berbeda antara dua kali jalan, ada yang salah: perkakas memakai
waktu, acak, atau urutan yang tidak stabil. Ini melanggar FR-013.

## Langkah 6 - Uji tanpa jaringan

Putuskan jaringan (matikan Wi-Fi atau nonaktifkan adapter), lalu:

```bash
node scripts/kbbi-validate.mjs measure --capability stem --scope m
```

**Hasil yang diharapkan**: berhasil, dengan angka identik pada Langkah 5.
Inilah bukti FR-012 terpenuhi. Hanya perintah `snapshot` yang menyentuh
jaringan; tidak ada jalur lain.

## Langkah 7 - Uji lanjutan setelah pengukuran terhenti (FR-015)

Pengukuran menyimpan titik lanjutan di
`.kbbi/reports/<kapabilitas>-<cakupan>.checkpoint.json` setiap 500 kata. Bila
pengukuran terhenti, jalankan perintah yang sama lagi: ia melanjutkan dari kata
terakhir yang selesai, bukan mengulang dari awal, dan kata yang belum sempat
diproses **tidak pernah** tercatat sebagai gagal.

**Hasil yang diharapkan**: kepala laporan resumed memuat blok

```markdown
> **PENGUKURAN DILANJUTKAN.** 1.891 kata sudah selesai pada run sebelumnya; ...
```

dan checkpoint dihapus setelah run selesai. Angka pada laporan yang dilanjutkan
hanya mencakup sisa kata - jalankan ulang tanpa checkpoint bila butuh angka
penuh. Laporan yang **terhenti** ditandai `PENGUKURAN TERPUTUS` dengan
`partial: true`, dan totalnya dilarang dipakai sebagai angka final.

## Langkah 8 - Bentuk tahap perbaikan

```bash
node scripts/kbbi-validate.mjs plan --capability stem --max 20
```

**Hasil yang diharapkan**: `.kbbi/stages/stage-01.json` dengan paling banyak 20
temuan, semuanya berstatus `open`, dan `capability` bernilai `stem`.

`plan` **memverifikasi ulang** setiap temuan: temuan yang sudah tidak lagi
terproduksi karena kodenya diperbaiki dilewati, sehingga tahap tidak pernah
berisi kata yang mustahil diperbaiki. Urutan picks alfabetis dan deterministik.

Perintah menolak `--max` di atas 20 (SC-003).

## Langkah 9 - Perbaiki dan verifikasi

1. Perbaiki algoritma di `src/core/stem.ts` untuk temuan pada tahap.
2. Ukur ulang cakupan yang sama (`measure --capability stem --scope all`).
3. Jalankan gerbang repositori dan catat hasilnya:

```bash
node scripts/kbbi-validate.mjs record --stage stage-01 --gate "npm test" --result pass
node scripts/kbbi-validate.mjs record --stage stage-01 --gate "npm run lint" --result pass
node scripts/kbbi-validate.mjs record --stage stage-01 --gate "npm run typecheck" --result pass
node scripts/kbbi-validate.mjs record --stage stage-01 --gate "build-full" --result pass
```

4. Verifikasi tahap:

```bash
node scripts/kbbi-validate.mjs verify --stage stage-01
```

**Hasil yang diharapkan**: `status: "passed"` bila G1, G2, dan G3 terpenuhi
(lihat `contracts/stage-workflow.md`). `verify` sendiri menjalankan ulang kasus
regresi dan pemeriksaan cepat pencarian tingkat 1, lalu mencatat hasilnya
sebagai gerbang `search-unit`.

**Bila `failed`**: periksa `regressions` dan `finalAccuracy` di berkas tahap.
Temuannya kembali ke `open`.

## Langkah 10 - Tutup temuan yang tidak bisa diperbaiki

Tidak semua temuan bisa diperbaiki tanpa melanggar FR-021. Untuk yang seperti itu,
tutup dengan alasan teknis yang tercatat - jangan dibiarkan terbuka tanpa
penjelasan (FR-022, SC-012):

```bash
node scripts/kbbi-validate.mjs dismiss --stage stage-01 \
  --word "adukan, balakan" \
  --reason "Engine memotong -kan (adukan -> adu) sementara KBBI menaruh akar pada aduk. Bentuk balakan dan dempetkan identik secara struktural; aturannya merusak 19 kata lain. Butuh kamus akar KBBI yang dilarang terbundel. Baseline stem 82,57%."
```

Kata yang ditutup tidak dipromosikan dan tidak menjadi kasus regresi.

## Langkah 11 - Promosi jadi kasus regresi

```bash
node scripts/kbbi-validate.mjs promote --stage stage-01
```

**Hasil yang diharapkan**: temuan berstatus `fixed`, kasus regresi tercatat di
`.kbbi/defects/regression-cases.json`, dan **fixture kurasi** terperbarui:

```text
tests/fixtures/kbbi-regression-stem.json
tests/fixtures/kbbi-regression-syllable.json
```

Perintah ini **ditolak** bila:

- tahap belum `passed` (verify tidak bisa dilewati), atau
- masih ada temuan yang **masih tereproduksi** - `promote` tidak akan pernah
  mengubah kata yang masih salah menjadi kasus regresi permanen, atau
- ada temuan `contract-locked` yang kontraknya belum diselaraskan; sebutkan
  berkasnya dengan `--contract-updated contracts/public-api.md`.

## Langkah 12 - Pastikan tidak ada yang bocor ke paket

Setelah semua tahap, paket yang dipublikasikan harus tetap seperti semula:

```bash
npm run build
npm run verify:external
```

`verify:external` menjalankan build `ui: 'external'` seperti biasa, lalu
menambahkan pemeriksaan `npm pack --dry-run` yang menolak Presence direktori
`.kbbi/` maupun lexicon KBBI di dalam paket (SC-008, FR-018).

## Langkah 13 - Gerbang repositori

Sebelum menutup tahap:

```bash
npm run lint
npm run typecheck
npm test
```

`npm test` membangun playground sekali lewat `tests/global-setup.ts`, jadi
sedikit lebih lambat dari test biasa. Perkakas pengukuran sendiri **tidak** ada
di jalur ini (R7). Test `tests/unit/test_kbbi_search_regression.test.ts` selalu
menyertakan pemeriksaan cepat tingkat 1 (FR-019), sehingga tidak perlu build
tambahan.

## Langkah 14 - Tutup temuan non-kegagalan dan nyatakan selesai

Temuan berkelas `reference-missing`, `data-divergence`, dan `root-word-self`
tidak bisa masuk tahap perbaikan (bukan kegagalan). Tutup temuan seperti itu
dengan perintah `triage` beserta alasan, tanpa membuat tahap (FR-022):

```bash
node scripts/kbbi-validate.mjs triage \
  --capability syllable \
  --class reference-missing \
  --reason "Kata tidak ditemukan di kamus pemenggalan KBBI. Bukan kegagalan plugin."
```

Perintah `triage` menolak dijalankan tanpa `--reason`. Bentuk perintah lengkap,
parameter, dan aturan penolakannya ada di
`specs/003-close-validation-workflow/contracts/triage-command.md`.

Spec 002 dinyatakan **selesai** bila seluruh temuan berstatus `fixed` atau
`dismissed` (tidak ada temuan `open`), dan akurasi terakhir tercatat sebagai
plafon terakhir. SC-001/SC-002 adalah plafon yang dikejar, bukan gerbang
penghalang. Kriteria selesai lengkap ada di bagian **Kriteria Selesai** pada
`spec.md`.

## Pengukuran opsional lewat MCP

Bila tool MCP `kbbi-mcp-server` dikonfigurasi:

```bash
# stdio
KBBI_MCP_COMMAND="npx -y kbbi-mcp-server" node scripts/kbbi-validate.mjs sample --capability stem --size 50
# atau HTTP
KBBI_MCP_URL="https://example.invalid/mcp" node scripts/kbbi-validate.mjs sample --capability stem --size 50
```

Tujuannya mendeteksi penyimpangan pembaca lexicon: hasilnya adalah daftar kata
yang tidak cocok antara pengukuran massal dan `cari_kata_dasar`.

**Bila MCP tidak dikonfigurasi**: perintah ini gagal dengan pesan yang menyebut
dua variabel lingkungan di atas dan menawarkan jalur snapshot, **tanpa**
menampilkan angka kecocokan apa pun (FR-016). Jalur bulk tidak pernah memanggil
MCP, jadi ketidakhadirannya tidak memengaruhi hasil pengukuran lain.

## Perintah yang tersedia

| Perintah | Jaringan? | Kegunaan |
| --- | --- | --- |
| `snapshot` | Ya | Mengambil dan memverifikasi dataset. |
| `measure` | Tidak | Mengukur dan menulis laporan. |
| `sample` | Ya, opsional | Verifikasi silang lewat MCP. |
| `plan` | Tidak | Membentuk tahap dari temuan terbuka yang masih tereproduksi. |
| `record` | Tidak | Mencatat hasil satu gerbang manual. |
| `verify` | Tidak | Menjalankan G1-G3 sebuah tahap. |
| `dismiss` | Tidak | Menutup temuan **di dalam tahap** dengan alasan teknis tercatat (FR-022). |
| `triage` | Tidak | Menutup temuan non-kegagalan tanpa keanggotaan tahap, dengan alasan tercatat. |
| `promote` | Tidak | Menandai temuan jadi kasus regresi. |
| `revert` | Tidak | Mengembalikan temuan tahap ke `open`. |
| `status` | Tidak | Menampilkan akurasi terakhir tiap kapabilitas dan daftar tahap. |

## Pemecahan masalah

| Gejala | Penyebab | Tindakan |
| --- | --- | --- |
| `snapshot tidak ditemukan` | Langkah 1 belum dijalankan | Jalankan `snapshot` |
| `blobSha tidak cocok` | Tag salah atau data berubah | Ambil ulang, cek tag `data-v4` |
| `sha256 tidak cocok` | Unduhan terputus | Hapus `.kbbi/snapshot/` dan ulangi |
| `Akurasi tidak diukur` | `Diuji` bernilai nol di cakupan itu | Cakupan terlalu sempit, perkirakan huruf lain |
| `PENGUKURAN TERPUTUS` | Pengukuran terhenti di tengah | Angka bukan final; ulangi setelah penyebabnya beres |
| `tahap ditolak: > 20 temuan` | `--max` melebihi batas | Turunkan `--max` (SC-003) |
| `tahap ditolak: satu kapabilitas` | Campur akar kata dan pemenggalan | Satu tahap per kapabilitas |
| `promote ditolak: masih tereproduksi` | Perbaikan belum efektif | Perbaiki dulu, atau `dismiss` dengan alasannya |
| `promote ditolak: contract-locked` | Kontrak/fixture belum diselaraskan | Perbarui kontrak, test, dan `## Clarifications` di `spec.md`, lalu `--contract-updated` |
| `promote ditolak: status` | Tahap belum `passed` | Jalankan `verify` lebih dulu |
| `node scripts/kbbi-validate.mjs` gagal di awal | Node < 22.18 | Perbarui Node; paket sendiri tetap jalan di Node >= 20 |

## Rujukan

| Dokumen | Isi |
| --- | --- |
| `spec.md` | Persyaratan FR-001 s.d. FR-023, SC-001 s.d. SC-014, dan bagian Clarifications |
| `research.md` | Keputusan desain R1 s.d. R12 beserta alasannya |
| `data-model.md` | Entitas dan aturan validasinya |
| `contracts/snapshot-format.md` | Bentuk manifest dan verifikasi blob SHA |
| `contracts/report-format.md` | Bentuk laporan md dan JSONL |
| `contracts/defect-taxonomy.md` | Taksonomi cacat dan aturan triase |
| `contracts/stage-workflow.md` | Gerbang G1-G3 dan siklus tahap |
| `../003-close-validation-workflow/contracts/triage-command.md` | Perintah `triage` untuk menutup temuan non-kegagalan |