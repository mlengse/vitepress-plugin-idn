/**
 * MiniSearch index construction and querying (FR-001, FR-012).
 *
 * The index and the query both run through the exact same MiniSearch
 * `tokenize`/`processTerm` hooks, which delegate to the shared pipeline
 * (normalize -> tokenize -> drop stop words -> reduce reduplication -> stem).
 * There is a single implementation of the tokenization logic for both sides -
 * `createIndex` and `search` cannot diverge.
 *
 * Sources of truth:
 * - `specs/001-indonesian-search-plugin/contracts/search-behavior.md`
 * - `specs/001-indonesian-search-plugin/data-model.md` 3, 5
 */

import MiniSearch from 'minisearch'
import { processQuery, processToken, tokenizeText } from './pipeline'
import type { IdnLanguage, QueryHit, QueryResult } from './types'

/** Raw document accepted by `createIndex` (display fields + body text). */
export interface SearchDoc {
  id: string
  title: string
  titles: string[]
  text: string
}

export type SearchIndex = MiniSearch<SearchDoc>

/** Field boosts: title > titles > text (search-behavior matching contract). */
const SEARCH_BOOST = { title: 4, titles: 2, text: 1 } as const

const SNIPPET_BEFORE = 60
const SNIPPET_AFTER = 140

/**
 * Options shared by index construction and `MiniSearch.loadJSON` on the
 * client. Passing the same options to both guarantees an identical pipeline
 * on both sides (FR-012) - the envelope carries the serialized index, the
 * language carries the closure.
 */
export function createIndexOptions(language: IdnLanguage = 'id') {
  return {
    fields: ['title', 'titles', 'text'],
    storeFields: ['title', 'titles', 'text'],
    tokenize: (text: string): string[] => tokenizeText(text),
    processTerm: (term: string): string | null => processToken(term, language),
  }
}

/** Build a search index from documents. Skips documents with no content. */
export function createIndex(docs: SearchDoc[], language: IdnLanguage = 'id'): SearchIndex {
  const index = new MiniSearch<SearchDoc>(createIndexOptions(language))
  const seen = new Set<string>()
  for (const doc of docs) {
    if (typeof doc?.id !== 'string' || doc.id.length === 0 || seen.has(doc.id)) continue
    if (!doc.title && !doc.text && doc.titles.length === 0) continue
    seen.add(doc.id)
    index.add({
      id: doc.id,
      title: doc.title ?? '',
      titles: Array.isArray(doc.titles) ? doc.titles : [],
      text: doc.text ?? '',
    })
  }
  return index
}

/** Deserialize an index produced by `index.toJSON()` (client-side, US2). */
export function loadIndex(json: string, language: IdnLanguage = 'id'): SearchIndex {
  return MiniSearch.loadJSON<SearchDoc>(json, createIndexOptions(language))
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a display snippet with matched terms highlighted (FR-001).
 * `&`, `<` and `>` are parked behind control characters before highlighting
 * so replacing them can never corrupt a `<mark>` tag or an HTML entity;
 * they are restored as entities at the end.
 */
function makeSnippet(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return ''

  const lower = flat.toLowerCase()
  let anchor = -1
  for (const term of terms) {
    const pos = lower.indexOf(term)
    if (pos !== -1 && (anchor === -1 || pos < anchor)) anchor = pos
  }
  if (anchor === -1) anchor = 0

  const start = Math.max(0, anchor - SNIPPET_BEFORE)
  const end = Math.min(flat.length, anchor + SNIPPET_AFTER)
  const leading = start > 0 ? '\u2026' : ''
  const trailing = end < flat.length ? '\u2026' : ''

  const AMP = '\u0001'
  const LT = '\u0002'
  const GT = '\u0003'
  let window = flat
    .slice(start, end)
    .replace(/&/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)

  if (terms.length > 0) {
    const pattern = new RegExp(terms.map(escapeRegex).join('|'), 'gi')
    window = window.replace(pattern, (match) => `<mark>${match}</mark>`)
  }

  const html = window
    .split(AMP).join('&amp;')
    .split(LT).join('&lt;')
    .split(GT).join('&gt;')

  return leading + html + trailing
}

/**
 * Query the index. Short-circuits before matching for empty and
 * stop-word-only queries (SC-002: no unfiltered fallback dump).
 * Never throws for any input (FR-013).
 */
export function search(
  index: SearchIndex,
  raw: unknown,
  language: IdnLanguage = 'id',
): QueryResult {
  try {
    const { reason } = processQuery(raw, language)
    if (reason !== 'results') return { hits: [], reason }

    const results = index.search(raw as string, { boost: SEARCH_BOOST })
    const hits: QueryHit[] = results.map((result) => ({
      id: String(result.id),
      title: typeof result.title === 'string' ? result.title : '',
      titles: Array.isArray(result.titles) ? result.titles : [],
      snippet: makeSnippet(
        typeof result.text === 'string' ? result.text : '',
        Array.isArray(result.terms) ? (result.terms as string[]) : [],
      ),
      score: Number(result.score) || 0,
    }))
    return { hits, reason }
  } catch {
    return { hits: [], reason: 'empty' }
  }
}
