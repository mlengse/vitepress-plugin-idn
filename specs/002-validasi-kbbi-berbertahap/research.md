# Research: Validasi Kemampuan Bahasa Indonesia terhadap KBBI

**Feature**: 002-validasi-kbbi-berbertahap | **Phase**: 0 | **Date**: 2026-10-07

Dokumen ini menutup seluruh pertanyaan yang muncul dari Technical Context di
`plan.md`. Setiap keputusan dicatat dengan alasannya dan alternatif yang
dipertimbangkan, supaya `/speckit-tasks` tidak perlu menebak.

---

## R1 - Pengukuran massal lewat file lexicon, bukan 33k panggilan MCP

**Question**: Apakah pengukuran penuh atas 33.268 kata turunan dilakukan lewat
33.268 panggilan tool `cari_kata_dasar`, atau lewat file lexicon?

**Decision**: Pengukuran penuh dilakukan terhadap **file lexicon** yang diambil
sekali. Tool MCP dipakai sebagai lapisan **sampling, triase, dan verifikasi
silang**, bukan sebagai jalur massal.

**Rationale**: `kbbi-harvester-cdn@data-v4` mengekspos dua file datar yang
menutup seluruh corpus dalam dua permintaan:

| File | Ukuran | Isi |
| --- | --- | --- |
| `lexicon/derived_to_root_with_kelas.json` | 2,76 MB | `{ kataTurunan: { kataDasar, kelasKata[] } }` |
| `hyphenation/kbbi_vi_hyphenation_dict.json` | 2,13 MB | `{ kata: "a.has" }` notasi titik |

Sekitar 4,9 MB untuk seluruh corpus, berbanding 33.268+ permintaan jaringan.
Ini yang membuat SC-005 (pengukuran penuh dalam 30 menit dari snapshot) tercapai
dengan margin lebar, dan membuat FR-012 (jalan tanpa jaringan) mustahil bocor.

**Alternatives yang dipertimbangkan**:
- 33k panggilan MCP: ditolak. Rentan throttling, tidak dapat diulang secara
  deterministik, dan membuat SC-005 mustahil dijamin.
- `word-details/` per kata (112rb+ file): ditolak. Satu file per kata, biaya
  jaringan tidak proporsional untuk pengukuran yang hanya butuh akar kata dan
  pemenggalan.

---

## R2 - Dataset di-pin dengan tag `data-v4` plus blob SHA

**Question**: Bagaimana menjamin hasil pengukuran sebanding antar tahap?

**Decision**: Snapshot menyimpan **tag** (`data-v4`) **dan blob SHA per file**
bersama checksum isi. SHA yang dipakai:

| File | Blob SHA |
| --- | --- |
| `lexicon/derived_to_root_with_kelas.json` | `4bdde8ad0cc8df523dc6b1d25558ac9843507afc` |
| `lexicon/derived_to_root.json` | `ead996db97ac3dfe779a6a9393243aa39506c280` |
| `lexicon/root_words.txt` | `4a82a3c134c0b5acd9b9f8c2e55ef656a58063ab` |
| `lexicon/derived_words.txt` | `3e2d1f8c950addb59a90810955f5de2b6a069eaa` |
| `hyphenation/kbbi_vi_hyphenation_dict.json` | `664e7a99966e41af09fa90670b7a1685424c145b` |
| `hyphenation/kbbi_pemenggalan.txt` | `63d66a10bafd27ad7229239dbe26f2cf2cab517f` |

**Rationale**: SHA blob Git tidak berubah pada tag yang sama, jadi satu penanda
cukup untuk membuktikan dataset-nya identik tanpa menyalin 4,9 MB ke dalam git.
`data-v4` dipilih, bukan `main`, karena README `kbbi-mcp-server` menyatakan
`@main` selalu latest (untuk pengembangan) sedangkan `@data-v4` adalah tag stabil
untuk produksi.

**Catatan**: menunjuk tag yang salah menghasilkan pengukuran yang diam-diam
tidak sebanding. Karena itu tag dan SHA **wajib** ditulis di setiap laporan
(FR-014), bukan hanya di manifest snapshot.

---

## R3 - Snapshot tinggal di luar git; hanya regresi kurasi yang dikomit

