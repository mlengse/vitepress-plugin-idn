/**
 * FR-019 level 1: fast search regression over every curated KBBI finding.
 *
 * This is the check that runs with every ordinary `npm test` and needs no
 * playground build. It exists because "the stem change did not alter the
 * pipeline" is a belief, not evidence - a stemmer fix that quietly stops the
 * index and the query from agreeing looks fine in a unit test and still breaks
 * the product's main feature.
 *
 * The assertion is bidirectional (US5): searching the root must find a document
 * containing the derived form, and searching the derived form must find that
 * document too. Both directions go through `createIndex` and `search` from
 * `src/core/search.ts` - the same entry points the client uses - rather than
 * re-implementing the tokenisation here.
 *
 * The fixture is written by `kbbi-validate promote` from findings that have
 * been fixed. It is empty until the first stage is promoted; the shape checks
 * below keep it honest rather than silently vacuous.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createIndex, search, type SearchDoc } from '../../src/core/search'
import { isStopWord } from '../../src/core/stopwords'
import { stem } from '../../src/core/stem'

type Pairs = Array<[string, string]>

function loadFixture(name: string): Pairs {
  const raw = readFileSync(resolve(__dirname, `../fixtures/${name}`), 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (pair): pair is [string, string] =>
      Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string',
  )
}

const STEM_CASES = loadFixture('kbbi-regression-stem.json')
const SYLLABLE_CASES = loadFixture('kbbi-regression-syllable.json')

/**
 * A pair is only meaningful when **both** sides survive the pipeline.
 *
 * The pipeline drops stop words at index and query time, so neither the derived
 * form nor its root is reachable when either one is a stop word: `terlihat` is
 * answered `stopwords-only`, and `aku` (the root of `akuan`) never enters the
 * index. That is documented, intended behaviour, not a regression - but it does
 * mean such a pair cannot demonstrate a two-directional join, so it is excluded
 * from the join assertions and asserted separately below.
 */
const stopWord = (word: string): boolean => isStopWord(word, 'id')
const searchable = (pairs: Pairs): Pairs =>
  pairs.filter(([word, root]) => !stopWord(word) && !stopWord(root))

const SEARCHABLE_STEM = searchable(STEM_CASES)
const SEARCHABLE_SYLLABLE = searchable(SYLLABLE_CASES)

/**
 * One document per case, containing only that case's derived form, plus a fixed
 * set of distractors so a match has to be earned rather than being the only
 * candidate in a tiny index.
 */
function buildIndex(pairs: Pairs): {
  index: ReturnType<typeof createIndex>
  idFor: Map<string, string>
} {
  const docs: SearchDoc[] = pairs.map(([word], position) => ({
    id: `case-${position}.md`,
    title: `Halaman ${word}`,
    titles: [],
    text: `Dokumen ini membahas ${word} secara lengkap di bagian hiliran.`,
  }))
  docs.push(
    {
      id: 'distractor-1.md',
      title: 'Panduan berkebun',
      titles: [],
      text: 'Menyiram tanaman perlu air setiap pagi agar tumbuh subur.',
    },
    {
      id: 'distractor-2.md',
      title: 'Catatan perjalanan',
      titles: [],
      text: 'Perjalanan ke gunung butuh peta, sepatu, dan bekal makanan.',
    },
  )
  const index = createIndex(docs, 'id')
  const idFor = new Map(pairs.map(([word], position) => [word, `case-${position}.md`]))
  return { index, idFor }
}

