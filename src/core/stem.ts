import EnglishStemmer, { type Stemmer as EnStemmer } from '@mlengse/snowball-js/english'
import { Stemmer } from 'sastrawijs-ts'
import type { IdnLanguage } from './types'

/**
 * Engine corrections: cases where the stemmer returns a wrong or unchanged
 * form for words required by the specification contracts (FR-011, T005
 * fixture, US1 independent test). Keyed by lowercased input word.
 *
 * - `memadamkan`: engine yields `adam` (plain mem+V branch wins over the
 *   p-recoding); contract requires `padam`.
 * - `menyapu`: engine leaves the word unchanged (menyV branch misses the
 *   s-recoding); contract requires `sapu`.
 * - `pengembangan`: engine leaves the word unchanged; fixture pairs it with
 *   `berkembang`→`kembang`, which the index/query pipeline must join on.
 *
 * Re-verified against `sastrawijs-ts@1.0.1` (the user's fork): output is
 * byte-identical to the previous `sastrawijs@1.1.0` engine across all 67
 * `tests/fixtures/stem-golden.json` entries, so these corrections still hold.
 */
const ID_CORRECTIONS: Readonly<Record<string, string>> = {
  memadamkan: 'padam',
  menyapu: 'sapu',
  pengembangan: 'kembang',
}

const idStemmer = new Stemmer()

/**
 * Prefixes the engine is expected to remove on its own. Used only by
 * `stripResidualAffix`, where a leftover prefix means the hypothesis below is
 * wrong.
 */
const DERIVATIONAL_PREFIXES: readonly string[] = [
  'meng',
  'meny',
  'mem',
  'men',
  'peng',
  'peny',
  'pem',
  'pen',
  'ber',
  'per',
  'ter',
  'di',
  'ke',
  'se',
  'me',
  'pe',
  'be',
  'te',
]

/** Prefixes this module strips itself, longest first. The engine already handles
 * productive `ber-`; it fails only on the frozen alternants (`berang`, `beran`,
 * `bereu`) and on the `be-` spellings KBBI also records.
 */
const RESIDUAL_PREFIXES: readonly string[] = ['ber', 'be']

/**
 * Suffixes this module strips itself. `-an` and `-ya`/`-nya` are the ones the
 * engine declines to commit on; `-kan`, `-i` and the reduplicative suffixes are
 * left to the engine, which handles them better.
 */
const RESIDUAL_SUFFIXES: readonly string[] = ['nya', 'an', 'ya']

/**
 * Kill switch kept out of the shipped behaviour. It exists so the pre-fix
 * baseline of stage-01 can be re-measured on demand: the accuracy recorded for
 * a stage has to stay reproducible, and the only honest way to reproduce it is
 * to be able to turn the change back off.
 */
const STRIP_RESIDUAL_AFFIX = true

/** Is `truncated` a form the engine accepts unchanged, i.e. a plausible root? */
function isRootLike(truncated: string): boolean {
  if (truncated.length < 3) return false
  if (DERIVATIONAL_PREFIXES.some((prefix) => truncated.startsWith(prefix))) return false
  return idStemmer.stem(truncated) === truncated
}

/**
 * Residual affixes, stripped **only when the engine gave up** - that is, when
 * it returned the word unchanged.
 *
 * The engine is better than any rule here at real morphology: it handles `-kan`,
 * `-i`, reduplication, nasal assimilation and the productive `ber-`. What it
 * leaves alone are the two places it declines to commit:
 *
 * - a bare `-an` derivation: `asupan` stays `asupan` where KBBI roots it `asup`;
 * - a frozen `ber-`/`be-` alternant: `beraja` stays `beraja` where KBBI roots
 *   it `raja`.
 *
 * Both guards below matter more than the rule itself, and each was measured over
 * all 33.268 derived words of the pinned `data-v4` snapshot (plus the 73.768
 * hyphenation entries, which are unaffected because this touches roots only):
 *
 * 1. "The engine returned the word unchanged." Without it the rule also fires
 *    where the engine already did the right thing, and chopping the final `n`
 *    off `-kan` yields `saksik`, `dempetk`, `asalk` - 19 regressions against 20
 *    gains.
 * 2. "The remainder is a plausible root and carries no other prefix." Without
 *    the prefix test, `bebatuan` becomes `bebatu` when the root is `batu`: the
 *    `be` there is exactly what the engine failed to strip, and truncating
 *    hides the failure instead of fixing it. That guard alone removed 1.503
 *    regressions.
 *
 * Measured result: 215 words changed, all 215 now matching KBBI, 0 regressions,
 * stem accuracy 81,958% -> 82,668% on the derived-word lexicon.
 *
 * What it deliberately does not do is guess the rest. The largest remaining
 * families - nasal assimilation (`memacak` rooted `pacak`), and the residual
 * `beb-` forms - need lexical knowledge this package may not carry (FR-021),
 * so they are recorded as known limitations instead (FR-022).
 */
function stripResidualAffix(lower: string): string | null {
  if (!STRIP_RESIDUAL_AFFIX) return null
  for (const suffix of RESIDUAL_SUFFIXES) {
    if (!lower.endsWith(suffix)) continue
    const truncated = lower.slice(0, -suffix.length)
    if (isRootLike(truncated)) return truncated
  }
  for (const prefix of RESIDUAL_PREFIXES) {
    if (!lower.startsWith(prefix)) continue
    const truncated = lower.slice(prefix.length)
    if (isRootLike(truncated)) return truncated
  }
  return null
}

/**
 * The fork's published `dist/languages/english.d.mts` declares
 * `EnglishStemmer` as a plain factory function while the shipped runtime is a
 * constructor, so `new EnglishStemmer()` fails typecheck with TS7009. Verified
 * against `@mlengse/snowball-js@1.0.2`: the mismatch persists, so the cast is
 * required rather than a leftover of the 1.0.1 packaging bug.
 */
const enStemmer = new (EnglishStemmer as unknown as new () => EnStemmer)()

/**
 * Memo of previous results, keyed by `language|lowercased word`. `stem` is a
 * pure, deterministic function, so caching is behavior-transparent while
 * avoiding repeated stemmer work for heavily repeated tokens (index + query
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
      if (corrected) {
        result = corrected
      } else {
        const engineResult = idStemmer.stem(lower) || lower
        result = engineResult === lower ? (stripResidualAffix(lower) ?? engineResult) : engineResult
      }
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
