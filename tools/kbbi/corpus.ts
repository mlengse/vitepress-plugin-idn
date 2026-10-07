/**
 * Canonical corpus construction (T005, T012, T020, T021, FR-006, R8).
 *
 * Everything downstream compares *canonical forms only*. Two rules do the heavy
 * lifting, and both exist because skipping them produces thousands of findings
 * that are not findings at all:
 *
 * 1. The source is not clean. `"atlantik": "At.lan.tik"` carries a capital in
 *    the middle; without full lowercasing `syllabify('atlantik')` can never
 *    match and every such word becomes a false positive (R5, R8).
 * 2. Hyphens carry meaning. `abu-abo` is one word with an internal separator,
 *    and `ayam-ayaman` is a reduplication kept whole. Neither may be split or
 *    silently rejoined (R8 rules 4 and 5).
 *
 * After the snapshot exists this module is pure local file reading: there is no
 * network call anywhere below `loadCorpus` (FR-012, T040).
 */

import { readFile } from 'node:fs/promises'
import { snapshotRawPath } from './paths.ts'
import type { CanonicalSyllable, CanonicalWord, Snapshot, Stratum } from './types.ts'

/**
 * Onset clusters treated as non-Indonesian (R5).
 *
 * This list is deliberately identical to the cluster tables in
 * `src/core/syllabify.ts` - the same clusters the machine under test accepts.
 * Using anything else would classify the corpus against an algorithm nobody
 * ships. The 2026-10-07 decision (choice C) keeps the table as-is and treats
 * this list strictly as a stratum classifier, never as a defect list.
 */
export const LOAN_ONSETS: readonly string[] = [
  'str',
  'spr',
  'skr',
  'skl',
  'spl',
  'kn',
  'kw',
  'kh',
  'gh',
  'ph',
  'ps',
  'sy',
  'tr',
  'tw',
  'bl',
  'br',
  'dr',
  'fl',
  'fr',
  'gl',
  'gr',
]

/** Longest first, so `str` is tried before the two-letter prefixes. */
const LOAN_ONSETS_BY_LENGTH: readonly string[] = [...LOAN_ONSETS].sort(
  (a, b) => b.length - a.length || a.localeCompare(b),
)

/** Loan words are permanently out of scope for findings (R5, T023). */
export function classifyStratum(syllables: readonly string[]): Stratum {
  for (const syllable of syllables) {
    for (const onset of LOAN_ONSETS_BY_LENGTH) {
      if (syllable.length >= onset.length && syllable.startsWith(onset)) return 'loan'
    }
  }
  return 'core'
}

/** R8 rule 1 and 2: lowercase the whole input, drop surrounding whitespace. */
export function canonicalWord(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
}

/**
 * R8 rules 1, 3, 4, 5: lowercase, unify the dot notation used by the KBBI
 * hyphenation dictionary into hyphens, and keep compound separators and
 * reduplications intact rather than breaking them apart.
 *
 * `"At.lan.tik"` -> `['at', 'lan', 'tik']`, `"a.has"` -> `['a', 'has']`.
 */
