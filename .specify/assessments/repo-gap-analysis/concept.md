# Concept: Repo gap analysis for next-step formulation

- **Slug**: repo-gap-analysis
- **Created**: 2026-10-10
- **Recommended option**: A + B (sequential)

## Options

### Option A — Tutup jalur penutup temuan non-kegagalan
- **Sketch**: Beri temuan berkelas non-kegagalan (`reference-missing`, `data-divergence`, `root-word-self`) jalur penutup yang dapat dieksekusi — mereka saat ini tidak bisa masuk tahap (bukan failure class) dan tidak bisa di-dismiss (tidak punya stage). Setelah ini setiap temuan `open` punya perintah CLI valid untuk menutupnya.
- **Appetite**: small
- **Trade-offs**: Menangkan — SC-011 menjadi dapat dicapai; risiko mendekat nol karena tidak menyentuh workflow perbaikan.orbankan — tidak menyentuh masalah skala 26.463 temuan syllable; tetap butuh keputusan terpisah untuk itu.
- **Rabbit holes**: Penambahan perintah baru bisa tarik-menarik ke arah re-klasifikasi massal yang tidak terkontrol; harus dibatasi pada kelas non-kegagalan saja.

### Option B — Definisikan ulang kriteria selesai spec 002
- **Sketch**: Tulis eksplisit di spec 002 kapan spec dinyatakan "selesai" — mis. setiap temuan tertutup (`fixed` atau `dismissed` dengan alasan), akurasi SC-001/SC-002 dicatat sebagai plafon terakhir. Ini menyelesaikan ketegangan antara SC-011 dan §Assumptions §341.
- **Appetite**: small
- **Trade-offs**: Menangkan — kriteria selesai yang tegas dan dapat diverifikasi; kontributor dapat menilai sisa kerja.orbangkan — butuh amendmen spec (proses konstitusi); tidak mengurangi backlog temuan sama sekali.
- **Rabbit holes**: Amendmen konstitusi jika kriteria baru dianggap prinsip baru; pergeseran semantik dari "selesai" menjadi "cukup" bisa politis.

### Option C — Skalakan workflow untuk triase massal syllable
- **Sketch**: Naikkan batas 20 temuan/tahap atau tambah jalur triase massal untuk kelas mekanis syllable (`syllable-boundary-shift`, `syllable-count-diff`) agar 26.463 temuan dapat diproses dalam rentang waktu rasional.
- **Appetite**: large
- **Trade-offs**: Menangkan — menangani masalah skala yang sebenarnya.orbangkan — risiko melemahkan gerbang regresi (FR-009/FR-010); mass-dismiss tanpa tinjauan per kata bertentangan semangat FR-022 (alasan wajib per tutupan); perubahan massal pada `OVERRIDES` berisiko merusak kontrak.
- **Rabbit holes**: Perubahan besar pada `src/core/syllabify.ts` dapat memicu cascade `contract-locked` (FR-023) di ratusan kata; definisi "massal" kabur — per kelas, per huruf, atau per pola cacat?

## Recommendation

**A lalu B, C ditangguhkan.** A adalah "smallest thing that could work" yang membuat SC-011 dapat dicapai; B membuat kriteria selesai eksplisit dan dapat diverifikasi. Keduanya small dan tidak saling bergantung pada keputusan skala. C ditangguhkan sampai B selesai — tidak mungkin memutuskan seberapa banyak yang harus diproses sebelum diketahui arti "selesai". C tetap terbuka sebagai keputusan terpisah setelah kriteria selesai ada.

Alasan diikat ke metrik sukses: setelah A, setiap temuan `open` punya jalur penutup valid (metrik 1). setelah B, kriteria selesai tertulis dan dapat diverifikasi (metrik 2). Metrik 3 (rasionalitas jumlah tahap) baru bermakna setelah B.

## Out of Scope (untuk opsi yang direkomendasikan)

- Perubahan pada workflow perbaikan berjenjang (tahap, gerbang, promosi) — diserahkan ke keputusan terpisah setelah B
- Perubahan algoritma `stem()` / `syllabify()` di luar yang diperlukan untuk menutup temuan non-kegagalan
- Penambahan kapabilitas bahasa baru di luar cakupan spec 001
- Perubahan data KBBI sumber

## Assumptions to Validate

- `reference-missing` memang perlu ditutup (bukan cukup dilaporkan sebagai keterbatasan diketahui) — terbuka dari research.md
- Kriteria selesai baru tidak dianggap amendmen prinsip konstitusi (hanya klarifikasi/penulisan ulang §Assumptions)
- Batas 20 temuan/tahap tidak dinaikkan sampai kriteria selesai eksplisit ada