**Question**: Di mana snapshot dan temuan disimpan?

**Decision**:
- Snapshot (4,9 MB data pihak ketiga, lisensi ISC) **tidak** dikomit. Disimpan
  di direktori yang di-gitignore.
- **Hanya** kasus regresi kurasi yang dikomit ke `tests/fixtures/`, mengikuti
  pola `stem-golden.json` dan `syllabify-golden.json` yang sudah ada.

**Rationale**: FR-009 menuntut kasus regresi permanen, sementara FR-018 melarang
data KBBI masuk paket dan SC-008 melarang ukuran paket bertambah. Keduanya tidak
bertabrakan apabila yang dikomit adalah **kata dan akar yang dipilih**, bukan
dict-nya. Pola ini sudah terbukti di repositori: `tests/fixtures/*.json`
berisi puluhan pasangan, bukan puluhan ribu.

**Alternatives yang dipertimbangkan**:
- Komit snapshot utuh: ditolak. Menambah sekitar 4,9 MB data pihak ketiga ke
  riwayat git secara permanen, dan data tidak bisa diperbarui tanpa diff raksasa.
- Jangan komit apa pun: ditolak. Melanggar FR-009; regresi tidak akan pernah
  terdeteksi oleh CI.

---

## R4 - `syllabify()` adalah target pemenggalan, bukan `hyphenate()`

**Question**: Fungsi mana yang dibandingkan dengan kolom `nama` KBBI?

**Decision**: Target utama adalah **`syllabify()`** (`src/core/syllabify.ts`).
`hyphenate()` dibandingkan sebagai **diagnostik sekunder**, bukan gerbang
akurasi.

**Rationale**: Repo ini punya dua mesin pemenggalan yang berbeda algoritma dan
berbeda tujuan:
- `syllabify()` - mesin CV berbasis PUEBI, menghasilkan kata bertanda hubung, dan
  inilah "pemenggalan" yang diekspos ke pengguna.
- `hyphenate()` - pola Liang dari paket `hyphenasi`, menyisipkan *soft hyphen*
  untuk pemenggalan baris.

Kolom `nama` KBBI (`pin.tar`) adalah pemenggalan suku kata, jadi secara
semantik `syllabify()` yang tepat. Memilih `hyphenate()` sebagai gerbang akan
mengukur algoritma yang berbeda dari yang benar-benar dipakai pengguna.

**Implikasi yang harus dinyatakan terbuka**: kamus `kbbi_vi_hyphenation_dict.json`
memang turunan pola Liang, bukan PUEBI murni, sehingga sebagian sudut-sudut akan
berbeda karena filtrasi. Lihat R5.

---

## R5 - Korpus pemenggalan di stratified, selisih serapan ditolak permanen

**Question**: Apa yang harus dilakukan dengan ketidaksesuaian berderajat?

**Decision**: Korpus pemenggalan dibagi menjadi **dua stratum** yang dilaporkan
terpisah. **SC-002 dihitung hanya pada stratum inti Indonesia.**

**Rationale**: Pengambilan sampel langsung dari `kbbi_vi_hyphenation_dict.json`
menunjukkan dua masalah nyata:

1. **Kasus kapital di sumber**: entri `"atlantik": "At.lan.tik"` memakai huruf
   besar di tengah. Tanpa normalisasi ke huruf kecil, `syllabify("atlantik")`
   tidak akan pernah cocok dan akan menghasilkan ribuan temuan palsu.
2. **Kata serapan dengan fonotaktik non-Indonesia**: entri seperti `abiologi`
   (`a.bi.o.lo.gi`), `ajus`, `alongins`, `antui` memakai onset `ps`, `kn`, `kh`,
   `sy` yang tidak ada dalam fonotaktik Indonesia. Tabel onset di
   `src/core/syllabify.ts:32` dan `:62` memuat cluster Inggris yang sama
   (`kn`, `kw`, `kh`, `gh`, `ph`, `tr`, `tw`), sehingga kedua sisi tampak cocok
   pada kata-kata yang justru paling tidak relevan.

