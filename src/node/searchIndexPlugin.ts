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

import { readFile } from 'node:fs/promises'
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

class SearchIndexContext {
  private config: ResolvedConfig | null = null
  private srcDir = process.cwd()
  private base = '/'
  private md: MarkdownRenderer | null = null
  private scanPromise: Promise<void> | null = null

  /** page abs path -> indexed sections (empty/absent = excluded). */
  private pages = new Map<string, IndexedSection[]>()
  /** included-file abs path -> pages that include it. */
  private depPages = new Map<string, Set<string>>()
  /** page abs path -> included files it depends on (reverse lookup map). */
  private pageDeps = new Map<string, Set<string>>()
  private envelope: SearchIndexEnvelope | null = null
  private warnedSize = false
  private warnedEmpty = false

  constructor(private readonly options: ResolvedIdnOptions) {}

  public configResolved(resolved: ResolvedConfig): void {
    this.config = resolved
    const ctx = getVitePressContext(resolved)
    this.srcDir = ctx?.srcDir ?? resolved.root
    this.base = ctx?.base ?? '/'
  }

  public ensureScanned(): Promise<void> {
    if (!this.scanPromise) {
      this.scanPromise = this.initAndScan()
    }
    return this.scanPromise
  }

  public getEnvelopePayload(): string {
    return JSON.stringify(this.envelope)
  }

  public async handleHotUpdateFile(file: string, server: ViteDevServer): Promise<boolean> {
    if (extname(file) !== MD_EXT) return false
    await this.ensureScanned()
    const abs = normalize(file)
    if (this.pages.has(abs)) {
      await this.rescanPage(abs)
    } else if (this.depPages.has(abs)) {
      await Promise.all([...(this.depPages.get(abs) ?? [])].map((page) => this.scanOne(page)))
      this.rebuildEnvelope()
    } else {
      // Not part of the index (excluded or unknown): let default HMR run.
      return false
    }
    await this.reloadVirtual(server)
    return true
  }

  public async rescanStructure(file: string, server: ViteDevServer): Promise<void> {
    if (extname(file) !== MD_EXT) return
    await this.ensureScanned()
    await this.fullScan()
    this.rebuildEnvelope()
    await this.reloadVirtual(server)
  }

  private clearDeps(page: string): void {
    const deps = this.pageDeps.get(page)
    if (deps) {
      for (const dep of deps) {
        const set = this.depPages.get(dep)
        if (set) {
          set.delete(page)
          if (set.size === 0) this.depPages.delete(dep)
        }
      }
      this.pageDeps.delete(page)
    }
  }

  private async scanOne(abs: string): Promise<void> {
    let raw: string
    try {
      raw = await readFile(abs, 'utf8')
    } catch {
      this.pages.delete(abs)
      this.clearDeps(abs)
      return
    }
    this.clearDeps(abs)
    try {
      const result = await scanPage(abs, this.srcDir, raw, this.md as MarkdownRenderer, this.options.language)
      if (result.sections.length > 0) this.pages.set(abs, result.sections)
      else this.pages.delete(abs)
      if (result.deps.length > 0) {
        let depsSet = this.pageDeps.get(abs)
        if (!depsSet) this.pageDeps.set(abs, (depsSet = new Set()))
        for (const dep of result.deps) {
          let set = this.depPages.get(dep)
          if (!set) this.depPages.set(dep, (set = new Set()))
          set.add(abs)
          depsSet.add(dep)
        }
      }
    } catch (error) {
      warn(`Failed to scan ${abs}: ${String(error)}`)
      this.pages.delete(abs)
    }
  }

  private async fullScan(): Promise<void> {
    this.pages.clear()
    this.depPages.clear()
    this.pageDeps.clear()
    const pagePaths = discoverPages(this.srcDir, this.options.include, this.options.exclude)
    await Promise.all(pagePaths.map((abs) => this.scanOne(abs)))
  }

  private rebuildEnvelope(): void {
    const sections = [...this.pages.values()].flat()
    const docs = sections.map((section) => ({
      id: section.id,
      title: section.title,
      titles: section.titles,
      text: section.text,
    }))
    const index = createIndex(docs, this.options.language)
    const meta: Record<string, SectionMeta> = {}
    for (const section of sections) {
      meta[section.id] = {
        title: section.title,
        titles: section.titles,
        path: section.id.split('#')[0] ?? section.id,
      }
    }
    this.envelope = {
      schemaVersion: 1,
      language: this.options.language,
      stopWordsSnapshot: stopWordsSnapshot(this.options.language),
      generatedAt: new Date().toISOString(),
      index: JSON.stringify(index.toJSON()),
      sections: meta,
    }
    this.warnDiagnostics(sections.length)
  }

  private warnDiagnostics(sectionCount: number): void {
    if (!this.warnedEmpty && sectionCount === 0) {
      this.warnedEmpty = true
      warn('No sections were indexed - check the `include`/`exclude` globs and site content.')
    }
    const bytes = Buffer.byteLength(this.envelope?.index ?? '', 'utf8')
    const limitMb = this.options.minIndexSizeWarningMB
    if (!this.warnedSize && bytes > limitMb * 1024 * 1024) {
      this.warnedSize = true
      warn(
        `Serialized search index is ${(bytes / (1024 * 1024)).toFixed(1)} MB, ` +
          `above the ${limitMb} MB warning threshold. Consider tightening ` +
          '`include`/`exclude` or raising `minIndexSizeWarningMB`.',
      )
    }
  }

  private async initAndScan(): Promise<void> {
    const userConfig = this.config ? getVitePressContext(this.config)?.userConfig ?? {} : {}
    this.md = await createIdnMarkdownRenderer(
      this.srcDir,
      userConfig.markdown as MarkdownOptions | undefined,
      this.base,
    )
    await this.fullScan()
    this.rebuildEnvelope()
  }

  private async rescanPage(abs: string): Promise<void> {
    await this.ensureScanned()
    await this.scanOne(abs)
    this.rebuildEnvelope()
  }

  private async reloadVirtual(server: ViteDevServer): Promise<void> {
    const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID)
    if (mod) await server.reloadModule(mod)
  }
}

export function searchIndexPlugin(options: ResolvedIdnOptions): Plugin {
  const indexCtx = new SearchIndexContext(options)

  return {
    name: 'vitepress-plugin-idn:search-index',
    enforce: 'pre',

    configResolved(resolved) {
      indexCtx.configResolved(resolved)
    },

    async buildStart() {
      await indexCtx.ensureScanned()
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
      await indexCtx.ensureScanned()
      // Export the envelope as a JSON *string*: minifiers re-serialize object
      // literals (unquoted keys / single quotes), JSON.stringify text keeps
      // its exact bytes in the emitted chunk, and the client parses once.
      const payload = indexCtx.getEnvelopePayload()
      return `export default ${JSON.stringify(payload)}`
    },

    async handleHotUpdate({ file, server }) {
      const handled = await indexCtx.handleHotUpdateFile(file, server)
      if (!handled) return
    },

    configureServer(server) {
      const rescanStructure = (file: string) => indexCtx.rescanStructure(file, server)
      server.watcher.on('add', rescanStructure)
      server.watcher.on('unlink', rescanStructure)
    },
  }
}
