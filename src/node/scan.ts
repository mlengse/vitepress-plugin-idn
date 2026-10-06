/**
 * T014 - Page discovery, rendering and heading-section splitting (research R2).
 *
 * Pipeline per page:
 *
 *   read .md -> frontmatter gate (`search: false` excludes, FR-007)
 *            -> strip frontmatter -> expand `<!--@include-->` directives
 *            -> render via VitePress's own markdown renderer
 *            -> split rendered HTML at headings (anchors identical to the
 *               built site, FR-001/R2) -> HTML-stripped IndexedSections
 *
 * Only filesystem access here; no Vite state. The plugin (searchIndexPlugin)
 * owns scheduling (build start, HMR) and serialization.
 */

import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createFilter } from 'vite'
import type { MarkdownRenderer } from 'vitepress'
import { runPipeline } from '../core/pipeline'
import type { IdnLanguage, IndexedSection } from '../core/types'
import { expandIncludes, stripFrontmatter } from './markdown'

const MD_EXT = '.md'
const SKIP_DIRS = new Set(['node_modules', '.git', '.vitepress'])

const FM_TITLE_RE = /^\s*title:\s*(.+)$/m
const FM_SEARCH_RE = /^\s*search:\s*(false|no|off)\b/i
const HEADING_RE = /<h([1-6])\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/gi
const HTML_TAG_RE = /<[^>]+>/g
const BLOCK_TAGS_RE = /<\/?(script|style|template)[^>]*>/gi
const HEADER_ANCHOR_RE = /<a\b[^>]*class="[^"]*header-anchor[^"]*"[^>]*>[\s\S]*?<\/a>/gi

const ENTITIES: Array<[RegExp, string]> = [
  [/&ZeroWidthSpace;/g, ''],
  [/&nbsp;/g, ' '],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;|&#x27;/g, "'"],
  [/&amp;/g, '&'],
]

export interface PageScan {
  /** Site-absolute path (`/`, `/guide/start`) derived from srcDir-relative location. */
  pagePath: string
  sections: IndexedSection[]
  /** Absolute paths of files `<!--@include-->` pulled in (HMR dependencies). */
  deps: string[]
}

/** Recursively collect `.md` files under `dir`. */
function walkMarkdown(dir: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkMarkdown(full, out)
    else if (entry.name.endsWith(MD_EXT)) out.push(full)
  }
}

/** Absolute paths of every `.md` under srcDir passing include/exclude (FR-007). */
export function discoverPages(srcDir: string, include: string[], exclude: string[]): string[] {
  const files: string[] = []
  walkMarkdown(srcDir, files)
  const filter = createFilter(include, exclude, { resolve: false })
  return files
    .map((abs) => ({ abs, rel: relative(srcDir, abs).split(sep).join('/') }))
    .filter(({ rel }) => filter(rel))
    .map(({ abs }) => abs)
}

/** Site-absolute route for a source file, mirroring VitePress (`.md` stripped). */
export function pagePathOf(srcDir: string, absPath: string): string {
  const rel = relative(srcDir, absPath).split(sep).join('/').replace(/\.md$/, '')
  if (rel === 'index') return '/'
  return `/${rel}`
}

interface Frontmatter {
  title: string | undefined
  searchDisabled: boolean
}

function parseFrontmatter(raw: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)
  const block = match?.[1] ?? ''
  const titleMatch = FM_TITLE_RE.exec(block)
  let title = titleMatch?.[1]?.trim()
  if (title) {
    if (
      (title.startsWith('"') && title.endsWith('"')) ||
      (title.startsWith("'") && title.endsWith("'"))
    ) {
      title = title.slice(1, -1)
    }
  }
  return { title, searchDisabled: FM_SEARCH_RE.test(block) }
}

/** HTML -> plain text for index records (decodes common entities). */
export function stripHtml(html: string): string {
  let text = html.replace(BLOCK_TAGS_RE, ' ').replace(HEADER_ANCHOR_RE, ' ')
  text = text.replace(HTML_TAG_RE, ' ')
  for (const [pattern, replacement] of ENTITIES) text = text.replace(pattern, replacement)
  return text.replace(/\s+/g, ' ').trim()
}

interface Heading {
  level: number
  anchor: string
  title: string
  start: number
  end: number
}

function collectHeadings(html: string): Heading[] {
  const headings: Heading[] = []
  for (const match of html.matchAll(HEADING_RE)) {
    const [full, level, anchor, inner] = match
    if (full === undefined || level === undefined || anchor === undefined) continue
    headings.push({
      level: parseInt(level, 10),
      anchor,
      title: stripHtml(inner ?? ''),
      start: match.index,
      end: match.index + full.length,
    })
  }
  return headings
}

/**
 * Split rendered HTML into heading-granularity records (data-model 3).
 * The first record covers content before the first heading and is keyed by
 * the bare page path; every heading gets `path#anchor`. Records with empty
 * stripped text are skipped (mirrors VitePress local search).
 */
function splitSections(
  html: string,
  pagePath: string,
  pageTitle: string,
  language: IdnLanguage,
): IndexedSection[] {
  const headings = collectHeadings(html)
  const sections: IndexedSection[] = []
  const stack: Array<{ level: number; title: string }> = []

  const push = (id: string, title: string, titles: string[], body: string): void => {
    const text = stripHtml(body)
    if (text.length === 0) return
    sections.push({ id, title, titles, text, terms: runPipeline(`${title} ${text}`, language) })
  }

  if (headings.length === 0) {
    push(pagePath, pageTitle, [], html)
    return sections
  }

  const first = headings[0]
  if (first) push(pagePath, pageTitle, [], html.slice(0, first.start))

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]
    if (!heading) continue
    const next = headings[i + 1]
    while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= heading.level) {
      stack.pop()
    }
    const titles = stack.map((entry) => entry.title)
    const body = html.slice(heading.end, next?.start ?? html.length)
    push(`${pagePath}#${heading.anchor}`, heading.title, titles, body)
    stack.push({ level: heading.level, title: heading.title })
  }

  return sections
}

/**
 * Render one source file into search sections. Returns `null` when the page
 * is excluded (frontmatter `search: false` or include/exclude globs).
 */
export function scanPage(
  absPath: string,
  srcDir: string,
  raw: string,
  md: MarkdownRenderer,
  language: IdnLanguage,
): PageScan {
  const pagePath = pagePathOf(srcDir, absPath)
  const frontmatter = parseFrontmatter(raw)
  if (frontmatter.searchDisabled) return { pagePath, sections: [], deps: [] }

  const deps = new Set<string>()
  const source = stripFrontmatter(raw)
  const expanded = expandIncludes(srcDir, source, absPath, deps)
  const html = md.render(expanded)
  const firstHeading = collectHeadings(html)[0]
  const pageTitle =
    frontmatter.title ??
    firstHeading?.title ??
    pagePath.split('/').filter(Boolean).pop() ??
    'Index'
  const sections = splitSections(html, pagePath, pageTitle, language)
  return { pagePath, sections, deps: [...deps] }
}
