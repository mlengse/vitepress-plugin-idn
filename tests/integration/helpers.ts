/**
 * Shared helpers for integration specs - everything needed to inspect the
 * built fixture site and search it in-process (no browser required).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { IdnLanguage } from '../../src/core/types'

export const ROOT = resolve(__dirname, '..', '..')
export const DIST = join(ROOT, 'playground', '.vitepress', 'dist')

export interface Envelope {
  schemaVersion: number
  language: IdnLanguage
  index: string
  sections: Record<string, { title: string; titles: string[]; path: string }>
}

export function readDist(rel: string): string {
  return readFileSync(join(DIST, rel), 'utf8')
}

export function allHtml(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...allHtml(full))
    else if (entry.name.endsWith('.html')) out.push(full)
  }
  return out
}

export function findIndexChunkPath(dir: string = join(DIST, 'assets')): string | null {
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

/** Recover the index chunk's sharded paths for same-origin probing. */
export function findChunks(dir: string = join(DIST, 'assets')): string[] {
  const out: string[] = []
  const crawl = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) crawl(full)
      else if (entry.name.endsWith('.js')) out.push(full)
    }
  }
  crawl(dir)
  return out
}

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

export function parseEnvelopeFromChunk(chunk: string): Envelope | null {
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

export function readEnvelope(): Envelope {
  const chunkPath = findIndexChunkPath()
  if (!chunkPath) throw new Error('no index chunk found - run the global build first')
  const envelope = parseEnvelopeFromChunk(readFileSync(chunkPath, 'utf8'))
  if (!envelope) throw new Error('could not parse the index envelope from the chunk')
  return envelope
}

export function htmlForPath(pathname: string): string {
  if (pathname === '/') return join(DIST, 'index.html')
  return join(DIST, `${pathname.replace(/^\//, '')}.html`)
}

export function pathExists(rel: string): boolean {
  return existsSync(join(DIST, rel))
}