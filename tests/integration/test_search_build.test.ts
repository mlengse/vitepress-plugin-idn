/**
 * T012 - Search build integration tests (US1, write FIRST per tasks.md).
 *
 * Builds the playground fixture once and asserts:
 * - search button rendered in nav (alias worked, R1)
 * - index chunk emitted and loadable as a module (R7, US2)
 * - `search: false` page excluded from index (FR-007)
 * - section ids `path#anchor` resolve to built HTML headings (FR-001, R2)
 * - include-directive content indexed on the including page (R2 gap coverage)
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const DIST = join(ROOT, 'playground', '.vitepress', 'dist')

interface Envelope {
  schemaVersion: number
  language: string
  index: string
  sections: Record<string, { title: string; titles: string[]; path: string }>
}

function readDist(rel: string): string {
  return readFileSync(join(DIST, rel), 'utf8')
}

function allHtml(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...allHtml(full))
    else if (entry.name.endsWith('.html')) out.push(full)
  }
  return out
}

function findIndexChunkPath(dir: string = join(DIST, 'assets')): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findIndexChunkPath(full)
      if (found) return found
    } else if (/index.*\.js$/.test(entry.name)) {
      if (readFileSync(full, 'utf8').includes('schemaVersion')) return full
    }
  }
  return null
}

function htmlForPath(pathname: string): string {
  if (pathname === '/') return join(DIST, 'index.html')
  return join(DIST, `${pathname.replace(/^\//, '')}.html`)
}

/**
 * Undo a JS string literal's escaping so its value (the JSON text) can be
 * parsed - `\"` -> `"`, `\\` -> `\`, plus the common escapes.
 */
function decodeJsString(literalContent: string): string {
  let out = ''
  for (let i = 0; i < literalContent.length; i++) {
    const ch = literalContent[i]
    if (ch === '\\' && i + 1 < literalContent.length) {
      const next = literalContent[++i]
      if (next === 'n') out += '\n'
      else if (next === 'r') out += '\r'
      else if (next === 't') out += '\t'
      else out += next
      continue
    }
    out += ch
  }
  return out
}

/**
 * The virtual index module exports the envelope as a JSON string
 * (`export default JSON.stringify(JSON.stringify(envelope))`). Minifiers never
 * alter string literal contents, so the JSON text is recovered verbatim from
 * the chunk - no app runtime needed (the dynamic index chunk is linked to the
 * theme/framework chunks and cannot be `import()`ed in Node).
 */
function parseEnvelopeFromChunk(chunk: string): Envelope | null {
  const open = chunk.indexOf(`'{"schemaVersion"`)
  if (open === -1) return null
  const close = chunk.indexOf(`'`, open + 1)
  if (close === -1) return null
  try {
    const json = decodeJsString(chunk.slice(open + 1, close))
    return JSON.parse(json) as Envelope
  } catch {
    return null
  }
}

function findChunkReferencing(filename: string): string | null {
  const crawl = (dir: string): string | null => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = crawl(full)
        if (found) return found
      } else if (entry.name.endsWith('.js')) {
        const code = readFileSync(full, 'utf8')
        if (code.includes(filename)) return full
      }
    }
    return null
  }
  return crawl(join(DIST, 'assets'))
}

