# Idea Research: Repo gap analysis for next-step formulation

- **Slug**: repo-gap-analysis
- **Created**: 2026-10-10
- **Evidence confidence (overall): high

## Users & Demand

- Pemilik repo (pengguna) yang membutuhkan formulasi pekerjaan selanjutnya — permintaan eksplorasi langsung, tanpa incident atau keluhan tertentu — [source: pasted text] (confidence: high)
- Kontributor spec 002 yang menjalankan siklus tahap: `plan → perbaiki → verify → promote` — mereka yang akan menabrak lubang workflow — [source: specs/002 contracts/stage-workflow.md] (confidence: high)

## Prior Art

- **Spec 001 sudah lengkap dan tertutup**: semua task `[X]`, evidence SC-001–SC-010 tercatat, `NOTICE` memuat atribusi KBBI (SC-009). Tidak ada pekerjaan tersisa di spec 001 — [source: specs/001-indonesian-search-plugin/tasks.md, evidence.md, NOTICE] (confidence: high)
- **Spec 002 dirancang sebagai proses berjenjang sengaja lambat**: SC-003 membatasi 20 temuan/tahap × 1 hari kerja; asumsi §341 menyatakan SC-001/SC-002 adalah "plafon yang dikejar algoritma, bukan langkah menuju penyelesaian" — [source: specs/002 spec.md §SC-003, §Assumptions] (confidence: high)
- **Stage-01 (stem) sudah passed**: akurasi stem 81,86% → 82,57%, syllable tidak berubah 68,73%; semua gerbang G1-G3 lolos — [source: .kbbi/stages/stage-01.json] (confidence: high)
- **Keputusan 2026-10-07 sudah menutup beberapa celah**: onset cluster tidak diperbaiki (pilihan C), KBBI otoritas akhir (FR-023), verifikasi dua tingkat (FR-019) — [source: specs/002 spec.md Clarifications, checklists/requirements.md] (confidence: high)

## Market & Context

- Tidak ada alternatif eksternal yang relevan: ini adalah tooling internal repo, bukan produk kompetitif. Biaya "tidak melakukan apa-apa" adalah spec 002 tidak pernah mencapai kriteria selesai SC-011 — [source: ASSUMPTION] (confidence: medium)

## Data & Constraints

- **31.881 temuan `open`**: stem 5.390 (affix-strip-missed 3.410, candidate-bug 1.700, over-stripped 288), syllable 26.463 (boundary-shift 11.201, count-diff 9.330, reference-missing 5.932) — [source: .kbbi/defects/open.jsonl, dihitung 2026-10-10] (confidence: high)
- **Lubang workflow kritis — `reference-missing` tidak pernah bisa ditutup**: `planStage` menyaring dengan `countsFailure(defect.class)` dan `reference-missing` tidak ada di `FAILURE_CLASSES` (compare.ts:183-190), jadi tidak bisa masuk tahap. `dismissStageFindings` mensyaratkan `defect.stage === stage.id` (stages.ts:564), sedangkan temuan `reference-missing` selalu `stage: null` (tidak pernah di-plan). Akibatnya 5.932 temuan syllable tidak bisa berstatus apa pun selain `open` lewat perintah CLI mana pun — [source: tools/kbbi/stages.ts:460-506, 551-586; tools/kbbi/compare.ts:131-133, 183-194; tools/kbbi/cli.ts:356-369] (confidence: high)
- **Skala vs. gerbang**: dengan batas 20 temuan/tahap, 26.463 temuan syllable memerlukan ±1.323 tahap — [source: MAX_DEFECTS_PER_STAGE=20, stages.ts:48] (confidence: high)
- **Ketegangan kriteria selesai**: SC-011 mewajibkan nol temuan terbuka tanpa penjelasan, tapi asumsi §341 menyebut akurasi adalah plafon; tidak ada kriteria berhenti yang eksplisit — [source: specs/002 spec.md §SC-011, §Assumptions] (confidence: high)
- **Bug kandidat**: `Search.vue:115` memakai `window.location.href` (full reload, bukan router VitePress) — [source: src/client/Search.vue] (confidence: high)
- **Konstitusi v1.0.1 sudah bersih**: blok `SYNC IMPACT REPORT` sudah terhapus dari `.specify/memory/constitution.md` — [source: .specify/memory/constitution.md] (confidence: high)

## Evidence Against the Idea

- **Sebagian "lubang" sudah diketahui dan didokumentasikan**: batas 20 temuan/tahap, plafon akurasi, dan penolakan kata serapan semuanya sudah diputuskan secara eksplisit di spec 002 — mengulanginya tidak menambah informasi baru — [source: specs/002 spec.md, contracts/defect-taxonomy.md] (confidence: high)
- **Analisis mungkin prematur**: spec 002 baru menyelesaikan 1 dari ±1.300 tahap; pola cacat syllable belum tentu representatif sampai stage-02 berjalan — [source: ASSUMPTION] (confidence: medium)
- **Temuan `reference-missing` mungkin disengaja dibiarkan `open`**: taksonomi menyatakan ini bukan kegagalan; mungkin tidak perlu ditutup sama sekali — [source: contracts/defect-taxonomy.md kelas 1] (confidence: medium)

## Gaps & Open Questions

- [NEEDS CLARIFICATION: apakah `reference-missing` memang perlu ditutup, atau cukup dilaporkan sebagai keterbatasan diketahui tanpa mengubah status?]
- [NEEDS CLARIFICATION: apakah batas 20 temuan/tahap akan dinaikkan untuk perbaikan mekanis massal, atau tetap dipertahankan?]
- [NEEDS CLARIFICATION: kapan spec 002 dinyatakan "selesai" — semua temuan tertutup, atau akurasi mencapai ambang tertentu?]

## Sources

- Tidak ada sumber eksternal yang diambil; seluruh bukti dari kode, spec, dan laporan pengukuran di dalam repo (confidence: high)
