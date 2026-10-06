/**
 * T013 - Markdown rendering wrapper (research R2).
 *
 * Two responsibilities:
 *
 * 1. `createIdnMarkdownRenderer` - thin wrapper over VitePress's publicly
 *    exported `createMarkdownRenderer(srcDir, options, base, logger)`.
 *    Identical renderer -> identical heading slugs/anchors as the built site,
 *    so index deep links cannot drift (FR-001). The `<<< file` code-snippet
 *    directive is handled inside that renderer (`snippetPlugin`), so no
 *    preprocessing is needed for it.
 *
 * 2. `expandIncludes` - regex-level parity with VitePress's internal
 *    `processIncludes` for the `<!--@include: file-->` comment form, which
 *    VitePress expands *before* rendering (so `createMarkdownRenderer` alone
 *    never sees the directive). Supports `@srcDir`-relative and file-relative
 *    paths, `#region`/`{start,end}` meta, frontmatter stripping, recursion,
 *    and silently leaves unresolvable directives untouched - exactly like
 *    upstream.
 *
 * Sources of truth:
 * - `specs/001-indonesian-search-plugin/research.md` R2 (known gap + mitigation)
 * - vitepress 1.6.4 `processIncludes` / `findRegion` / `testLine` (parity)
 */

import { readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { createMarkdownRenderer } from 'vitepress'
import type { MarkdownOptions, MarkdownRenderer } from 'vitepress'
import { warn } from './configResolved'

const INCLUDE_RE = /<!--\s*@include:\s*(.*?)\s*-->/g
const REGION_META_RE = /(#[\w-]+)/
const RANGE_META_RE = /\{(\d*),(\d*)\}$/
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

/** Remove a leading YAML frontmatter block (used before rendering pages). */
export function stripFrontmatter(src: string): string {
  return src.replace(FRONTMATTER_RE, '')
}

/** Region marker syntaxes, order and semantics copied from VitePress. */
const REGION_REGEXPS: RegExp[] = [
  /^\/\/ ?#?((?:end)?region) ([\w*-]+)$/,
  /^\/\* ?#((?:end)?region) ([\w*-]+) ?\*\/$/,
  /^#pragma ((?:end)?region) ([\w*-]+)$/,
  /^<!-- #?((?:end)?region) ([\w*-]+) -->$/,
  /^#((?:End )Region) ([\w*-]+)$/,
  /^::#((?:end)region) ([\w*-]+)$/,
  /^# ?((?:end)?region) ([\w*-]+)$/,
]

function testLine(line: string, regexp: RegExp, regionName: string, end = false): boolean {
  const [full, tag, name] = regexp.exec(line.trim()) || []
  return Boolean(
    full && tag && name === regionName && tag.match(end ? /^[Ee]nd ?[rR]egion$/ : /^[rR]egion$/),
  )
}

function findRegion(lines: string[], regionName: string): { start: number; end: number } | null {
  let regexp: RegExp | null = null
  let start = -1
  for (const [lineId, line] of lines.entries()) {
    if (regexp === null) {
      for (const reg of REGION_REGEXPS) {
        if (testLine(line, reg, regionName)) {
          start = lineId + 1
          regexp = reg
          break
        }
      }
    } else if (testLine(line, regexp, regionName, true)) {
      return { start, end: lineId }
    }
  }
  return null
}

/**
 * Expand `<!--@include: file-->` directives in `src`, mirroring VitePress's
 * `processIncludes`. `file` is the path of the including document (used to
 * resolve file-relative includes); `deps` (optional) collects the resolved
 * path of every included file for watch/HMR invalidation (FR-006).
 */
export function expandIncludes(
  srcDir: string,
  src: string,
  file: string,
  deps?: Set<string>,
): string {
  return src.replace(INCLUDE_RE, (match, meta: string) => {
    if (!meta.length) return match

    const range = meta.match(RANGE_META_RE)
    const region = meta.match(REGION_META_RE)
    const hasMeta = Boolean(region || range)
    if (hasMeta) {
      const len = (region?.[0].length || 0) + (range?.[0].length || 0)
      meta = meta.slice(0, -len)
    }

    try {
      const includePath =
        meta[0] === '@'
          ? join(srcDir, meta.slice(meta[1] === '/' ? 2 : 1))
          : join(dirname(file), meta)
      let content = readFileSync(includePath, 'utf8')

      if (region) {
        const regionName = region[0].slice(1)
        const lines = content.split(/\r?\n/)
        const found = findRegion(lines, regionName)
        content = lines.slice(found?.start, found?.end).join('\n')
      }
      if (range) {
        const [, startLine, endLine] = range
        const lines = content.split(/\r?\n/)
        content = lines
          .slice(
            startLine ? parseInt(startLine, 10) - 1 : undefined,
            endLine ? parseInt(endLine, 10) : undefined,
          )
          .join('\n')
      }
      if (!hasMeta && extname(includePath) === '.md') {
        content = content.replace(FRONTMATTER_RE, '')
      }

      deps?.add(includePath)
      return expandIncludes(srcDir, content, includePath, deps)
    } catch {
      if (process.env.DEBUG) warn(`Include file not found: ${meta}`)
      return match
    }
  })
}

/**
 * Create (or await) the shared VitePress markdown renderer using the host's
 * own markdown options, so index rendering matches the site build exactly.
 */
export function createIdnMarkdownRenderer(
  srcDir: string,
  options: MarkdownOptions | undefined,
  base: string | undefined,
): Promise<MarkdownRenderer> {
  return createMarkdownRenderer(srcDir, options, base, {
    warn: (message: string): void => warn(message),
  })
}
