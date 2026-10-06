/**
 * VitePress context access and host-hook composition (plan R1, contract G4).
 *
 * The plugin must chain, never replace, host `buildEnd`/`transformHead`
 * hooks (contracts/plugin-options.md G4) and reads the VitePress site
 * config through Vite's resolved `config.vitepress` handle.
 *
 * Zero network I/O at build time (FR-021) - this module performs none.
 */

import type { ResolvedConfig } from 'vite'
import { DEFAULT_OPTIONS } from '../core/types'
import type { IdnPluginOptions, ResolvedIdnOptions } from '../core/types'

/** Shape of the handle VitePress attaches to Vite's resolved config. */
export interface VitePressContext {
  /** Absolute path of the markdown source directory. */
  srcDir: string
  /** Site base path, e.g. '/'. */
  base: string
  /** Raw user config (frontmatter-ignore, outDir, etc.). */
  userConfig: Record<string, unknown>
}

/**
 * Extract the VitePress context from Vite's resolved config.
 * Returns null when the plugin runs outside VitePress (defensive; the
 * caller falls back to process.cwd()).
 */
export function getVitePressContext(config: ResolvedConfig): VitePressContext | null {
  const vp = (config as ResolvedConfig & { vitepress?: unknown }).vitepress
  if (!vp || typeof vp !== 'object') return null
  const ctx = vp as Partial<VitePressContext> & {
    srcDir?: string
    base?: string
    userConfig?: Record<string, unknown>
  }
  return {
    srcDir: typeof ctx.srcDir === 'string' ? ctx.srcDir : process.cwd(),
    base: typeof ctx.base === 'string' ? ctx.base : '/',
    userConfig: ctx.userConfig ?? {},
  }
}

/**
 * Merge user options over defaults (data-model §1) and validate.
 * Unknown `language` is a build **error** listing the offending value
 * (contracts/plugin-options.md) - thrown at plugin init so Vite fails the
 * build with the message attached to our plugin.
 */
export function resolveOptions(options: IdnPluginOptions = {}): ResolvedIdnOptions {
  const language = options.language ?? DEFAULT_OPTIONS.language
  if (language !== 'id' && language !== 'en') {
    throw new Error(
      `[vitepress-plugin-idn] Unknown language: ${JSON.stringify(language)}. ` +
        `Supported languages are 'id' and 'en'.`,
    )
  }

  const include = options.include ?? DEFAULT_OPTIONS.include
  const exclude = options.exclude ?? DEFAULT_OPTIONS.exclude
  if (!Array.isArray(include) || include.some((g) => typeof g !== 'string')) {
    throw new Error(
      `[vitepress-plugin-idn] Invalid include: expected string[], got ${JSON.stringify(include)}.`,
    )
  }
  if (!Array.isArray(exclude) || exclude.some((g) => typeof g !== 'string')) {
    throw new Error(
      `[vitepress-plugin-idn] Invalid exclude: expected string[], got ${JSON.stringify(exclude)}.`,
    )
  }

  const ui = options.ui === undefined ? DEFAULT_OPTIONS.ui : options.ui
  if (ui !== 'nav' && ui !== 'external' && ui !== false) {
    throw new Error(
      `[vitepress-plugin-idn] Unknown ui: ${JSON.stringify(ui)}. ` +
        `Supported values are 'nav', 'external' and false.`,
    )
  }

  const minIndexSizeWarningMB =
    options.minIndexSizeWarningMB ?? DEFAULT_OPTIONS.minIndexSizeWarningMB
  if (typeof minIndexSizeWarningMB !== 'number' || !(minIndexSizeWarningMB > 0)) {
    throw new Error(
      `[vitepress-plugin-idn] Invalid minIndexSizeWarningMB: ` +
        `${JSON.stringify(minIndexSizeWarningMB)}. Expected a positive number.`,
    )
  }

  return {
    enabled: options.enabled ?? DEFAULT_OPTIONS.enabled,
    language,
    include: [...include],
    exclude: [...exclude],
    hyphenate: { ...DEFAULT_OPTIONS.hyphenate, ...options.hyphenate },
    ui,
    translations: { ...DEFAULT_OPTIONS.translations, ...options.translations },
    minIndexSizeWarningMB,
  }
}

type MaybePromise<T> = T | Promise<T>
type HostHook<A extends unknown[]> = (...args: A) => MaybePromise<unknown>

/**
 * Compose `ours` AFTER an existing host hook without replacing it (G4).
 * Returns `ours` when the host defines nothing; otherwise a function that
 * awaits the host result, runs ours, and propagates both outcomes.
 */
export function composeHook<A extends unknown[]>(
  host: HostHook<A> | undefined,
  ours: HostHook<A>,
): HostHook<A> {
  if (typeof host !== 'function') return ours
  return async (...args: A): Promise<void> => {
    await host(...args)
    await ours(...args)
  }
}

/** Build warning helper - prefixes messages so they are greppable in build logs. */
export function warn(message: string): void {
  console.warn(`[vitepress-plugin-idn] ${message}`)
}

/** Build error helper - throws so Vite fails the build (FR-020). */
export function fail(message: string): never {
  throw new Error(`[vitepress-plugin-idn] ${message}`)
}
