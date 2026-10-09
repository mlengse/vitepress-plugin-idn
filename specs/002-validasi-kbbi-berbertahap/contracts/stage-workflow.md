# Contract: Siklus Hidup Tahap Perbaikan

**Feature**: 002-validasi-kbbi-berbertahap | **Versi**: 1

Menetapkan bagaimana temuan diperbaiki bertahap tanpa regresi. Ini kontrak
yang paling penting, karena itulah inti kata "bertahap" pada spec.

## Siklus hidup

```text
  temuan terbuka
      |
      |  pilih (n <= 20, satu kapabilitas per tahap)
      v
  tahap:in-progress  -- verifikasi gagal -->  tahap:failed
      |                                        |
      | verifikasi lulus                        | temuan kembali ke open
      v                                        v
  tahap:passed  -->  semua temuan jadi kasus regresi
```

## Membentuk satu tahap

| Field | Tipe | Aturan |
| --- | --- | --- |
| `id` | string | `stage-01`, berurutan tanpa celah. |
| `createdAt` | ISO-8601 UTC | Wajib. |
| `capability` | `"stem"` \| `"syllable"` | **Satu saja per tahap.** |
| `defects` | string[] | Kata yang dikerjakan. |
| `baselineAccuracy` | object | `{ stem, syllable }` sebelum. |
| `finalAccuracy` | object | Sesudah. |
| `regressions` | string[] | Kasus regresi yang kembali gagal. |
| `gatesRun` | string[] | `"npm test"`, `"npm run lint"`, `"npm run typecheck"`, dan `"build-full"` untuk verifikasi build penuh akhir tahap. |
| `status` | `"in-progress"` \| `"passed"` \| `"failed"` | Default `in-progress`. |

Lokasi: `.kbbi/stages/<id>.json`.

## Batas tahap (SC-003)

1. `defects.length` **<= 20**. Melebihi → perintah menolak membuat tahap.
2. Satu tahap hanya satu kapabilitas. Akar kata dan pemenggalan punya
   penyebab yang berbeda dan tidak boleh dicampur dalam satu batch.
3. Hanya temuan dengan `class` yang dihitung kegagalan boleh masuk tahap.
   `data-divergence` ditutup lewat triase, bukan lewat perbaikan kode (FR-022).

## Penutupan temuan non-kegagalan lewat triase

**Amendmen 2026-10-10.** Ditambahkan oleh feature `003-close-validation-workflow`
(FR-001, FR-002) lewat proses amendmen spec.

Kelas `reference-missing`, `data-divergence`, dan `root-word-self` tidak pernah
dihitung sebagai kegagalan, sehingga tidak pernah masuk tahap perbaikan kode dan
tidak punya `stage`. Temuan seperti itu ditutup lewat perintah `triage`, yang
tidak mensyaratkan keanggotaan tahap (`stage: null`) selama alasannya tercatat
(FR-022, SC-011).

`dismiss` yang lama tetap berlaku hanya untuk temuan yang **di dalam** sebuah
tahap; `triage` adalah jalur penutup untuk temuan yang tidak pernah masuk tahap.
Bentuk perintah, parameter, dan aturan penolakannya ditetapkan di
`specs/003-close-validation-workflow/contracts/triage-command.md`.

## Gerbang kelulusan (FR-010)

`status = "passed"` hanya bila **ketiganya** terpenuhi:

| # | Syarat |
| --- | --- |
| G1 | `regressions` kosong. |
| G2 | `finalAccuracy.stem >= baselineAccuracy.stem` dan `finalAccuracy.syllable >= baselineAccuracy.syllable`. |
| G3 | Semua entri `gatesRun` lulus, termasuk satu entri `build-full` untuk verifikasi build penuh tingkat 2 (FR-019, SC-014). |

**Bila salah satu gagal**:
- `status = "failed"`.
- Seluruh temuan pada tahap itu kembali ke `open`.
- `stage` pada temuan dikosongkan.
- Kasus regresi yang dibuat untuk tahap ini **ditarik** bila tidak lagi berlaku.
- Tidak ada informasi yang hilang: kegagalan dicatat, bukan dihapus.

**Perhatikan G2**: akurasi harus **tidak turun**. Ini bukan berarti tidak boleh
naik lebih pada tahap mana pun; ini berarti satu tahap yang menurunkan akurasi
di kapabilitas lain juga dianggap gagal.

## Kasus regresi (FR-009)

Setiap temuan yang `status = "fixed"` **wajib** punya satu `RegressionCase`.
Gerbang menolak tahap `passed` bila ada temuan `fixed` tanpa pasangan.

| Field | Tipe | Aturan |
| --- | --- | --- |
| `word` | string | Sama persis dengan temuan. |
| `capability` | string | Sama dengan temuan. |
| `expected` | string | Hasil yang dianggap benar. |
| `defectClass` | string | Kelas cacat asal. |
| `stage` | string | Tahap saat diperbaiki. |
| `note` | string | Alasan singkat. |

### Bentuk yang dikomit

RegressionCase yang disalin ke `tests/fixtures/kbbi-regression-*.json` memakai
bentuk array yang sama dengan `stem-golden.json` yang sudah ada:

