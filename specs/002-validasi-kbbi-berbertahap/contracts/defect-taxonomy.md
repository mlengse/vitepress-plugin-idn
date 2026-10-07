# Contract: Taksonomi Cacat dan Aturan Triase

**Feature**: 002-validasi-kbbi-berbertahap | **Versi**: 1

Menetapkan bagaimana satu selisih menjadi satu **kelas**. Tanpa ini, FR-003 dan
FR-006 tidak dapat diverifikasi: tidak ada cara objektif membedakan "bug plugin"
dari "selisih data", dan alasan triase menjadi penilaian subjektif.

## Prinsip

Aturan dijalankan **berurutan**. Kelas pertama yang cocok menang. Tidak ada
percobaan ulang dengan aturan lain, dan tidak ada skor yang menggabungkan.

## Aturan kanonik lebih dulu

Sebelum klasifikasi, kedua sisi dinormalkan ke bentuk kanonik (R8):

| Sisi | Sumber | Bentuk kanonik |
| --- | --- | --- |
| Plugin akar kata | `stem(word)` | Huruf kecil, tanpa spasi. |
| Referensi akar kata | `derived_to_root_with_kelas.json` | `kataDasar`, huruf kecil. |
| Plugin pemenggalan | `syllabify(word)` | Huruf kecil, tanda pisah `-`. |
| Referensi pemenggalan | `kbbi_vi_hyphenation_dict.json` | Huruf kecil, titik diubah ke `-`. |

Kata **cocok** bila kedua bentuk sama persis setelah kanonik.

## Taksonomi

| # | Kelas | Kondisi | Dihitung kegagalan? |
| --- | --- | --- | --- |
| 1 | `reference-missing` | Kata tidak ada di snapshot. | Tidak |
| 2 | `root-word-self` | Kata ada di `root_words.txt` dan tidak punya pemetaan turunan. | Tidak, dihitung **cocok** |
| 3 | `plural-root` | Kemampuan `stem`. Akar plugin adalah awalan akar referensi, dan kata mengandung imbuhan jamak yang tidak dilepas. | Ya |
| 4 | `affix-strip-missed` | Kemampuan `stem`. Kata berimbuhan yang imbosannya tidak dilepas plugin. | Ya |
| 5 | `over-stripped` | Kemampuan `stem`. Plugin melepas lebih dari yang seharusnya. | Ya |
| 6 | `syllable-boundary-shift` | Kemampuan `syllable`. Jumlah suku kata sama, batas berbeda. | Ya |
| 7 | `syllable-count-diff` | Kemampuan `syllable`. Jumlah suku kata berbeda. | Ya |
| 8 | `data-divergence` | Tidak cocok aturan mana pun **dan** kata berada di luar korpus inti. | Tidak |
| 9 | `candidate-bug` | Tidak cocok aturan mana pun **dan** kata berada di dalam korpus inti. | Ya |

### Aturan turunan untuk kelas 3 sampai 7

Kelas 3-7 membutuhkan informasi morphology, sehingga diturunkan sebagai berikut:

- **Imbuhan jamak** dideteksi dari sufiks yang melekat dan akar referensi
  memuat sisa yang sepadan. Contoh: referensi `buku`, plugin `buk`, kata
  `bukunya`.
- **`affix-strip-missed`**: kata mengandung deretan vokal-konsonan-vokal di
  awal yang menyerupai awalan (`mem`, `men`, `meng`, `ber`, `per`, `ter`,
  `peN`) atau sufiks (`kan`, `an`, `i`, `nya`), dan bentuk plugin masih
  memuat deretan itu.
- **`over-stripped`**: panjang akar plugin lebih pendek daripada akar referensi
  dan plugin memotong di tengah kata dasar.

Kelas 3-7 hanya berlaku pada kemampuan yang sesuai. `syllable-boundary-shift`
dan `syllable-count-diff` tidak pernah muncul pada pengukuran akar kata, dan
sebaliknya.