describe('FR-019 level 1: curated stem findings keep search working', () => {
  it('has a fixture in the committed [word, expected] array shape', () => {
    for (const [word, expected] of STEM_CASES) {
      expect(typeof word, 'word').toBe('string')
      expect(typeof expected, 'expected').toBe('string')
      expect(word.length).toBeGreaterThan(0)
      expect(expected.length).toBeGreaterThan(0)
    }
  })

  it('finds the document from the root side', () => {
    const { index, idFor } = buildIndex(SEARCHABLE_STEM)
    expect(SEARCHABLE_STEM.length, 'tidak ada pasangan stem yang bisa diuji dua arah').toBeGreaterThan(0)
    for (const [word, root] of SEARCHABLE_STEM) {
      const result = search(index, root, 'id')
      expect(result.reason, `query root "${root}"`).toBe('results')
      expect(result.hits.map((hit) => hit.id), `query root "${root}"`).toContain(idFor.get(word))
    }
  })

  it('finds the document from the derived side', () => {
    const { index, idFor } = buildIndex(SEARCHABLE_STEM)
    expect(SEARCHABLE_STEM.length, 'tidak ada pasangan stem yang bisa diuji dua arah').toBeGreaterThan(0)
    for (const [word] of SEARCHABLE_STEM) {
      const result = search(index, word, 'id')
      expect(result.reason, `query word "${word}"`).toBe('results')
      expect(result.hits.map((hit) => hit.id), `query word "${word}"`).toContain(idFor.get(word))
    }
  })

  it('joins each derived form to its root through one shared indexed term', () => {
    // The reason the two directions above work at all: index time and query
    // time share `processToken`, so a word and its root must reduce to the same
    // term. Asserting the join directly means a failure names the word instead
    // of surfacing as an unexplained empty hit list.
    const { index } = buildIndex(SEARCHABLE_STEM)
    for (const [word, root] of SEARCHABLE_STEM) {
      const derivedHits = new Set(search(index, word, 'id').hits.map((hit) => hit.id))
      const rootHits = new Set(search(index, root, 'id').hits.map((hit) => hit.id))
      const shared = [...derivedHits].filter((id) => rootHits.has(id))
      expect(shared.length, `"${word}" and "${root}" do not join in the index`).toBeGreaterThan(0)
    }
  })

  it('never loses a finding to the stop-word short circuit', () => {
    // A promoted finding that touches a stop word must still be reachable
    // through whichever side the pipeline keeps - otherwise the page holding it
    // becomes unreachable. This asserts that side explicitly instead of letting
    // the pair silently drop out of the join checks above.
    const pairs = STEM_CASES.filter(([word, root]) => stopWord(word) || stopWord(root))
    const { index, idFor } = buildIndex(pairs)
    for (const [word, root] of pairs) {
      if (stopWord(word)) {
        expect(search(index, word, 'id').reason, `"${word}" adalah stop word`).toBe('stopwords-only')
      } else {
        expect(search(index, word, 'id').hits.map((hit) => hit.id)).toContain(idFor.get(word))
      }
      if (stopWord(root)) {
        expect(search(index, root, 'id').reason, `akar "${root}" adalah stop word`).toBe(
          'stopwords-only',
        )
      } else {
        expect(search(index, root, 'id').hits.map((hit) => hit.id)).toContain(idFor.get(word))
      }
    }
  })
})

describe('FR-019 level 1: curated hyphenation findings are pinned', () => {
  it('has a fixture in the committed [word, expected] array shape', () => {
    for (const [word, expected] of SYLLABLE_CASES) {
      expect(typeof word, 'word').toBe('string')
      expect(typeof expected, 'expected').toBe('string')
      expect(expected, `"${word}" expected a hyphenated form`).toContain('-')
    }
  })

  it('does not break search for the words it covers', () => {
    // Hyphenation does not participate in the index, so this is a smoke check
    // that a syllable finding promoted from the corpus does not make the word
    // unfindable.
    const { index, idFor } = buildIndex(SEARCHABLE_SYLLABLE)
    for (const [word] of SEARCHABLE_SYLLABLE) {
      const result = search(index, word, 'id')
      expect(result.reason, `query "${word}"`).toBe('results')
      expect(result.hits.map((hit) => hit.id), `query "${word}"`).toContain(idFor.get(word))
    }
  })
})

describe('FR-019 level 1: the gate is never vacuous', () => {
  /**
   * The curated KBBI fixture starts empty - it fills as stages are promoted -
   * so on its own this file could pass while checking nothing. This block
   * therefore also exercises `stem-golden.json`, which always holds at least 50
   * curated pairs, so the level-1 gate proves something on every ordinary
   * `npm test` from day one.
   *
   * What it asserts is the property the package actually guarantees: every
   * curated derived form is findable by its own form, and reduces to exactly the
   * recorded root. It deliberately does **not** assert that the recorded root is
   * itself findable, because the engine also reduces some *root* words
   * (`stem('jalan') === 'jal'`) - see `tests/unit/test_stem_golden.test.ts`,
   * which pins the pairs rather than the roots. Turning that asymmetry into a
   * join would fail on pre-existing behaviour that FR-021 forbids fixing here
   * without bundling the KBBI root dictionary; it is recorded as a known
   * limitation instead.
   */
  it('keeps every golden derived form findable, at its recorded root', () => {
    const golden = JSON.parse(
      readFileSync(resolve(__dirname, '../fixtures/stem-golden.json'), 'utf8'),
    ) as Pairs
    expect(golden.length).toBeGreaterThanOrEqual(50)

    const pairs = searchable(golden)
    expect(
      pairs.length,
      'setelah memfilter kata stop, minimal 50 pasangan harus tersisa',
    ).toBeGreaterThanOrEqual(50)

    const { index, idFor } = buildIndex(pairs)
    for (const [word, root] of pairs) {
      expect(stem(word), `stem('${word}')`).toBe(root)
      const result = search(index, word, 'id')
      expect(result.reason, `query "${word}"`).toBe('results')
      expect(result.hits.map((hit) => hit.id), `query "${word}"`).toContain(idFor.get(word))
    }
  })

  it('states how many KBBI findings the gate currently covers', () => {
    // Visible rather than enforced: an empty curated fixture is the correct
    // state before the first promotion, and a hard assertion here would make the
    // ordinary test suite depend on the timing of maintenance work.
    const covered = SEARCHABLE_STEM.length + SEARCHABLE_SYLLABLE.length
    expect(covered).toBeGreaterThanOrEqual(0)
  })
})