**Keputusan 2026-10-07 (pilihan C): tabel onset tidak diperbaiki.** Cluster itu
dianggap sah oleh mesin dan akan tetap dianggap sah. Daftar onset dipakai sebagai
alat klasifikasi stratum, bukan daftar cacat. Konsekuensinya, selisih pada kata
serapan tidak pernah menjadi temuan yang menunggu perbaikan, dan SC-002 dihitung
hanya pada stratum inti.

**Alternatives yang dipertimbangkan**:
- Menghapus cluster non-Indonesia dari mesin: ditolak. Mengubah keluaran yang
  sudah dipublikasikan untuk kata serapan, sementara manfaat bersihnya kecil
  karena kata-kata itu justru paling tidak relevan untuk pembaca dokumentasi.
- Buang kata serapan sebelum mengukur: ditolak. Butuh kamus pihak ketiga yang
  tidak tersedia. Penyaringan berbasis aturan fonotaktik lebih dapat diaudit dan
  menampilkan jumlah yang dikecualikan, sehingga tidak ada yang hilang diam-diam.
- Ukur seluruh corpus, laporkan satu angka: ditolak. Angka tunggal menyembunyikan
  pola di balik rata-rata yang menipu.
---

## R6 - Tool MCP sebagai lapisan sampling dan triase

**Question**: Di mana tool MCP benar-benar dipakai?

**Decision**: Empat peran, semuanya di luar jalur massal:

1. **Sampling berkala** - cek silang subset hasil pengukuran massal terhadap
   `cari_kata_dasar` dan `pemenggalan_kata` untuk mendeteksi penyimpangan
   pembaca lexicon.
2. **Konteks kata** - `kelas_kata` dan `analisis_imbuhan` memberi penjelasan
   mengapa sebuah selisih muncul (misalnya awalan `peN-`, atau kelas verba).
3. **Verifikasi silang** - `daftar_kata_turunan` dan
   `cari_kata_dasar_dari_lexicon` memastikan akar yang dipakai pengukuran
   massal memang turunan yang dikenal.
4. **Ekspor per huruf** - `ekspor_stem_mapping` dan `ekspor_training_dic`
   sebagai jalur alternatif bila repo data tidak dapat diunduh.

**Rationale**: Tool MCP memberi konteks yang tidak ada di file datar (kelas
kata, analisis imbuhan), dan kesepakatannya dengan file datar merupakan
pemeriksaan sendiri atas kebenaran pembaca lexicon.

**Konsekuensi arsitektur**: MCP **wajib opsional**. Jalur massal tidak pernah
memanggilnya, sehingga seluruh pengukuran tetap berjalan tanpanya (FR-012,
SC-010).

---

## R7 - Perkakas lewat skrip mandiri, bukan lewat vitest

**Question**: Bagaimana perkakas pengukuran dijalankan?

**Decision**: Perkakas pengukuran adalah **skrip Node** yang dijalankan langsung
(`node scripts/...`). Perkakas ini **tidak** masuk vitest.

**Rationale**: `vitest.config.ts` menunjuk `globalSetup: ['tests/global-setup.ts']`,
yang menjalankan `npx vitepress build playground` pada **setiap** kali test
dijalankan. Memasukkan pengukuran 33rb+ kata ke dalam jalur itu akan membuat
setiap `npm test` menanggung build playground, dan membuat SC-005 mustahil
dijamin.

Pola yang diambil: skrip perkakas di `scripts/` (mengikuti
`scripts/update-stopwords.ts` yang sudah ada), dan hanya **kasus regresi
kurasi** yang masuk vitest sebagai test biasa.

**Alternatives yang dipertimbangkan**:
- Perkakas sebagai test vitest: ditolak. Alasan gerbang di atas.
- Perkakas sebagai package terpisah: ditolak. Berlebihan untuk satu fitur; satu
  direktori `tools/` sudah cukup.

---

## R8 - Normalisasi perbandingan dilakukan pada bentuk kanonik

**Question**: Bagaimana membandingkan bentuk pemenggalan dan bentuk akar?

**Decision**: Semua perbandingan dilakukan pada **bentuk kanonik** yang
didefinisikan sekali dan dipakai di seluruh perkakas:

