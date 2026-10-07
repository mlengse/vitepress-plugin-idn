# Feature Specification: Validasi Kemampuan Bahasa Indonesia terhadap KBBI secara Bertahap

**Feature Branch**: `002-validasi-kbbi-berbertahap`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Buat pengujian dan perbaikan bertahap menggunakan tools MCP dari https://github.com/mlengse/kbbi-mcp-server dan database Bahasa Indonesia dari https://github.com/mlengse/kbbi-harvester-cdn"

## Summary

Repositori `vitepress-plugin-idn` sudah menyediakan kemampuan bahasa Indonesia (pencarian morfologi, stemming, pemenggalan kata) dengan pendekatan berbasis aturan dan algoritma. Pendekatan itu berjalan baik untuk kasus umum, tetapi belum pernah diukur secara sistematis terhadap sumber kebenaran yang otoritatif: data Kamus Besar Bahasa Indonesia (KBBI).

Specification ini menambah **peralatan validasi dan perbaikan bertahap** yang:

1. Mengukur kemampuan plugin terhadap data KBBI sebagai sumber kebenaran, melalui sekumpulan tool MCP di `mlengse/kbbi-mcp-server` yang membaca data dari `mlengse/kbbi-harvester-cdn`.
2. Menghasilkan daftar cacat yang terklasifikasi dan bisa ditindaklanjuti, bukan sekadar angka akurasi.
3. Memungkinkan perbaikan cacat dalam batch kecil yang berurutan, dengan jaminan bahwa setiap perbaikan yang sudah dilakukan **tidak regresi** pada tahap berikutnya.
4. Menyimpan snapshot data referensi yang di-*pin* sehingga pengukuran dapat diulang secara deterministik, tanpa jaringan dan tanpa server MCP.

Kata kuncinya adalah **bertahap**. Feature ini tidak menjanjikan 99% akurasi sekaligus; ia menjanjikan bahwa setiap tahap kecil menghasilkan nilai yang terukur, terverifikasi, dan tidak merusak apa yang sudah benar.

**Batas yang sudah diputuskan:** data KBBI diperlakukan **hanya sebagai sumber pembanding di luar paket**, tidak pernah menjadi kamus akar kata runtime. Semua perbaikan diterapkan pada algoritma plugin. dengan jaminan paket tetap ringan dan tetap berfungsi offline.

## Konteks Domain

Dua repositori yang dirujuk pengguna berada di bawah akun GitHub yang sama dengan fork yang sudah dipakai spec 001. Perannya dalam feature ini:

| Sumber | Peran |
| --- | --- |
| `mlengse/kbbi-mcp-server` | Lapisan kerangka kerja: server MCP yang mengekspos data KBBI dalam bentuk kueri per kata maupun per huruf. Kelompok tool mencakup kamus (definisi, kelas kata, contoh kalimat, peribahasa, kategori, status lexicon), pemenggalan (pemenggalan suku kata, patterning, ekspor `.dic`, perbandingan format, validasi), dan stemmer (akar kata, daftar turunan, ekspor pemetaan akar per huruf, analisis imbuhan, daftar kata dasar KBBI). |
| `mlengse/kbbi-harvester-cdn` | Sumber kebenaran data: 112rb+ entri kamus, lexicon berisi sekitar 11.170 kata dasar dan 33.268 kata berimbuhan beserta pemetaan ke akar kata (termasuk kelas kata), data pemenggalan suku kata, serta skema JSON untuk validasi struktur data. |

Konsekuensi penting dari karakter data ini:

- Data KBBI **memiliki** akar kata otoritatif (`rootWord`), tetapi **tidak lengkap**: tidak semua kata turunan terpetakan, dan sebagian entri berpotensi keliru. Karena itu selisih antara plugin dan KBBI harus **ditriage**, bukan langsung dianggap bug.
- Data pemenggalan memakai notasi titik (`pin.tar`), sementara keluaran plugin memakai tanda hubung. Perbandingan harus menormalkan keduanya sebelum menilai benar atau salah.
- Ekspor massal dibatasi per huruf awal, sehingga cakupan corpus diukur dan dilaporkan per huruf.

## Clarifications

### Session 2026-10-07

- Q: Ketika pengukuran KBBI berbeda dengan plugin pada kata yang sudah terkunci oleh contoh kontrak yang dipublikasikan atau golden fixture, bagaimana temuan itu harus ditangani? → A: KBBI menang. Kontrak dan golden fixture diperbarui mengikuti hasil KBBI.
- Q: Apakah tabel onset cluster non-Indonesia (`kn`, `kw`, `kh`, `gh`, `ph`, `tr`, `tw`) pada mesin pemenggalan ikut diperbaiki dalam feature ini? → A: Tidak. Tabel itu dibiarkan apa adanya dan selisih kata serapan ditetapkan permanen di luar cakupan.
- Q: Ketika satu entri KBBI memberi sebuah kata lebih dari satu akar yang mungkin, akar mana yang dianggap benar? → A: Entri teratas yang memiliki pemetaan akar, sesuai urutan file. Aturan ini sama dengan yang dipakai perkakas rujukan `cari_kata_dasar`.
- Q: Seberapa tuntas pemeriksaan regresi pencarian yang diwajibkan setelah tiap putaran perbaikan kata dasar? → A: Dua tingkat. Pemeriksaan cepat di tingkat unit pada setiap test biasa, dan satu verifikasi build penuh satu kali pada akhir tiap tahap.

### Sesi implementasi 2026-10-07 - hasil tahap pertama

