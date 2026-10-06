/**
 * Shared type contracts for vitepress-plugin-idn.
 *
 * Sources of truth:
 * - `specs/001-indonesian-search-plugin/data-model.md` §1, §3–§5
 * - `specs/001-indonesian-search-plugin/contracts/plugin-options.md`
 * - `specs/001-indonesian-search-plugin/contracts/search-behavior.md`
 */

export type IdnLanguage = 'id' | 'en'

export type IdnUiMode = 'nav' | 'external' | false

export interface HyphenateOptions {
  /** Client-side soft-hyphen insertion. Default: false */
  enabled: boolean
  /** CSS selector of text containers. Default: '.vp-doc p, .vp-doc li, .vp-doc td' */
  selector: string
  /** Words shorter than this are untouched. Default: 6 */
  minWordLength: number
}

export interface IdnTranslations {
  placeholder: string
  noResults: string
  stopwordHint: string
  loading: string
  typeMore: string
  loadError: string
}

/** Root configuration passed to the plugin factory (data-model §1). */
export interface IdnPluginOptions {
  /** Master switch. false → no index, no UI; build still succeeds. Default: true */
  enabled?: boolean
  /** Site processing language: stemmer, stop words, hyphenation. Default: 'id' */
  language?: IdnLanguage
  /** Only pages matching these globs (relative to srcDir) are indexed. Default: every .md page (glob `**\/*.md`) */
  include?: string[]
  /** Removed after include. frontmatter `search: false` always wins. Default: [] */
  exclude?: string[]
  /** Client-side soft-hyphen insertion. */
  hyphenate?: Partial<HyphenateOptions>
  /**
   * 'nav'      → alias search UI into default theme nav bar (default)
   * 'external' → no alias; host mounts <IdnSearch />
   * false      → index only, no UI
   */
  ui?: IdnUiMode
  /** Override UI copy. */
  translations?: Partial<IdnTranslations>
  /** Warn when serialized index exceeds this size (MB). Default: 5 */
  minIndexSizeWarningMB?: number
}

/** Fully-resolved options: every field required, no undefined. */
export interface ResolvedIdnOptions {
  enabled: boolean
  language: IdnLanguage
  include: string[]
  exclude: string[]
  hyphenate: HyphenateOptions
  ui: IdnUiMode
  translations: IdnTranslations
  minIndexSizeWarningMB: number
}

export const DEFAULT_HYPHENATE: HyphenateOptions = {
  enabled: false,
  selector: '.vp-doc p, .vp-doc li, .vp-doc td',
  minWordLength: 6,
}

export const TRANSLATIONS_EN: IdnTranslations = {
  placeholder: 'Search docs',
  noResults: 'No results',
  stopwordHint: 'Your query only contained stop words, which were filtered out.',
  loading: 'Loading search index…',
  typeMore: 'Type more to search',
  loadError: 'Failed to load the search index. See console for details.',
}

export const TRANSLATIONS_ID: IdnTranslations = {
  placeholder: 'Cari dokumen',
  noResults: 'Tidak ada hasil',
  stopwordHint: 'Kueri Anda hanya berisi kata henti yang telah disaring.',
  loading: 'Memuat indeks pencarian…',
  typeMore: 'Ketik lebih banyak untuk mencari',
  loadError: 'Gagal memuat indeks pencarian. Lihat console untuk detail.',
}

/** Defaults per data-model §1 — an empty options object yields working Indonesian search (FR-019). */
export const DEFAULT_OPTIONS: ResolvedIdnOptions = {
  enabled: true,
  language: 'id',
  include: ['**/*.md'],
  exclude: [],
  hyphenate: { ...DEFAULT_HYPHENATE },
  ui: 'nav',
  translations: { ...TRANSLATIONS_ID },
  minIndexSizeWarningMB: 5,
}

/** Heading-granularity search record (data-model §3). */
export interface IndexedSection {
  /** `path` or `path#anchor`; unique across the site (FR-001). */
  id: string
  /** Heading text, HTML-stripped. */
  title: string
  /** Ancestor heading chain (breadcrumb for display). */
  titles: string[]
  /** HTML-stripped body text of the section; may be empty → record skipped. */
  text: string
  /** Normalized terms after the language pipeline (derived, never hand-authored). */
  terms: string[]
}

/** Section display metadata keyed by record id (path#anchor). */
export interface SectionMeta {
  title: string
  titles: string[]
  path: string
}

/** Serialized artifact served through the virtual module (search-behavior §Index contract). */
export interface SearchIndexEnvelope {
  schemaVersion: 1
  language: IdnLanguage
  /** Hash of the stop-word list used at index time (guards index/query divergence, FR-012). */
  stopWordsSnapshot: string
  /** ISO timestamp, diagnostics only. */
  generatedAt: string
  /** MiniSearch JSON (loadJSON payload). */
  index: string
  sections: Record<string, SectionMeta>
}

/** Normalized user input (data-model §5). */
export interface IdnQuery {
  text: string
  language: IdnLanguage
}

export type QueryReason = 'results' | 'empty' | 'stopwords-only'

export interface QueryHit {
  id: string
  title: string
  titles: string[]
  snippet: string
  score: number
}

export interface QueryResult {
  hits: QueryHit[]
  reason: QueryReason
}

export type { IdnPluginOptions as PluginOptions }
