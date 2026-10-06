/**
 * T015 - Lazy index loader (US2).
 *
 * This module statically imports the virtual module, so bundling it pulls
 * the serialized MiniSearch payload into ITS OWN chunk. `Search.vue` imports
 * this file dynamically (never statically), so the index bytes stay out of
 * the initial page load and are fetched only when search opens (FR-004).
 *
 * The whole module is synchronous: `loadJSON` is sync; the async boundary is
 * the dynamic `import()` in the caller, which the UI shows as the
 * "loading" state.
 */

import envelopeRaw from 'virtual:vitepress-plugin-idn/index'
import { loadIndex } from '../core/search'
import type { SearchIndex } from '../core/search'
import type { IdnLanguage, SectionMeta } from '../core/types'

const SUPPORTED_SCHEMA_VERSION = 1

// The virtual module exports the envelope as a JSON string (minifier-proof,
// deterministic to extract, cheap to parse once here).
const envelope = JSON.parse(envelopeRaw) as {
  schemaVersion: number
  language: IdnLanguage
  index: string
  sections: Record<string, SectionMeta>
}

// Never fall back to empty results on a stale/mismatched chunk (FR-020,
// SC-010): rejecting at import time surfaces as the UI's error state.
if (envelope.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
  throw new Error(
    `[vitepress-plugin-idn] Unsupported search index schemaVersion ` +
      `${String(envelope.schemaVersion)} (expected ${SUPPORTED_SCHEMA_VERSION}). ` +
      'The chunk is stale - rebuild the site.',
  )
}

export interface LoadedSearchIndex {
  index: SearchIndex
  language: IdnLanguage
  sections: Record<string, SectionMeta>
}

let loaded: LoadedSearchIndex | null = null

/**
 * Deserialize the index built at index time (FR-012: `loadJSON` receives the
 * same options as `createIndex`, so the pipeline is identical on both sides).
 * Repeated calls return the cached instance.
 */
export function getSearchIndex(): LoadedSearchIndex {
  if (!loaded) {
    loaded = {
      index: loadIndex(envelope.index, envelope.language),
      language: envelope.language,
      sections: envelope.sections,
    }
  }
  return loaded
}

/** Envelope metadata (diagnostics/tests), available without full deserialization. */
export function getEnvelope(): typeof envelope {
  return envelope
}
