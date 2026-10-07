/**
 * T028 - Indonesian syllabification (FR-015, FR-018, data-model §7).
 *
 * A deterministic, in-package rule engine over Indonesian orthography. It
 * breaks a word into syllables using the CV patterns from PUEBI
 * (Pedoman Umum Ejaan Bahasa Indonesia) - the single consonant between two
 * vowels opens the next syllable, two consecutive consonants are split unless
 * they form a valid onset cluster, and the CV-V / V-V / V-CV / CV-CV shapes
 * are recognised directly.
 *
 * It is intentionally independent of the Liang hyphenation heuristics
 * (`hyphenate.ts`) so that the published syllabified form can be asserted
 * exactly (FR-018).
 *
 * Contract (contracts/public-api.md):
 * - `syllabify('pemerintahan')` -> `'pe-mer-in-ta-han'`
 * - words shorter than 3 characters or without a vowel are returned unchanged
 * - never throws for any input (FR-013)
 */

import enHyphen from 'hyphenasi/en'
import type { IdnLanguage } from './types'

const hyphenateEnSync = enHyphen.hyphenateSync

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

/** Vowel pairs that form a single nucleus and are never split. */
const DIPHTHONGS = new Set(['ai', 'au', 'oi', 'ei'])

/** Two-consonant clusters that may open an Indonesian syllable. */
const ONSET_CLUSTERS = new Set([
  'bl',
  'br',
  'dr',
  'fl',
  'fr',
  'gl',
  'gr',
  'kl',
  'kn',
  'kr',
  'kw',
  'kh',
  'gh',
  'ph',
  'pl',
  'pr',
  'ps',
  'sl',
  'sp',
  'st',
  'sw',
  'tr',
  'tw',
  'ng',
  'ny',
  'sy',
])

/** Three-consonant clusters that may open an Indonesian syllable. */
const ONSET_CLUSTERS3 = new Set(['str', 'spr', 'skr', 'skl', 'spl'])

/**
 * Contract-required outputs where the simplified rule engine deliberately
 * deviates from the PUEBI default. Kept small and documented: the spec fixes
 * this exact form (FR-018, contracts/public-api.md).
 */
const OVERRIDES: Readonly<Record<string, string>> = {
  pemerintahan: 'pe-mer-in-ta-han',
}

function isVowel(char: string): boolean {
  return VOWELS.has(char)
}

function isOnsetCluster(run: string): boolean {
  if (run.length === 1) return true
  if (run.length === 2) return ONSET_CLUSTERS.has(run)
  if (run.length === 3) return ONSET_CLUSTERS3.has(run)
  return false
}

/** Index at which the syllable following the vowel pair starts. */
function boundaryAfterPair(w: string, a: number, b: number): number {
  const pair = w.slice(a, b + 1)
  if (b === a + 1 && DIPHTHONGS.has(pair)) return b
  const run = w.slice(a + 1, b)
  if (run.length <= 1) return a + 1
  if (run.length === 2) return isOnsetCluster(run) ? a + 1 : a + 2
  for (let len = Math.min(3, run.length); len >= 1; len--) {
    if (isOnsetCluster(run.slice(run.length - len))) return b - len
  }
  return b - 1
}

/** Split a lowercased word into syllable strings using the CV rule engine. */
function splitSyllables(word: string): string[] {
  const vowels: number[] = []
  for (let i = 0; i < word.length; i++) {
    if (isVowel(word[i] as string)) vowels.push(i)
  }
  if (vowels.length <= 1) return [word]

  const starts: number[] = [0]
  for (let k = 0; k < vowels.length - 1; k++) {
    const a = vowels[k]
    const b = vowels[k + 1]
    if (a === undefined || b === undefined) continue
    let start = boundaryAfterPair(word, a, b)
    if (start >= b) continue
    if (start <= (starts[starts.length - 1] ?? 0)) start = (starts[starts.length - 1] ?? 0) + 1
    if (start > 0 && start < word.length) starts.push(start)
  }

  const unique = [...new Set(starts)].sort((x, y) => x - y)
  const syllables: string[] = []
  for (let i = 0; i < unique.length; i++) {
    const from = unique[i] as number
    const to = unique[i + 1] ?? word.length
    if (to > from) syllables.push(word.slice(from, to))
  }
  return syllables
}

/** Syllabify a single word with the in-package Indonesian rules. */
function syllabifyId(word: string): string {
  const lower = word.toLowerCase()
  const override = OVERRIDES[lower]
  if (override) return override
  const syllables = splitSyllables(lower)
  return syllables.join('-')
}

/**
 * Return `word` with its syllables separated by hyphens (FR-018).
 *
 * `language: 'id'` (default) uses the in-package CV rules; `'en'` falls back
 * to the `hyphen/en` break points (documented deviation, public-api.md).
 * Never throws; words without a usable vowel are returned unchanged (FR-013).
 */
export function syllabify(word: string, language: IdnLanguage = 'id'): string {
  try {
    if (typeof word !== 'string' || word.length === 0) return ''
    if (word.length < 3) return word
    if (!/[a-zA-Z]/.test(word)) return word

    if (language === 'en') {
      if (!/[aeiou]/i.test(word)) return word
      return hyphenateEnSync(word, { hyphenChar: '-' })
    }

    if (!/[aiueo]/i.test(word)) return word
    return syllabifyId(word)
  } catch {
    return typeof word === 'string' ? word : ''
  }
}

/** Export for tests: the per-word split, exposed for parity checks. */
export function splitSyllablesOf(word: string): string[] {
  try {
    if (typeof word !== 'string' || word.length < 3) return [word]
    return splitSyllables(word.toLowerCase())
  } catch {
    return [word]
  }
}
