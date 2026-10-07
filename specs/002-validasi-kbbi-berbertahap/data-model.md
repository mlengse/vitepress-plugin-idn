# Data Model: Validasi Kemampuan Bahasa Indonesia terhadap KBBI

**Feature**: 002-validasi-kbbi-berbertahap | **Phase**: 1

Bentuk entitas yang mengalir melalui perkakas. Kontrak rappernya ada di
`contracts/`; dokumen ini hanya mendefinisikan apa-artinya dan aturan validasinya.

## Diagram aliran

```text
  [CDN data-v4]                          (tahap ambil, sekali)
        |
        v
  Snapshot  --->  Corpus kanonik  --->  Perbandingan  --->  Temuan (Defect)
                     |                       |                     |
                     |                       |                     +--> Stage
                     |                       |                             |
                     |                       v                             v
                     +-------------->  Laporan (md + jsonl)        Gerbang regresi
```

Snapshot adalah satu-satunya sumber kebenaran. Setelah ada, tidak ada jalur lain
yang menyentuh jaringan.

---

## 1. Snapshot

 Mewakili dataset yang telah di-pin.

| Field | Tipe | Aturan |
| --- | --- | --- |
| `tag` | string | Selalu `data-v4` pada versi feature ini. Wajib ada. |
| `capturedAt` | string ISO-8601 | Waktu pengambilan, UTC. Wajib ada. |
| `files` | array of `SnapshotFile` | Minimal memuat 2 entri (lexicon + kamus pemenggalan). |
| `entryCount` | object | `{ derived, rootWords, syllables }`. |
| `toolkitVersion` | string | Versi format snapshot, misal `1`. |

### SnapshotFile

| Field | Tipe | Aturan |
| --- | --- | --- |
| `path` | string | Path relatif di dalam repo data, misal `lexicon/derived_to_root_with_kelas.json`. Unik. |
| `blobSha` | string | 40 karakter hex. Menahan tag ke isi persis. |
| `bytes` | number | Ukuran file. |
| `sha256` | string | 64 karakter hex, checksum isi setelah unduh. |

**Validasi**: `blobSha` harus cocok dengan tabel di research R2. Bila tidak
cocok, snapshot ditolak dengan pesan yang menyebut kedua nilai. Ini yang membuat
"tag salah" terdeteksi, bukan menghasilkan pengukuran diam-diam tidak sebanding.

---

## 2. Corpus kanonik

Hasil baca snapshot, sudah dinormalkan. Semua perbandingan berikutnya hanya
memakai bentuk ini (R8).

### CanonicalWord (untuk pengukuran akar kata)

| Field | Tipe | Aturan |
| --- | --- | --- |
| `word` | string | Lowercase, tanpa spasi. Kunci unik. |
| `referenceRoot` | string | Akar dari lexicon. Non-kosong. Bila kata punya beberapa pemetaan, yang dipakai adalah entri teratas sesuai urutan file (keputusan 2026-10-07), sama seperti aturan `cari_kata_dasar`. |
| `kelasKata` | string[] | Dari `derived_to_root_with_kelas.json`. Boleh kosong. |

### CanonicalSyllable (untuk pengukuran pemenggalan)

| Field | Tipe | Aturan |
| --- | --- | --- |
| `word` | string | Lowercase, tanpa spasi. Kunci unik. |
| `referenceSyllables` | string[] | Pemenggalan KBBI, tanda titik diubah ke tanda hubung, huruf kapital diturunkan. Minimal 1 elemen. |
| `stratum` | `"core"` \| `"loan"` | Core = fonotaktik Indonesia; loan = memuat onset non-Indonesia. |

### Aturan kanonik (WAJIB, R8)

1. Whole input `toLowerCase()`.
2. Spasi di luar dihapus.
3. Tanda pisah pada pemenggalan diseragamkan menjadi `-`.
4. Tanda hubung pada kata majemuk (`abu-abo`) **dipertahankan** sebagai pemisah.
5. Reduplikasi (`ayam-ayaman`) dipertahankan utuh dan tidak dipecah.

**Kegagalan yang harus dicegah**: bentuk kanonik adalah tempat dua temuan
palsu paling mahal tinggal. Tanpa aturan 1, entri `"atlantik": "At.lan.tik"`
menghasilkan temuan palsu. Tanpa aturan 4, `abu-abo` salah dihitung sebagai
satu kata. Tanpa aturan 5, `ayam-ayaman` dibandingkan sebagai kata majemuk.

### Penentuan stratum (R5)