- **Perubahan terkunci pada `stem()` (T033, stage-01).** Aturan sisa imbuhan
  ditambahkan pada `src/core/stem.ts`: bila mesin stemming mengembalikan kata
  apa adanya, sufiks sisa `-an`/`-ya`/`-nya` dan awalan sisa `ber-`/`be-` dilepas
  satu kali. Dampak terukur pada 33.268 kata turunan: 215 kata berubah, **215
  benar**, **0 regresi**, akurasi akar kata 81,86% → **82,57%** (baseline penuh).
  Tidak ada satu pun dari 215 kata itu yang tercantum pada tabel contoh kontrak,
  `stem-golden.json`, atau `syllabify-golden.json`, jadi tidak ada nilai terkunci
  yang berubah dan golden fixture tidak perlu disentuh (Prinsip V terpenuhi
  tanpa perubahan fixture). Kontradiksi lama berupa assertion 85% yang mati
  secara logis dihapus pada T034, bukan dilonggarkan.
- **Keterbatasan diketahui yang tercatat (FR-022, SC-012).** 9 temuan tahap-01
  ditutup lewat triase, bukan lewat tebakan. Kata-katanya: adukan, ajakan,
  anakan, anjakan, arakan, bacokan, bajakan, balakan, dan almuhit.
  - *Kelompok `-kan` vs `-an`* (delapan kata pertama): mesin memotong `-kan`
    sehingga `adukan` menjadi `adu`, sementara KBBI menaruh akar pada `aduk`.
    Aturan yang menukar `-an` dengan `-kan` itu diuji, lalu **ditolak** karena
    merusak 19 kata lain. Sebelum menolak, luas lingkupnya diukur dengan
    memeriksa keanggotaan kedua bentuk pada `root_words.txt` untuk seluruh 381
    kandidat perubahan:

    | Keanggotaan akar | Jumlah | Arti |
    | --- | --- | --- |
    | Hanya bentuk KBBI yang akar sah | 245 | perbaikan sejati; aturan aman di sini |
    | Hanya bentuk plugin yang akar sah | 22 | aturan akan mengarang bentuk yang bukan akar |
    | Keduanya akar sah | 44 | ambigu secara leksikal |
    | Keduanya bukan akar | 70 | di luar jangkauan aturan mana pun |

    Bentuk yang pasti rusak ada di baris kedua: `saksik`, `dempetk`, `asalk`,
    `andaik`, dan `bagaik` tidak ada di `root_words.txt`. Bentuk yang jadi
    ambigu ada di baris ketiga, termasuk `adukan`, `bajikan`, dan `balakan`.

    Tiga konfirmasi tambahan:

    - Lewat jalur data yang berbeda, `daftar_kata_turunan` untuk akar `saksi`
      mencatat `saksikan` sebagai salah satu dari delapan turunannya. Jadi
      keluaran mesin `saksi` itu benar, dan `saksik` pasti salah.
    - `saksikan` tidak punya entri `word-details` di KBBI (permintaannya 404),
      padahal ia turunan sah. Inilah ketidaklengkapan data yang sudah dijelaskan
      di Konteks Domain spec: akar kata otoritatif tetapi tidak lengkap.
      Karena itu penilaian hanya boleh bersandar pada peta turunan dan
      `root_words.txt`, bukan pada `word-details`.
    - `bala` dan `balak` keduanya ada di `root_words.txt`, begitu juga `baja`
      dan `bajak`. Itulah sebabnya ambiguitas tadi nyata, bukan sekadar kegagalan
      heuristic.

    Baseline saat ditemukan: stem 82,57%.
  - *Awal `al-` yang beku* (`almuhit`): mesin tidak melepas `al-`. Perbaikannya
    butuh kamus akar KBBI yang dilarang ikut terbundel (FR-021). Baseline saat
    ditemukan: stem 82,57%.
  - Karena itu SC-001 (98%) dan SC-002 (97%) tetap **plafon yang dikejar
    algoritma**, bukan klaim yang sudah tercapai. Angka dasar yang tercatat
    adalah akar kata **82,57%** dan pemenggalan inti **68,73%**.
- **Asimetri akar kata yang sudah ada sebelumnya.** `stem('berjalan')` →
  `jalan`, tetapi `stem('jalan')` → `jal`, sehingga halaman yang hanya memuat
  "berjalan" tidak ditemukan oleh kueri "jalan". Penyebabnya mesin memotong
  `-an` dari kata dasar `jalan`. Membetulkannya berarti mengetahui bahwa `jal`
  bukan akar kata, yaitu butuh kamus akar KBBI di runtime - dilarang oleh FR-021.
  Dicatat sebagai keterbatasan diketahui, bukan diperbaiki.
- **`firstSeenRun` pada JSONL laporan bernilai `null`.** Kontrak laporan
  mensyaratkan JSONL identik byte per byte (FR-013), sedangkan run id adalah
  stempel waktu. Kunci tetap ada dengan `null` eksplisit; nilai sebenarnya
  disimpan di `.kbbi/defects/open.jsonl` yang tidak perlu stabil. Kontrak
  `contracts/report-format.md` diselaraskan pada perubahan yang sama (Prinsip I).
- **Lock hanya berlaku di dalam kapabilitasnya sendiri.** Nilai `contractLocked`
  hanya bisa dipicu oleh nilai terkunci milik kapabilitas yang sedang diukur.
  Perbaikan `stem` tidak terkunci hanya karena kata yang sama muncul di
  `syllabify-golden.json`, karena memperbaiki `stem()` tidak mungkin mengubah
  `syllabify()`. Tanpa batasan ini, ratusan perbaikan akar kata akan ditandai
  sebagai pelanggaran kontrak yang tidak pernah ada.