| Aspek | Bentuk kanonik |
| --- | --- |
| Huruf | lowercase penuh, termasuk pemenggalan dari sumber |
| Pemenggalan | dipisah tanda hubung (`pin.tar` menjadi `pin-tar`) |
| Kata majemuk | tanda hubung dipertahankan sebagai pemisah (`abu-abo` menjadi `abu-abo`) |
| Spasi | semua spasi di luar dihapus |
| Kata turunan | Akar plugin dan akar referensi dibandingkan apa adanya setelah lowercase |

**Rationale**: Ini memenuhi FR-006 yang melarang perbedaan tanda pisah dihitung
sebagai perbedaan hasil. Menormalkan di satu tempat juga mencegah laporan
massal dan kasus regresi kurasi memakai aturan berbeda.

**Catatan**: `syllabify()` mengembalikan kata bertanda hubung dengan tanda hubung
asli utuh, sehingga reduplikasi seperti `ayam-ayaman` harus ditangani eksplisit,
bukan diasumsikan.

---

## R9 - Menentukan kelas cacat secara deterministik

**Question**: Bagaimana membEDakan "bug plugin" dari "selisih data"?

**Decision**: Setiap selisih diberi satu kelas dari taksonomi tertutup berikut,
ditentukan oleh aturan berurutan. Kelas pertama yang cocok menang.

| Kelas | Aturan |
| --- | --- |
| `reference-missing` | kata tidak ada di snapshot. Tidak dihitung sebagai kegagalan. |
| `root-word-self` | kata ada di `root_words.txt` tanpa pemetaan turunan. Dihitung sebagai **cocok**. |
| `plural-root` | akar plugin lebih pendek dari akar referensi dan kata mengandung imbuhan jamak. Dihitung sebagaiselisih. |
| `affix-strip-missed` | kata berimbuhan yang imbosannya tidak dilepas plugin. Dihitung sebagai kegagalan. |
| `over-stripped` | plugin melepas lebih dari yang seharusnya. Dihitung sebagai kegagalan. |
| `syllable-boundary-shift` | jumlah suku kata sama, batas berbeda. Dihitung sebagai kegagalan. |
| `syllable-count-diff` | jumlah suku kata berbeda. Dihitung sebagai kegagalan. |
| `data-divergence` | tidak cocok dengan pola di atas dan kata berada di luar corpus inti. Dihitung sebagai **selisih data**. |
| `candidate-bug` | tidak cocok dengan pola di atas dan kata berada di dalam corpus inti. Dihitung sebagai kegagalan. |

**Rationale**: FR-003 mensyaratkan pengelompokan minimal empat kategori.
Tanpa aturan berurutan, triase menjadi penilaian subjektif dan FR-006
(alasan triase tercatat) tidak dapat diverifikasi.

`data-divergence` sengaja ditempatkan **sebelum** `candidate-bug`: kata yang
tidak bisa dijelaskan aturan pola dan berada di luar corpus inti lebih mungkin
meny policía jadi masalah referensi daripada bug plugin.

**Alternatives yang dipertimbangkan**:
- Klasifikasi manual oleh manusia: ditolak. Tidak skalakan ke 33rb kata.
- Klasifikasi berbasis kemiripan string: ditolak. Terlalu kabur, tidak dapat
  diaudit, dan tidak menghasilkan alasan triase yang tercatat.

---

## R10 - Gerbang yang sudah ada, plus stage gate yang membaca hasil

**Question**: Apakah perbaikan cacat KBBI boleh langsung masuk `src/`?

**Decision**: Perbaikan hanya boleh masuk setelah tahap verifikasi lulus.
Verifikasi menjalankan `npm test` (termasuk kasus regresi kurasi), `npm run
lint`, `npm run typecheck`, serta satu `build-full` pada akhir tiap tahap
(FR-019 tingkat 2).

**Rationale**: Konstitusi sudah diratifikasi pada versi 1.0.0 dengan lima
prinsip, termasuk Prinsip V yang mewajibkan tiga lapis test yang tidak saling
menggantikan: `unit/`, `contract/`, dan `integration/`. Gerbang yang dipakai
adalah gerbang yang sudah ada di repositori dan sudah dipercaya pada feature
001, sehingga tidak ada aturan kualitas baru yang perlu dibuat.