export function canonicalSyllables(raw: string): string[] {
  const lower = String(raw ?? '')
    .toLowerCase()
    .trim()
  if (lower.length === 0) return []
  return lower
    .split(/[.\-\s]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/** Canonical hyphenation as the published `a-b-c` form. */
export function canonicalSyllableString(raw: string): string {
  return canonicalSyllables(raw).join('-')
}

/**
 * Canonical form of whatever `syllabify()` returned. The hyphen the machine
 * emits is the same separator the reference uses, so no reshaping happens here
 * beyond the shared lowercase/trim rules - reshaping the two differently would
 * re-introduce exactly the false positives R8 exists to prevent.
 */
export function canonicalPluginHyphenation(raw: string): string {
  return canonicalSyllableString(raw)
}

/** A compound or reduplicated form: out of the accuracy denominator. */
export function isCompoundOrReduplication(word: string): boolean {
  return word.includes('-')
}

/**
 * Parse a flat top-level JSON object into ordered entries, **keeping
 * duplicates**.
 *
 * `JSON.parse` keeps the last duplicate key, which would silently reverse the
 * pinned rule that a word with several root mappings uses the *top* entry with
 * a mapping, in file order - the same rule `cari_kata_dasar` uses (T013). The
 * scan below is therefore done by hand: it reads keys and value spans only, and
 * hands each value to `JSON.parse` unchanged.
 */
export function parseTopLevelEntries(text: string): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = []
  const length = text.length
  let index = text.indexOf('{')
  if (index < 0) return entries
  index++

  const skipSpace = (from: number): number => {
    let i = from
    while (i < length && /\s/u.test(text[i] as string)) i++
    return i
  }

  /** End index (exclusive) of the JSON value starting at `from`. */
  const scanValue = (from: number): number => {
    const opener = text[from]
    if (opener === '"') {
      let i = from + 1
      while (i < length) {
        const char = text[i]
        if (char === '\\') i += 2
        else if (char === '"') return i + 1
        else i++
      }
      throw new Error('nilai JSON tidak selesai: string tidak tertutup')
    }
    if (opener === '{' || opener === '[') {
      const close = opener === '{' ? '}' : ']'
      let depth = 0
      let i = from
      while (i < length) {
        const char = text[i]
        if (char === '"') {
          i = scanValue(i)
          continue
        }
        if (char === opener) depth++
        else if (char === close) {
          depth--
          if (depth === 0) return i + 1
        }
        i++
      }
      throw new Error('nilai JSON tidak selesai: kurung tidak tertutup')
    }
    let i = from
    while (i < length && text[i] !== ',' && text[i] !== '}') i++
    return i
  }

  for (;;) {
    index = skipSpace(index)
    if (index >= length) break
    const char = text[index]
    if (char === '}') break
    if (char !== '"') throw new Error(`kunci JSON tidak diharapkan di offset ${index}`)
    const keyEnd = scanValue(index)
    const key = JSON.parse(text.slice(index, keyEnd)) as string
    index = skipSpace(keyEnd)
    if (text[index] !== ':') throw new Error(`":" hilang setelah kunci "${key}"`)
    index = skipSpace(index + 1)
    const valueEnd = scanValue(index)
    entries.push([key, JSON.parse(text.slice(index, valueEnd))])
    // The separator may be surrounded by whitespace, so skip it before testing
    // for the comma rather than assuming the value ends on the comma itself.
    index = skipSpace(valueEnd)
    if (text[index] === ',') index++
  }
  return entries
}

/** Every in-scope form, built once from the pinned snapshot. */
export interface Corpus {
  snapshot: Snapshot
  /** Derived words with a usable root mapping, keyed by canonical word. */
  derived: Map<string, CanonicalWord>
  /** Every lexicon key that had no usable root mapping, canonicalised. */
  withoutRoot: Map<string, string[]>
  /** `root_words.txt` membership, used for the `root-word-self` rule. */
  rootWords: Set<string>
  /** Hyphenation entries keyed by canonical word. */
  syllables: Map<string, CanonicalSyllable>
}

interface DerivedEntry {
  kataDasar?: unknown
  kelasKata?: unknown
}

async function readRaw(tag: string, repoPath: string): Promise<string> {
  return readFile(snapshotRawPath(tag, repoPath), 'utf8')
}

/**
 * Build the corpus from local snapshot files. No network, no MCP (FR-012).
 *
 * `derived` holds only words that actually carry a root. Entries whose
 * `kataDasar` is absent or blank are kept in `withoutRoot` so the measurement
 * can tell `root-word-self` (a legitimate root word, FR-003 a) apart from
 * `reference-missing` (the lexicon simply has no root, FR-003 b) instead of
 * inventing a root for them.
 */
export async function loadCorpus(snapshot: Snapshot): Promise<Corpus> {
  const tag = snapshot.tag

  const derived = new Map<string, CanonicalWord>()
  const withoutRoot = new Map<string, string[]>()
  const lexiconEntries = parseTopLevelEntries(
    await readRaw(tag, 'lexicon/derived_to_root_with_kelas.json'),
  )
  for (const [rawWord, rawValue] of lexiconEntries) {
    const word = canonicalWord(rawWord)
    if (word.length === 0) continue
    const value = (rawValue ?? {}) as DerivedEntry
    const root = canonicalWord(typeof value.kataDasar === 'string' ? value.kataDasar : '')
    const kelas = Array.isArray(value.kelasKata)
      ? value.kelasKata.filter((item): item is string => typeof item === 'string')
      : []
    if (root.length === 0) {
      // First entry wins, so a later duplicate cannot overwrite an earlier root.
      if (!withoutRoot.has(word)) withoutRoot.set(word, kelas)
      continue
    }
    // T013: the top entry that carries a mapping, in file order.
    if (!derived.has(word)) derived.set(word, { word, referenceRoot: root, kelasKata: kelas })
  }

  const rootWords = new Set<string>()
  const rootWordsText = await readRaw(tag, 'lexicon/root_words.txt')
  for (const line of rootWordsText.split('\n')) {
    const word = canonicalWord(line)
    if (word.length > 0) rootWords.add(word)
  }

  const syllables = new Map<string, CanonicalSyllable>()
  const hyphenationEntries = parseTopLevelEntries(
    await readRaw(tag, 'hyphenation/kbbi_vi_hyphenation_dict.json'),
  )
  for (const [rawWord, rawValue] of hyphenationEntries) {
    const word = canonicalWord(rawWord)
    if (word.length === 0) continue
    const parts = canonicalSyllables(typeof rawValue === 'string' ? rawValue : '')
    if (parts.length === 0) continue
    if (syllables.has(word)) continue
    syllables.set(word, {
      word,
      referenceSyllables: parts,
      stratum: classifyStratum(parts),
    })
  }

  return { snapshot, derived, withoutRoot, rootWords, syllables }
}

/** Words in scope for a capability, in stable ascending order (FR-013). */
export function wordsInScope(corpus: Corpus, capability: 'stem' | 'syllable'): string[] {
  const source = capability === 'stem' ? [...corpus.derived.keys(), ...corpus.withoutRoot.keys()] : [...corpus.syllables.keys()]
  const unique = [...new Set(source)]
  unique.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return unique
}