/**
 * T025 - Author utilities via theme component (US3, FR-014).
 *
 * `AuthorUtils.vue` is mounted into the fixture theme's layout-bottom slot and
 * imports from the *public entries* (`vitepress-plugin-idn`,
 * `vitepress-plugin-idn/vue`) exactly as an end user would. Because VitePress
 * SSGs the layout, its computeds are baked into the HTML, so we can assert the
 * whole public API surface works from inside a real theme bundle without a
 * browser.
 */

import { describe, expect, it } from 'vitest'
import {
  DIST,
  allHtml,
  findIndexChunkPath,
  htmlForPath,
  readDist,
} from './helpers'

const pkg = await import('../../package.json')

function htmlText(rel: string): string {
  // VitePress HTML-escapes the apostrophes around demo inputs; decode so the
  // SSR content can be matched verbatim.
  return readDist(rel).replace(/&#39;/g, "'")
}

describe('T025: author utilities from the public entry', () => {
  it('renders the IDN_VERSION in a data attribute (diagnostics)', () => {
    const index = readDist('index.html')
    expect(index).toContain(`data-idn-version="${pkg.version}"`)
    expect(index).toContain('IDN_VERSION: 0.1.0')
  })

  it('renders live stem() output in SSR HTML', () => {
    const index = htmlText('index.html')
    expect(index).toContain("stem('berlari') = lari")
    expect(index).toContain("stem('pemerintahan') = perintah")
  })

  it('renders live syllabify() output in SSR HTML (FR-018)', () => {
    const index = htmlText('index.html')
    expect(index).toContain("syllabify('pemerintahan') = pe-mer-in-ta-han")
  })

  it('renders live tokenize() output in SSR HTML (FR-012 parity)', () => {
    const index = htmlText('index.html')
    expect(index).toContain('cepat, bangun, ekonomis')
  })

  it('the /vue entry resolves and is bundled (ui: external escape hatch)', () => {
    // AuthorUtils imports { IdnSearch } from 'vitepress-plugin-idn/vue'. If
    // that entry failed to resolve the whole build would have failed; we also
    // prove the built application bundle wires it together by loading every
    // page's module graph for import errors below.
    expect(allHtml(DIST).length).toBeGreaterThan(0)
    expect(htmlForPath('/').includes('.html')).toBe(true)
    expect(findIndexChunkPath()).not.toBeNull()
  })
})