Kata masuk `loan` bila pemenggalan KBBI memuat satu dari onset
`kn`, `kw`, `kh`, `gh`, `ph`, `ps`, `sy`, `tr`, `tw`, `bl`, `br`, `dr`, `fl`,
`fr`, `gl`, `gr`, `str`, `spr`, `skr`, `skl`, `spl`.

Selain itu, kata lain masuk `core`. Ini persis daftar onset yang dipakai
`src/core/syllabify.ts:32` dan `:62`, jadi klasifikasi mencerminkan asumsi
algoritme yang sedang diuji, bukan daftar bahasa lain.

SC-002 hanya dihitung pada stratum `core`.

---

## 3. Pengukuran (Measurement)

| Field | Tipe | Aturan |
| --- | --- | --- |
| `id` | string | `stem` atau `syllable`. Menentukan kapabilitas. |
| `scope` | string | Huruf awal (`"m"`) atau `"*"` untuk seluruh corpus. |
| `snapshotTag` | string | Wajib, disalin dari snapshot. |
| `startedAt` / `finishedAt` | string ISO-8601 | Wajib. |
| `totals` | object | `{ tested, matched, mismatched, referenceMissing, excluded }`. |
| `accuracy` | number | `matched / tested`, hanya untuk yang `tested > 0`. |
| `byLetter` | object | Pecahan per huruf (FR-020). |
| `byKelasKata` | object | Pecahan per kelas kata (FR-020). |
| `byStratum` | object | Pecahan `core` dan `loan`; hanya untuk `syllable`. |

**Aturan**: `totals.tested + totals.referenceMissing + totals.excluded`
harus sama dengan jumlah kata dalam cakupan. Pelanggaran = bug pada perkakas.

`accuracy` hanya dihitung bila `tested > 0`; tanpa itu `null`, bukan `0`
(FR-016 melarang melaporkan angka menyesatkan).

---

## 4. Temuan (Defect)

Satu baris JSONL. Inilah "daftar temuan" pada FR-002.

| Field | Tipe | Aturan |
| --- | --- | --- |
| `word` | string | Lowercase. Kunci unik per kombinasi `id` + `word`. |
| `capability` | `"stem"` \| `"syllable"` | Wajib. |
| `pluginOutput` | string | Hasil fungsi plugin. Boleh string kosong bila fungsi mengembalikan kosong. |
| `referenceOutput` | string | Nilai KBBI kanonik. |
| `class` | string | Salah satu dari taksonomi di bagian 5. |
| `stratum` | `"core"` \| `"loan"` \| `null` | Untuk `syllable`. `null` untuk `stem`. |
| `kelasKata` | string[] | Untuk `stem`. |
| `source` | string | `"snapshot"` atau `"mcp"`. |
| `triageNote` | string | **Wajib** bila `class` = `data-divergence` (FR-006), atau bila `contractLocked` bernilai true. |
| `contractLocked` | boolean | True bila perbaikannya mengubah hasil yang tertuang dalam kontrak, golden fixture, atau `OVERRIDES`. Membebanan pembaruan kontrak, bukan memblokirnya (FR-023). Default `false`. |
| `status` | `"open"` \| `"fixed"` \| `"dismissed"` | Default `open`. |
| `stage` | string \| null | Tahap tempat ia diperbaiki. `null` bila `open`. |
| `firstSeenRun` | string | Id pengukuran saat pertama ditemukan. |

**Idempotensi (FR-005)**: menjalankan pengukuran cakupan yang sama tidak boleh
menambah baris duplikat. Kunci idempotensi adalah
`(capability, word, referenceOutput)`. Bila kata yang sama muncul lagi dengan
akar referensi berbeda, itu temuan baru dan baris baru dibuat.

**Contoh baris**:

```json
{
  "word": "memdoctoral",
  "capability": "stem",
  "pluginOutput": "doktor",
  "referenceOutput": "doktoral",
  "class": "affix-strip-missed",
  "stratum": null,
  "kelasKata": ["v"],
  "source": "snapshot",
  "triageNote": "Sufiks -al belum dilepas; awalan me- sudah benar",
  "status": "open",
  "stage": null,
  "contractLocked": false,
  "firstSeenRun": "stem-m-20261007T204500Z"
}
```

---

## 5. Taksonomi cacat (R9)

Spesifikasi lengkap ada di `contracts/defect-taxonomy.md`. Ringkasnya:

| Kelas | Dihitung kegagalan? | Arti |
| --- | --- | --- |
| `reference-missing` | Tidak | Kata tidak ada di snapshot. |
| `root-word-self` | Tidak, dihitung **cocok** | Kata dasar sah tanpa pemetaan. |
| `plural-root` | Ya | Akar plugin terlalu pendek akibat imbuhan jamak. |
| `affix-strip-missed` | Ya | Imbuhan tidak dilepas plugin. |
| `over-stripped` | Ya | Plugin melepas lebih dari seharusnya. |
| `syllable-boundary-shift` | Ya | Jumlah suku kata sama, batas berbeda. |
| `syllable-count-diff` | Ya | Jumlah suku kata berbeda. |
| `data-divergence` | Tidak | Selisih data yang dijelaskan. |
| `candidate-bug` | Ya | Tidak cocok aturan pola, di corpus inti. |

`reference-missing` dan `root-word-self` adalah dua hal yang FR-003
mensyaratkan tidak dihitung sebagai kegagalan.

---

## 6. Kasus Regresi

Turunan dari temuan yang sudah berstatus `fixed`.

| Field | Tipe | Aturan |
| --- | --- | --- |
| `word` | string | Sama persis dengan `Defect.word`. |
| `capability` | string | Sama dengan `Defect.capability`. |
| `expected` | string | Hasil yang dianggap benar, setelah kasus diuji. |
| `defectClass` | string | Kelas cacat asal. |
| `stage` | string | Tahap saat diperbaiki. |
| `note` | string | Alasan singkat. |

**Aturan kelengkapan (FR-009)**: setiap `Defect` dengan `status = "fixed"`
**wajib** punya satu `RegressionCase`. Gerbang tahap menolak tahap tanpa
pasangan ini.

Fixture yang dikomit (`tests/fixtures/kbbi-regression-*.json`) adalah bentuk
kasus regresi yang sama dalam bentuk array `[word, expected]`, mengikuti
`stem-golden.json`. Bentuk penuh dengan metadata tetap tinggal di `.kbbi/`.

---

## 7. Tahap Perbaikan (Stage)

| Field | Tipe | Aturan |
| --- | --- | --- |
| `id` | string | `stage-01`, `stage-02`, dst. Berurutan. |
| `createdAt` | string ISO-8601 | Wajib. |
| `defects` | string[] | Kata yang dikerjakan. Panjang **<= 20** (SC-003). |
| `baselineAccuracy` | object | `{ stem, syllable }` sebelum perbaikan. |
| `finalAccuracy` | object | Sesudah perbaikan. |
| `regressions` | string[] | Kasus regresi yang kembali gagal. |
| `status` | `"passed"` \| `"failed"` \| `"in-progress"` | Default `in-progress`. |
| `gatesRun` | string[] | `"npm test"`, `"npm run lint"`, `"npm run typecheck"`. |

**Aturan status (FR-010)**: `passed` hanya bila **ketiga** syarat terpenuhi:

1. `regressions` kosong.
2. `finalAccuracy.stem >= baselineAccuracy.stem` dan
   `finalAccuracy.syllable >= baselineAccuracy.syllable`.
3. Seluruh gerbang pada `gatesRun` lulus.

Melanggar salah satu → `failed`, dan temuan tahap itu dikembalikan ke `open`.

---

## Relasi

```text
Snapshot 1 --- 1..* Measurement
Measurement 1 --- 0..* Defect
Defect 1 --- 0..1 RegressionCase   (wajib bila status = "fixed")
Defect * --- 0..1 Stage
Stage 1 --- 0..* RegressionCase    (regresi yang terdeteksi)
```

## Aturan yang berlaku lintas entitas

1. **Determinisme (FR-013)**: snapshot yang sama + kode yang sama menghasilkan
   `Measurement` yang identik. Tidak ada `Date.now()` di jalur yang memengaruhi
   angka; `capturedAt` hanya masuk ke metadata snapshot.
2. **Tidak ada jaringan setelah snapshot (FR-012)**: `Corpus` dibangun sepenuhnya
   dari berkas lokal. MCP bersifat opsional dan kegagalannya tidak boleh
   memengaruhi hasil pengukuran.
3. **Data tidak pernah masuk paket (FR-018)**: seluruh entitas di atas hanya
   hidup di `.kbbi/`, kecuali `RegressionCase` yang disalin ke
   `tests/fixtures/` dalam bentuk kurasi.
4. **Angka tidak pernah mengarang**: `accuracy` null bila `tested = 0`;
   `referenceMissing` tidak pernah masuk pembilang.
