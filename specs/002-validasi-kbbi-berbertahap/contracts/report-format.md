# Contract: Bentuk Laporan Pengukuran

**Feature**: 002-validasi-kbbi-berbertahap | **Versi**: 1

Menetapkan dua bentuk keluaran pengukuran: **laporan markdown** untuk humans
membandingkan antar tahap, dan **JSONL** untuk diproses mesin serta di-*diff*
antar tahap (R11).

Keduanya ditulis bersama dari data yang sama, sehingga angkanya tidak mungkin
saling bertentangan.

## Lokasi

```text
.kbbi/reports/stem-<scope>-<runId>.md
.kbbi/reports/stem-<scope>-<runId>.jsonl
.kbbi/reports/syllable-<scope>-<runId>.md
.kbbi/reports/syllable-<scope>-<runId>.jsonl
```

`<scope>` adalah huruf awal (`m`) atau `all`. `<runId>` adalah stempel waktu
dalam UTC ringkas, misal `20261007T204500Z`.

## JSONL

Satu baris JSON per temuan. **Tidak** ada baris ringkasan di berkas ini.
Schema tiap baris ada di `data-model.md` §4.

```json
{"word":"memdoctoral","capability":"stem","pluginOutput":"doktor","referenceOutput":"doktoral","class":"affix-strip-missed","stratum":null,"kelasKata":["v"],"source":"snapshot","triageNote":"Sufiks -al belum dilepas","status":"open","stage":null,"firstSeenRun":"stem-m-20261007T204500Z"}
```

### Aturan JSONL

1. Satu baris = satu temuan. Tidak ada array di dalam berkas.
2. Kunci **berurutan tetap** seperti contoh di atas, agar *diff* antar tahap
   terbaca manusia.
3. `null` ditulis eksplisit, bukan dihilangkan.
4. Baris ditulis terurut `word` menaik, agar *diff* tidak berubah hanya karena
   urutan pemrosesan.
5. Tidak ada baris sebelum pengukuran selesai untuk cakupan itu, kecuali
   pengukuran terhenti (FR-015).

### `firstSeenRun` pada laporan bernilai `null`

Contoh baris di atas menampilkan `firstSeenRun` berisi run id, misalnya
`stem-m-20261007T204500Z`. Pada berkas JSONL **laporan** nilainya `null`.

**Alasan**: aturan determinisme di bawah mensyaratkan isi JSONL identik byte per
byte pada pengulangan dari snapshot yang sama (FR-013), sedangkan run id adalah
stempel waktu. Keduanya tidak dapat berlaku sekaligus untuk satu field. Kunci
tetap ada dengan `null` eksplisit, sehingga bentuk baris tidak pernah berubah,
dan nilai sebenarnya disimpan di `.kbbi/defects/open.jsonl` yang memang tidak
perlu stabil antar-jalannya.

Diperbarui sebagai bagian dari tahap implementasi pertama pada 2026-10-07,
dengan alasan tercatat di bagian `## Clarifications` pada `spec.md` (Prinsip I).

### Pengukuran terhenti

Ketika jaringan hilang di tengah jalan, kata yang sudah selesai **tetap ditulis**
dan kata yang belum sempat diproses **tidak boleh** muncul sebagai temuan.
Pengukuran yang terhenti ditandai di laporan markdown dengan
`partial: true`, dan totalnya tidak boleh dipakai sebagai angka final.

## Laporan markdown

### Kepala wajib

Kepala laporan selalu memuat, dalam urutan ini:

```markdown
# Pengukuran <kapabilitas> — <cakupan>

- Snapshot: `data-v4` (`4bdde8ad…` + `664e7a99…`)
- Cardinality: 33268 kata turunan, 11170 kata dasar
- Dijalankan: 2026-10-07T20:45:00Z → 2026-10-07T20:47:12Z
- Perkakas: 1
- Mode: snapshot (tanpa jaringan)
```