## Keterbatasan yang Diketahui (FR-022, SC-006, SC-011, SC-012)

Diperbarui 2026-10-07 setelah pengukuran penuh terhadap snapshot `data-v4`.
Setiap temuan yang masih terbuka punya kelas, jumlah, dan alasan teknis; tidak
ada temuan terbuka tanpa penjelasan (SC-011). Semua baris memakai baseline yang
tercatat di bagian `## Clarifications` di atas: akar kata **82,57%**, pemenggalan
inti **68,73%**.

| Kapabilitas / kelas | Jumlah | Alasan teknis | Kenapa tidak diperbaiki |
| --- | --- | --- | --- |
| `stem` / `affix-strip-missed` | 3.421 | Imbuhan masih melekat pada keluaran plugin, misalnya awalan `mem-` pada akar berawalan konsonan, dan bentuk `ber-` beku. | Menentukan imbuhan mana yang produkif dan mana yang beku membutuhkan leksikon akar kata, yang tidak boleh ikut terbundel (FR-021). |
| `stem` / `candidate-bug` | 1.701 | Selisih tidak cocok aturan pola mana pun dan kata berada di dalam korpus inti, misalnya plugin `acak` untuk kata `memacak` yang akar KBBI-nya `pacak`. | Sebagian besar adalah asimilasi nasal (`mem-` + `p` menjadi `pacak`) dan bentuk awalan `be-` beku. Keduanya informasinya hanya ada di leksikon KBBI. |
| `stem` / `over-stripped` | 296 | Plugin memotong di dalam akar referensi, misalnya `adukan` menjadi `adu` sedangkan akarnya `aduk`. | Diuji dengan memeriksa keanggotaan akar pada `root_words.txt`: dari 381 kandidat, 245 perbaikan sejati, 22 pasti merusak (`saksik`, `dempetk`, `asalk`, `andaik`, `bagaik` bukan akar), dan 44 ambigu secara leksikal (`bala` dan `balak` keduanya akar). Aturan `-an`/`-kan` ditolak karena 19 regresi nyata. |
| `syllable` / `syllable-boundary-shift` | 11.201 | Jumlah suku kata sama, batasnya berbeda, contoh `madras` (`ma-dras` vs `mad-ras`). | Penyebabnya tabel onset cluster di `src/core/syllabify.ts`, yang atas instruksi sesi 2026-10-07 **tidak** diperbaiki (R5, T023). |
| `syllable` / `syllable-count-diff` | 9.330 | Jumlah suku kata berbeda, contoh `abiologi` (`a-bio-lo-gi` vs `a-bi-o-lo-gi`). | Kamus acuan adalah turunan pola Liang, bukan PUEBI murni (R4). Menyamakan berarti menulis ulang mesin pemenggalan sebagai Liang, di luar cakupan feature ini. |
| `syllable` / `reference-missing` | 5.932 | Kata ada di leksikon turunan tetapi tidak ada di kamus pemenggalan. | Bukan kegagalan plugin. Dilaporkan sebagai "data tidak tersedia" dan dikeluarkan dari pembilang sejak awal. |

**Catatan pemenggalan.** Angka pemenggalan **tidak** dapat dinaikkan tanpa
mengubah tabel onset, yang atas keputusan eksplisit tidak boleh diubah, atau
tanpa mengadopsi pola Liang ke dalam mesin PUEBI. Karena itu SC-002 (97%) tidak
dicapai dan tidak diklaim tercapai; yang dipegang adalah angka 68,73% pada
stratum inti beserta alasan teknis di atas. Penting: tabel onset itu **tidak**
dianggap daftar cacat, kata serapan tidak pernah menjadi temuan, dan tidak ada
usulan perbaikan atas tabel tersebut dalam perkakas ini (T023).

**Temuan tahap-01 yang ditutup lewat triase** (`dismiss`, sembilan kata): delapan
kata dari kelompok `-kan` versus `-an` (`adukan`, `ajakan`, `anakan`, `anjakan`,
`arakan`, `bacokan`, `bajikan`, `balakan`) plus satu kata berawalan beku
(`almuhit`). Alasan teknisnya sudah tercatat di bagian `## Clarifications` di
atas.

**Arti pilihan pertama.** KBBI menjadi otoritas terakhir atas kebenaran linguistik,
inklusif ketika bertentangan dengan kontrak yang sudah dipublikasikan. Golden
fixture dan tabel contoh kontrak diperlakukan sebagai data, bukan sebagai kekal.
Konstitusi Prinsip I tetap dipatuhi, tetapi melalui jalur yang konstitusinya
konstitusinya sendiri tetapkan: "Any behavior change updates the contract in
the same commit as the code." Maka setiap perbaikan yang mengubah hasil terkunci
**wajib** memperbarui kontrak dan test-nya di perubahan yang sama, disertai
alasan yang tercatat di bagian ini.

Yang dilarang adalah pembaruan yang diam-diam. Yang diwajibkan adalah pembaruan
yang tercatat. Kontrak tidak lagi menjadi penghalang perbaikan, tetapi juga tidak
boleh ditinggalkan usang: setiap perubahan hasil terkunci harus meninggalkan jejak
dalam spesifikasi ini dan dalam `contracts/`.