### Perbedaan pemenggalan diklasifikasi lebih dulu

Sebelum kelas 8 atau 9, dua kelas pemenggalan diperiksa:

- Jumlah suku kata sama → `syllable-boundary-shift`
- Jumlah suku kata berbeda → `syllable-count-diff`

Ini yang membuat dua kelas tersebut tidak pernah tenggelam ke `candidate-bug`,
sesuai edge case pada spec.

## Korpus inti, dan penolakan permanen atas kata serapan

`data-divergence` (kelas 8) hanya berlaku bila kata berada di luar korpus inti.
Penentuannya memakai aturan yang sama dengan stratum pada data-model:

Kata berada **di luar korpus inti** bila pemenggalan KBBI-nya memuat onset
berikut: `kn`, `kw`, `kh`, `gh`, `ph`, `ps`, `sy`, `tr`, `tw`, `bl`, `br`,
`dr`, `fl`, `fr`, `gl`, `gr`, `str`, `spr`, `skr`, `skl`, `spl`.

Konsekuensi yang disengaja: kata beronset non-Indonesia yang selisihnya tidak
dapat dijelaskan aturan pola masuk `data-divergence` dan **tidak** menghitung
sebagai kegagalan.

**Keputusan 2026-10-07 (pilihan C): daftar onset di atas tidak pernah diperbaiki,
serta selisih kata serapan ditolak secara permanen, bukan ditunda.**
Konsekuensinya untuk perkakas:

- Perkakas **tidak boleh** membuat temuan atas kata berstratum serapan,
  berapa pun selisihnya.
- Perkakas **tidak boleh** mengusulkan perbaikan atas tabel onset di
  `src/core/syllabify.ts`.
- Angka stratum serapan tetap dilaporkan di blok `Per stratum` untuk
  transparansi, tetapi tidak pernah menjadi gerbang kelulusan.
## Wajibnya alasan triase (FR-006)

Tiga kelas **wajib** disertai `triageNote` non-kosong:

| Kelas | Isi yang diharapkan |
| --- | --- |
| `data-divergence` | Mengapa kata ini dianggap masalah referensi, bukan plugin. |
| `reference-missing` | Kata tidak ditemukan. |
| `root-word-self` | Fundasi bahwa kata dasar sah, sehingga bukan kegagalan. |

Tiga kelas boleh memakai catatan bawaan yang marvel. Kelas lain **tidak**
membutuhkan catatan: kelelasnya sudah menyatakan penyebabnya, dan `source`
sudah menyatakan dari mana data diambil.

## Contoh triase yang benar

| Kata | Plugin | Referensi | Kelas | Alasan |
| --- | --- | --- | --- | --- |
| `bukunya` | `buk` | `buku` | `plural-root` | - |
| `memdoctoral` | `doktor` | `doktoral` | `affix-strip-missed` | Sufiks `-al` belum dilepas. |
| `pintar` | `pintar` | `pintar` | (cocok) | - |
| `abiologi` | `a-bi-o-lo-gi` | `a.bi.o.lo.gi` | (cocok) | - |
| `antui` | `an-tui` | `an.tui` | `data-divergence` | Onset `tu` tidak lazim dalam fonotaktik Indonesia. |
| `mencari` | `cari` | `cari` | (cocok) | - |
| `berkembang` | `kembang` | `kembang` | (cocok) | - |

## Anti-pola

Kelas yang **tidak** boleh muncul, karena artinya perkakas salah:

- `reference-missing` pada kata yang jelas ada di kamus pemenggalan.
- `root-word-self` pada kata yang punya pemetaan turunan.
- `syllable-count-diff` pada kata dengan jumlah suku kata yang sama.
- `data-divergence` pada kata di korpus inti yang selisihnya dijelaskan aturan pola.

Keempatnya harus diuji sebagai test unit di
`tests/unit/test_kbbi_taxonomy.test.ts`.


## Disposisi `contract-locked`

