# Contract: Format Snapshot

**Feature**: 002-validasi-kbbi-berbertahap | **Versi**: 1

Menetapkan bentuk berkas snapshot. Snapshot adalah sumber kebenaran tunggal
untuk seluruh pengukuran; kontrak ini yang menjamin dua orang melihat dataset
yang sama.

## Lokasi

```text
.kbbi/snapshot/<tag>/manifest.json
.kbbi/snapshot/<tag>/raw/<path-yang-diambil>
```

`<tag>` selalu `data-v4` pada versi feature ini.

## Asal data

```text
https://cdn.jsdelivr.net/gh/mlengse/kbbi-harvester-cdn@data-v4/<path>
```

Fallback yang diizinkan: `https://raw.githubusercontent.com/mlengse/kbbi-harvester-cdn/data-v4/<path>`.
Unduhan hanya dilakukan oleh perintah pengambilan snapshot. Semua perintah lain
hanya membaca berkas lokal.

## manifest.json

```json
{
  "toolkitVersion": 1,
  "tag": "data-v4",
  "capturedAt": "2026-10-07T20:45:00Z",
  "entryCount": {
    "derived": 33268,
    "rootWords": 11170,
    "syllables": 0
  },
  "files": [
    {
      "path": "lexicon/derived_to_root_with_kelas.json",
      "blobSha": "4bdde8ad0cc8df523dc6b1d25558ac9843507afc",
      "bytes": 2756704,
      "sha256": "<64 hex>"
    },
    {
      "path": "hyphenation/kbbi_vi_hyphenation_dict.json",
      "blobSha": "664e7a99966e41af09fa90670b7a1685424c145b",
      "bytes": 2131198,
      "sha256": "<64 hex>"
    }
  ]
}
```

### Wajib

| Field | Aturan |
| --- | --- |
| `toolkitVersion` | Integer. Saat ini `1`. |
| `tag` | `"data-v4"`. |
| `capturedAt` | ISO-8601 UTC. |
| `files[].path` | Unik dalam manifest. |
| `files[].blobSha` | 40 hex. Harus cocok tabel di research R2. |
| `files[].sha256` | 64 hex, isi setelah unduhan. |
| `entryCount` | Ketiga kunci wajib ada; `0` sah bila sumbernya kosong. |

### Verifikasi

1. `blobSha` tiap file cocok dengan tabel R2.
2. `sha256` isi berkas lokal cocok dengan manifest.
3. `entryCount` cocok dengan hasil baca.

**Perilaku saat gagal**:
- Blob SHA tidak cocok → snapshot **ditolak**, pesan menyebut nilai yang diharapkan
  dan yang ditemukan. Ini menangkap kasus tag salah.
- `sha256` tidak cocok → unduhan dianggap gagal, berkas dihapus, ulangi.
- `entryCount` tidak cocok → snapshot **ditolak** dengan pesan yang menyebut kedua
  angka.

Tidak ada jalur yang melanjutkan dengan data yang tidak terverifikasi.

## Bentuk payload mentah

Berkas diambil apa adanya dari repo data, tidak ditulis ulang. Bentuknya
sumber kebenaran, bukan pilihan kita:

### `lexicon/derived_to_root_with_kelas.json`

```json
{ "membantu": { "kataDasar": "bantu", "kelasKata": ["v"] } }
```

### `lexicon/derived_to_root.json`

```json
{ "membantu": "bantu" }
```

### `lexicon/root_words.txt` dan `lexicon/derived_words.txt`

Satu kata per baris, dipisah baris baru.

### `hyphenation/kbbi_vi_hyphenation_dict.json`

```json
{ "pintar": "pin.tar", "atlantik": "At.lan.tik" }
```

Nilai memakai notasi titik. Perhatikan contoh `atlantik` yang memakai huruf
besar: bentuk kanonik wajib menurunkannya (research R8).

## Aturankanonik saat pembacaan

Berkas mentah **tidak** diubah saat disimpan. Normalisasi terjadi saat
pembacaan ke `Corpus`, di satu tempat saja:

1. `toLowerCase()` pada kata dan pemenggalan.
2. Spasi luar dihapus.
3. Tanda titik pada pemenggalan menjadi tanda hubung.
4. Tanda hubung pada kata majemuk dipertahankan.
5. Reduplikasi dipertahankan utuh.

## Jumlah minimum

Snapshot dianggap cukup hanya bila `lexicon/derived_to_root_with_kelas.json`
**dan** `hyphenation/kbbi_vi_hyphenation_dict.json` keduanya ada. Tanpa
keduanya, pengukuran pemenggalan atau pengukuran akar kata tidak dapat
dijalankan, dan perintah pengukuran **menolak jalan** dengan pesan yang
menyebut file mana yang kurang.

## Aturan interoperabilitas

- Manifest yang ada tetapi versinya lebih baru → diperingatkan, bukan gagal.
- Manifest yang rusak → diperingatkan, bukan gagal; pengguna dapat mengambil
  ulang.
- Dua tag berbeda **tidak boleh** dibandingkan. Laporan yang berbeda tag harus
  diberi tanda visibly berbeda.