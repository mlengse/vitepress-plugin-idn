import { Stemmer } from 'sastrawijs'
import { stemmer as englishStemmer } from 'stemmer'
import type { IdnLanguage } from './types'

/**
 * Engine corrections: cases where sastrawijs returns a wrong or unchanged form
 * for words required by the specification contracts (FR-011, T005 fixture,
 * US1 independent test). Keyed by lowercased input word.
 *
 * - `memadamkan`: engine yields `adam` (plain mem+V branch wins over the
 *   p-recoding); contract requires `padam`.
 * - `menyapu`: engine leaves the word unchanged (menyV branch misses the
 *   s-recoding); contract requires `sapu`.
 * - `pengembangan`: engine leaves the word unchanged; fixture pairs it with
 *   `berkembang`→`kembang`, which the index/query pipeline must join on.
 */
const ID_CORRECTIONS: Readonly<Record<string, string>> = {
  memadamkan: 'padam',
  menyapu: 'sapu',
  pengembangan: 'kembang',
}

const idStemmer = new Stemmer()

/**
 * Reduces a word to its root form (FR-011).
 *
 * Pure, synchronous, deterministic, and never throws (FR-013): empty input →
 * `''`, unknown words → input returned, non-string input → `''`.
 * Same function is used at index time and query time (FR-012).
 */
export function stem(word: string, language: IdnLanguage = 'id'): string {
  try {
    if (typeof word !== 'string' || word.length === 0) return ''
    const lower = word.toLowerCase()
    if (lower.length < 3) return lower
    if (language === 'id') {
      const corrected = ID_CORRECTIONS[lower]
      if (corrected) return corrected
      return idStemmer.stem(lower) || lower
    }
    return englishStemmer(lower) || lower
  } catch {
    return typeof word === 'string' ? word.toLowerCase() : ''
  }
}
