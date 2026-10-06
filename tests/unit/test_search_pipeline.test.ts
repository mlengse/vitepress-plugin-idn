/**
 * T011 - Search pipeline unit tests (US1, write FIRST per tasks.md).
 *
 * Coverage:
 * - SC-001: 20 curated root/derivative queries, >=90% top-10 hit rate
 * - SC-002: stop-word-only query -> reason 'stopwords-only', zero hits
 *           (never an unfiltered full-site dump)
 * - Reduplication symmetry: "buku-buku" <-> "buku"
 * - FR-009: punctuation / casing / whitespace / >100-char tolerance
 * - FR-013: never throws on hostile input
 *
 * Every root and derivative below was verified against the actual stem
 * engines (sastrawijs + stemmer) before being curated into the list.
 */

import { describe, expect, it } from 'vitest'
import { createIndex, search, type SearchDoc } from '../../src/core/search'

/** SC-001 curated set: [root query, all derivative forms found in its doc]. */
const PAIRS: ReadonlyArray<readonly [root: string, forms: string]> = [
  ['lari', 'berlari pelari'],
  ['sapu', 'menyapu'],
  ['kembang', 'berkembang pengembangan'],
  ['ajar', 'belajar mengajar pelajaran pengajar'],
  ['perintah', 'pemerintahan perintahkan'],
  ['tulis', 'menulis penulis'],
  ['baca', 'membaca pembacaan'],
  ['nyanyi', 'menyanyi penyanyi'],
  ['bangun', 'membangun pembangunan'],
  ['asing', 'terasingkan'],
  ['cinta', 'mencintai'],
  ['suka', 'menyukai kesukaan'],
  ['jalan', 'berjalan perjalanan'],
  ['kerja', 'bekerja pekerjaan'],
  ['buka', 'membuka terbuka'],
  ['minum', 'meminum peminum'],
  ['tangkap', 'menangkap penangkap'],
  ['pikir', 'berpikir pemikir'],
  ['jaga', 'menjaga penjaga'],
  ['simpan', 'menyimpan'],
] as const

/** Unrelated pages so top-10 selection is exercised, not just recall. */
const DISTRACTORS: ReadonlyArray<readonly [id: string, text: string]> = [
  ['d1', 'VitePress adalah alat pembangun dokumen statis berbasis Vue.'],
  ['d2', 'Resep nasi goreng sederhana dengan bawang putih dan kecap.'],
  ['d3', 'Panduan memulai karier desain grafis untuk pemula.'],
  ['d4', 'Cuaca kota Surabaya hari ini cerah berawan dengan suhu hangat.'],
  ['d5', 'Sejarah singkat kereta api di Indonesia masa kolonial.'],
  ['d6', 'Tips fotografi pemandangan gunung saat matahari terbit.'],
  ['d7', 'Pengenalan bahasa pemrograman Rust untuk pemula.'],
  ['d8', 'Kalender akademik universitas semester ganjil tahun ini.'],
  ['d9', 'Harga tiket masuk taman nasional akhir pean ini.'],
  ['d10', 'Metode penyiraman tanaman hias pot dalam ruangan.'],
] as const

function buildFixture(): ReturnType<typeof createIndex> {
  const docs: SearchDoc[] = [
    ...PAIRS.map(([root, forms], i) => ({
      id: `pair-${i}.md`,
      title: `Halaman ${root}`,
      titles: [`Panduan ${root}`],
      text: `Kata ${forms} muncul di halaman ini berkali-kali ${forms}.`,
    })),
    ...DISTRACTORS.map(([id, text]) => ({
      id,
      title: `Halaman ${id}`,
      titles: [],
      text,
    })),
    // Reduplication fixtures (symmetry pair).
    { id: 'redup', title: 'Reduplikasi', titles: [], text: 'buku-buku di rak' },
    { id: 'plain', title: 'Buku Tunggal', titles: [], text: 'buku baru di meja' },
  ]
  return createIndex(docs, 'id')
}