**Arti pilihan kedua.** Tabel onset cluster tidak diperbaiki. Daftar onset
non-Indonesia diperlakukan sebagai alat untuk memisahkan korpus inti dari korpus
serapan saat pengukuran, bukan sebagai daftar kesalahan. Selisih pada kata serapan
tidak pernah menjadi temuan yang menunggu perbaikan, dan tidak pernah
menggagalkan gerbang kelulusan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mengukur akurasi kata dasar terhadap KBBI (Priority: P1)

Sebagai pengelola repositori, saya ingin mengetahui seberapa sering plugin salah mengubah kata berimbuhan menjadi akar kata yang keliru, diukur terhadap data KBBI, dan saya ingin melihat daftar kata yang berbeda, bukan hanya satu angka persentase.

**Why this priority**: Tanpa pengukuran ini tidak ada dasar objektif untuk menyatakan plugin "cukup baik" maupun untuk memutuskan apa yang harus diperbaiki terlebih dahulu. Seluruh story perbaikan berikutnya bergantung pada story ini.

**Independent Test**: Ambil satu batch kata berimbuhan yang seluruhnya dikenal ada di lexicon KBBI (misalnya huruf awal "M"), jalankan stemming plugin pada setiap kata, bandingkan dengan akar kata dari KBBI, lalu verifikasi bahwa laporan memuat jumlah kata yang diuji, jumlah yang cocok, jumlah yang berbeda, dan daftar lengkap kata yang berbeda beserta hasil plugin dan hasil KBBI.

**Acceptance Scenarios**:

1. **Given** sekumpulan kata berimbuhan yang seluruhnya ada di lexicon KBBI, **When** pengukuran akurasi kata dasar dijalankan, **Then** laporan menyebut jumlah kata yang diuji, jumlah yang cocok, dan tingkat kecocokan sebagai persentase.
2. **Given** pengukuran menemukan kata yang akarnya berbeda antara plugin dan KBBI, **When** laporan dibuka, **Then** setiap perbedaan menampilkan kata, akar menurut plugin, akar menurut KBBI, dan sumber data yang dipakai.
3. **Given** sebuah kata tidak ada di KBBI, **When** kata itu diuji, **Then** kata itu **tidak** dihitung sebagai kegagalan, melainkan dicatat sebagai "data tidak tersedia" dengan hitungan tersendiri.
4. **Given** batch dan versi data yang sama, **When** pengukuran dijalankan ulang, **Then** angka dan daftar perbedaannya identik.

---

### User Story 2 - Mengukur akurasi pemenggalan suku kata terhadap KBBI (Priority: P2)

Sebagai pengelola repositori, saya ingin mengetahui seberapa sering pemenggalan suku kata yang dihasilkan plugin berbeda dari pemenggalan yang dicatat KBBI, dan saya ingin melihat apakah perbedaannya berupa pergeseran batas suku kata, jumlah suku kata yang kurang atau lebih, atau bentuk lain.

**Why this priority**: Pemenggalan adalah kapabilitas yang berdiri sendiri dan punya nilai pengguna yang jelas. Kesalahannya mudah dilihat pembaca, sehingga harus terukur dan bukan hanya diperbaiki bila kebetulan ketahuan.

**Independent Test**: Ambil satu batch kata, jalankan pemenggalan plugin, bandingkan dengan pemenggalan KBBI setelah normalisasi tanda pisah, lalu verifikasi bahwa laporan membedakan jenis kesalahan (pergeseran batas, jumlah suku kata berbeda, pemenggalan kosong) dan menampilkan kedua bentuk untuk setiap kata.

**Acceptance Scenarios**:

1. **Given** kata dengan pemenggalan KBBI `pin.tar` dan pemenggalan plugin `pint-ar`, **When** perbandingan dijalankan, **Then** kata dilaporkan sebagai pergeseran batas, bukan sebagai kegagalan umum, dan kedua bentuk ditampilkan.
2. **Given** pemenggalan KBBI dan plugin memakai tanda pisah berbeda, **When** perbandingan dijalankan, **Then** perbedaan tanda pisah saja **tidak** dihitung sebagai perbedaan hasil.
3. **Given** sebuah kata tidak memiliki data pemenggalan di KBBI, **When** kata itu diuji, **Then** kata dicatat sebagai "data tidak tersedia", bukan sebagai kegagalan.
4. **Given** laporan pemenggalan, **When** laporan dibuka, **Then** tingkat kecocokan pemenggalan ditampilkan terpisah dari tingkat kecocokan kata dasar.

---

### User Story 3 - Memperbaiki cacat bertahap tanpa regresi (Priority: P3)

Sebagai pengelola repositori, saya ingin memperbaiki cacat dalam batch kecil yang berurutan, dan saya ingin kepastian bahwa setiap perbaikan yang sudah selesai tidak rusak kembali pada tahap berikutnya.

**Why this priority**: Perbaikan massal sekaligus berisiko merusak perilaku yang sudah benar dan menghasilkan perubahan yang mustahil ditinjau. Batas batch kecil bersama pengaman regresi adalah yang membuat pendekatan bertahap menjadi pekerjaan yang berkelanjutan.

**Independent Test**: Ambil daftar cacat yang sudah terklasifikasi, perbaiki satu batch kecil, jalankan ulang pengukuran untuk batch itu dan untuk seluruh kasus yang pernah diperbaiki sebelumnya, lalu verifikasi bahwa kasus yang sudah diperbaiki tetap benar dan tingkat kecocokan total tidak pernah turun.

**Acceptance Scenarios**:

1. **Given** daftar cacat terklasifikasi, **When** daftar itu dipecah menjadi tahap perbaikan, **Then** setiap tahap memuat jumlah temuan yang dibatasi dan dapat dihitung, beserta daftar kasus yang akan diverifikasi.
2. **Given** sebuah tahap perbaikan selesai, **When** tahap berikutnya dijalankan, **Then** seluruh kasus yang sudah diperbaiki pada tahap sebelumnya dijalankan kembali dan tetap benar.
3. **Given** tingkat kecocokan total pada akhir suatu tahap, **When** tahap berikutnya selesai, **Then** tingkat kecocokan total tidak lebih rendah daripada tahap sebelumnya.
4. **Given** sebuah perbaikan yang tanpa sengaja merusak kasus lain, **When** verifikasi tahap dijalankan, **Then** penyimpangan terdeteksi, perbaikan ditandai gagal, dan dapat dikembalikan.
5. **Given** tahap yang sudah selesai, **When** repositori dipulihkan ke kondisi tahap tersebut, **Then** hasil pengukuran yang tercatat untuk tahap itu dapat direproduksi.

---

### User Story 4 - Menjalankan pengukuran secara deterministik tanpa jaringan (Priority: P4)

Sebagai pengelola repositori atau kontributor, saya ingin menyimpan snapshot data referensi yang di-*pin* beserta versi dataset yang dipakai, sehingga saya dapat menjalankan dan mengulang pengukuran tanpa koneksi jaringan dan tanpa server MCP.

**Why this priority**: Sumber data bawaannya adalah CDN yang dapat berubah sewaktu-waktu. Tanpa pin, angka akurasi bulan lalu tidak dapat dibandingkan dengan angka bulan ini, dan regresi bisa lolos tanpa terdeteksi.

**Independent Test**: Dari sebuah snapshot yang sudah tersimpan, jalankan pengukuran penuh tanpa akses jaringan; verifikasi hasilnya sama dengan hasil yang tercatat saat snapshot diambil, dan verifikasi snapshot menyatakan versi data yang dipakai.

**Acceptance Scenarios**:

1. **Given** snapshot yang sudah tersimpan, **When** pengukuran dijalankan tanpa akses jaringan, **Then** pengukuran berhasil dan tidak memerlukan koneksi.
2. **Given** sebuah snapshot, **When** snapshot diperiksa, **Then** snapshot menyatakan penanda versi data sumber, waktu pengambilan, dan jumlah entri yang tersimpan.
3. **Given** snapshot yang sama, **When** pengukuran dijalankan berulang kali, **Then** hasilnya identik setiap kali.
4. **Given** mode snapshot, **When** pengguna mencoba mengambil data di luar snapshot, **Then** data tersebut tidak ikut terpakai sampai pengguna mengambil snapshot baru secara eksplisit.

---

### User Story 5 - Menjamin perbaikan tidak merusak pencarian (Priority: P5)

Sebagai pembaca situs dokumentasi, saya ingin perbaikan kata dasar dan pemenggalan tetap membuat pencarian bekerja: mengetik akar kata harus tetap menemukan halaman yang memuat bentuk turunannya, dan sebaliknya.

**Why this priority**: Pencarian adalah nilai utama yang dilihat pengguna akhir. Perbaikan internal apa pun tidak boleh mengorbankan hasil pencarian yang selama ini sudah baik.

**Independent Test**: Siapkan corpus dokumen dengan pasangan kata turunan dan akar yang sudah diketahui, jalankan pencarian untuk akar dan untuk bentuk turunannya, lalu verifikasi kedua arah sama-sama menemukan dokumen yang benar.

**Acceptance Scenarios**:

1. **Given** halaman yang memuat "berkembang", **When** pembaca mencari akar "kembang", **Then** halaman tersebut muncul di hasil.
2. **Given** halaman yang memuat bentuk turunan dari akar "bantu", **When** pembaca mencari "membantu", **Then** halaman tersebut muncul di hasil.
3. **Given** daftar kasus regresi yang sudah diperbaiki, **When** pencarian dijalankan atas kasus-kasus itu, **Then** setiap kasus tetap menghasilkan dokumen yang diharapkan.

### Edge Cases