**Kegagalan wajib**: bila `Snapshot` atau `Cardinality` hilang, laporan dianggap
tidak valid. Tanpa tag dan SHA, hasil antar tahap tidak sebanding (R2).

### Blok angka

```markdown
## Ringkasan

| Metrik | Nilai |
| --- | --- |
| Diuji | 32.000 |
| Cocok | 31.360 |
| Berbeda | 640 |
| Akurasi | 98,00% |
| Data tidak tersedia | 268 |
| Di luar cakupan | 0 |
```

**Aturan pemformatan**:
- Angka memakai pemisah ribuan titik, desimal koma (bahasa Indonesia).
- `Akurasi` dicetak hanya bila `Diuji > 0`. Bila nol, cetak
  `tidak diukur` — **jangan** cetak `0%` (FR-016).
- `Data tidak tersedia` dan `Di luar cakupan` **tidak** masuk pembilang akurasi.

### Blok pemecahan (FR-020)

```markdown
## Per huruf awal

| Huruf | Diuji | Cocok | Akurasi |
| --- | --- | --- | --- |
| a | 1.204 | 1.180 | 98,01% |
| b | 2.011 | 1.970 | 97,96% |

## Per kelas kata

| Kelas | Diuji | Cocok | Akurasi |
| --- | --- | --- | --- |
| n | 12.400 | 12.150 | 97,98% |
| v | 14.800 | 14.500 | 97,97% |

## Per stratum (pemenggalan saja)

| Stratum | Diuji | Cocok | Akurasi |
| --- | --- | --- | --- |
| core | 98.000 | 95.000 | 96,94% |
| loan | 4.200 | 3.100 | 73,81% |
```

**Aturan**: `Per stratum` **hanya** muncul pada laporan `syllable`. Baris `core`
adalah satu-satunya yang menjadi gerbang kelulusan (SC-002). Baris `loan` dilaporkan
untuk transparansi saja dan tidak pernah menjadi temuan (keputusan 2026-10-07).

### Blok temuan

```markdown
## Temuan

| Kata | Plugin | Referensi | Kelas | Catatan |
| --- | --- | --- | --- | --- |
| memdoctoral | doktor | doktoral | affix-strip-missed | Sufiks -al belum dilepas |
| bukunya | buk | buku | plural-root | |
```

Tabel temuan **dibatasi 50 baris** pertama, diurutkan kelas lalu kata. Bila
temuannya lebih, laporan menambahkan:

```markdown
_Menampilkan 50 dari 640 temuan. Lihat `.jsonl` untuk daftar lengkap._
```

Tabel markdown adalah ringkasan comfort; **JSONL adalah acuan**. Ini mencegah
laporan menjadi tidak terbaca tanpa kehilangan data.

### Blok gate

```markdown
## Gate

- Gate `stem`: 98,00% (target 98%) - LOLOS
- Gate `syllable/core`: 96,94% (target 97%) - GAGAL
- Regresi: 0
```

Bila pengukuran terputus:

```markdown
> **PENGUKURAN TERPUTUS.** 1.240 kata selesai, sisa tidak diukur
> karena jaringan hilang. Angka di bawah ini bukan angka final.
```

## Aturan determinisme (FR-013)

Diberi snapshot yang sama dan kode yang sama:

- Isi JSONL **harus identik** byte per byte.
- Laporan markdown **harus identik** kecuali blok waktu.

Ini yang membuat SC-005 dan SC-007 dapat diuji. Konsekuensinya, waktu tidak boleh
memengaruhi angka, dan pengurutan tidak boleh bergantung pada urutan pemrosesan.

## Pemotongan

- `data-divergence` **tidak** ikut `Gate`. Ia dilaporkan pada blok temuan dan
  pada blok stratum, tetapi tidak pernah menggagalkan gate (FR-003).
- `reference-missing` dan `root-word-self` **tidak** masuk `Diuji`.