```json
[
  ["memdoctoral", "doktoral"],
  ["bukunya", "buku"]
]
```

Bentuk penuh dengan metadata tetap tinggal di `.kbbi/`. Fixture yang dikomit
adalah **kasus regresi** saja, bukan temuan yang belum diperbaiki (R3).

### Penarikan kasus regresi

Bila sebuah kasus regresi menjadi tidak relevan karena referensi berubah, ia
**tidak** dihapus diam-diam. Ia ditandai `withdrawn` dengan alasan, dan
baselineAccuracy dicatat ulang. Menghapus tanpa catatan melanggar FR-022.

## Verifikasi pencarian (FR-019) dua tingkat

Verifikasi pencarian berjalan pada dua tingkat (keputusan 2026-10-07).

| Tingkat | Kapan | Isi |
| --- | --- | --- |
| 1. Cepat | Setiap `npm test` | Memeriksa bahwa setiap kasus regresi akar kata tetap menemukan dokumen yang diharapkan, tanpa build playground. |
| 2. Build penuh | Sekali pada akhir tiap tahap | Build playground penuh, ditambah assertions yang sama seperti pada tingkat 1. |

Kegagalan pada salah satu tingkat diperlakukan sama dengan G1: tahap gagal.

**Alasan tingkat 1 ada.** `tests/global-setup.ts` menjalankan
`npx vitepress build playground` pada setiap kali test jalan. Menaruh verifikasi
pencarian penuh di sana akan membuat setiap percobaan perbaikan kecil
menanggung build penuh. Tingkat 1 membuat perulangan perbaikan cepat; tingkat 2
memenuhi kewajiban lapisan integrasi dari konstitusi sekali per tahap, bukan
sekali percobaan.

Pengukuran akar kata yang tidak mengubah apa pun pada pipeline **tidak**
diperbolehkan hanya karena "kebetulan tidak merusak apa pun". FR-019 meminta
pembuktian, bukan keyakinan.

## Perintah yang dipakai

Perkakas menyediakan operasi berikut. Tidak ada perintah yang dapat
menyelesaikan tahap secara otomatis (Batasan Cakupan di spec).

| Operasi | Akibat |
| --- | --- |
| `plan` | Membuat tahap dari N temuan terbuka. |
| `verify` | Menjalankan gerbang G1-G3 dan menulis status. |
| `promote` | Menandai temuan jadi kasus regresi, hanya bila tahap `passed`. |
| `triage` | Menutup temuan non-kegagalan tanpa keanggotaan tahap, dengan alasan tercatat. |
| `revert` | Mengembalikan temuan tahap ke `open` bila tahap `failed`. |
| `record` | Menulis hasil verifikasi manual (lint, typecheck, test). |

`promote` **dilarang** jalan bila tahap belum `passed`. Ini tidak dapat
dilewati karena penyimpanannya berurutan: `promote` memeriksa `status` di
disStage.

## Urutan yang wajib

1. `plan` → 2. perbaiki kode → 3. `verify` → 4. `promote`

Melewati `verify` dan langsung `promote` akan ditolak dengan pesan yang menyebut
status tahap saat ini.

## Temuan `contract-locked` diperbolehkan, dengan beban pembaruan kontrak

Diselaraskan dengan Clarifications sesi 2026-10-07 di `spec.md`: KBBI menang.
Perintah `plan` **tidak** menolak temuan `contract-locked`. Yang ada adalah kewajiban
menyelaraskan kontrak pada perubahan yang sama.

### Yang wajib dikerjakan sebagai satu paket

| Langkah | Isi |
| --- | --- |
| 1 | Perbaiki algoritme di `src/core/`. |
| 2 | Perbarui `contracts/public-api.md` bila tabel contoh kontrak ikut berubah. |
| 3 | Perbarui golden fixture bila kata yang di dalamnya ikut berubah. |
| 4 | Tambahkan satu entri alasan pada bagian `## Clarifications` di `spec.md`. |
| 5 | Jalankan `verify`, lalu `promote`. |

Langkah 1 tanpa langkah 2 dan 4 **tidak akan lulus** di gerbang `promote`.
Pesan penolakan menyebut kontrak atau fixture mana yang belum diselaraskan.

### Batas yang tetap berlaku

- `.specify/memory/constitution.md` dan berkas di `.specify/templates/` tidak
  pernah ditulis ulang sebagai efek samping perbaikan.
- Golden fixture hanya diubah sebagai bagian dari langkah 3, dengan alasan
  tercatat, bukan sebagai efek samping dari test yang gagal.
- Kontrak yang diperbarui harus tetap punya test yang mengaturnya. Kontrak
  tanpa test adalah pelanggaran Prinsip I yang lebih buruk daripada kontrak usang.

### Contoh

KBBI memberi `syllabify('pemerintahan')` sebagai `pem.per.fi.nan`, sementara
kontrak mengunci `pe-mer-in-ta-han`. Karena KBBI menang:

1. Hapus atau sesuaikan entri `OVERRIDES` di `src/core/syllabify.ts`.
2. Perbarui contoh di `contracts/public-api.md` menjadi nilai baru.
3. Perbarui assertion di `tests/unit/test_syllabify.test.ts`.
4. Catat alasannya di bagian Clarifications pada `spec.md`.