describe('SC-001: root form finds derivative forms in top 10', () => {
  it('hits >= 90% of the curated 20 root/derivative queries', () => {
    const index = buildFixture()
    let hits = 0
    const misses: string[] = []

    for (const [root] of PAIRS) {
      const result = search(index, root, 'id')
      expect(result.reason).toBe('results')
      const top10 = result.hits.slice(0, 10).map((h) => h.id)
      const expectedId = `pair-${PAIRS.findIndex(([r]) => r === root)}.md`
      if (top10.includes(expectedId)) hits += 1
      else misses.push(`${root} -> ${JSON.stringify(top10)}`)
    }

    expect(misses, `misses (need >= 18/20): ${misses.join('; ')}`).toEqual([])
    expect(hits / PAIRS.length).toBeGreaterThanOrEqual(0.9)
  })

  it('ranks the derivative page above distractors for a sample root', () => {
    const index = buildFixture()
    const result = search(index, 'tangkap', 'id')
    expect(result.hits[0]?.id).toBe('pair-16.md')
  })
})

describe('SC-002: stop-word-only queries never dump the site', () => {
  it("returns reason 'stopwords-only' with zero hits", () => {
    const index = buildFixture()
    for (const q of ['yang dan di', 'yang', 'di ke dari', 'adalah untuk dengan']) {
      const result = search(index, q, 'id')
      expect(result.reason, `query: ${q}`).toBe('stopwords-only')
      expect(result.hits, `query: ${q}`).toEqual([])
    }
  })

  it("mixed stop words + real terms return only matching pages ('results')", () => {
    const index = buildFixture()
    const result = search(index, 'lari dan di', 'id')
    expect(result.reason).toBe('results')
    expect(result.hits.length).toBeLessThan(PAIRS.length + DISTRACTORS.length)
    expect(result.hits.map((h) => h.id)).toContain('pair-0.md')
  })

  it("blank or punctuation-only input returns reason 'empty'", () => {
    const index = buildFixture()
    for (const q of ['', '   ', '!!!', ' - ']) {
      expect(search(index, q, 'id').reason, `query: ${q}`).toBe('empty')
    }
  })
})

describe('reduplication symmetry', () => {
  it('query "buku-buku" finds pages with plain "buku"', () => {
    const index = buildFixture()
    const result = search(index, 'buku-buku', 'id')
    expect(result.reason).toBe('results')
    expect(result.hits.map((h) => h.id)).toContain('plain')
  })

  it('query "buku" finds pages with "buku-buku"', () => {
    const index = buildFixture()
    const result = search(index, 'buku', 'id')
    expect(result.hits.map((h) => h.id)).toContain('redup')
  })
})

describe('FR-009: punctuation, casing and whitespace tolerance', () => {
  it('finds results for messy query shapes', () => {
    const index = buildFixture()
    const messy = [
      '  BERLARI!!  ',
      'Pelari,\nberlari.',
      '\tberlari\t',
      'Berpikir... menangkap?!',
      'PEMERINTAHAN',
    ]
    for (const q of messy) {
      const result = search(index, q, 'id')
      expect(result.reason, `query: ${JSON.stringify(q)}`).toBe('results')
      expect(result.hits.length, `query: ${JSON.stringify(q)}`).toBeGreaterThan(0)
    }
  })

  it('tolerates input longer than 100 characters without throwing', () => {
    const index = buildFixture()
    const long = `${'kata yang sangat panjang sekali '.repeat(5)}berlari`
    const result = search(index, long, 'id')
    expect(result.reason).toBe('results')
    expect(result.hits.map((h) => h.id)).toContain('pair-0.md')
  })
})

describe('FR-013: never throws', () => {
  it('survives hostile input types', () => {
    const index = buildFixture()
    const hostile: unknown[] = [null, undefined, 42, {}, [], true, Symbol('x'), '']
    for (const q of hostile) {
      expect(() => search(index, q as string, 'id')).not.toThrow()
    }
  })
})
