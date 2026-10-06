# Catatan Lanjutan — vitepress-plugin-idn

Handoff session. Repo dipublikasikan sebagai GitHub private. Lanjut dari status ini di lingkungan lain.

## Status (per commit ini)

- Pendekatan: Spec-Driven (`.specify/`, `specs/001-indonesian-search-plugin/`). Semua dokumen fase-1
  (spec, research R1–R10, data-model, contracts, plan, tasks 38, quickstart) sudah selesai.
- **T001–T017 `[X]`** di `specs/001-indonesian-search-plugin/tasks.md`. US1 (search) hampir tuntas.
- **Tes: 16/16 hijau** — unit+integration sekaligus meng-build fixture:
  `npm test` (package.json: `vitest run`).
- Typecheck & lint bersih: `npm run typecheck`, `npm run lint`.

### Yang sudah jalan
- Pipeline Indonesia: normalize → tokenize → stopword (en+id vendored) → reduplication → stemming
  (sastrawijs untuk `id`, snowball/stemmer untuk `en`). Porting-an `pemerintahan→perintah`, `buku-buku→buku`.
- Indexer `src/node/scan.ts`: walk pages, frontmatter `search: false` gate, split heading-section,
  include-directive expand (`src/node/markdown.ts` `expandIncludes`).
- Virtual module `virtual:vitepress-plugin-idn/index` (+ `virtual:.../options`):
  envelope `{schemaVersion, language, stopWordsSnapshot, generatedAt, index, sections}` dikirim sebagai
  **JSON string** (bukan object literal) — anti-minifier; client parse sekali.
- `src/client/Search.vue`: dialog a11y lengkap (role=dialog/combobox/listbox, Ctrl/Cmd+K & `/`, focus
  trap & restore, Esc/backdrop, empty & stopword-only states, aria-busy). Belum diverifikasi manual di
  browser — T018.
- Alias nav: `src/node/index.ts` `corePlugin.config()` alias regex
  `/^\.\/(?:components\/)?VPNavBarSearch\.vue$/` → `src/client/Search.vue`. `buildEnd` warning bila
  alias tak pernah kena (custom theme / specifier berubah) → saran `ui:'external'`.
- `scripts/copy-assets.mjs` (dijalankan `npm run build`): salin `src/client/Search.vue` → `dist/client/Search.vue`.

### Yang BELUM / hati-hati
- **`src/index.ts` & `src/vue.ts` BELUM ADA** (tsup entry T024 / T036) → **`npm run build` (tsup) GAGAL** sampai
  diimplementasikan. `npm test`/`typecheck`/`lint` tidak terdampak.
- T018 belum selesai: verifikasi browser dev (quickstart §4 poin 1–6), SC-001/SC-002 evidence formal.
- 20-pair golden list SC-001 & 50-word SC-006 => tugas US3 (T022/T019 dsb., `tests/fixtures/stem-golden.json`).
- T020 (US2 chunk lazy separate) sudah terpenuhi implisit — verifikasi saat T020.
- T012 integration test membangun ulang fixture tiap run (~6–9 s).

## Memulai di lingkungan baru
```bash
npm install          # vitepress 1.6.4, vite 5.x, vue disemat di playground
npm test             # 16 test; rebuilds playground/.vitepress/dist
npm run playground:dev   # manual check T018
```
Windows + PowerShell: edit tugas `tasks.md` pakai pola `.Replace('- [ ] TX..','- [X] TX..')`.
Pastikan arahkan codegraph bila `.codegraph/` ada (sudah digitignore di commit ini — boleh dijalankan `codegraph init` lagi).

## Gotcha teknis (terverifikasi di vitepress 1.6.4)
- `node_modules/vitepress/dist/client/theme-default/components/VPNavBar.vue` import `'./VPNavBarSearch.vue'`
  = komponen **dispatcher** (tes `__VP_LOCAL_SEARCH__`), yang dinamis import `./components/VPNavBarSearch.vue`
  (kanan search box). Alias wajib cocok dua bentuk.
- Index chunk keluar di `assets/chunks/indexLoader.<hash>.js` (subfolder `chunks`) — cari rekursif.
- Chunk index mem-import theme/framework → **tidak bisa** `import()` di Node; test mengekstrak JSON-string.
- `tsc --noEmit` TIDAK memeriksa `.vue`. SFC: eslint (`vue-eslint-parser`) + build fixture.
- Envelope sengaja JSON-string: minifier (esbuild) menulis ulang object literal (key tak ber-quote, string
  single-quote) sehingga tak bisa di-`JSON.parse` dari chunk — lihat `parseEnvelopeFromChunk` di test.