/**
 * The language pipeline shared by the index path and the query path (FR-012):
 *
 *   normalize -> tokenize -> drop stop words -> reduce reduplication -> stem
 *
 * Sources of truth:
 * - `specs/001-indonesian-search-plugin/data-model.md` §5 (pipeline order, reasons)
 * - `specs/001-indonesian-search-plugin/contracts/search-behavior.md` (matching contract)
 * - `specs/001-indonesian-search-plugin/contracts/public-api.md` (`tokenize`)
 *
 * Pure, synchronous, deterministic, never throws for any input (FR-013).
 */

import { stem } from './stem'
import { isStopWord } from './stopwords'
import type { IdnLanguage, QueryReason } from './types'

/** Result of running a query through the pipeline (data-model §5). */
export interface PipelineOutcome {
  /** Normalized, stemmed terms ready for MiniSearch matching. */
  terms: string[]
  /** Drives the empty-state message: 'results' | 'empty' | 'stopwords-only'. */
  reason: QueryReason
}

/** Letters/digits/hyphen only; everything else (punctuation, symbols) is dropped. */
const TOKEN_SPLIT = /[^\p{L}\p{N}-]+/u
const EDGE_HYPHEN = /^-+|-+$/g
const REDUPLICATION = /^(.+)-\1$/u

/** Lowercase, collapse whitespace, trim (FR-009). Defensive for non-string input. */
export function normalize(text: unknown): string {
  if (typeof text !== 'string' || text.length === 0) return ''
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Split into raw tokens, dropping punctuation edges but keeping intra-word hyphens. */
function splitTokens(normalized: string): string[] {
  if (normalized.length === 0) return []
  const out: string[] = []
  for (const piece of normalized.split(TOKEN_SPLIT)) {
    const token = piece.replace(EDGE_HYPHEN, '')
    if (token.length > 0) out.push(token)
  }
  return out
}

/** Stage 1+2 of the pipeline: normalize then split. Used by MiniSearch `tokenize`. */
export function tokenizeText(raw: unknown): string[] {
  try {
    const normalized = normalize(raw)
    if (normalized.length === 0) return []
    return splitTokens(normalized)
  } catch {
    return []
  }
}

/**
 * Stages 3-5 of the pipeline for a single token: drop stop words, reduce
 * reduplication, stem. Returns null when the token must be discarded.
 * Used by MiniSearch `processTerm` - identical to what runPipeline does per
 * token, so index-time and query-time can never diverge (FR-012).
 */
export function processToken(token: unknown, language: IdnLanguage = 'id'): string | null {
  try {
    if (typeof token !== 'string' || token.length === 0) return null
    if (isStopWord(token, language)) return null
    const match = REDUPLICATION.exec(token)
    const reduced = match?.[1] ?? token
    const word = stem(reduced, language)
    return word.length > 0 ? word : null
  } catch {
    return null
  }
}

/**
 * Run the full pipeline over raw text and return the resulting terms.
 * Identical at index time and query time (FR-012).
 */
export function runPipeline(raw: unknown, language: IdnLanguage = 'id'): string[] {
  const terms: string[] = []
  for (const token of tokenizeText(raw)) {
    const word = processToken(token, language)
    if (word !== null) terms.push(word)
  }
  return terms
}

/**
 * Public `tokenize` (contracts/public-api.md): the exact terms the index
 * stores - lowercase, stop words removed, reduplication reduced, stemmed.
 */
export function tokenize(text: unknown, language: IdnLanguage = 'id'): string[] {
  return runPipeline(text, language)
}

/**
 * Query-side pipeline: same terms as `runPipeline`, plus the reason that
 * selects the empty-state message (FR-010, SC-002 - never an unfiltered dump).
 *
 * - `'empty'`           -> no usable tokens (blank/punctuation-only input)
 * - `'stopwords-only'`  -> tokens existed but every one was a stop word;
 *                           short-circuits BEFORE matching (data-model §5)
 * - `'results'`         -> terms produced; run MiniSearch matching
 */
export function processQuery(raw: unknown, language: IdnLanguage = 'id'): PipelineOutcome {
  try {
    const normalized = normalize(raw)
    if (normalized.length === 0) return { terms: [], reason: 'empty' }

    const tokens = splitTokens(normalized)
    if (tokens.length === 0) return { terms: [], reason: 'empty' }

    if (tokens.every((token) => isStopWord(token, language))) {
      return { terms: [], reason: 'stopwords-only' }
    }

    const terms = runPipeline(normalized, language)
    return terms.length > 0
      ? { terms, reason: 'results' }
      : { terms: [], reason: 'empty' }
  } catch {
    return { terms: [], reason: 'empty' }
  }
}
