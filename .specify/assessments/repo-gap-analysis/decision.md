# Decision: Repo gap analysis for next-step formulation

- **Slug**: repo-gap-analysis
- **Decided**: 2026-10-10
- **Verdict**: go
- **Artifacts reviewed**: intake.md, research.md, problem.md, concept.md

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | strong | 5.932 temuan `reference-missing` tanpa jalur penutup CLI — terbukti dari kode `planStage` dan `dismissStageFindings`; 26.463 temuan syllable butuh ±1.323 tahap dengan batas 20/tahap |
| Evidence strength | strong | Seluruh bukti dari kode (`tools/kbbi/stages.ts`, `compare.ts`, `cli.ts`), spec, dan laporan pengukuran `.kbbi/reports/` — tanpa asumsi untuk temuan inti |
| Value vs. inaction | strong | SC-011 tidak dapat dicapai tanpa perubahan; spec 002 tidak pernah mencapai status selesai; kontributor kehilangan sinyal kapan pekerjaan tuntas |
| Feasibility / appetite | adequate | A+B keduanya small (hari, bukan minggu); C ditangguhkan dengan alasan yang terdokumentasi |
| Strategic fit | adequate | Sesuai konstitusi spec 002 (KBBI otoritas, gerbang regresi, FR-022 alasan wajib); tidak melanggar prinsip aktif |
| Risk posture | adequate | Risiko utama (C: melemahkan gerbang, cascade contract-locked) ditangguhkan; A dibatasi pada kelas non-kegagalan; B memerlukan amendmen spec tapi tidak prinsip baru |

## Verdict & Rationale

**Go — Option A lalu B, sekuensial.** Masalah valid dan terbukti dari kode: 5.932 temuan non-kegagalan tidak punya jalur penutup, dan kriteria selesai spec 002 tidak eksplisit. A adalah "smallest thing that could work" yang membuat SC-011 dapat dicapai; B membuat kriteria selesai tegas dan dapat diverifikasi. Keduanya small dan tidak bergantung pada keputusan skala. C ditangguhkan sampai B selesai — tidak mungkin memutuskan seberapa banyak yang diproses sebelum "selesai" didefinisikan.

Jev System-1: `jev_choose` memilih A+B dengan probabilitas 0,579 (confidence 0,439 — di bawah ambang 0,60, menunjukkan ketidakpastian signifikan); `jev_decide` menjawab yes dengan probabilitas 0,624 (confidence 0,248). Confidence rendah diakui — keputusan ini bertumpu pada bukti kode yang kuat, bukan pada keyakinan Jev. Ketidakpastian Jev terutama mencerminkan ketegangan yang belum terpecahkan antara "tutup semua temuan" dan "akurasi adalah plafon", yang justru menjadi inti Option B.

## If go — Handoff to `/speckit.specify`

- **Problem**: Spec 002 tidak memiliki kriteria selesai yang dapat dicapai — 5.932 temuan `reference-missing` tidak bisa ditutup lewat perintah CLI mana pun, dan tidak ada keputusan eksplisit kapan spec dinyatakan selesai.
- **Chosen approach**: Option A (tutup jalur penutup temuan non-kegagalan) lalu Option B (definisikan ulang kriteria selesai spec 002), sekuensial. Option C ditangguhkan.
- **In scope / out of scope**: In — jalur penutup untuk kelas non-kegagalan; kriteria selesai eksplisit. Out — perubahan workflow perbaikan berjenjang; perubahan algoritma di luar yang diperlukan; kapabilitas bahasa baru; perubahan data KBBI sumber.
- **Success metrics**: (1) Setiap temuan `open` punya jalur penutup CLI valid; (2) Kriteria selesai spec 002 tertulis dan dapat diverifikasi; (3) Jumlah tahap untuk temuan syllable dalam rentang rasional (baru bermakna setelah B).
- **Carried-forward open questions**: Apakah `reference-missing` perlu ditutup atau cukup dilaporkan? Apakah batas 20 temuan/tahap dinaikkan? Kapan spec 002 "selesai"?