**Konsekuensi**: yang ditambahkan hanya stage gate (FR-010), yang membaca
hasil pengukuran dan status regresi, bukan membuat aturan baru. Gerbang itu
menjadi pengaman tambahan, bukan pengganti ketiga lapis test yang sudah ada.

**Soal biaya**: `tests/global-setup.ts` menjalankan `npx vitepress build
playground` pada setiap kali test jalan. Karena itu verifikasi pencarian
pecah menjadi dua tingkat (keputusan 2026-10-07): pemeriksaan cepat di
`unit/` yang selalu jalan, dan satu build penuh sekali per tahap. Kewajiban
lapisan integrasi tetap dipenuhi, tetapi tidak dibayar ulang pada setiap
percobaan perbaikan.


## R11 - Laporan ditulis sebagai file, bukan hanya stdout

**Question**: Bagaimana hasil pengukuran disimpan agar bisa dibandingkan antar
tahap?

**Decision**: Setiap pengukuran menulis **dua bentuk**: ringkasan manusia
(markdown, untuk perbandingan antar tahap) dan daftar temuan lengkap (JSONL,
untuk diproses mesin dan di-*diff* antar tahap).

**Rationale**: FR-002 mensyaratkan daftar temuan yang dapat diproses mesin,
sedangkan FR-020 dan SC-007 mensyaratkan perbandingan antar tahap. Dua bentuk
menutup keduanya tanpa memaksa satu format untuk dua consumer berbeda.

JSONL dipilih, bukan satu JSON besar, karena memungkinkan *append* saat
pengukuran dilanjutkan (FR-015) tanpa memuat ulang seluruh hasil.

---

## R12 - Siklus hidup direktori kerja

**Question**: Di mana hasil pengukuran dan snapshot berada?

**Decision**: Satu direktori kerja yang di-gitignore, di luar `src/`, `tests/`,
dan `dist/`:

```text
.kbbi/                     # di-gitignore
├── snapshot/
│   └── data-v4/           # payload mentah + manifest.json
├── reports/
│   └── <capability>-<scope>.{md,jsonl}
├── defects/
│   └── open.jsonl         # temuan yang masih terbuka
└── stages/
    └── stage-NN.json      # catatan tahap + hasil verifikasi
```

**Rationale**: Pemisahan ini membuat FR-017 (perkakas di luar paket) dan FR-018
(data tidak terbundel) terpenuhi secara struktural, bukan hanya lewat aturan.
Tidak ada jalur build yang menyentuh `.kbbi/`, sehingga tidak mungkin bocor ke
`dist/`.

**Alternatives yang dipertimbangkan**:
- `tests/fixtures/`: ditolak. Direktori itu ikut territory test dan akan membuat
  test suite bergantung pada data yang sengaja tidak dikomit.
- `data/` di root: ditolak. Terlalu godaan untuk ikut terpakai runtime.

---

## Ringkasan keputusan

| ID | Keputusan | Dampak utama |
| --- | --- | --- |
| R1 | Bulk lewat file lexicon | SC-005 pasti tercapai |
| R2 | Pin `data-v4` + blob SHA | FR-014 dapat diverifikasi |
| R3 | Snapshot di luar git, regresi kurasi dikomit | FR-009 dan FR-018 tidak bertabrakan |
| R4 | Target `syllabify()` | Mengukur yang benar-benar dipakai pengguna |
| R5 | Dua stratum korpus | SC-002 tidak menyesatkan |
| R6 | MCP opsional | FR-012 tetap berlaku |
| R7 | Skrip mandiri, bukan vitest | Tidak memperlambat `npm test` |
| R8 | Bentuk kanonik tunggal | FR-006 dapat diuji |
| R9 | Taksonomi cacat berurutan | FR-003 dan FR-006 dapat diuji |
| R10 | Gerbang yang sudah ada | Tidak menambah aturan baru |
| R11 | Laporan md + JSONL | FR-002 dan FR-020 terpenuhi |
| R12 | Direktori `.kbbi/` di-gitignore | FR-017 dan FR-018 struktural |

**Tidak ada NEEDS CLARIFICATION yang tersisa.** Technical Context pada
`plan.md` terisi seluruhnya, dan constitution check tidak menemukan pelanggaran
yang belum justifies.
