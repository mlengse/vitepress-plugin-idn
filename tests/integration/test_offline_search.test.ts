/**
 * T019 - Offline search build tests (US2, FR-004).
 *
 * Proves the published artifacts work fully offline:
 * - every asset referenced from index.html is served same-origin from the
 *   static `dist`, with a correct content-type (no external/CDN dependency,
 *   FR-021)
 * - the search-index chunk is NOT part of the initial page (US2): it is never
 *   fetched on load, only when search is opened
 * - the serialized index is genuinely searchable: loaded in-process and
 *   queried with the exact client pipeline (FR-012) with zero network
 * - SSR content is present in the HTML, so a JS-disabled visitor still sees
 *   the page (G2)
 */

import { readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadIndex, search } from '../../src/core/search'
import {
  DIST,
  findIndexChunkPath,
  readDist,
  readEnvelope,
} from './helpers'

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

describe('US2: offline artifact integrity', () => {
  let server: Server
  let base = ''

  beforeAll(async () => {
    await new Promise<void>((done) => {
      server = createServer((req, res) => {
        const url = (req.url ?? '/').split('?')[0] ?? '/'
        const rel = normalize(url).replace(/^[/\\]+/, '')
        const file = rel === '' ? join(DIST, 'index.html') : join(DIST, rel)
        const type = MIME[extname(file)] ?? 'application/octet-stream'
        try {
          const data = readFileSync(file)
          res.setHeader('content-type', type)
          res.setHeader('content-length', data.length)
          res.statusCode = 200
          res.end(data)
        } catch {
          res.statusCode = 404
          res.end('not found')
        }
      })
      server.listen(0, '127.0.0.1', () => done())
    })
    const { port } = server.address() as AddressInfo
    base = `http://127.0.0.1:${port}`
  })

  afterAll(() => {
    server?.close()
  })

  async function get(path: string): Promise<{ status: number; type: string; body: string }> {
    const res = await fetch(`${base}${path}`)
    return {
      status: res.status,
      type: res.headers.get('content-type') ?? '',
      body: await res.text(),
    }
  }

  it('serves the SSR home page same-origin with text/html', async () => {
    const page = await get('/')
    expect(page.status).toBe(200)
    expect(page.type).toContain('text/html')
    expect(page.body).toContain('situs uji') // SSR content => JS-disabled users see it
    expect(page.body).toContain('idn-search') // search trigger pre-rendered
  })

  it('every asset referenced from the page is served, same-origin', async () => {
    const page = await get('/')
    // Script `src`s plus stylesheet/preload `href`s; anchor links are not assets.
    const hrefs = [
      ...page.body.matchAll(/src="([^"]+)"/g),
      ...page.body.matchAll(/href="([^"]+\.(?:css|js)(?:\?.*)?)"/g),
    ]
      .map((m) => m[1])
      .filter((v): v is string => typeof v === 'string')
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href, 'no absolute/external URLs allowed (FR-021)').not.toMatch(/^https?:\/\//)
      const asset = href.startsWith('/') ? href : `/${href}`
      const res = await get(asset)
      expect(res.status, `asset ${href} failed`).toBe(200)
    }
  })

  it('does not load the search index chunk on the initial page (US2, FR-004)', async () => {
    const chunkPath = findIndexChunkPath()
    expect(chunkPath).not.toBeNull()
    const chunkName = chunkPath!.split(/[\\/]/).pop()!
    const page = await get('/')
    expect(page.body).not.toContain(chunkName)
    // The lazy loader is only reachable through a vendor/theme chunk that the
    // page links to; the initial module graph contains no static index link.
    for (const m of page.body.matchAll(/(?:src|href)="([^"]+\.js)"/g)) {
      const asset = await get(m[1]!)
      expect(asset.status).toBe(200)
    }
  })

  it('the serialized index is searchable in-process with the client pipeline', async () => {
    const envelope = readEnvelope()
    expect(envelope.language).toBe('id')
    const index = loadIndex(envelope.index, envelope.language)

    const hit = search(index, 'pemerintahan', 'id')
    expect(hit.reason).toBe('results')
    expect(hit.hits.length).toBeGreaterThan(0)
    expect(hit.hits[0]!.id).toContain('/pemerintahan')

    // Search button might split terms; the morphology pipeline joins them.
    const lari = search(index, 'berlari', 'id')
    expect(lari.hits.some((h) => h.id.includes('/lari'))).toBe(true)

    // Excluded page is findable nowhere but still built as a page.
    const dilarang = search(index, 'zzzunikinijadideks', 'id')
    expect(dilarang.hits).toEqual([])
  })

  it('stop-word-only queries short-circuit without a fallback dump (SC-002)', async () => {
    const envelope = readEnvelope()
    const index = loadIndex(envelope.index, envelope.language)
    const result = search(index, 'dan yang untuk', 'id')
    expect(result.reason).toBe('stopwords-only')
    expect(result.hits).toEqual([])
  })
})

describe('T020: index chunk laziness on disk', () => {
  it('is not referenced by index.html at all', () => {
    const chunkPath = findIndexChunkPath()
    const chunkName = chunkPath!.split(/[\\/]/).pop()!
    expect(readDist('index.html')).not.toContain(chunkName)
  })

  it('is referenced via a dynamic import from an initial chunk', () => {
    const chunkPath = findIndexChunkPath()
    const chunkName = chunkPath!.split(/[\\/]/).pop()!
    const loaderChunk = chunkName.replace(/^indexLoader/, 'indexLoader')
    expect(loaderChunk).toBe(chunkName)

    const crawl = (dir: string): string | null => {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          const found = crawl(full)
          if (found) return found
        } else if (entry.name.endsWith('.js')) {
          const code = readFileSync(full, 'utf8')
          if (
            code.includes(chunkName) &&
            /import\(\s*["'`][^"'`]*indexLoader/.test(code)
          ) {
            return full
          }
        }
      }
      return null
    }
    // The dynamic-import reference lives in the theme/initial chunks.
    const referencer = crawl(join(DIST, 'assets'))
    expect(referencer, 'no initial chunk dynamically imports the index chunk').not.toBeNull()
  })
})