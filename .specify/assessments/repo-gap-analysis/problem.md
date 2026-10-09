# Problem Definition: Repo gap analysis for next-step formulation

- **Slug**: repo-gap-analysis
- **Created**: 2026-10-10
- **Inputs used**: intake.md, research.md

## Problem Statement

Spec 002 (validasi KBBI berjenjang) tidak memiliki kriteria selesai yang dapat dicapai: 5.932 temuan `reference-missing` tidak pernah bisa berubah status lewat perintah CLI mana pun, batas 20 temuan/tahap membuat 26.463 temuan syllable memerlukan ±1.323 tahap, dan tidak ada ketentuan eksplisit kapan spec ini dinyatakan "selesai" — sementara SC-011 mewajibkan nol temuan terbuka tanpa penjelasan.

## Affected Users & Stakeholders

- **Users**: kontributor yang menjalankan siklus tahap spec 002 (`plan → perbaiki → verify → promote`) — mereka yang akan menabrak temuan yang tidak bisa ditutup dan tahap yang tidak skala — [source: specs/002 contracts/stage-workflow.md]
- **Stakeholders**: pemilik repo — memutuskan kriteria selesai, alokasi kerja, dan apakah spec 002 dilanjutkan atau ditutup — [source: pasted text] (confidence: high)

## Goals

- Semua temuan di `.kbbi/defects/open.jsonl` memiliki jalur penutup yang dapat dieksekusi lewat perkakas, termasuk kategori non-kegagalan seperti `reference-missing`
- Spec 002 memiliki kriteria selesai yang eksplisit dan dapat diverifikasi, tidak bergantung pada akurasi yang mustahil dicapai dalam rasionalitas workflow yang ada
- Jumlah temuan terbuka dapat diturunkan secara proporsional terhadap batas tahap yang ada

## Non-Goals

- Merancang solusi teknis spesifik (perubahan kode, perintah baru, perubahan gerbang) — itu ranah `/speckit.assess.shape` dan `/speckit.specify`
- Menambah kapabilitas bahasa baru di luar cakupan spec 001
- Mengoreksi atau memperbarui data KBBI di repositori sumber

## Success Metrics

- Setiap temuan `open` di `open.jsonl` memiliki satu perintah CLI yang valid untuk mengubahnya menjadi `fixed` atau `dismissed` (baseline: `reference-missing` = 5.932 temuan tanpa jalur penutup) — [source: .kbbi/defects/open.jsonl, tools/kbbi/cli.ts] (confidence: high)
- Kriteria selesai spec 002 tertulis eksplisit di spec, bukan tersirat (baseline: tidak ada — SC-011 dan §Assumptions saling bertegang tanpa keputusan) — [source: specs/002 spec.md] (confidence: high)
- Jumlah tahap yang diperlukan untuk menyelesaikan temuan syllable berada dalam rentang rasional untuk satu kontributor (baseline: ±1.323 tahap dengan batas 20 temuan) — [source: MAX_DEFECTS_PER_STAGE=20, .kbbi/defects/open.jsonl] (confidence: high)

## Cost of Inaction

Spec 002 tidak pernah mencapai status selesai: 5.932 temuan `reference-missing` tetap `open` selamanya, SC-011 tidak dapat dipenuhi, dan 26.463 temuan syllable menumpuk tanpa jalur penyelesaian yang proporsional. Kontributor kehilangan sinyal kapan pekerjaan selesai, dan keputusan apakah spec 002 dilanjutkan atau ditutup terus ditunda tanpa dasar yang jelas.

## Open Questions

- [NEEDS CLARIFICATION: apakah `reference-missing` memang perlu ditutup, atau cukup dilaporkan sebagai keterbatasan diketahui tanpa mengubah status?]
- [NEEDS CLARIFICATION: apakah batas 20 temuan/tahap akan dinaikkan untuk perbaikan mekanis massal, atau tetap dipertahankan?]
- [NEEDS CLARIFICATION: kapan spec 002 dinyatakan "selesai" — semua temuan tertutup, atau akurasi mencapai ambang tertentu?]