- **Kata dasar tanpa `rootWord`**: KBBI mengosongkan `rootWord` untuk kata dasar, dan perkakas rujukan mengembalikan kata itu sendiri disertai catatan bahwa kata tersebut kemungkinan kata dasar. Kasus ini harus dianggap **cocok**, bukan cacat.
- **Kata turunan dengan pemetaan ganda**: beberapa kata berimbuhan memiliki lebih dari satu entri dengan akar berbeda. Aturan yang berlaku (keputusan 2026-10-07): akar yang dipakai adalah **entri teratas yang memiliki pemetaan akar, sesuai urutan file**. Aturan ini sengaja sama dengan aturan yang dipakai perkakas rujukan `cari_kata_dasar`, sehingga setiap selisih yang muncul adalah selisih yang nyata, bukan akibat dua aturan pemecahan yang berbeda.
- **Kata tidak ada di KBBI**: tool referensi mengembalikan error. Kata harus masuk penghitung "data tidak tersedia", bukan penghitung kegagalan.
- **Reduplikasi (`buku-buku`)**: bentuk reduplikasi umumnya tidak tercatat sebagai entri tersendiri di lexicon. Reduplikasi perlu ditetapkan secara eksplisit sebagai berada di luar atau di dalam cakupan pengukuran; jika di luar, tidak boleh dihitung sebagai kegagalan.
- **Kata majemuk dan imbuhan berlapis (`menuliskan`, `memdoctoral`)**: data KBBI dapat tidak memuat bentuk ini atau memuat akar yang berbeda dari hasil algoritma; harus dipilah sebagai selisih data, bukan bug.
- **Bahasa asing dan serapan (`komputer`, `protes`, `aktual`)**: pola fonotaktik berbeda; selisih pada sekumpulan kata ini sebaiknya dilaporkan sebagai kelompok tersendiri agar tidak mengaburkan pola utama.
- **Perbedaan satu suku kata**: pemenggalan dengan jumlah suku kata benar tetapi bergeser satu batas harus diklasifikasi terpisah dari pemenggalan dengan jumlah suku kata berbeda, karena akar sebabnya berbeda.
- **Pemenggalan kosong**: sebagian entri mungkin tidak punya data pemenggalan; harus diperlakukan sebagai "data tidak tersedia".
- **Kegagalan jaringan atau MCP di tengah pengukuran**: pengukuran harus dapat dilanjutkan dari titik terakhir yang selesai; kata yang belum sempat diproses tidak boleh tercatat sebagai gagal.
- **Perubahan data hulu**: bila dataset sumber berubah, hasil pengukuran lama menjadi tidak sebanding. Laporan harus selalu menyatakan versi data yang dipakai.
- **Sampel kecil**: untuk batch kecil, persentase kecocokan sangat sensitif; laporan harus menampilkan jumlah sampel bersama persentasenya agar tidak menyesatkan.
- **MCP tidak terautentikasi atau tidak dapat dihubungi**: pengukuran harus berhenti dengan pesan yang jelas dan menawarkan jalur snapshot, bukan diam-diam melaporkan angka yang menyesatkan.
- **Lisensi dan atribusi**: data KBBI memiliki lisensi ISC dengan holders hak cipta yang berbeda dari kode proyek. Atribusi wajib, dan data tidak boleh ikut terbundel ke paket yang dipublikasikan.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem pengukuran WAJIB membandingkan akar kata yang dihasilkan stemming plugin dengan akar kata dari sumber KBBI untuk sekumpulan kata berimbuhan yang ditentukan, lalu melaporkan jumlah yang diuji, jumlah yang cocok, jumlah yang berbeda, dan tingkat kecocokan.
- **FR-002**: Sistem WAJIB menghasilkan daftar temuan yang dapat diproses mesin, berisi untuk setiap kata: kata yang diuji, hasil plugin, hasil KBBI, sumber data, dan klasifikasi selisih.
- **FR-003**: Sistem WAJIB mengklasifikasikan setiap selisih ke dalam kategori minimal: (a) kata dasar yang sah karena KBBI tidak punya `rootWord`, (b) data tidak tersedia di KBBI, (c) selisih data yang kemungkinan berasal dari perbedaan pengetahuan sumber, dan (d) kandidat cacat. Kategori (a) dan (b) tidak boleh dihitung sebagai kegagalan.
- **FR-004**: Sistem WAJIB mendukung pembatasan cakupan per huruf awal dan ukuran batch yang dapat dikonfigurasi, serta melaporkan cakupan yang benar-benar diukur.
- **FR-005**: Pengukuran WAJIB dapat dijalankan ulang untuk cakupan yang sama tanpa menggandakan entri temuan dan tanpa mengubah hasil pengukuran.
- **FR-006**: Sistem WAJIB membandingkan pemenggalan suku kata plugin dengan pemenggalan KBBI setelah menormalkan tanda pisah, dan menampilkan tingkat kecocokan pemenggalan secara terpisah dari tingkat kecocokan kata dasar.
- **FR-007**: Sistem WAJIB mengklasifikasikan selisih pemenggalan ke dalam: pergeseran batas suku kata, jumlah suku kata berbeda, pemenggalan kosong atau tidak ada, dan kandidat cacat.
- **FR-008**: Sistem WAJIB dapat menguraikan daftar temuan menjadi tahap-tahap perbaikan, dengan batas jumlah temuan maksimum per tahap yang dapat dikonfigurasi.
- **FR-009**: Setiap temuan yang ditandai sudah diperbaiki WAJIB menjadi kasus regresi permanen yang dijalankan pada seluruh tahap berikutnya.
- **FR-010**: Sistem WAJIB menolak menandai tahap berhasil bila ada kasus regresi yang kembali gagal atau bila tingkat kecocokan total turun dibanding tahap sebelumnya; tahap tersebut ditandai gagal dan dapat dikembalikan.
- **FR-011**: Sistem WAJIB dapat menyimpan snapshot data referensi beserta penanda versi data, waktu pengambilan, dan jumlah entri.
- **FR-012**: Pengukuran WAJIB dapat dijalankan sepenuhnya dari snapshot tanpa akses jaringan dan tanpa server MCP.
- **FR-013**: Pengukuran dari snapshot yang sama WAJIB menghasilkan laporan yang identik pada setiap pengulangan.
- **FR-014**: Laporan WAJIB selalu menyatakan versi data sumber yang dipakai, cakupan berupa huruf dan jumlah kata yang diukur, serta waktu pengukuran.
- **FR-015**: Pengukuran WAJIB dapat dilanjutkan setelah kegagalan di tengah jalan tanpa mengulang kata yang sudah selesai dan tanpa mencatat kata yang belum sempat diproses sebagai gagal.
- **FR-016**: Ketika ketersediaan MCP hilang, sistem WAJIB berhenti dengan pesan yang menjelaskan penyebab dan jalan keluar berupa snapshot yang harus diambil pengguna, dan tidak melaporkan angka kecocokan apa pun.
- **FR-017**: Perkakas pengukuran itu sendiri WAJIB berada sepenuhnya di luar jalur paket yang dipublikasikan dan tidak boleh menambah dependensi runtime. Perubahan pada algoritma plugin hasil perbaikan cacat tetap diperbolehkan, namun WAJIB melewati pengaman regresi FR-009 dan FR-010 serta verifikasi FR-019 sebelum dianggap selesai.
- **FR-018**: Data KBBI tidak boleh ikut terbundel ke dalam paket plugin yang dipublikasikan, tidak boleh diambil saat runtime, dan atribusi sumber data beserta lisensinya wajib dicantumkan.
- **FR-019**: Sistem WAJIB memverifikasi bahwa perbaikan kata dasar dan pemenggalan tidak merusak hasil pencarian, pada dua tingkat. Tingkat pertama: pemeriksaan cepat di tingkat unit yang berjalan bersama test biasa, menguji pasangan kata turunan dan akar beserta seluruh kasus regresi. Tingkat kedua: satu verifikasi build penuh pada akhir setiap tahap. Tingkat pertama wajib ada pada setiap kali test biasa dijalankan; tingkat kedua wajib ada sekali per tahap sebelum tahap boleh dinyatakan lulus.
- **FR-020**: Laporan WAJIB menyajikan hasil per huruf awal dan per kelas kata, sehingga pola selisih terlihat tanpa harus membaca seluruh daftar temuan.
- **FR-021**: Data KBBI diperlakukan **hanya sebagai sumber pembanding di luar paket**. Setiap perbaikan hasil pengukuran WAJIB diterapkan pada algoritma plugin dengan tetap menjaga jumlah dependensi paket agar tetap minimum; tidak boleh ada kamus akar kata hasil temuan yang ikut terbundel ke paket atau diambil saat runtime.
- **FR-022**: Karena data KBBI tidak diadopsi ke runtime, selisih yang tidak dapat dijelaskan algoritma WAJIB dicatat sebagai keterbatasan yang diketahui, bukan sebagai alasan menambah data ke paket. Setiap temuan yang ditutup dengan alasan tersebut WAJIB menyebut alasan teknis dan baseline akurasi pada saat temuan itu ditemukan.
- **FR-023**: Ketika sebuah perbaikan mengubah hasil untuk kata yang tercantum pada tabel contoh kontrak di `contracts/public-api.md`, pada golden fixture, atau pada tabel override internal, sistem WAJIB memperbarui kontrak dan test-nya di perubahan yang sama, dan WAJIB mencatat alasannya pada bagian Clarifications di spesifikasi ini. Pembaruan tanpa jejak tersebut dianggap belum lengkap.

