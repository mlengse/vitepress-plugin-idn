/**
 * T014 - Index generation and the `virtual:vitepress-plugin-idn/index`
 * module (plan R7, research R2, search-behavior Index contract).
 *
 * Responsibilities:
 * - discover `.md` pages (include/exclude globs, FR-007), render them with
 *   the shared markdown renderer and split them into heading sections
 *   (`scan.ts`); include dependencies are tracked for dev HMR (FR-006)
 * - build the MiniSearch index once and expose it as the virtual module,
 *   whose `load()` returns `export default <envelope>` - dynamically imported
 *   by the client, so Rollup emits a separate lazily-loaded chunk (US2)
 * - dev HMR: rescans the changed page (and any page that includes it) and
 *   hot-reloads the virtual module; watcher add/unlink triggers a full rescan
 * - diagnostics: oversized index / zero indexed sections warnings (FR-005)
 *
 * The virtual module id resolution lives here; `corePlugin` keeps only the
 * host-hook composition (algolia/ui warnings).
 */

import { readFileSync } from 'node:fs'
import { extname, normalize } from 'node:path'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import type { MarkdownOptions, MarkdownRenderer } from 'vitepress'
import { RESOLVED_OPTIONS_ID, RESOLVED_VIRTUAL_ID, OPTIONS_ID, VIRTUAL_ID } from '../core/constants'
import { createIndex } from '../core/search'
import { stopWordsSnapshot } from '../core/stopwords'
import type {
  IndexedSection,
  ResolvedIdnOptions,
  SearchIndexEnvelope,
  SectionMeta,
} from '../core/types'
import { getVitePressContext, warn } from './configResolved'
import { createIdnMarkdownRenderer } from './markdown'
import { discoverPages, scanPage } from './scan'

const MD_EXT = '.md'

export function searchIndexPlugin(options: ResolvedIdnOptions): Plugin {
  let config: ResolvedConfig | null = null
  let srcDir = process.cwd()
  let base = '/'
  let md: MarkdownRenderer | null = null
  let scanPromise: Promise<void> | null = null

  /** page abs path -> indexed sections (empty/absent = excluded). */
  const pages = new Map<string, IndexedSection[]>()
  /** included-file abs path -> pages that include it. */
  const depPages = new Map<string, Set<string>>()
  let envelope: SearchIndexEnvelope | null = null
  let warnedSize = false
  let warnedEmpty = false

  function clearDeps(page: string): void {
    for (const [dep, set] of depPages) {
      set.delete(page)
      if (set.size === 0) depPages.delete(dep)
    }
  }

  function scanOne(abs: string): void {
    let raw: string
    try {
      raw = readFileSync(abs, 'utf8')
    } catch {
      pages.delete(abs)
      clearDeps(abs)
      return
    }
    clearDeps(abs)
    try {
      const result = scanPage(abs, srcDir, raw, md as MarkdownRenderer, options.language)
      if (result.sections.length > 0) pages.set(abs, result.sections)
      else pages.delete(abs)
      for (const dep of result.deps) {
        let set = depPages.get(dep)
        if (!set) depPages.set(dep, (set = new Set()))
        set.add(abs)
      }
    } catch (error) {
      warn(`Failed to scan ${abs}: ${String(error)}`)
      pages.delete(abs)
    }
  }

  function fullScan(): void {
    pages.clear()
    depPages.clear()
    for (const abs of discoverPages(srcDir, options.include, options.exclude)) {
      scanOne(abs)
    }
  }

  function rebuildEnvelope(): void {
    const sections = [...pages.values()].flat()
    const docs = sections.map((section) => ({
      id: section.id,
      title: section.title,
      titles: section.titles,
      text: section.text,
    }))
    const index = createIndex(docs, options.language)
    const meta: Record<string, SectionMeta> = {}
    for (const section of sections) {
      meta[section.id] = {
        title: section.title,
        titles: section.titles,
        path: section.id.split('#')[0] ?? section.id,
      }
    }
    envelope = {
      schemaVersion: 1,
      language: options.language,
      stopWordsSnapshot: stopWordsSnapshot(options.language),
      generatedAt: new Date().toISOString(),
      index: JSON.stringify(index.toJSON()),
      sections: meta,
    }
    warnDiagnostics(sections.length)
  }

  function warnDiagnostics(sectionCount: number): void {
    if (!warnedEmpty && sectionCount === 0) {
      warnedEmpty = true
      warn('No sections were indexed - check the `include`/`exclude` globs and site content.')
    }
    const bytes = Buffer.byteLength(envelope?.index ?? '', 'utf8')
    const limitMb = options.minIndexSizeWarningMB
    if (!warnedSize && bytes > limitMb * 1024 * 1024) {
      warnedSize = true
      warn(
        `Serialized search index is ${(bytes / (1024 * 1024)).toFixed(1)} MB, ` +
          `above the ${limitMb} MB warning threshold. Consider tightening ` +
          '`include`/`exclude` or raising `minIndexSizeWarningMB`.',
      )
    }
  }

  function ensureScanned(): Promise<void> {
    if (!scanPromise) {
      scanPromise = (async () => {
        const userConfig = config ? getVitePressContext(config)?.userConfig ?? {} : {}
        md = await createIdnMarkdownRenderer(
          srcDir,
          userConfig.markdown as MarkdownOptions | undefined,
          base,
        )
        fullScan()
        rebuildEnvelope()
      })()
    }
    return scanPromise
  }

  async function rescanPage(abs: string): Promise<void> {
    await ensureScanned()
    scanOne(abs)
    rebuildEnvelope()
  }

  async function reloadVirtual(server: ViteDevServer): Promise<void> {
    const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID)
    if (mod) await server.reloadModule(mod)
  }

  return {
    name: 'vitepress-plugin-idn:search-index',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved
      const ctx = getVitePressContext(resolved)
      srcDir = ctx?.srcDir ?? resolved.root
      base = ctx?.base ?? '/'
    },

    async buildStart() {
      await ensureScanned()
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
      if (id === OPTIONS_ID) return RESOLVED_OPTIONS_ID
      return null
    },

    async load(id) {
      if (id === RESOLVED_OPTIONS_ID) {
        // Baked into the Search.vue chunk: language + UI strings, single
        // source of truth shared with the index build (same resolveOptions).
        return `export default ${JSON.stringify({
          language: options.language,
          translations: options.translations,
        })}`
      }
      if (id !== RESOLVED_VIRTUAL_ID) return null
      await ensureScanned()
      // Export the envelope as a JSON *string*: minifiers re-serialize object
      // literals (unquoted keys / single quotes), JSON.stringify text keeps
      // its exact bytes in the emitted chunk, and the client parses once.
      const payload = JSON.stringify(envelope)
      return `export default ${JSON.stringify(payload)}`
    },

    async handleHotUpdate({ file, server }) {
      if (extname(file) !== MD_EXT) return
      await ensureScanned()
      const abs = normalize(file)
      if (pages.has(abs)) {
        await rescanPage(abs)
      } else if (depPages.has(abs)) {
        for (const page of [...(depPages.get(abs) ?? [])]) {
          scanOne(page)
        }
        rebuildEnvelope()
      } else {
        // Not part of the index (excluded or unknown): let default HMR run.
        return
      }
      await reloadVirtual(server)
    },

    configureServer(server) {
      const rescanStructure = async (file: string): Promise<void> => {
        if (extname(file) !== MD_EXT) return
        await ensureScanned()
        fullScan()
        rebuildEnvelope()
        await reloadVirtual(server)
      }
      server.watcher.on('add', rescanStructure)
      server.watcher.on('unlink', rescanStructure)
    },
  }
}
