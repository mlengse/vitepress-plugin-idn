import EnglishStemmer, { type Stemmer as EnStemmer } from '@mlengse/snowball-js/english'
import { Stemmer } from 'sastrawijs'
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

const enStemmer = new (EnglishStemmer as unknown as new () => EnStemmer)()

/**
 * Memo of previous results, keyed by `language|lowercased word`. `stem` is a
 * pure, deterministic function, so caching is behavior-transparent while
 * avoiding repeated sastrawijs work for heavily repeated tokens (index + query
 * share the same call, FR-012). The cap resets the cache wholesale when
 * exceeded (watch-mode HMR safety, bounded memory).
 */
const MAX_CACHE = 20000
const stemCache = new Map<string, string>()

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
    const key = `${language}|${lower}`
    const hit = stemCache.get(key)
    if (hit !== undefined) return hit
    let result: string
    if (language === 'id') {
      const corrected = ID_CORRECTIONS[lower]
      result = corrected || idStemmer.stem(lower) || lower
    } else {
      enStemmer.setCurrent(lower)
      enStemmer.stem()
      result = enStemmer.getCurrent() || lower
    }
    if (stemCache.size >= MAX_CACHE) stemCache.clear()
    stemCache.set(key, result)
    return result
  } catch {
    return typeof word === 'string' ? word.toLowerCase() : ''
  }
}
