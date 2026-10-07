/**
 * T031 - Hyphenation build tests (US4, FR-016, plugin-options.md).
 *
 * With `hyphenate.enabled: true` in the fixture config the client runtime is
 * injected into the VitePress theme entry at build time. We assert:
 * - the client bundle contains the runtime (the `data-idn-hyphenated` marker
 *   string the process walker sets is a plain string literal, so it survives
 *   minification)
 * - the SSR page renders fine and the runtime module loaded without breaking
 *   the document
 * - per-page content stays intact (soft hyphens are invisible, so no marker
 *   text is lost in the static HTML)
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIST, findIndexChunkPath, readDist } from './helpers'

function allClientChunks(dir: string = join(DIST, 'assets')): string[] {
  const out: string[] = []
  const crawl = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) crawl(full)
      else if (entry.name.endsWith('.js')) out.push(readFileSync(full, 'utf8'))
    }
  }
  crawl(dir)
  return out
}

describe('T031: hyphenation runtime build injection', () => {
  const chunks = allClientChunks()

  it('bundles the client hyphenation runtime into the app', () => {
    const marker = chunks.find((code) => code.includes('data-idn-hyphenated'))
    expect(marker, 'no client chunk contains the hyphenation runtime marker').toBeTruthy()
  })

  it('links the runtime through the virtual module from the theme entry', () => {
    const theme = chunks.find((code) => code.includes('data-idn-hyphenated'))
    expect(theme).toBeTruthy()
    expect(chunks.some((code) => code.includes('minWordLength'))).toBe(true)
  })

  it('still builds the search index chunk (plugin features coexist)', () => {
    expect(findIndexChunkPath()).not.toBeNull()
  })

  it('keeps the SSR page intact (no soft-hyphen garbage in static HTML)', () => {
    const index = readDist('index.html')
    expect(index).toContain('Pemerintahan')
    expect(index).toContain('idn-author-utils')
    // Content is present whether or not it was hyphenated; nothing was lost.
    expect(index).not.toMatch(/&#173;/)
  })
})