### Key Entities

- **Kata Referensi**: satu entri kamus yang dipakai sebagai sumber kebenaran, memuat kata, akar kata bila ada, pemenggalan suku kata, dan kelas kata; berasal dari dataset KBBI pada versi tertentu.
- **Batch Pengukuran**: satu unit kerja pengukuran, mencakup huruf awal, jumlah kata yang dituju, jumlah yang sudah selesai, dan titik lanjutan.
- **Temuan**: satu perbedaan antara hasil plugin dan hasil referensi, memuat kata, kapabilitas yang diuji (kata dasar atau pemenggalan), hasil plugin, hasil referensi, klasifikasi selisih, status (terbuka, diperbaiki, atau ditolak), dan tahap tempat ia diperbaiki.
- **Tahap Perbaikan**: satu batch perbaikan, memuat daftar temuan yang dikerjakan, tingkat kecocokan sebelum dan sesudah, tanggal, serta status berhasil atau gagal.
- **Kasus Regresi**: kasus uji permanen yang berasal dari temuan yang sudah diperbaiki dan wajib dijalankan pada setiap tahap berikutnya.
- **Snapshot Data**: salinan data referensi yang di-pin, beserta penanda versi data, waktu pengambilan, jumlah entri, dan sidik jari isi agar perubahan isi terdeteksi.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tingkat kecocokan akar kata plugin terhadap KBBI mencapai minimal **98%** pada seluruh lexicon kata turunan yang memiliki pemetaan akar, dengan kasus data tidak tersedia dan kata dasar sah dikeluarkan dari pembilang.
- **SC-002**: Tingkat kecocokan pemenggalan suku kata mencapai minimal **97%** pada stratum korpus inti, dengan kasus tanpa data dan kata berstratum serapan dikeluarkan dari pembilang. Angka untuk stratum serapan dilaporkan terpisah dan tidak pernah menjadi gerbang kelulusan.
- **SC-003**: Setiap tahap perbaikan memuat paling banyak **20 temuan** dan selesai dalam **1 hari kerja**.
- **SC-004**: **Nol regresi** — pada setiap tahap, seluruh kasus regresi dari tahap sebelumnya tetap lulus dan tingkat kecocokan total tidak pernah turun antar tahap.
- **SC-005**: Pengukuran penuh atas lexicon dapat dijalankan ulang dari snapshot dalam waktu paling lama **30 menit**, dan hasilnya identik dengan hasil yang tercatat.
- **SC-006**: **100%** temuan yang diklasifikasikan sebagai selisih data memiliki alasan triase yang tercatat, sehingga tidak ada temuan yang ditutup tanpa alasan.
- **SC-007**: Setiap perbaikan yang selesai dapat direproduksi: menjalankan ulang verifikasi pada tahap yang sama menghasilkan status lulus atau gagal yang sama.
- **SC-008**: Ukuran paket yang dipublikasikan dan jumlah dependensi runtime **tidak bertambah** akibat feature ini, dan paket tetap dapat melayani pencarian serta pemenggalan tanpa akses jaringan.
- **SC-009**: Atribusi sumber data KBBI beserta lisensinya tercantum di berkas atribusi proyek sebelum feature ini dianggap selesai.
- **SC-010**: Kontributor baru dapat menjalankan pengukuran penuh dari snapshot dengan mengikuti dokumentasi, dengan waktu penyiapan tidak lebih dari **15 menit** dan tanpa memerlukan server MCP.
- **SC-011**: Tidak ada temuan berstatus terbuka tanpa penjelasan pada saat feature dianggap selesai; sisanya terdokumentasi sebagai selisih data atau keterbatasan yang diketahui.
- **SC-012**: Karena kamus akar kata KBBI tidak diadopsi ke runtime, setiap selisih yang ditutup sebagai keterbatasan diketahui disertai alasan teknis, bukan sekadar "tidak penting".
- **SC-013**: **100%** perubahan hasil yang tercantum pada tabel contoh kontrak, golden fixture, atau tabel override internal disertai pembaruan kontrak dan test-nya pada perubahan yang sama, serta satu entri alasan pada bagian Clarifications. Tidak ada perubahan terkunci yang lolos tanpa jejak.
- **SC-014**: Setiap tahap perbaikan menutup dengan tepat satu verifikasi build penuh yang lulus, dan pemeriksaan cepat tingkat unit berjalan bersama setiap `npm test`. Tidak ada tahap yang dinyatakan lulus tanpa keduanya.

