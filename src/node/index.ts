/**
 * `idnPlugin()` - the package's Vite entry (contracts/plugin-options.md, FR-019).
 *
 * Single registration step, zero required options: `plugins: [idnPlugin()]`
 * yields working Indonesian search (G1). Performs no network requests (G3,
 * FR-021). Host hooks are composed, never replaced (G4).
 */

import { existsSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import {
  HYPHENATE_RUNTIME_ID,
  RESOLVED_HYPHENATE_RUNTIME_ID,
  RESOLVED_VIRTUAL_ID,
  VIRTUAL_ID,
} from '../core/constants'
import type { IdnPluginOptions, ResolvedIdnOptions } from '../core/types'
import { getVitePressContext, resolveOptions, warn } from './configResolved'
import { searchIndexPlugin } from './searchIndexPlugin'

export { VIRTUAL_ID as IDN_VIRTUAL_MODULE, RESOLVED_VIRTUAL_ID as IDN_RESOLVED_VIRTUAL_MODULE }

/** Default-theme component specifier replaced by our nav UI (research R1). */
const THEME_SEARCH_FIND = /^\.\/(?:components\/)?VPNavBarSearch\.vue$/

/**
 * Locate Search.vue across layouts: source tree (`src/node/`), bundled node
 * entry (`dist/node/`), bundled root entry (`dist/`).
 */
function resolveSearchVue(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', 'client', 'Search.vue'),
    join(here, 'client', 'Search.vue'),
    join(here, '..', 'src', 'client', 'Search.vue'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

/** Locate the client hyphenation runtime across source/bundled layouts. */
function resolveHyphenationRuntime(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', 'client', 'hyphenationRuntime.ts'),
    join(here, 'client', 'hyphenationRuntime.ts'),
    join(here, '..', 'src', 'client', 'hyphenationRuntime.ts'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

/** Detect VitePress's default-theme nav search (ui: 'nav' alias target). */
function usesAlgolia(userConfig: Record<string, unknown>): boolean {
  const themeConfig = userConfig.themeConfig as Record<string, unknown> | undefined
  const search = themeConfig?.search as Record<string, unknown> | undefined
  return search?.provider === 'algolia'
}

/** Normalize an absolute path into a portable Vite import specifier. */
function toImportSpecifier(path: string): string {
  return path.replace(/\\/g, '/')
}

/** Resolve the `@theme` alias to its on-disk directory (T031). */
function findThemeDir(alias: unknown): string | null {
  const entries = Array.isArray(alias)
    ? (alias as { find: unknown; replacement: unknown }[])
    : Object.entries((alias as Record<string, string> | undefined) ?? {}).map(
        ([find, replacement]) => ({ find, replacement }),
      )
  for (const entry of entries) {
    if (entry.find === '@theme' && typeof entry.replacement === 'string') {
      return entry.replacement
    }
  }
  return null
}

function isThemeIndex(id: string, themeDir: string): boolean {
  const clean = id.split('?')[0] ?? id
  const normalized = normalize(clean)
  const dir = normalize(themeDir)
  if (!normalized.startsWith(dir)) return false
  return /[/\\]index\.(?:[cm]?[jt]s)$/.test(normalized)
}

function corePlugin(options: ResolvedIdnOptions): Plugin {
  let aliasTarget: string | null = null
  let isBuild = false
  let sawSearchVue = false
  let runtimePath: string | null = null
  let themeDir: string | null = null

  const hyphenationEnabled = options.hyphenate.enabled

  const runtimeModuleCode = (): string => {
    const opts = {
      language: options.language,
      minWordLength: options.hyphenate.minWordLength,
      selector: options.hyphenate.selector,
    }
    return (
      `import { installHyphenation } from ${JSON.stringify(toImportSpecifier(runtimePath as string))}\n` +
      `installHyphenation(${JSON.stringify(opts)})\n`
    )
  }

  return {
    name: 'vitepress-plugin-idn',
    enforce: 'pre',

config() {
      if (options.ui !== 'nav') return null
      aliasTarget = resolveSearchVue()
      if (!aliasTarget) {
        warn(
          'Could not locate src/client/Search.vue - the nav search UI was not wired. ' +
            "Set ui: 'external' and mount <IdnSearch /> manually.",
        )
        return null
      }
      return {
        resolve: {
          alias: [{ find: THEME_SEARCH_FIND, replacement: aliasTarget }],
        },
      }
    },

    configResolved(config) {
      isBuild = config.command === 'build'
      const ctx = getVitePressContext(config)
      if (ctx && usesAlgolia(ctx.userConfig)) {
        warn(
          "Host configures themeConfig.search.provider: 'algolia'; the idn " +
            "nav UI is still injected per the 'ui' option - set ui: 'external' or false " +
            'to avoid two search buttons.',
        )
      }
      if (hyphenationEnabled) {
        runtimePath = resolveHyphenationRuntime()
        themeDir = findThemeDir(config.resolve.alias)
        if (!runtimePath) {
          warn(
            'hyphenate.enabled is true but the client hyphenation runtime could not ' +
              'be located - client-side hyphenation is disabled.',
          )
        }
      }
    },

    resolveId(id) {
      if (hyphenationEnabled && id === HYPHENATE_RUNTIME_ID) {
        return RESOLVED_HYPHENATE_RUNTIME_ID
      }
      return null
    },

    load(id) {
      if (id === RESOLVED_HYPHENATE_RUNTIME_ID && runtimePath) return runtimeModuleCode()
      return null
    },

    // Prove the alias actually fired: if Search.vue never enters the module
    // graph, the theme does not import './VPNavBarSearch.vue' (custom theme
    // or a renamed specifier - R1 residual risk). Also injects the
    // hyphenation runtime into the theme entry (T031).
    transform(code, id) {
      const clean = id.split('?')[0] ?? id
      if (isBuild && aliasTarget && normalize(clean) === normalize(aliasTarget)) {
        sawSearchVue = true
      }
      if (
        hyphenationEnabled &&
        runtimePath &&
        themeDir &&
        isThemeIndex(clean, themeDir)
      ) {
        return {
          code: `${code}\nimport ${JSON.stringify(HYPHENATE_RUNTIME_ID)}\n`,
          map: null,
        }
      }
      return null
    },

    buildEnd() {
      if (isBuild && options.ui === 'nav' && aliasTarget && !sawSearchVue) {
        warn(
          "The default theme's search component ('./VPNavBarSearch.vue') was not found " +
            'in the module graph - the nav search UI is probably not injected (custom ' +
            'theme?). Set ui: \'external\' and mount <IdnSearch /> from the package ' +
            '"./vue" entry instead.',
        )
      }
    },
  }
}

/**
 * Build the plugin list. Unknown `language` throws here = build error at
 * plugin init listing the offending value (contracts/plugin-options.md).
 * `enabled: false` returns no plugins - no index, no UI, build succeeds
 * (FR-020).
 */
export function idnPlugin(options: IdnPluginOptions = {}): Plugin[] {
  const resolved = resolveOptions(options)
  if (!resolved.enabled) return []
  return [corePlugin(resolved), searchIndexPlugin(resolved)]
}
