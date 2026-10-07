/**
 * Public entry for vitepress-plugin-idn (contracts/public-api.md).
 *
 * Pure, synchronous utilities usable from Node and the browser without deep
 * imports (FR-014): the exact same pipeline functions the search index uses
 * (FR-012), plus the hyphenation and syllabification helpers.
 */

export { stem } from './core/stem'
export { tokenize } from './core/pipeline'
export { syllabify, splitSyllablesOf } from './core/syllabify'
export { hyphenateText, SOFT_HYPHEN } from './core/hyphenate'
import type { HyphenateTextOptions } from './core/hyphenate'
export type { HyphenateTextOptions }
export { isStopWord, getStopWords, stopWordsSnapshot } from './core/stopwords'
export { IDN_VERSION } from './core/constants'
export type { SearchDoc } from './core/search'

export type {
  IdnLanguage,
  IdnPluginOptions,
  IdnTranslations,
  IdnUiMode,
  PluginOptions,
  QueryHit,
  QueryReason,
  QueryResult,
  SectionMeta,
} from './core/types'