# Contract: Perintah Triase Non-Kegagalan

**Feature**: 003-close-validation-workflow | **Versi**: 1

Menetapkan bentuk perintah CLI untuk menutup temuan non-kegagalan tanpa keanggotaan tahap.

## Perintah

```bash
node scripts/kbbi-validate.mjs triage \
  --capability stem|syllable \
  --class reference-missing|data-divergence|root-word-self \
  [--word "kata1,kata2"] \
  --reason "alasan teknis"
```

## Parameter

| Parameter | Wajib | Deskripsi |
|-----------|-------|-----------|
| `--capability` | Ya | `stem` atau `syllable` |
| `--class` | Ya | Kelas non-kegagalan yang akan ditutup |
| `--word` | Tidak | Daftar kata spesifik (comma-separated). Kosong = semua temuan yang cocok |
| `--reason` | Ya | Alasan penutupan (FR-022) |

## Perilaku

1. Perintah memuat defect store dari `.kbbi/defects/open.jsonl`
2. Memfilter temuan yang: `status = open`, `stage = null`, `capability` cocok, `class` cocok
3. Jika `--word` diberikan, hanya kata dalam daftar yang diproses
4. Setiap temuan yang cocok diubah statusnya menjadi `dismissed` dengan:
   - `withdrawnReason` = nilai `--reason`
   - `triageNote` = `Ditutup lewat triase non-kegagalan: {reason}`
5. Store ditulis ulang

## Penolakan

| Kondisi | Pesan |
|---------|-------|
| `--reason` kosong | `alasan wajib diisi: penolakan tanpa alasan melanggar FR-022` |
| `--class` bukan non-kegagalan | `kelas {class} bukan kelas non-kegagalan` |
| Tidak ada temuan yang cocok | `tidak ada temuan terbuka dengan kelas {class} untuk kapabilitas {capability}` |

## Contoh

```bash
# Tutup semua reference-missing untuk syllable
node scripts/kbbi-validate.mjs triage \
  --capability syllable \
  --class reference-missing \
  --reason "Kata tidak ditemukan di kamus pemenggalan KBBI. Bukan kegagalan plugin."

# Tutup kata spesifik
node scripts/kbbi-validate.mjs triage \
  --capability stem \
  --class data-divergence \
  --word "antui, mengingkari" \
  --reason "Onset non-Indonesia, di luar cakupan permanen (keputusan 2026-10-07)."
```