## Assumptions

- Kedua repositori yang dirujuk adalah repositori milik pengguna sendiri di bawah akun GitHub yang sama seperti pada spec 001, dan pengguna memegang hak atas hasilnya.
- Data KBBI pada kedua repositori tersebut berizi ISC dengan holders hak cipta data yang berbeda dari kode proyek. Atribusi wajib, dan lisensi tersebut mengizinkan penggunaan untuk keperluan maupun non-keperluan alike.
- Data KBBI bersifat definitif dan konsisten, dan menjadi otoritas terakhir atas kebenaran linguistik (lihat Clarifications sesi 2026-10-07). Ketidaksesuaian antara plugin dan KBBI tidak lagi menjadi pertanyaan "mana yang salah": KBBI yang benar, dan kontrak atau golden fixture yang perlu diperbarui. Triase tetap wajib, tetapi tujuannya membedakan cacat plugin dari selisih data, bukan untukimbangagainst KBBI.
- Sumber data bawaannya adalah CDN yang berubah dari waktu ke waktu, sehingga hasil pengukuran hanya sebanding antar tahap bila memakai versi data yang sama.
- Tool MCP di `kbbi-mcp-server` menjadi antarmuka pilihan untuk mengambil data referensi. Jalur alternatif berupa snapshot lokal disediakan agar feature tetap dapat dijalankan tanpa MCP.
- Kapabilitas yang divalidasi adalah stemming, pemenggalan kata, serta dampak keduanya terhadap pencarian, sesuai cakupan spec 001. Tidak ada kapabilitas bahasa baru yang ditambahkan.
- **Keputusan sesi 2026-10-07: tabel onset cluster pada mesin pemenggalan dibiarkan apa adanya.** Cluster `kn`, `kw`, `kh`, `gh`, `ph`, `tr`, `tw`, `ps`, dan `bl` dianggap sah oleh mesin ini dan akan tetap dianggap sah. Konsekuensinya, kata yang pemenggalannya bergantung pada cluster tersebut di stratum serapan, dan selisihnya di luar cakupan permanen - bukan temuan yang menunggu diperbaiki. Daftar onset tersebut dipakai sebagai **alat klasifikasi** saat pengukuran, bukan sebagai daftar cacat.
- Reduplikasi, kata majemuk, dan bentuk serapan bahasa asing berada di luar cakupan pengukuran tingkat kecocokan. Kata tersebut tetap berfungsi, tetapi selisihnya tidak dihitung sebagai kegagalan terhadap Success Criteria.
- Pengguna akhir paket, yaitu penulis situs dan pembaca dokumentasi, tidak pernah melihat instrumentation ini; seluruhnya bersifat internal repositori.
- **Keputusan runtime (2026-10-07): data KBBI hanya diperlakukan sebagai sumber pembanding, tidak pernah menjadi kamus akar kata runtime.** Alasannya, jaminan spec 001 bahwa situs statis tetap berfungsi offline tanpa layanan tambahan dianggap lebih penting daripada akurasi akar kata yang mendekati sempurna. Konsekuensinya, SC-001 dan SC-002 adalah plafon yang dikejar oleh algoritma, bukan langkah menuju penyelesaian; selisih yang tidak bisa dijelaskan algoritma dicatat sebagai keterbatasan diketahui melalui FR-022.

## Batasan Cakupan *(Out of Scope)*

- Menambah kapabilitas bahasa baru di luar cakupan spec 001.
- Mengoreksi atau memperbarui data KBBI di repositori sumber; data diperlakukan apa adanya sebagai sumber kebenaran.
- Menggabungkan kamus akar kata atau data pemenggalan KBBI ke dalam paket plugin atau ke jalur pemuatannya saat runtime (keputusan Q1).
- Membangun antarmuka atau layanan baru yang menghadap pengguna akhir.
- Menggantikan lint, typecheck, dan test suite yang sudah ada.
- Mengotomatiskan perbaikan kode tanpa persetujuan manusia; setiap tahap perbaikan tetap melewati tinjauan manusia.