Ditambahkan setelah Constitution Check terhadap konstitusi v1.0.0, lalu
diselaraskan dengan Clarifications sesi 2026-10-07 di `spec.md`.

### Maknanya setelah keputusan itu

KBBI adalah otoritas terakhir atas kebenaran linguistik. Tidak ada temuan yang
ditolak semata karena bertentangan dengan kontrak atau golden fixture. Yang ada
adalah kewajiban **menyelaraskan** hasil perkiraan dengan kontrak, di perubahan
yang sama.

`contract-locked: true` berarti: **memperbaiki temuan ini mengubah hasil yang
tertuang dalam kontrak publik, golden fixture, atau tabel override internal.

### Aturan penandaan

Sebuah temuan diberi `contract-locked: true` bila memenuhi salah satu:

1. Perbaikannya akan mengubah hasil untuk kata yang ada di tabel contoh kontrak
   `contracts/public-api.md`.
2. Perbaikannya akan mengubah hasil untuk kata yang ada di
   `tests/fixtures/stem-golden.json` atau `syllabify-golden.json`.
3. Perbaikannya akan mengubah entri `OVERRIDES` di `src/core/syllabify.ts`.

### Perlakuan

| Situasi | Perlakuan |
| --- | --- |
| `contract-locked`, KBBI benar | Diperbaiki **dan** kontrak, golden fixture, serta test-nya diperbarui di perubahan yang sama (FR-023, SC-013). |
| `contract-locked`, KBBI ternyata keliru atau tidak relevan | Ditolak sebagai bukan bug, dicatat sebagai keterbatasan diketahui beserta alasannya (FR-022). |
| Bukan `contract-locked` | Jalur perbaikan biasa. |

Perbedaan penting dari kebijakan lama: `contract-locked` tidak lagi
**memblokir** perbaikan, tetapi **membebankan** pembaruan kontrak. Menolak
perbaikan demi mempertahankan kontrak tidak lagi menjadi pilihan.

### Penentuan lock dikunci pada kapabilitasnya

Nilai `contractLocked` hanya dapat dipicu oleh nilai terkunci milik kapabilitas
yang sedang diukur:

| Kapabilitas | Yang dapat memicu lock |
| --- | --- |
| `stem` | Kata pada `tests/fixtures/stem-golden.json`; kata polos pada tabel contoh kontrak. |
| `syllable` | Kata pada `tests/fixtures/syllabify-golden.json`; entri `OVERRIDES`; contoh kontrak yang berbentuk bertanda hubung. |

Alasannya: memperbaiki `stem()` tidak mungkin mengubah keluaran `syllabify()`.
Tanpa batasan ini, setiap kata yang kebetulan juga tercatat pada fixture
pemenggalan akan ditandai sebagai pelanggaran kontrak, dan hundreds perbaikan
akar kata akan tersedak oleh lock yang tidak pernah ada. Diperbarui pada sesi
implementasi 2026-10-07 beserta alasannya di bagian `## Clarifications` pada
`spec.md` (Prinsip I).

### Wajibnya jejak (FR-023, SC-013)

Setiap perbaikan pada temuan `contract-locked` **wajib** menghasilkan tiga hal
sekaligus, atau perubahan itu dianggap belum lengkap:

1. Algoritme diperbaiki.
2. `contracts/public-api.md` dan/atau golden fixture diperbarui, beserta test
   yang mengaturnya.
3. Satu entri alasan ditambahkan pada bagian `## Clarifications` di
   `specs/002-validasi-kbbi-berbertahap/spec.md`.

### Wajibnya alasan triase

`contract-locked: true` **wajib** disertai `triageNote` yang menyatakan:

- Kontrak, fixture, atau tabel override mana yang ikut berubah.
- Nilai lama dan nilai baru untuk kata tersebut.
- Alasan KBBI dianggap lebih benar di sini.

Tanpa tiga butir itu, gerbang tahap menolak `promote`.