describe('US1: fixture site build', () => {
  let html: string[] = []
  let chunkPath: string | null = null
  let envelope: Envelope | null = null
  let rawChunk = ''

  beforeAll(async () => {
    // The fixture site is built once by tests/global-setup.ts.
    html = allHtml(DIST)
    chunkPath = findIndexChunkPath()
    if (chunkPath) {
      rawChunk = readFileSync(chunkPath, 'utf8')
      envelope = parseEnvelopeFromChunk(rawChunk)
    }
  })

  it('builds the fixture site', () => {
    expect(html.length).toBeGreaterThan(0)
  })

  it('renders the search button in the nav (alias worked)', () => {
    const index = readDist('index.html')
    // SSR output: our Search.vue trigger carries the theme's own class plus a
    // stable marker, so the alias firing is visible in the pre-rendered HTML.
    expect(index).toMatch(/VPNavBarSearch|idn-search|Cari/i)
  })

  it('US2: the index chunk is lazy (not preloaded on the initial page)', () => {
    expect(chunkPath).not.toBeNull()
    const filename = chunkPath!.split(/[\\/]/).pop()!
    const index = readDist('index.html')
    // Not in the document, so it is neither modulepreloaded nor statically linked (FR-004).
    expect(index).not.toContain(filename)
    // Referenced only through a *dynamic* import from another initial chunk.
    const referencer = findChunkReferencing(filename)
    expect(referencer, 'no chunk dynamically references the index chunk').not.toBeNull()
    const code = readFileSync(referencer!, 'utf8')
    const dynamic = new RegExp(`import\\(\\s*["'\`][^"'\`]*${filename.split('.')[0]}`)
    expect(dynamic.test(code), 'index chunk must be pulled in via import(), not static link').toBe(true)
  })

  it('emits a lazily-loadable index chunk with an envelope', () => {
    expect(chunkPath, 'no index chunk with schemaVersion found in assets').not.toBeNull()
    expect(envelope).not.toBeNull()
    expect(envelope!.schemaVersion).toBe(1)
    expect(envelope!.language).toBe('id')
    expect(typeof envelope!.index).toBe('string')
    expect(envelope!.index.length).toBeGreaterThan(0)
    expect(Object.keys(envelope!.sections).length).toBeGreaterThan(0)
  })

  it('excludes the search:false page from the index', () => {
    expect(envelope).not.toBeNull()
    expect(rawChunk).not.toContain('zzzunikinijadideks')
    expect(JSON.stringify(envelope!.sections)).not.toContain('zzzunikinijadideks')
    expect(Object.keys(envelope!.sections).some((id) => id.startsWith('/dilarang'))).toBe(false)
    expect(existsSync(join(DIST, 'dilarang.html'))).toBe(true)
  })

  it('anchor deep links resolve to real built headings', () => {
    expect(envelope).not.toBeNull()
    const ids = Object.keys(envelope!.sections)
    expect(ids.length).toBeGreaterThan(0)

    for (const id of ids) {
      const [path = '', anchor] = id.split('#')
      const file = htmlForPath(path)
      expect(existsSync(file), `missing built page for ${id}`).toBe(true)
      if (anchor) {
        const page = readFileSync(file, 'utf8')
        expect(
          page.includes(`id="${anchor}"`) || page.includes(`name="${anchor}"`),
          `anchor #${anchor} not found in ${path}`,
        ).toBe(true)
      }
    }
  })

  it('indexes include-directive content on the including page (R2 gap)', () => {
    expect(envelope).not.toBeNull()
    const extra = readFileSync(join(ROOT, 'playground', 'partials', 'extra.md'), 'utf8')
    const probe = extra
      .replace(/^---[\s\S]*?---/, '')
      .split(/\s+/)
      .find((word) => word.length > 8)
    expect(probe, 'fixture partial has no usable probe word').toBeTruthy()

    // Reconstruct doc id -> stored fields from the serialized MiniSearch index.
    const parsed = JSON.parse(envelope!.index) as {
      documentIds: Record<string, string>
      storedFields: Record<string, { title: string; text: string }>
    }
    const parentTexts = Object.entries(parsed.documentIds)
      .filter(([, id]) => id.startsWith('/pemerintahan'))
      .map(([key]) => {
        const stored = parsed.storedFields[key]
        return `${stored?.title ?? ''} ${stored?.text ?? ''}`
      })
    expect(parentTexts.length).toBeGreaterThan(0)
    expect(
      parentTexts.some((text) => text.includes(probe!)),
      `include content "${probe}" not found in /pemerintahan sections`,
    ).toBe(true)
  })
})
